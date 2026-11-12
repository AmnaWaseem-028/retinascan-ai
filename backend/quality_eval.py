import ast
import os
import sys
import cv2
import numpy as np
from PIL import Image
BASE = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = sys.argv[1] if len(sys.argv) > 1 else r"D:\data\test_images\test_images"
# main.py chalaye bina uska check_quality function nikalo
src = open(os.path.join(BASE, "main.py"), encoding="utf-8").read()
ns = {"cv2": cv2, "np": np}
for node in ast.parse(src).body:
    if isinstance(node, ast.FunctionDef) and node.name == "check_quality":
        exec(ast.get_source_segment(src, node), ns)
if "check_quality" not in ns:
    print("RUKO: main.py mein check_quality nahi mila. Ye output Claude ko bhejo.")
    raise SystemExit
check_quality = ns["check_quality"]
names = sorted(f for f in os.listdir(IMG_DIR) if f.lower().endswith((".png", ".jpg", ".jpeg")))
lap, bright, sizes = [], [], {}
issue_counts = {}
n_pass = 0
fail_examples = []
for i, f in enumerate(names, 1):
    img = np.array(Image.open(os.path.join(IMG_DIR, f)).convert("RGB"))
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    issues = check_quality(gray)
    lap.append(cv2.Laplacian(gray, cv2.CV_64F).var())
    bright.append(gray.mean())
    key = "%dx%d" % (img.shape[1], img.shape[0])
    sizes[key] = sizes.get(key, 0) + 1
    if not issues:
        n_pass += 1
    else:
        if len(fail_examples) < 5:
            fail_examples.append(f)
        for x in issues:
            issue_counts[x] = issue_counts.get(x, 0) + 1
    if i % 100 == 0:
        print(i, "/", len(names))
print("\nImages: %d | Quality check PASS: %d (%.1f%%) | FAIL: %d" % (len(names), n_pass, 100.0 * n_pass / max(1, len(names)), len(names) - n_pass))
for k, v in sorted(issue_counts.items(), key=lambda x: -x[1]):
    print("  %-22s %d images" % (k, v))
lap = np.array(lap)
bright = np.array(bright)
print("\nBlur score (Laplacian variance), limit abhi 100:")
print("  min %.0f | p5 %.0f | p25 %.0f | median %.0f | p75 %.0f | p95 %.0f" % ((lap.min(),) + tuple(np.percentile(lap, [5, 25, 50, 75, 95]))))
print("Brightness: min %.0f | median %.0f | max %.0f" % (bright.min(), np.median(bright), bright.max()))
for t in (100, 50, 25):
    print("  Agar blur limit %d hoti: %d images fail" % (t, int((lap < t).sum())))
print("\nImage sizes (width x height):", dict(sorted(sizes.items(), key=lambda x: -x[1])[:5]))
if fail_examples:
    print("Pehli fail hui images:", ", ".join(fail_examples))
