"""
ShadowGuard ML Training Pipeline - Real Dataset
================================================
Trains malware detection model on the Mendeley Android Permissions Dataset.

Dataset: "Android Malware and Normal permissions dataset"
Source: https://data.mendeley.com/datasets/958wvr38gy/1
Samples: 18,850 normal + 10,000 malware = 28,850 total

Usage:
    1. Download 'secondpaper dataset.xlsx' from Mendeley
    2. Place in ml/data/ folder
    3. Run: python train_real_dataset.py
"""

import os
import json
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Tuple, List, Dict, Any

# ML Libraries
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    classification_report, confusion_matrix, roc_auc_score,
    precision_recall_curve, f1_score, accuracy_score
)

import warnings
warnings.filterwarnings('ignore')

# TensorFlow
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import keras
from keras import layers, callbacks, regularizers

# ============================================================
# Configuration
# ============================================================

CONFIG = {
    'dataset_path': '../data/secondpaper dataset.xlsx',
    'output_dir': 'models',
    'test_size': 0.2,
    'validation_size': 0.15,
    'random_state': 42,
    'batch_size': 64,
    'epochs': 100,
    'early_stopping_patience': 15,
}

# Android dangerous permissions to track
DANGEROUS_PERMISSIONS = [
    'READ_CALENDAR', 'WRITE_CALENDAR',
    'CAMERA',
    'READ_CONTACTS', 'WRITE_CONTACTS', 'GET_ACCOUNTS',
    'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION',
    'RECORD_AUDIO',
    'READ_PHONE_STATE', 'READ_PHONE_NUMBERS', 'CALL_PHONE',
    'READ_CALL_LOG', 'WRITE_CALL_LOG', 'ADD_VOICEMAIL',
    'USE_SIP', 'PROCESS_OUTGOING_CALLS',
    'BODY_SENSORS',
    'SEND_SMS', 'RECEIVE_SMS', 'READ_SMS', 'RECEIVE_WAP_PUSH', 'RECEIVE_MMS',
    'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE',
]

# High-risk permissions for malware detection
HIGH_RISK_PERMISSIONS = [
    'SEND_SMS', 'READ_SMS', 'RECEIVE_SMS',
    'READ_CONTACTS', 'WRITE_CONTACTS',
    'READ_CALL_LOG', 'WRITE_CALL_LOG',
    'CALL_PHONE', 'PROCESS_OUTGOING_CALLS',
    'READ_PHONE_STATE',
    'INTERNET',
    'ACCESS_FINE_LOCATION',
    'CAMERA',
    'RECORD_AUDIO',
    'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE',
    'RECEIVE_BOOT_COMPLETED',
    'SYSTEM_ALERT_WINDOW',
    'WRITE_SETTINGS',
    'GET_TASKS',
    'KILL_BACKGROUND_PROCESSES',
    'WAKE_LOCK',
]


def print_header(title: str):
    """Print formatted header"""
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)


def load_dataset(filepath: str) -> pd.DataFrame:
    """Load and explore the Excel dataset"""
    print_header("Loading Dataset")
    
    if not os.path.exists(filepath):
        print(f"❌ Dataset not found at: {filepath}")
        print("\n📥 Download Instructions:")
        print("   1. Go to: https://data.mendeley.com/datasets/958wvr38gy/1")
        print("   2. Download 'secondpaper dataset.xlsx'")
        print(f"   3. Place in: {os.path.abspath('data/')}")
        raise FileNotFoundError(f"Dataset not found: {filepath}")
    
    print(f"📂 Loading: {filepath}")
    
    # Try to read Excel file
    try:
        # First, let's see what sheets are available
        xl = pd.ExcelFile(filepath)
        print(f"   Sheets found: {xl.sheet_names}")
        
        # This dataset has two sheets: 'Begnin' and 'Malware'
        # Load both and combine them
        dfs = []
        for sheet_name in xl.sheet_names:
            sheet_df = pd.read_excel(filepath, sheet_name=sheet_name)
            # Add label column based on sheet name
            if 'malware' in sheet_name.lower() or 'mal' in sheet_name.lower():
                sheet_df['is_malware'] = 1
                print(f"   ✓ Loaded '{sheet_name}': {len(sheet_df):,} MALWARE samples")
            else:
                sheet_df['is_malware'] = 0
                print(f"   ✓ Loaded '{sheet_name}': {len(sheet_df):,} BENIGN samples")
            dfs.append(sheet_df)
        
        # Combine all sheets
        df = pd.concat(dfs, ignore_index=True)
        print(f"   ✓ Combined total: {len(df):,} rows, {len(df.columns)} columns")
        
    except Exception as e:
        print(f"❌ Error loading Excel: {e}")
        raise
    
    return df


