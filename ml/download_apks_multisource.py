"""
Multi-Source APK Downloader
===========================
Downloads APK samples from multiple sources (no AndroZoo needed to start)

Supports:
- MalwareBazaar (instant, no registration)
- Koodous (5 min registration, 100/day)
- APKMirror (benign apps, manual + automated)

Usage:
    python download_apks_multisource.py --source malwarebazaar --count 100
    python download_apks_multisource.py --source koodous --token YOUR_TOKEN --count 100
"""

import requests
import argparse
import os
import time
import json
from pathlib import Path

# ============================================================================
# MALWAREBAZAAR (No registration needed!)
# ============================================================================

def download_from_malwarebazaar(output_dir, count=100):
    """
    Download Android malware from MalwareBazaar
    Website: https://bazaar.abuse.ch/
    """
    print(f"[MalwareBazaar] Downloading {count} Android malware samples...")
    os.makedirs(output_dir, exist_ok=True)
    
    # Get recent Android malware
    url = "https://mb-api.abuse.ch/api/v1/"
    
    downloaded = 0
    offset = 0
    
    while downloaded < count:
        # Query for Android malware
        data = {
            "query": "get_taginfo",
            "tag": "android",
            "limit": 100
        }
        
        try:
            response = requests.post(url, data=data, timeout=30)
            if response.status_code != 200:
                print(f"  ✗ API error: {response.status_code}")
                break
            
            result = response.json()
            if result.get("query_status") != "ok":
                print(f"  ✗ Query failed")
                break
            
            samples = result.get("data", [])
            if not samples:
                print(f"  ✗ No more samples available")
                break
            
            for sample in samples[:count - downloaded]:
                sha256 = sample.get("sha256_hash")
                if not sha256:
                    continue
                
                print(f"  [{downloaded+1}/{count}] Downloading {sha256[:16]}...")
                
                # Download APK
                download_data = {
                    "query": "get_file",
                    "sha256_hash": sha256
                }
                
                try:
                    dl_response = requests.post(url, data=download_data, timeout=60)
                    if dl_response.status_code == 200:
                        apk_path = os.path.join(output_dir, f"{sha256}.apk")
                        with open(apk_path, "wb") as f:
                            f.write(dl_response.content)
                        downloaded += 1
                        print(f"    ✓ Saved")
                    else:
                        print(f"    ✗ Failed: {dl_response.status_code}")
                except Exception as e:
                    print(f"    ✗ Error: {e}")
                
                time.sleep(0.5)  # Be nice to the API
            
            offset += len(samples)
            
        except Exception as e:
            print(f"  ✗ Error: {e}")
            break
    
    print(f"\n✓ Downloaded {downloaded} samples to {output_dir}")
    return downloaded

# ============================================================================
# KOODOUS (Easy registration)
# ============================================================================

def download_from_koodous(output_dir, api_token, count=100):
    """
    Download Android malware from Koodous
    Website: https://koodous.com/
    Requires: Free registration + API token
    """
    print(f"[Koodous] Downloading {count} Android malware samples...")
    os.makedirs(output_dir, exist_ok=True)
    
    headers = {"Authorization": f"Token {api_token}"}
    base_url = "https://api.koodous.com"
    
    downloaded = 0
    page = 1
    
    while downloaded < count:
        # Search for malware (rating:positive means detected as malware)
        params = {
            "search": "rating:positive",
            "page_size": min(100, count - downloaded),
            "page": page
        }
        
        try:
            response = requests.get(
                f"{base_url}/apks/search",
                headers=headers,
                params=params,
                timeout=30
            )
            
            if response.status_code != 200:
                print(f"  ✗ API error: {response.status_code}")
                break
            
            data = response.json()
            apks = data.get("results", [])
            
            if not apks:
                print(f"  ✗ No more samples")
                break
            
            for apk in apks[:count - downloaded]:
                sha256 = apk["sha256"]
                
                print(f"  [{downloaded+1}/{count}] Downloading {sha256[:16]}...")
                
                # Download APK
                try:
                    dl_response = requests.get(
                        f"{base_url}/apks/{sha256}/download",
                        headers=headers,
                        timeout=60,
                        stream=True
                    )
                    
                    if dl_response.status_code == 200:
                        apk_path = os.path.join(output_dir, f"{sha256}.apk")
                        with open(apk_path, "wb") as f:
                            for chunk in dl_response.iter_content(chunk_size=8192):
                                f.write(chunk)
                        downloaded += 1
                        print(f"    ✓ Saved")
                    else:
                        print(f"    ✗ Failed: {dl_response.status_code}")
                
                except Exception as e:
                    print(f"    ✗ Error: {e}")
                
                time.sleep(1)  # Rate limit: 1 req/sec
            
            page += 1
            
        except Exception as e:
            print(f"  ✗ Error: {e}")
            break
    
    print(f"\n✓ Downloaded {downloaded} samples to {output_dir}")
    return downloaded

# ============================================================================
# APK MIRROR (Benign apps - requires manual download)
# ============================================================================

def download_benign_apps_guide():
    """
    Provide instructions for downloading benign apps
    """
    print("\n" + "="*70)
    print("Downloading Benign Apps from APKMirror")
    print("="*70)
    print("\nAPKMirror requires manual download (CAPTCHA protection)")
    print("\nSteps:")
    print("1. Visit: https://www.apkmirror.com/")
    print("2. Search for popular apps:")
    print("   - WhatsApp, Instagram, Facebook, Twitter, Spotify")
    print("   - Google Maps, YouTube, Gmail, Chrome")
    print("   - Games: Candy Crush, Subway Surfers, etc.")
    print("3. Click 'Download APK'")
    print("4. Save to: data/benign/")
    print("\nAlternative: APKPure")
    print("   https://apkpure.com/ (slightly easier downloads)")
    print("\nTarget: 100-200 popular, legitimate apps")
    print("="*70)

# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description='Download APK samples from multiple sources')
    parser.add_argument('--source', choices=['malwarebazaar', 'koodous', 'benign'], required=True,
                       help='Source to download from')
    parser.add_argument('--output', default='data/malware', help='Output directory')
    parser.add_argument('--count', type=int, default=100, help='Number of samples to download')
    parser.add_argument('--token', help='API token (required for Koodous)')
    
    args = parser.parse_args()
    
    print("\n" + "="*70)
    print("Multi-Source APK Downloader")
    print("="*70)
    
    if args.source == 'malwarebazaar':
        download_from_malwarebazaar(args.output, args.count)
    
    elif args.source == 'koodous':
        if not args.token:
            print("\n✗ Error: --token required for Koodous")
            print("\nHow to get token:")
            print("1. Register at https://koodous.com/")
            print("2. Go to Settings → API Token")
            print("3. Copy your token")
            print("\nUsage:")
            print("  python download_apks_multisource.py --source koodous --token YOUR_TOKEN")
            return
        
        download_from_koodous(args.output, args.token, args.count)
    
    elif args.source == 'benign':
        download_benign_apps_guide()
    
    print("\n" + "="*70)
    print("Next Steps:")
    print("="*70)
    print("1. Verify downloads: ls -lh " + args.output)
    print("2. Extract features: python extract_features_from_apks.py")
    print("3. Train model: python train_model_enhanced.py --features features.csv")
    print("="*70 + "\n")

if __name__ == '__main__':
    main()
