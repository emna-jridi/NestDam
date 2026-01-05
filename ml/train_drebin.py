#!/usr/bin/env python3
"""
Train Drebin-based malware detector (static features, binary matrix).
Models: XGBoost, LightGBM, RandomForest, Logistic Regression (L1).
Exports best model + feature list + metadata.
"""
import os
import json
import warnings
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    roc_auc_score,
    f1_score,
    precision_score,
    recall_score,
    precision_recall_curve,
    confusion_matrix,
)
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV

import xgboost as xgb
import lightgbm as lgb
import joblib

warnings.filterwarnings("ignore")

CONFIG = {
    # Adjust if your drebin.csv is elsewhere; here it is three levels up under Downloads/drebin.csv
    "dataset_path": r"..\..\..\drebin.csv\drebin.csv",
    "output_dir": "models_drebin",
    "test_size": 0.15,
    "val_size": 0.15,
    "random_state": 42,
    "top_k_features": None,  # set an int to select top-K by importance (None = keep all)
}


def print_header(title: str):
    print("\n" + "=" * 68)
    print(f"  {title}")
    print("=" * 68)


def evaluate(model, X, y, name: str):
    y_pred = model.predict(X)
    if hasattr(model, "predict_proba"):
        y_proba = model.predict_proba(X)[:, 1]
    else:
        y_proba = y_pred.astype(float)

    acc = accuracy_score(y, y_pred)
    auc = roc_auc_score(y, y_proba)
    f1 = f1_score(y, y_pred)
    prec = precision_score(y, y_pred)
    rec = recall_score(y, y_pred)

    precisions, recalls, thresholds = precision_recall_curve(y, y_proba)
    f1_scores = 2 * (precisions * recalls) / (precisions + recalls + 1e-10)
    best_idx = np.argmax(f1_scores)
    best_thr = thresholds[best_idx] if best_idx < len(thresholds) else 0.5
    best_f1 = f1_scores[best_idx]

    tn, fp, fn, tp = confusion_matrix(y, y_pred).ravel()

    return {
        "name": name,
        "accuracy": acc,
        "auc": auc,
        "f1": f1,
        "precision": prec,
        "recall": rec,
        "best_threshold": best_thr,
        "best_f1": best_f1,
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "tp": tp,
    }


def load_data():
    print_header("Loading Drebin dataset")
    df = pd.read_csv(CONFIG["dataset_path"])
    assert "class" in df.columns, "Missing 'class' column"

    # Map labels: Drebin uses 'S' for malware, others benign
    y = (df["class"].astype(str).str.upper() == "S").astype(int).values

    features_df = df.drop(columns=["class"])
    # Clean unexpected placeholders like '?' -> assume absent (0)
    features_df = features_df.replace("?", 0)
    X = features_df.astype(np.float32).values
    feature_names = features_df.columns.tolist()

    print(f"   Samples: {len(y):,}")
    print(f"   Features: {X.shape[1]:,}")
    print(f"   Malware: {y.sum():,} ({y.mean()*100:.1f}%)")
    print(f"   Benign: {len(y)-y.sum():,} ({(1-y.mean())*100:.1f}%)")
    return X, y, feature_names


def split_data(X, y):
    val_ratio = CONFIG["val_size"] / (1 - CONFIG["test_size"])
    X_temp, X_test, y_temp, y_test = train_test_split(
        X, y, test_size=CONFIG["test_size"], random_state=CONFIG["random_state"], stratify=y
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_temp, y_temp, test_size=val_ratio, random_state=CONFIG["random_state"], stratify=y_temp
    )
    print_header("Split")
    print(f"   Train: {len(X_train):,}  Val: {len(X_val):,}  Test: {len(X_test):,}")
    return X_train, X_val, X_test, y_train, y_val, y_test


def train_models(X_train, y_train, X_val, y_val):
    print_header("Training models")
    models = {}

    # XGBoost
    scale_pos = (len(y_train) - y_train.sum()) / y_train.sum()
    xgb_model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos,
        eval_metric="auc",
        random_state=CONFIG["random_state"],
        early_stopping_rounds=30,
        verbosity=0,
    )
    xgb_model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    models["xgb"] = xgb_model

    # LightGBM
    lgb_model = lgb.LGBMClassifier(
        n_estimators=300,
        max_depth=7,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos,
        random_state=CONFIG["random_state"],
        verbosity=-1,
    )
    lgb_model.fit(X_train, y_train, eval_set=[(X_val, y_val)], callbacks=[lgb.early_stopping(30, verbose=False)])
    models["lgb"] = lgb_model

    # Random Forest
    rf_model = RandomForestClassifier(
        n_estimators=300,
        max_depth=None,
        min_samples_split=2,
        min_samples_leaf=1,
        class_weight="balanced",
        n_jobs=-1,
        random_state=CONFIG["random_state"],
    )
    rf_model.fit(X_train, y_train)
    models["rf"] = rf_model

    # Logistic Regression (L1)
    scaler = StandardScaler(with_mean=False)
    X_train_sc = scaler.fit_transform(X_train)
    lr_model = LogisticRegression(
        penalty="l1",
        solver="saga",
        C=1.0,
        class_weight="balanced",
        max_iter=2000,
        random_state=CONFIG["random_state"],
    )
    lr_model.fit(X_train_sc, y_train)
    models["lr"] = (lr_model, scaler)

    return models


