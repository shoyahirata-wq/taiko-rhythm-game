// ランキング画面
(function () {
  // 背景の星
  const bgStars = document.getElementById('bgStars');
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const sz = Math.random() * 3 + 1;
    s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--dur:${(Math.random()*4+2).toFixed(1)}s;--max-op:${(Math.random()*.6+.2).toFixed(2)};animation-delay:${(Math.random()*5).toFixed(1)}s;`;
    bgStars.appendChild(s);
  }

  const SONGS = [
    { id: 'song1', title: 'ポップスター☆フィーバー' },
    { id: 'song2', title: 'ドキドキドラムロール' },
    { id: 'song3', title: 'ナイトパレード' }
  ];

  const songSelect = document.getElementById('rankSongSelect');
  const rankingBody = document.getElementById('rankingBody');
  const diffTabs = document.querySelectorAll('.diff-tab');

  // 曲セレクト生成
  SONGS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = s.title;
    songSelect.appendChild(opt);
  });

  // セッションから引き継ぎ
  const initSong = sessionStorage.getItem('rankingSong');
  if (initSong) songSelect.value = initSong;

  let currentSong = songSelect.value;
  let currentDiff = 'easy';

  async function loadRanking() {
    rankingBody.innerHTML = '<tr><td colspan="5" class="loading-cell">読み込み中...</td></tr>';
    try {
      const res = await fetch(`/api/ranking?song=${currentSong}&difficulty=${currentDiff}`);
      const data = await res.json();
      renderRanking(data.rankings || []);
    } catch {
      rankingBody.innerHTML = '<tr><td colspan="5" class="loading-cell">読み込みに失敗しました</td></tr>';
    }
  }

  function renderRanking(rankings) {
    if (!rankings.length) {
      rankingBody.innerHTML = '<tr><td colspan="5" class="loading-cell">まだ記録がありません</td></tr>';
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    rankingBody.innerHTML = rankings.map((r, i) => `
      <tr class="${i < 3 ? `rank-${i+1}` : ''}">
        <td>${medals[i] || (i + 1)}</td>
        <td>${escHtml(r.playerName)}</td>
        <td>${Number(r.score).toLocaleString()}</td>
        <td>${r.combo}</td>
        <td>${r.accuracy}%</td>
      </tr>
    `).join('');
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  songSelect.addEventListener('change', () => { currentSong = songSelect.value; loadRanking(); });

  diffTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      diffTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentDiff = tab.dataset.diff;
      loadRanking();
    });
  });

  document.getElementById('btnBack').addEventListener('click', () => history.back());

  loadRanking();
})();
