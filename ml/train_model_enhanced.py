"""
Enhanced ML Training Pipeline - Real Malware Dataset Support
============================================================
Trains neural network model using real APK features or synthetic data.

Supports:
- Training with real malware datasets (from CSV extracted features)
- Fallback to synthetic data if real data unavailable
- Model validation and cross-validation
- Feature importance analysis
- Multiple export formats (Keras, TFLite, TF.js)

Usage:
    # With real data
    python train_model_enhanced.py --features features.csv --real-data

    # With synthetic data (default)
    python train_model_enhanced.py

    # With validation
    python train_model_enhanced.py --features features.csv --cross-val 5
"""

import os
import json
import numpy as np
import pandas as pd
import tensorflow as tf
import argparse
from datetime import datetime
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, roc_curve
import matplotlib.pyplot as plt
import seaborn as sns

# ============================================================================
# CONFIGURATION
# ============================================================================

FEATURE_NAMES = [
    'dangerous_permissions',
    'internet_permission',
    'min_sdk_version',
    'activities_count',
    'services_count',
    'receivers_count',
    'providers_count',
    'exported_components',
    'intent_filters_count',
    'uses_native_code',
    'has_reflection',
    'obfuscation_score',
]

NUM_FEATURES = len(FEATURE_NAMES)
MODEL_VERSION = '2.1.0'
OUTPUT_DIR = 'models'

# ============================================================================
# SYNTHETIC DATA GENERATION
# ============================================================================

def generate_synthetic_data(n_samples=10000, malware_ratio=0.3):
    """Generate synthetic training data as fallback"""
    np.random.seed(42)
    
    n_malware = int(n_samples * malware_ratio)
    n_benign = n_samples - n_malware
    
    print(f"  Generating {n_samples} synthetic samples...")
    print(f"    - Benign: {n_benign}")
    print(f"    - Malware: {n_malware}")
    
    # Benign apps
    benign_data = {
        'dangerous_permissions': np.random.beta(2, 5, n_benign),
        'internet_permission': np.random.binomial(1, 0.7, n_benign),
        'min_sdk_version': np.random.beta(5, 2, n_benign),
        'activities_count': np.random.beta(3, 3, n_benign),
        'services_count': np.random.beta(2, 4, n_benign),
        'receivers_count': np.random.beta(2, 4, n_benign),
        'providers_count': np.random.beta(1, 5, n_benign),
        'exported_components': np.random.beta(2, 5, n_benign),
        'intent_filters_count': np.random.beta(3, 3, n_benign),
        'uses_native_code': np.random.binomial(1, 0.2, n_benign),
        'has_reflection': np.random.binomial(1, 0.15, n_benign),
        'obfuscation_score': np.random.beta(2, 5, n_benign),
        'is_malware': np.zeros(n_benign)
    }
    
    # Malware
    malware_data = {
        'dangerous_permissions': np.random.beta(5, 2, n_malware),
        'internet_permission': np.random.binomial(1, 0.95, n_malware),
        'min_sdk_version': np.random.beta(2, 4, n_malware),
        'activities_count': np.random.beta(2, 3, n_malware),
        'services_count': np.random.beta(4, 2, n_malware),
        'receivers_count': np.random.beta(4, 2, n_malware),
        'providers_count': np.random.beta(3, 3, n_malware),
        'exported_components': np.random.beta(4, 2, n_malware),
        'intent_filters_count': np.random.beta(4, 2, n_malware),
        'uses_native_code': np.random.binomial(1, 0.6, n_malware),
        'has_reflection': np.random.binomial(1, 0.7, n_malware),
        'obfuscation_score': np.random.beta(5, 2, n_malware),
        'is_malware': np.ones(n_malware)
    }
    
    benign_df = pd.DataFrame(benign_data)
    malware_df = pd.DataFrame(malware_data)
    df = pd.concat([benign_df, malware_df], ignore_index=True)
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    
    return df

