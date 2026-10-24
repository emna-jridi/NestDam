#!/usr/bin/env python3
"""
Train the LightGBM malware detector on the features built by build_features.py.

Reads ml/data/<dataset>/features.jsonl for every dataset, then runs:
    1. main model   : stratified 80/20 split over all datasets (threshold picked on a validation split)
    2. cross-source : train on one dataset, test on the other (catches source shortcuts)

Saves to ml/models/: model.txt (LightGBM booster), features.json (column order), metadata.json (metrics).

Usage:
    py -3.12 ml/train.py
"""

import json
import os
from collections import Counter
from datetime import datetime

import lightgbm as lgb
import numpy as np
from scipy import sparse
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

ML_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ML_DIR, "data")
MODEL_DIR = os.path.join(ML_DIR, "models")

DATASETS = ["androzoo", "open"]
MIN_DF = 20  # a token must appear in at least this many training apps
# Age proxies: AndroZoo malware is 2018-2020 while benign is recent, so these teach "old app = malware"
AGE_TOKEN_PREFIXES = ("api::Landroid/support/",)
AGE_NUMERIC = {"min_sdk", "target_sdk"}
SEED = 42

PARAMS = {
    "objective": "binary",
    "learning_rate": 0.05,
    "num_leaves": 63,
    "min_data_in_leaf": 20,
    "feature_fraction": 0.3,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "lambda_l2": 1.0,
    "seed": SEED,
    "verbose": -1,
}
MAX_ROUNDS = 2000
EARLY_STOP = 50


def load_rows() -> list[dict]:
    rows = []
    for name in DATASETS:
        path = os.path.join(DATA_DIR, name, "features.jsonl")
        with open(path, encoding="utf-8") as f:
            for line in f:
                row = json.loads(line)
                row["dataset"] = name
                rows.append(row)
    return rows


def build_columns(rows: list[dict]) -> tuple[list[str], list[str]]:
    """Token vocabulary from training rows only (no test leakage), plus numeric field names."""
    df = Counter(t for r in rows for t in set(r["tokens"]))
    tokens = sorted(t for t, n in df.items() if n >= MIN_DF and not t.startswith(AGE_TOKEN_PREFIXES))
    numeric = sorted(set(rows[0]["numeric"]) - AGE_NUMERIC)
    return tokens, numeric


def to_matrix(rows: list[dict], tokens: list[str], numeric: list[str]) -> sparse.csr_matrix:
    index = {t: i for i, t in enumerate(tokens)}
    n_tok = len(tokens)
    indptr, indices, values = [0], [], []
    for r in rows:
        cols = sorted({index[t] for t in r["tokens"] if t in index})
        indices.extend(cols)
        values.extend([1.0] * len(cols))
        for j, name in enumerate(numeric):
            indices.append(n_tok + j)
            values.append(float(r["numeric"].get(name) or 0))
        indptr.append(len(indices))
    return sparse.csr_matrix((values, indices, indptr), shape=(len(rows), n_tok + len(numeric)), dtype=np.float32)


def labels(rows: list[dict]) -> np.ndarray:
    return np.array([1 if r["label"] == "malware" else 0 for r in rows])


def fit(train_rows: list[dict]) -> tuple[lgb.Booster, list[str], list[str], float]:
    """Fit on train_rows with early stopping on an inner validation split; return the F1-best threshold."""
    tokens, numeric = build_columns(train_rows)
    strata = [f"{r['label']}|{r['dataset']}" for r in train_rows]
    fit_rows, val_rows = train_test_split(train_rows, test_size=0.15, random_state=SEED, stratify=strata)
    x_fit, x_val = to_matrix(fit_rows, tokens, numeric), to_matrix(val_rows, tokens, numeric)
    y_fit, y_val = labels(fit_rows), labels(val_rows)

    booster = lgb.train(
        PARAMS,
        lgb.Dataset(x_fit, y_fit, free_raw_data=False),  # tokens have chars LightGBM rejects: names live in features.json
        num_boost_round=MAX_ROUNDS,
        valid_sets=[lgb.Dataset(x_val, y_val)],
        callbacks=[lgb.early_stopping(EARLY_STOP, verbose=False)],
    )
    p_val = booster.predict(x_val)
    thresholds = np.arange(0.05, 0.96, 0.01)
    threshold = float(max(thresholds, key=lambda t: f1_score(y_val, p_val >= t)))
    return booster, tokens, numeric, threshold


