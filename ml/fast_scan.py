#!/usr/bin/env python3
"""
FAST scan inference for one APK with the LightGBM model trained by train.py.

Features come from extractor.py (same code as training), the model from ml/models/.
Prints JSON: {"score", "verdict", "threshold", "recommendation"} (contract of FastMLScanService).

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

UNSURE_MARGIN = 0.05  # score this close to the threshold -> suggest a deeper scan


def predict(apk_path: str) -> dict:
    booster = lgb.Booster(model_file=MODEL_PATH)
    with open(FEATURES_PATH, encoding="utf-8") as f:
        columns = json.load(f)
    with open(METADATA_PATH, encoding="utf-8") as f:
        threshold = float(json.load(f)["threshold"])

    x = to_matrix([extract_features(apk_path)], columns["tokens"], columns["numeric"])
    score = float(booster.predict(x)[0])
    verdict = "malicious" if score >= threshold else "benign"

    recommendation = None
    if abs(score - threshold) < UNSURE_MARGIN:
        recommendation = "SMART" if verdict == "benign" else "DEEP"

    return {"score": score, "verdict": verdict, "threshold": threshold, "recommendation": recommendation}


def main() -> None:
    parser = argparse.ArgumentParser(description="FAST scan inference (LightGBM)")
    parser.add_argument("apk", help="Path to APK to scan")
    args = parser.parse_args()
    print(json.dumps(predict(args.apk)))


if __name__ == "__main__":
    main()
