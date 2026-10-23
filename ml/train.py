#!/usr/bin/env python3
"""
Train the LightGBM malware model on features.jsonl built by build_features.py.

Steps:
    1. Load one or more datasets (folders under ml/data/), drop duplicate APKs
    2. Vocabulary = tokens seen in >= MIN_APPS apps (rare tokens don't generalize)
    3. Stratified split: 70% train / 10% validation (early stopping + threshold) / 20% test
    4. Report test AUC / precision / recall, per source, and top features
    5. Optional --cross: train on one dataset, test on the other (real generalization check)

Usage:
    py -3.12 ml/train.py open androzoo           # train + save the model
    py -3.12 ml/train.py open androzoo --cross   # also run the cross-dataset check

Output (loaded by the scan endpoint): NestDam/models/lightgbm/
    model.txt       LightGBM booster
    features.json   ordered feature names (tokens, then numeric)
    metadata.json   threshold, metrics, dataset sizes
"""

import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone

import lightgbm as lgb
import numpy as np
from scipy.sparse import csr_matrix, hstack
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

from extractor import keep_token

ML_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ML_DIR, "..", "models", "lightgbm")

MIN_APPS = 10
SEED = 42
NUMERIC = ["activities", "services", "receivers", "providers", "num_permissions",
           "num_dex", "native_libs", "min_sdk", "target_sdk", "num_files"]
PARAMS = {
    "objective": "binary",
    "metric": "auc",
    "learning_rate": 0.05,
    "num_leaves": 63,
    "min_data_in_leaf": 20,
    "feature_fraction": 0.5,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "lambda_l2": 1.0,
    "seed": SEED,
    "verbose": -1,
}


def load(datasets: list[str]) -> list[dict]:
    rows, seen = [], set()
    for name in datasets:
        path = os.path.join(ML_DIR, "data", name, "features.jsonl")
        with open(path, encoding="utf-8") as f:
            for line in f:
                r = json.loads(line)
                if r["sha256"].lower() in seen:
                    continue
                seen.add(r["sha256"].lower())
                r["tokens"] = [t for t in r["tokens"] if keep_token(t)]
                r["dataset"] = name
                r.setdefault("source", name)
                rows.append(r)
    return rows


def build_vocab(rows: list[dict]) -> list[str]:
    df = Counter(t for r in rows for t in set(r["tokens"]))
    return sorted(t for t, n in df.items() if n >= MIN_APPS)


def vectorize(rows: list[dict], vocab: list[str]):
    index = {t: i for i, t in enumerate(vocab)}
    data, cols, ptr = [], [], [0]
    for r in rows:
        ids = sorted({index[t] for t in r["tokens"] if t in index})
        cols.extend(ids)
        data.extend([1.0] * len(ids))
        ptr.append(len(cols))
    tokens = csr_matrix((data, cols, ptr), shape=(len(rows), len(vocab)), dtype=np.float32)
    numeric = csr_matrix(np.array([[r["numeric"].get(k, 0) for k in NUMERIC] for r in rows], dtype=np.float32))
    y = np.array([1 if r["label"] == "malware" else 0 for r in rows])
    return hstack([tokens, numeric]).tocsr(), y


def fit(x_train, y_train, x_val, y_val, names) -> lgb.Booster:
    params = {**PARAMS, "scale_pos_weight": (y_train == 0).sum() / max((y_train == 1).sum(), 1)}
    train_set = lgb.Dataset(x_train, y_train, feature_name=names)
    val_set = lgb.Dataset(x_val, y_val, reference=train_set)
    return lgb.train(params, train_set, num_boost_round=3000, valid_sets=[val_set],
                     callbacks=[lgb.early_stopping(100, verbose=False)])


def best_threshold(y_true, scores) -> float:
    candidates = np.linspace(0.05, 0.95, 91)
    return float(max(candidates, key=lambda t: f1_score(y_true, scores >= t)))


def report(title: str, y_true, scores, threshold: float) -> dict:
    pred = scores >= threshold
    tn, fp, fn, tp = confusion_matrix(y_true, pred, labels=[0, 1]).ravel()
    metrics = {
        "auc": round(float(roc_auc_score(y_true, scores)), 4) if len(set(y_true)) > 1 else None,
        "precision": round(float(precision_score(y_true, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, pred, zero_division=0)), 4),
        "false_positive_rate": round(float(fp / max(fp + tn, 1)), 4),
    }
    print(f"\n{title}")
    print(f"  AUC {metrics['auc']} | precision {metrics['precision']} | recall {metrics['recall']} "
          f"| F1 {metrics['f1']} | false positives {metrics['false_positive_rate']:.1%}")
    print(f"  confusion: TN {tn}  FP {fp}  FN {fn}  TP {tp}")
    return metrics


