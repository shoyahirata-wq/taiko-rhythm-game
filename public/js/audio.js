// Web Audio API による効果音・BGM管理
const AudioManager = (() => {
  let ctx = null;
  let bgmSource = null;
  let bgmBuffer = null;
  let bgmStartTime = 0;
  let bgmOffset = 0;
  let masterGain = null;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
    }
    return ctx;
  }

  // ドン音 (低い太鼓): 減衰するサイン波
  function playDon() {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain); gain.connect(masterGain);
    osc.frequency.setValueAtTime(120, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.15);
    gain.gain.setValueAtTime(1.0, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.25);

    // 倍音でパンチを追加
    const osc2 = c.createOscillator();
    const gain2 = c.createGain();
    osc2.type = 'triangle';
    osc2.connect(gain2); gain2.connect(masterGain);
    osc2.frequency.setValueAtTime(240, c.currentTime);
    gain2.gain.setValueAtTime(0.4, c.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
    osc2.start(c.currentTime);
    osc2.stop(c.currentTime + 0.1);
  }

  // カッ音 (高い縁): 短いノイズ+高周波
  function playKa() {
    const c = getCtx();
    // ノイズバースト
    const bufLen = c.sampleRate * 0.1;
    const noiseBuffer = c.createBuffer(1, bufLen, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = c.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 3000;
    const noiseGain = c.createGain();
    noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(masterGain);
    noiseGain.gain.setValueAtTime(0.6, c.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
    noise.start(c.currentTime);
    noise.stop(c.currentTime + 0.1);

    // 高音オシレータ
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.connect(gain); gain.connect(masterGain);
    osc.frequency.setValueAtTime(800, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.08);
    gain.gain.setValueAtTime(0.3, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.08);
  }

  // BGM ロード
  async function loadBGM(url) {
    const c = getCtx();
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    bgmBuffer = await c.decodeAudioData(arrayBuffer);
    return bgmBuffer.duration;
  }

  // BGM 再生
  function playBGM(offset = 0) {
    if (!bgmBuffer) return;
    const c = getCtx();
    if (bgmSource) { try { bgmSource.stop(); } catch (_) {} }
    bgmSource = c.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.connect(masterGain);
    bgmStartTime = c.currentTime - offset;
    bgmOffset = offset;
    bgmSource.start(c.currentTime, offset);
  }

  function stopBGM() {
    if (bgmSource) { try { bgmSource.stop(); } catch (_) {} bgmSource = null; }
  }

  function getBGMCurrentTime() {
    if (!ctx) return 0;
    return ctx.currentTime - bgmStartTime;
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  return { playDon, playKa, loadBGM, playBGM, stopBGM, getBGMCurrentTime, resume };
})();
