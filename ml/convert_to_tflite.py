"""
TensorFlow Lite Converter
=========================
Converts trained Keras model to TF Lite format for Android deployment.

Usage:
    python convert_to_tflite.py

Prerequisites:
    - Run train_model.py first to create the Keras model
"""

import os
import json
import tensorflow as tf
import numpy as np

MODEL_DIR = 'models'
KERAS_MODEL_PATH = os.path.join(MODEL_DIR, 'malware_detector.keras')
TFLITE_OUTPUT_PATH = os.path.join(MODEL_DIR, 'malware_detector.tflite')
TFLITE_QUANTIZED_PATH = os.path.join(MODEL_DIR, 'malware_detector_quantized.tflite')

def convert_to_tflite():
    """Convert Keras model to TensorFlow Lite."""
    
    print("=" * 60)
    print("TensorFlow Lite Conversion")
    print("=" * 60)
    
    # Check if Keras model exists
    if not os.path.exists(KERAS_MODEL_PATH):
        print(f"❌ Keras model not found at {KERAS_MODEL_PATH}")
        print("   Run train_model.py first!")
        return
    
    # Load Keras model
    print(f"\n[1/4] Loading Keras model from {KERAS_MODEL_PATH}...")
    model = tf.keras.models.load_model(KERAS_MODEL_PATH)
    print(f"   ✓ Model loaded successfully")
    model.summary()
    
    # Convert to TF Lite (float32)
    print(f"\n[2/4] Converting to TF Lite (float32)...")
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    tflite_model = converter.convert()
    
    with open(TFLITE_OUTPUT_PATH, 'wb') as f:
        f.write(tflite_model)
    
    float_size = os.path.getsize(TFLITE_OUTPUT_PATH) / 1024
    print(f"   ✓ Saved: {TFLITE_OUTPUT_PATH} ({float_size:.1f} KB)")
    
    # Convert to TF Lite (quantized - smaller, faster)
    print(f"\n[3/4] Converting to TF Lite (quantized int8)...")
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.target_spec.supported_types = [tf.float16]
    
    # Representative dataset for quantization
    def representative_dataset():
        for _ in range(100):
            data = np.random.rand(1, 12).astype(np.float32)
            yield [data]
    
    converter.representative_dataset = representative_dataset
    
    try:
        tflite_quantized = converter.convert()
        with open(TFLITE_QUANTIZED_PATH, 'wb') as f:
            f.write(tflite_quantized)
        quant_size = os.path.getsize(TFLITE_QUANTIZED_PATH) / 1024
        print(f"   ✓ Saved: {TFLITE_QUANTIZED_PATH} ({quant_size:.1f} KB)")
        print(f"   ↓ Size reduction: {(1 - quant_size/float_size)*100:.1f}%")
    except Exception as e:
        print(f"   ⚠ Quantization failed: {e}")
        print(f"   Using float32 model instead")
    
    # Verify models
    print(f"\n[4/4] Verifying TF Lite models...")
    verify_tflite_model(TFLITE_OUTPUT_PATH)
    
    # Generate Android metadata
    generate_android_metadata()
    
    print("\n" + "=" * 60)
    print("Conversion Complete!")
    print("=" * 60)
    print(f"\nFiles ready for Android:")
    print(f"  1. {TFLITE_OUTPUT_PATH} (full precision)")
    print(f"  2. {TFLITE_QUANTIZED_PATH} (optimized)")
    print(f"\nCopy to Android: app/src/main/assets/")

def verify_tflite_model(model_path: str):
    """Test TF Lite model inference."""
    
    # Load TF Lite model
    interpreter = tf.lite.Interpreter(model_path=model_path)
    interpreter.allocate_tensors()
    
    # Get input/output details
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    
    print(f"   Input shape: {input_details[0]['shape']}")
    print(f"   Input dtype: {input_details[0]['dtype']}")
    print(f"   Output shape: {output_details[0]['shape']}")
    
    # Test inference
    test_input = np.array([[0.8, 1, 0.3, 0.5, 0.6, 0.4, 0.3, 0.7, 0.5, 1, 1, 0.9]], dtype=np.float32)
    interpreter.set_tensor(input_details[0]['index'], test_input)
    interpreter.invoke()
    output = interpreter.get_tensor(output_details[0]['index'])
    
    print(f"   Test prediction: {output[0][0]:.4f} (high risk input)")
    print(f"   ✓ Model verified successfully")

def generate_android_metadata():
    """Generate metadata file for Android integration."""
    
    metadata = {
        "model_version": "2.0.0",
        "input_shape": [1, 12],
        "output_shape": [1, 1],
        "features": [
            {"index": 0, "name": "dangerous_permissions", "description": "Normalized count of dangerous permissions"},
            {"index": 1, "name": "internet_permission", "description": "Has INTERNET permission (0/1)"},
            {"index": 2, "name": "min_sdk_version", "description": "Normalized min SDK version"},
            {"index": 3, "name": "activities_count", "description": "Normalized activity count"},
            {"index": 4, "name": "services_count", "description": "Normalized service count"},
            {"index": 5, "name": "receivers_count", "description": "Normalized receiver count"},
            {"index": 6, "name": "providers_count", "description": "Normalized provider count"},
            {"index": 7, "name": "exported_components", "description": "Normalized exported component ratio"},
            {"index": 8, "name": "intent_filters_count", "description": "Normalized intent filter count"},
            {"index": 9, "name": "uses_native_code", "description": "Uses native code (0/1)"},
            {"index": 10, "name": "has_reflection", "description": "Uses reflection APIs (0/1)"},
            {"index": 11, "name": "obfuscation_score", "description": "Code obfuscation level (0-1)"}
        ],
        "normalization": {
            "min_sdk_version": {"min": 1, "max": 34},
            "activities_count": {"min": 0, "max": 100},
            "services_count": {"min": 0, "max": 50},
            "receivers_count": {"min": 0, "max": 50},
            "providers_count": {"min": 0, "max": 20},
            "intent_filters_count": {"min": 0, "max": 100}
        },
        "thresholds": {
            "low": 0.35,
            "medium": 0.65,
            "high": 0.85
        }
    }
    
    metadata_path = os.path.join(MODEL_DIR, 'android_model_metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"\n   ✓ Android metadata saved: {metadata_path}")

if __name__ == '__main__':
    convert_to_tflite()
