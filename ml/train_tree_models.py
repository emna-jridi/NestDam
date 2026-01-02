#!/usr/bin/env python3
"""
Tree-Based Model Training for Malware Detection
Compares XGBoost, LightGBM, Random Forest, and Logistic Regression
with feature selection and calibration
"""

import os
import json
import warnings
import numpy as np
import pandas as pd
from datetime import datetime

# Sklearn
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, roc_auc_score, f1_score, precision_score, recall_score,
    classification_report, confusion_matrix, precision_recall_curve
)
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_selection import mutual_info_classif, chi2, SelectKBest

# Tree models
import xgboost as xgb
import lightgbm as lgb

# For export
import joblib

warnings.filterwarnings('ignore')

# ============================================================
# Configuration
# ============================================================
CONFIG = {
    'dataset_path': '../data/secondpaper dataset.xlsx',
    'output_dir': 'models_v3',
    'test_size': 0.20,
    'val_size': 0.15,
    'random_state': 42,
    'cv_folds': 5,
    'top_k_features': 30,  # Number of top features to select
}


def print_header(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")


def print_subheader(title):
    print(f"\n--- {title} ---")


def load_dataset():
    """Load and combine both sheets from Excel file."""
    print_header("Loading Dataset")
    
    file_path = CONFIG['dataset_path']
    xl = pd.ExcelFile(file_path)
    
    all_dfs = []
    for sheet_name in xl.sheet_names:
        df = pd.read_excel(xl, sheet_name=sheet_name)
        is_malware = 1 if 'malware' in sheet_name.lower() else 0
        df['is_malware'] = is_malware
        label = "MALWARE" if is_malware else "BENIGN"
        print(f"   ✓ Loaded '{sheet_name}': {len(df):,} {label} samples")
        all_dfs.append(df)
    
    combined_df = pd.concat(all_dfs, ignore_index=True)
    print(f"   ✓ Combined total: {len(combined_df):,} rows")
    
    return combined_df


def preprocess_data(df):
    """Preprocess and split the data."""
    print_header("Preprocessing Data")
    
    # Get permission columns
    exclude_cols = ['Package', 'Category', 'is_malware']
    permission_cols = [c for c in df.columns if c not in exclude_cols]
    
    # Extract features and labels
    X = df[permission_cols].values.astype(np.float32)
    y = df['is_malware'].values.astype(np.int32)
    
    # Remove constant features
    variances = np.var(X, axis=0)
    non_constant_mask = variances > 0.001
    X = X[:, non_constant_mask]
    feature_names = [permission_cols[i] for i in range(len(permission_cols)) if non_constant_mask[i]]
    
    print(f"   Total features after removing constants: {len(feature_names)}")
    print(f"   Malware samples: {y.sum():,} ({y.mean()*100:.1f}%)")
    print(f"   Benign samples: {len(y) - y.sum():,} ({(1-y.mean())*100:.1f}%)")
    
    return X, y, feature_names


def split_data(X, y):
    """Split into train/val/test sets."""
    print_subheader("Splitting Data")
    
    # First split: train+val / test
    X_temp, X_test, y_temp, y_test = train_test_split(
        X, y, test_size=CONFIG['test_size'],
        random_state=CONFIG['random_state'], stratify=y
    )
    
    # Second split: train / val
    val_ratio = CONFIG['val_size'] / (1 - CONFIG['test_size'])
    X_train, X_val, y_train, y_val = train_test_split(
        X_temp, y_temp, test_size=val_ratio,
        random_state=CONFIG['random_state'], stratify=y_temp
    )
    
    print(f"   Training:   {len(X_train):,} samples")
    print(f"   Validation: {len(X_val):,} samples")
    print(f"   Test:       {len(X_test):,} samples")
    
    return X_train, X_val, X_test, y_train, y_val, y_test


def evaluate_model(model, X_test, y_test, model_name):
    """Evaluate a model and return metrics."""
    # Predictions
    y_pred = model.predict(X_test)
    
    # Probabilities
    if hasattr(model, 'predict_proba'):
        y_proba = model.predict_proba(X_test)[:, 1]
    else:
        y_proba = y_pred.astype(float)
    
    # Metrics
    accuracy = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_proba)
    f1 = f1_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)
    
    # Find optimal threshold
    precisions, recalls, thresholds = precision_recall_curve(y_test, y_proba)
    f1_scores = 2 * (precisions * recalls) / (precisions + recalls + 1e-10)
    optimal_idx = np.argmax(f1_scores)
    optimal_threshold = thresholds[optimal_idx] if optimal_idx < len(thresholds) else 0.5
    optimal_f1 = f1_scores[optimal_idx]
    
    # Confusion matrix
    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()
    
    return {
        'name': model_name,
        'accuracy': accuracy,
        'auc': auc,
        'f1': f1,
        'precision': precision,
        'recall': recall,
        'optimal_threshold': optimal_threshold,
        'optimal_f1': optimal_f1,
        'tn': tn, 'fp': fp, 'fn': fn, 'tp': tp
    }


