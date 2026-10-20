#!/usr/bin/env python3
"""
Pick a balanced sample of APKs from open sources (no AndroZoo key needed):
    malware -> MalwareBazaar (abuse.ch), most recent Android samples
    benign  -> F-Droid, latest version of random open-source apps

Downloads two index files (~300 MB total, kept for re-runs):
    ml/data/open/mb_full.zip        MalwareBazaar full metadata export
    ml/data/open/fdroid_index.json  F-Droid repo index

Usage:
    py -3.12 ml/open_select.py            # 2000 malware + 2000 benign
    py -3.12 ml/open_select.py 500        # 500 + 500

Output: ml/data/open/selection.csv  (consumed by build_features.py)
"""

import csv
import io
import json
import os
import random
import sys
import urllib.request
import zipfile

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "open")
MB_CSV_URL = "https://bazaar.abuse.ch/export/csv/full/"
MB_ZIP_PATH = os.path.join(DATA_DIR, "mb_full.zip")
FDROID_INDEX_URL = "https://f-droid.org/repo/index-v1.json"
FDROID_INDEX_PATH = os.path.join(DATA_DIR, "fdroid_index.json")
OUT_PATH = os.path.join(DATA_DIR, "selection.csv")

MAX_MB = 30  # same cap as build_features.py, so size alone can't separate the classes
MIN_YEAR = "2020"
SKIP_SIGNATURES = {"Mirai"}  # Linux botnet mislabeled as APK
SEED = 42


def fetch(url: str, dest: str) -> None:
    if os.path.exists(dest):
        print(f"Using cached {os.path.basename(dest)}")
        return
    print(f"Downloading {url}")
    tmp = dest + ".part"
    with urllib.request.urlopen(url, timeout=120) as resp, open(tmp, "wb") as f:
        while chunk := resp.read(1024 * 1024):
            f.write(chunk)
    os.replace(tmp, dest)


def pick_malware(n: int) -> list[dict]:
    fetch(MB_CSV_URL, MB_ZIP_PATH)
    rows = []
    with zipfile.ZipFile(MB_ZIP_PATH) as zf:
        with zf.open(zf.namelist()[0]) as raw:
            lines = (l for l in io.TextIOWrapper(raw, encoding="utf-8", errors="replace") if not l.startswith("#"))
            for r in csv.reader(lines, skipinitialspace=True):
                # first_seen_utc, sha256, md5, sha1, reporter, file_name, file_type_guess, mime, signature, ...
                if len(r) < 9 or r[6] != "apk" or r[0][:4] < MIN_YEAR or r[8] in SKIP_SIGNATURES:
                    continue
                rows.append({"sha256": r[1], "pkg_name": r[5], "label": "malware", "source": "malwarebazaar",
                             "apk_size": "", "ref": r[1], "first_seen": r[0], "family": "" if r[8] == "n/a" else r[8]})
    rows.sort(key=lambda r: r["first_seen"], reverse=True)  # newest first
    print(f"MalwareBazaar: {len(rows)} APKs since {MIN_YEAR}, taking {min(n, len(rows))}")
    return rows[:n]


def pick_benign(n: int) -> list[dict]:
    fetch(FDROID_INDEX_URL, FDROID_INDEX_PATH)
    with open(FDROID_INDEX_PATH, encoding="utf-8") as f:
        index = json.load(f)

    candidates = []
    for pkg, versions in index["packages"].items():
        latest = max(versions, key=lambda v: v.get("versionCode", 0))
        if latest.get("hashType") != "sha256" or latest.get("size", 0) > MAX_MB * 1024 * 1024:
            continue
        candidates.append({"sha256": latest["hash"], "pkg_name": pkg, "label": "benign", "source": "fdroid",
                           "apk_size": latest["size"], "ref": latest["apkName"], "first_seen": "", "family": ""})
    random.Random(SEED).shuffle(candidates)
    print(f"F-Droid: {len(candidates)} apps <= {MAX_MB} MB, taking {min(n, len(candidates))}")
    return candidates[:n]


def main(per_class: int) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    rows = pick_malware(per_class) + pick_benign(per_class)

    fields = ["sha256", "pkg_name", "label", "source", "apk_size", "ref", "first_seen", "family"]
    with open(OUT_PATH, "w", encoding="utf-8", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved {len(rows)} rows: {OUT_PATH}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 2000)
