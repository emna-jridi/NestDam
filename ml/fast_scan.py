#!/usr/bin/env python3
"""
Scan inference for one APK with the LightGBM model trained by train.py.

Features come from extractor.py (same code as training), the model from ml/models/.
Prints JSON (contract of FastScanResult in fast-ml-scan.service.ts):
    {"score", "verdict", "threshold", "modelVersion", "permissions",
     "topContributingFeatures": [{"name", "impact", "value"}]}

Usage:
    py -3.12 ml/fast_scan.py app.apk
"""

import argparse
import json
import os

import lightgbm as lgb

from extractor import extract_features, to_matrix

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "model.txt")
FEATURES_PATH = os.path.join(MODEL_DIR, "features.json")
METADATA_PATH = os.path.join(MODEL_DIR, "metadata.json")

TOP_FEATURES = 5
PERM_PREFIX = "perm::"


def predict(apk_path: str) -> dict:
    booster = lgb.Booster(model_file=MODEL_PATH)
    with open(FEATURES_PATH, encoding="utf-8") as f:
        columns = json.load(f)
    with open(METADATA_PATH, encoding="utf-8") as f:
        metadata = json.load(f)
    threshold = float(metadata["threshold"])

    features = extract_features(apk_path)
    names = columns["tokens"] + columns["numeric"]
    x = to_matrix([features], columns["tokens"], columns["numeric"])
    score = float(booster.predict(x)[0])

    # Per-feature push toward "malware" (SHAP values, last column is the bias)
    contrib = booster.predict(x, pred_contrib=True)
    contrib = (contrib.toarray() if hasattr(contrib, "toarray") else contrib)[0][:-1]
    values = x.toarray()[0]
    top = sorted((i for i in range(len(names)) if contrib[i] > 0), key=lambda i: -contrib[i])[:TOP_FEATURES]

    return {
        "score": score,
        "verdict": "malicious" if score >= threshold else "benign",
        "threshold": threshold,
        "modelVersion": metadata["version"],
        "permissions": [t[len(PERM_PREFIX):] for t in features["tokens"] if t.startswith(PERM_PREFIX)],
        "topContributingFeatures": [
            {"name": names[i], "impact": round(float(contrib[i]), 4), "value": float(values[i])} for i in top
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="FAST scan inference (LightGBM)")
    parser.add_argument("apk", help="Path to APK to scan")
    args = parser.parse_args()
    print(json.dumps(predict(args.apk)))


if __name__ == "__main__":
    main()
