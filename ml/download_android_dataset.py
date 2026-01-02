#!/usr/bin/env python3
"""
Download Android Malware Dataset from Public Sources
"""

import os
import requests
import zipfile
from pathlib import Path

def download_drebin_sample():
    """Download sample from Drebin dataset (public subset)"""
    print("\n" + "="*60)
    print(" Downloading Android Malware Dataset")
    print("="*60)
    
    # Create directories
    malware_dir = Path("../data/malware")
    benign_dir = Path("../data/benign")
    malware_dir.mkdir(parents=True, exist_ok=True)
    benign_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n📁 Directories created:")
    print(f"   - {malware_dir.absolute()}")
    print(f"   - {benign_dir.absolute()}")
    
    # Public Android malware samples
    samples = [
        {
            "name": "FakeInst",
            "url": "https://github.com/ashishb/android-malware/raw/master/malware/FakeInst.apk",
            "type": "malware"
        },
        {
            "name": "DroidKungFu",
            "url": "https://github.com/ashishb/android-malware/raw/master/malware/DroidKungFu.apk",
            "type": "malware"
        },
        {
            "name": "GinMaster",
            "url": "https://github.com/ashishb/android-malware/raw/master/malware/GinMaster.apk",
            "type": "malware"
        }
    ]
    
    downloaded = 0
    
    print("\n🔽 Downloading malware samples...\n")
    
    for sample in samples:
        output_dir = malware_dir if sample["type"] == "malware" else benign_dir
        output_path = output_dir / f"{sample['name']}.apk"
        
        if output_path.exists():
            print(f"⏭️  {sample['name']} - Already exists")
            downloaded += 1
            continue
        
        try:
            print(f"⬇️  {sample['name']}...", end=" ")
            response = requests.get(sample["url"], timeout=30)
            
            if response.status_code == 200:
                with open(output_path, "wb") as f:
                    f.write(response.content)
                size_kb = len(response.content) / 1024
                print(f"✅ ({size_kb:.1f} KB)")
                downloaded += 1
            else:
                print(f"❌ HTTP {response.status_code}")
        except Exception as e:
            print(f"❌ Error: {str(e)}")
    
    # Instructions for more samples
    print("\n" + "="*60)
    print(f" Downloaded {downloaded} samples")
    print("="*60)
    
    print("\n📥 Pour obtenir PLUS de malware Android:")
    print("\n1. CICMalDroid 2020 (gratuit, 17K APKs):")
    print("   https://www.unb.ca/cic/datasets/maldroid-2020.html")
    print("   Téléchargez directement depuis le site")
    
    print("\n2. AndroZoo (25M APKs - nécessite inscription):")
    print("   https://androzoo.uni.lu/")
    
    print("\n3. VirusShare Android:")
    print("   https://virusshare.com/")
    
    print("\n4. Benign Apps (APKs propres):")
    print("   - APKMirror: https://www.apkmirror.com/")
    print("   - F-Droid: https://f-droid.org/")
    print("   Téléchargez: WhatsApp, Facebook, Instagram, etc.")
    
    print("\n💡 SOLUTION RAPIDE:")
    print("   Téléchargez manuellement 50-100 APKs depuis:")
    print("   - APKMirror (apps propres)")
    print("   - APKPure")
    print("   Et entraînez le modèle!")
    
    print(f"\n📂 Placez vos APKs dans:")
    print(f"   Malware: {malware_dir.absolute()}")
    print(f"   Benign: {benign_dir.absolute()}")
    
    return downloaded

if __name__ == "__main__":
    count = download_drebin_sample()
    
    print("\n" + "="*60)
    print(" Next Steps")
    print("="*60)
    print("\n1. Téléchargez plus d'APKs manuellement")
    print("2. Vérifiez: ls ../data/malware/*.apk")
    print("3. Extrayez features: python extract_features_from_apks.py")
    print("4. Entraînez: python train_model_enhanced.py --features features.csv --real-data")
    print()
