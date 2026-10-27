// ===== 判定・点数・人間の動き（three.js を使わない純粋ロジック） =====
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// 穴 i（0〜8）の台上の位置。行 0＝奥、行 2＝手前
function holePos(i, CFG) {
  const H = CFG.holes;
  return { x: (i % 3 - 1) * H.dx, z: H.z0 + Math.floor(i / 3) * H.dz };
}

// 画面の座標（px）から押している穴を決める。cur＝今押している穴、hyst＝今の穴を離れにくくする倍率
function pickHole(px, py, pts, cur, hyst) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - px, pts[i].y - py);
    if (d < bd) { bd = d; best = i; }
  }
  if (cur >= 0 && cur < pts.length && cur !== best) {
    const dc = Math.hypot(pts[cur].x - px, pts[cur].y - py);
    if (dc <= bd * (hyst || 1.25)) return cur;
  }
  return best;
}

// ---- モグラ ----
function newMole() {
  return { hole: 4, h: 0, dest: -1, travel: 0, stun: 0, hitT: 99, upSince: -1, exitTs: new Array(9).fill(-99) };
}

// press＝押している穴（なければ -1）、now＝ゲーム内の経過秒
function moleStep(m, dt, press, now, CFG) {
  const M = CFG.mole;
  const hPrev = m.h;
  m.hitT += dt;
  if (m.stun > 0) {
    m.stun = Math.max(0, m.stun - dt);
    m.travel = 0; m.dest = -1;
    if (m.stun > M.stunTime - M.flatTime) m.h = M.flatH;
    else m.h = Math.max(0, m.h - M.fall * dt);
  } else if (press >= 0 && press !== m.hole) {
    // 別の穴へ：いまの穴で引っ込み、地下を移ってから出る
    if (m.h > 0) m.h = Math.max(0, m.h - M.fall * dt);
    else {
      if (m.dest !== press) { m.dest = press; m.travel = M.moveTime; }
      m.travel -= dt;
      if (m.travel <= 0) { m.hole = m.dest; m.dest = -1; m.travel = 0; }
    }
  } else if (press === m.hole) {
    m.dest = -1; m.travel = 0;
    m.h = Math.min(1, m.h + M.rise * dt);
  } else {
    m.dest = -1; m.travel = 0;
    m.h = Math.max(0, m.h - M.fall * dt);
  }
  if (hPrev > M.hitH && m.h <= M.hitH) m.exitTs[m.hole] = now;     // 叩かれる高さを離れた時刻（ギリギリ度に使う）
  if (m.h >= M.exposeH && m.stun <= 0) { if (m.upSince < 0) m.upSince = now; } else m.upSince = -1;
}

function isHittable(m, CFG) { return m.stun <= 0 && m.travel === 0 && m.h > CFG.mole.hitH; }

// ---- 人間 ----
function newHuman(CFG) {
  return { phase: 'idle', t: 0, seq: 0, wait: CFG.human.firstWait, target: -1, recover: 0, mood: 'calm' };   // seq＝フェーズが変わるたびに増える（見た目の切り替え用）
}

// 人間の 1 コマ。出来事（windup / strike / impact）を配列で返す
function humanStep(hu, dt, m, now, CFG) {
  const Hc = CFG.human, ev = [];
  hu.t += dt;
  if (hu.phase === 'idle') {
    hu.wait -= dt;
    if (hu.wait <= 0 && m.stun <= 0 && m.upSince >= 0 && now - m.upSince >= Hc.reaction) {
      hu.phase = 'windup'; hu.t = 0; hu.seq++; hu.target = m.hole; hu.mood = 'aim';
      ev.push({ type: 'windup', hole: hu.target });
    }
  } else if (hu.phase === 'windup') {
    if (hu.t >= Hc.windup) { hu.phase = 'strike'; hu.t = 0; hu.seq++; ev.push({ type: 'strike', hole: hu.target }); }
  } else if (hu.phase === 'strike') {
    if (hu.t >= Hc.strike) {
      const hit = m.hole === hu.target && isHittable(m, CFG);
      let gap = null, close = 0;
      if (!hit) {
        gap = Math.max(0, now - m.exitTs[hu.target]);
        close = clamp(1 - gap / CFG.score.nearWindow, 0, 1);
      }
      ev.push({ type: 'impact', hole: hu.target, hit, gap, close });
      hu.phase = 'recover'; hu.t = 0; hu.seq++; hu.recover = hit ? Hc.recoverHit : Hc.recoverMiss; hu.mood = hit ? 'happy' : 'miss';
    }
  } else if (hu.phase === 'recover') {
    if (hu.t >= hu.recover) { hu.phase = 'idle'; hu.t = 0; hu.seq++; hu.wait = Hc.idleWait; hu.mood = 'calm'; }
  }
  return ev;
}

// 振りかぶり開始からの「離す時刻」の帯（タイミングバー用）。from＝これ以降に離すとギリギリ度が zoneNear 以上、to＝これを過ぎると叩かれる直前。total＝振りかぶり＋振り下ろし
function releaseZone(CFG) {
  const total = CFG.human.windup + CFG.human.strike, fallT = (1 - CFG.mole.hitH) / CFG.mole.fall;
  return { total, from: total - fallT - (1 - CFG.assist.zoneNear) * CFG.score.nearWindow, to: total - fallT - 0.02 };
}

// ---- 点数 ----
function whiffPoints(close, mult, CFG) { return Math.round((CFG.score.whiffBase + CFG.score.whiffNear * close * close) * mult); }
function whiffLabel(close) { return close >= 0.7 ? '紙一重！' : close >= 0.35 ? 'ギリギリ！' : 'スカッ'; }

// ---- ゲーム全体 ----
function newGame(CFG) {
  return { t: 0, mole: newMole(), human: newHuman(CFG), score: 0, bumps: 0, whiffs: 0, bestClose: 0, mult: 1, over: false, reason: '' };
}

// dt 秒進める。出来事（windup / strike / whiff / bump / end）を配列で返す
function stepGame(g, dt, press, CFG) {
  const ev = [];
  if (g.over) return ev;
  g.t += dt;
  const m = g.mole;
  moleStep(m, dt, press, g.t, CFG);
  if (m.stun <= 0 && m.h >= CFG.score.scoreH) g.score += CFG.score.pps * g.mult * dt;
  for (const e of humanStep(g.human, dt, m, g.t, CFG)) {
    ev.push(e);
    if (e.type !== 'impact') continue;
    if (e.hit) {
      g.bumps++; m.stun = CFG.mole.stunTime; m.hitT = 0;
      ev.push({ type: 'bump', bumps: g.bumps, hole: e.hole });
    } else {
      const pts = whiffPoints(e.close, g.mult, CFG);
      g.score += pts; g.whiffs++; g.bestClose = Math.max(g.bestClose, e.close);
      ev.push({ type: 'whiff', close: e.close, gap: e.gap, pts, hole: e.hole, label: whiffLabel(e.close) });
    }
  }
  if (g.bumps >= CFG.maxBumps) { g.over = true; g.reason = 'bumped'; ev.push({ type: 'end', reason: g.reason }); }
  else if (g.t >= CFG.duration) { g.over = true; g.reason = 'escaped'; ev.push({ type: 'end', reason: g.reason }); }
  return ev;
}
