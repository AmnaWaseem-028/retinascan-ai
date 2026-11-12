import json
import os
import cv2
import numpy as np
from fundus_check import _largest_solid_mask
# Agar quality_thresholds.json maujood ho to usi ke numbers chalte hain (quality_calibrate.py banata hai).
QUALITY_DEFAULTS = {"min_blur": 8.0, "min_brightness": 30.0, "max_brightness": 230.0}
QUALITY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "quality_thresholds.json")
def load_quality_thresholds():
    q = dict(QUALITY_DEFAULTS)
    try:
        with open(QUALITY_FILE, "r", encoding="utf-8") as f:
            q.update({k: v for k, v in json.load(f).items() if k in QUALITY_DEFAULTS})
    except Exception:
        pass
    return q
def quality_features(img_rgb, size=512):
    """Sirf retina ke andar ka hissa, fixed size (512x512) par: blur score aur brightness.
    img_rgb: RAW image (uint8, H x W x 3)."""
    zero = {"blur": 0.0, "brightness": 0.0}
    h, w = img_rgb.shape[:2]
    scale = 256.0 / max(h, w)
    small = cv2.resize(
        img_rgb,
        (max(8, int(round(w * scale))), max(8, int(round(h * scale)))),
        interpolation=cv2.INTER_AREA,
    )
    gray_small = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_RGB2GRAY), (5, 5), 0)
    solid = _largest_solid_mask(gray_small)
    if solid is None or solid.sum() == 0:
        return zero
    # Retina ka dibba (bounding box) asli image ke size par le jao aur kaat lo
    x, y, bw, bh = cv2.boundingRect(solid)
    x0, y0 = int(x / scale), int(y / scale)
    x1 = min(w, int(np.ceil((x + bw) / scale)))
    y1 = min(h, int(np.ceil((y + bh) / scale)))
    crop = img_rgb[y0:y1, x0:x1]
    if crop.shape[0] < 8 or crop.shape[1] < 8:
        return zero
    mask_crop = cv2.resize(solid[y:y + bh, x:x + bw], (crop.shape[1], crop.shape[0]),
                           interpolation=cv2.INTER_NEAREST)
    # Dono ko ek hi size par lao, taake bade aur chhote photo ka farq na pade
    crop = cv2.resize(crop, (size, size), interpolation=cv2.INTER_AREA)
    mask = cv2.resize(mask_crop, (size, size), interpolation=cv2.INTER_NEAREST)
    mask = cv2.erode(mask, np.ones((31, 31), np.uint8)).astype(bool)  # kinara hata do
    if mask.sum() < 100:
        return zero
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    return {"blur": float(lap[mask].var()), "brightness": float(gray[mask].mean())}
def check_image_quality(img_rgb):
    """Return: list of issues (khali list = theek). Messages purane check_quality jaise hain."""
    q = load_quality_thresholds()
    f = quality_features(img_rgb)
    issues = []
    if f["blur"] < q["min_blur"]:
        issues.append("Image is too blurry")
    if f["brightness"] < q["min_brightness"]:
        issues.append("Image is too dark")
    if f["brightness"] > q["max_brightness"]:
        issues.append("Image is too bright")
    return issues
