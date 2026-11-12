import cv2
import numpy as np
# Pixel jis gray value se neeche ho use "kaala" maana jata hai (fundus photo ka border kaala hota hai)
DARK_THRESH = 15
# PROVISIONAL values. fundus_eval.py ke result se confirm ya replace karna hai.
T = {
    "min_corner_dark": 0.60,  # chaaron kono ke pixels mein se kam se kam itne kaale hon
    "min_area_frac": 0.25,    # retina wala hissa poori image ka kam se kam itna ho
    "min_fill": 0.75,         # retina ka shape apne dibbe (bounding box) ka itna hissa bhare (gol shape ~0.78)
    "max_fill": 0.97,         # 1.0 ke qareeb matlab poora rectangle hai, gol nahi
    "min_r_ratio": 0.30,      # red ka hissa (R / (R+G+B)), retina laal-narangi hoti hai
    "max_b_ratio": 0.36,      # blue ka hissa, retina mein blue bahut kam hota hai
    "min_detail": 1.5,        # barik detail (nasen), sapaat rang wali image mein ye ~0 hota hai
}
MESSAGES = {
    "unreadable": "The image could not be read.",
    "no_dark_border": "No dark border around the picture was found. This does not look like a retinal photograph.",
    "bad_shape": "The visible area is not the round shape of a retinal photograph.",
    "bad_color": "The colours do not look like a retina (red-orange tones are expected).",
    "no_detail": "No fine retinal detail (such as blood vessels) was found.",
}
def _largest_solid_mask(gray_blur):
    """Sabse bada 'roshan' hissa, andar ke suraakh bhar ke."""
    mask = (gray_blur > DARK_THRESH).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if n <= 1:
        return None
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    comp = (labels == largest).astype(np.uint8)
    contours, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    solid = np.zeros_like(comp)
    cv2.drawContours(solid, contours, -1, 1, thickness=-1)
    return solid
def fundus_features(img_rgb):
    """img_rgb: RAW image (uint8, H x W x 3), Ben Graham se PEHLE wali."""
    h, w = img_rgb.shape[:2]
    scale = 256.0 / max(h, w)
    small = cv2.resize(
        img_rgb,
        (max(8, int(round(w * scale))), max(8, int(round(h * scale)))),
        interpolation=cv2.INTER_AREA,
    )
    gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    gray_blur = cv2.GaussianBlur(gray, (5, 5), 0)
    sh, sw = gray.shape
    c = max(2, int(0.12 * min(sh, sw)))
    corners = [gray_blur[:c, :c], gray_blur[:c, -c:], gray_blur[-c:, :c], gray_blur[-c:, -c:]]
    corner_dark = float(np.mean([(cc <= DARK_THRESH).mean() for cc in corners]))
    feats = {"corner_dark": corner_dark, "area_frac": 0.0, "fill": 0.0,
             "r_ratio": 0.0, "b_ratio": 0.0, "detail": 0.0}
    solid = _largest_solid_mask(gray_blur)
    if solid is None or solid.sum() == 0:
        return feats
    area = float(solid.sum())
    _, _, bw, bh = cv2.boundingRect(solid)
    feats["area_frac"] = area / float(sh * sw)
    feats["fill"] = area / float(max(1, bw * bh))
    inside = solid.astype(bool)
    r, g, b = small[inside].astype(np.float32).mean(axis=0)
    total = r + g + b + 1e-6
    feats["r_ratio"] = float(r / total)
    feats["b_ratio"] = float(b / total)
    # Kinare se door ka hissa lo, warna kinare ka farq 'detail' lagne lagta hai
    eroded = cv2.erode(solid, np.ones((31, 31), np.uint8)).astype(bool)
    if eroded.sum() > 50:
        green = small[:, :, 1].astype(np.float32)
        high_pass = green - cv2.GaussianBlur(green, (0, 0), 5)
        feats["detail"] = float(high_pass[eroded].std())
    return {k: float(v) for k, v in feats.items()}
def check_fundus(img_rgb):
    """Return: {"is_fundus": bool, "reason": str|None, "reasons": [...], "message": str|None, "features": {...}}"""
    if img_rgb is None or img_rgb.ndim != 3 or min(img_rgb.shape[:2]) < 32:
        return {"is_fundus": False, "reason": "unreadable", "reasons": ["unreadable"],
                "message": MESSAGES["unreadable"], "features": {}}
    f = fundus_features(img_rgb)
    reasons = []
    if f["corner_dark"] < T["min_corner_dark"]:
        reasons.append("no_dark_border")
    if f["area_frac"] < T["min_area_frac"] or not (T["min_fill"] <= f["fill"] <= T["max_fill"]):
        reasons.append("bad_shape")
    if f["r_ratio"] < T["min_r_ratio"] or f["b_ratio"] > T["max_b_ratio"]:
        reasons.append("bad_color")
    if f["detail"] < T["min_detail"]:
        reasons.append("no_detail")
    ok = len(reasons) == 0
    return {
        "is_fundus": ok,
        "reason": None if ok else reasons[0],
        "reasons": reasons,
        "message": None if ok else MESSAGES[reasons[0]],
        "features": f,
    }
