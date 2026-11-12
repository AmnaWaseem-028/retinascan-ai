import argparse
import csv
import os
import cv2
import numpy as np
from fundus_check import check_fundus, T
EXTS = (".png", ".jpg", ".jpeg", ".bmp", ".webp")
FEATURES = ["corner_dark", "area_frac", "fill", "r_ratio", "b_ratio", "detail"]
def read_rgb(path):
    data = np.fromfile(path, dtype=np.uint8)
    bgr = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if bgr is None:
        return None
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
def list_images(folder, limit=None):
    out = []
    for root, _, files in os.walk(folder):
        for f in files:
            if f.lower().endswith(EXTS):
                out.append(os.path.join(root, f))
    out.sort()
    return out[:limit] if limit else out
def synthetic_negatives():
    rng = np.random.default_rng(0)
    s = 512
    items = {}
    items["noise"] = rng.integers(0, 256, (s, s, 3), dtype=np.uint8)
    items["solid_gray"] = np.full((s, s, 3), 128, np.uint8)
    items["white"] = np.full((s, s, 3), 255, np.uint8)
    items["black"] = np.zeros((s, s, 3), np.uint8)
    xs = np.tile(np.linspace(0, 255, s).astype(np.uint8), (s, 1))
    items["gradient"] = np.dstack([xs, xs, xs])
    chk = (((np.indices((s, s)).sum(axis=0) // 32) % 2) * 255).astype(np.uint8)
    items["checkerboard"] = np.dstack([chk, chk, chk])
    yy, xx = np.ogrid[:s, :s]
    disc = ((xx - s / 2) ** 2 + (yy - s / 2) ** 2) < (s * 0.45) ** 2
    flat = np.zeros((s, s, 3), np.uint8)
    flat[disc] = (200, 110, 40)
    items["flat_orange_disc"] = flat
    green = np.zeros((s, s, 3), np.uint8)
    green[disc] = (30, 200, 30)
    items["green_disc"] = green
    blue = np.zeros((s, s, 3), np.uint8)
    blue[disc] = (30, 60, 200)
    items["blue_disc"] = blue
    return items
def summarize_features(rows):
    print("\nFeature          min     p1      p5      median  p95     max")
    for name in FEATURES:
        vals = np.array([r["features"][name] for r in rows if r["features"]])
        if len(vals) == 0:
            continue
        p = np.percentile(vals, [0, 1, 5, 50, 95, 100])
        print("%-15s %6.3f  %6.3f  %6.3f  %6.3f  %6.3f  %6.3f" % ((name,) + tuple(p)))
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pos", required=True, help="asli RAW fundus images ka folder")
    ap.add_argument("--neg", action="append", default=[], help="non-fundus images ka folder")
    ap.add_argument("--limit", type=int, default=None, help="har folder se zyada se zyada kitni images")
    ap.add_argument("--out", default="fundus_eval_results.csv")
    args = ap.parse_args()
    results = []
    # --- Asli fundus images ---
    pos_paths = list_images(args.pos, args.limit)
    pos = []
    for i, p in enumerate(pos_paths, 1):
        img = read_rgb(p)
        res = check_fundus(img)
        res["name"] = os.path.basename(p)
        pos.append(res)
        results.append(("fundus", res))
        if i % 100 == 0:
            print("fundus", i, "/", len(pos_paths))
    print("\n=== ASLI FUNDUS IMAGES ===")
    n_ok = sum(r["is_fundus"] for r in pos)
    print("Images: %d | Accepted: %d (%.1f%%) | Rejected: %d" % (len(pos), n_ok, 100.0 * n_ok / max(1, len(pos)), len(pos) - n_ok))
    reason_counts = {}
    for r in pos:
        for why in r["reasons"]:
            reason_counts[why] = reason_counts.get(why, 0) + 1
    for why, n in sorted(reason_counts.items(), key=lambda x: -x[1]):
        print("  rule fail: %-15s %d images" % (why, n))
    summarize_features(pos)
    bad = [r["name"] for r in pos if not r["is_fundus"]][:10]
    if bad:
        print("\nPehli galat reject hui images:", ", ".join(bad))
    # --- Non-fundus images ---
    neg = []
    for folder in args.neg:
        for p in list_images(folder, args.limit):
            img = read_rgb(p)
            if img is None:
                continue
            res = check_fundus(img)
            res["name"] = p
            neg.append(res)
            results.append(("real_non_fundus", res))
    synth = []
    for name, img in synthetic_negatives().items():
        res = check_fundus(img)
        res["name"] = "synthetic:" + name
        synth.append(res)
        results.append(("synthetic_non_fundus", res))
    for title, group in (("ASLI NON-FUNDUS IMAGES (tumhari photos/screenshots)", neg),
                         ("SYNTHETIC NON-FUNDUS IMAGES", synth)):
        print("\n=== %s ===" % title)
        if not group:
            print("Koi image nahi mili.")
            continue
        n_rej = sum(not r["is_fundus"] for r in group)
        print("Images: %d | Rejected (sahi): %d (%.1f%%)" % (len(group), n_rej, 100.0 * n_rej / len(group)))
        for r in group:
            if r["is_fundus"]:
                print("  GALAT ACCEPT:", r["name"])
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["group", "name", "is_fundus", "reasons"] + FEATURES)
        for group, r in results:
            w.writerow([group, r["name"], r["is_fundus"], "|".join(r["reasons"])] +
                       [round(r["features"].get(k, 0.0), 4) for k in FEATURES])
    print("\nThresholds abhi:", T)
    print("Saved:", args.out)
if __name__ == "__main__":
    main()
