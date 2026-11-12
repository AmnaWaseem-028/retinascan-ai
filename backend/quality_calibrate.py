import argparse
import json
import os
import numpy as np
from PIL import Image
from image_quality import QUALITY_FILE, quality_features
ap = argparse.ArgumentParser()
ap.add_argument("--pos", default=r"D:\data\test_images\test_images", help="asli RAW fundus images ka folder")
ap.add_argument("--blur_pct", type=float, default=3.0, help="sabse dhundli kitne percent images ko 'blurry' mana jaye")
args = ap.parse_args()
names = sorted(f for f in os.listdir(args.pos) if f.lower().endswith((".png", ".jpg", ".jpeg")))
blur, bright = [], []
for i, f in enumerate(names, 1):
    img = np.array(Image.open(os.path.join(args.pos, f)).convert("RGB"))
    q = quality_features(img)
    blur.append(q["blur"])
    bright.append(q["brightness"])
    if i % 100 == 0:
        print(i, "/", len(names))
blur = np.array(blur)
bright = np.array(bright)
min_blur = float(np.percentile(blur, args.blur_pct))
min_bright = float(min(40.0, np.percentile(bright, 1.0)))
max_bright = 230.0
thr = {
    "min_blur": round(min_blur, 2),
    "min_brightness": round(min_bright, 1),
    "max_brightness": max_bright,
    "note": "min_blur = %.1f percentile of %d APTOS test images (relative limit, not clinically validated)" % (args.blur_pct, len(names)),
}
with open(QUALITY_FILE, "w", encoding="utf-8") as f:
    json.dump(thr, f, indent=2)
n_blur = int((blur < thr["min_blur"]).sum())
n_dark = int((bright < thr["min_brightness"]).sum())
n_bright = int((bright > thr["max_brightness"]).sum())
n_pass = int(((blur >= thr["min_blur"]) & (bright >= thr["min_brightness"]) & (bright <= thr["max_brightness"])).sum())
print("\nImages:", len(names))
print("Blur score (retina ke andar, 512x512 par):")
print("  min %.1f | p3 %.1f | p25 %.1f | median %.1f | p75 %.1f | p95 %.1f | max %.1f" %
      ((blur.min(), np.percentile(blur, 3)) + tuple(np.percentile(blur, [25, 50, 75, 95])) + (blur.max(),)))
print("Brightness (retina ke andar): min %.0f | p1 %.0f | median %.0f | max %.0f" %
      (bright.min(), np.percentile(bright, 1), np.median(bright), bright.max()))
print("\nNaye thresholds:", {k: v for k, v in thr.items() if k != "note"})
print("Quality check PASS: %d (%.1f%%) | blurry: %d | dark: %d | bright: %d" %
      (n_pass, 100.0 * n_pass / len(names), n_blur, n_dark, n_bright))
order = np.argsort(blur)
print("\nSabse dhundli 8 images (File Explorer mein kholke dekho):")
print("  ", ", ".join(names[j] for j in order[:8]))
print("Sabse saaf 3 images (muqabile ke liye):")
print("  ", ", ".join(names[j] for j in order[-3:]))
print("\nSaved:", QUALITY_FILE)