def analyze_dataset(df: pd.DataFrame) -> Dict[str, Any]:
    """Analyze dataset structure and content"""
    print_header("Dataset Analysis")
    
    analysis = {
        'total_rows': len(df),
        'total_columns': len(df.columns),
        'columns': list(df.columns),
    }
    
    print(f"\n📊 Dataset Shape: {df.shape}")
    print(f"\n📋 Columns ({len(df.columns)}):")
    
    # Print first 20 columns
    for i, col in enumerate(df.columns[:30]):
        dtype = df[col].dtype
        non_null = df[col].notna().sum()
        print(f"   {i+1:2}. {col[:40]:40} | {dtype} | {non_null:,} values")
    
    if len(df.columns) > 30:
        print(f"   ... and {len(df.columns) - 30} more columns")
    
    # Look for label/class column
    label_candidates = ['label', 'class', 'type', 'malware', 'category', 'Label', 'Class', 'Type']
    label_col = None
    for col in df.columns:
        if any(lc.lower() in col.lower() for lc in label_candidates):
            label_col = col
            break
    
    if label_col:
        print(f"\n🏷️  Label Column Found: '{label_col}'")
        print(f"   Value counts:")
        for val, count in df[label_col].value_counts().items():
            pct = count / len(df) * 100
            print(f"   - {val}: {count:,} ({pct:.1f}%)")
        analysis['label_column'] = label_col
        analysis['label_distribution'] = df[label_col].value_counts().to_dict()
    else:
        print("\n⚠️  No obvious label column found. Columns:")
        for col in df.columns:
            print(f"   - {col}")
    
    # Sample data
    print(f"\n📝 Sample Data (first 3 rows):")
    print(df.head(3).to_string())
    
    return analysis


