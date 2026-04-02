// ===== ゲームエンジン (Canvas + Web Audio API) =====
(async function () {
  // セッションから曲・難易度取得
  const song = JSON.parse(sessionStorage.getItem('selectedSong') || 'null');
  const difficulty = sessionStorage.getItem('selectedDifficulty') || 'normal';
  if (!song) { window.location.href = 'index.html'; return; }

  // --- DOM ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreDisplay = document.getElementById('scoreDisplay');
  const comboDisplay = document.getElementById('comboDisplay');
  const progressBar = document.getElementById('progressBar');
  const songNameHud = document.getElementById('songNameHud');
  const judgmentPopup = document.getElementById('judgmentPopup');
  const comboPopup = document.getElementById('comboPopup');
  const countdownOverlay = document.getElementById('countdownOverlay');
  const countdownNumber = document.getElementById('countdownNumber');

  songNameHud.textContent = `${song.icon} ${song.title} [${diffLabel(difficulty)}]`;

  function diffLabel(d) {
    return { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' }[d] || d;
  }

  // --- 定数 ---
  const JUDGE_LINE_X = 160;   // 判定ラインX座標
  const NOTE_SPEED_BASE = { easy: 280, normal: 380, hard: 500 }; // px/sec
  const NOTE_SPEED = NOTE_SPEED_BASE[difficulty];
  const HIT_WINDOW = { perfect: 0.065, good: 0.13 }; // 秒
  const NOTE_R = 28; // ノーツ半径

  // --- 状態 ---
  let notes = [];          // { time, type, x, hit }
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let countPerfect = 0, countGood = 0, countMiss = 0;
  let totalNotes = 0;
  let gameRunning = false;
  let gameStartTime = 0;
  let chartDuration = 0;

  // --- Canvas リサイズ ---
  function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
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

  totalNotes = chart.notes.length;
  chartDuration = chart.notes[chart.notes.length - 1]?.time + 2 || 10;

  // --- ノーツ初期化 ---
  function initNotes() {
    notes = chart.notes.map(n => ({
      time: n.time,
      type: n.type, // 'don' | 'ka'
      hit: null     // null | 'perfect' | 'good' | 'miss'
    }));
  }

  // --- ゲーム時間取得 ---
  function getGameTime() {
    return AudioManager.getBGMCurrentTime() - (chart.offset || 0);
  }

  // --- ノーツのX座標計算 ---
  function noteX(noteTime) {
    const diff = noteTime - getGameTime();
    return JUDGE_LINE_X + diff * NOTE_SPEED;
  }

  // --- 描画 ---
  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const laneY = H * 0.5;

    // レーン背景ライン
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, laneY);
    ctx.lineTo(W, laneY);
    ctx.stroke();

    // 判定ライン
    const glowGrad = ctx.createRadialGradient(JUDGE_LINE_X, laneY, 0, JUDGE_LINE_X, laneY, 50);
    glowGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
    glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(JUDGE_LINE_X, laneY, 50, 0, Math.PI * 2);
    ctx.fill();

    // 判定ライン円
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(JUDGE_LINE_X, laneY, NOTE_R + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ノーツ描画
    const now = getGameTime();
    notes.forEach(note => {
      if (note.hit === 'miss' || note.hit === 'perfect' || note.hit === 'good') return;
      const x = noteX(note.time);
      if (x < -NOTE_R * 2 || x > W + NOTE_R) return;

      const isDon = note.type === 'don';
      const color1 = isDon ? '#ff6b6b' : '#4d9fff';
      const color2 = isDon ? '#ff0000' : '#0066ff';

      ctx.save();
      const grad = ctx.createRadialGradient(x - NOTE_R * 0.3, laneY - NOTE_R * 0.3, 2, x, laneY, NOTE_R);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.3, color1);
      grad.addColorStop(1, color2);

      ctx.shadowColor = color1;
      ctx.shadowBlur = 18;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, laneY, NOTE_R, 0, Math.PI * 2);
      ctx.fill();

      // ドン/カッ 文字
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${NOTE_R * 0.7}px 'Noto Sans JP'`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isDon ? 'ド' : 'カ', x, laneY);
      ctx.restore();
    });

    ctx.restore();
  }

  // --- 判定処理 ---
  function judge(type) {
    const now = getGameTime();
    let best = null;
    let bestDist = Infinity;

    for (const note of notes) {
      if (note.hit !== null) continue;
      if (note.type !== type) continue;
      const dist = Math.abs(note.time - now);
      if (dist < bestDist) { bestDist = dist; best = note; }
    }

    if (!best || bestDist > HIT_WINDOW.good) {
      // 空打ち (Miss 扱いにはしない)
      return;
    }

    if (bestDist <= HIT_WINDOW.perfect) {
      best.hit = 'perfect';
      score += 300 + combo * 2;
      combo++;
      countPerfect++;
      showJudgment('PERFECT!', 'perfect');
    } else {
      best.hit = 'good';
      score += 100;
      combo++;
      countGood++;
      showJudgment('GOOD', 'good');
    }

    if (combo > maxCombo) maxCombo = combo;
    showCombo();
    updateHUD();

    if (best.type === 'don') AudioManager.playDon();
    else AudioManager.playKa();
  }

  // --- Miss 自動判定 ---
  function checkMiss() {
    const now = getGameTime();
    notes.forEach(note => {
      if (note.hit !== null) return;
      if (note.time < now - HIT_WINDOW.good) {
        note.hit = 'miss';
        combo = 0;
        countMiss++;
        showJudgment('MISS', 'miss');
        updateHUD();
      }
    });
  }

  // --- HUD更新 ---
  function updateHUD() {
    scoreDisplay.textContent = score.toLocaleString();
    comboDisplay.textContent = combo;
  }

  let judgmentTimer = null;
  function showJudgment(text, cls) {
    judgmentPopup.textContent = text;
    judgmentPopup.className = `judgment-popup ${cls}`;
    void judgmentPopup.offsetWidth;
    judgmentPopup.classList.add('show');
    clearTimeout(judgmentTimer);
    judgmentTimer = setTimeout(() => judgmentPopup.classList.remove('show'), 450);
  }

  let comboTimer = null;
  function showCombo() {
    if (combo < 2) return;
    comboPopup.textContent = `${combo} COMBO!`;
    comboPopup.className = 'combo-popup';
    void comboPopup.offsetWidth;
    comboPopup.classList.add('show');
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => comboPopup.classList.remove('show'), 300);
  }

  // --- キー入力 ---
  const DON_KEYS = new Set(['Space', 'KeyF', 'KeyG']);
  const KA_KEYS  = new Set(['Enter', 'KeyD', 'KeyJ', 'KeyK']);

  window.addEventListener('keydown', e => {
    if (!gameRunning) return;
    e.preventDefault();
    AudioManager.resume();
    if (DON_KEYS.has(e.code)) judge('don');
    else if (KA_KEYS.has(e.code)) judge('ka');
  });

  // --- ゲームループ ---
  let animId;
  function gameLoop() {
    checkMiss();
    draw();

    const elapsed = getGameTime();
    const pct = Math.min(elapsed / chartDuration * 100, 100);
    progressBar.style.width = pct + '%';

    // 全ノーツ終了チェック
    const allDone = notes.every(n => n.hit !== null);
    if (allDone && elapsed > chartDuration - 1) {
      endGame();
      return;
    }

    animId = requestAnimationFrame(gameLoop);
  }

  // --- ゲーム終了 ---
  function endGame() {
    gameRunning = false;
    AudioManager.stopBGM();
    cancelAnimationFrame(animId);

    const accuracy = totalNotes > 0
      ? Math.round((countPerfect + countGood * 0.5) / totalNotes * 1000) / 10
      : 0;

    sessionStorage.setItem('result', JSON.stringify({
      song: song.id,
      songTitle: song.title,
      difficulty,
      score,
      maxCombo,
      accuracy,
      perfect: countPerfect,
      good: countGood,
      miss: countMiss
    }));

    window.location.href = 'result.html';
  }

  // --- カウントダウン ---
  async function startCountdown() {
    await AudioManager.loadBGM(song.src).catch(() => null);

    for (let i = 3; i >= 1; i--) {
      countdownNumber.textContent = i;
      countdownNumber.style.animation = 'none';
      void countdownNumber.offsetWidth;
      countdownNumber.style.animation = 'countPulse .9s ease-in-out';
      await new Promise(r => setTimeout(r, 900));
    }

    countdownNumber.textContent = 'GO!';
    countdownNumber.style.animation = 'none';
    void countdownNumber.offsetWidth;
    countdownNumber.style.animation = 'countPulse .5s ease-in-out';
    await new Promise(r => setTimeout(r, 500));
    countdownOverlay.style.display = 'none';

    AudioManager.resume();
    AudioManager.playBGM(0);
    gameStartTime = performance.now();
    gameRunning = true;
    initNotes();
    gameLoop();
  }

  startCountdown();
})();
