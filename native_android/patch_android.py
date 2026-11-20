import pathlib
import re

# 1. Cập nhật compileSdkVersion = 35, targetSdkVersion = 35, minSdkVersion = 24
vars_path = pathlib.Path("android/variables.gradle")
if vars_path.exists():
    txt = vars_path.read_text(encoding="utf-8")
    txt = re.sub(r"minSdkVersion\s*=\s*\d+", "minSdkVersion = 24", txt)
    txt = re.sub(r"compileSdkVersion\s*=\s*\d+", "compileSdkVersion = 35", txt)
    txt = re.sub(r"targetSdkVersion\s*=\s*\d+", "targetSdkVersion = 35", txt)
    vars_path.write_text(txt, encoding="utf-8")
    print("Patched android/variables.gradle -> SDK 35!")

# 2. Cấu hình AndroidManifest.xml (Quyền Vị trí Wi-Fi, Micro, Camera, Bluetooth BLE, Ngang sensorLandscape, HTTP Cleartext)
manifest_path = pathlib.Path("android/app/src/main/AndroidManifest.xml")
if manifest_path.exists():
    m_txt = manifest_path.read_text(encoding="utf-8")
    perms = '''
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
    <queries>
        <intent><action android:name="android.speech.RecognitionService" /></intent>
        <intent><action android:name="android.intent.action.TTS_SERVICE" /></intent>
    </queries>
'''
    if "ACCESS_FINE_LOCATION" not in m_txt:
        m_txt = m_txt.replace("<application", perms + "\n    <application", 1)
    if "usesCleartextTraffic" not in m_txt:
        m_txt = m_txt.replace("<application", '<application android:usesCleartextTraffic="true"', 1)
    if "screenOrientation" not in m_txt:
        m_txt = m_txt.replace(
            'android:name=".MainActivity"',
            'android:name=".MainActivity" android:screenOrientation="sensorLandscape"',
            1
        )
    manifest_path.write_text(m_txt, encoding="utf-8")
    print("Patched AndroidManifest.xml successfully!")
