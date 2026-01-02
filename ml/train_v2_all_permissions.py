#!/usr/bin/env python3
"""
Enhanced Malware Detection Model v2 - Uses ALL Permission Features
Trains on the full 173 permission features from the Mendeley dataset
"""

import os
import json
import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    classification_report, 
    confusion_matrix, 
    roc_auc_score,
    f1_score,
    precision_recall_curve
)

# ============================================================
# Configuration
# ============================================================
CONFIG = {
    'dataset_path': '../data/secondpaper dataset.xlsx',
    'output_dir': 'models_v2',
    'test_size': 0.20,
    'val_size': 0.15,
    'random_state': 42,
    'batch_size': 128,
    'epochs': 150,
    'early_stopping_patience': 20,
    'lr_reduction_patience': 10,
}


def print_header(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def load_dataset():
    """Load and combine both sheets from Excel file."""
    print_header("Loading Dataset")
    
    file_path = CONFIG['dataset_path']
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Dataset not found at: {file_path}")
    
    xl = pd.ExcelFile(file_path)
    print(f"   Found sheets: {xl.sheet_names}")
    
    all_dfs = []
    for sheet_name in xl.sheet_names:
        df = pd.read_excel(xl, sheet_name=sheet_name)
        # Label based on sheet name
        is_malware = 1 if 'malware' in sheet_name.lower() else 0
        df['is_malware'] = is_malware
        label = "MALWARE" if is_malware else "BENIGN"
        print(f"   ✓ Loaded '{sheet_name}': {len(df):,} {label} samples")
        all_dfs.append(df)
    
    combined_df = pd.concat(all_dfs, ignore_index=True)
    print(f"   ✓ Combined total: {len(combined_df):,} rows")
    
    return combined_df


def preprocess_data(df):
    """Preprocess the permission features."""
    print_header("Preprocessing Data")
    
    # Get permission columns (all columns except Package, Category, is_malware)
    exclude_cols = ['Package', 'Category', 'is_malware']
    permission_cols = [c for c in df.columns if c not in exclude_cols]
    
    print(f"   Total permission features: {len(permission_cols)}")
    
    # Extract features and labels
    X = df[permission_cols].values.astype(np.float32)
    y = df['is_malware'].values.astype(np.float32)
    
    # Check class distribution
    malware_count = int(y.sum())
    benign_count = len(y) - malware_count
    print(f"   Malware samples: {malware_count:,} ({malware_count/len(y)*100:.1f}%)")
    print(f"   Benign samples: {benign_count:,} ({benign_count/len(y)*100:.1f}%)")
    
    # Remove constant features (no variance)
    variances = np.var(X, axis=0)
    non_constant_mask = variances > 0.001
    X_filtered = X[:, non_constant_mask]
    filtered_cols = [permission_cols[i] for i in range(len(permission_cols)) if non_constant_mask[i]]
    
    removed_count = len(permission_cols) - len(filtered_cols)
    print(f"   ✓ Removed {removed_count} constant features")
    print(f"   ✓ Remaining features: {len(filtered_cols)}")
    
    return X_filtered, y, filtered_cols


def split_data(X, y):
    """Split into train/val/test sets."""
    print_header("Splitting Data")
    
    # First split: train+val / test
    X_temp, X_test, y_temp, y_test = train_test_split(
        X, y, 
        test_size=CONFIG['test_size'],
        random_state=CONFIG['random_state'],
        stratify=y
    )
    
    # Second split: train / val
    val_ratio = CONFIG['val_size'] / (1 - CONFIG['test_size'])
    X_train, X_val, y_train, y_val = train_test_split(
        X_temp, y_temp,
        test_size=val_ratio,
        random_state=CONFIG['random_state'],
        stratify=y_temp
    )
    
    print(f"   Training:   {len(X_train):,} samples")
    print(f"   Validation: {len(X_val):,} samples")
    print(f"   Test:       {len(X_test):,} samples")
    
    return X_train, X_val, X_test, y_train, y_val, y_test


def scale_features(X_train, X_val, X_test):
    """Scale features using StandardScaler."""
    print_header("Scaling Features")
    
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)
    X_test_scaled = scaler.transform(X_test)
    
    print("   ✓ Applied StandardScaler normalization")
    
    return X_train_scaled, X_val_scaled, X_test_scaled, scaler