def train_xgboost(X_train, y_train, X_val, y_val):
    """Train XGBoost classifier."""
    print_subheader("Training XGBoost")
    
    # Calculate scale_pos_weight for imbalanced data
    scale_pos_weight = (len(y_train) - y_train.sum()) / y_train.sum()
    
    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        random_state=CONFIG['random_state'],
        eval_metric='auc',
        early_stopping_rounds=20,
        verbosity=0
    )
    
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False
    )
    
    print(f"   ✓ XGBoost trained (best iteration: {model.best_iteration})")
    return model


def train_lightgbm(X_train, y_train, X_val, y_val):
    """Train LightGBM classifier."""
    print_subheader("Training LightGBM")
    
    # Calculate scale_pos_weight
    scale_pos_weight = (len(y_train) - y_train.sum()) / y_train.sum()
    
    model = lgb.LGBMClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        random_state=CONFIG['random_state'],
        verbosity=-1
    )
    
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        callbacks=[lgb.early_stopping(20, verbose=False)]
    )
    
    print(f"   ✓ LightGBM trained")
    return model


def train_random_forest(X_train, y_train):
    """Train Random Forest classifier."""
    print_subheader("Training Random Forest")
    
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight='balanced',
        random_state=CONFIG['random_state'],
        n_jobs=-1
    )
    
    model.fit(X_train, y_train)
    print(f"   ✓ Random Forest trained (200 trees)")
    return model


def train_logistic_regression(X_train, y_train):
    """Train Logistic Regression with L1 penalty."""
    print_subheader("Training Logistic Regression (L1)")
    
    # Scale features for logistic regression
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    
    model = LogisticRegression(
        penalty='l1',
        solver='saga',
        C=1.0,
        class_weight='balanced',
        max_iter=1000,
        random_state=CONFIG['random_state']
    )
    
    model.fit(X_train_scaled, y_train)
    
    # Count non-zero coefficients
    non_zero = np.sum(model.coef_ != 0)
    print(f"   ✓ Logistic Regression trained (non-zero features: {non_zero})")
    
    return model, scaler


def analyze_feature_importance(models, feature_names, X_train, y_train):
    """Analyze feature importance from multiple methods."""
    print_header("Feature Importance Analysis")
    
    importance_df = pd.DataFrame({'feature': feature_names})
    
    # 1. XGBoost importance
    if 'xgboost' in models:
        xgb_imp = models['xgboost'].feature_importances_
        importance_df['xgboost'] = xgb_imp
        print_subheader("XGBoost Top 10")
        top_xgb = sorted(zip(feature_names, xgb_imp), key=lambda x: x[1], reverse=True)[:10]
        for name, imp in top_xgb:
            print(f"   {name[:50]:50s} | {imp:.4f}")
    
    # 2. LightGBM importance
    if 'lightgbm' in models:
        lgb_imp = models['lightgbm'].feature_importances_
        importance_df['lightgbm'] = lgb_imp
    
    # 3. Random Forest importance
    if 'random_forest' in models:
        rf_imp = models['random_forest'].feature_importances_
        importance_df['random_forest'] = rf_imp
        print_subheader("Random Forest Top 10")
        top_rf = sorted(zip(feature_names, rf_imp), key=lambda x: x[1], reverse=True)[:10]
        for name, imp in top_rf:
            print(f"   {name[:50]:50s} | {imp:.4f}")
    
    # 4. Logistic Regression coefficients (absolute)
    if 'logistic_regression' in models:
        lr_coef = np.abs(models['logistic_regression'].coef_[0])
        importance_df['logistic_regression'] = lr_coef
    
    # 5. Mutual Information
    print_subheader("Computing Mutual Information")
    mi_scores = mutual_info_classif(X_train, y_train, random_state=CONFIG['random_state'])
    importance_df['mutual_info'] = mi_scores
    
    top_mi = sorted(zip(feature_names, mi_scores), key=lambda x: x[1], reverse=True)[:10]
    print("   Top 10 by Mutual Information:")
    for name, score in top_mi:
        print(f"   {name[:50]:50s} | {score:.4f}")
    
    # 6. Chi-squared (for non-negative features)
    print_subheader("Computing Chi² Scores")
    X_train_pos = np.abs(X_train)  # Ensure non-negative
    chi2_scores, _ = chi2(X_train_pos, y_train)
    importance_df['chi2'] = chi2_scores
    
    # Aggregate importance (normalized mean)
    numeric_cols = [c for c in importance_df.columns if c != 'feature']
    for col in numeric_cols:
        importance_df[col] = importance_df[col] / (importance_df[col].max() + 1e-10)
    
    importance_df['aggregate'] = importance_df[numeric_cols].mean(axis=1)
    importance_df = importance_df.sort_values('aggregate', ascending=False)
    
    return importance_df


