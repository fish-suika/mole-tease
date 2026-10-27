// ===== 判定・点数・人間の動き（three.js を使わない純粋ロジック） =====
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// 穴 i（0〜8）の台上の位置。行 0＝奥、行 2＝手前
function holePos(i, CFG) {
  const H = CFG.holes;
  return { x: (i % 3 - 1) * H.dx, z: H.z0 + Math.floor(i / 3) * H.dz };
}
const rowOf = i => Math.floor(i / 3), colOf = i => i % 3;

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

// ---- 人間（3人の癖・怒りの段階つき） ----
function pickPerson(rng, CFG) { return CFG.persons[Math.min(CFG.persons.length - 1, Math.floor(rng() * CFG.persons.length))]; }
function stageOf(rage, CFG) { let s = 0; for (let i = 0; i < CFG.stages.length; i++) if (rage >= CFG.stages[i].th) s = i; return s; }
// 振りかぶりの長さ：人の癖 × 怒りの段階。短くしすぎない（見てから避けられる下限 minWindup）
function windupDur(P, S, CFG) { return Math.max(CFG.human.minWindup, CFG.human.windup * P.windupMul * S.windupMul); }

function newHuman(CFG, person) {
  // seq＝フェーズが変わるたびに増える（見た目の切り替え用）。target2＝2本目のハンマーの穴（怒り最大のとき）
  return { person, phase: 'idle', t: 0, seq: 0, wait: CFG.human.firstWait, target: -1, target2: -1, dur: 0, stage: 0, feint: false, strayed: false, lastStray: false, recover: 0, mood: 'calm' };
}

// 振りかぶりを始める。ambush＝待ち伏せからの素早い振りかぶり
function startWindup(hu, hole, ambush, ctx, CFG) {
  const P = hu.person, S = CFG.stages[ctx.stage];
  hu.phase = 'windup'; hu.t = 0; hu.seq++; hu.mood = 'aim'; hu.stage = ctx.stage;
  hu.target = hole; hu.strayed = false; hu.feint = false; hu.target2 = -1;
  if (!ambush) {
    // 雑：ときどき隣（左右）の穴を狙ってしまう。続けては起こさない（バグに見えるので）
    if (P.stray > 0 && !hu.lastStray && ctx.rng() < P.stray) {
      const c = colOf(hole), opts = []; if (c > 0) opts.push(hole - 1); if (c < 2) opts.push(hole + 1);
      hu.target = opts[Math.min(opts.length - 1, Math.floor(ctx.rng() * opts.length))]; hu.strayed = true;
    }
    hu.feint = ctx.rng() < clamp(P.feint + S.feint, 0, 0.6);
  }
  hu.lastStray = hu.strayed;
  hu.dur = ambush ? CFG.human.ambushWindup : windupDur(P, S, CFG);
  if (S.hammers >= 2 && !hu.feint) {                       // 2本目：ちがう行のどこか（行を変えるだけでは逃げきれない）
    const r2 = (rowOf(hu.target) + 1 + Math.min(1, Math.floor(ctx.rng() * 2))) % 3;
    hu.target2 = r2 * 3 + Math.min(2, Math.floor(ctx.rng() * 3));
  }
  return { type: 'windup', hole: hu.target, hole2: hu.target2, dur: hu.dur, feint: hu.feint, stray: hu.strayed, ambush: !!ambush };
}

function goPhase(hu, phase, mood) { hu.phase = phase; hu.t = 0; hu.seq++; if (mood) hu.mood = mood; }

// 人間の 1 コマ。出来事（windup / strike / feint / impact）を配列で返す。ctx＝{ stage, rng }
function humanStep(hu, dt, m, now, CFG, ctx) {
  const Hc = CFG.human, P = hu.person, ev = [];
  hu.t += dt;
  if (hu.phase === 'idle') {
    hu.wait -= dt;
    if (hu.wait <= 0 && m.stun <= 0 && m.upSince >= 0 && now - m.upSince >= P.reaction) ev.push(startWindup(hu, m.hole, false, ctx, CFG));
  } else if (hu.phase === 'ambush') {
    // 待ち伏せ：空振りした穴の上でハンマーを構えたまま待つ。同じ穴から出直すと素早く叩く
    if (m.stun <= 0 && m.hole === hu.target && m.upSince >= 0 && now - m.upSince >= Hc.ambushReaction) ev.push(startWindup(hu, hu.target, true, ctx, CFG));
    else if (hu.t >= P.ambush) { goPhase(hu, 'recover', 'calm'); hu.recover = Hc.recoverAmbush; }
  } else if (hu.phase === 'windup') {
    if (hu.feint && hu.t >= hu.dur * Hc.feintAt) {         // フェイント：ハンマーを上げきらずに止めて、引く
      ev.push({ type: 'feint', hole: hu.target });
      goPhase(hu, 'recover', 'feint'); hu.recover = Hc.recoverFeint;
    } else if (hu.t >= hu.dur) { goPhase(hu, 'strike'); ev.push({ type: 'strike', hole: hu.target, hole2: hu.target2 }); }
  } else if (hu.phase === 'strike') {
    if (hu.t >= Hc.strike) {
      const S = CFG.stages[hu.stage];
      const cover = t => t >= 0 && rowOf(m.hole) === rowOf(t) && Math.abs(colOf(m.hole) - colOf(t)) <= S.reach;   // 巨大ハンマーは左右の隣の穴まで届く
      const hit = isHittable(m, CFG) && (cover(hu.target) || cover(hu.target2));
      const stray = !hit && hu.strayed && m.hole !== hu.target;
      let gap = null, close = 0;
      if (!hit && !stray) {
        gap = Math.max(0, now - m.exitTs[hu.target]);
        close = clamp(1 - gap / CFG.score.nearWindow, 0, 1);
      }
      ev.push({ type: 'impact', hole: hu.target, hole2: hu.target2, hit, stray, gap, close });
      if (hit) { goPhase(hu, 'recover', 'happy'); hu.recover = Hc.recoverHit; }
      else if (!stray && P.ambush > 0) goPhase(hu, 'ambush', 'aim');
      else if (stray) { goPhase(hu, 'recover', 'confuse'); hu.recover = Hc.recoverStray; }
      else { goPhase(hu, 'recover', 'miss'); hu.recover = Hc.recoverMiss * (P.missMul || 1); }   // せっかちな子どもは空振りしてもすぐ次を叩く
    }
  } else if (hu.phase === 'recover') {
    if (hu.t >= hu.recover) { goPhase(hu, 'idle', 'calm'); hu.wait = Hc.idleWait; hu.target2 = -1; }
  }
  return ev;
}

