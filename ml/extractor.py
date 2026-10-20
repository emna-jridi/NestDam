"""
Drebin-style feature extractor for one APK.

This is the ONLY feature code: the training pipeline and the live scan endpoint
both call extract_features(), so the model always sees the same features.

Output: {"tokens": [...], "numeric": {...}}
    tokens  -> binary features, prefixed by family:
        perm::<permission>         requested permissions
        feat::<hardware feature>   uses-feature
        intent::<action>           intent-filter actions
        api::<class>               framework classes the code references
        sapi::<class>-><method>    suspicious API calls (SMS, exec, reflection, crypto...)
        meta::manifest_unparsable  manifest corrupted on purpose (anti-analysis trick)
        meta::zip_fake_encryption  zip entries flagged "encrypted" to break analysis tools
    numeric -> counts / sizes
"""

import zipfile

from loguru import logger
from androguard.core.apk import APK
from androguard.core.dex import DEX

logger.remove()  # androguard is very chatty

ANDROID_NS = "{http://schemas.android.com/apk/res/android}"

# Only keep framework classes, not the app's own code (too app-specific to generalize)
FRAMEWORK_PREFIXES = ("Landroid/", "Ljava/", "Ljavax/", "Ldalvik/", "Lorg/apache/http/")

SUSPICIOUS_APIS = {
    ("Landroid/telephony/SmsManager;", "sendTextMessage"),
    ("Landroid/telephony/SmsManager;", "sendMultipartTextMessage"),
    ("Landroid/telephony/SmsManager;", "sendDataMessage"),
    ("Landroid/telephony/TelephonyManager;", "getDeviceId"),
    ("Landroid/telephony/TelephonyManager;", "getSubscriberId"),
    ("Landroid/telephony/TelephonyManager;", "getSimSerialNumber"),
    ("Landroid/telephony/TelephonyManager;", "getLine1Number"),
    ("Ljava/lang/Runtime;", "exec"),
    ("Ljava/lang/ProcessBuilder;", "start"),
    ("Ljava/lang/System;", "loadLibrary"),
    ("Ljava/lang/System;", "load"),
    ("Ldalvik/system/DexClassLoader;", "<init>"),
    ("Ldalvik/system/PathClassLoader;", "<init>"),
    ("Ldalvik/system/InMemoryDexClassLoader;", "<init>"),
    ("Ljava/lang/Class;", "forName"),
    ("Ljava/lang/reflect/Method;", "invoke"),
    ("Ljavax/crypto/Cipher;", "getInstance"),
    ("Ljavax/crypto/Cipher;", "doFinal"),
    ("Landroid/util/Base64;", "decode"),
    ("Landroid/app/admin/DevicePolicyManager;", "lockNow"),
    ("Landroid/app/admin/DevicePolicyManager;", "resetPassword"),
    ("Landroid/content/pm/PackageManager;", "setComponentEnabledSetting"),
    ("Landroid/content/pm/PackageManager;", "getInstalledPackages"),
    ("Landroid/content/pm/PackageManager;", "getInstalledApplications"),
    ("Landroid/accessibilityservice/AccessibilityService;", "performGlobalAction"),
    ("Landroid/view/WindowManager;", "addView"),
    ("Landroid/location/LocationManager;", "getLastKnownLocation"),
    ("Landroid/location/LocationManager;", "requestLocationUpdates"),
    ("Landroid/media/AudioRecord;", "startRecording"),
    ("Landroid/media/MediaRecorder;", "start"),
    ("Landroid/hardware/Camera;", "open"),
    ("Landroid/content/ContentResolver;", "query"),
    ("Landroid/net/wifi/WifiManager;", "getConnectionInfo"),
    ("Ljava/net/URL;", "openConnection"),
    ("Ljava/net/Socket;", "<init>"),
}


def _manifest_tokens(apk: APK) -> tuple[set[str], dict]:
    tokens = set()
    tokens.update(f"perm::{p}" for p in apk.get_permissions())
    tokens.update(f"feat::{f}" for f in apk.get_features())

    manifest = apk.get_android_manifest_xml()
    counts = {"activities": 0, "services": 0, "receivers": 0, "providers": 0}
    if manifest is not None:
        for action in manifest.iter("action"):
            name = action.get(f"{ANDROID_NS}name")
            if name:
                tokens.add(f"intent::{name}")
        for tag, key in (("activity", "activities"), ("service", "services"),
                         ("receiver", "receivers"), ("provider", "providers")):
            counts[key] = sum(1 for _ in manifest.iter(tag))
    return tokens, counts


def _code_tokens(dex_blobs) -> tuple[set[str], int]:
    tokens = set()
    num_dex = 0
    for raw in dex_blobs:
        num_dex += 1
        try:
            dex = DEX(raw)
        except Exception:
            continue
        for i in range(dex.get_len_methods()):
            ref = dex.get_cm_method(i)
            if not ref:
                continue
            cls, name = ref[0], ref[1]
            if cls.startswith(FRAMEWORK_PREFIXES):
                tokens.add(f"api::{cls}")
            if (cls, name) in SUSPICIOUS_APIS:
                tokens.add(f"sapi::{cls}->{name}")
    return tokens, num_dex


def _to_int(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _raw_dex_blobs(apk_path: str):
    """Read classes*.dex straight from the zip (used when the manifest can't be parsed)."""
    with zipfile.ZipFile(apk_path) as zf:
        for info in zf.infolist():
            if info.filename.startswith("classes") and info.filename.endswith(".dex"):
                info.flag_bits &= ~0x1  # fake "encrypted" flag: Android ignores it, so do we
                yield zf.read(info)


def extract_features(apk_path: str) -> dict:
    with zipfile.ZipFile(apk_path) as zf:
        names = zf.namelist()
        fake_encryption = any(info.flag_bits & 0x1 for info in zf.infolist())
    native_libs = sum(1 for n in names if n.startswith("lib/") and n.endswith(".so"))

    try:
        apk = APK(apk_path)
    except Exception:
        # Malware often corrupts AndroidManifest.xml on purpose: Android still installs it,
        # but parsers crash. Keep the code features and flag the trick itself.
        apk = None

    if apk is not None:
        tokens, counts = _manifest_tokens(apk)
        code_tokens, num_dex = _code_tokens(apk.get_all_dex())
        permissions = apk.get_permissions()
        min_sdk, target_sdk = _to_int(apk.get_min_sdk_version()), _to_int(apk.get_target_sdk_version())
    else:
        tokens = {"meta::manifest_unparsable"}
        counts = {"activities": 0, "services": 0, "receivers": 0, "providers": 0}
        code_tokens, num_dex = _code_tokens(_raw_dex_blobs(apk_path))
        permissions, min_sdk, target_sdk = [], 0, 0
    tokens |= code_tokens
    if fake_encryption:
        tokens.add("meta::zip_fake_encryption")

    numeric = {
        **counts,
        "num_permissions": len(permissions),
        "num_dex": num_dex,
        "native_libs": native_libs,
        "min_sdk": min_sdk,
        "target_sdk": target_sdk,
        "num_files": len(names),
    }
    return {"tokens": sorted(tokens), "numeric": numeric}
