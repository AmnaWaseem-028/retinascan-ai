import math
import cv2
import torch

NUM_CLASSES = 5
MAX_ENTROPY = math.log(NUM_CLASSES)

# Valid set (366 images) par choose_threshold.py se chune gaye.
THRESHOLD_LOW = 0.05   # is se neeche = LOW
THRESHOLD_HIGH = 0.20  # is se upar ya barabar = HIGH (specialist review flag)


def _views(img):
    """Sirf original aur horizontal flip.
    Rotation views per-view test mein accuracy ghata rahe the (0.811 se ~0.74),
    isliye hata diye gaye."""
    return [
        img,                  # 1 original
        cv2.flip(img, 1),     # 2 horizontal flip
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
        probs = torch.softmax(model(batch), dim=1)   # (2, 5)
        mean_probs = probs.mean(dim=0)               # (5,)

    conf, pred = torch.max(mean_probs, dim=0)
    entropy = -torch.sum(mean_probs * torch.log(mean_probs + 1e-7)).item()
    score = max(0.0, min(1.0, entropy / MAX_ENTROPY))

    tier = tier_from_score(score)
    needs_review = tier == "HIGH"
    reason = (
        f"High model uncertainty (score {round(score, 2)})."
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