def evaluate_all(models, X_test, y_test):
    results = []
    for name, model in models.items():
        if name == "lr":
            lr_model, scaler = model
            X_t = scaler.transform(X_test)
            r = evaluate(lr_model, X_t, y_test, "LogReg (L1)")
        elif name == "xgb":
            r = evaluate(model, X_test, y_test, "XGBoost")
        elif name == "lgb":
            r = evaluate(model, X_test, y_test, "LightGBM")
        elif name == "rf":
            r = evaluate(model, X_test, y_test, "RandomForest")
        else:
            continue
        results.append(r)
    return results


def pick_winner(results):
    results_sorted = sorted(results, key=lambda d: d["auc"], reverse=True)
    print_header("Model comparison (sorted by AUC)")
    for r in results_sorted:
        print(
            f"   {r['name']:<15} AUC={r['auc']:.4f}  F1={r['f1']:.4f}  Acc={r['accuracy']*100:.2f}%  "
            f"Prec={r['precision']:.4f}  Rec={r['recall']:.4f}  Thr*={r['best_threshold']:.3f}  F1*={r['best_f1']:.4f}"
        )
    return results_sorted[0]


def calibrate_best(best_name, models, X_train, y_train, X_val, y_val):
    # Combine train+val for calibration
    X_comb = np.vstack([X_train, X_val])
    y_comb = np.concatenate([y_train, y_val])

    if best_name == "LogReg (L1)":
        lr_model, scaler = models["lr"]
        X_comb_sc = scaler.transform(X_comb)
        base = lr_model
        needs_scaler = scaler
    else:
        base = {"XGBoost": models["xgb"], "LightGBM": models["lgb"], "RandomForest": models["rf"]}[best_name]
        needs_scaler = None

    calib = CalibratedClassifierCV(estimator=base, method="isotonic", cv=3)
    calib.fit(X_comb_sc if needs_scaler is not None else X_comb, y_comb)
    return calib, needs_scaler


def export_model(model, scaler, feature_names, metrics, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    joblib.dump(model, os.path.join(output_dir, "best_model.joblib"))
    if scaler is not None:
        joblib.dump(scaler, os.path.join(output_dir, "scaler.joblib"))
    meta = {
        "version": "drebin-1.0",
        "created": datetime.now().isoformat(),
        "model": metrics["name"],
        "metrics": {k: float(metrics[k]) for k in ["accuracy", "auc", "f1", "precision", "recall", "best_threshold", "best_f1"]},
        "confusion": {k: int(metrics[k]) for k in ["tn", "fp", "fn", "tp"]},
        "features": feature_names,
        "num_features": len(feature_names),
    }
    with open(os.path.join(output_dir, "metadata.json"), "w") as f:
        json.dump(meta, f, indent=2)
    with open(os.path.join(output_dir, "features.json"), "w") as f:
        json.dump(feature_names, f, indent=2)
    print_header("Export")
    print(f"   Saved to {os.path.abspath(output_dir)}")


def main():
    X, y, feature_names = load_data()
    X_train, X_val, X_test, y_train, y_val, y_test = split_data(X, y)

    models = train_models(X_train, y_train, X_val, y_val)
    results = evaluate_all(models, X_test, y_test)
    winner = pick_winner(results)

    # Calibrate winner
    calib_model, scaler = calibrate_best(winner["name"], models, X_train, y_train, X_val, y_val)
    # Evaluate calibrated
    if scaler is not None:
        X_test_cal = scaler.transform(X_test)
    else:
        X_test_cal = X_test
    calib_res = evaluate(calib_model, X_test_cal, y_test, winner["name"] + " (Calibrated)")

    # Pick between raw winner and calibrated
    final_metrics = calib_res if calib_res["auc"] >= winner["auc"] else winner
    final_model = calib_model if calib_res["auc"] >= winner["auc"] else models[winner["name"].split()[0].lower() if "XGBoost" in winner["name"] else winner["name"].split()[0].lower()]
    final_scaler = scaler if final_metrics is calib_res else (models["lr"][1] if winner["name"] == "LogReg (L1)" else None)

    export_model(final_model, final_scaler, feature_names, final_metrics, CONFIG["output_dir"])

    print_header("Done")
    print(f"   Best: {final_metrics['name']}  AUC={final_metrics['auc']:.4f}  F1={final_metrics['f1']:.4f}")


if __name__ == "__main__":
    main()
