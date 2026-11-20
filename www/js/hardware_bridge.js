// Robot 2027 V1.4 - Cầu nối Phần cứng Native Android + Web Fallback
window.HardwareBridge = (function () {
  function native() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.RobotNative;
  }

  let bleConnected = false;
  let bleDeviceName = 'Chưa kết nối';
  let currentBattery = 85;
  let currentTemp = 36.5;
  let isCharging = false;
  let wifiSsid = 'Wi-Fi Web';
  let localIp = '192.168.1.100';
  let webrtcPc = null;
  let webrtcStream = null;
  let webrtcPollTimer = null;

  async function init() {
    const p = native();
    if (p) {
      try {
        await p.requestAllPermissions();
      } catch (e) {}

      p.addListener('ttsStart', () => {
        window.dispatchEvent(new CustomEvent('robot:ttsStart'));
      });
      p.addListener('ttsEnd', () => {
        window.dispatchEvent(new CustomEvent('robot:ttsEnd'));
      });
      p.addListener('speechPartial', (data) => {
        window.dispatchEvent(new CustomEvent('robot:speechPartial', { detail: data.text || '' }));
      });
      p.addListener('speechResult', (data) => {
        window.dispatchEvent(new CustomEvent('robot:speechResult', { detail: data.text || '' }));
      });
      p.addListener('speechError', (data) => {
        window.dispatchEvent(new CustomEvent('robot:speechError', { detail: data.code || 0 }));
      });
      p.addListener('bleData', (data) => {
        const msg = (data.message || '').trim();
        window.dispatchEvent(new CustomEvent('robot:bleData', { detail: msg }));
      });
      p.addListener('bleState', (data) => {
        bleConnected = !!data.connected;
        bleDeviceName = data.name || (bleConnected ? 'ESP32-Robot' : 'Chưa kết nối');
        window.dispatchEvent(new CustomEvent('robot:bleState', { detail: { connected: bleConnected, name: bleDeviceName } }));
      });
    }

    // Lắng nghe cảm biến nghiêng/ngã trên thiết bị
    if (window.DeviceOrientationEvent) {
      let lastTiltWarn = 0;
      window.addEventListener('deviceorientation', (ev) => {
        const s = window.RobotStorage.getSettings();
        if (!s.tiltAlert) return;
        const beta = Math.abs(ev.beta || 0);
        const gamma = Math.abs(ev.gamma || 0);
        if ((beta > 75 || gamma > 75) && Date.now() - lastTiltWarn > 12000) {
          lastTiltWarn = Date.now();
          window.dispatchEvent(new CustomEvent('robot:tiltAlert'));
        }
      });
    }

    await refreshDeviceStatus();
    setInterval(refreshDeviceStatus, 10000);
  }

  async function refreshDeviceStatus() {
    const p = native();
    if (p) {
      try {
        const st = await p.getDeviceStatus();
        currentBattery = st.battery ?? currentBattery;
        currentTemp = st.temperature ?? currentTemp;
        isCharging = !!st.isCharging;
        wifiSsid = st.wifiSsid || 'Wi-Fi';
        localIp = st.localIp || '0.0.0.0';
      } catch (e) {}
    } else if (navigator.getBattery) {
      try {
        const b = await navigator.getBattery();
        currentBattery = Math.round(b.level * 100);
        isCharging = b.charging;
      } catch (e) {}
    }

    // Logic bảo vệ pin 50% - 90% qua BLE ESP32
    const settings = window.RobotStorage.getSettings();
    if (settings.autoChargeGuard && bleConnected) {
      if (currentBattery >= 90 && isCharging) {
        sendBleCommand('CHG:OFF');
      } else if (currentBattery <= 50 && !isCharging) {
        sendBleCommand('CHG:ON');
      }
    }

    // Tự động kích hoạt Chế độ Sinh tồn 50% nếu pin yếu và không sạc
    if (currentBattery <= 50 && !isCharging && !settings.survivalMode50) {
      window.dispatchEvent(new CustomEvent('robot:lowBattery50', { detail: currentBattery }));
    }

    window.dispatchEvent(new CustomEvent('robot:statusUpdated', {
      detail: {
        battery: currentBattery,
        temp: currentTemp,
        isCharging,
        wifiSsid,
        localIp,
        bleConnected,
        bleDeviceName
      }
    }));
  }

  async function setBrightness(level) {
    const p = native();
    if (p) {
      try { await p.setBrightness({ level }); } catch (e) {}
    }
  }

  async function setVolume(level) {
    const p = native();
    if (p) {
      try { await p.setVolume({ level }); } catch (e) {}
    }
  }

  async function speak(text, lang = 'en-US', rate = 0.92) {
    if (!text) return;
    const p = native();
    if (p) {
      try {
        await p.speak({ text, lang, rate, pitch: 1.08 });
        return;
      } catch (e) {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = rate;
      u.pitch = 1.08;
      u.onstart = () => window.dispatchEvent(new CustomEvent('robot:ttsStart'));
      u.onend = () => window.dispatchEvent(new CustomEvent('robot:ttsEnd'));
      u.onerror = () => window.dispatchEvent(new CustomEvent('robot:ttsEnd'));
      window.speechSynthesis.speak(u);
    }
  }

  async function stopSpeak() {
    const p = native();
    if (p) {
      try { await p.stopSpeak(); } catch (e) {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    window.dispatchEvent(new CustomEvent('robot:ttsEnd'));
  }

  async function startListening(lang = 'en-US') {
    const p = native();
    if (p) {
      try {
        await p.startListening({ lang });
        return true;
      } catch (e) {
        return false;
      }
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
    try {
      const rec = new SR();
      rec.lang = lang;
      rec.interimResults = true;
      rec.onresult = (ev) => {
        const res = ev.results[ev.results.length - 1];
        const txt = res[0].transcript;
        if (res.isFinal) {
          window.dispatchEvent(new CustomEvent('robot:speechResult', { detail: txt }));
        } else {
          window.dispatchEvent(new CustomEvent('robot:speechPartial', { detail: txt }));
        }
      };
      rec.onerror = () => window.dispatchEvent(new CustomEvent('robot:speechError', { detail: -1 }));
      rec.start();
      window._webRec = rec;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function stopListening() {
    const p = native();
    if (p) {
      try { await p.stopListening(); } catch (e) {}
    }
    if (window._webRec) {
      try { window._webRec.stop(); } catch (e) {}
      window._webRec = null;
    }
  }

  async function openWifiSettings() {
    const p = native();
    if (p) {
      try { await p.openWifiSettings(); return; } catch (e) {}
    }
    alert('Đang chạy trên trình duyệt Web: Hãy mở Cài đặt Wi-Fi của thiết bị.');
  }

  async function setKioskMode(enabled) {
    const p = native();
    if (p) {
      try { await p.setKioskMode({ enabled }); } catch (e) {}
    }
  }

  // Bluetooth BLE với mạch ESP32
  async function scanBleDevices() {
    const p = native();
    if (p) {
      try {
        const res = await p.scanBle();
        return res.devices || [];
      } catch (e) {
        return [];
      }
    }
    return [
      { name: 'ESP32-Robot2027 (Mô phỏng)', address: 'AA:BB:CC:11:22:33' }
    ];
  }

  async function connectBle(address, name) {
    const p = native();
    if (p) {
      try {
        await p.connectBle({ address });
        bleConnected = true;
        bleDeviceName = name || address;
        return true;
      } catch (e) {
        return false;
      }
    }
    bleConnected = true;
    bleDeviceName = name || 'ESP32-Sim';
    window.dispatchEvent(new CustomEvent('robot:bleState', { detail: { connected: true, name: bleDeviceName } }));
    return true;
  }

  async function sendBleCommand(cmd) {
    const settings = window.RobotStorage.getSettings();
    if (!settings.bleSyncEnabled) return;
    const p = native();
    if (p && bleConnected) {
      try { await p.sendBle({ command: cmd + '\n' }); } catch (e) {}
    }
  }

  // WebRTC P2P Camera Giám Sát Từ Xa qua PHP Signaling (0% tải video qua server)
  async function startCameraMonitor(videoEl, statusCb) {
    try {
      webrtcStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
      if (videoEl) {
        videoEl.srcObject = webrtcStream;
        videoEl.play();
      }
      if (statusCb) statusCb('Camera trước đang bật. Sẵn sàng kết nối WebRTC P2P qua api_user.php...');
      return true;
    } catch (e) {
      if (statusCb) statusCb('Không thể mở Camera trước: ' + e.message);
      return false;
    }
  }

  function stopCameraMonitor(videoEl) {
    if (webrtcPollTimer) {
      clearInterval(webrtcPollTimer);
      webrtcPollTimer = null;
    }
    if (webrtcPc) {
      webrtcPc.close();
      webrtcPc = null;
    }
    if (webrtcStream) {
      webrtcStream.getTracks().forEach(t => t.stop());
      webrtcStream = null;
    }
    if (videoEl) videoEl.srcObject = null;
  }

  return {
    init,
    refreshDeviceStatus,
    setBrightness,
    setVolume,
    speak,
    stopSpeak,
    startListening,
    stopListening,
    openWifiSettings,
    setKioskMode,
    scanBleDevices,
    connectBle,
    sendBleCommand,
    startCameraMonitor,
    stopCameraMonitor,
    getTelemetry: () => ({ battery: currentBattery, temp: currentTemp, isCharging, wifiSsid, localIp, bleConnected, bleDeviceName })
  };
})();
