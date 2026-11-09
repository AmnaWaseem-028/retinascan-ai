import csv, os, ast
import numpy as np
import cv2
import timm
import torch
import torchvision.transforms as T
from PIL import Image
from uncertainty import _views, THRESHOLD_LOW, THRESHOLD_HIGH, MAX_ENTROPY
BASE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = r"D:\data\test.csv"
IMG_DIR = r"D:\data\test_images\test_images"
# main.py se exact preprocessing functions uthao (main.py chalaye bina)
src = open(os.path.join(BASE, "main.py"), encoding="utf-8").read()
ns = {"cv2": cv2, "np": np}
found = []
for node in ast.parse(src).body:
    if isinstance(node, ast.FunctionDef) and node.name in ("crop_image_from_gray", "ben_graham_preprocess"):
        exec(ast.get_source_segment(src, node), ns)
        found.append(node.name)
print("main.py se mile:", found)
if "ben_graham_preprocess" not in ns or "crop_image_from_gray" not in ns:
    print("RUKO: dono functions nahi mile. Ye output Claude ko bhejo.")
    raise SystemExit
preprocess = ns["ben_graham_preprocess"]
model = timm.create_model("efficientnet_b0", pretrained=False, num_classes=5)
model.load_state_dict(torch.load(os.path.join(BASE, "model", "best_model.pth"), map_location="cpu"))
model.eval()
tf = T.Compose([T.ToTensor(), T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
def qwk(y, p, n=5):
    O = np.zeros((n, n))
    for a, b in zip(y, p):
        O[a, b] += 1
    W = np.array([[(i - j) ** 2 / (n - 1) ** 2 for j in range(n)] for i in range(n)])
    E = np.outer(O.sum(1), O.sum(0)) / O.sum()
    return 1 - (W * O).sum() / (W * E).sum()
rows = list(csv.DictReader(open(CSV_PATH)))
y, single, tta, score = [], [], [], []
for i, r in enumerate(rows, 1):
    raw = np.array(Image.open(os.path.join(IMG_DIR, r["id_code"] + ".png")).convert("RGB"))
    img = preprocess(raw)
    b = torch.stack([tf(v) for v in _views(img)])
    with torch.no_grad():
        p = torch.softmax(model(b), 1).numpy()
    m = p.mean(0)
    single.append(int(p[0].argmax()))
    tta.append(int(m.argmax()))
    ent = -np.sum(m * np.log(m + 1e-7))
    score.append(float(min(1.0, max(0.0, ent / MAX_ENTROPY))))
    y.append(int(r["diagnosis"]))
    if i % 50 == 0:
        print(i, "/", len(rows), "done")
y, single, tta, score = np.array(y), np.array(single), np.array(tta), np.array(score)
err = tta != y
tier = np.where(score < THRESHOLD_LOW, "LOW", np.where(score < THRESHOLD_HIGH, "MEDIUM", "HIGH"))
print()
print("TEST SET RESULT (thresholds fixed: LOW=%.2f, HIGH=%.2f)" % (THRESHOLD_LOW, THRESHOLD_HIGH))
print("Images:", len(y), "| Errors (TTA):", int(err.sum()))
print("Accuracy  single=%.3f  TTA=%.3f" % (np.mean(single == y), np.mean(tta == y)))
print("QWK       single=%.4f  TTA=%.4f" % (qwk(y, single), qwk(y, tta)))
print()
for t in ["LOW", "MEDIUM", "HIGH"]:
    mk = tier == t
    acc = np.mean(tta[mk] == y[mk]) if mk.sum() else float("nan")
    print("%-6s images=%3d (%.0f%%)  accuracy=%.3f  errors=%d" % (t, mk.sum(), 100 * mk.mean(), acc, int(err[mk].sum())))
hi = tier == "HIGH"
print()
print("Error capture (errors inside HIGH): %.2f" % (err[hi].sum() / max(1, err.sum())))
print("Review workload (images flagged HIGH): %.2f" % hi.mean())
print("Accuracy of unflagged (LOW+MEDIUM): %.3f" % np.mean(tta[~hi] == y[~hi]))
with open("test_results.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["id_code", "true", "pred", "score", "tier"])
    for r, a, b_, s, t in zip(rows, y, tta, score, tier):
        w.writerow([r["id_code"], a, b_, round(s, 4), t])
print()
print("Saved: test_results.csv")