def preprocess_permissions_dataset(df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Preprocess the permissions dataset into features and labels.
    
    Expected format: Each row is an app, columns are permissions (1/0), 
    with a label column indicating malware/normal.
    """
    print_header("Preprocessing Data")
    
    # Use the 'is_malware' column we created when loading sheets
    if 'is_malware' in df.columns:
        label_col = 'is_malware'
        print(f"✓ Using 'is_malware' label column (from sheet names)")
    else:
        # Find label column
        label_col = None
        for col in df.columns:
            if 'label' in col.lower() or 'class' in col.lower() or 'type' in col.lower():
                label_col = col
                break
        
        if not label_col:
            # Try to infer - usually last column or first column
            label_col = df.columns[-1]
            print(f"⚠️  Using last column as label: '{label_col}'")
        else:
            print(f"✓ Label column: '{label_col}'")
    
    # Get labels
    y = df[label_col].values.astype(int)
    
    print(f"   Malware samples: {np.sum(y):,} ({np.mean(y)*100:.1f}%)")
    print(f"   Benign samples: {len(y) - np.sum(y):,} ({(1-np.mean(y))*100:.1f}%)")
    
    # Get feature columns (all numeric columns except label and non-feature columns)
    exclude_cols = [label_col, 'is_malware', 'Package', 'Category', 'package', 'category']
    feature_cols = [col for col in df.columns if col not in exclude_cols]
    
    # Filter to numeric columns only
    numeric_cols = []
    for col in feature_cols:
        if df[col].dtype in ['int64', 'float64', 'int32', 'float32']:
            numeric_cols.append(col)
    
    print(f"   Feature columns: {len(numeric_cols)}")
    
    # Extract features
    X = df[numeric_cols].values.astype(np.float32)
    
    # Handle NaN values
    X = np.nan_to_num(X, nan=0.0)
    
    print(f"\n📐 Data Shape:")
    print(f"   Features (X): {X.shape}")
    print(f"   Labels (y): {y.shape}")
    
    return X, y, numeric_cols


def create_aggregated_features(X: np.ndarray, feature_names: List[str]) -> Tuple[np.ndarray, List[str]]:
    """
    Create aggregated features that match our model's expected input.
    Maps permission columns to our 12-feature schema.
    """
    print_header("Creating Aggregated Features")
    
    n_samples = X.shape[0]
    
    # Initialize aggregated features
    features = {
        'dangerous_permissions_count': np.zeros(n_samples),
        'has_internet': np.zeros(n_samples),
        'min_sdk_version': np.ones(n_samples) * 21,  # Default API 21
        'permissions_count': np.sum(X, axis=1),  # Total permissions
        'has_sms': np.zeros(n_samples),
        'has_location': np.zeros(n_samples),
        'has_camera': np.zeros(n_samples),
        'has_contacts': np.zeros(n_samples),
        'has_storage': np.zeros(n_samples),
        'is_system_app': np.zeros(n_samples),  # Can't determine from permissions
        'app_size_mb': np.ones(n_samples) * 10,  # Default size
        'signature_valid': np.ones(n_samples),  # Assume valid
    }
    
    # Map permissions to features
    feature_names_lower = [f.lower() for f in feature_names]
    
    for i, perm in enumerate(feature_names_lower):
        perm_values = X[:, i]
        
        # Count dangerous permissions
        for dp in DANGEROUS_PERMISSIONS:
            if dp.lower() in perm:
                features['dangerous_permissions_count'] += perm_values
                break
        
        # Internet
        if 'internet' in perm:
            features['has_internet'] = np.maximum(features['has_internet'], perm_values)
        
        # SMS
        if any(s in perm for s in ['sms', 'mms']):
            features['has_sms'] = np.maximum(features['has_sms'], perm_values)
        
        # Location
        if 'location' in perm:
            features['has_location'] = np.maximum(features['has_location'], perm_values)
        
        # Camera
        if 'camera' in perm:
            features['has_camera'] = np.maximum(features['has_camera'], perm_values)
        
        # Contacts
        if 'contact' in perm:
            features['has_contacts'] = np.maximum(features['has_contacts'], perm_values)
        
        # Storage
        if 'storage' in perm or 'external' in perm:
            features['has_storage'] = np.maximum(features['has_storage'], perm_values)
    
    # Create feature matrix
    feature_order = [
        'dangerous_permissions_count', 'has_internet', 'min_sdk_version',
        'permissions_count', 'has_sms', 'has_location', 'has_camera',
        'has_contacts', 'has_storage', 'is_system_app', 'app_size_mb', 'signature_valid'
    ]
    
    X_aggregated = np.column_stack([features[f] for f in feature_order])
    
    print(f"   Original features: {X.shape[1]}")
    print(f"   Aggregated features: {X_aggregated.shape[1]}")
    print(f"\n   Feature statistics:")
    for i, name in enumerate(feature_order):
        vals = X_aggregated[:, i]
        print(f"   {name:30} | min: {vals.min():.2f} | max: {vals.max():.2f} | mean: {vals.mean():.2f}")
    
    return X_aggregated, feature_order


def create_model_architecture(input_dim: int, complexity: str = 'standard') -> keras.Model:
    """Create neural network architecture"""
    print_header("Creating Model Architecture")
    
    if complexity == 'simple':
        model = keras.Sequential([
            layers.Input(shape=(input_dim,), name='features_input'),
            layers.Dense(32, activation='relu', kernel_regularizer=regularizers.l2(0.01)),
            layers.Dropout(0.3),
            layers.Dense(16, activation='relu'),
            layers.Dense(1, activation='sigmoid', name='output')
        ], name='malware_detector_simple')
    
    elif complexity == 'standard':
        model = keras.Sequential([
            layers.Input(shape=(input_dim,), name='features_input'),
            layers.Dense(64, activation='relu', kernel_regularizer=regularizers.l2(0.01)),
            layers.BatchNormalization(),
            layers.Dropout(0.3),
            layers.Dense(32, activation='relu', kernel_regularizer=regularizers.l2(0.01)),
            layers.BatchNormalization(),
            layers.Dropout(0.2),
            layers.Dense(16, activation='relu'),
            layers.Dense(1, activation='sigmoid', name='output')
        ], name='malware_detector')
    
    else:  # deep
        model = keras.Sequential([
            layers.Input(shape=(input_dim,), name='features_input'),
            layers.Dense(128, activation='relu', kernel_regularizer=regularizers.l2(0.01)),
            layers.BatchNormalization(),
            layers.Dropout(0.4),
            layers.Dense(64, activation='relu', kernel_regularizer=regularizers.l2(0.01)),
            layers.BatchNormalization(),
            layers.Dropout(0.3),
            layers.Dense(32, activation='relu'),
            layers.BatchNormalization(),
            layers.Dropout(0.2),
            layers.Dense(16, activation='relu'),
            layers.Dense(1, activation='sigmoid', name='output')
        ], name='malware_detector_deep')
    
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss='binary_crossentropy',
        metrics=[
            'accuracy',
            keras.metrics.AUC(name='auc'),
            keras.metrics.Precision(name='precision'),
            keras.metrics.Recall(name='recall'),
        ]
    )
    
    model.summary()
    return model


def train_model(
    model: keras.Model,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
) -> keras.callbacks.History:
    """Train the model"""
    print_header("Training Model")
    
    # Calculate class weights for imbalanced data
    n_total = len(y_train)
    n_malware = np.sum(y_train)
    n_benign = n_total - n_malware
    
    class_weights = {
        0: n_total / (2 * n_benign),
        1: n_total / (2 * n_malware),
    }
    print(f"   Class weights: benign={class_weights[0]:.3f}, malware={class_weights[1]:.3f}")
    
    # Callbacks
    cb = [
        callbacks.EarlyStopping(
            monitor='val_auc',
            patience=CONFIG['early_stopping_patience'],
            restore_best_weights=True,
            mode='max',
            verbose=1
        ),
        callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=5,
            min_lr=1e-6,
            verbose=1
        ),
    ]
    
    # Train
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=CONFIG['epochs'],
        batch_size=CONFIG['batch_size'],
        class_weight=class_weights,
        callbacks=cb,
        verbose=1
    )
    
    return history


def evaluate_model(
    model: keras.Model,
    X_test: np.ndarray,
    y_test: np.ndarray,
    threshold: float = 0.5
) -> Dict[str, float]:
    """Evaluate model performance"""
    print_header("Evaluating Model")
    
    # Predictions
    y_pred_proba = model.predict(X_test, verbose=0).flatten()
    y_pred = (y_pred_proba >= threshold).astype(int)
    
    # Metrics
    accuracy = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_pred_proba)
    f1 = f1_score(y_test, y_pred)
    
    results = {
        'accuracy': accuracy,
        'auc': auc,
        'f1_score': f1,
        'threshold': threshold,
    }
    
    print(f"\n📊 Test Results:")
    print(f"   Accuracy:  {accuracy*100:.2f}%")
    print(f"   AUC:       {auc:.4f}")
    print(f"   F1 Score:  {f1:.4f}")
    
    print(f"\n📋 Classification Report:")
    print(classification_report(y_test, y_pred, target_names=['Benign', 'Malware']))
    
    print(f"\n🔢 Confusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(f"   TN: {cm[0,0]:,}  FP: {cm[0,1]:,}")
    print(f"   FN: {cm[1,0]:,}  TP: {cm[1,1]:,}")
    
    # Find optimal threshold
    precisions, recalls, thresholds = precision_recall_curve(y_test, y_pred_proba)
    f1_scores = 2 * (precisions * recalls) / (precisions + recalls + 1e-10)
    optimal_idx = np.argmax(f1_scores)
    optimal_threshold = thresholds[optimal_idx] if optimal_idx < len(thresholds) else 0.5
    
    print(f"\n🎯 Optimal threshold: {optimal_threshold:.3f} (F1: {f1_scores[optimal_idx]:.4f})")
    results['optimal_threshold'] = float(optimal_threshold)
    
    return results


def export_models(
    model: keras.Model,
    scaler: StandardScaler,
    feature_names: List[str],
    results: Dict[str, float],
    output_dir: str
):
    """Export trained model in multiple formats"""
    print_header("Exporting Models")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Save Keras model
    keras_path = os.path.join(output_dir, 'malware_detector.keras')
    model.save(keras_path)
    print(f"   ✓ Keras model: {keras_path}")
    
    # 2. Save TFLite model
    try:
        import tensorflow as tf
        
        # Convert to SavedModel first
        @tf.function(input_signature=[tf.TensorSpec(shape=[None, len(feature_names)], dtype=tf.float32)])
        def serve(x):
            return model(x, training=False)
        
        # Use concrete function
        concrete_func = serve.get_concrete_function()
        
        # Convert to TFLite
        converter = tf.lite.TFLiteConverter.from_concrete_functions([concrete_func])
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.target_spec.supported_types = [tf.float16]
        
        tflite_model = converter.convert()
        
        tflite_path = os.path.join(output_dir, 'malware_detector.tflite')
        with open(tflite_path, 'wb') as f:
            f.write(tflite_model)
        
        tflite_size = os.path.getsize(tflite_path) / 1024
        print(f"   ✓ TFLite model: {tflite_path} ({tflite_size:.1f} KB)")
        
    except Exception as e:
        print(f"   ⚠ TFLite conversion failed: {e}")
    
    # 3. Export TF.js model (manual)
    tfjs_dir = os.path.join(output_dir, 'tfjs_model')
    os.makedirs(tfjs_dir, exist_ok=True)
    
    try:
        export_tfjs_model(model, feature_names, tfjs_dir)
        print(f"   ✓ TF.js model: {tfjs_dir}")
    except Exception as e:
        print(f"   ⚠ TF.js export failed: {e}")
    
    # 4. Save metadata
    metadata = {
        'version': '2.0.0',
        'trained_on': 'Mendeley Android Permissions Dataset',
        'training_date': datetime.now().isoformat(),
        'samples': {
            'total': 28850,
            'malware': 10000,
            'benign': 18850,
        },
        'features': feature_names,
        'feature_count': len(feature_names),
        'scaler': {
            'mean': scaler.mean_.tolist(),
            'scale': scaler.scale_.tolist(),
        },
        'performance': results,
        'threshold': results.get('optimal_threshold', 0.5),
    }
    
    metadata_path = os.path.join(output_dir, 'model_metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"   ✓ Metadata: {metadata_path}")


def export_tfjs_model(model: keras.Model, feature_names: List[str], output_dir: str):
    """Export model to TensorFlow.js format"""
    import json
    
    # Get weights
    weights = model.get_weights()
    weight_specs = []
    binary_data = b''
    
    for layer in model.layers:
        layer_weights = layer.get_weights()
        for i, w in enumerate(layer_weights):
            w_float32 = w.astype(np.float32)
            
            if 'dense' in layer.name or 'output' in layer.name:
                w_name = 'kernel' if i % 2 == 0 else 'bias'
            elif 'bn' in layer.name or 'batch' in layer.name.lower():
                names = ['gamma', 'beta', 'moving_mean', 'moving_variance']
                w_name = names[i % 4]
            else:
                w_name = f'weight_{i}'
            
            weight_specs.append({
                "name": f"{layer.name}/{w_name}",
                "shape": list(w_float32.shape),
                "dtype": "float32"
            })
            binary_data += w_float32.tobytes()
    
    # Model JSON
    model_json = {
        "format": "layers-model",
        "generatedBy": "ShadowGuard Real Dataset Training",
        "convertedBy": "Custom Exporter v2.0",
        "modelTopology": {
            "class_name": "Sequential",
            "config": {
                "name": "malware_detector",
                "layers": [
                    {"class_name": "InputLayer", "config": {"batch_input_shape": [None, len(feature_names)], "dtype": "float32", "name": "features_input"}},
                    {"class_name": "Dense", "config": {"units": 64, "activation": "relu", "name": "dense_1"}},
                    {"class_name": "BatchNormalization", "config": {"name": "bn_1"}},
                    {"class_name": "Dropout", "config": {"rate": 0.3, "name": "dropout_1"}},
                    {"class_name": "Dense", "config": {"units": 32, "activation": "relu", "name": "dense_2"}},
                    {"class_name": "BatchNormalization", "config": {"name": "bn_2"}},
                    {"class_name": "Dropout", "config": {"rate": 0.2, "name": "dropout_2"}},
                    {"class_name": "Dense", "config": {"units": 16, "activation": "relu", "name": "dense_3"}},
                    {"class_name": "Dense", "config": {"units": 1, "activation": "sigmoid", "name": "output"}}
                ]
            }
        },
        "weightsManifest": [{"paths": ["weights.bin"], "weights": weight_specs}]
    }
    
    # Save files
    with open(os.path.join(output_dir, 'model.json'), 'w') as f:
        json.dump(model_json, f, indent=2)
    
    with open(os.path.join(output_dir, 'weights.bin'), 'wb') as f:
        f.write(binary_data)
    
    # Metadata
    with open(os.path.join(output_dir, 'metadata.json'), 'w') as f:
        json.dump({"features": feature_names, "threshold": 0.5}, f, indent=2)


def main():
    """Main training pipeline"""
    print("\n" + "=" * 60)
    print("  ShadowGuard ML Training - Real Dataset")
    print("  Mendeley Android Permissions Dataset")
    print("=" * 60)
    
    # 1. Load dataset
    df = load_dataset(CONFIG['dataset_path'])
    
    # 2. Analyze dataset
    analysis = analyze_dataset(df)
    
    # 3. Preprocess
    X_raw, y, raw_feature_names = preprocess_permissions_dataset(df)
    
    # 4. Create aggregated features (match our 12-feature schema)
    X, feature_names = create_aggregated_features(X_raw, raw_feature_names)
    
    # 5. Scale features
    print_header("Scaling Features")
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    print(f"   Applied StandardScaler normalization")
    
    # 6. Split data
    print_header("Splitting Data")
    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y,
        test_size=CONFIG['test_size'],
        random_state=CONFIG['random_state'],
        stratify=y
    )
    
    X_train, X_val, y_train, y_val = train_test_split(
        X_train, y_train,
        test_size=CONFIG['validation_size'],
        random_state=CONFIG['random_state'],
        stratify=y_train
    )
    
    print(f"   Training:   {len(X_train):,} samples")
    print(f"   Validation: {len(X_val):,} samples")
    print(f"   Test:       {len(X_test):,} samples")
    
    # 7. Create model
    model = create_model_architecture(X_scaled.shape[1], complexity='standard')
    
    # 8. Train model
    history = train_model(model, X_train, y_train, X_val, y_val)
    
    # 9. Evaluate model
    results = evaluate_model(model, X_test, y_test)
    
    # 10. Export models
    export_models(model, scaler, feature_names, results, CONFIG['output_dir'])
    
    print_header("Training Complete!")
    print(f"\n🎉 Model trained successfully on real dataset!")
    print(f"   Accuracy: {results['accuracy']*100:.2f}%")
    print(f"   AUC: {results['auc']:.4f}")
    print(f"\n📁 Output files in: {os.path.abspath(CONFIG['output_dir'])}")


if __name__ == "__main__":
    main()