def create_model(input_dim):
    """Create deeper neural network for better feature extraction."""
    print_header("Creating Model Architecture")
    
    model = keras.Sequential([
        # Input layer
        keras.layers.Input(shape=(input_dim,), name='input'),
        
        # First dense block - wider for capturing more patterns
        keras.layers.Dense(256, activation='relu', kernel_regularizer=keras.regularizers.l2(0.001)),
        keras.layers.BatchNormalization(),
        keras.layers.Dropout(0.4),
        
        # Second dense block
        keras.layers.Dense(128, activation='relu', kernel_regularizer=keras.regularizers.l2(0.001)),
        keras.layers.BatchNormalization(),
        keras.layers.Dropout(0.3),
        
        # Third dense block
        keras.layers.Dense(64, activation='relu', kernel_regularizer=keras.regularizers.l2(0.001)),
        keras.layers.BatchNormalization(),
        keras.layers.Dropout(0.2),
        
        # Fourth dense block
        keras.layers.Dense(32, activation='relu'),
        keras.layers.Dropout(0.1),
        
        # Output
        keras.layers.Dense(1, activation='sigmoid', name='output')
    ], name='malware_detector_v2')
    
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss='binary_crossentropy',
        metrics=[
            'accuracy',
            keras.metrics.AUC(name='auc'),
            keras.metrics.Precision(name='precision'),
            keras.metrics.Recall(name='recall')
        ]
    )
    
    model.summary()
    return model


def train_model(model, X_train, y_train, X_val, y_val):
    """Train the model with callbacks."""
    print_header("Training Model")
    
    # Calculate class weights to handle imbalance
    total = len(y_train)
    neg_count = len(y_train) - y_train.sum()
    pos_count = y_train.sum()
    
    class_weight = {
        0: total / (2 * neg_count),
        1: total / (2 * pos_count)
    }
    print(f"   Class weights: benign={class_weight[0]:.3f}, malware={class_weight[1]:.3f}")
    
    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor='val_auc',
            patience=CONFIG['early_stopping_patience'],
            restore_best_weights=True,
            mode='max',
            verbose=1
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_auc',
            factor=0.5,
            patience=CONFIG['lr_reduction_patience'],
            min_lr=1e-6,
            mode='max',
            verbose=1
        ),
        keras.callbacks.LearningRateScheduler(
            lambda epoch, lr: lr * 0.99  # Gentle decay
        )
    ]
    
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=CONFIG['epochs'],
        batch_size=CONFIG['batch_size'],
        class_weight=class_weight,
        callbacks=callbacks,
        verbose=1
    )
    
    return history


def evaluate_model(model, X_test, y_test):
    """Evaluate model and find optimal threshold."""
    print_header("Evaluating Model")
    
    # Get predictions
    y_pred_proba = model.predict(X_test, verbose=0).flatten()
    
    # Standard 0.5 threshold
    y_pred = (y_pred_proba >= 0.5).astype(int)
    
    # Calculate metrics
    accuracy = (y_pred == y_test).mean()
    auc = roc_auc_score(y_test, y_pred_proba)
    f1 = f1_score(y_test, y_pred)
    
    print(f"\n📊 Test Results (threshold=0.5):")
    print(f"   Accuracy:  {accuracy*100:.2f}%")
    print(f"   AUC:       {auc:.4f}")
    print(f"   F1 Score:  {f1:.4f}")
    
    # Classification report
    print(f"\n📋 Classification Report:")
    print(classification_report(y_test, y_pred, target_names=['Benign', 'Malware']))
    
    # Confusion matrix
    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()
    print(f"\n🔢 Confusion Matrix:")
    print(f"   TN: {tn:,}  FP: {fp:,}")
    print(f"   FN: {fn:,}  TP: {tp:,}")
    
    # Find optimal threshold
    precision, recall, thresholds = precision_recall_curve(y_test, y_pred_proba)
    f1_scores = 2 * (precision * recall) / (precision + recall + 1e-10)
    optimal_idx = np.argmax(f1_scores)
    optimal_threshold = thresholds[optimal_idx] if optimal_idx < len(thresholds) else 0.5
    optimal_f1 = f1_scores[optimal_idx]
    
    print(f"\n🎯 Optimal threshold: {optimal_threshold:.3f} (F1: {optimal_f1:.4f})")
    
    # Re-evaluate with optimal threshold
    y_pred_optimal = (y_pred_proba >= optimal_threshold).astype(int)
    accuracy_optimal = (y_pred_optimal == y_test).mean()
    f1_optimal = f1_score(y_test, y_pred_optimal)
    
    print(f"\n📊 With optimal threshold:")
    print(f"   Accuracy:  {accuracy_optimal*100:.2f}%")
    print(f"   F1 Score:  {f1_optimal:.4f}")
    
    return {
        'accuracy': float(accuracy),
        'auc': float(auc),
        'f1': float(f1),
        'optimal_threshold': float(optimal_threshold),
        'optimal_f1': float(optimal_f1)
    }


