#!/usr/bin/env python3
"""
Pick a balanced, recent sample of APKs from the AndroZoo list (latest.csv.gz).

Labels (from VirusTotal detections):
    vt_detection == 0  -> benign  (must come from Google Play)
    vt_detection >= 4  -> malware
    1..3               -> skipped (unclear)

Filters:
    - recent: dex_date >= 2018, or (dex_date zeroed to 1981 and vt_scan_date >= 2020)
    - small:  apk_size <= MAX_MB (faster download + feature extraction)
    - one APK per package name (avoids 50 versions of the same app)

The list is sorted by sha256 (random order), so taking the first N matches is a random sample.

Usage:
    py -3.12 ml/androzoo_select.py            # 5000 malware + 5000 benign
    py -3.12 ml/androzoo_select.py 1000       # 1000 + 1000 (quick test)

Output: ml/data/androzoo/selection.csv
"""

import csv
import gzip
import os
import sys

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "androzoo")
LIST_PATH = os.path.join(DATA_DIR, "latest.csv.gz")
OUT_PATH = os.path.join(DATA_DIR, "selection.csv")

MAX_MB = 15
MALWARE_MIN_VT = 4


def is_recent(row: dict) -> bool:
    dex_year = row["dex_date"][:4]
    if dex_year == "1981":  # Play Store APKs have zeroed dex dates
        return row["vt_scan_date"][:4] >= "2020"
    return dex_year >= "2018"


def label_of(row: dict) -> str | None:
    vt = row["vt_detection"]
    if not vt:
        return None
    vt = int(vt)
    if vt == 0:
        return "benign" if "play.google.com" in row["markets"] else None
    if vt >= MALWARE_MIN_VT:
        return "malware"
    return None


def select(per_class: int) -> None:
    picked = {"malware": [], "benign": []}
    seen_pkgs = set()
    scanned = 0

    with gzip.open(LIST_PATH, "rt", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            scanned += 1
            if scanned % 1_000_000 == 0:
                print(f"  {scanned / 1e6:.0f}M rows | malware {len(picked['malware'])} | benign {len(picked['benign'])}")

            label = label_of(row)
            if label is None or len(picked[label]) >= per_class:
                continue
            if not row["apk_size"] or int(row["apk_size"]) > MAX_MB * 1024 * 1024:
                continue
            if not is_recent(row) or row["pkg_name"] in seen_pkgs:
                continue

            seen_pkgs.add(row["pkg_name"])
            picked[label].append(row)

            if all(len(v) >= per_class for v in picked.values()):
                break

    fields = ["sha256", "pkg_name", "label", "vt_detection", "apk_size", "dex_date", "vt_scan_date", "markets"]
    with open(OUT_PATH, "w", encoding="utf-8", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for label, rows in picked.items():
            for row in rows:
                writer.writerow({**row, "label": label})

    total_gb = sum(int(r["apk_size"]) for rows in picked.values() for r in rows) / 1e9
    print(f"\nScanned {scanned:,} rows")
    print(f"Malware: {len(picked['malware'])} | Benign: {len(picked['benign'])}")
    print(f"Total download size: {total_gb:.1f} GB (APKs are deleted after feature extraction)")
    print(f"Saved: {OUT_PATH}")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    select(n)
