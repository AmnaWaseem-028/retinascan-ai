from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import torch
import timm
import cv2
import numpy as np
from PIL import Image
import io
import os
from dotenv import load_dotenv
from supabase import create_client
from groq import Groq
import torchvision.transforms as transforms
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget

# Feature 2: Uncertainty estimation (TTA + entropy)
from uncertainty import run_tta_uncertainty
from fundus_check import check_fundus

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, ".env")
load_dotenv(dotenv_path=env_path, override=True)

app = FastAPI(title="OcuTriage API", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SECRET_KEY")

if not supabase_key or supabase_key == "your-secret-key":
    print("⚠️  [OcuTriage] WARNING: SUPABASE_SECRET_KEY is not configured or using placeholder value.")
else:
    print("✅ [OcuTriage] Supabase credentials successfully loaded.")

supabase = create_client(supabase_url, supabase_key)

groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model_path = os.path.join(BASE_DIR, 'model', 'best_model.pth')
model = timm.create_model('efficientnet_b0', pretrained=False, num_classes=5)
model.load_state_dict(torch.load(model_path, map_location=device))
model.to(device)
model.eval()

target_layer = [model.conv_head]

transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

grade_labels = {0: 'No DR', 1: 'Mild', 2: 'Moderate', 3: 'Severe', 4: 'Proliferative'}

# ==============================================================================
# Feature 1: Clinical Triage Matrix & Referral Rules
# ==============================================================================
TRIAGE_MATRIX = {
    4: {
        "urgency_tier": "EMERGENT",
        "urgency_level": 1,
        "referral_timeframe": "Immediate (24–48 hours)",
        "referral_action": "Immediate vitreoretinal specialist referral. High risk of severe irreversible vision loss.",
    },
    3: {
        "urgency_tier": "URGENT",
        "urgency_level": 2,
        "referral_timeframe": "2–4 weeks",
        "referral_action": "Priority ophthalmology referral for comprehensive dilated exam and potential anti-VEGF/laser therapy.",
    },
    2: {
        "urgency_tier": "SEMI_URGENT",
        "urgency_level": 3,
        "referral_timeframe": "2–3 months",
        "referral_action": "Comprehensive dilated eye examination at specialized eye clinic.",
    },
    1: {
        "urgency_tier": "ROUTINE",
        "urgency_level": 4,
        "referral_timeframe": "6–12 months",
        "referral_action": "Follow-up retinal rescreening in 6–12 months with optimized systemic glycemic and blood pressure control.",
    },
    0: {
        "urgency_tier": "ANNUAL_MONITORING",
        "urgency_level": 5,
        "referral_timeframe": "12 months",
        "referral_action": "Routine annual diabetic retinal screening. Maintain optimal metabolic control.",
    },
}

QUALITY_RECALL_TRIAGE = {
    "urgency_tier": "QUALITY_RECALL",
    "urgency_level": 1,
    "referral_timeframe": "Immediate recapture",
    "referral_action": "Recapture fundus photograph immediately. Current image ungradable due to image quality artifacts.",
}

def compute_triage(grade: Optional[int] = None, is_quality_fail: bool = False) -> dict:
    """
    Translates AI DR grade or quality rejection into clinical triage parameters.
    """
    if is_quality_fail:
        triage_info = dict(QUALITY_RECALL_TRIAGE)
    elif grade is not None and grade in TRIAGE_MATRIX:
        triage_info = dict(TRIAGE_MATRIX[grade])
    else:
        triage_info = {
            "urgency_tier": "ROUTINE",
            "urgency_level": 4,
            "referral_timeframe": "6–12 months",
            "referral_action": "Follow-up clinical assessment advised.",
        }
    triage_info["triage_status"] = "pending_triage"
    return triage_info

class ScreeningRequest(BaseModel):
    screening_id: str
    image_path: str

class TriageUpdateRequest(BaseModel):
    triage_status: str  # 'pending_triage' | 'in_review' | 'referred' | 'completed'
    triage_notes: Optional[str] = None
    triaged_by: Optional[str] = None

def crop_image_from_gray(img, tol=7):
    gray_img = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    mask = gray_img > tol
    check_shape = img[:, :, 0][np.ix_(mask.any(1), mask.any(0))].shape[0]
    if check_shape == 0:
        return img
    img1 = img[:, :, 0][np.ix_(mask.any(1), mask.any(0))]
    img2 = img[:, :, 1][np.ix_(mask.any(1), mask.any(0))]
    img3 = img[:, :, 2][np.ix_(mask.any(1), mask.any(0))]
    return np.stack([img1, img2, img3], axis=-1)

def ben_graham_preprocess(img_rgb, output_size=224, sigma_x=10):
    img = crop_image_from_gray(img_rgb)
    img = cv2.resize(img, (output_size, output_size))
    img = cv2.addWeighted(img, 4, cv2.GaussianBlur(img, (0, 0), sigma_x), -4, 128)
    return img

def check_quality(gray_img):
    laplacian_var = cv2.Laplacian(gray_img, cv2.CV_64F).var()
    mean_brightness = gray_img.mean()
    issues = []
    if laplacian_var < 100:
        issues.append("Image is too blurry")
    if mean_brightness < 40:
        issues.append("Image is too dark")
    if mean_brightness > 220:
        issues.append("Image is too bright")
    return issues

def generate_report(grade, grade_label, confidence, needs_review=False):
    review_instruction = ""
    if needs_review:
        review_instruction = (
            "Also mention gently that this screening has been marked for a "
            "specialist to double-check, to confirm the finer details."
        )
    prompt = f"""You are a medical assistant writing a plain-language diabetic retinopathy screening report for a patient.
Grade: {grade} ({grade_label})
Confidence: {round(confidence * 100)}%
{review_instruction}
Write a short, clear, reassuring but honest 3-4 sentence report explaining what this grade means and whether the patient should see a doctor. Do not use medical jargon. Do not give a diagnosis, only explain the screening result and recommend next steps."""
    try:
        response = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=400,
        )
        return response.choices[0].message.content
    except Exception as e:
        print("GROQ ERROR:", e)
        fallback_reports = {
            0: "No signs of diabetic retinopathy were detected in this screening. Continue with regular annual eye checkups.",
            1: "Mild signs of diabetic retinopathy were detected. This is an early stage. A follow-up with an eye specialist within the next few months is recommended.",
            2: "Moderate diabetic retinopathy was detected. Please schedule an appointment with an eye specialist soon for further evaluation.",
            3: "Severe diabetic retinopathy was detected. Please see an eye specialist as soon as possible for further evaluation and treatment.",
            4: "Proliferative diabetic retinopathy was detected, which is the most advanced stage. Please seek urgent care from an eye specialist.",
        }
        return fallback_reports.get(grade, "Please consult an eye specialist to review your screening result.")

