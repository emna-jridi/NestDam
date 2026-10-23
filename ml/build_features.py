#!/usr/bin/env python3
"""
Download each APK of a selection and extract its features, in memory.

APKs never touch the disk (small footprint, no antivirus blocking); features go to features.jsonl.
Safe to stop and re-run: APKs already in features.jsonl / failed.csv are skipped.

Datasets (folder under ml/data/, each with a selection.csv):
    open      -> open_select.py      (MalwareBazaar + F-Droid, needs ABUSECH_AUTH_KEY)
    androzoo  -> androzoo_select.py  (needs ANDROZOO_API_KEY)

Usage:
    py -3.12 ml/build_features.py open          # whole selection
    py -3.12 ml/build_features.py open 10       # first 10 only (quick test)
    py -3.12 ml/build_features.py open --retry-failed   # retry APKs in failed.csv (e.g. after an extractor fix)
"""

import csv
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ProcessPoolExecutor, as_completed
from itertools import zip_longest

import pyzipper

from extractor import extract_features

ML_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(ML_DIR, "..", ".env")

MAX_DOWNLOAD_MB = 30
WORKERS = 4
RETRIES = 3
RATE_LIMIT_RETRIES = 5

KEY_NAMES = {"androzoo": "ANDROZOO_API_KEY", "malwarebazaar": "ABUSECH_AUTH_KEY", "fdroid": None}


class KeyRejected(Exception):
    """The API key is invalid: stop the whole run instead of failing every APK."""


class RateLimited(Exception):
    """The server keeps answering 429: skip for now, retry on the next run (not a real failure)."""