def evaluate(booster: lgb.Booster, rows: list[dict], tokens, numeric, threshold: float) -> dict:
    y = labels(rows)
    p = booster.predict(to_matrix(rows, tokens, numeric))
    pred = p >= threshold
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "auc": round(float(roc_auc_score(y, p)), 4),
        "f1": round(float(f1_score(y, pred)), 4),
        "precision": round(float(precision_score(y, pred)), 4),
        "recall": round(float(recall_score(y, pred)), 4),
        "false_positive_rate": round(float(fp / (fp + tn)), 4),
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


def show(title: str, m: dict) -> None:
    c = m["confusion"]
    print(f"  {title:<28} AUC {m['auc']:.4f} | F1 {m['f1']:.4f} | FPR {m['false_positive_rate']:.2%} "
          f"| fp {c['fp']} fn {c['fn']}")


def main() -> None:
    rows = load_rows()
    print(f"{len(rows)} apps:", dict(Counter(f"{r['dataset']}/{r['label']}" for r in rows)))

    # 1. Main model
    strata = [f"{r['label']}|{r['dataset']}" for r in rows]
    train_rows, test_rows = train_test_split(rows, test_size=0.2, random_state=SEED, stratify=strata)
    booster, tokens, numeric, threshold = fit(train_rows)
    print(f"\nMain model: {booster.best_iteration} trees, {len(tokens)} tokens + {len(numeric)} numeric, "
          f"threshold {threshold:.2f}")
    main_metrics = evaluate(booster, test_rows, tokens, numeric, threshold)
    show("test (all)", main_metrics)
    per_dataset = {}
    for name in DATASETS:
        per_dataset[name] = evaluate(booster, [r for r in test_rows if r["dataset"] == name], tokens, numeric, threshold)
        show(f"test ({name})", per_dataset[name])

    gain = booster.feature_importance("gain")
    names = tokens + numeric
    print("\nTop 20 features (gain):")
    for i in np.argsort(gain)[::-1][:20]:
        print(f"  {gain[i]:>10.0f}  {names[i]}")

    # 2. Cross-source: does it generalize to a source it never saw?
    print("\nCross-source:")
    cross = {}
    for train_name in DATASETS:
        for test_name in DATASETS:
            if train_name == test_name:
                continue
            b, t, n, th = fit([r for r in rows if r["dataset"] == train_name])
            cross[f"{train_name}->{test_name}"] = m = evaluate(b, [r for r in rows if r["dataset"] == test_name], t, n, th)
            show(f"train {train_name} -> test {test_name}", m)

    os.makedirs(MODEL_DIR, exist_ok=True)
    booster.save_model(os.path.join(MODEL_DIR, "model.txt"), num_iteration=booster.best_iteration)
    with open(os.path.join(MODEL_DIR, "features.json"), "w", encoding="utf-8") as f:
        json.dump({"tokens": tokens, "numeric": numeric}, f)
    with open(os.path.join(MODEL_DIR, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump({
            "version": "lgbm-2.0",
            "created": datetime.now().isoformat(timespec="seconds"),
            "model": "LightGBM",
            "threshold": round(threshold, 2),
            "trees": booster.best_iteration,
            "train_size": len(train_rows),
            "test_size": len(test_rows),
            "metrics": main_metrics,
            "metrics_per_dataset": per_dataset,
            "cross_source": cross,
        }, f, indent=2)
    print(f"\nSaved: {MODEL_DIR}")


if __name__ == "__main__":
    main()
