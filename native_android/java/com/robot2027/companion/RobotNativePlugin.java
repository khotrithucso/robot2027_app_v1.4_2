package com.robot2027.companion;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.text.format.Formatter;
import android.view.View;
import android.view.WindowManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(name = "RobotNative")
public class RobotNativePlugin extends Plugin {

    private static final UUID UART_SERVICE_UUID = UUID.fromString("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
    private static final UUID UART_RX_UUID      = UUID.fromString("6E400002-B5A3-F393-E0A9-E50E24DCCA9E");
    private static final UUID UART_TX_UUID      = UUID.fromString("6E400003-B5A3-F393-E0A9-E50E24DCCA9E");

    private TextToSpeech tts;
    private SpeechRecognizer speechRecognizer;
    private int savedNotifVol = -1;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private BluetoothGatt activeGatt;
    private BluetoothGattCharacteristic uartRxChar;

    @Override
    public void load() {
        mainHandler.post(() -> {
            initTTS();
            applyKioskFlags(true);
        });
    }

    private void initTTS() {
        tts = new TextToSpeech(getContext(), status -> {
            if (status == TextToSpeech.SUCCESS) {
                tts.setLanguage(Locale.US);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {
                        JSObject data = new JSObject();
                        data.put("id", utteranceId);
                        notifyListeners("ttsStart", data);
                    }

                    @Override
                    public void onDone(String utteranceId) {
                        JSObject data = new JSObject();
                        data.put("id", utteranceId);
                        notifyListeners("ttsEnd", data);
                    }

                    @Override
                    public void onError(String utteranceId) {
                        JSObject data = new JSObject();
                        data.put("id", utteranceId);
                        notifyListeners("ttsEnd", data);
                    }
                });
            }
        });
    }

    private void applyKioskFlags(boolean enable) {
        Activity activity = getActivity();
        if (activity == null) return;
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        View decorView = activity.getWindow().getDecorView();
        if (enable) {
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
            );
        } else {
            decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    @PluginMethod
    public void requestAllPermissions(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        ArrayList<String> perms = new ArrayList<>();
        perms.add(Manifest.permission.RECORD_AUDIO);
        perms.add(Manifest.permission.CAMERA);
        perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
        perms.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            perms.add(Manifest.permission.BLUETOOTH_CONNECT);
            perms.add(Manifest.permission.BLUETOOTH_SCAN);
        }
        ActivityCompat.requestPermissions(activity, perms.toArray(new String[0]), 2027);
        call.resolve();
    }

    @PluginMethod
    public void getDeviceStatus(PluginCall call) {
        Context ctx = getContext();
        IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
        Intent batteryStatus = ctx.registerReceiver(null, ifilter);

        int level = 100;
        float temp = 36.5f;
        boolean isCharging = false;

        if (batteryStatus != null) {
            int rawLevel = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            if (rawLevel >= 0 && scale > 0) {
                level = Math.round((rawLevel * 100f) / scale);
            }
            int rawTemp = batteryStatus.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 365);
            temp = rawTemp / 10.0f;
            int status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                         status == BatteryManager.BATTERY_STATUS_FULL;
        }

        String wifiSsid = "Chưa kết nối Wi-Fi";
        String localIp = "0.0.0.0";
        try {
            WifiManager wifiManager = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifiManager != null && wifiManager.isWifiEnabled()) {
                WifiInfo info = wifiManager.getConnectionInfo();
                if (info != null) {
                    int ipInt = info.getIpAddress();
                    if (ipInt != 0) {
                        localIp = Formatter.formatIpAddress(ipInt);
                    }
                    String rawSsid = info.getSSID();
                    if (rawSsid != null) {
                        wifiSsid = rawSsid.replace("\"", "");
                    }
                    if (wifiSsid.isEmpty() || wifiSsid.contains("unknown ssid")) {
                        boolean hasLoc = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                            == PackageManager.PERMISSION_GRANTED;
                        wifiSsid = hasLoc ? "Đã kết nối (Bật GPS để hiện tên)" : "Đã kết nối (Cần cấp quyền Vị trí)";
                    }
                }
            }
        } catch (Exception e) {
            wifiSsid = "Wi-Fi Sẵn sàng";
        }

        JSObject ret = new JSObject();
        ret.put("battery", level);
        ret.put("temperature", temp);
        ret.put("isCharging", isCharging);
        ret.put("wifiSsid", wifiSsid);
        ret.put("localIp", localIp);
        call.resolve(ret);
    }

    @PluginMethod
    public void setBrightness(PluginCall call) {
        int level = call.getInt("level", 75);
        float val = Math.max(0.02f, Math.min(1.0f, level / 100.0f));
        mainHandler.post(() -> {
            Activity activity = getActivity();
            if (activity != null) {
                WindowManager.LayoutParams lp = activity.getWindow().getAttributes();
                lp.screenBrightness = val;
                activity.getWindow().setAttributes(lp);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        int level = call.getInt("level", 85);
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am != null) {
            int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int target = Math.round((level / 100.0f) * max);
            am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0);
        }
        call.resolve();
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        String lang = call.getString("lang", "en-US");
        float rate = call.getFloat("rate", 0.92f);
        float pitch = call.getFloat("pitch", 1.08f);

        if (tts == null || text.isEmpty()) {
            call.resolve();
            return;
        }

        mainHandler.post(() -> {
            Locale locale = lang.startsWith("vi") ? new Locale("vi", "VN") : Locale.US;
            tts.setLanguage(locale);
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);
            Bundle params = new Bundle();
            String uttId = "utt_" + System.currentTimeMillis();
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, uttId);
            call.resolve();
        });
    }

    @PluginMethod
    public void stopSpeak(PluginCall call) {
        if (tts != null) {
            tts.stop();
        }
        call.resolve();
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        String lang = call.getString("lang", "en-US");
        mainHandler.post(() -> {
            try {
                muteBeep(true);
                if (speechRecognizer != null) {
                    speechRecognizer.destroy();
                }
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) {
                        mainHandler.postDelayed(() -> muteBeep(false), 350);
                    }
                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() {}
                    @Override public void onError(int error) {
                        muteBeep(false);
                        JSObject err = new JSObject();
                        err.put("code", error);
                        notifyListeners("speechError", err);
                    }
                    @Override public void onResults(Bundle results) {
                        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        String best = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                        JSObject res = new JSObject();
                        res.put("text", best);
                        notifyListeners("speechResult", res);
                    }
                    @Override public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches != null && !matches.isEmpty()) {
                            JSObject res = new JSObject();
                            res.put("text", matches.get(0));
                            notifyListeners("speechPartial", res);
                        }
                    }
                    @Override public void onEvent(int eventType, Bundle params) {}
                });

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                speechRecognizer.startListening(intent);
                call.resolve();
            } catch (Exception e) {
                muteBeep(false);
                call.reject("Mic error: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        mainHandler.post(() -> {
            if (speechRecognizer != null) {
                speechRecognizer.stopListening();
            }
            muteBeep(false);
            call.resolve();
        });
    }

    private void muteBeep(boolean mute) {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            if (mute) {
                if (savedNotifVol < 0) {
                    savedNotifVol = am.getStreamVolume(AudioManager.STREAM_NOTIFICATION);
                }
                am.setStreamVolume(AudioManager.STREAM_NOTIFICATION, 0, 0);
            } else if (savedNotifVol >= 0) {
                am.setStreamVolume(AudioManager.STREAM_NOTIFICATION, savedNotifVol, 0);
                savedNotifVol = -1;
            }
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void openWifiSettings(PluginCall call) {
        mainHandler.post(() -> {
            Intent intent = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? new Intent(Settings.Panel.ACTION_WIFI)
                : new Intent(Settings.ACTION_WIFI_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        });
    }

    @PluginMethod
    public void setKioskMode(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        mainHandler.post(() -> {
            applyKioskFlags(enabled);
            call.resolve();
        });
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void scanBle(PluginCall call) {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = bm != null ? bm.getAdapter() : null;
        if (adapter == null || !adapter.isEnabled()) {
            JSObject ret = new JSObject();
            ret.put("devices", new JSArray());
            call.resolve(ret);
            return;
        }

        BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            JSObject ret = new JSObject();
            ret.put("devices", new JSArray());
            call.resolve(ret);
            return;
        }

        Map<String, String> found = new HashMap<>();
        ScanCallback cb = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                BluetoothDevice dev = result.getDevice();
                if (dev != null && dev.getAddress() != null) {
                    String name = dev.getName();
                    if (name != null && !name.isEmpty()) {
                        found.put(dev.getAddress(), name);
                    }
                }
            }
        };

        scanner.startScan(cb);
        mainHandler.postDelayed(() -> {
            try { scanner.stopScan(cb); } catch (Exception ignored) {}
            JSArray arr = new JSArray();
            for (Map.Entry<String, String> e : found.entrySet()) {
                JSObject obj = new JSObject();
                obj.put("address", e.getKey());
                obj.put("name", e.getValue());
                arr.put(obj);
            }
            JSObject ret = new JSObject();
            ret.put("devices", arr);
            call.resolve(ret);
        }, 2500);
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void connectBle(PluginCall call) {
        String address = call.getString("address", "");
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = bm != null ? bm.getAdapter() : null;
        if (adapter == null || address.isEmpty()) {
            call.reject("BLE không khả dụng");
            return;
        }
        if (activeGatt != null) {
            activeGatt.close();
            activeGatt = null;
        }
        BluetoothDevice device = adapter.getRemoteDevice(address);
        activeGatt = device.connectGatt(getContext(), false, new BluetoothGattCallback() {
            @Override
            public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                JSObject st = new JSObject();
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    st.put("connected", true);
                    st.put("name", device.getName() != null ? device.getName() : address);
                    notifyListeners("bleState", st);
                    gatt.discoverServices();
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    st.put("connected", false);
                    notifyListeners("bleState", st);
                }
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                BluetoothGattService svc = gatt.getService(UART_SERVICE_UUID);
                if (svc != null) {
                    uartRxChar = svc.getCharacteristic(UART_RX_UUID);
                    BluetoothGattCharacteristic txChar = svc.getCharacteristic(UART_TX_UUID);
                    if (txChar != null) {
                        gatt.setCharacteristicNotification(txChar, true);
                    }
                }
            }

            @Override
            public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
                byte[] val = characteristic.getValue();
                if (val != null) {
                    JSObject msg = new JSObject();
                    msg.put("message", new String(val, StandardCharsets.UTF_8));
                    notifyListeners("bleData", msg);
                }
            }
        });
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void sendBle(PluginCall call) {
        String command = call.getString("command", "");
        if (activeGatt != null && uartRxChar != null && !command.isEmpty()) {
            uartRxChar.setValue(command.getBytes(StandardCharsets.UTF_8));
            activeGatt.writeCharacteristic(uartRxChar);
        }
        call.resolve();
    }
}