def load_env_key(name: str) -> str:
    key = os.environ.get(name)
    if not key and os.path.exists(ENV_PATH):
        with open(ENV_PATH, encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith(f"{name}="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit(f"{name} not found in NestDam/.env")
    return key


def http_get(req: urllib.request.Request) -> bytes:
    last_error = None
    rate_limited = 0
    attempt = 0
    while attempt < RETRIES:
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                size = int(resp.headers.get("Content-Length") or 0)
                if size > MAX_DOWNLOAD_MB * 1024 * 1024:
                    raise ValueError(f"too big ({size / 1e6:.0f} MB)")
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise KeyRejected(f"HTTP {e.code}") from e
            if e.code == 429:  # too many requests: wait (Retry-After if given), don't burn a retry
                rate_limited += 1
                if rate_limited > RATE_LIMIT_RETRIES:
                    raise RateLimited() from e
                time.sleep(int(e.headers.get("Retry-After") or 0) or 60 * rate_limited)
                continue
            last_error = e
        except ValueError:
            raise
        except Exception as e:  # timeouts, dropped connections
            last_error = e
        attempt += 1
        time.sleep(5 * attempt)
    raise RuntimeError(f"download failed: {last_error}")


def fetch_apk(row: dict, keys: dict) -> bytes:
    source = row["source"]
    if source == "androzoo":
        query = urllib.parse.urlencode({"apikey": keys["androzoo"], "sha256": row["ref"]})
        return http_get(urllib.request.Request(f"https://androzoo.uni.lu/api/download?{query}"))
    if source == "fdroid":
        return http_get(urllib.request.Request(f"https://f-droid.org/repo/{row['ref']}"))
    if source == "malwarebazaar":
        data = urllib.parse.urlencode({"query": "get_file", "sha256_hash": row["ref"]}).encode()
        blob = http_get(urllib.request.Request("https://mb-api.abuse.ch/api/v1/", data=data,
                                               headers={"Auth-Key": keys["malwarebazaar"]}))
        if not blob.startswith(b"PK"):
            raise RuntimeError(f"not a zip: {blob[:80]!r}")
        with pyzipper.AESZipFile(__import__("io").BytesIO(blob)) as zf:
            zf.setpassword(b"infected")
            return zf.read(zf.namelist()[0])
    raise ValueError(f"unknown source {source}")


def process(row: dict, keys: dict) -> dict:
    """Runs in a worker process: download -> verify -> extract, all in memory.
    Never writing the APK to disk keeps the antivirus from blocking malware samples."""
    content = fetch_apk(row, keys)
    if hashlib.sha256(content).hexdigest().lower() != row["sha256"].lower():
        raise ValueError("sha256 mismatch")
    features = extract_features(content)
    return {"sha256": row["sha256"], "label": row["label"], "source": row["source"], **features}


def already_done(features_path: str, failed_path: str, retry_failed: bool) -> set[str]:
    done = set()
    if os.path.exists(features_path):
        with open(features_path, encoding="utf-8") as f:
            done.update(json.loads(line)["sha256"] for line in f if line.strip())
    if os.path.exists(failed_path) and not retry_failed:
        with open(failed_path, encoding="utf-8") as f:
            # 429 = rate limit, not a bad APK (older runs saved those): retry them
            done.update(line.split(",", 1)[0] for line in f if line.strip() and "429" not in line)
    return done


def main(dataset: str, limit: int | None, retry_failed: bool) -> None:
    data_dir = os.path.join(ML_DIR, "data", dataset)
    features_path = os.path.join(data_dir, "features.jsonl")
    failed_path = os.path.join(data_dir, "failed.csv")

    with open(os.path.join(data_dir, "selection.csv"), encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    for r in rows:  # older androzoo selections have no source/ref columns
        r.setdefault("source", "androzoo")
        r.setdefault("ref", r["sha256"])
    # Interleave classes: stopping early still leaves a balanced dataset, and requests
    # alternate between servers instead of hammering one (MalwareBazaar rate-limits)
    malware = [r for r in rows if r["label"] == "malware"]
    benign = [r for r in rows if r["label"] == "benign"]
    rows = [r for pair in zip_longest(malware, benign) for r in pair if r is not None]
    if limit:
        rows = rows[:limit]

    sources = {r["source"] for r in rows}
    keys = {s: load_env_key(KEY_NAMES[s]) for s in sources if KEY_NAMES[s]}

    done = already_done(features_path, failed_path, retry_failed)
    todo = [r for r in rows if r["sha256"] not in done]
    print(f"{len(rows) - len(todo)} already done, {len(todo)} to go ({WORKERS} workers)")

    ok = failed = skipped = 0
    start = time.time()
    with ProcessPoolExecutor(max_workers=WORKERS) as pool, \
            open(features_path, "a", encoding="utf-8") as out, \
            open(failed_path, "w" if retry_failed else "a", encoding="utf-8") as fail_out:
        futures = {pool.submit(process, row, keys): row for row in todo}
        for i, future in enumerate(as_completed(futures), 1):
            row = futures[future]
            try:
                out.write(json.dumps(future.result()) + "\n")
                out.flush()
                ok += 1
            except KeyRejected as e:
                pool.shutdown(wait=False, cancel_futures=True)
                sys.exit(f"\n{row['source']} rejected the API key ({e}). Check {KEY_NAMES[row['source']]} in NestDam/.env.")
            except RateLimited:
                skipped += 1  # not saved: retried on the next run
            except Exception as e:
                error = str(e)
                for k in keys.values():
                    error = error.replace(k, "***")
                error = error.replace(",", ";").replace("\n", " ")[:200]
                fail_out.write(f"{row['sha256']},{row['label']},{error}\n")
                fail_out.flush()
                failed += 1

            elapsed = time.time() - start
            eta_h = (len(todo) - i) * elapsed / i / 3600
            sys.stdout.write(f"\r  {i}/{len(todo)} | ok {ok} | failed {failed} | rate-limited {skipped} | ETA {eta_h:.1f} h   ")
            sys.stdout.flush()

    print(f"\nDone. Features: {features_path}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    try:
        main(args[0], int(args[1]) if len(args) > 1 else None, "--retry-failed" in sys.argv)
    except KeyboardInterrupt:
        print("\nStopped. Run again to resume.")
        sys.exit(1)