def load_real_data(csv_path):
    """Load features extracted from real APKs"""
    print(f"  Loading real data from: {csv_path}")
    
    df = pd.read_csv(csv_path)
    
    # Rename is_malware to match our format
    if 'is_malware' not in df.columns:
        if 'label' in df.columns:
            df.rename(columns={'label': 'is_malware'}, inplace=True)
    
    # Remove any APK file references
    if 'apk_file' in df.columns:
        df.drop(columns=['apk_file'], inplace=True)
    
    # Ensure all required features are present
    for feat in FEATURE_NAMES:
        if feat not in df.columns:
            print(f"  Warning: Missing feature '{feat}', using zeros")
            df[feat] = 0.0
    
    # Keep only required columns
    df = df[FEATURE_NAMES + ['is_malware']]
    
    # Remove duplicates
    df = df.drop_duplicates()
    
    # Remove rows with NaN values
    df = df.dropna()
    
    print(f"  Total samples: {len(df)}")
    print(f"    - Benign: {(df['is_malware'] == 0).sum()}")
    print(f"    - Malware: {(df['is_malware'] == 1).sum()}")
    
    return df

# ============================================================================
# MODEL ARCHITECTURE
# ============================================================================

def create_model(input_shape):
    """Create neural network model"""
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=input_shape, name='features_input'),
        
        # Layer 1
        tf.keras.layers.Dense(64, activation='relu', name='dense_1'),
        tf.keras.layers.BatchNormalization(name='bn_1'),
        tf.keras.layers.Dropout(0.3, name='dropout_1'),
        
        # Layer 2
        tf.keras.layers.Dense(32, activation='relu', name='dense_2'),
        tf.keras.layers.BatchNormalization(name='bn_2'),
        tf.keras.layers.Dropout(0.2, name='dropout_2'),
        
        # Layer 3
        tf.keras.layers.Dense(16, activation='relu', name='dense_3'),
        
        # Output
        tf.keras.layers.Dense(1, activation='sigmoid', name='output')
    ])
    
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss='binary_crossentropy',
        metrics=[
            'accuracy',
            tf.keras.metrics.AUC(name='auc'),
            tf.keras.metrics.Precision(name='precision'),
            tf.keras.metrics.Recall(name='recall')
        ]
    )
    
    return model

# ============================================================================
# TRAINING PIPELINE
# ============================================================================

