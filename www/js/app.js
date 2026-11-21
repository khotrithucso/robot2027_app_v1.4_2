// ============================================================================
// ROBOT 2027 COMPANION V1.4 PRO - FULL CONTROLLER
// ============================================================================

const Native = () => window.Capacitor?.Plugins?.RobotNative || null;

// 1. TỰ SINH & LƯU VĨNH VIỄN UID TOKEN 20 KÝ TỰ NGẪU NHIÊN
function getOrCreatePermanentUid() {
  let uid = localStorage.getItem('robo_uid_20');
  if (!uid || uid.length !== 20) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    const randArr = new Uint32Array(20);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(randArr);
      for (let i = 0; i < 20; i++) token += chars[randArr[i] % chars.length];
    } else {
      for (let i = 0; i < 20; i++) token += chars[Math.floor(Math.random() * chars.length)];
    }
    uid = token;
    localStorage.setItem('robo_uid_20', uid);
  }
  return uid;
}

const APP_UID = getOrCreatePermanentUid();

// 2. TRẠNG THÁI HỆ THỐNG
let currentTab = 'robot';
let starsCount = Math.max(0, parseInt(localStorage.getItem('robo_stars') || '5', 10));
let parentPin = localStorage.getItem('robo_pin') || '1234';
let studyOnlyMode = localStorage.getItem('robo_study_only') === '1';
let baseServerUrl = (localStorage.getItem('robo_base_url') || 'https://khotrithucso.io.vn/robot2027_2_4/test1').replace(/\/+$/, '');

let pointPollTimer = null;
let canPollPoints = false;
let currentAudioPlayer = null;
let lastChildHeardText = '';
let idleTimer = null;
let isSleeping = false;
let bleCharacteristic = null;

// Dữ liệu mẫu dự phòng khi chưa tải mạng lần đầu
const FALLBACK_TOPICS = [
  {
    index: 1,
    topic: 'greetings_demo',
    title: '1. Chào Hỏi & Làm Quen',
    count: 3,
    items: [
      { id: 0, en: 'Hello! My name is Robo.', vi: 'Xin chào! Tên mình là Robo.', audio_url: '', spelling: [] },
      { id: 1, en: 'How are you today?', vi: 'Hôm nay bạn khỏe không?', audio_url: '', spelling: [] },
      { id: 2, en: 'Nice to meet you!', vi: 'Rất vui được gặp bạn!', audio_url: '', spelling: [] }
    ]
  }
];

let topicsCatalog = JSON.parse(localStorage.getItem('robo_topics_catalog_v14') || 'null') || FALLBACK_TOPICS;
let activeTopicIndex = 0;
let activeSentenceIndex = 0;

// ============================================================================
// 3. KHỞI TẠO ỨNG DỤNG
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  updateStarsUI(starsCount, false);
  document.getElementById('chkStudyOnly').checked = studyOnlyMode;

  renderStudyTopics();
  renderCurrentLesson();
  resetIdleTimer();

  const plugin = Native();
  if (plugin) {
    try {
      await plugin.requestAllPermissions();
      plugin.addListener('ttsStart', () => setRobotExpression('speaking'));
      plugin.addListener('ttsEnd', () => setRobotExpression('idle'));
      plugin.addListener('speechResult', (res) => onSpeechRecognized(res.text || ''));
      plugin.addListener('speechError', () => {
        setRobotExpression('idle');
        document.getElementById('pronounceFeedback').textContent = 'Chưa nghe rõ, bé bấm "Bé đọc" và nói lại nhé!';
      });
    } catch (e) {
      console.warn('Native plugin init:', e);
    }
  }

  refreshDeviceStatus();
  setInterval(refreshDeviceStatus, 15000);

  // Tự động đồng bộ danh sách 32 chủ đề & hồ sơ từ Server khi khởi động
  syncProfileAndProgress();
  if (topicsCatalog.length <= 1) {
    syncStudyPacks(false);
  }

  ['touchstart', 'click', 'keydown'].forEach(evt => {
    document.addEventListener(evt, () => {
      if (isSleeping) wakeUpRobot();
      resetIdleTimer();
    }, { passive: true });
  });
});