@app.get("/")
def home():
    return {"status": 200, "msg": "OcuTriage Clinical Backend is running on port 8000"}

@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": True}

@app.post("/process-screening")
async def process_screening(request: ScreeningRequest):
    try:
        file_bytes = supabase.storage.from_("fundus-images").download(request.image_path)
    except Exception as e:
        print(f"❌ Storage Download Error: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch image from storage ({request.image_path}): {str(e)}"
        )

    pil_image = Image.open(io.BytesIO(file_bytes)).convert('RGB')
    img_rgb = np.array(pil_image)

    # Feature 5: kya ye retina (fundus) ki photo hai? Quality check se pehle, RAW image par.
    fundus = check_fundus(img_rgb)
    if not fundus["is_fundus"]:
        print("FUNDUS CHECK FAILED:", fundus["reasons"], fundus["features"])
        triage = compute_triage(is_quality_fail=True)
        supabase.table("screenings").update({
            "report_text": "Not a retinal photograph. " + fundus["message"],
            "urgency_tier": triage["urgency_tier"],
            "urgency_level": triage["urgency_level"],
            "referral_timeframe": triage["referral_timeframe"],
            "referral_action": triage["referral_action"],
            "triage_status": triage["triage_status"],
        }).eq("id", request.screening_id).execute()
        raise HTTPException(
            status_code=400,
            detail={"quality_issues": [fundus["message"].rstrip(".")], "triage": triage, "not_fundus": True},
        )

    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    issues = check_quality(gray)

    if issues:
        triage = compute_triage(is_quality_fail=True)
        supabase.table("screenings").update({
            "report_text": "Quality check failed: " + ", ".join(issues),
            "urgency_tier": triage["urgency_tier"],
            "urgency_level": triage["urgency_level"],
            "referral_timeframe": triage["referral_timeframe"],
            "referral_action": triage["referral_action"],
            "triage_status": triage["triage_status"],
        }).eq("id", request.screening_id).execute()
        raise HTTPException(status_code=400, detail={"quality_issues": issues, "triage": triage})

    processed = ben_graham_preprocess(img_rgb)
    processed_norm = processed.astype(np.float32) / 255.0
    input_tensor = transform(processed).unsqueeze(0).to(device)

    # Feature 2: 8-pass Test-Time Augmentation + entropy uncertainty
    tta = run_tta_uncertainty(model, transform, device, processed)
    grade = tta["grade"]
    confidence_score = tta["confidence"]
    uncertainty_score = tta["uncertainty_score"]
    uncertainty_tier = tta["uncertainty_tier"]
    needs_review = tta["needs_review"]
    review_reason = tta["review_reason"]

    cam = GradCAM(model=model, target_layers=target_layer)
    targets = [ClassifierOutputTarget(grade)]
    grayscale_cam = cam(input_tensor=input_tensor, targets=targets)[0, :]
    heatmap_vis = show_cam_on_image(processed_norm, grayscale_cam, use_rgb=True)

    heatmap_pil = Image.fromarray(heatmap_vis)
    buffer = io.BytesIO()
    heatmap_pil.save(buffer, format="PNG")
    heatmap_bytes = buffer.getvalue()

    heatmap_path = f"{request.screening_id}.png"
    supabase.storage.from_("heatmaps").upload(
        heatmap_path, heatmap_bytes,
        {"content-type": "image/png", "x-upsert": "true"}
    )
    heatmap_url = supabase.storage.from_("heatmaps").get_public_url(heatmap_path)

    report_text = generate_report(grade, grade_labels[grade], confidence_score, needs_review=needs_review)
    print("REPORT TEXT:", report_text)
    print(f"UNCERTAINTY: score={uncertainty_score} tier={uncertainty_tier} needs_review={needs_review}")

    # Compute Feature 1 Triage parameters
    triage = compute_triage(grade=grade)

    supabase.table("screenings").update({
        "grade": grade,
        "confidence": round(confidence_score, 4),
        "heatmap_url": heatmap_url,
        "report_text": report_text,
        "urgency_tier": triage["urgency_tier"],
        "urgency_level": triage["urgency_level"],
        "referral_timeframe": triage["referral_timeframe"],
        "referral_action": triage["referral_action"],
        "triage_status": triage["triage_status"],
        "uncertainty_score": uncertainty_score,
        "uncertainty_tier": uncertainty_tier,
        "needs_review": needs_review,
        "review_reason": review_reason,
    }).eq("id", request.screening_id).execute()

    return {
        "grade": grade,
        "grade_label": grade_labels[grade],
        "confidence": round(confidence_score, 4),
        "heatmap_url": heatmap_url,
        "report_text": report_text,
        "urgency_tier": triage["urgency_tier"],
        "urgency_level": triage["urgency_level"],
        "referral_timeframe": triage["referral_timeframe"],
        "referral_action": triage["referral_action"],
        "triage_status": triage["triage_status"],
        "uncertainty_score": uncertainty_score,
        "uncertainty_tier": uncertainty_tier,
        "needs_review": needs_review,
        "review_reason": review_reason,
    }