// 振りかぶり開始からの「離す時刻」の帯（タイミングバー用。いまは非表示）。from＝これ以降に離すとギリギリ度が zoneNear 以上、to＝これを過ぎると叩かれる直前。total＝振りかぶり＋振り下ろし
function releaseZone(CFG, dur) {
  const total = (dur || CFG.human.windup) + CFG.human.strike, fallT = (1 - CFG.mole.hitH) / CFG.mole.fall;
  return { total, from: total - fallT - (1 - CFG.assist.zoneNear) * CFG.score.nearWindow, to: total - fallT - 0.02 };
}

// ---- 点数 ----
function whiffPoints(close, mult, CFG) { return Math.round((CFG.score.whiffBase + CFG.score.whiffNear * close * close) * mult); }
function whiffLabel(close) { return close >= 0.7 ? '紙一重！' : close >= 0.35 ? 'ギリギリ！' : 'スカッ'; }

// ---- ゲーム全体 ----
// opts：person＝人の id かその設定（なければ rng で 3人から選ぶ）、rng＝乱数（検証用に差し替え可）、noRage＝怒りを動かさない（検証用）
function newGame(CFG, opts) {
  opts = opts || {};
  const rng = opts.rng || Math.random;
  const person = typeof opts.person === 'object' ? opts.person : opts.person ? CFG.persons.find(p => p.id === opts.person) : pickPerson(rng, CFG);
  return { t: 0, rng, person, noRage: !!opts.noRage, mole: newMole(), human: newHuman(CFG, person), score: 0, bumps: 0, whiffs: 0, bestClose: 0, mult: 1, rage: 0, stage: 0, maxStage: 0, over: false, reason: '' };
}

// dt 秒進める。出来事（windup / strike / feint / whiff / stray / bump / stage / end）を配列で返す
function stepGame(g, dt, press, CFG) {
  const ev = [];
  if (g.over) return ev;
  g.t += dt;
  const m = g.mole, R = CFG.rage, P = g.person;
  moleStep(m, dt, press, g.t, CFG);
  if (m.stun <= 0 && m.h >= CFG.score.scoreH) g.score += CFG.score.pps * g.mult * dt;
  for (const e of humanStep(g.human, dt, m, g.t, CFG, { stage: g.stage, rng: g.rng })) {
    ev.push(e);
    if (e.type !== 'impact') continue;
    if (e.hit) {
      g.bumps++; m.stun = CFG.mole.stunTime; m.hitT = 0;
      if (!g.noRage) g.rage *= P.hitKeep;                                    // 叩くとすっきりする（時間ではさめない。叩いたときだけ下がる）
      ev.push({ type: 'bump', bumps: g.bumps, hole: e.hole });
    } else if (e.stray) {
      ev.push({ type: 'stray', hole: e.hole });                              // 隣を叩いてしまった（避けたわけではないので点も怒りもなし）
    } else {
      const pts = whiffPoints(e.close, g.mult, CFG);
      g.score += pts; g.whiffs++; g.bestClose = Math.max(g.bestClose, e.close);
      if (!g.noRage) g.rage = Math.min(R.max, g.rage + (R.whiffBase + R.whiffNear * e.close) * P.rageUp);
      ev.push({ type: 'whiff', close: e.close, gap: e.gap, pts, hole: e.hole, label: whiffLabel(e.close) });
    }
  }
  const st = stageOf(g.rage, CFG);
  if (st !== g.stage) { ev.push({ type: 'stage', stage: st, from: g.stage }); g.stage = st; g.mult = st + 1; g.maxStage = Math.max(g.maxStage, st); }
  if (g.bumps >= CFG.maxBumps) { g.over = true; g.reason = 'bumped'; ev.push({ type: 'end', reason: g.reason }); }
  else if (g.t >= CFG.duration) { g.over = true; g.reason = 'escaped'; ev.push({ type: 'end', reason: g.reason }); }
  return ev;
}
