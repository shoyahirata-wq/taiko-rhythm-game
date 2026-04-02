// 曲選択・難易度選択ページ
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
  const songList = document.getElementById('songList');
  const diffPanel = document.getElementById('difficultyPanel');
  const selectedSongTitle = document.getElementById('selectedSongTitle');
  const selectedSongArtist = document.getElementById('selectedSongArtist');

  let selectedSong = null;

  // 曲カード生成
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
    songList.style.display = 'none';
    diffPanel.style.display = 'block';
  }

  // 難易度ボタン
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!selectedSong) return;
      const diff = btn.dataset.diff;
      sessionStorage.setItem('selectedSong', JSON.stringify(selectedSong));
      sessionStorage.setItem('selectedDifficulty', diff);
      window.location.href = 'game.html';
    });
  });

  // 戻るボタン
  document.getElementById('btnBack').addEventListener('click', () => {
    diffPanel.style.display = 'none';
    songList.style.display = 'grid';
    selectedSong = null;
  });

  // ランキングボタン
  document.getElementById('btnRanking').addEventListener('click', () => {
    if (selectedSong) {
      sessionStorage.setItem('rankingSong', selectedSong.id);
    }
    window.location.href = 'ranking.html';
  });
})();
