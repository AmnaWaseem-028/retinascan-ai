import math
import cv2
import torch

NUM_CLASSES = 5
MAX_ENTROPY = math.log(NUM_CLASSES)

# PROVISIONAL values. Validation set se chunne ke baad inhe replace karna hai.
THRESHOLD_LOW = 0.35   # is se neeche = LOW
THRESHOLD_HIGH = 0.60  # is se upar ya barabar = HIGH (specialist review flag)


def _rotate(img, angle):
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, 1.0)
    return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_REFLECT_101)


def _views(img):
    hflip = cv2.flip(img, 1)
    return [
        img,                      # 1 original
        hflip,                    # 2 horizontal flip
        cv2.flip(img, 0),         # 3 vertical flip
        cv2.flip(img, -1),        # 4 dono flips
        _rotate(img, 10),         # 5 rotate +10
        _rotate(img, -10),        # 6 rotate -10
        _rotate(hflip, 10),       # 7 hflip + rotate +10
        _rotate(hflip, -10),      # 8 hflip + rotate -10
    ]


def tier_from_score(score):
    if score < THRESHOLD_LOW:
        return "LOW"
    if score < THRESHOLD_HIGH:
        return "MEDIUM"
    return "HIGH"


def run_tta_uncertainty(model, transform, device, processed_img):
    """processed_img: ben_graham_preprocess se aayi image (uint8, 224x224x3)."""
    batch = torch.stack([transform(v) for v in _views(processed_img)]).to(device)
    model.eval()
    with torch.no_grad():
        probs = torch.softmax(model(batch), dim=1)   # (8, 5)
        mean_probs = probs.mean(dim=0)               # (5,)

    conf, pred = torch.max(mean_probs, dim=0)
    entropy = -torch.sum(mean_probs * torch.log(mean_probs + 1e-7)).item()
    score = max(0.0, min(1.0, entropy / MAX_ENTROPY))

    tier = tier_from_score(score)
    needs_review = tier == "HIGH"
    reason = (
        f"High model uncertainty across augmentations (score {round(score, 2)})."
        if needs_review else None
    )

    return {
        "grade": int(pred.item()),
        "confidence": round(float(conf.item()), 4),
        "uncertainty_score": round(score, 4),
        "uncertainty_tier": tier,
        "needs_review": needs_review,
        "review_reason": reason,
    }