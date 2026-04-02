// 譜面データ管理・ロード
const ChartManager = (() => {
  const SONGS = [
    {
      id: 'song1',
      title: 'ポップスター☆フィーバー',
      artist: 'Kyaai (DOVA-SYNDROME)',
      bpm: 129,
      icon: '⭐',
      src: 'assets/music/song1.mp3'
    },
    {
      id: 'song2',
      title: 'ドキドキドラムロール',
      artist: 'まんぼう二等兵 (DOVA-SYNDROME)',
      bpm: 89,
      icon: '💖',
      src: 'assets/music/song2.mp3'
    },
    {
      id: 'song3',
      title: 'ナイトパレード',
      artist: 'MFP (DOVA-SYNDROME)',
      bpm: 123,
      icon: '🌙',
      src: 'assets/music/song3.mp3'
    }
  ];

  function getSongs() { return SONGS; }
  function getSong(id) { return SONGS.find(s => s.id === id); }

  async function loadChart(songId, difficulty) {
    const res = await fetch(`/charts/${songId}_${difficulty}.json`);
    if (!res.ok) throw new Error(`Chart not found: ${songId}_${difficulty}`);
    return res.json();
  }

  return { getSongs, getSong, loadChart };
})();
