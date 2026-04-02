// 曲選択・難易度選択・モード選択ページ
(function () {
  // 背景の星を生成
  const bgStars = document.getElementById('bgStars');
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 3 + 1;
    s.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%; top:${Math.random()*100}%;
      --dur:${(Math.random()*4+2).toFixed(1)}s;
      --max-op:${(Math.random()*0.6+0.2).toFixed(2)};
      animation-delay:${(Math.random()*5).toFixed(1)}s;
    `;
    bgStars.appendChild(s);
  }

  const songs = ChartManager.getSongs();

  // --- DOM要素 ---
  const modeSelect     = document.getElementById('modeSelect');
  const songList       = document.getElementById('songList');
  const diffPanel      = document.getElementById('difficultyPanel');
  const namePanel      = document.getElementById('namePanel');
  const matchingPanel  = document.getElementById('matchingPanel');
  const matchedPanel   = document.getElementById('matchedPanel');
  const selectedSongTitle  = document.getElementById('selectedSongTitle');
  const selectedSongArtist = document.getElementById('selectedSongArtist');
  const onlineCountEl  = document.getElementById('onlineCount');

  let selectedSong = null;
  let gameMode = 'solo'; // 'solo' or 'online'
  let onlinePlayerName = '';

  // =============================================
  // Socket.io接続 & オンライン人数表示
  // =============================================
  Multiplayer.connect();
  Multiplayer.on('onlineCount', (count) => {
    if (onlineCountEl) {
      onlineCountEl.textContent = count > 0 ? `🌐 オンライン: ${count}人` : '';
    }
  });

  // =============================================
  // 全パネルを非表示にするヘルパー
  // =============================================
  function hideAll() {
    modeSelect.style.display = 'none';
    songList.style.display = 'none';
    diffPanel.style.display = 'none';
    namePanel.style.display = 'none';
    matchingPanel.style.display = 'none';
    matchedPanel.style.display = 'none';
  }

  function showPanel(el, displayType) {
    hideAll();
    el.style.display = displayType || 'block';
  }

  // =============================================
  // モード選択
  // =============================================
  document.getElementById('btnSolo').addEventListener('click', () => {
    gameMode = 'solo';
    sessionStorage.setItem('gameMode', 'solo');
    showPanel(songList, 'grid');
  });

  document.getElementById('btnOnline').addEventListener('click', () => {
    gameMode = 'online';
    sessionStorage.setItem('gameMode', 'online');
    // 名前入力画面を表示
    showPanel(namePanel);
  });

  // =============================================
  // オンライン: 名前入力
  // =============================================
  const onlineNameInput = document.getElementById('onlineNameInput');
  // 前回の名前があれば復元
  const savedName = sessionStorage.getItem('onlinePlayerName') || '';
  if (savedName) onlineNameInput.value = savedName;

  document.getElementById('btnNameOk').addEventListener('click', () => {
    const name = onlineNameInput.value.trim();
    if (!name) {
      onlineNameInput.focus();
      onlineNameInput.style.borderColor = '#ff4d4d';
      setTimeout(() => { onlineNameInput.style.borderColor = ''; }, 1500);
      return;
    }
    onlinePlayerName = name;
    sessionStorage.setItem('onlinePlayerName', name);
    showPanel(songList, 'grid');
  });

  document.getElementById('btnNameBack').addEventListener('click', () => {
    showPanel(modeSelect);
  });

  // =============================================
  // 曲カード生成
  // =============================================
  songs.forEach(song => {
    const card = document.createElement('div');
    card.className = 'song-card';
    card.innerHTML = `
      <div class="song-card-icon">${song.icon}</div>
      <div class="song-card-title">${song.title}</div>
      <div class="song-card-artist">${song.artist}</div>
      <span class="song-card-bpm">BPM ${song.bpm}</span>
    `;
    card.addEventListener('click', () => selectSong(song));
    songList.appendChild(card);
  });

  function selectSong(song) {
    selectedSong = song;
    selectedSongTitle.textContent = `${song.icon} ${song.title}`;
    selectedSongArtist.textContent = song.artist;
    showPanel(diffPanel);
  }

  // =============================================
  // 難易度ボタン
  // =============================================
  document.querySelectorAll('.diff-btn[data-diff]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!selectedSong) return;
      const diff = btn.dataset.diff;

      if (gameMode === 'solo') {
        // ソロモード: そのままゲーム画面へ
        sessionStorage.setItem('selectedSong', JSON.stringify(selectedSong));
        sessionStorage.setItem('selectedDifficulty', diff);
        window.location.href = 'game.html';
      } else {
        // オンラインモード: マッチング開始
        sessionStorage.setItem('selectedSong', JSON.stringify(selectedSong));
        sessionStorage.setItem('selectedDifficulty', diff);
        startMatching(selectedSong, diff);
      }
    });
  });

  // =============================================
  // オンライン: マッチング
  // =============================================
  function startMatching(song, difficulty) {
    const diffLabel = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' };
    document.getElementById('matchingSongInfo').textContent =
      `${song.icon} ${song.title} [${diffLabel[difficulty]}]`;
    document.getElementById('matchingStatus').textContent = 'マッチング中...';
    showPanel(matchingPanel);

    Multiplayer.findMatch(song.id, difficulty, onlinePlayerName);
  }

  // マッチングキャンセル
  document.getElementById('btnCancelMatch').addEventListener('click', () => {
    Multiplayer.cancelMatch();
    showPanel(songList, 'grid');
  });

  // マッチ成立
  Multiplayer.on('matchFound', (data) => {
    const diffLabel = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' };
    const song = ChartManager.getSong(data.songId);

    document.getElementById('vsMyName').textContent = onlinePlayerName;
    document.getElementById('vsOpponentName').textContent = Multiplayer.getOpponentName();
    document.getElementById('matchedSongInfo').textContent =
      `${song ? song.icon : ''} ${song ? song.title : data.songId} [${diffLabel[data.difficulty]}]`;

    showPanel(matchedPanel);

    // 2秒後にゲーム画面へ遷移 & ready送信
    let count = 3;
    const countdownEl = document.getElementById('matchedCountdown');
    countdownEl.textContent = `${count}秒後にゲーム開始...`;
    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        countdownEl.textContent = `${count}秒後にゲーム開始...`;
      } else {
        clearInterval(timer);
        countdownEl.textContent = 'ゲーム画面へ移動中...';
        // ゲームに遷移
        sessionStorage.setItem('gameMode', 'online');
        sessionStorage.setItem('roomId', Multiplayer.getRoomId());
        sessionStorage.setItem('opponentName', Multiplayer.getOpponentName());
        sessionStorage.setItem('onlinePlayerName', onlinePlayerName);
        window.location.href = 'game.html';
      }
    }, 1000);
  });

  // 相手切断
  Multiplayer.on('opponentDisconnected', () => {
    if (matchingPanel.style.display !== 'none') {
      document.getElementById('matchingStatus').textContent = '相手が切断しました。再マッチング中...';
    }
  });

  // =============================================
  // 戻るボタン
  // =============================================
  document.getElementById('btnBack').addEventListener('click', () => {
    if (gameMode === 'online') {
      showPanel(songList, 'grid');
    } else {
      showPanel(songList, 'grid');
    }
    selectedSong = null;
  });

  // ランキングボタン
  document.getElementById('btnRanking').addEventListener('click', () => {
    if (selectedSong) {
      sessionStorage.setItem('rankingSong', selectedSong.id);
    }
    window.location.href = 'ranking.html';
  });

  // =============================================
  // 初期表示: モード選択画面
  // =============================================
  showPanel(modeSelect);
})();
