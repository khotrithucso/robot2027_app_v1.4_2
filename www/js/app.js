// Robot 2027 V1.4 - Điều phối Trung tâm (6 Tabs, Server Iframes, Setting 8 Modules, Sub-panels 92%)
window.AppController = (function () {
  let activeTab = 'robot';
  let pendingTabAfterPin = null;
  let rewardInterval = null;
  let selectedNotebookTopicId = null;
  let notebookFilter = 'all';

  function showToast(msg) {
    const el = document.getElementById('toastBanner');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2800);
  }

  function isEntertainmentUnlocked() {
    const s = window.RobotStorage.getSettings();
    if (!s.studyOnlyLock) return true;
    return Date.now() < (s.unlockUntilTs || 0);
  }

  function refreshHud() {
    const profile = window.RobotStorage.getActiveProfile();
    const settings = window.RobotStorage.getSettings();
    const tel = window.HardwareBridge.getTelemetry();

    document.getElementById('hudProfile').textContent = `👤 ${profile.name} • ★ ${profile.stars || 0}`;

    const bleEl = document.getElementById('hudBle');
    bleEl.textContent = tel.bleConnected ? `🔌 ${tel.bleDeviceName}` : '🔌 BLE Chờ';
    bleEl.classList.toggle('ble-on', tel.bleConnected);

    const chargeIcon = tel.isCharging ? '⚡' : '🔋';
    document.getElementById('hudBattery').textContent = `${chargeIcon} ${tel.battery}% • ${tel.temp}°C`;

    // Cập nhật trạng thái khóa 2 icon YouTube & Game
    const unlocked = isEntertainmentUnlocked();
    document.getElementById('nav-youtube').classList.toggle('locked', !unlocked);
    document.getElementById('nav-game').classList.toggle('locked', !unlocked);

    // Đếm ngược thời gian thưởng giải trí nếu đang mở
    const timerPill = document.getElementById('hudRewardTimer');
    if (settings.studyOnlyLock && unlocked) {
      const remSec = Math.max(0, Math.floor((settings.unlockUntilTs - Date.now()) / 1000));
      const mm = String(Math.floor(remSec / 60)).padStart(2, '0');
      const ss = String(remSec % 60).padStart(2, '0');
      timerPill.style.display = 'inline-flex';
      timerPill.textContent = `⏳ Giải trí: ${mm}:${ss}`;
    } else {
      timerPill.style.display = 'none';
    }

    // Cập nhật thanh telemetry trong tab Setting
    const setTel = document.getElementById('settingTelemetryBar');
    if (setTel) {
      setTel.innerHTML = `
        <span>🤖 Bot ID: <b>${settings.botId}</b></span>
        <span>📶 Wi-Fi: <b>${tel.wifiSsid}</b> (IP: <b>${tel.localIp}</b>)</span>
        <span>${chargeIcon} Pin: <b>${tel.battery}%</b> (${tel.isCharging ? 'Đang sạc' : 'Dùng pin'})</span>
        <span>🌡️ Nhiệt độ: <b>${tel.temp}°C</b></span>
      `;
    }
  }

  // Chuyển đổi giữa 6 màn hình đơn lớp (Single-Layer Architecture)
  function switchTab(tabName, bypassSecurity = false) {
    window.FaceLessonEngine.resetIdleTimer();

    // 1. Kiểm tra khóa Chế độ Chỉ Học Tập cho YouTube & Game
    if (!bypassSecurity && (tabName === 'youtube' || tabName === 'game')) {
      if (!isEntertainmentUnlocked()) {
        pendingTabAfterPin = tabName;
        openUnlockRewardModal(tabName);
        return;
      }
    }

    // 2. Kiểm tra khóa PIN 4 số cho tab Setting
    if (!bypassSecurity && tabName === 'setting') {
      const s = window.RobotStorage.getSettings();
      if (s.requirePinForSetting) {
        pendingTabAfterPin = 'setting';
        document.getElementById('pinInputField').value = '';
        document.getElementById('pinModalTitle').textContent = '🔒 Nhập Mã PIN Phụ Huynh (4 số)';
        document.getElementById('pinModalDesc').textContent = 'Vui lòng nhập mã PIN để mở bảng Cài đặt hệ thống (mặc định: 1234).';
        document.getElementById('pinModal').classList.add('open');
        return;
      }
    }

    // 3. Ngắt tài nguyên chéo khi rời tab cũ
    if (activeTab === 'robot' && tabName !== 'robot') {
      window.HardwareBridge.stopSpeak();
      window.HardwareBridge.stopListening();
    }
    if (activeTab === 'youtube' && tabName !== 'youtube') {
      const ytFrame = document.getElementById('youtubeIframe');
      if (ytFrame) ytFrame.src = 'about:blank'; // Dừng hẳn tiếng video khi sang tab khác, tránh đè & màn hình đen
    }
    if (activeTab === 'game' && tabName !== 'game') {
      const gmFrame = document.getElementById('gamesIframe');
      if (gmFrame) gmFrame.src = 'about:blank';
    }

    activeTab = tabName;

    // 4. Ẩn tất cả view, chỉ bật đúng view đang chọn
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(`view-${tabName}`);
    if (targetView) targetView.classList.add('active');

    document.querySelectorAll('.nav-icon-btn').forEach(b => b.classList.remove('active'));
    const navBtn = document.getElementById(`nav-${tabName}`);
    if (navBtn) navBtn.classList.add('active');

    // 5. Khởi tạo nội dung tương ứng từng tab
    const settings = window.RobotStorage.getSettings();
    const profile = window.RobotStorage.getActiveProfile();

    if (tabName === 'notebook') {
      renderNotebookView();
    } else if (tabName === 'youtube') {
      const ytFrame = document.getElementById('youtubeIframe');
      const sep = settings.youtubeUrl.includes('?') ? '&' : '?';
      const fullUrl = `${settings.youtubeUrl}${sep}bot_id=${encodeURIComponent(settings.botId)}&member=${encodeURIComponent(profile.name)}`;
      document.getElementById('youtubeUrlLabel').textContent = settings.youtubeUrl;
      ytFrame.src = fullUrl;
      window.RobotStorage.appendLog({ type: 'open_youtube', url: settings.youtubeUrl });
    } else if (tabName === 'game') {
      const gmFrame = document.getElementById('gamesIframe');
      const sep = settings.gamesUrl.includes('?') ? '&' : '?';
      const fullUrl = `${settings.gamesUrl}${sep}bot_id=${encodeURIComponent(settings.botId)}&member=${encodeURIComponent(profile.name)}`;
      document.getElementById('gamesUrlLabel').textContent = settings.gamesUrl;
      document.getElementById('offlineGameBox').classList.remove('show');
      gmFrame.src = fullUrl;
      window.RobotStorage.appendLog({ type: 'open_game', url: settings.gamesUrl });
    } else if (tabName === 'setting') {
      populateSettingsUI();
      refreshHud();
    }
  }

  function reloadCurrentIframe(type) {
    const settings = window.RobotStorage.getSettings();
    const profile = window.RobotStorage.getActiveProfile();
    if (type === 'youtube') {
      const ytFrame = document.getElementById('youtubeIframe');
      const sep = settings.youtubeUrl.includes('?') ? '&' : '?';
      ytFrame.src = `${settings.youtubeUrl}${sep}bot_id=${encodeURIComponent(settings.botId)}&member=${encodeURIComponent(profile.name)}&t=${Date.now()}`;
      showToast('🔄 Đang tải lại trang YouTube...');
    } else if (type === 'game') {
      const gmFrame = document.getElementById('gamesIframe');
      const sep = settings.gamesUrl.includes('?') ? '&' : '?';
      document.getElementById('offlineGameBox').classList.remove('show');
      gmFrame.src = `${settings.gamesUrl}${sep}bot_id=${encodeURIComponent(settings.botId)}&member=${encodeURIComponent(profile.name)}&t=${Date.now()}`;
      showToast('🔄 Đang tải lại trang Game...');
    }
  }

  // Hộp thoại đổi Sao mở khóa YouTube/Game hoặc nhập PIN phụ huynh
  function openUnlockRewardModal(targetTab) {
    const profile = window.RobotStorage.getActiveProfile();
    const cost = window.ROBOT_CONFIG.STAR_COST_PER_10_MIN;
    const label = targetTab === 'youtube' ? '▶️ YouTube' : '🎮 Game';
    document.getElementById('rewardModalTitle').textContent = `🔒 ${label} đang ở Chế độ Chỉ Học Tập`;
    document.getElementById('rewardModalDesc').innerHTML =
      `Hiện tại bạn đang có <b>★ ${profile.stars || 0}</b>.<br>` +
      `• Dùng <b>${cost} ★</b> để mở khóa <b>10 phút</b> giải trí ngay.<br>` +
      `• Hoặc nhờ Bố/Mẹ nhập mã PIN để mở khóa.`;
    const btnRedeem = document.getElementById('btnRedeemStars');
    btnRedeem.disabled = (profile.stars || 0) < cost;
    btnRedeem.textContent = `⭐ Đổi ${cost} ★ lấy 10 phút`;
    document.getElementById('rewardUnlockModal').classList.add('open');

    window.HardwareBridge.speak('Đang trong giờ học tập! Bạn có thể đổi sao thưởng hoặc nhờ bố mẹ mở khóa nhé.', 'vi-VN', 1.0);
  }

  function redeemStarsForPlay() {
    const cost = window.ROBOT_CONFIG.STAR_COST_PER_10_MIN;
    const profile = window.RobotStorage.getActiveProfile();
    if ((profile.stars || 0) < cost) return;

    window.RobotStorage.updateActiveProfile(p => {
      p.stars = (p.stars || 0) - cost;
    });
    window.RobotStorage.saveSettings({
      unlockUntilTs: Date.now() + 10 * 60 * 1000
    });
    document.getElementById('rewardUnlockModal').classList.remove('open');
    refreshHud();
    showToast('🎉 Đã mở khóa 10 phút giải trí!');
    if (pendingTabAfterPin) {
      const target = pendingTabAfterPin;
      pendingTabAfterPin = null;
      switchTab(target, true);
    }
  }

  function openParentPinFromReward() {
    document.getElementById('rewardUnlockModal').classList.remove('open');
    document.getElementById('pinInputField').value = '';
    document.getElementById('pinModalTitle').textContent = '🔑 Mã PIN Phụ Huynh Mở Khóa Giải Trí';
    document.getElementById('pinModalDesc').textContent = 'Nhập mã PIN 4 số (mặc định 1234) để mở khóa 15 phút.';
    document.getElementById('pinModal').classList.add('open');
  }

  function verifyParentPin() {
    const val = document.getElementById('pinInputField').value.trim();
    const s = window.RobotStorage.getSettings();
    if (val === s.parentPin) {
      document.getElementById('pinModal').classList.remove('open');
      if (pendingTabAfterPin === 'youtube' || pendingTabAfterPin === 'game') {
        window.RobotStorage.saveSettings({ unlockUntilTs: Date.now() + 15 * 60 * 1000 });
        refreshHud();
      }
      const next = pendingTabAfterPin;
      pendingTabAfterPin = null;
      if (next) switchTab(next, true);
    } else {
      showToast('❌ Mã PIN chưa chính xác!');
    }
  }

  // --- Sổ Học Tập (32 Chủ đề + Đồng bộ Server api.php) ---
  function renderNotebookView() {
    const topics = window.RobotStorage.getTopics();
    const profile = window.RobotStorage.getActiveProfile();
    const settings = window.RobotStorage.getSettings();
    const query = (document.getElementById('topicSearchInput').value || '').toLowerCase().trim();

    document.getElementById('btnLessonModeToggle').textContent =
      settings.lessonMode === 'random' ? '🔀 Chế độ: Ngẫu nhiên' : '🔢 Chế độ: Thứ tự';

    if (!selectedNotebookTopicId && topics.length > 0) {
      selectedNotebookTopicId = topics[0].id;
    }

    const grid = document.getElementById('topicsGrid');
    const filteredTopics = topics.filter(t => t.name.toLowerCase().includes(query) || t.id.toLowerCase().includes(query));

    grid.innerHTML = filteredTopics.map(t => {
      const total = (t.items || []).length;
      const done = (t.items || []).filter(it => profile.mastered && profile.mastered[`${t.id}_${it.id}`]).length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const isSel = t.id === selectedNotebookTopicId;
      return `
        <div class="topic-card ${isSel ? 'selected' : ''}" onclick="AppController.selectNotebookTopic('${t.id}')">
          <div class="topic-card-top">
            <span>${t.icon || '📘'} ${t.name}</span>
            <span style="color:var(--cyan);font-size:12px;">${pct}%</span>
          </div>
          <div style="font-size:11.5px;color:var(--text-muted);">${done}/${total} câu đã thuộc</div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join('');

    renderNotebookSentences();
  }

  function selectNotebookTopic(topicId) {
    selectedNotebookTopicId = topicId;
    renderNotebookView();
  }

  function setNotebookFilter(f) {
    notebookFilter = f;
    renderNotebookSentences();
  }

  function renderNotebookSentences() {
    const topics = window.RobotStorage.getTopics();
    const profile = window.RobotStorage.getActiveProfile();
    const topic = topics.find(t => t.id === selectedNotebookTopicId) || topics[0];
    if (!topic) return;

    document.getElementById('selectedTopicHeader').textContent = `${topic.icon || '📘'} Danh sách câu: ${topic.name}`;
    const listEl = document.getElementById('sentencesList');

    const items = (topic.items || []).filter(it => {
      const isDone = !!(profile.mastered && profile.mastered[`${topic.id}_${it.id}`]);
      if (notebookFilter === 'mastered') return isDone;
      if (notebookFilter === 'review') return !isDone;
      return true;
    });

    if (items.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:12px;">Không có câu nào trong bộ lọc này.</div>`;
      return;
    }

    listEl.innerHTML = items.map((it, idx) => {
      const isDone = !!(profile.mastered && profile.mastered[`${topic.id}_${it.id}`]);
      return `
        <div class="sentence-row" onclick="AppController.launchSentenceInRobot('${topic.id}', ${idx})">
          <div>
            <div style="font-weight:700;font-size:14px;color:#f8fafc;">${isDone ? '✅' : '🔹'} ${it.en}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${it.vi}</div>
          </div>
          <button class="btn-neon" style="padding:5px 10px;font-size:12px;">Học ngay ▶</button>
        </div>
      `;
    }).join('');
  }

  function launchSentenceInRobot(topicId, idx) {
    switchTab('robot', true);
    window.FaceLessonEngine.startTopic(topicId, idx);
  }

  function toggleLessonOrderMode() {
    const s = window.RobotStorage.getSettings();
    const next = s.lessonMode === 'random' ? 'sequential' : 'random';
    window.RobotStorage.saveSettings({ lessonMode: next });
    renderNotebookView();
    showToast(next === 'random' ? '🔀 Đã bật chế độ học Ngẫu nhiên' : '🔢 Đã bật chế độ học Thứ tự');
  }

  async function syncTopicsFromServer() {
    const s = window.RobotStorage.getSettings();
    showToast('🔄 Đang đồng bộ chủ đề từ Server...');
    try {
      const res = await fetch(`${s.apiUrl}?action=manifest`, { cache: 'no-store' });
      const data = await res.json();
      if (data && Array.isArray(data.topics) && data.topics.length > 0) {
        const current = window.RobotStorage.getTopics();
        const map = {};
        current.forEach(t => { map[t.id] = t; });

        for (const meta of data.topics.slice(0, 32)) {
          const tid = meta.topic || meta.id;
          if (!tid) continue;
          try {
            const dRes = await fetch(`${s.apiUrl}?action=download&topic=${encodeURIComponent(tid)}`);
            const dJson = await dRes.json();
            if (dJson && Array.isArray(dJson.items) && dJson.items.length > 0) {
              map[tid] = {
                id: tid,
                name: meta.title || tid.toUpperCase(),
                icon: '📚',
                items: dJson.items.map((x, idx) => ({
                  id: x.id || (idx + 1),
                  en: x.in || x.en || '',
                  vi: (x.out && (x.out.vi_hint || x.out.vi)) || x.vi || 'Câu giao tiếp tiếng Anh',
                  spell: x.spell || {}
                }))
              };
            }
          } catch (e) {}
        }

        const merged = Object.values(map);
        window.RobotStorage.saveTopics(merged);
        renderNotebookView();
        showToast(`✅ Đã đồng bộ xong ${merged.length} chủ đề Offline!`);
      } else {
        showToast('⚠️ Server chưa có gói mới, giữ nguyên 8 chủ đề Offline.');
      }
    } catch (e) {
      showToast('📴 Đang Offline: Dùng sẵn 8 chủ đề tích hợp trong máy.');
    }
  }

  // --- Setting & Sub-panels 92% ---
  function populateSettingsUI() {
    const s = window.RobotStorage.getSettings();
    document.getElementById('sliderBrightness').value = s.brightness;
    document.getElementById('valBrightness').textContent = s.brightness + '%';
    document.getElementById('sliderVolume').value = s.volume;
    document.getElementById('valVolume').textContent = s.volume + '%';
    document.getElementById('sliderTtsRate').value = Math.round(s.ttsRate * 100);
    document.getElementById('valTtsRate').textContent = s.ttsRate.toFixed(2) + 'x';

    document.getElementById('inpApiUrl').value = s.apiUrl;
    document.getElementById('inpYoutubeUrl').value = s.youtubeUrl;
    document.getElementById('inpGamesUrl').value = s.gamesUrl;

    document.getElementById('chkStudyOnly').checked = !!s.studyOnlyLock;
    document.getElementById('chkRequirePin').checked = !!s.requirePinForSetting;
    document.getElementById('chkAutoCharge').checked = !!s.autoChargeGuard;
    document.getElementById('chkBleSync').checked = !!s.bleSyncEnabled;
    document.getElementById('chkTiltAlert').checked = !!s.tiltAlert;
    document.getElementById('chkDevAntiSwipe').checked = !!s.devAntiSwipe;
    document.getElementById('chkBedtime').checked = !!s.bedtimeEnabled;
    document.getElementById('inpBedStart').value = s.bedtimeStart;
    document.getElementById('inpBedEnd').value = s.bedtimeEnd;
  }

  function onBrightnessChange(val) {
    const n = parseInt(val, 10);
    document.getElementById('valBrightness').textContent = n + '%';
    window.RobotStorage.saveSettings({ brightness: n });
    window.HardwareBridge.setBrightness(n);
  }

  function onVolumeChange(val) {
    const n = parseInt(val, 10);
    document.getElementById('valVolume').textContent = n + '%';
    window.RobotStorage.saveSettings({ volume: n });
    window.HardwareBridge.setVolume(n);
  }

  function onTtsRateChange(val) {
    const rate = parseInt(val, 10) / 100;
    document.getElementById('valTtsRate').textContent = rate.toFixed(2) + 'x';
    window.RobotStorage.saveSettings({ ttsRate: rate });
  }

  function saveServerUrls() {
    const apiUrl = document.getElementById('inpApiUrl').value.trim() || window.ROBOT_CONFIG.DEFAULT_API_URL;
    const youtubeUrl = document.getElementById('inpYoutubeUrl').value.trim() || window.ROBOT_CONFIG.DEFAULT_YOUTUBE_URL;
    const gamesUrl = document.getElementById('inpGamesUrl').value.trim() || window.ROBOT_CONFIG.DEFAULT_GAMES_URL;
    window.RobotStorage.saveSettings({ apiUrl, youtubeUrl, gamesUrl });
    showToast('💾 Đã lưu cấu hình Server API, YouTube & Game!');
  }

  function resetDefaultServerUrls() {
    window.RobotStorage.saveSettings({
      apiUrl: window.ROBOT_CONFIG.DEFAULT_API_URL,
      userApiUrl: window.ROBOT_CONFIG.DEFAULT_USER_API_URL,
      youtubeUrl: window.ROBOT_CONFIG.DEFAULT_YOUTUBE_URL,
      gamesUrl: window.ROBOT_CONFIG.DEFAULT_GAMES_URL
    });
    populateSettingsUI();
    showToast('🔄 Đã khôi phục URL Server V1.4 mặc định!');
  }

  function toggleSettingBool(key, checked) {
    const patch = {};
    patch[key] = !!checked;
    if (key === 'studyOnlyLock' && !checked) {
      patch.unlockUntilTs = Date.now() + 60 * 60 * 1000;
    }
    window.RobotStorage.saveSettings(patch);
    if (key === 'devAntiSwipe') {
      window.HardwareBridge.setKioskMode(!!checked);
    }
    refreshHud();
    showToast('✅ Đã cập nhật thiết lập!');
  }

  function changeParentPin() {
    const newPin = prompt('Nhập mã PIN Phụ huynh mới (4 chữ số):', '1234');
    if (newPin && /^\d{4}$/.test(newPin.trim())) {
      window.RobotStorage.saveSettings({ parentPin: newPin.trim() });
      showToast('🔑 Đã đổi mã PIN Phụ huynh thành công!');
    } else if (newPin !== null) {
      showToast('⚠️ Mã PIN phải gồm đúng 4 chữ số!');
    }
  }

  function exitKioskManufacturer() {
    const code = prompt('Nhập Mã PIN 6 số Nhà Sản Xuất để thoát chế độ Robot Vĩnh Viễn:');
    if (code === window.ROBOT_CONFIG.MANUFACTURER_EXIT_PIN) {
      window.HardwareBridge.setKioskMode(false);
      showToast('🔓 Đã tắt khóa Kiosk! Bạn có thể vuốt thoát về màn hình chính Android.');
    } else if (code !== null) {
      showToast('❌ Sai mã PIN Nhà Sản Xuất!');
    }
  }

  // Quản lý Sub-panel 92% (Tối đa 2 lớp, có nút X lớn góc phải)
  function openSubPanel(type) {
    const backdrop = document.getElementById('subPanelBackdrop');
    const titleEl = document.getElementById('subPanelTitle');
    const bodyEl = document.getElementById('subPanelContent');
    backdrop.classList.add('open');

    if (type === 'ble') {
      titleEl.textContent = '🔌 Kết Nối Bluetooth BLE & Điều Khiển Phần Cứng ESP32';
      bodyEl.innerHTML = `
        <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
          <button class="btn-neon" onclick="AppController.scanBleList()">🔍 Quét thiết bị ESP32 xung quanh</button>
          <button class="btn-neon green" onclick="HardwareBridge.sendBleCommand('M:WAVE')">👋 Test Vẫy Tay (M:WAVE)</button>
          <button class="btn-neon green" onclick="HardwareBridge.sendBleCommand('M:NOD')">🙂 Test Gật Đầu (M:NOD)</button>
          <button class="btn-neon amber" onclick="HardwareBridge.sendBleCommand('CHG:OFF')">🔋 Ngắt Sạc (CHG:OFF)</button>
          <button class="btn-neon amber" onclick="HardwareBridge.sendBleCommand('CHG:ON')">⚡ Mở Sạc (CHG:ON)</button>
        </div>
        <div id="bleDeviceList" style="display:flex;flex-direction:column;gap:8px;">
          <div style="color:var(--text-muted);font-size:13px;">Bấm "Quét thiết bị ESP32 xung quanh" để tìm mạch điều khiển thân robot.</div>
        </div>
      `;
    } else if (type === 'report') {
      const profile = window.RobotStorage.getActiveProfile();
      const logs = window.RobotStorage.getLogs();
      const masteredCount = Object.keys(profile.mastered || {}).length;
      const weakWords = Object.entries(profile.mistakes || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([w, c]) => `<span class="hud-pill" style="border-color:var(--rose);">${w} (${c} lần)</span>`)
        .join(' ') || '<span style="color:var(--text-muted)">Chưa có từ sai nào!</span>';

      titleEl.textContent = `📊 Nhật Ký & Báo Cáo Học Tập — ${profile.name}`;
      bodyEl.innerHTML = `
        <div class="setting-telemetry">
          <span>👤 Học viên: <b>${profile.name}</b></span>
          <span>⭐ Tổng Sao: <b>${profile.stars || 0} ★</b></span>
          <span>✅ Câu đã thuộc: <b>${masteredCount} câu</b></span>
          <span>⏱️ Thời gian học: <b>${Math.round((profile.studySeconds || 0) / 60)} phút</b></span>
        </div>
        <h4 style="color:var(--cyan);margin:10px 0 8px;">⚠️ Các từ bé phát âm còn sai nhiều (Cần ôn):</h4>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">${weakWords}</div>
        <h4 style="color:var(--cyan);margin:10px 0 8px;">🕒 Lịch sử hoạt động gần đây:</h4>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${logs.slice(0, 20).map(l => `
            <div class="sentence-row" style="cursor:default;">
              <span style="font-size:12.5px;">${new Date(l.ts).toLocaleTimeString()} — <b>${l.type}</b>: ${l.sentence || l.topic || l.url || ''}</span>
              <span style="color:var(--green);font-size:12px;">${l.score ? l.score + '%' : ''}</span>
            </div>
          `).join('') || '<div style="color:var(--text-muted);font-size:13px;">Chưa có nhật ký hoạt động.</div>'}
        </div>
      `;
    } else if (type === 'profiles') {
      const s = window.RobotStorage.getSettings();
      const profiles = window.RobotStorage.getProfiles();
      titleEl.textContent = '👤 Cá Nhân Hóa Tên Robot & Hồ Sơ Gia Đình';
      bodyEl.innerHTML = `
        <div class="set-card" style="margin-bottom:14px;">
          <div class="set-card-title">🤖 Tên gọi Robot (Từ khóa đánh thức giọng nói)</div>
          <div style="display:flex;gap:8px;">
            <input id="inpRobotNameSub" class="input-field" value="${s.robotName}" placeholder="Ví dụ: Lucky, Robo, Bi..." />
            <button class="btn-neon green" onclick="AppController.saveRobotName()">Lưu tên</button>
          </div>
          <div style="font-size:12px;color:var(--text-muted);">Khi robot ngủ, bé chỉ cần nói: <b>"Hello ${s.robotName}"</b>, <b>"Hello"</b> hoặc <b>"${s.robotName}"</b> để đánh thức!</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h4 style="color:var(--cyan);">👨‍👩‍👧‍👦 Danh sách hồ sơ người học:</h4>
          <button class="btn-neon" onclick="AppController.addNewProfile()">+ Thêm thành viên</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${profiles.map(p => `
            <div class="sentence-row" style="cursor:default;border-color:${p.id === s.activeProfileId ? 'var(--cyan)' : 'rgba(148,163,184,0.2)'}">
              <div>
                <b>${p.name}</b> (${p.age} tuổi) • ⭐ ${p.stars || 0} ★ • ✅ ${Object.keys(p.mastered || {}).length} câu
              </div>
              <button class="btn-neon ${p.id === s.activeProfileId ? 'green' : ''}" onclick="AppController.selectProfile('${p.id}')">
                ${p.id === s.activeProfileId ? 'Đang chọn ✓' : 'Chọn hồ sơ'}
              </button>
            </div>
          `).join('')}
        </div>
      `;
    } else if (type === 'camera') {
      titleEl.textContent = '📹 Giám Sát Camera Trước (WebRTC P2P) & Cảm Biến';
      bodyEl.innerHTML = `
        <p style="font-size:13px;color:#cbd5e1;margin-bottom:12px;">
          Truyền hình ảnh trực tiếp từ camera trước của robot tới trình duyệt điện thoại phụ huynh qua <b>WebRTC Peer-to-Peer</b> (0% tốn băng thông video của hosting).
        </p>
        <div style="display:flex;gap:10px;margin-bottom:12px;">
          <button class="btn-neon green" onclick="AppController.toggleCameraPreview(true)">📹 Bật Camera Giám Sát</button>
          <button class="btn-neon rose" onclick="AppController.toggleCameraPreview(false)">⏹️ Tắt Camera (Mát máy)</button>
        </div>
        <div id="camStatusText" style="font-size:12.5px;color:var(--amber);margin-bottom:10px;">Camera đang tắt để tiết kiệm pin.</div>
        <video id="frontCamVideo" autoplay playsinline muted style="width:100%;max-width:420px;border-radius:14px;border:1px solid var(--cyan);background:#000;"></video>
      `;
    }
  }

  function closeSubPanel() {
    const videoEl = document.getElementById('frontCamVideo');
    if (videoEl) window.HardwareBridge.stopCameraMonitor(videoEl);
    document.getElementById('subPanelBackdrop').classList.remove('open');
  }

  async function scanBleList() {
    const listEl = document.getElementById('bleDeviceList');
    listEl.innerHTML = '<div style="color:var(--cyan);">⏳ Đang quét Bluetooth BLE...</div>';
    const devices = await window.HardwareBridge.scanBleDevices();
    if (devices.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted);">Không tìm thấy thiết bị BLE nào. Hãy bật Bluetooth và cấp quyền Vị trí.</div>';
      return;
    }
    listEl.innerHTML = devices.map(d => `
      <div class="sentence-row">
        <span>🔌 <b>${d.name || 'ESP32 Device'}</b> (${d.address})</span>
        <button class="btn-neon green" onclick="AppController.connectBleDevice('${d.address}', '${(d.name || 'ESP32').replace(/'/g, "\'")}')">Kết nối</button>
      </div>
    `).join('');
  }

  async function connectBleDevice(addr, name) {
    const ok = await window.HardwareBridge.connectBle(addr, name);
    showToast(ok ? `✅ Đã kết nối BLE với ${name}` : '❌ Kết nối BLE thất bại');
    refreshHud();
  }

  function saveRobotName() {
    const val = document.getElementById('inpRobotNameSub').value.trim();
    if (!val) return;
    window.RobotStorage.saveSettings({ robotName: val });
    showToast(`🤖 Đã đổi tên Robot thành "${val}"!`);
  }

  function addNewProfile() {
    const name = prompt('Nhập tên thành viên mới (ví dụ: Bé Bông, Anh Hai):');
    if (!name || !name.trim()) return;
    const age = parseInt(prompt('Nhập độ tuổi:', '7') || '7', 10);
    const list = window.RobotStorage.getProfiles();
    const id = 'p_' + Date.now();
    list.push({ id, name: name.trim(), age, stars: 2, mastered: {}, mistakes: {}, studySeconds: 0 });
    window.RobotStorage.saveProfiles(list);
    window.RobotStorage.saveSettings({ activeProfileId: id });
    refreshHud();
    openSubPanel('profiles');
  }

  function selectProfile(id) {
    window.RobotStorage.saveSettings({ activeProfileId: id });
    refreshHud();
    openSubPanel('profiles');
    showToast('✅ Đã chuyển hồ sơ học tập!');
  }

  async function toggleCameraPreview(turnOn) {
    const videoEl = document.getElementById('frontCamVideo');
    const statusEl = document.getElementById('camStatusText');
    if (turnOn) {
      await window.HardwareBridge.startCameraMonitor(videoEl, (msg) => {
        if (statusEl) statusEl.textContent = msg;
      });
    } else {
      window.HardwareBridge.stopCameraMonitor(videoEl);
      if (statusEl) statusEl.textContent = 'Camera đã tắt hoàn toàn.';
    }
  }

  // Mini-game Offline dự phòng khi tab Game mất mạng
  function playOfflineRps(userChoice) {
    const choices = ['✊ Búa', '✋ Bao', '✌️ Kéo'];
    const botIdx = Math.floor(Math.random() * 3);
    const botChoice = choices[botIdx];
    let result = 'Hòa nhau rồi! 🤝';
    if ((userChoice === 0 && botIdx === 2) || (userChoice === 1 && botIdx === 0) || (userChoice === 2 && botIdx === 1)) {
      result = 'Bé thắng rồi! Giỏi quá! 🎉';
      window.FaceLessonEngine.setEmotion('happy');
    } else if (userChoice !== botIdx) {
      result = 'Robo thắng lượt này nhé! 😄';
    }
    document.getElementById('offlineRpsResult').innerHTML =
      `Bé chọn: <b>${choices[userChoice]}</b> vs Robo chọn: <b>${botChoice}</b> → <b>${result}</b>`;
  }

  async function init() {
    await window.HardwareBridge.init();
    window.FaceLessonEngine.init();

    const s = window.RobotStorage.getSettings();
    window.HardwareBridge.setBrightness(s.brightness);
    window.HardwareBridge.setVolume(s.volume);

    refreshHud();
    renderNotebookView();

    // Kiểm tra hết hạn giờ thưởng giải trí mỗi giây
    rewardInterval = setInterval(() => {
      const cur = window.RobotStorage.getSettings();
      if (cur.studyOnlyLock && cur.unlockUntilTs > 0 && Date.now() >= cur.unlockUntilTs) {
        window.RobotStorage.saveSettings({ unlockUntilTs: 0 });
        refreshHud();
        if (activeTab === 'youtube' || activeTab === 'game') {
          switchTab('robot', true);
          window.FaceLessonEngine.setEmotion('encourage', '⏰ Hết giờ giải trí rồi! Mình quay lại học tiếng Anh tích sao nhé!');
          window.HardwareBridge.speak('Hết giờ giải trí rồi, mình quay lại học tiếng Anh nhé!', 'vi-VN', 1.0);
        }
      } else if (cur.studyOnlyLock && cur.unlockUntilTs > Date.now()) {
        refreshHud();
      }
    }, 1000);

    window.addEventListener('robot:statusUpdated', refreshHud);
  }

  return {
    init,
    showToast,
    refreshHud,
    switchTab,
    reloadCurrentIframe,
    redeemStarsForPlay,
    openParentPinFromReward,
    verifyParentPin,
    renderNotebookView,
    selectNotebookTopic,
    setNotebookFilter,
    launchSentenceInRobot,
    toggleLessonOrderMode,
    syncTopicsFromServer,
    onBrightnessChange,
    onVolumeChange,
    onTtsRateChange,
    saveServerUrls,
    resetDefaultServerUrls,
    toggleSettingBool,
    changeParentPin,
    exitKioskManufacturer,
    openSubPanel,
    closeSubPanel,
    scanBleList,
    connectBleDevice,
    saveRobotName,
    addNewProfile,
    selectProfile,
    toggleCameraPreview,
    playOfflineRps
  };
})();

window.addEventListener('DOMContentLoaded', () => {
  window.AppController.init();
});