// ============================================================================
// 4. ĐIỀU HƯỚNG TAB, IFRAME TRÀN VIỀN & ĐỒNG BỘ ĐIỂM 2 GIÂY/LẦN
// ============================================================================
function switchTab(tabName) {
  // Kiểm tra khóa Chế độ Chỉ Học Tập khi mở YouTube hoặc Game
  if ((tabName === 'youtube' || tabName === 'game') && studyOnlyMode) {
    const msg = 'Đang trong giờ học tập, nhờ bố mẹ mở khóa trong Cài đặt nhé!';
    speakText(msg, 'vi-VN', 1.0);
    alert(msg);
    return;
  }

  currentTab = tabName;

  // Cập nhật trạng thái active của nút trên thanh dock
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Hiện/Ẩn nút Refresh động ở đầu bên trái thanh icon
  const btnRefresh = document.getElementById('btnRefreshIframe');
  const divider = document.getElementById('navRefreshDivider');
  const isEntertainment = (tabName === 'youtube' || tabName === 'game');
  btnRefresh.classList.toggle('hidden', !isEntertainment);
  divider.classList.toggle('hidden', !isEntertainment);

  // Chuyển vùng hiển thị tab
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
  const targetPane = document.getElementById('tab-' + tabName);
  if (targetPane) targetPane.classList.add('active');

  // Dừng âm thanh/micro của Robot khi rời tab Robot
  if (tabName !== 'robot') {
    stopRobotAudioAndMic();
  }

  // Tắt iframe bên kia & dừng polling cũ để không phát chồng tiếng và tiết kiệm tài nguyên
  stopPointPolling();
  const ytFrame = document.getElementById('ytFrame');
  const gameFrame = document.getElementById('gameFrame');

  if (tabName === 'youtube') {
    gameFrame.src = 'about:blank';
    canPollPoints = false;
    ytFrame.onload = () => {
      // Sau khi trang youtube.php nhận ?uid=...&stars=... và redirect xong, bật đồng bộ 2s
      setTimeout(() => { canPollPoints = true; }, 700);
    };
    ytFrame.src = `${baseServerUrl}/youtube.php?uid=${encodeURIComponent(APP_UID)}&stars=${starsCount}`;
    startPointPolling();
    logUserActivity('YOUTUBE_OPEN', 'Mở tab YouTube');
  } else if (tabName === 'game') {
    ytFrame.src = 'about:blank';
    canPollPoints = false;
    gameFrame.onload = () => {
      setTimeout(() => { canPollPoints = true; }, 700);
    };
    gameFrame.src = `${baseServerUrl}/games.php?uid=${encodeURIComponent(APP_UID)}&stars=${starsCount}`;
    startPointPolling();
    logUserActivity('GAME_OPEN', 'Mở tab Game');
  } else {
    // Rời khỏi tab giải trí -> giải phóng iframe để ngừng phát nhạc/game
    ytFrame.src = 'about:blank';
    gameFrame.src = 'about:blank';
  }
}

// Nút Refresh động trên thanh Icon Bar
function refreshActiveIframe() {
  if (currentTab === 'youtube') {
    const ytFrame = document.getElementById('ytFrame');
    ytFrame.src = `${baseServerUrl}/youtube.php?uid=${encodeURIComponent(APP_UID)}&_r=${Date.now()}`;
  } else if (currentTab === 'game') {
    const gameFrame = document.getElementById('gameFrame');
    gameFrame.src = `${baseServerUrl}/games.php?uid=${encodeURIComponent(APP_UID)}&_r=${Date.now()}`;
  }
}

