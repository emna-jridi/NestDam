"""
Export Keras model to TensorFlow.js format manually
This script converts the model weights to a JSON format compatible with TF.js
"""

import json
import numpy as np
import os
import keras

def export_to_tfjs(model_path: str, output_dir: str):
    """Export Keras model to TF.js format"""
    
    # Load the model
    print(f"Loading model from {model_path}...")
    model = keras.models.load_model(model_path)
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Extract model topology (architecture)
    model_config = model.get_config()
    
    # Get weights
    weights = model.get_weights()
    
    # Create model.json structure
    tfjs_model = {
        "format": "layers-model",
        "generatedBy": "ShadowGuard ML Pipeline",
        "convertedBy": "Custom TF.js Exporter",
        "modelTopology": {
            "class_name": model_config['class_name'],
            "config": {
                "name": model_config['name'],
                "layers": []
            },
            "keras_version": "3.0",
            "backend": "tensorflow"
        },
        "weightsManifest": [{
            "paths": ["group1-shard1of1.bin"],
            "weights": []
        }]
    }
    
    # Process layers
    layer_configs = []
    weight_idx = 0
    binary_data = b''
    
    for layer in model.layers:
        layer_config = layer.get_config()
        layer_weights = layer.get_weights()
        
        # Convert layer config to TF.js format
        tfjs_layer = {
            "class_name": layer.__class__.__name__,
            "config": layer_config,
            "name": layer.name,
        }
        
        # Add inbound nodes info
        if hasattr(layer, '_inbound_nodes') and layer._inbound_nodes:
            inbound = []
            for node in layer._inbound_nodes:
                if hasattr(node, 'inbound_layers'):
                    for inbound_layer in node.inbound_layers:
                        inbound.append([[inbound_layer.name, 0, 0, {}]])
            if inbound:
                tfjs_layer["inbound_nodes"] = inbound
        
        layer_configs.append(tfjs_layer)
        
        # Process weights
        for w_arr in layer_weights:
            w_data = w_arr.astype(np.float32)
            
            weight_spec = {
                "name": f"{layer.name}/{['kernel', 'bias', 'gamma', 'beta', 'moving_mean', 'moving_variance'][weight_idx % 6]}",
                "shape": list(w_data.shape),
                "dtype": "float32"
            }
            tfjs_model["weightsManifest"][0]["weights"].append(weight_spec)
            
            binary_data += w_data.tobytes()
            weight_idx += 1
    
    tfjs_model["modelTopology"]["config"]["layers"] = layer_configs
    
    # Save model.json
    model_json_path = os.path.join(output_dir, "model.json")
    with open(model_json_path, 'w') as f:
        json.dump(tfjs_model, f, indent=2)
    print(f"✓ Model topology saved: {model_json_path}")
    
    # Save binary weights
    weights_path = os.path.join(output_dir, "group1-shard1of1.bin")
    with open(weights_path, 'wb') as f:
        f.write(binary_data)
    print(f"✓ Weights saved: {weights_path} ({len(binary_data) / 1024:.1f} KB)")
    
    return model_json_path

def create_simple_tfjs_model(model_path: str, output_dir: str):
    """Create a simple TF.js compatible model using saved weights"""
    
    print(f"Loading model from {model_path}...")
    model = keras.models.load_model(model_path)
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Get weights as numpy arrays
    all_weights = []
    weight_specs = []
    
    for layer in model.layers:
        layer_weights = layer.get_weights()
        for i, w in enumerate(layer_weights):
            w_float32 = w.astype(np.float32)
            all_weights.append(w_float32)
            
            # Determine weight name
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
    
    # Concatenate all weights into single binary blob
    binary_data = b''.join([w.tobytes() for w in all_weights])
    
    # Create model topology for a simple sequential model
    model_json = {
        "format": "layers-model",
        "generatedBy": "ShadowGuard",
        "convertedBy": "Custom Exporter v1.0",
        "modelTopology": {
            "class_name": "Sequential",
            "config": {
                "name": "malware_detector",
                "layers": [
                    {
                        "class_name": "InputLayer",
                        "config": {
                            "batch_input_shape": [None, 12],
                            "dtype": "float32",
                            "sparse": False,
                            "name": "features_input"
                        }
                    },
                    {
                        "class_name": "Dense",
                        "config": {
                            "units": 64,
                            "activation": "relu",
                            "use_bias": True,
                            "name": "dense_1"
                        }
                    },
                    {
                        "class_name": "BatchNormalization",
                        "config": {
                            "name": "bn_1"
                        }
                    },
                    {
                        "class_name": "Dropout",
                        "config": {
                            "rate": 0.3,
                            "name": "dropout_1"
                        }
                    },
                    {
                        "class_name": "Dense",
                        "config": {
                            "units": 32,
                            "activation": "relu",
                            "use_bias": True,
                            "name": "dense_2"
                        }
                    },
                    {
                        "class_name": "BatchNormalization",
                        "config": {
                            "name": "bn_2"
                        }
                    },
                    {
                        "class_name": "Dropout",
                        "config": {
                            "rate": 0.2,
                            "name": "dropout_2"
                        }
                    },
                    {
                        "class_name": "Dense",
                        "config": {
                            "units": 16,
                            "activation": "relu",
                            "use_bias": True,
                            "name": "dense_3"
                        }
                    },
                    {
                        "class_name": "Dense",
                        "config": {
                            "units": 1,
                            "activation": "sigmoid",
                            "use_bias": True,
                            "name": "output"
                        }
                    }
                ]
            },
            "keras_version": "3.0.0",
            "backend": "tensorflow"
        },
        "weightsManifest": [{
            "paths": ["weights.bin"],
            "weights": weight_specs
        }]
    }
    
    # Save files
    model_json_path = os.path.join(output_dir, "model.json")
    with open(model_json_path, 'w') as f:
        json.dump(model_json, f, indent=2)
    print(f"✓ Model JSON saved: {model_json_path}")
    
    weights_path = os.path.join(output_dir, "weights.bin")
    with open(weights_path, 'wb') as f:
        f.write(binary_data)
    print(f"✓ Weights binary saved: {weights_path} ({len(binary_data) / 1024:.2f} KB)")
    
    # Also save metadata
    metadata = {
        "feature_names": [
            "dangerous_permissions_count",
            "has_internet",
            "min_sdk_version", 
            "permissions_count",
            "has_sms",
            "has_location",
            "has_camera",
            "has_contacts",
            "has_storage",
            "is_system_app",
            "app_size_mb",
            "signature_valid"
        ],
        "model_version": "1.0.0",
        "input_shape": [12],
        "output_shape": [1],
        "threshold": 0.5
    }
    
    metadata_path = os.path.join(output_dir, "metadata.json")
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"✓ Metadata saved: {metadata_path}")
    
    print(f"\n✅ TF.js model exported to: {output_dir}")
    return output_dir


if __name__ == "__main__":
    model_path = "models/malware_detector.keras"
    output_dir = "models/tfjs_model"
    
    print("=" * 60)
    print("TensorFlow.js Model Export")
    print("=" * 60)
    
    create_simple_tfjs_model(model_path, output_dir)
