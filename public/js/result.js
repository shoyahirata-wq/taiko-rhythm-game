// リザルト画面
(function () {
  // 背景の星
  const bgStars = document.getElementById('bgStars');
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 3 + 1;
    s.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--dur:${(Math.random()*4+2).toFixed(1)}s;--max-op:${(Math.random()*.6+.2).toFixed(2)};animation-delay:${(Math.random()*5).toFixed(1)}s;`;
    bgStars.appendChild(s);
  }

  const result = JSON.parse(sessionStorage.getItem('result') || 'null');
  if (!result) { window.location.href = 'index.html'; return; }

  const diffLabel = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' };

  document.getElementById('resultSongName').textContent = result.songTitle || result.song;
  document.getElementById('resultDifficulty').textContent = diffLabel[result.difficulty] || result.difficulty;
  document.getElementById('resultScore').textContent = result.score.toLocaleString();
  document.getElementById('resultCombo').textContent = result.maxCombo;
  document.getElementById('resultAccuracy').textContent = result.accuracy + '%';
  document.getElementById('resultPerfect').textContent = result.perfect;
  document.getElementById('resultGood').textContent = result.good;
  document.getElementById('resultMiss').textContent = result.miss;

  // ランク計算
  const acc = result.accuracy;
  const rank = acc >= 95 ? 'S' : acc >= 85 ? 'A' : acc >= 70 ? 'B' : acc >= 50 ? 'C' : 'D';
  document.getElementById('resultRank').textContent = rank;

  // スコア登録
  document.getElementById('btnSubmitScore').addEventListener('click', async () => {
    const name = document.getElementById('playerNameInput').value.trim();
    if (!name) { document.getElementById('submitStatus').textContent = '名前を入力してください'; return; }

    const btn = document.getElementById('btnSubmitScore');
    btn.disabled = true;
    document.getElementById('submitStatus').textContent = '登録中...';

    try {
      const res = await fetch('/api/ranking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          song: result.song,
          difficulty: result.difficulty,
          playerName: name,
          score: result.score,
          combo: result.maxCombo,
          accuracy: result.accuracy
        })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('submitStatus').textContent = '✅ 登録しました！';
        document.getElementById('nameEntry').style.opacity = '0.5';
      } else {
        document.getElementById('submitStatus').textContent = '❌ 登録に失敗しました';
        btn.disabled = false;
      }
    } catch {
      document.getElementById('submitStatus').textContent = '❌ 通信エラー';
      btn.disabled = false;
    }
  });

  document.getElementById('btnRetry').addEventListener('click', () => {
    window.location.href = 'game.html';
  });

  document.getElementById('btnRanking').addEventListener('click', () => {
    sessionStorage.setItem('rankingSong', result.song);
    window.location.href = 'ranking.html';
  });

  document.getElementById('btnBack').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
})();
