// Web Audio API による効果音・BGM管理
const AudioManager = (() => {
  let ctx = null;
  let bgmSource = null;
  let bgmBuffer = null;
  let bgmStartTime = 0;
  let bgmPausePos = 0; // ポーズ時の再生位置
  let masterGain = null;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
    }
    return ctx;
  }

  // ドン音 (低い太鼓)
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

  // カッ音 (高い縁)
  function playKa() {
    const c = getCtx();
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
    noise.start(c.currentTime); noise.stop(c.currentTime + 0.1);

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.connect(gain); gain.connect(masterGain);
    osc.frequency.setValueAtTime(800, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.08);
    gain.gain.setValueAtTime(0.3, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
    osc.start(c.currentTime); osc.stop(c.currentTime + 0.08);
  }

  // BGM ロード
  async function loadBGM(url) {
    const c = getCtx();
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    bgmBuffer = await c.decodeAudioData(arrayBuffer);
    return bgmBuffer.duration;
  }

  // BGM 再生 (offset秒から)
  function playBGM(offset = 0) {
    if (!bgmBuffer) return;
    const c = getCtx();
    if (bgmSource) { try { bgmSource.stop(); } catch (_) {} }
    bgmSource = c.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.connect(masterGain);
    bgmStartTime = c.currentTime - offset;
    bgmSource.start(c.currentTime, offset);
  }

  // BGM 一時停止
  function pauseBGM() {
    if (!ctx) return;
    bgmPausePos = ctx.currentTime - bgmStartTime;
    if (bgmSource) { try { bgmSource.stop(); } catch (_) {} bgmSource = null; }
  }

  // BGM 再開 (pauseBGM後)
  function resumeBGM() {
    playBGM(bgmPausePos);
  }

  function stopBGM() {
    if (bgmSource) { try { bgmSource.stop(); } catch (_) {} bgmSource = null; }
    bgmPausePos = 0;
  }

  function getBGMCurrentTime() {
    if (!ctx) return 0;
    return ctx.currentTime - bgmStartTime;
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  return { playDon, playKa, loadBGM, playBGM, pauseBGM, resumeBGM, stopBGM, getBGMCurrentTime, resume };
})();