def export_models(model, feature_cols, scaler, metrics):
    """Export models in multiple formats."""
    print_header("Exporting Models")
    
    output_dir = CONFIG['output_dir']
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Save Keras model
    keras_path = os.path.join(output_dir, 'malware_detector_v2.keras')
    model.save(keras_path)
    print(f"   ✓ Keras model: {keras_path}")
    
    # 2. Convert to TFLite
    try:
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.target_spec.supported_types = [tf.float16]
        tflite_model = converter.convert()
        
        tflite_path = os.path.join(output_dir, 'malware_detector_v2.tflite')
        with open(tflite_path, 'wb') as f:
            f.write(tflite_model)
        
        size_kb = len(tflite_model) / 1024
        print(f"   ✓ TFLite model: {tflite_path} ({size_kb:.1f} KB)")
    except Exception as e:
        print(f"   ⚠ TFLite conversion failed: {e}")
    
    # 3. Export to TensorFlow.js
    try:
        import tensorflowjs as tfjs
        tfjs_path = os.path.join(output_dir, 'tfjs_model_v2')
        tfjs.converters.save_keras_model(model, tfjs_path)
        print(f"   ✓ TF.js model: {tfjs_path}")
    except Exception as e:
        print(f"   ⚠ TF.js conversion failed: {e}")
    
    # 4. Save metadata
    metadata = {
        'version': '2.0',
        'model_type': 'permissions_classifier',
        'features': feature_cols,
        'num_features': len(feature_cols),
        'scaler_mean': scaler.mean_.tolist(),
        'scaler_scale': scaler.scale_.tolist(),
        'metrics': metrics,
        'threshold': metrics.get('optimal_threshold', 0.5)
    }
    
    metadata_path = os.path.join(output_dir, 'model_metadata_v2.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"   ✓ Metadata: {metadata_path}")


def main():
    print("\n" + "="*60)
    print("  MALWARE DETECTOR V2 - ALL PERMISSIONS MODEL")
    print("="*60)
    
    # 1. Load data
    df = load_dataset()
    
    # 2. Preprocess
    X, y, feature_cols = preprocess_data(df)
    
    # 3. Split data
    X_train, X_val, X_test, y_train, y_val, y_test = split_data(X, y)
    
    # 4. Scale features
    X_train, X_val, X_test, scaler = scale_features(X_train, X_val, X_test)
    
    # 5. Create model
    model = create_model(X_train.shape[1])
    
    # 6. Train
    history = train_model(model, X_train, y_train, X_val, y_val)
    
    # 7. Evaluate
    metrics = evaluate_model(model, X_test, y_test)
    
    # 8. Export
    export_models(model, feature_cols, scaler, metrics)
    
    # Final summary
    print_header("Training Complete!")
    print(f"\n🎉 Model V2 trained successfully!")
    print(f"   Accuracy: {metrics['accuracy']*100:.2f}%")
    print(f"   AUC: {metrics['auc']:.4f}")
    print(f"   F1: {metrics['f1']:.4f}")
    print(f"\n📁 Output files in: {os.path.abspath(CONFIG['output_dir'])}")


if __name__ == '__main__':
    main()
