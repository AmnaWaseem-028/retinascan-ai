from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SECRET_KEY")
supabase = create_client(supabase_url, supabase_key)

groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

model = timm.create_model('efficientnet_b0', pretrained=False, num_classes=5)
model.load_state_dict(torch.load('model/best_model.pth', map_location=device))
model.to(device)
model.eval()

target_layer = [model.conv_head]

transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

grade_labels = {0: 'No DR', 1: 'Mild', 2: 'Moderate', 3: 'Severe', 4: 'Proliferative'}


class ScreeningRequest(BaseModel):
    screening_id: str
    image_path: str


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


def generate_report(grade, grade_label, confidence):
    prompt = f"""You are a medical assistant writing a plain-language diabetic retinopathy screening report for a patient.

Grade: {grade} ({grade_label})
Confidence: {round(confidence * 100)}%

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


@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": True}


@app.post("/process-screening")
async def process_screening(request: ScreeningRequest):
    file_bytes = supabase.storage.from_("fundus-images").download(request.image_path)
    pil_image = Image.open(io.BytesIO(file_bytes)).convert('RGB')
    img_rgb = np.array(pil_image)

    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    issues = check_quality(gray)
    if issues:
        supabase.table("screenings").update({
            "report_text": "Quality check failed: " + ", ".join(issues)
        }).eq("id", request.screening_id).execute()
        raise HTTPException(status_code=400, detail={"quality_issues": issues})

    processed = ben_graham_preprocess(img_rgb)
    processed_norm = processed.astype(np.float32) / 255.0
    input_tensor = transform(processed).unsqueeze(0).to(device)

    with torch.no_grad():
        outputs = model(input_tensor)
        probs = torch.softmax(outputs, dim=1)
        confidence, predicted = torch.max(probs, 1)
        grade = predicted.item()
        confidence_score = confidence.item()

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

    report_text = generate_report(grade, grade_labels[grade], confidence_score)
    print("REPORT TEXT:", report_text)

    supabase.table("screenings").update({
        "grade": grade,
        "confidence": round(confidence_score, 4),
        "heatmap_url": heatmap_url,
        "report_text": report_text
    }).eq("id", request.screening_id).execute()

    return {
        "grade": grade,
        "grade_label": grade_labels[grade],
        "confidence": round(confidence_score, 4),
        "heatmap_url": heatmap_url,
        "report_text": report_text
    }