# ==============================================================================
# Feature 1: Clinician Triage Status Update API
# ==============================================================================
@app.patch("/api/screenings/{screening_id}/triage")
async def update_triage_status(screening_id: str, request: TriageUpdateRequest):
    valid_statuses = {"pending_triage", "in_review", "referred", "completed"}
    if request.triage_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid triage status '{request.triage_status}'. Must be one of: {', '.join(sorted(valid_statuses))}"
        )

    update_payload = {
        "triage_status": request.triage_status,
        "triaged_at": datetime.now(timezone.utc).isoformat(),
    }
    if request.triage_notes is not None:
        update_payload["triage_notes"] = request.triage_notes
    if request.triaged_by is not None:
        update_payload["triaged_by"] = request.triaged_by

    try:
        res = supabase.table("screenings").update(update_payload).eq("id", screening_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Screening record not found")
        return {
            "status": "success",
            "message": "Triage status successfully updated",
            "screening": res.data[0]
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error updating triage status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/screenings/triage-worklist")
async def get_triage_worklist(
    status: Optional[str] = None,
    urgency_tier: Optional[str] = None,
    urgency_level: Optional[int] = None,
    needs_review: Optional[bool] = None,
    uncertainty_tier: Optional[str] = None,
    limit: int = 100
):
    try:
        query = supabase.table("screenings").select("*")
        if status:
            query = query.eq("triage_status", status)
        if urgency_tier:
            query = query.eq("urgency_tier", urgency_tier)
        if urgency_level:
            query = query.eq("urgency_level", urgency_level)
        if needs_review is not None:
            query = query.eq("needs_review", needs_review)
        if uncertainty_tier:
            query = query.eq("uncertainty_tier", uncertainty_tier)

        res = query.order("urgency_level", desc=False).order("created_at", desc=True).limit(limit).execute()
        return {"count": len(res.data) if res.data else 0, "screenings": res.data or []}
    except Exception as e:
        print(f"❌ Error fetching triage worklist: {e}")
        raise HTTPException(status_code=500, detail=str(e))