// Tự động GET điểm từ api_point.php mỗi 2 giây khi đang ở tab YouTube hoặc Game
function startPointPolling() {
  stopPointPolling();
  pointPollTimer = setInterval(async () => {
    if (!canPollPoints || (currentTab !== 'youtube' && currentTab !== 'game')) return;
    try {
      const url = `${baseServerUrl}/api_point.php?uid=${encodeURIComponent(APP_UID)}&_t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (data && data.status === 'ok' && typeof data.stars === 'number') {
        const serverStars = Math.max(0, parseInt(data.stars, 10));
        if (serverStars !== starsCount) {
          updateStarsUI(serverStars, false);
        }
      }
    } catch (e) {
      // Bỏ qua lỗi mạng tạm thời giữa các chu kỳ 2s
    }
  }, 2000);
}

function stopPointPolling() {
  canPollPoints = false;
  if (pointPollTimer) {
    clearInterval(pointPollTimer);
    pointPollTimer = null;
  }
}

function updateStarsUI(newVal, pushToServer = false) {
  starsCount = Math.max(0, parseInt(newVal, 10) || 0);
  localStorage.setItem('robo_stars', String(starsCount));
  document.getElementById('profileStarPill').textContent = `👤 Bé Bi • ★ ${starsCount}`;

  // Nếu bé vừa đọc tiếng Anh được cộng sao, đẩy cập nhật lên server để đồng bộ ngay với api_point.php
  if (pushToServer) {
    fetch(`${baseServerUrl}/games.php?uid=${encodeURIComponent(APP_UID)}&stars=${starsCount}`, {
      method: 'GET',
      cache: 'no-store'
    }).catch(() => {});
  }
}

// ============================================================================
// 5. KẾT NỐI API.PHP (32 CHỦ ĐỀ, DOWNLOAD OFFLINE, MP3 BẢN XỨ, ĐÁNH VẦN)
// ============================================================================
function renderStudyTopics() {
  const grid = document.getElementById('topicsGrid');
  document.getElementById('topicsCountLabel').textContent = String(topicsCatalog.length);
  grid.innerHTML = '';

  topicsCatalog.forEach((t, idx) => {
    const cachedPack = getCachedTopicPack(t.topic);
    const totalCount = cachedPack ? cachedPack.items.length : (t.count || (t.items ? t.items.length : 0));
    const statusText = cachedPack ? '✅ Đã lưu Offline' : '☁️ Chạm để tải & học';

    const card = document.createElement('div');
    card.className = 'topic-card' + (idx === activeTopicIndex ? ' selected' : '');
    card.innerHTML = `
      <div class="t-title">${t.index ? t.index + '. ' : ''}${t.title}</div>
      <div class="t-meta">${totalCount} câu • ${statusText}</div>
    `;
    card.onclick = () => selectAndLoadTopic(idx);
    grid.appendChild(card);
  });
}

function getCachedTopicPack(topicSlug) {
  if (!topicSlug) return null;
  try {
    return JSON.parse(localStorage.getItem('robo_pack_' + topicSlug) || 'null');
  } catch (e) {
    return null;
  }
}

async function syncStudyPacks(showAlert = true) {
  try {
    const res = await fetch(`${baseServerUrl}/api.php?action=topics&_t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (data && data.status === 'ok' && Array.isArray(data.topics) && data.topics.length > 0) {
      topicsCatalog = data.topics;
      localStorage.setItem('robo_topics_catalog_v14', JSON.stringify(topicsCatalog));
      renderStudyTopics();
      if (showAlert) {
        alert(`Đã đồng bộ danh sách ${topicsCatalog.length} chủ đề (${data.total_sentences} câu) từ Server!`);
      }
    } else if (showAlert) {
      alert('Không lấy được danh sách chủ đề mới từ api.php.');
    }
  } catch (e) {
    if (showAlert) alert('Đang mất kết nối mạng, sử dụng dữ liệu đã lưu Offline.');
  }
}

async function selectAndLoadTopic(idx) {
  activeTopicIndex = idx;
  activeSentenceIndex = 0;
  const meta = topicsCatalog[idx];
  if (!meta) return;

  let pack = getCachedTopicPack(meta.topic);

  // Tải gói câu từ api.php?action=download nếu chưa lưu offline hoặc version_hash thay đổi
  if (!pack || (meta.version_hash && pack.version_hash !== meta.version_hash)) {
    try {
      const res = await fetch(`${baseServerUrl}/api.php?action=download&topic=${encodeURIComponent(meta.topic)}`);
      const data = await res.json();
      if (data && data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
        pack = {
          topic: data.topic,
          title: data.title,
          version_hash: data.version_hash,
          items: data.items
        };
        localStorage.setItem('robo_pack_' + meta.topic, JSON.stringify(pack));
      }
    } catch (e) {
      console.warn('Download topic fallback:', e);
    }
  }

  renderStudyTopics();
  renderCurrentLesson();
  switchTab('robot');
  document.getElementById('faceBox').classList.add('docked');
  playCurrentSentence();
}

function getActiveLessonItems() {
  const meta = topicsCatalog[activeTopicIndex] || topicsCatalog[0];
  const cached = getCachedTopicPack(meta.topic);
  if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
    return { title: meta.title, slug: meta.topic, items: cached.items };
  }
  return { title: meta.title, slug: meta.topic, items: meta.items || FALLBACK_TOPICS[0].items };
}

function renderCurrentLesson() {
  const lesson = getActiveLessonItems();
  const item = lesson.items[activeSentenceIndex] || lesson.items[0];

  document.getElementById('lessonTopicBadge').textContent = `${lesson.title} (${activeSentenceIndex + 1}/${lesson.items.length})`;

  const words = item.en.split(/\s+/);
  document.getElementById('karaokeEn').innerHTML = words
    .map((w, i) => `<span class="word" id="kw_${i}">${w}</span>`)
    .join(' ');

  // Tạo chuỗi đánh vần từng chữ cái từ dữ liệu spelling của api.php (hoặc tự tách)
  if (Array.isArray(item.spelling) && item.spelling.length > 0) {
    document.getElementById('karaokeSpell').textContent = item.spelling
      .map(s => `${s.word.toUpperCase()}: ${s.spell}`)
      .join('  |  ');
  } else {
    document.getElementById('karaokeSpell').textContent = words
      .map(w => {
        const clean = w.replace(/[^a-zA-Z]/g, '').toUpperCase();
        return clean ? `${clean}: ${clean.split('').join('-')}` : '';
      })
      .filter(Boolean)
      .join('  |  ');
  }

  document.getElementById('karaokeVi').textContent = item.vi || '(Chưa có dịch tiếng Việt)';
  document.getElementById('pronounceFeedback').textContent = 'Bấm "Bé đọc" để luyện phát âm nhận sao ★!';
  lastChildHeardText = '';
  document.getElementById('btnReplayHeard').disabled = true;
}

function toggleDockEyes() {
  document.getElementById('faceBox').classList.toggle('docked');
}

function nextSentence() {
  const lesson = getActiveLessonItems();
  activeSentenceIndex = (activeSentenceIndex + 1) % lesson.items.length;
  renderCurrentLesson();
  playCurrentSentence();
}

function prevSentence() {
  const lesson = getActiveLessonItems();
  activeSentenceIndex = (activeSentenceIndex - 1 + lesson.items.length) % lesson.items.length;
  renderCurrentLesson();
  playCurrentSentence();
}

async function playCurrentSentence() {
  const lesson = getActiveLessonItems();
  const item = lesson.items[activeSentenceIndex] || lesson.items[0];
  const rate = parseFloat(document.getElementById('ttsSpeedSelect').value || '0.95');

  stopRobotAudioAndMic();

  // Hiệu ứng tô sáng từng chữ Karaoke
  const words = item.en.split(/\s+/);
  words.forEach((_, idx) => {
    setTimeout(() => {
      document.querySelectorAll('.k-en .word').forEach(el => el.classList.remove('active'));
      const wEl = document.getElementById('kw_' + idx);
      if (wEl) wEl.classList.add('active');
    }, idx * (350 / rate));
  });
  setTimeout(() => {
    document.querySelectorAll('.k-en .word').forEach(el => el.classList.remove('active'));
  }, words.length * (370 / rate) + 300);

  // Ưu tiên phát file MP3 bản xứ từ api.php nếu có audio_url
  if (item.audio_url) {
    try {
      setRobotExpression('speaking');
      currentAudioPlayer = new Audio(item.audio_url);
      currentAudioPlayer.playbackRate = rate;
      currentAudioPlayer.onended = () => setRobotExpression('idle');
      currentAudioPlayer.onerror = () => speakText(item.en, 'en-US', rate);
      await currentAudioPlayer.play();
      return;
    } catch (e) {
      // Fallback sang TTS bên dưới
    }
  }

  await speakText(item.en, 'en-US', rate);
}

async function speakText(text, lang = 'en-US', rate = 0.95) {
  setRobotExpression('speaking');
  const plugin = Native();
  if (plugin) {
    await plugin.speak({ text, lang, rate, pitch: 1.08 });
  } else if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    u.onend = () => setRobotExpression('idle');
    window.speechSynthesis.speak(u);
  }
}

