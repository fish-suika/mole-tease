// ===== 効果音（Web Audio で合成。音源ファイルなし。人の声は使わない） =====
// 使えない環境・まだ操作がない状態では何もしない（遊びは止まらない）
const SFX = (function () {
  let ctx = null, master = null, noiseBuf = null, muted = false;
  try { muted = localStorage.getItem('mole-tease-mute') === '1'; } catch (e) { }

  // iPhone は Web Audio だけだとサイレントスイッチで消音される。無音の <audio> を回しておくと「メディア再生」扱いになり、スイッチに関係なく鳴る
  let keep = null;
  function startKeepAlive() {
    try {
      const n = 4000, b = new Uint8Array(44 + n), v = new DataView(b.buffer);   // 8kHz・8bit・モノラルの無音 WAV
      const w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
      b.fill(128, 44);
      keep = document.createElement('audio');
      keep.src = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
      keep.loop = true; keep.setAttribute('playsinline', '');
      const p = keep.play(); if (p && p.catch) p.catch(() => { keep = null; });
    } catch (e) { keep = null; }
  }
  function unlock() {                         // 操作のたびに呼ぶ（iPhone などは操作の中でしか音を出せない）
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state !== 'running') {
        ctx.resume();
        const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);   // 無音を鳴らして有効化する
      }
      if (!keep) startKeepAlive(); else if (keep.paused) { const p = keep.play(); if (p && p.catch) p.catch(() => { }); }
    } catch (e) { ctx = null; }
  }
  function setMuted(m) {
    muted = m; try { localStorage.setItem('mole-tease-mute', m ? '1' : '0'); } catch (e) { }
    if (master) master.gain.value = m ? 0 : 0.8;
  }
  const ok = () => ctx && ctx.state === 'running' && !muted;

  // 雑音：filter の周波数を f0→f1 に動かし、vol で鳴らして dur 秒で消える
  function noise(type, f0, f1, dur, vol, delay, q) {
    if (!ok()) return;
    const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  // 音程：f0→f1
  function tone(type, f0, f1, dur, vol, delay) {
    if (!ok()) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  return {
    unlock, setMuted, isMuted: () => muted,
    pop() { tone('sine', 200, 520, 0.09, 0.22); noise('lowpass', 900, 300, 0.06, 0.15); },                 // 顔を出す：ぽこっ
    hide() { tone('sine', 480, 160, 0.08, 0.12); },                                                         // 引っ込む：すっ
    windup(dur) { noise('bandpass', 300, 1500, dur, 0.18, 0, 1.2); tone('sawtooth', 90, 230, dur, 0.06); },  // 振りかぶり：きしみながら上がる
    feint() { tone('triangle', 330, 250, 0.35, 0.16); tone('triangle', 330, 250, 0.3, 0.1, 0.18); },      // フェイント：ふふん
    slam(big) { tone('sine', 170, 42, big ? 0.3 : 0.2, big ? 0.6 : 0.45); noise('lowpass', 1000, 180, 0.16, big ? 0.5 : 0.35); },   // ドン
    whiff(close) {                                                                                            // 空振り：スカッ（ギリギリほど気持ちいい音）
      noise('highpass', 2800, 900, 0.12, 0.22, 0.02);
      if (close >= 0.35) { tone('sine', 880, 1320, 0.22, 0.2, 0.04); tone('triangle', 1320, 1760, 0.26, 0.16, 0.12); }
      if (close >= 0.7) { tone('sine', 1760, 2350, 0.3, 0.14, 0.2); noise('highpass', 5000, 7000, 0.1, 0.12, 0.05); }
    },
    slowmo() { tone('sine', 240, 60, 0.6, 0.3); },                                                          // スロー：低くうなる
    bump() { tone('square', 700, 1500, 0.08, 0.28); tone('square', 1500, 800, 0.1, 0.22, 0.08); noise('lowpass', 1200, 300, 0.12, 0.3); },   // ピコッ
    stage(n) { [523, 659, 784, 1047, 1319].slice(0, Math.min(5, n + 1)).forEach((f, i) => tone('square', f, f, 0.11, 0.16, i * 0.06)); tone('sine', 110, 55, 0.4, 0.4); },   // 怒りが上がる
    cool() { tone('triangle', 520, 260, 0.3, 0.16); },                                                       // 叩かれて怒りがさめる
    coin() { tone('square', 1568, 1568, 0.06, 0.14); tone('square', 2093, 2093, 0.28, 0.14, 0.07); },     // チャリン
    step() { noise('lowpass', 420, 160, 0.07, 0.22); },                                                      // 足音
    rumble() { tone('sine', 70, 45, 0.9, 0.25); noise('lowpass', 250, 80, 0.8, 0.12); },                    // 地下のごろごろ
    tick() { tone('sine', 1100, 1100, 0.05, 0.12); },                                                        // 残り 10 秒のカチ
    win() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f * 1.01, 0.22, 0.2, i * 0.09)); },                         // 逃げきり：ファンファーレ
    lose() { [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.96, 0.28, 0.2, i * 0.15)); },                         // 叩かれて終わり：下降
    blip() { tone('sine', 660, 990, 0.12, 0.25); },                                                          // 「♪」を押したときの確認音
  };
})();