def per_source(rows, scores, threshold):
    """Accuracy per (label, source): a big gap means the model learned the source, not the behavior."""
    groups = Counter((r["label"], r["source"]) for r in rows)
    print("\n  per source (share classified correctly):")
    for (label, source), n in sorted(groups.items()):
        idx = [i for i, r in enumerate(rows) if r["label"] == label and r["source"] == source]
        correct = np.mean([(scores[i] >= threshold) == (label == "malware") for i in idx])
        print(f"    {label:8} {source:14} n={n:5}  {correct:.1%}")


def cross_check(rows: list[dict], datasets: list[str]) -> None:
    for train_name in datasets:
        test_name = next(d for d in datasets if d != train_name)
        tr = [r for r in rows if r["dataset"] == train_name]
        te = [r for r in rows if r["dataset"] == test_name]
        vocab = build_vocab(tr)
        names = vocab + NUMERIC
        x, y = vectorize(tr, vocab)
        x_tr, x_val, y_tr, y_val = train_test_split(x, y, test_size=0.15, stratify=y, random_state=SEED)
        model = fit(x_tr, y_tr, x_val, y_val, [f"f{i}" for i in range(len(names))])
        threshold = best_threshold(y_val, model.predict(x_val))
        x_te, y_te = vectorize(te, vocab)
        report(f"CROSS: train on {train_name} -> test on {test_name}", y_te, model.predict(x_te), threshold)


def main(datasets: list[str], cross: bool) -> None:
    rows = load(datasets)
    print("Loaded:", dict(Counter((r["label"], r["source"]) for r in rows)))

    labels = np.array([r["label"] for r in rows])
    strata = [f"{r['label']}|{r['source']}" for r in rows]
    idx = np.arange(len(rows))
    idx_trainval, idx_test = train_test_split(idx, test_size=0.2, stratify=strata, random_state=SEED)
    idx_train, idx_val = train_test_split(idx_trainval, test_size=0.125, stratify=labels[idx_trainval],
                                          random_state=SEED)

    train_rows = [rows[i] for i in idx_train]
    vocab = build_vocab(train_rows)  # vocabulary from train only: no peeking at the test set
    names = vocab + NUMERIC
    print(f"Vocabulary: {len(vocab)} tokens (seen in >= {MIN_APPS} apps) + {len(NUMERIC)} numeric")

    x_train, y_train = vectorize(train_rows, vocab)
    x_val, y_val = vectorize([rows[i] for i in idx_val], vocab)
    test_rows = [rows[i] for i in idx_test]
    x_test, y_test = vectorize(test_rows, vocab)

    safe_names = [f"f{i}" for i in range(len(names))]  # LightGBM rejects ':' and '/' in names
    model = fit(x_train, y_train, x_val, y_val, safe_names)
    threshold = best_threshold(y_val, model.predict(x_val))
    print(f"Trees: {model.best_iteration} | threshold (best F1 on validation): {threshold:.2f}")

    scores = model.predict(x_test)
    metrics = report(f"TEST ({len(test_rows)} held-out APKs)", y_test, scores, threshold)
    if len({r['source'] for r in rows}) > 1:
        per_source(test_rows, scores, threshold)

    gain = model.feature_importance("gain")
    print("\n  top 15 features (gain):")
    for i in np.argsort(gain)[::-1][:15]:
        print(f"    {gain[i]:10.0f}  {names[i]}")

    if cross and len(datasets) == 2:
        cross_check(rows, datasets)

    os.makedirs(OUT_DIR, exist_ok=True)
    model.save_model(os.path.join(OUT_DIR, "model.txt"), num_iteration=model.best_iteration)
    with open(os.path.join(OUT_DIR, "features.json"), "w", encoding="utf-8") as f:
        json.dump({"tokens": vocab, "numeric": NUMERIC}, f)
    with open(os.path.join(OUT_DIR, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump({
            "version": f"lgbm-{datetime.now(timezone.utc):%Y%m%d}",
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "datasets": datasets,
            "samples": dict(Counter(f"{r['label']}|{r['source']}" for r in rows)),
            "threshold": threshold,
            "test_metrics": metrics,
            "min_apps": MIN_APPS,
        }, f, indent=2)
    print(f"\nSaved model to {os.path.normpath(OUT_DIR)}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    main(args, "--cross" in sys.argv)
