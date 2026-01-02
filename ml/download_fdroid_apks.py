#!/usr/bin/env python3
"""
Télécharge automatiquement des APKs bénignes depuis F-Droid
F-Droid = 100% apps open source vérifiées (pas de malware)
"""

import requests
import json
import os
from pathlib import Path
import time

def download_fdroid_apks(output_dir, count=50):
    """Télécharge des APKs depuis F-Droid"""
    
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    print("\n" + "="*60)
    print(" Téléchargement APKs F-Droid (Apps Bénignes)")
    print("="*60)
    print(f"\n📁 Dossier: {output_path.absolute()}")
    print(f"🎯 Objectif: {count} APKs\n")
    
    # URL de l'index F-Droid
    index_url = "https://f-droid.org/repo/index-v1.json"
    
    print("📥 Téléchargement de l'index F-Droid...")
    try:
        response = requests.get(index_url, timeout=60)
        index = response.json()
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return 0
    
    print(f"✅ Index chargé ({len(index['packages'])} apps disponibles)\n")
    
    # Sélectionner des apps populaires
    packages = index['packages']
    
    downloaded = 0
    failed = 0
    
    for package_name, versions in list(packages.items())[:count*3]:  # Essayer 3x plus pour compenser les échecs
        if downloaded >= count:
            break
            
        if not versions:
            continue
        
        # Prendre la dernière version
        latest = versions[0]
        apk_name = latest.get('apkName')
        
        if not apk_name:
            continue
        
        apk_url = f"https://f-droid.org/repo/{apk_name}"
        output_file = output_path / f"{package_name}.apk"
        
        # Skip si déjà téléchargé
        if output_file.exists():
            print(f"[{downloaded+1}/{count}] ⏭️  {package_name[:30]:30} - Existe déjà")
            downloaded += 1
            continue
        
        try:
            print(f"[{downloaded+1}/{count}] ⬇️  {package_name[:30]:30}...", end=" ", flush=True)
            
            apk_response = requests.get(apk_url, timeout=120, stream=True)
            
            if apk_response.status_code == 200:
                with open(output_file, 'wb') as f:
                    for chunk in apk_response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                size_mb = output_file.stat().st_size / (1024 * 1024)
                print(f"✅ ({size_mb:.1f} MB)")
                downloaded += 1
                
                time.sleep(0.5)  # Rate limiting
            else:
                print(f"❌ HTTP {apk_response.status_code}")
                failed += 1
                
        except Exception as e:
            print(f"❌ {str(e)[:40]}")
            failed += 1
            if output_file.exists():
                output_file.unlink()
    
    # Résumé
    print("\n" + "="*60)
    print(" Résumé")
    print("="*60)
    print(f"✅ Téléchargés: {downloaded} APKs")
    print(f"❌ Échecs: {failed}")
    
    if downloaded > 0:
        total_size = sum(f.stat().st_size for f in output_path.glob("*.apk"))
        print(f"💾 Taille totale: {total_size / (1024*1024):.1f} MB")
    
    return downloaded

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Télécharger APKs F-Droid")
    parser.add_argument("--output", default="../data/benign", help="Dossier de sortie")
    parser.add_argument("--count", type=int, default=50, help="Nombre d'APKs")
    
    args = parser.parse_args()
    
    count = download_fdroid_apks(args.output, args.count)
    
    print("\n" + "="*60)
    print(" Prochaines Étapes")
    print("="*60)
    print(f"\n✅ {count} APKs bénignes téléchargées")
    print("\n📥 Pour les malwares, 2 options:")
    print("\n  Option 1 - Utiliser des samples de test:")
    print("    python train_model_enhanced.py --real-data")
    print("    (Le script générera des données synthétiques pour malware)")
    
    print("\n  Option 2 - Attendre accès dataset académique:")
    print("    - Drebin, AndroZoo, etc.")
    
    print("\n🚀 Ou commencer l'extraction maintenant:")
    print(f"    python extract_features_from_apks.py \\")
    print(f"      --benign-dir {args.output} \\")
    print(f"      --output benign_features.csv")
    print()
