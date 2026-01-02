"""
ShadowGuard ML Training Pipeline
================================
Trains a neural network model for Android malware detection.
Exports to TensorFlow Lite and TensorFlow.js formats.

Usage:
    python train_model.py

Output:
    - models/malware_detector.tflite (for Android)
    - models/tfjs_model/ (for NestJS backend)
    - models/model_metadata.json (feature info)
"""

import os
import json
import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime

# ============================================================================
# CONFIGURATION
# ============================================================================

FEATURE_NAMES = [
    'dangerous_permissions',      # Normalized count of dangerous permissions (0-1)
    'internet_permission',        # Has INTERNET permission (0 or 1)
    'min_sdk_version',           # Normalized min SDK (0-1)
    'activities_count',          # Normalized activity count (0-1)
    'services_count',            # Normalized service count (0-1)
    'receivers_count',           # Normalized receiver count (0-1)
    'providers_count',           # Normalized provider count (0-1)
    'exported_components',       # Normalized exported component ratio (0-1)
    'intent_filters_count',      # Normalized intent filter count (0-1)
    'uses_native_code',          # Uses native code (0 or 1)
    'has_reflection',            # Uses reflection (0 or 1)
    'obfuscation_score',         # Code obfuscation level (0-1)
]

NUM_FEATURES = len(FEATURE_NAMES)
MODEL_VERSION = '2.0.0'
OUTPUT_DIR = 'models'

# ============================================================================
# SYNTHETIC DATA GENERATION (Replace with real data in production)
# ============================================================================

def generate_synthetic_data(n_samples=10000, malware_ratio=0.3):
    """
    Generate synthetic training data.
    In production, replace this with real APK feature extraction.
    """
    np.random.seed(42)
    
    n_malware = int(n_samples * malware_ratio)
    n_benign = n_samples - n_malware
    
    # Benign apps characteristics
    benign_data = {
        'dangerous_permissions': np.random.beta(2, 5, n_benign),        # Low dangerous perms
        'internet_permission': np.random.binomial(1, 0.7, n_benign),    # 70% have internet
        'min_sdk_version': np.random.beta(5, 2, n_benign),              # Higher SDK
        'activities_count': np.random.beta(3, 3, n_benign),             # Normal activity count
        'services_count': np.random.beta(2, 4, n_benign),               # Fewer services
        'receivers_count': np.random.beta(2, 4, n_benign),              # Fewer receivers
        'providers_count': np.random.beta(1, 5, n_benign),              # Fewer providers
        'exported_components': np.random.beta(2, 5, n_benign),          # Fewer exports
        'intent_filters_count': np.random.beta(3, 3, n_benign),         # Normal filters
        'uses_native_code': np.random.binomial(1, 0.2, n_benign),       # 20% native
        'has_reflection': np.random.binomial(1, 0.15, n_benign),        # 15% reflection
        'obfuscation_score': np.random.beta(2, 5, n_benign),            # Low obfuscation
        'is_malware': np.zeros(n_benign)
    }
    
    # Malware apps characteristics
    malware_data = {
        'dangerous_permissions': np.random.beta(5, 2, n_malware),       # High dangerous perms
        'internet_permission': np.random.binomial(1, 0.95, n_malware),  # 95% have internet
        'min_sdk_version': np.random.beta(2, 4, n_malware),             # Lower SDK (older)
        'activities_count': np.random.beta(2, 3, n_malware),            # Variable
        'services_count': np.random.beta(4, 2, n_malware),              # More services
        'receivers_count': np.random.beta(4, 2, n_malware),             # More receivers
        'providers_count': np.random.beta(3, 3, n_malware),             # More providers
        'exported_components': np.random.beta(4, 2, n_malware),         # More exports
        'intent_filters_count': np.random.beta(4, 2, n_malware),        # More filters
        'uses_native_code': np.random.binomial(1, 0.6, n_malware),      # 60% native
        'has_reflection': np.random.binomial(1, 0.7, n_malware),        # 70% reflection
        'obfuscation_score': np.random.beta(5, 2, n_malware),           # High obfuscation
        'is_malware': np.ones(n_malware)
    }
    
    # Combine datasets
    benign_df = pd.DataFrame(benign_data)
    malware_df = pd.DataFrame(malware_data)
    df = pd.concat([benign_df, malware_df], ignore_index=True)
    
    # Shuffle
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    
    return df