function stopRobotAudioAndMic() {
  if (currentAudioPlayer) {
    try {
      currentAudioPlayer.pause();
      currentAudioPlayer = null;
    } catch (e) {}
  }
  const plugin = Native();
  if (plugin) {
    plugin.stopSpeak();
    plugin.stopListening();
  } else if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  setRobotExpression('idle');
}

async function startPronounceCheck() {
  stopRobotAudioAndMic();
  setRobotExpression('listening');
  document.getElementById('pronounceFeedback').textContent = '🎙️ Robo đang lắng nghe bé đọc...';

  const plugin = Native();
  if (plugin) {
    await plugin.startListening({ lang: 'en-US' });
  } else {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Chức năng Micro chạy trực tiếp trên bản cài đặt APK Android!');
      setRobotExpression('idle');
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.onresult = (e) => onSpeechRecognized(e.results[0][0].transcript);
    rec.onerror = () => setRobotExpression('idle');
    rec.start();
  }
}

function onSpeechRecognized(spoken) {
  setRobotExpression('idle');
  lastChildHeardText = spoken;
  document.getElementById('btnReplayHeard').disabled = false;

  const lesson = getActiveLessonItems();
  const item = lesson.items[activeSentenceIndex] || lesson.items[0];
  const targetWords = item.en.toLowerCase().replace(/[^a-z0-9'\s]/g, '').split(/\s+/).filter(Boolean);
  const spokenClean = spoken.toLowerCase().replace(/[^a-z0-9'\s]/g, '');

  let matched = 0;
  const wrongWords = [];

  targetWords.forEach((w, idx) => {
    const el = document.getElementById('kw_' + idx);
    if (spokenClean.includes(w)) {
      matched++;
      if (el) { el.classList.add('ok'); el.classList.remove('miss'); }
    } else {
      wrongWords.push(w);
      if (el) { el.classList.add('miss'); el.classList.remove('ok'); }
    }
  });

  const score = Math.round((matched / Math.max(1, targetWords.length)) * 100);
  const passed = score >= 80;
  const fb = document.getElementById('pronounceFeedback');

  // Ghi nhận tiến độ học lên api_user.php
  logLearningToServer({
    topic: lesson.slug,
    sentence_id: item.id ?? activeSentenceIndex,
    en: item.en,
    score: score,
    status: passed ? 'passed' : 'review',
    wrong_words: wrongWords
  });

  if (passed) {
    updateStarsUI(starsCount + 1, true);
    setRobotExpression('happy');
    sendEspCommand('M:CLAP');
    fb.textContent = `🎉 Đạt ${score}%! Máy nghe: "${spoken}" — Thưởng +1 ★!`;
    speakText('Great job! You earned one star!', 'en-US', 1.0);
  } else {
    fb.textContent = `💪 Đạt ${score}% — Máy nghe: "${spoken}". Bé xem phần đánh vần màu vàng rồi thử lại nhé!`;
  }
}

function replayChildHeard() {
  if (lastChildHeardText) {
    speakText(lastChildHeardText, 'en-US', 0.9);
  }
}

// ============================================================================
// 6. ĐỒNG BỘ HỒ SƠ & NHẬT KÝ HỌC TẬP VỚI API_USER.PHP
// ============================================================================
async function syncProfileAndProgress() {
  try {
    await fetch(`${baseServerUrl}/api_user.php?action=sync_profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_id: APP_UID,
        profile: {
          study_only: studyOnlyMode,
          parent_pin: parentPin,
          speech_rate: parseFloat(document.getElementById('ttsSpeedSelect').value || '0.95')
        }
      })
    });
  } catch (e) {}
}

async function logLearningToServer(record) {
  try {
    await fetch(`${baseServerUrl}/api_user.php?action=log_learning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_id: APP_UID,
        ...record
      })
    });
  } catch (e) {}
}

async function logUserActivity(type, detail) {
  try {
    await fetch(`${baseServerUrl}/api_user.php?action=log_activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_id: APP_UID,
        type: type,
        detail: detail
      })
    });
  } catch (e) {}
}

// ============================================================================
// 7. TRẠNG THÁI THIẾT BỊ, GHIM CHỐNG THOÁT & CÀI ĐẶT PHỤ HUYNH
// ============================================================================
async function refreshDeviceStatus() {
  const plugin = Native();
  const pill = document.getElementById('batteryTempPill');
  const banner = document.getElementById('settingStatusBanner');

  if (!plugin) {
    banner.textContent = `UID: ${APP_UID} | Chế độ Web | Server: ${baseServerUrl}`;
    return;
  }

  try {
    const info = await plugin.getDeviceStatus();
    const bat = info.battery ?? 80;
    const temp = Number(info.temperature ?? 36.5).toFixed(1);
    pill.textContent = `🔋 ${bat}% • ${temp}°C`;
    pill.classList.toggle('warn', bat < 15 || parseFloat(temp) > 42.0);

    const ipPart = info.localIp && info.localIp !== '0.0.0.0' ? ` (${info.localIp})` : '';
    const pinState = info.isPinned ? 'Đã ghim' : 'Chưa ghim';
    banner.textContent = `UID: ${APP_UID} | Wi-Fi: ${info.wifiSsid}${ipPart} | ${pinState}`;
  } catch (e) {}
}

function requestOpenSetting() {
  document.getElementById('pinInput').value = '';
  document.getElementById('pinModal').classList.add('open');
}

function verifyPin() {
  const val = document.getElementById('pinInput').value.trim();
  if (val === parentPin) {
    closeModal('pinModal');
    switchTab('setting');
  } else {
    alert('Sai mã PIN phụ huynh! (Mặc định là 1234)');
  }
}

function toggleStudyOnly(checked) {
  studyOnlyMode = checked;
  localStorage.setItem('robo_study_only', checked ? '1' : '0');
  syncProfileAndProgress();
}

async function setAppPinning(enable) {
  const plugin = Native();
  if (plugin) {
    await plugin.setKioskMode({ enabled: enable });
    refreshDeviceStatus();
    alert(enable
      ? 'Đã bật Ghim màn hình chống thoát! (Lưu ý: Cần bật mục "Ghim ứng dụng / Pin windows" trong Cài đặt Bảo mật của điện thoại).'
      : 'Đã mở khóa Ghim màn hình.');
  } else {
    alert('Tính năng Ghim ứng dụng hoạt động trên thiết bị Android.');
  }
}

function openChangePinModal() {
  const np = prompt('Nhập mã PIN 4 số mới cho Phụ huynh:', parentPin);
  if (np && /^\d{4}$/.test(np)) {
    parentPin = np;
    localStorage.setItem('robo_pin', np);
    syncProfileAndProgress();
    alert('Đã đổi mã PIN thành công!');
  } else if (np !== null) {
    alert('Mã PIN phải gồm đúng 4 chữ số.');
  }
}

function onBrightnessChange(val) {
  document.getElementById('brightnessVal').textContent = val + '%';
  const plugin = Native();
  if (plugin) plugin.setBrightness({ level: parseInt(val, 10) });
}

function onVolumeChange(val) {
  document.getElementById('volumeVal').textContent = val + '%';
  const plugin = Native();
  if (plugin) plugin.setVolume({ level: parseInt(val, 10) });
}

function saveSettings() {
  syncProfileAndProgress();
}

function openAndroidWifi() {
  const plugin = Native();
  if (plugin) plugin.openWifiSettings();
}

function openApiConfigModal() {
  document.getElementById('apiBaseUrlInput').value = baseServerUrl;
  document.getElementById('apiModal').classList.add('open');
}

function saveApiBaseUrl() {
  const val = document.getElementById('apiBaseUrlInput').value.trim().replace(/\/+$/, '');
  if (val) {
    baseServerUrl = val;
    localStorage.setItem('robo_base_url', baseServerUrl);
    closeModal('apiModal');
    refreshDeviceStatus();
    alert('Đã lưu đường dẫn thư mục Backend!');
  }
}

// ============================================================================
// 8. KẾT NỐI PHẦN CỨNG ESP32 BLE & BIỂU CẢM KHUÔN MẶT
// ============================================================================
function openEsp32Modal() {
  document.getElementById('espModal').classList.add('open');
}

async function connectEsp32Ble() {
  const st = document.getElementById('espStatusText');
  const pill = document.getElementById('bleStatusPill');
  try {
    if (!navigator.bluetooth) {
      st.textContent = 'Thiết bị chưa bật Bluetooth WebView.';
      return;
    }
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'ESP32' }, { namePrefix: 'Robot' }],
      optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb']
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
    bleCharacteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
    await bleCharacteristic.startNotifications();
    bleCharacteristic.addEventListener('characteristicvaluechanged', (ev) => {
      const msg = new TextDecoder().decode(ev.target.value).trim();
      if (msg.startsWith('BTN_')) {
        const btnNum = parseInt(msg.replace('BTN_', ''), 10);
        wakeUpRobot();
        if (currentTab === 'robot') {
          if (btnNum === 1) startPronounceCheck();
          if (btnNum === 2) playCurrentSentence();
          if (btnNum === 3) nextSentence();
          if (btnNum === 4) switchTab('study');
        }
      }
    });
    st.textContent = '✅ Đã kết nối với ' + device.name;
    pill.textContent = '🔌 BLE OK';
    pill.classList.add('connected');
  } catch (e) {
    st.textContent = '⚠️ Chưa ghép nối BLE: ' + e.message;
  }
}

async function sendEspCommand(cmd) {
  if (!bleCharacteristic) return;
  try {
    await bleCharacteristic.writeValue(new TextEncoder().encode(cmd + '\n'));
  } catch (e) {}
}

function setRobotExpression(expr) {
  const box = document.getElementById('faceBox');
  const isDocked = box.classList.contains('docked');
  box.className = 'face-box' + (isDocked ? ' docked' : '') + (expr && expr !== 'idle' ? ' ' + expr : '');
}

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (currentTab === 'robot') {
      isSleeping = true;
      setRobotExpression('sleep');
    }
  }, 60000);
}

function wakeUpRobot() {
  if (!isSleeping) return;
  isSleeping = false;
  setRobotExpression('happy');
  setTimeout(() => setRobotExpression('idle'), 1500);
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