def select_top_features(importance_df, k=30):
    """Select top K features based on aggregate importance."""
    print_header(f"Selecting Top {k} Features")
    
    top_features = importance_df.head(k)['feature'].tolist()
    
    print(f"\n   Selected {len(top_features)} most important features:")
    for i, feat in enumerate(top_features[:15], 1):
        print(f"   {i:2d}. {feat[:55]}")
    if len(top_features) > 15:
        print(f"   ... and {len(top_features) - 15} more")
    
    return top_features


def calibrate_model(X_train, y_train, X_val, y_val, method='isotonic'):
    """Calibrate model probabilities using cross-validation with fresh model."""
    print_subheader(f"Calibrating model ({method})")
    
    # Calculate scale_pos_weight for imbalanced data
    y_combined = np.concatenate([y_train, y_val])
    scale_pos_weight = (len(y_combined) - y_combined.sum()) / y_combined.sum()
    
    # Create a fresh XGBoost without early stopping for calibration
    base_model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        random_state=CONFIG['random_state'],
        verbosity=0
    )
    
    # Use cv=3 for calibration with combined data
    calibrated = CalibratedClassifierCV(
        estimator=base_model, 
        method=method, 
        cv=3
    )
    
    # Fit on training + validation combined
    X_combined = np.vstack([X_train, X_val])
    calibrated.fit(X_combined, y_combined)
    
    print(f"   ✓ Calibration applied")
    return calibrated


def compare_models(results):
    """Print comparison table of all models."""
    print_header("Model Comparison")
    
    # Sort by AUC
    results_sorted = sorted(results, key=lambda x: x['auc'], reverse=True)
    
    print(f"\n   {'Model':<25} {'Accuracy':>10} {'AUC':>10} {'F1':>10} {'Precision':>10} {'Recall':>10}")
    print("   " + "-" * 77)
    
    for r in results_sorted:
        print(f"   {r['name']:<25} {r['accuracy']*100:>9.2f}% {r['auc']:>10.4f} {r['f1']:>10.4f} {r['precision']:>10.4f} {r['recall']:>10.4f}")
    
    print("\n   Confusion Matrices:")
    for r in results_sorted:
        print(f"\n   {r['name']}:")
        print(f"   TN: {r['tn']:,}  FP: {r['fp']:,}")
        print(f"   FN: {r['fn']:,}  TP: {r['tp']:,}")
    
    # Winner
    winner = results_sorted[0]
    print(f"\n   🏆 BEST MODEL: {winner['name']} (AUC: {winner['auc']:.4f})")
    
    return winner


