// Robot 2027 V1.4 - Quản lý Lưu trữ Bền vững (Hồ sơ, Tiến độ, 32 Chủ đề Offline, Cài đặt)
window.RobotStorage = (function () {
  const KEY_SETTINGS = 'r2027_v14_settings';
  const KEY_PROFILES = 'r2027_v14_profiles';
  const KEY_TOPICS = 'r2027_v14_topics';
  const KEY_LOGS = 'r2027_v14_logs';

  function generateBotId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'BOT_';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function getSettings() {
    const raw = localStorage.getItem(KEY_SETTINGS);
    const defaults = {
      botId: generateBotId(),
      robotName: 'Lucky',
      apiUrl: window.ROBOT_CONFIG.DEFAULT_API_URL,
      userApiUrl: window.ROBOT_CONFIG.DEFAULT_USER_API_URL,
      youtubeUrl: window.ROBOT_CONFIG.DEFAULT_YOUTUBE_URL,
      gamesUrl: window.ROBOT_CONFIG.DEFAULT_GAMES_URL,
      parentPin: window.ROBOT_CONFIG.DEFAULT_PARENT_PIN,
      requirePinForSetting: true,
      studyOnlyLock: true,          // Khóa YouTube & Game mặc định khi học
      unlockUntilTs: 0,             // Timestamp hết giờ giải trí thưởng
      brightness: 75,
      volume: 85,
      ttsRate: 0.92,
      lessonMode: 'sequential',     // 'sequential' | 'random'
      autoChargeGuard: true,        // Bảo vệ pin 50% - 90%
      survivalMode50: false,        // Chế độ sinh tồn 50%
      tiltAlert: true,              // Nhắc khi robot bị nghiêng/ngã
      bleSyncEnabled: true,         // Gửi lệnh M:NOD/WAVE/HAPPY xuống ESP32
      devAntiSwipe: true,           // Chống vuốt Kiosk
      bedtimeEnabled: false,
      bedtimeStart: '21:30',
      bedtimeEnd: '06:30',
      activeProfileId: 'p_bi'
    };
    if (!raw) {
      localStorage.setItem(KEY_SETTINGS, JSON.stringify(defaults));
      return defaults;
    }
    return Object.assign({}, defaults, JSON.parse(raw));
  }

  function saveSettings(partial) {
    const current = getSettings();
    const updated = Object.assign({}, current, partial);
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(updated));
    return updated;
  }

  function getProfiles() {
    const raw = localStorage.getItem(KEY_PROFILES);
    if (raw) return JSON.parse(raw);
    const initial = [
      { id: 'p_bi', name: 'Bé Bi', age: 6, stars: 3, mastered: {}, mistakes: {}, studySeconds: 0 },
      { id: 'p_bo', name: 'Bố', age: 36, stars: 10, mastered: {}, mistakes: {}, studySeconds: 0 }
    ];
    localStorage.setItem(KEY_PROFILES, JSON.stringify(initial));
    return initial;
  }

  function saveProfiles(list) {
    localStorage.setItem(KEY_PROFILES, JSON.stringify(list));
  }

  function getActiveProfile() {
    const settings = getSettings();
    const list = getProfiles();
    return list.find(p => p.id === settings.activeProfileId) || list[0];
  }

  function updateActiveProfile(mutatorFn) {
    const settings = getSettings();
    const list = getProfiles();
    const idx = list.findIndex(p => p.id === settings.activeProfileId);
    const targetIdx = idx >= 0 ? idx : 0;
    mutatorFn(list[targetIdx]);
    saveProfiles(list);
    return list[targetIdx];
  }

  function getTopics() {
    const raw = localStorage.getItem(KEY_TOPICS);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    localStorage.setItem(KEY_TOPICS, JSON.stringify(window.ROBOT_CONFIG.BUILTIN_TOPICS));
    return window.ROBOT_CONFIG.BUILTIN_TOPICS;
  }

  function saveTopics(topicsArray) {
    localStorage.setItem(KEY_TOPICS, JSON.stringify(topicsArray));
  }

  function appendLog(entry) {
    const raw = localStorage.getItem(KEY_LOGS);
    const logs = raw ? JSON.parse(raw) : [];
    logs.unshift(Object.assign({ ts: Date.now() }, entry));
    if (logs.length > 120) logs.length = 120;
    localStorage.setItem(KEY_LOGS, JSON.stringify(logs));
    return logs;
  }

  function getLogs() {
    const raw = localStorage.getItem(KEY_LOGS);
    return raw ? JSON.parse(raw) : [];
  }

  return {
    getSettings,
    saveSettings,
    getProfiles,
    saveProfiles,
    getActiveProfile,
    updateActiveProfile,
    getTopics,
    saveTopics,
    appendLog,
    getLogs
  };
})();
