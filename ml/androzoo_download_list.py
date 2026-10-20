#!/usr/bin/env python3
"""
Download the AndroZoo app list (latest.csv.gz).

Each row describes one APK: sha256, pkg_name, dex_date, apk_size, vt_detection, markets...
We use it later to pick malware (vt_detection >= 4) and benign (vt_detection == 0) samples.

Usage:
    python ml/androzoo_download_list.py

The download resumes automatically if interrupted (just run it again).
"""

import os
import sys
import time
import urllib.request

LIST_URL = "https://androzoo.uni.lu/static/lists/latest.csv.gz"
OUT_DIR = os.path.join(os.path.dirname(__file__), "data", "androzoo")
OUT_PATH = os.path.join(OUT_DIR, "latest.csv.gz")
CHUNK = 1024 * 1024  # 1 MB
MAX_RETRIES = 50
RETRY_WAIT_S = 10


def remote_size() -> int:
    req = urllib.request.Request(LIST_URL, method="HEAD")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return int(resp.headers.get("Content-Length", 0))


def local_size() -> int:
    return os.path.getsize(OUT_PATH) if os.path.exists(OUT_PATH) else 0


def download_once(total: int) -> None:
    """Download from the current local size to the end. Raises on network errors."""
    done = local_size()
    headers = {"Range": f"bytes={done}-"} if done else {}
    req = urllib.request.Request(LIST_URL, headers=headers)

    with urllib.request.urlopen(req, timeout=60) as resp:
        # Server ignored the Range header: start over instead of appending a duplicate.
        if done and resp.status != 206:
            print("\n  server did not resume, restarting from 0")
            done = 0
        mode = "ab" if done else "wb"

        start, start_done = time.time(), done
        with open(OUT_PATH, mode) as f:
            while True:
                chunk = resp.read(CHUNK)
                if not chunk:
                    break
                f.write(chunk)
                done += len(chunk)
                if total:
                    pct = done * 100 / total
                    speed = ((done - start_done) / 1e6) / max(time.time() - start, 1e-6)
                    sys.stdout.write(f"\r  {done / 1e9:.2f} / {total / 1e9:.2f} GB ({pct:.1f}%) {speed:.1f} MB/s   ")
                    sys.stdout.flush()


def download() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    total = remote_size()

    print(f"Downloading {LIST_URL}")
    print(f"  -> {OUT_PATH}")

    for attempt in range(1, MAX_RETRIES + 1):
        if total and local_size() >= total:
            print(f"\nDone: {OUT_PATH} ({total / 1e9:.2f} GB)")
            return
        try:
            download_once(total)
        except (TimeoutError, ConnectionError, OSError) as e:
            print(f"\n  network error ({e.__class__.__name__}), retry {attempt}/{MAX_RETRIES} in {RETRY_WAIT_S}s...")
            time.sleep(RETRY_WAIT_S)

    print("\nGave up after too many errors. Run again to resume.")
    sys.exit(1)


if __name__ == "__main__":
    try:
        download()
    except KeyboardInterrupt:
        print("\nStopped. Run again to resume.")
        sys.exit(1)