def train_model(features_csv=None, use_real_data=False, cross_val_folds=None):
    """Main training pipeline"""
    
    print("\n" + "=" * 70)
    print("ShadowGuard ML Training Pipeline - Enhanced (Real Malware Support)")
    print("=" * 70)
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(os.path.join(OUTPUT_DIR, 'tfjs_model'), exist_ok=True)
    
    # ========== STEP 1: Load Data ==========
    print("\n[1/7] Loading training data...")
    
    if use_real_data and features_csv and os.path.exists(features_csv):
        print("  ℹ Using REAL malware dataset")
        df = load_real_data(features_csv)
    else:
        print("  ℹ Using synthetic data")
        df = generate_synthetic_data(n_samples=10000, malware_ratio=0.3)
    
    # ========== STEP 2: Prepare Features ==========
    print("\n[2/7] Preparing features...")
    
    X = df[FEATURE_NAMES].values
    y = df['is_malware'].values
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    print(f"  Training samples: {len(X_train)}")
    print(f"  Test samples: {len(X_test)}")
    print(f"  Features per sample: {NUM_FEATURES}")
    
    # ========== STEP 3: Create Model ==========
    print("\n[3/7] Creating model architecture...")
    
    model = create_model(input_shape=(NUM_FEATURES,))
    print("  Model summary:")
    model.summary()
    
    # ========== STEP 4: Train Model ==========
    print("\n[4/7] Training model...")
    
    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor='val_auc',
            patience=15,
            restore_best_weights=True,
            mode='max',
            verbose=1
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=7,
            min_lr=0.00001,
            verbose=1
        )
    ]
    
    history = model.fit(
        X_train_scaled, y_train,
        validation_split=0.2,
        epochs=150,
        batch_size=32,
        callbacks=callbacks,
        verbose=1
    )
    
    # ========== STEP 5: Evaluate Model ==========
    print("\n[5/7] Evaluating model...")
    
    test_results = model.evaluate(X_test_scaled, y_test, verbose=0)
    print(f"\n  Test Set Results:")
    print(f"  - Accuracy:  {test_results[1]*100:6.2f}%")
    print(f"  - AUC:       {test_results[2]:6.4f}")
    print(f"  - Precision: {test_results[3]*100:6.2f}%")
    print(f"  - Recall:    {test_results[4]*100:6.2f}%")
    
    # Predictions and detailed metrics
    y_pred_prob = model.predict(X_test_scaled, verbose=0)
    y_pred = (y_pred_prob > 0.5).astype(int)
    
    print("\n  Classification Report:")
    print(classification_report(y_test, y_pred, target_names=['Benign', 'Malware']))
    
    # ROC AUC
    roc_auc = roc_auc_score(y_test, y_pred_prob)
    print(f"  ROC AUC Score: {roc_auc:.4f}")
    
    # ========== STEP 6: Cross-Validation (Optional) ==========
    if cross_val_folds:
        print(f"\n[6/7] Performing {cross_val_folds}-Fold Cross-Validation...")
        
        kfold = StratifiedKFold(n_splits=cross_val_folds, shuffle=True, random_state=42)
        cv_scores = []
        
        for fold, (train_idx, val_idx) in enumerate(kfold.split(X, y), 1):
            print(f"  Fold {fold}/{cross_val_folds}...")
            
            X_train_cv = X[train_idx]
            X_val_cv = X[val_idx]
            y_train_cv = y[train_idx]
            y_val_cv = y[val_idx]
            
            scaler_cv = StandardScaler()
            X_train_cv = scaler_cv.fit_transform(X_train_cv)
            X_val_cv = scaler_cv.transform(X_val_cv)
            
            model_cv = create_model(input_shape=(NUM_FEATURES,))
            model_cv.fit(
                X_train_cv, y_train_cv,
                epochs=50,
                batch_size=32,
                verbose=0,
                validation_data=(X_val_cv, y_val_cv)
            )
            
            _, acc, auc, _, _ = model_cv.evaluate(X_val_cv, y_val_cv, verbose=0)
            cv_scores.append({'accuracy': acc, 'auc': auc})
            print(f"    Accuracy: {acc*100:.2f}%, AUC: {auc:.4f}")
        
        print(f"\n  Cross-Validation Results:")
        print(f"  - Mean Accuracy: {np.mean([s['accuracy'] for s in cv_scores])*100:.2f}%")
        print(f"  - Mean AUC:      {np.mean([s['auc'] for s in cv_scores]):.4f}")
    
    # ========== STEP 7: Export Models ==========
    print(f"\n[7/7] Exporting models...")
    
    # Save Keras model
    keras_path = os.path.join(OUTPUT_DIR, 'malware_detector.keras')
    model.save(keras_path)
    print(f"  ✓ Keras model: {keras_path}")
    
    # Convert to TFLite
    print("\n  Converting to TensorFlow Lite...")
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.target_spec.supported_types = [tf.float16]
    tflite_model = converter.convert()
    
    tflite_path = os.path.join(OUTPUT_DIR, 'malware_detector.tflite')
    with open(tflite_path, 'wb') as f:
        f.write(tflite_model)
    tflite_size = os.path.getsize(tflite_path) / 1024
    print(f"  ✓ TFLite model: {tflite_path} ({tflite_size:.1f} KB)")
    
    # Convert to TF.js
    print("\n  Converting to TensorFlow.js...")
    import subprocess
    tfjs_path = os.path.join(OUTPUT_DIR, 'tfjs_model')
    try:
        subprocess.run([
            'tensorflowjs_converter',
            '--input_format=keras',
            keras_path,
            tfjs_path
        ], check=True, capture_output=True)
        print(f"  ✓ TF.js model: {tfjs_path}/")
    except Exception as e:
        print(f"  ⚠ TF.js conversion failed (install tensorflowjs if needed)")
    
    # Save metadata
    metadata = {
        'version': MODEL_VERSION,
        'created_at': datetime.now().isoformat(),
        'data_source': 'real_malware' if (use_real_data and features_csv) else 'synthetic',
        'features': FEATURE_NAMES,
        'num_features': NUM_FEATURES,
        'scaler': {
            'mean': scaler.mean_.tolist(),
            'scale': scaler.scale_.tolist()
        },
        'thresholds': {
            'low': 0.35,
            'medium': 0.65,
            'high': 0.85
        },
        'metrics': {
            'accuracy': float(test_results[1]),
            'auc': float(test_results[2]),
            'precision': float(test_results[3]),
            'recall': float(test_results[4]),
            'roc_auc': float(roc_auc)
        },
        'training': {
            'total_samples': len(df),
            'training_samples': len(X_train),
            'test_samples': len(X_test),
            'malware_ratio': float(df['is_malware'].mean()),
            'epochs_trained': len(history.history['loss'])
        }
    }
    
    if cross_val_folds:
        metadata['cross_validation'] = {
            'folds': cross_val_folds,
            'mean_accuracy': float(np.mean([s['accuracy'] for s in cv_scores])),
            'mean_auc': float(np.mean([s['auc'] for s in cv_scores]))
        }
    
    metadata_path = os.path.join(OUTPUT_DIR, 'model_metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"  ✓ Metadata: {metadata_path}")
    
    # Plot training history
    plot_training_history(history, X_test_scaled, y_test, y_pred_prob, OUTPUT_DIR)
    
    print("\n" + "=" * 70)
    print("✓ Training Complete!")
    print("=" * 70)
    print(f"\nModel Files:")
    print(f"  - {keras_path}")
    print(f"  - {tflite_path} ({tflite_size:.1f} KB)")
    print(f"  - {tfjs_path}/")
    print(f"  - {metadata_path}")
    
    return model, scaler, metadata

def plot_training_history(history, X_test, y_test, y_pred_prob, output_dir):
    """Plot and save training visualizations"""
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    
    # Accuracy
    axes[0, 0].plot(history.history['accuracy'], label='Train', linewidth=2)
    axes[0, 0].plot(history.history['val_accuracy'], label='Validation', linewidth=2)
    axes[0, 0].set_title('Model Accuracy', fontsize=12, fontweight='bold')
    axes[0, 0].set_xlabel('Epoch')
    axes[0, 0].set_ylabel('Accuracy')
    axes[0, 0].legend()
    axes[0, 0].grid(True, alpha=0.3)
    
    # Loss
    axes[0, 1].plot(history.history['loss'], label='Train', linewidth=2)
    axes[0, 1].plot(history.history['val_loss'], label='Validation', linewidth=2)
    axes[0, 1].set_title('Model Loss', fontsize=12, fontweight='bold')
    axes[0, 1].set_xlabel('Epoch')
    axes[0, 1].set_ylabel('Loss')
    axes[0, 1].legend()
    axes[0, 1].grid(True, alpha=0.3)
    
    # AUC
    axes[1, 0].plot(history.history['auc'], label='Train', linewidth=2)
    axes[1, 0].plot(history.history['val_auc'], label='Validation', linewidth=2)
    axes[1, 0].set_title('Model AUC', fontsize=12, fontweight='bold')
    axes[1, 0].set_xlabel('Epoch')
    axes[1, 0].set_ylabel('AUC')
    axes[1, 0].legend()
    axes[1, 0].grid(True, alpha=0.3)
    
    # ROC Curve
    from sklearn.metrics import roc_curve
    fpr, tpr, _ = roc_curve(y_test, y_pred_prob)
    axes[1, 1].plot(fpr, tpr, label=f'ROC Curve', linewidth=2, color='blue')
    axes[1, 1].plot([0, 1], [0, 1], 'r--', label='Random', linewidth=2)
    axes[1, 1].set_title('ROC Curve', fontsize=12, fontweight='bold')
    axes[1, 1].set_xlabel('False Positive Rate')
    axes[1, 1].set_ylabel('True Positive Rate')
    axes[1, 1].legend()
    axes[1, 1].grid(True, alpha=0.3)
    
    plt.tight_layout()
    plot_path = os.path.join(output_dir, 'training_history.png')
    plt.savefig(plot_path, dpi=150, bbox_inches='tight')
    print(f"  ✓ Training plot: {plot_path}")

# ============================================================================
# CLI
# ============================================================================

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Train malware detection model')
    parser.add_argument('--features', help='CSV file with extracted features from real APKs')
    parser.add_argument('--real-data', action='store_true', help='Use real malware dataset')
    parser.add_argument('--cross-val', type=int, help='Number of cross-validation folds')
    
    args = parser.parse_args()
    
    train_model(
        features_csv=args.features,
        use_real_data=args.real_data or (args.features is not None),
        cross_val_folds=args.cross_val
    )
