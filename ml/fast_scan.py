#!/usr/bin/env python3
"""
FAST scan inference for Android APKs using Drebin LightGBM model.
- Loads model + feature list + threshold from models_drebin
- Extracts lightweight features (manifest permissions + intent actions)
- Produces score, verdict, and recommendation for upgrade (SMART/DEEP)

Note: This extractor sets non-manifest features to 0 (best-effort). Accuracy
is still strong for manifest-driven signals; for deeper coverage, move to
SMART/DEEP levels with richer feature extraction.
"""

import argparse
import json
import os
import sys
from dataclasses import dataclass
from typing import List, Tuple

import joblib
import numpy as np

try:
    # Newer androguard layout (4.x) exposes APK in androguard.core.apk
    from androguard.core.apk import APK
except ImportError:
    try:
        # Older layout fallback
        from androguard.core.bytecodes.apk import APK
    except Exception:
        try:
            from androguard.core.bytecodes import apk as _apk_mod
            APK = _apk_mod.APK
        except Exception:
            print("Androguard is required. Install with: pip install androguard", file=sys.stderr)
            sys.exit(1)

_HERE = os.path.dirname(__file__)
# Prefer colocated models_drebin/ next to this script; fall back to project root
_MODEL_DIR_CANDIDATES = [
    os.path.join(_HERE, "models_drebin"),
    os.path.join(os.path.dirname(_HERE), "models_drebin"),
]
MODEL_DIR = next((p for p in _MODEL_DIR_CANDIDATES if os.path.exists(p)), _MODEL_DIR_CANDIDATES[0])
MODEL_PATH = os.path.join(MODEL_DIR, "best_model.joblib")
FEATURES_PATH = os.path.join(MODEL_DIR, "features.json")
METADATA_PATH = os.path.join(MODEL_DIR, "metadata.json")


@dataclass
class Assets:
    model: object
    features: List[str]
    threshold: float


def load_assets() -> Assets:
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
    if not os.path.exists(FEATURES_PATH):
        raise FileNotFoundError(f"Features not found: {FEATURES_PATH}")

    model = joblib.load(MODEL_PATH)
    with open(FEATURES_PATH, "r") as f:
        features = json.load(f)

    threshold = 0.5
    if os.path.exists(METADATA_PATH):
        with open(METADATA_PATH, "r") as f:
            meta = json.load(f)
            threshold = float(meta.get("metrics", {}).get("best_threshold", threshold))

    return Assets(model=model, features=features, threshold=threshold)


def extract_manifest_signals(apk: APK) -> Tuple[set, set]:
    """Return (permissions, intent_actions) from manifest."""
    # Permissions: store suffix (READ_SMS) and full name
    perms_full = set(apk.get_permissions())
    perms_suffix = {p.split(".")[-1].upper() for p in perms_full}
    # Intent actions: gather from activities, receivers, services
    actions = set()
    component_getters = {
        "activity": apk.get_activities,
        "receiver": apk.get_receivers,
        "service": apk.get_services,
        "provider": apk.get_providers,
    }
    for comp_type, getter in component_getters.items():
        for name in getter() or []:
            try:
                intents = apk.get_intent_filters(name, comp_type)
            except TypeError:
                # Older androguard signature: (component_type, name)
                intents = apk.get_intent_filters(comp_type, name)
            for intent_list in intents.values():
                for action in intent_list.get("action", []):
                    actions.add(action)
    return perms_suffix, actions


def featurize_apk(apk_path: str, feature_names: List[str]) -> np.ndarray:
    """Build the Drebin feature vector with best-effort manifest mapping."""
    if not os.path.exists(apk_path):
        raise FileNotFoundError(f"APK not found: {apk_path}")

    apk = APK(apk_path)
    perm_suffix, intent_actions = extract_manifest_signals(apk)

    vec = np.zeros(len(feature_names), dtype=np.float32)
    for idx, feat in enumerate(feature_names):
        # Permissions (tokens like READ_SMS)
        if feat.isupper() and feat in perm_suffix:
            vec[idx] = 1.0
            continue
        # Intent actions (strings like android.intent.action.BOOT_COMPLETED)
        if feat.startswith("android.intent.") and feat in intent_actions:
            vec[idx] = 1.0
            continue
        # Other features remain 0 in FAST mode (lightweight path)
    return vec


def predict(apk_path: str, assets: Assets) -> dict:
    x = featurize_apk(apk_path, assets.features).reshape(1, -1)
    proba = float(assets.model.predict_proba(x)[0][1])
    verdict = "malicious" if proba >= assets.threshold else "benign"

    margin = abs(proba - assets.threshold)
    recommend = None
    if margin < 0.05:
        recommend = "SMART (tracker + privacy)" if verdict == "benign" else "DEEP (cloud)"

    return {
        "score": proba,
        "verdict": verdict,
        "threshold": assets.threshold,
        "recommendation": recommend,
    }


def main():
    parser = argparse.ArgumentParser(description="FAST scan inference (Drebin LightGBM)")
    parser.add_argument("apk", help="Path to APK to scan")
    args = parser.parse_args()

    assets = load_assets()
    result = predict(args.apk, assets)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
