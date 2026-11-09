import argparse
import csv
import os

import cv2
import numpy as np
import timm
import torch
import torchvision.transforms as transforms
from PIL import Image
from sklearn.metrics import cohen_kappa_score

from uncertainty import run_tta_uncertainty

parser = argparse.ArgumentParser()
parser.add_argument("--csv", required=True, help="valid.csv ya test.csv (columns: id_code, diagnosis)")
parser.add_argument("--images", required=True, help="images ka folder")
parser.add_argument("--raw", action="store_true", help="agar images Ben Graham se nahi guzri (jaise test_images)")
parser.add_argument("--high", type=float, default=None, help="fixed threshold, test set par report ke liye")
parser.add_argument("--out", default="uncertainty_results.csv")
args = parser.parse_args()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = timm.create_model("efficientnet_b0", pretrained=False, num_classes=5)
model.load_state_dict(torch.load(os.path.join(BASE_DIR, "model", "best_model.pth"), map_location=device))
model.to(device)
model.eval()

transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


def crop_image_from_gray(img, tol=7):
    gray_img = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    mask = gray_img > tol
    if img[:, :, 0][np.ix_(mask.any(1), mask.any(0))].shape[0] == 0:
        return img
    chans = [img[:, :, i][np.ix_(mask.any(1), mask.any(0))] for i in range(3)]
    return np.stack(chans, axis=-1)


def ben_graham_preprocess(img_rgb, output_size=224, sigma_x=10):
    img = crop_image_from_gray(img_rgb)
    img = cv2.resize(img, (output_size, output_size))
    return cv2.addWeighted(img, 4, cv2.GaussianBlur(img, (0, 0), sigma_x), -4, 128)


with open(args.csv, newline="") as f:
    rows = list(csv.DictReader(f))

y, p_tta, p_single, score = [], [], [], []
for i, r in enumerate(rows, 1):
    img = np.array(Image.open(os.path.join(args.images, f"{r['id_code']}.png")).convert("RGB"))
    if args.raw:
        img = ben_graham_preprocess(img)
    res = run_tta_uncertainty(model, transform, device, img)
    with torch.no_grad():
        single = int(torch.argmax(model(transform(img).unsqueeze(0).to(device)), dim=1).item())
    y.append(int(r["diagnosis"]))
    p_tta.append(res["grade"])
    p_single.append(single)
    score.append(res["uncertainty_score"])
    if i % 50 == 0:
        print(f"{i}/{len(rows)} done")

y, p_tta, p_single, score = map(np.array, (y, p_tta, p_single, score))

with open(args.out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["id_code", "true", "pred_tta", "pred_single", "uncertainty_score"])
    for r, a, b, c, d in zip(rows, y, p_tta, p_single, score):
        w.writerow([r["id_code"], a, b, c, d])

wrong = p_tta != y
n_wrong = int(wrong.sum())
print(f"\nImages: {len(y)} | Errors (TTA): {n_wrong}")
print(f"Accuracy  single={np.mean(p_single == y):.3f}  TTA={np.mean(p_tta == y):.3f}")
print(f"QWK       single={cohen_kappa_score(y, p_single, weights='quadratic'):.4f}  "
      f"TTA={cohen_kappa_score(y, p_tta, weights='quadratic'):.4f}")


def stats(t):
    flagged = score >= t
    capture = (flagged & wrong).sum() / max(n_wrong, 1)
    workload = flagged.mean()
    acc_unflagged = (~wrong[~flagged]).mean() if (~flagged).any() else float("nan")
    return capture, workload, acc_unflagged


if args.high is not None:
    c, wl, au = stats(args.high)
    print(f"\nFixed threshold {args.high}: error_capture={c:.2f} review_workload={wl:.2f} acc_unflagged={au:.3f}")
else:
    print("\nthreshold | error_capture | review_workload | acc_unflagged")
    table = []
    for t in np.round(np.arange(0.05, 0.96, 0.05), 2):
        c, wl, au = stats(t)
        table.append((t, c))
        print(f"{t:.2f}      | {c:.2f}          | {wl:.2f}            | {au:.3f}")
    high = max((t for t, c in table if c >= 0.70), default=None)
    low = max((t for t, c in table if c >= 0.90), default=None)
    print(f"\nSuggested HIGH (catches >=70% of errors): {high}")
    print(f"Suggested LOW  (catches >=90% of errors): {low}")
    print("70% aur 90% mere chune hue targets hain, koi standard nahi. Thesis mein poori table dikha ke apna choice justify karna.")
    if n_wrong < 30:
        print("WARNING: errors 30 se kam hain, threshold bharosemand nahi hoga.")