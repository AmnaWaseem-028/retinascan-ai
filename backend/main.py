from fastapi import FastAPI, UploadFile, File, HTTPException
import torch
import timm
import cv2
import numpy as np
from PIL import Image
import io
import base64
import torchvision.transforms as transforms
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget

app = FastAPI()

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


@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": True}


@app.post("/grade")
async def grade_image(file: UploadFile = File(...)):
    contents = await file.read()
    pil_image = Image.open(io.BytesIO(contents)).convert('RGB')
    img_rgb = np.array(pil_image)

    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
    issues = check_quality(gray)
    if issues:
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
    heatmap_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    return {
        "grade": grade,
        "grade_label": grade_labels[grade],
        "confidence": round(confidence_score, 4),
        "heatmap_base64": heatmap_base64
    }