def export_best_model(model, scaler, feature_names, metrics, output_dir):
    """Export the best model and metadata."""
    print_header("Exporting Best Model")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Save model
    model_path = os.path.join(output_dir, 'best_model.joblib')
    joblib.dump(model, model_path)
    print(f"   ✓ Model saved: {model_path}")
    
    # 2. Save scaler if exists
    if scaler is not None:
        scaler_path = os.path.join(output_dir, 'scaler.joblib')
        joblib.dump(scaler, scaler_path)
        print(f"   ✓ Scaler saved: {scaler_path}")
    
    # 3. Save metadata
    metadata = {
        'version': '3.0',
        'model_type': metrics['name'],
        'created': datetime.now().isoformat(),
        'features': feature_names,
        'num_features': len(feature_names),
        'metrics': {
            'accuracy': float(metrics['accuracy']),
            'auc': float(metrics['auc']),
            'f1': float(metrics['f1']),
            'precision': float(metrics['precision']),
            'recall': float(metrics['recall']),
            'optimal_threshold': float(metrics['optimal_threshold']),
            'optimal_f1': float(metrics['optimal_f1'])
        },
        'confusion_matrix': {
            'tn': int(metrics['tn']),
            'fp': int(metrics['fp']),
            'fn': int(metrics['fn']),
            'tp': int(metrics['tp'])
        }
    }
    
    metadata_path = os.path.join(output_dir, 'model_metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"   ✓ Metadata saved: {metadata_path}")
    
    # 4. Save feature names
    features_path = os.path.join(output_dir, 'features.json')
    with open(features_path, 'w') as f:
        json.dump(feature_names, f, indent=2)
    print(f"   ✓ Features saved: {features_path}")


def main():
    print("\n" + "=" * 70)
    print("  TREE-BASED MODEL TRAINING FOR MALWARE DETECTION")
    print("  Comparing XGBoost, LightGBM, Random Forest, Logistic Regression")
    print("=" * 70)
    
    # 1. Load data
    df = load_dataset()
    
    # 2. Preprocess
    X, y, feature_names = preprocess_data(df)
    
    # 3. Split
    X_train, X_val, X_test, y_train, y_val, y_test = split_data(X, y)
    
    # 4. Train all models
    print_header("Training All Models")
    
    models = {}
    scalers = {}
    
    # XGBoost
    models['xgboost'] = train_xgboost(X_train, y_train, X_val, y_val)
    
    # LightGBM
    models['lightgbm'] = train_lightgbm(X_train, y_train, X_val, y_val)
    
    # Random Forest
    models['random_forest'] = train_random_forest(X_train, y_train)
    
    # Logistic Regression (needs scaled data)
    models['logistic_regression'], scalers['logistic_regression'] = train_logistic_regression(X_train, y_train)
    
    # 5. Evaluate all models
    print_header("Evaluating Models on Test Set")
    
    results = []
    
    # XGBoost
    results.append(evaluate_model(models['xgboost'], X_test, y_test, 'XGBoost'))
    
    # LightGBM
    results.append(evaluate_model(models['lightgbm'], X_test, y_test, 'LightGBM'))
    
    # Random Forest
    results.append(evaluate_model(models['random_forest'], X_test, y_test, 'Random Forest'))
    
    # Logistic Regression (scale test data)
    X_test_scaled = scalers['logistic_regression'].transform(X_test)
    results.append(evaluate_model(models['logistic_regression'], X_test_scaled, y_test, 'Logistic Regression (L1)'))
    
    # 6. Compare models
    winner = compare_models(results)
    
    # 7. Feature importance analysis
    importance_df = analyze_feature_importance(models, feature_names, X_train, y_train)
    
    # 8. Select top features
    top_features = select_top_features(importance_df, k=CONFIG['top_k_features'])
    top_feature_indices = [feature_names.index(f) for f in top_features]
    
    # 9. Retrain best model with selected features
    print_header("Retraining Best Model with Selected Features")
    
    X_train_selected = X_train[:, top_feature_indices]
    X_val_selected = X_val[:, top_feature_indices]
    X_test_selected = X_test[:, top_feature_indices]
    
    # Retrain XGBoost with selected features
    best_model_selected = train_xgboost(X_train_selected, y_train, X_val_selected, y_val)
    
    # Evaluate
    result_selected = evaluate_model(best_model_selected, X_test_selected, y_test, 'XGBoost (Selected Features)')
    print(f"\n   Selected features model:")
    print(f"   Accuracy: {result_selected['accuracy']*100:.2f}%")
    print(f"   AUC: {result_selected['auc']:.4f}")
    print(f"   F1: {result_selected['f1']:.4f}")
    
    # 10. Calibrate best model
    print_header("Calibrating Best Model")
    
    calibrated_model = calibrate_model(X_train_selected, y_train, X_val_selected, y_val, method='isotonic')
    result_calibrated = evaluate_model(calibrated_model, X_test_selected, y_test, 'XGBoost (Calibrated)')
    
    print(f"\n   Calibrated model:")
    print(f"   Accuracy: {result_calibrated['accuracy']*100:.2f}%")
    print(f"   AUC: {result_calibrated['auc']:.4f}")
    print(f"   F1: {result_calibrated['f1']:.4f}")
    
    # 11. Final comparison
    print_header("Final Comparison")
    all_results = results + [result_selected, result_calibrated]
    final_winner = compare_models(all_results)
    
    # 12. Export best model
    # Choose the best between calibrated and selected
    if result_calibrated['auc'] >= result_selected['auc']:
        export_model = calibrated_model
        export_metrics = result_calibrated
        export_scaler = None  # XGBoost doesn't need scaler
    else:
        export_model = best_model_selected
        export_metrics = result_selected
        export_scaler = None
    
    export_best_model(export_model, export_scaler, top_features, export_metrics, CONFIG['output_dir'])
    
    # Save importance analysis
    importance_path = os.path.join(CONFIG['output_dir'], 'feature_importance.csv')
    importance_df.to_csv(importance_path, index=False)
    print(f"   ✓ Feature importance saved: {importance_path}")
    
    # Final summary
    print_header("Training Complete!")
    print(f"\n   🎉 Best model: {export_metrics['name']}")
    print(f"   📊 Accuracy: {export_metrics['accuracy']*100:.2f}%")
    print(f"   📊 AUC: {export_metrics['auc']:.4f}")
    print(f"   📊 F1: {export_metrics['f1']:.4f}")
    print(f"   📊 Features: {len(top_features)}")
    print(f"\n   📁 Output directory: {os.path.abspath(CONFIG['output_dir'])}")


if __name__ == '__main__':
    main()
