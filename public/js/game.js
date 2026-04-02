// ===== ゲームエンジン (Canvas + Web Audio API + マルチプレイヤー対応) =====
(async function () {
  const song = JSON.parse(sessionStorage.getItem('selectedSong') || 'null');
  const difficulty = sessionStorage.getItem('selectedDifficulty') || 'normal';
  if (!song) { window.location.href = 'index.html'; return; }

  // --- モード判定 ---
  const gameMode = sessionStorage.getItem('gameMode') || 'solo';
  const isOnline = gameMode === 'online';
  const roomId   = sessionStorage.getItem('roomId') || null;
  const opponentName = sessionStorage.getItem('opponentName') || '???';
  const myName   = sessionStorage.getItem('onlinePlayerName') || 'Player';

  // --- DOM ---
  const canvas      = document.getElementById('gameCanvas');
  const ctx         = canvas.getContext('2d');
  const scoreDisplay  = document.getElementById('scoreDisplay');
  const comboDisplay  = document.getElementById('comboDisplay');
  const progressBar   = document.getElementById('progressBar');
  const songNameHud   = document.getElementById('songNameHud');
  const countdownOverlay = document.getElementById('countdownOverlay');
  const countdownNumber  = document.getElementById('countdownNumber');
  const pauseOverlay  = document.getElementById('pauseOverlay');
  const btnMenuHud    = document.getElementById('btnMenuHud');
  const btnResume     = document.getElementById('btnResume');
  const btnToMenu     = document.getElementById('btnToMenu');

  // オンライン専用DOM
  const opponentHud    = document.getElementById('opponentHud');
  const opponentNameHud= document.getElementById('opponentNameHud');
  const opponentScoreEl= document.getElementById('opponentScore');
  const opponentComboEl= document.getElementById('opponentCombo');
  const opponentJudgEl = document.getElementById('opponentJudgment');
  const battleResultOverlay = document.getElementById('battleResultOverlay');
  const battleResultTitle   = document.getElementById('battleResultTitle');
  const battleScores        = document.getElementById('battleScores');
  const btnBattleMenu       = document.getElementById('btnBattleMenu');
  const disconnectOverlay   = document.getElementById('disconnectOverlay');
  const btnContinueSolo     = document.getElementById('btnContinueSolo');
  const btnDisconnectMenu   = document.getElementById('btnDisconnectMenu');

  function diffLabel(d) {
    return { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' }[d] || d;
  }
  songNameHud.textContent = `${song.icon} ${song.title} [${diffLabel(difficulty)}]`;

  // --- 定数 ---
  const JUDGE_LINE_X = 160;
  const NOTE_SPEED = { easy: 280, normal: 380, hard: 500 }[difficulty];
  const HIT_WINDOW = { perfect: 0.065, good: 0.13 };
  const NOTE_R = 28;

  // --- 状態 ---
  let notes = [];
  let score = 0, combo = 0, maxCombo = 0;
  let countPerfect = 0, countGood = 0, countMiss = 0, totalNotes = 0;
  let gameRunning = false, isPaused = false;
  let chartDuration = 0;
  let animId = null;
  let lastTimestamp = null;
  let opponentDisconnected = false;

  // --- エフェクト用配列 ---
  let particles  = [];
  let rings      = [];
  let canvasTexts = [];
  let screenFlash = null;

  // --- Canvas リサイズ ---
  function resizeCanvas() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // --- 譜面ロード ---
  let chart;
  try {
    chart = await ChartManager.loadChart(song.id, difficulty);
  } catch (e) {
    alert('譜面データが見つかりません。');
    window.location.href = 'index.html';
    return;
  }
  totalNotes    = chart.notes.length;
  chartDuration = (chart.notes[chart.notes.length - 1]?.time ?? 10) + 2;

  function initNotes() {
    notes = chart.notes.map(n => ({ time: n.time, type: n.type, hit: null }));
  }

  function getGameTime() {
    return AudioManager.getBGMCurrentTime() - (chart.offset || 0);
  }

  function noteX(noteTime) {
    return JUDGE_LINE_X + (noteTime - getGameTime()) * NOTE_SPEED;
  }

  // =============================================
  // オンラインモード初期化
  // =============================================
  if (isOnline && roomId) {
    opponentHud.style.display = 'flex';
    opponentNameHud.textContent = opponentName;

    // Socket.ioルーム再参加 (ページ遷移後)
    Multiplayer.rejoinRoom(roomId, myName);

    // 相手スコア更新
    Multiplayer.on('opponentUpdate', (data) => {
      opponentScoreEl.textContent = data.score.toLocaleString();
      opponentComboEl.textContent = data.combo;

      // 相手の判定表示
      if (data.judgment) {
        showOpponentJudgment(data.judgment);
      }
    });

    // 相手切断
    Multiplayer.on('opponentDisconnected', () => {
      opponentDisconnected = true;
      if (gameRunning) {
        gameRunning = false;
        isPaused = true;
        AudioManager.pauseBGM();
        if (animId) cancelAnimationFrame(animId);
        disconnectOverlay.style.display = 'flex';
      }
    });

    // 対戦結果
    Multiplayer.on('battleResult', (data) => {
      showBattleResult(data.results);
    });
  }

  // --- 相手の判定テキスト表示 ---
  let opponentJudgTimer = null;
  function showOpponentJudgment(judgment) {
    const text = judgment === 'perfect' ? 'PERFECT!' : judgment === 'good' ? 'GOOD' : 'MISS';
    const color = judgment === 'perfect' ? '#ffe156' : judgment === 'good' ? '#6bffb8' : '#ff5555';
    opponentJudgEl.textContent = text;
    opponentJudgEl.style.color = color;
    opponentJudgEl.style.opacity = '1';
    clearTimeout(opponentJudgTimer);
    opponentJudgTimer = setTimeout(() => {
      opponentJudgEl.style.opacity = '0';
    }, 400);
  }

  // --- 対戦結果表示 ---
  function showBattleResult(results) {
    if (animId) cancelAnimationFrame(animId);
    gameRunning = false;
    AudioManager.stopBGM();

    const myResult = results.find(r => r.name === myName);
    const opResult = results.find(r => r.name !== myName);

    let titleText, titleClass;
    if (results[0].name === myName) {
      titleText = '🎉 WIN!';
      titleClass = 'battle-win';
    } else if (myResult && opResult && myResult.score === opResult.score) {
      titleText = '🤝 DRAW!';
      titleClass = 'battle-draw';
    } else {
      titleText = '😢 LOSE...';
      titleClass = 'battle-lose';
    }

    battleResultTitle.textContent = titleText;
    battleResultTitle.className = 'battle-result-title ' + titleClass;

    battleScores.innerHTML = results.map((r, i) => `
      <div class="battle-score-row ${i === 0 ? 'winner' : ''}">
        <span class="battle-place">${i === 0 ? '👑' : '💀'}</span>
        <span class="battle-player-name">${r.name}</span>
        <span class="battle-player-score">${r.score.toLocaleString()}</span>
        <span class="battle-player-combo">${r.maxCombo || 0} combo</span>
        <span class="battle-player-acc">${r.accuracy || 0}%</span>
      </div>
    `).join('');

    battleResultOverlay.style.display = 'flex';
  }

  // 切断時ボタン
  if (btnContinueSolo) {
    btnContinueSolo.addEventListener('click', () => {
      disconnectOverlay.style.display = 'none';
      isPaused = false;
      gameRunning = true;
      AudioManager.resumeBGM();
      lastTimestamp = null;
      animId = requestAnimationFrame(gameLoop);
    });
  }
  if (btnDisconnectMenu) {
    btnDisconnectMenu.addEventListener('click', () => {
      AudioManager.stopBGM();
      window.location.href = 'index.html';
    });
  }
  if (btnBattleMenu) {
    btnBattleMenu.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }

  // =============================================
  // エフェクト生成
  // =============================================
  function spawnEffect(result) {
    const laneY = canvas.height * 0.5;
    const x = JUDGE_LINE_X;

    if (result === 'perfect') {
      for (let i = 0; i < 22; i++) {
        const angle = (Math.PI * 2 * i / 22) + Math.random() * 0.25;
        const speed = 130 + Math.random() * 170;
        particles.push({
          x, y: laneY,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          r: 3 + Math.random() * 5,
          color: ['#ffe156','#ffffff','#ffb347','#fffaaa'][Math.floor(Math.random() * 4)],
          alpha: 1, decay: 0.026 + Math.random() * 0.014, gravity: 80
        });
      }
      for (let i = 0; i < 3; i++) {
        rings.push({
          x, y: laneY, r: NOTE_R + 4,
          targetR: NOTE_R + 100 + i * 28,
          color: i === 0 ? '#ffe156' : i === 1 ? '#ffb347' : '#ffffff',
          alpha: 1 - i * 0.2, speed: 200 + i * 50
        });
      }
      screenFlash = { r: 255, g: 255, b: 200, alpha: 0.3, decay: 0.045 };
    } else if (result === 'good') {
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i / 12);
        const speed = 70 + Math.random() * 90;
        particles.push({
          x, y: laneY,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          r: 2 + Math.random() * 4,
          color: ['#6bffb8','#5bc8ff','#ffffff'][Math.floor(Math.random() * 3)],
          alpha: 1, decay: 0.042 + Math.random() * 0.018, gravity: 50
        });
      }
      rings.push({
        x, y: laneY, r: NOTE_R + 4, targetR: NOTE_R + 68,
        color: '#6bffb8', alpha: 0.85, speed: 170
      });
    } else {
      for (let i = 0; i < 8; i++) {
        particles.push({
          x: x + (Math.random() - 0.5) * 35,
          y: laneY + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 55,
          vy: -45 - Math.random() * 55,
          r: 5 + Math.random() * 7,
          color: '#ff4444',
          alpha: 0.85, decay: 0.038 + Math.random() * 0.018, gravity: 40
        });
      }
      screenFlash = { r: 255, g: 0, b: 0, alpha: 0.22, decay: 0.065 };
    }

    canvasTexts.push({
      text:  result === 'perfect' ? 'PERFECT!' : result === 'good' ? 'GOOD' : 'MISS',
      x, y: laneY - NOTE_R - 20,
      vy:   result === 'perfect' ? -55 : -40,
      alpha: 1,
      decay: result === 'perfect' ? 0.020 : 0.032,
      color: result === 'perfect' ? '#ffe156' : result === 'good' ? '#6bffb8' : '#ff5555',
      shadow: result === 'perfect' ? '#ffb347' : result === 'good' ? '#00ff88' : '#ff0000',
      size:  result === 'perfect' ? 32 : result === 'good' ? 26 : 23
    });
  }

  // =============================================
  // エフェクト更新 (dt: 秒)
  // =============================================
  function updateEffects(dt) {
    particles = particles.filter(p => p.alpha > 0.01);
    particles.forEach(p => {
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.vy += p.gravity * dt;
      p.alpha -= p.decay;
    });

    rings = rings.filter(r => r.r < r.targetR && r.alpha > 0.01);
    rings.forEach(r => {
      r.r += r.speed * dt;
      const progress = (r.r - (NOTE_R + 4)) / (r.targetR - NOTE_R - 4);
      r.alpha = (1 - progress) * (r.alpha > 0 ? r.alpha : 0.8);
    });

    canvasTexts = canvasTexts.filter(t => t.alpha > 0.01);
    canvasTexts.forEach(t => {
      t.y     += t.vy * dt;
      t.alpha -= t.decay;
    });

    if (screenFlash) {
      screenFlash.alpha -= screenFlash.decay;
      if (screenFlash.alpha <= 0) screenFlash = null;
    }
  }

  // =============================================
  // 描画
  // =============================================
  function draw() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const laneY = H * 0.5;

    // スクリーンフラッシュ
    if (screenFlash && screenFlash.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = screenFlash.alpha;
      ctx.fillStyle = `rgb(${screenFlash.r},${screenFlash.g},${screenFlash.b})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // レーンライン
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, laneY); ctx.lineTo(W, laneY); ctx.stroke();

    // 判定ラインの背景グロー
    const glowGrad = ctx.createRadialGradient(JUDGE_LINE_X, laneY, 0, JUDGE_LINE_X, laneY, 54);
    glowGrad.addColorStop(0, 'rgba(255,255,255,0.85)');
    glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath(); ctx.arc(JUDGE_LINE_X, laneY, 54, 0, Math.PI * 2); ctx.fill();

    // 判定ライン円
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(JUDGE_LINE_X, laneY, NOTE_R + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // 拡張リング
    rings.forEach(r => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, r.alpha);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });

    // パーティクル
    particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.r), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // ノーツ描画
    const now = getGameTime();
    notes.forEach(note => {
      if (note.hit !== null) return;
      const x = noteX(note.time);
      if (x < -NOTE_R * 2 || x > W + NOTE_R) return;
      const isDon  = note.type === 'don';
      const color1 = isDon ? '#ff6b6b' : '#4d9fff';
      const color2 = isDon ? '#cc0000' : '#0044cc';
      ctx.save();
      const grad = ctx.createRadialGradient(x - NOTE_R * 0.3, laneY - NOTE_R * 0.3, 2, x, laneY, NOTE_R);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.3, color1);
      grad.addColorStop(1, color2);
      ctx.shadowColor = color1; ctx.shadowBlur = 20;
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(x, laneY, NOTE_R, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${NOTE_R * 0.72}px 'Noto Sans JP'`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(isDon ? 'ド' : 'カ', x, laneY);
      ctx.restore();
    });

    // 判定テキスト (判定ライン真上)
    canvasTexts.forEach(t => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, t.alpha);
      ctx.font = `900 ${t.size}px 'Noto Sans JP'`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = t.shadow; ctx.shadowBlur = 24;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.restore();
    });
  }

  // =============================================
  // 判定処理
  // =============================================
  function judge(type) {
    const now  = getGameTime();
    let best   = null, bestDist = Infinity;
    for (const note of notes) {
      if (note.hit !== null || note.type !== type) continue;
      const dist = Math.abs(note.time - now);
      if (dist < bestDist) { bestDist = dist; best = note; }
    }
    if (!best || bestDist > HIT_WINDOW.good) return;

    let judgment;
    if (bestDist <= HIT_WINDOW.perfect) {
      best.hit = 'perfect';
      score += 300 + combo * 2;
      combo++; countPerfect++;
      judgment = 'perfect';
      spawnEffect('perfect');
    } else {
      best.hit = 'good';
      score += 100;
      combo++; countGood++;
      judgment = 'good';
      spawnEffect('good');
    }
    if (combo > maxCombo) maxCombo = combo;
    updateHUD();

    if (best.type === 'don') AudioManager.playDon();
    else                     AudioManager.playKa();

    // オンラインモード: スコア送信
    if (isOnline && !opponentDisconnected) {
      Multiplayer.sendScoreUpdate(score, combo, judgment);
    }
  }

  function checkMiss() {
    const now = getGameTime();
    notes.forEach(note => {
      if (note.hit !== null) return;
      if (note.time < now - HIT_WINDOW.good) {
        note.hit = 'miss';
        combo = 0; countMiss++;
        spawnEffect('miss');
        updateHUD();
        // オンラインモード: miss送信
        if (isOnline && !opponentDisconnected) {
          Multiplayer.sendScoreUpdate(score, combo, 'miss');
        }
      }
    });
  }

  function updateHUD() {
    scoreDisplay.textContent = score.toLocaleString();
    comboDisplay.textContent = combo;
  }

  // =============================================
  // ゲームループ (delta time付き)
  // =============================================
  function gameLoop(timestamp) {
    if (!gameRunning) return;
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
    lastTimestamp = timestamp;

    checkMiss();
    updateEffects(dt);
    draw();

    const elapsed = getGameTime();
    progressBar.style.width = Math.min(elapsed / chartDuration * 100, 100) + '%';

    // 全ノーツ消化 or 最後のノーツから2秒経過 で終了
    const lastNoteTime = notes.length > 0 ? notes[notes.length - 1].time : 0;
    const allDone = notes.every(n => n.hit !== null);
    if ((allDone && elapsed > lastNoteTime + 1.5) || elapsed > lastNoteTime + 3) {
      endGame(); return;
    }
    animId = requestAnimationFrame(gameLoop);
  }

  // =============================================
  // ゲーム終了
  // =============================================
  function endGame() {
    gameRunning = false;
    AudioManager.stopBGM();
    if (animId) cancelAnimationFrame(animId);

    const accuracy = totalNotes > 0
      ? Math.round((countPerfect + countGood * 0.5) / totalNotes * 1000) / 10 : 0;

    const resultData = {
      song: song.id, songTitle: song.title, difficulty,
      score, maxCombo, accuracy,
      perfect: countPerfect, good: countGood, miss: countMiss
    };

    if (isOnline && !opponentDisconnected) {
      // オンラインモード: 終了結果をサーバーに送信し、対戦結果を待つ
      Multiplayer.sendGameFinished(resultData);
      // 結果はbattleResultコールバックで処理される
      // ソロリザルトも保存（フォールバック用）
      sessionStorage.setItem('result', JSON.stringify(resultData));
    } else {
      // ソロモード or 相手切断: 通常リザルト画面へ
      sessionStorage.setItem('result', JSON.stringify(resultData));
      window.location.href = 'result.html';
    }
  }

  // =============================================
  // ポーズ / メニュー (オンラインモードではポーズ不可)
  // =============================================
  function pauseGame() {
    if (!gameRunning || isPaused) return;
    if (isOnline && !opponentDisconnected) return; // オンライン中はポーズ不可
    isPaused = true; gameRunning = false;
    AudioManager.pauseBGM();
    if (animId) cancelAnimationFrame(animId);
    pauseOverlay.style.display = 'flex';
  }

  function resumeGame() {
    if (!isPaused) return;
    isPaused = false; gameRunning = true;
    pauseOverlay.style.display = 'none';
    AudioManager.resumeBGM();
    lastTimestamp = null;
    animId = requestAnimationFrame(gameLoop);
  }

  function goToMenu() {
    gameRunning = false;
    AudioManager.stopBGM();
    if (animId) cancelAnimationFrame(animId);
    if (isOnline) Multiplayer.disconnect();
    window.location.href = 'index.html';
  }

  btnMenuHud.addEventListener('click', pauseGame);
  btnResume.addEventListener('click', resumeGame);
  btnToMenu.addEventListener('click', goToMenu);

  // =============================================
  // キー入力
  // =============================================
  const DON_KEYS = new Set(['Space', 'KeyD', 'KeyF']);
  const KA_KEYS  = new Set(['Enter', 'KeyJ', 'KeyK']);

  window.addEventListener('keydown', e => {
    // ESC: ポーズ/再開
    if (e.code === 'Escape') {
      e.preventDefault();
      if (isPaused) resumeGame(); else pauseGame();
      return;
    }
    if (!gameRunning) return;
    e.preventDefault();
    AudioManager.resume();
    if (DON_KEYS.has(e.code))     judge('don');
    else if (KA_KEYS.has(e.code)) judge('ka');
  });

  // =============================================
  // カウントダウン & ゲーム開始
  // =============================================
  async function animateCount(text, duration) {
    countdownNumber.textContent = text;
    countdownNumber.classList.remove('animate');
    void countdownNumber.offsetWidth; // reflow強制
    countdownNumber.classList.add('animate');
    await new Promise(r => setTimeout(r, duration));
    countdownNumber.classList.remove('animate');
  }

  async function startCountdown() {
    await AudioManager.loadBGM(song.src).catch(() => null);

    if (isOnline && roomId) {
      // オンラインモード: ready送信して全員準備完了を待つ
      countdownNumber.textContent = '準備中...';
      countdownOverlay.style.display = 'flex';

      Multiplayer.sendReady();

      // gameStartイベント待ち
      await new Promise(resolve => {
        Multiplayer.on('gameStart', () => resolve());
      });
    }

    for (let i = 3; i >= 1; i--) {
      await animateCount(String(i), 850);
    }
    await animateCount('GO!', 500);

    countdownOverlay.style.display = 'none';
    AudioManager.resume();
    AudioManager.playBGM(0);
    gameRunning = true;
    initNotes();
    lastTimestamp = null;
    animId = requestAnimationFrame(gameLoop);
  }

  startCountdown();
})();
