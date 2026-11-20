// Robot 2027 V1.4 - Động cơ Biểu cảm Khuôn mặt, Giọng nói Đánh thức & Bài học Karaoke
window.FaceLessonEngine = (function () {
  let currentTopic = null;
  let sentenceOrder = [];
  let cursor = 0;
  let attempts = 0;
  let isSleeping = false;
  let idleTimer = null;
  let isLessonOpen = false;
  let highlightTimer = null;
  let lastRecordedAudioUrl = null;
  let mediaRecorder = null;

  const eyeL = () => document.getElementById('eyeLeft');
  const eyeR = () => document.getElementById('eyeRight');
  const mouth = () => document.getElementById('robotMouth');
  const stage = () => document.getElementById('robotStage');
  const caption = () => document.getElementById('faceCaption');

  function setEmotion(emotion, textCaption) {
    const l = eyeL();
    const r = eyeR();
    if (!l || !r) return;
    l.className = 'r-eye';
    r.className = 'r-eye';
    if (emotion && emotion !== 'normal') {
      l.classList.add(emotion);
      r.classList.add(emotion);
    }
    if (textCaption && caption()) {
      caption().textContent = textCaption;
    }

    // Đồng bộ cử động vật lý xuống ESP32 BLE
    const mapBle = {
      happy: 'M:HAPPY',
      listening: 'M:NOD',
      thinking: 'M:THINK',
      encourage: 'M:WAVE',
      dizzy: 'M:SHAKE'
    };
    if (mapBle[emotion]) {
      window.HardwareBridge.sendBleCommand(mapBle[emotion]);
    }
  }

  function startBlinkLoop() {
    setInterval(() => {
      if (isSleeping) return;
      const l = eyeL();
      const r = eyeR();
      if (!l || !r || l.classList.contains('happy')) return;
      l.classList.add('blink');
      r.classList.add('blink');
      setTimeout(() => {
        l.classList.remove('blink');
        r.classList.remove('blink');
      }, 150);
    }, 3800);
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (isSleeping) wakeUp(false);
    idleTimer = setTimeout(() => {
      // Chỉ ngủ khi đang ở tab Robot
      const robotView = document.getElementById('view-robot');
      if (robotView && robotView.classList.contains('active')) {
        enterSleepMode();
      }
    }, window.ROBOT_CONFIG.SLEEP_TIMEOUT_MS);
  }

  function enterSleepMode() {
    isSleeping = true;
    setEmotion('sleep', 'Zzz... Chạm màn hình hoặc gọi "Hello" để đánh thức mình nhé!');
    document.getElementById('sleepOverlay').classList.add('active');
    window.HardwareBridge.setBrightness(2);
    window.HardwareBridge.stopSpeak();
  }

  function wakeUp(greet = true) {
    isSleeping = false;
    document.getElementById('sleepOverlay').classList.remove('active');
    const s = window.RobotStorage.getSettings();
    window.HardwareBridge.setBrightness(s.brightness);
    setEmotion('happy', `${s.robotName} đã thức dậy rồi đây! Mình cùng học tiếng Anh nhé!`);
    if (greet) {
      window.HardwareBridge.speak(`Hello! I am ${s.robotName}. Let's learn English together!`, 'en-US', s.ttsRate);
    }
    resetIdleTimer();
  }

  // Nạp chủ đề và chuẩn bị danh sách câu (Thứ tự hoặc Ngẫu nhiên)
  function startTopic(topicId, startSentenceIdx = 0) {
    const topics = window.RobotStorage.getTopics();
    currentTopic = topics.find(t => t.id === topicId) || topics[0];
    if (!currentTopic || !currentTopic.items || currentTopic.items.length === 0) return;

    const settings = window.RobotStorage.getSettings();
    const indices = currentTopic.items.map((_, i) => i);
    if (settings.lessonMode === 'random') {
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    }
    sentenceOrder = indices;
    const foundPos = sentenceOrder.indexOf(startSentenceIdx);
    cursor = foundPos >= 0 ? foundPos : 0;
    attempts = 0;
    isLessonOpen = true;

    stage().classList.add('lesson-active');
    renderCurrentSentence(true);
  }

  function closeLessonBoard() {
    isLessonOpen = false;
    stage().classList.remove('lesson-active');
    window.HardwareBridge.stopSpeak();
    setEmotion('normal', 'Chạm vào bảng bài học bên dưới hoặc mở 📖 Sổ Học Tập để chọn chủ đề!');
  }

  function getCurrentSentence() {
    if (!currentTopic) {
      const topics = window.RobotStorage.getTopics();
      currentTopic = topics[0];
      sentenceOrder = currentTopic.items.map((_, i) => i);
      cursor = 0;
    }
    return currentTopic.items[sentenceOrder[cursor]];
  }

  function renderCurrentSentence(autoSpeak = false) {
    const item = getCurrentSentence();
    if (!item) return;

    const profile = window.RobotStorage.getActiveProfile();
    const isMastered = !!(profile.mastered && profile.mastered[`${currentTopic.id}_${item.id}`]);

    document.getElementById('lessonTopicLabel').textContent =
      `${currentTopic.icon || '📘'} ${currentTopic.name} • Câu ${cursor + 1}/${sentenceOrder.length} ${isMastered ? '✅ Đã thuộc' : ''}`;
    document.getElementById('lessonAttemptLabel').textContent = `Lần thử: ${attempts}/3`;

    const container = document.getElementById('karaokeWords');
    const words = item.en.split(/\s+/);
    container.innerHTML = words.map((w, idx) => {
      return `<span class="k-word" data-idx="${idx}" onclick="FaceLessonEngine.spellSingleWord('${w.replace(/'/g, "\'")}')">${w}</span>`;
    }).join('');

    document.getElementById('spellingStrip').textContent = '💡 Chạm vào từng từ tiếng Anh ở trên để nghe đánh vần từng chữ cái!';
    const viEl = document.getElementById('viTranslation');
    viEl.textContent = `🇻🇳 ${item.vi}`;
    viEl.classList.remove('hidden-vi');

    document.getElementById('speechFeedback').textContent = '🎙️ Bấm "Đọc luyện phát âm" và đọc to câu tiếng Anh trên nhé!';

    // Mở khóa nút Bỏ qua sau >= 2 lần thử
    const skipBtn = document.getElementById('btnSkipSentence');
    if (skipBtn) {
      skipBtn.disabled = attempts < 2;
      skipBtn.title = attempts < 2 ? 'Thử đọc ít nhất 2 lần để mở khóa Bỏ qua' : 'Bỏ qua câu này để ôn sau';
    }

    if (autoSpeak) {
      playCurrentSentence(false);
    }
  }

  function playCurrentSentence(slow = false) {
    resetIdleTimer();
    const item = getCurrentSentence();
    if (!item) return;
    const settings = window.RobotStorage.getSettings();
    const rate = slow ? 0.65 : settings.ttsRate;

    setEmotion('normal', slow ? '🐢 Đang đọc chậm từng từ...' : '🔊 Đang đọc mẫu câu tiếng Anh...');
    const wordEls = document.querySelectorAll('#karaokeWords .k-word');
    wordEls.forEach(el => el.classList.remove('active-read'));

    if (highlightTimer) clearInterval(highlightTimer);
    let idx = 0;
    const stepMs = Math.max(260, Math.round(420 / rate));
    if (wordEls.length > 0) wordEls[0].classList.add('active-read');

    highlightTimer = setInterval(() => {
      wordEls.forEach(el => el.classList.remove('active-read'));
      idx++;
      if (idx < wordEls.length) {
        wordEls[idx].classList.add('active-read');
      } else {
        clearInterval(highlightTimer);
      }
    }, stepMs);

    window.HardwareBridge.speak(item.en, 'en-US', rate);
  }

  function spellSingleWord(rawWord) {
    resetIdleTimer();
    const clean = rawWord.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (!clean) return;
    const item = getCurrentSentence();
    let spelled = '';
    if (item && item.spell && item.spell[clean]) {
      spelled = item.spell[clean];
    } else {
      spelled = clean.toUpperCase().split('').join(' - ');
    }
    document.getElementById('spellingStrip').textContent = `🔤 ${clean.toUpperCase()} : ${spelled}`;
    setEmotion('thinking', `Đánh vần từ "${clean}"...`);
    window.HardwareBridge.speak(`${clean}. ${spelled.replace(/-/g, ', ')}`, 'en-US', 0.85);
  }

  function spellWholeSentence() {
    resetIdleTimer();
    const item = getCurrentSentence();
    if (!item) return;
    const words = item.en.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/).slice(0, 5);
    const breakdown = words.map(w => `${w}: ${w.toUpperCase().split('').join('-')}`).join(' | ');
    document.getElementById('spellingStrip').textContent = `🔤 ${breakdown}`;
    window.HardwareBridge.speak(words.map(w => w.split('').join(' ')).join('. '), 'en-US', 0.82);
  }

  function toggleVietnameseHint() {
    const viEl = document.getElementById('viTranslation');
    viEl.classList.toggle('hidden-vi');
    const item = getCurrentSentence();
    if (item && !viEl.classList.contains('hidden-vi')) {
      window.HardwareBridge.speak(item.vi, 'vi-VN', 1.0);
    }
  }

  async function startPronunciationPractice() {
    resetIdleTimer();
    await window.HardwareBridge.stopSpeak();
    setEmotion('listening', '🎙️ Robot đang lắng nghe bạn đọc tiếng Anh...');
    document.getElementById('speechFeedback').textContent = '🎙️ Hãy đọc to câu tiếng Anh trên màn hình...';

    // Ghi âm lại giọng bé (nếu WebView hỗ trợ MediaRecorder) để nghe lại đối chiếu
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        mediaRecorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks, { type: 'audio/webm' });
          if (lastRecordedAudioUrl) URL.revokeObjectURL(lastRecordedAudioUrl);
          lastRecordedAudioUrl = URL.createObjectURL(blob);
          const btnReplay = document.getElementById('btnReplayKidVoice');
          if (btnReplay) btnReplay.disabled = false;
        };
        mediaRecorder.start();
        setTimeout(() => {
          if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
        }, 5500);
      }
    } catch (e) {}

    const ok = await window.HardwareBridge.startListening('en-US');
    if (!ok) {
      setEmotion('encourage', 'Thiết bị chưa bật Micro nhận diện giọng nói.');
      document.getElementById('speechFeedback').textContent = '⚠️ Không mở được Micro. Kiểm tra quyền Micro trong Cài đặt Android.';
    }
  }

  function replayKidVoice() {
    if (!lastRecordedAudioUrl) {
      window.AppController.showToast('Chưa có bản ghi giọng đọc gần đây!');
      return;
    }
    const audio = new Audio(lastRecordedAudioUrl);
    audio.play();
  }

  function evaluateSpokenText(spokenRaw) {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop(); } catch (e) {}
    }

    const spoken = (spokenRaw || '').toLowerCase().trim();
    if (!spoken) return;

    // Kiểm tra lệnh điều hướng nhanh bằng giọng nói
    if (spoken.includes('youtube')) { window.AppController.switchTab('youtube'); return; }
    if (spoken.includes('game')) { window.AppController.switchTab('game'); return; }
    if (spoken.includes('next sentence') || spoken.includes('skip')) { nextSentence(); return; }
    if (spoken.includes('repeat') || spoken.includes('again')) { playCurrentSentence(false); return; }

    if (!isLessonOpen) {
      startTopic(window.RobotStorage.getTopics()[0].id, 0);
      return;
    }

    const item = getCurrentSentence();
    const targetWords = item.en.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const spokenWords = spoken.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);

    let matched = 0;
    const wordEls = document.querySelectorAll('#karaokeWords .k-word');
    targetWords.forEach((tw, i) => {
      const hit = spokenWords.includes(tw);
      if (hit) matched++;
      if (wordEls[i]) {
        wordEls[i].classList.remove('word-ok', 'word-err', 'active-read');
        wordEls[i].classList.add(hit ? 'word-ok' : 'word-err');
      }
    });

    const score = targetWords.length > 0 ? Math.round((matched / targetWords.length) * 100) : 0;
    attempts++;
    document.getElementById('lessonAttemptLabel').textContent = `Lần thử: ${attempts}/3 • Điểm: ${score}%`;

    const skipBtn = document.getElementById('btnSkipSentence');
    if (skipBtn && attempts >= 2) skipBtn.disabled = false;

    if (score >= 75) {
      setEmotion('happy', `🌟 Tuyệt vời! Bạn đọc đạt ${score}% (+1 ★)`);
      document.getElementById('speechFeedback').innerHTML =
        `✅ Bạn đọc: <b>"${spokenRaw}"</b> — Đạt <b>${score}%</b>! Thưởng <b>+1 ★</b>`;

      window.RobotStorage.updateActiveProfile(p => {
        p.stars = (p.stars || 0) + 1;
        p.mastered = p.mastered || {};
        p.mastered[`${currentTopic.id}_${item.id}`] = true;
        p.studySeconds = (p.studySeconds || 0) + 15;
      });
      window.RobotStorage.appendLog({
        type: 'lesson_pass',
        topic: currentTopic.name,
        sentence: item.en,
        score
      });
      window.AppController.refreshHud();
      window.HardwareBridge.speak(`Awesome! You got ${score} percent and earned one star!`, 'en-US', 0.95);
      setTimeout(() => nextSentence(), 2800);
    } else {
      // Lưu từ đọc sai để phụ huynh xem trong báo cáo
      window.RobotStorage.updateActiveProfile(p => {
        p.mistakes = p.mistakes || {};
        targetWords.forEach(tw => {
          if (!spokenWords.includes(tw)) p.mistakes[tw] = (p.mistakes[tw] || 0) + 1;
        });
      });

      if (attempts > 3) {
        // Xử lý thông minh khi đọc sai > 3 lần: Hỏi rõ học lại từ đầu hay qua câu khác
        setEmotion('encourage', 'Câu này hơi khó một chút! Bạn chọn hướng đi nhé:');
        document.getElementById('retryChoiceModal').classList.add('open');
        window.HardwareBridge.speak('Câu này hơi khó một chút! Bạn muốn học lại câu này từ đầu hay chuyển sang câu khác?', 'vi-VN', 1.0);
      } else {
        setEmotion('encourage', `Gần đúng rồi (${score}%). Chạm vào từ màu đỏ để nghe đánh vần nhé!`);
        document.getElementById('speechFeedback').innerHTML =
          `⚠️ Bạn đọc: <b>"${spokenRaw}"</b> (${score}%). Từ màu đỏ chưa chuẩn, thử lại lần ${attempts + 1} nhé!`;
        window.HardwareBridge.speak('Almost there! Try again!', 'en-US', 0.95);
      }
    }
  }

  function chooseRestartSentence() {
    document.getElementById('retryChoiceModal').classList.remove('open');
    attempts = 0;
    renderCurrentSentence(false);
    playCurrentSentence(true);
  }

  function chooseNextSentenceFromModal() {
    document.getElementById('retryChoiceModal').classList.remove('open');
    nextSentence();
  }

  function nextSentence() {
    resetIdleTimer();
    if (!currentTopic) return;
    attempts = 0;
    cursor = (cursor + 1) % sentenceOrder.length;
    renderCurrentSentence(true);
  }

  function init() {
    startBlinkLoop();
    resetIdleTimer();

    window.addEventListener('robot:ttsStart', () => {
      if (mouth()) mouth().classList.add('speaking');
    });
    window.addEventListener('robot:ttsEnd', () => {
      if (mouth()) mouth().classList.remove('speaking');
      if (!isSleeping && !isLessonOpen) {
        setEmotion('normal', 'Mình đang sẵn sàng! Bấm 📖 Sổ Học Tập hoặc 🎙️ Luyện đọc nhé.');
      }
    });
    window.addEventListener('robot:speechPartial', (e) => {
      document.getElementById('speechFeedback').textContent = `🎙️ Đang nghe: "${e.detail}"...`;
    });
    window.addEventListener('robot:speechResult', (e) => {
      evaluateSpokenText(e.detail);
    });
    window.addEventListener('robot:speechError', () => {
      setEmotion('normal', 'Chưa nghe rõ giọng bạn, bấm 🎙️ Đọc luyện phát âm để thử lại nhé!');
    });
    window.addEventListener('robot:tiltAlert', () => {
      setEmotion('dizzy', 'Ối! Cẩn thận nghiêng ngã Robo nha!');
      window.HardwareBridge.speak('Ối, cẩn thận kẻo ngã Robo nha!', 'vi-VN', 1.0);
    });
    // Nhận tín hiệu 4 nút cứng từ ESP32 BLE
    window.addEventListener('robot:bleData', (e) => {
      const cmd = e.detail;
      resetIdleTimer();
      if (cmd === 'BTN:1') playCurrentSentence(false);
      else if (cmd === 'BTN:2') toggleVietnameseHint();
      else if (cmd === 'BTN:3') nextSentence();
      else if (cmd === 'BTN:4') window.AppController.switchTab('game');
    });
  }

  return {
    init,
    setEmotion,
    resetIdleTimer,
    wakeUp,
    startTopic,
    closeLessonBoard,
    playCurrentSentence,
    spellSingleWord,
    spellWholeSentence,
    toggleVietnameseHint,
    startPronunciationPractice,
    replayKidVoice,
    nextSentence,
    chooseRestartSentence,
    chooseNextSentenceFromModal,
    getCurrentTopic: () => currentTopic
  };
})();