# ============================================================================
# MODEL ARCHITECTURE
# ============================================================================

def create_model(input_shape):
    """
    Create neural network model for malware detection.
    Architecture optimized for TF Lite conversion.
    """
    model = tf.keras.Sequential([
        # Input layer
        tf.keras.layers.Input(shape=input_shape, name='features_input'),
        
        # Hidden layers
        tf.keras.layers.Dense(64, activation='relu', name='dense_1'),
        tf.keras.layers.BatchNormalization(name='bn_1'),
        tf.keras.layers.Dropout(0.3, name='dropout_1'),
        
        tf.keras.layers.Dense(32, activation='relu', name='dense_2'),
        tf.keras.layers.BatchNormalization(name='bn_2'),
        tf.keras.layers.Dropout(0.2, name='dropout_2'),
        
        tf.keras.layers.Dense(16, activation='relu', name='dense_3'),
        
        # Output layer (sigmoid for binary classification)
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

def train_model():
    """Main training pipeline."""
    
    print("=" * 60)
    print("ShadowGuard ML Training Pipeline")
    print("=" * 60)
    
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(os.path.join(OUTPUT_DIR, 'tfjs_model'), exist_ok=True)
    
    # Step 1: Generate/Load Data
    print("\n[1/6] Generating training data...")
    df = generate_synthetic_data(n_samples=10000, malware_ratio=0.3)
    print(f"   Total samples: {len(df)}")
    print(f"   Malware: {df['is_malware'].sum():.0f} ({df['is_malware'].mean()*100:.1f}%)")
    print(f"   Benign: {len(df) - df['is_malware'].sum():.0f}")
    
    # Step 2: Prepare Features
    print("\n[2/6] Preparing features...")
    X = df[FEATURE_NAMES].values
    y = df['is_malware'].values
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # Scale features (save scaler params for inference)
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    print(f"   Training samples: {len(X_train)}")
    print(f"   Test samples: {len(X_test)}")
    
    # Step 3: Create Model
    print("\n[3/6] Creating model architecture...")
    model = create_model(input_shape=(NUM_FEATURES,))
    model.summary()
    
    # Step 4: Train Model
    print("\n[4/6] Training model...")
    
    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor='val_auc',
            patience=10,
            restore_best_weights=True,
            mode='max'
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=5,
            min_lr=0.0001
        )
    ]
    
    history = model.fit(
        X_train_scaled, y_train,
        validation_split=0.2,
        epochs=100,
        batch_size=32,
        callbacks=callbacks,
        verbose=1
    )
    
    # Step 5: Evaluate Model
    print("\n[5/6] Evaluating model...")
    
    # Test set evaluation
    test_results = model.evaluate(X_test_scaled, y_test, verbose=0)
    print(f"\n   Test Results:")
    print(f"   - Accuracy: {test_results[1]*100:.2f}%")
    print(f"   - AUC: {test_results[2]:.4f}")
    print(f"   - Precision: {test_results[3]*100:.2f}%")
    print(f"   - Recall: {test_results[4]*100:.2f}%")
    
    # Detailed classification report
    y_pred = (model.predict(X_test_scaled) > 0.5).astype(int)
    print("\n   Classification Report:")
    print(classification_report(y_test, y_pred, target_names=['Benign', 'Malware']))
    
    # Step 6: Export Models
    print("\n[6/6] Exporting models...")
    
    # 6a: Save Keras model
    keras_path = os.path.join(OUTPUT_DIR, 'malware_detector.keras')
    model.save(keras_path)
    print(f"   ✓ Keras model saved: {keras_path}")
    
    # 6b: Convert to TF Lite
    print("\n   Converting to TensorFlow Lite...")
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.target_spec.supported_types = [tf.float16]
    tflite_model = converter.convert()
    
    tflite_path = os.path.join(OUTPUT_DIR, 'malware_detector.tflite')
    with open(tflite_path, 'wb') as f:
        f.write(tflite_model)
    tflite_size = os.path.getsize(tflite_path) / 1024
    print(f"   ✓ TFLite model saved: {tflite_path} ({tflite_size:.1f} KB)")
    
    # 6c: Convert to TensorFlow.js
    print("\n   Converting to TensorFlow.js...")
    import subprocess
    tfjs_path = os.path.join(OUTPUT_DIR, 'tfjs_model')
    try:
        subprocess.run([
            'tensorflowjs_converter',
            '--input_format=keras',
            keras_path,
            tfjs_path
        ], check=True, capture_output=True)
        print(f"   ✓ TF.js model saved: {tfjs_path}/")
    except Exception as e:
        print(f"   ⚠ TF.js conversion failed: {e}")
        print("   Run: pip install tensorflowjs && tensorflowjs_converter --input_format=keras models/malware_detector.keras models/tfjs_model")
    
    # 6d: Save metadata
    metadata = {
        'version': MODEL_VERSION,
        'created_at': datetime.now().isoformat(),
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
            'recall': float(test_results[4])
        },
        'training': {
            'samples': len(df),
            'malware_ratio': float(df['is_malware'].mean()),
            'epochs': len(history.history['loss'])
        }
    }
    
    metadata_path = os.path.join(OUTPUT_DIR, 'model_metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"   ✓ Metadata saved: {metadata_path}")
    
    # Plot training history
    plot_training_history(history, OUTPUT_DIR)
    
    print("\n" + "=" * 60)
    print("Training Complete!")
    print("=" * 60)
    print(f"\nOutput files:")
    print(f"  - {keras_path}")
    print(f"  - {tflite_path} ({tflite_size:.1f} KB)")
    print(f"  - {tfjs_path}/")
    print(f"  - {metadata_path}")
    
    return model, scaler, metadata

def plot_training_history(history, output_dir):
    """Plot and save training history."""
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    
    # Accuracy
    axes[0, 0].plot(history.history['accuracy'], label='Train')
    axes[0, 0].plot(history.history['val_accuracy'], label='Validation')
    axes[0, 0].set_title('Model Accuracy')
    axes[0, 0].set_xlabel('Epoch')
    axes[0, 0].set_ylabel('Accuracy')
    axes[0, 0].legend()
    axes[0, 0].grid(True)
    
    # Loss
    axes[0, 1].plot(history.history['loss'], label='Train')
    axes[0, 1].plot(history.history['val_loss'], label='Validation')
    axes[0, 1].set_title('Model Loss')
    axes[0, 1].set_xlabel('Epoch')
    axes[0, 1].set_ylabel('Loss')
    axes[0, 1].legend()
    axes[0, 1].grid(True)
    
    # AUC
    axes[1, 0].plot(history.history['auc'], label='Train')
    axes[1, 0].plot(history.history['val_auc'], label='Validation')
    axes[1, 0].set_title('Model AUC')
    axes[1, 0].set_xlabel('Epoch')
    axes[1, 0].set_ylabel('AUC')
    axes[1, 0].legend()
    axes[1, 0].grid(True)
    
    # Precision & Recall
    axes[1, 1].plot(history.history['precision'], label='Precision')
    axes[1, 1].plot(history.history['recall'], label='Recall')
    axes[1, 1].set_title('Precision vs Recall')
    axes[1, 1].set_xlabel('Epoch')
    axes[1, 1].set_ylabel('Score')
    axes[1, 1].legend()
    axes[1, 1].grid(True)
    
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'training_history.png'), dpi=150)
    print(f"   ✓ Training plot saved: {output_dir}/training_history.png")

# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    train_model()
