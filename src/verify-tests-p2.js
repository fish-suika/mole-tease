// ===== Phase 2：怒りの段階・3人の癖 =====
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const PERS = id => CFG.persons.find(p => p.id === id);
const STRAYP = Object.assign({}, PERS('kid'), { stray: 0.12 });   // 隣打ちの仕組みの検証用（ゲームでは使っていない）
const FALL = (1 - CFG.mole.hitH) / CFG.mole.fall;
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const info = (name, v) => check(name + '：' + v, true);

// 1/60 秒刻みのシミュレーションでは、予告（振りかぶり＋振り下ろし）が刻みの整数倍に切り上がる
const actualTotal = dur => { let t = 0, n = 0; while (t < dur) { t += DT; n++; } t = 0; while (t < CFG.human.strike) { t += DT; n++; } return n * DT; };   // 人間のタイマーと同じ足し方で数える（浮動小数の端数まで合わせる）
// 振りかぶりを見て避ける人。margin＝叩かれる何秒前に引っ込むか、hop＝避けるたびに穴を変える。フェイントは見分けて動じない
function skilled(margin, hop, jit, seed) {
  let rel = null, hi = 0; const holes = [4, 5, 3, 4], jr = seeded((seed || 1) * 99991 + 7);   // jit＝離す時刻のばらつき（人間らしさ。±秒）
  return (g, last) => {
    for (const e of last) {
      if (e.type === 'windup') rel = (e.feint || (e.stray && g.stage < 3)) ? null : g.t + actualTotal(e.dur) - FALL - margin + (jit ? (jr() * 2 - 1) * jit : 0);
      else if (e.type === 'feint') rel = null;
      else if (e.type === 'impact') { rel = null; if (hop && !e.hit) hi = (hi + 1) % 3; }
    }
    if (rel !== null && g.t >= rel) return -1;
    return holes[hi];
  };
}
function runG(opts, bot, seconds) {
  const g = newGame(CFG, opts), evs = []; let last = [];
  for (let i = 0; i < Math.round(seconds / DT) && !g.over; i++) { last = stepGame(g, DT, bot(g, last), CFG); for (const e of last) evs.push(e); }
  return { g, evs };
}
const holdOn = n => () => n;

// ---- 段階と倍率 ----
(() => {
  const st = r => stageOf(r, CFG);
  check('怒りの値から段階が決まる（0→平静、18→むっ、42→ムキ、68→激怒、88→錯乱）', st(0) === 0 && st(17.9) === 0 && st(18) === 1 && st(42) === 2 && st(68) === 3 && st(88) === 4 && st(100) === 4);
  const g = newGame(CFG, { person: PLAIN }); g.human.wait = 99; g.rage = 50; const ev = stepGame(g, DT, -1, CFG);
  check('段階が上がると倍率＝段階+1 になり、stage の出来事が出る', g.stage === 2 && g.mult === 3 && ev.some(e => e.type === 'stage' && e.stage === 2));
  const g2 = newGame(CFG, { person: PLAIN }); g2.human.wait = 99; g2.rage = 50; stepGame(g2, DT, -1, CFG);
  const s0 = g2.score; for (let i = 0; i < 60; i++) stepGame(g2, DT, 4, CFG);
  check('倍率 ×3 のとき、顔を出している間の点が 3 倍', g2.score - s0 > CFG.score.pps * 3 * 0.8 - 1, String(g2.score - s0));
  check('怒りは 0〜max に収まる', (() => { const r = runG({ person: PLAIN, rng: seeded(1) }, skilled(0.1, false), 60); return r.g.rage >= 0 && r.g.rage <= CFG.rage.max; })());
})();

// ---- 怒りの増減 ----
(() => {
  const total = CFG.human.windup + CFG.human.strike;
  function rageAfterFirstWhiff(releaseAfter) {
    const g = newGame(CFG, { person: PLAIN, rng: seeded(3) }); let tw = null, last = [];
    for (let i = 0; i < 60 * 8 && !g.over; i++) {
      for (const e of last) if (e.type === 'windup') tw = g.t;
      last = stepGame(g, DT, tw !== null && g.t - tw >= releaseAfter ? -1 : 4, CFG);
      const w = last.find(e => e.type === 'whiff'); if (w) return { rage: g.rage, close: w.close };
    }
    return null;
  }
  const far = rageAfterFirstWhiff(0.15), nearW = rageAfterFirstWhiff(total - 0.17);
  check('空振りさせると怒りが上がる', far && far.rage > 0, JSON.stringify(far));
  check('ギリギリなほど怒りが大きく上がる', nearW.rage > far.rage + 3, nearW.rage + ' vs ' + far.rage);
  const gh = runG({ person: PLAIN, rng: seeded(1) }, holdOn(4), 4);
  const rageAfterHit = id => { const g = newGame(CFG, { person: PERS(id), rng: seeded(11) }); g.rage = 50; g.human.wait = 0; for (let i = 0; i < 60 * 12; i++) { const e = stepGame(g, DT, 4, CFG); if (e.some(x => x.type === 'bump')) return g.rage; } return null; };
  check('叩かれると怒りが下がる。子ども・おばあちゃんはリセット、おじさんは 4 割が残る', rageAfterHit('kid') === 0 && rageAfterHit('granny') === 0 && Math.abs(rageAfterHit('uncle') - 20) < 1e-9, [rageAfterHit('kid'), rageAfterHit('granny'), rageAfterHit('uncle')].join(' / '));
  check('叩かれると段階が下がり、倍率が戻る（stage の出来事が出る）', (() => { const g = newGame(CFG, { person: PERS('kid'), rng: seeded(11) }); g.rage = 80; g.stage = 3; g.mult = 4; g.human.wait = 0; let down = false; for (let i = 0; i < 60 * 12; i++) { const e = stepGame(g, DT, 4, CFG); if (e.some(x => x.type === 'stage' && x.stage < x.from)) { down = true; break; } } return down && g.mult === 1; })());
  check('怒りは時間ではさめない（隠れ続けても、出ているだけでも、そのまま）', (() => { const g = newGame(CFG, { person: PERS('uncle') }); g.human.wait = 999; g.rage = 50; for (let i = 0; i < 60 * 20; i++) stepGame(g, DT, i % 120 < 60 ? 4 : -1, CFG); return g.rage === 50; })());
  check('隠れ続けても怒りは上がらない', (() => { const r = runG({ person: PLAIN }, () => -1, 70); return r.g.rage === 0 && r.g.maxStage === 0; })());
})();

// ---- 段階ごとの攻撃の変化 ----
(() => {
  const win = (p, s) => windupDur(PERS(p), CFG.stages[s], CFG);
  check('怒りが上がるほど振りかぶりが速くなる（段階 0→4 で縮む）', [0, 1, 2, 3].every(s => win('uncle', s + 1) <= win('uncle', s)) && win('uncle', 4) < win('uncle', 0));
  check('振りかぶりは下限（見てから避けられる長さ）を下回らない', ['kid', 'uncle', 'granny'].every(p => [0, 1, 2, 3, 4].every(s => win(p, s) >= CFG.human.minWindup - 1e-9)));
  check('下限は 反応 0.25秒＋引っ込む時間＋ゆとり 0.1秒 以上', CFG.human.minWindup >= 0.25 + FALL + 0.1 - 1e-9, String(CFG.human.minWindup));
  check('子どもは最初から最短（振りかぶりが速い）、おばあちゃんは長い', win('kid', 0) <= CFG.human.minWindup + 1e-9 && win('granny', 0) > win('uncle', 0));
  check('段階が上がるほど届く範囲・ハンマーの数は増える（減らない）', CFG.stages.every((s, i) => i === 0 || (s.reach >= CFG.stages[i - 1].reach && s.hammers >= CFG.stages[i - 1].hammers && s.scale >= CFG.stages[i - 1].scale)));
  // 届く範囲：巨大ハンマーは左右の隣の穴まで
  function strikeAt(stage, target, moleHole, target2) {
    const g = newGame(CFG, { person: PLAIN, noRage: true }), hu = g.human, m = g.mole;
    hu.stage = stage; hu.phase = 'strike'; hu.t = CFG.human.strike - 0.001; hu.target = target; hu.target2 = target2 === undefined ? -1 : target2; m.hole = moleHole; m.h = 1;
    return humanStep(hu, 0.01, m, 10, CFG, { stage, rng: Math.random }).find(e => e.type === 'impact');
  }
  check('段階 3（激怒）は左右の隣の穴にいても叩かれる', strikeAt(3, 3, 4).hit && strikeAt(3, 5, 4).hit);
  check('段階 2 までは隣の穴なら当たらない', !strikeAt(2, 3, 4).hit && !strikeAt(0, 5, 4).hit);
  check('巨大ハンマーでも、ちがう行なら当たらない', !strikeAt(3, 0, 4).hit && !strikeAt(3, 7, 4).hit);
  check('段階 4（錯乱）は 2 本目の穴にいても叩かれる', strikeAt(4, 1, 7, 6).hit);
  check('2 本目の穴は、1 本目とちがう行になる', (() => { for (let s = 1; s <= 200; s++) for (let h = 0; h < 9; h++) { const hu = newHuman(CFG, PERS('uncle')); const e = startWindup(hu, h, false, { stage: 4, rng: seeded(s * 31 + h) }, CFG); if (e.feint) continue; if (!(e.hole2 >= 0 && e.hole2 <= 8 && rowOf(e.hole2) !== rowOf(e.hole))) return false; } return true; })());
  check('段階 3 までは 2 本目が出ない', (() => { const hu = newHuman(CFG, PERS('uncle')); return startWindup(hu, 4, false, { stage: 3, rng: seeded(9) }, CFG).hole2 === -1; })());
})();

// ---- 3人の癖 ----
(() => {
  // フェイント（おじさん）：振りかぶって止めて引く。出たままでも叩かれない
  const fe = runG({ person: PERS('uncle'), noRage: true, rng: () => 0 }, holdOn(4), 4);
  const w = fe.evs.find(e => e.type === 'windup');
  check('おじさんはフェイントをする（振りかぶり→止めて引く。叩かない）', w && w.feint && fe.evs.some(e => e.type === 'feint') && !fe.evs.some(e => e.type === 'impact'));
  check('フェイントのあいだ顔を出し続けても叩かれない・点は増え続ける', fe.g.bumps === 0 && fe.g.score > 200, fe.g.score + ' bumps=' + fe.g.bumps);
  check('フェイントはその後も続く（何度も振りかぶるが当たらない）', fe.evs.filter(e => e.type === 'windup').length >= 2);
  const fr = runG({ person: PERS('uncle'), noRage: true, rng: seeded(5) }, holdOn(4), 60);
  check('フェイントがない回は叩く（おじさんは出たままなら当たる）', fr.evs.some(e => e.type === 'impact' && e.hit));
  const feintRate = (() => { let f = 0, n = 0; const hu = newHuman(CFG, PERS('uncle')), rng = seeded(77); for (let i = 0; i < 2000; i++) { const e = startWindup(hu, 4, false, { stage: 0, rng }, CFG); n++; if (e.feint) f++; } return f / n; })();
  check('おじさんのフェイント率は設定（約 22%）', Math.abs(feintRate - PERS('uncle').feint) < 0.04, feintRate.toFixed(3));
  check('子ども・おばあちゃんは最初はフェイントしない', (() => { for (const id of ['kid', 'granny']) { const hu = newHuman(CFG, PERS(id)), rng = seeded(8); for (let i = 0; i < 300; i++) if (startWindup(hu, 4, false, { stage: 0, rng }, CFG).feint) return false; } return true; })());
  check('怒りが上がるとフェイントが混ざる（段階 2 以降は子どもも）', (() => { const hu = newHuman(CFG, PERS('kid')), rng = seeded(8); let f = 0; for (let i = 0; i < 500; i++) if (startWindup(hu, 4, false, { stage: 2, rng }, CFG).feint) f++; return f > 40; })());

  // 雑な狙い（子ども）：隣の穴を叩く
  const ky = runG({ person: STRAYP, noRage: true, rng: () => 0 }, holdOn(4), 4);
  const kw = ky.evs.find(e => e.type === 'windup');
  check('（仕組み）隣（左右）の穴を狙う人は、隣を狙う', kw && kw.stray && rowOf(kw.hole) === rowOf(4) && Math.abs(colOf(kw.hole) - colOf(4)) === 1, JSON.stringify(kw));
  check('隣を叩かれても当たらず、避けたことにもならない（点・怒りなし）', ky.evs.some(e => e.type === 'stray') && !ky.evs.some(e => e.type === 'whiff') && ky.g.whiffs === 0 && ky.g.rage === 0);
  check('（仕組み）隣を叩く率は設定どおり（12% で試す）', (() => { let n = 0; const rng = seeded(41); for (let i = 0; i < 3000; i++) { const hu = newHuman(CFG, STRAYP); if (startWindup(hu, 4, false, { stage: 0, rng }, CFG).stray) n++; } return Math.abs(n / 3000 - STRAYP.stray) < 0.03; })());
  check('隣を叩くのは続けて起こらない（バグに見えるため）', (() => { const r = runG({ person: STRAYP, noRage: true, rng: () => 0 }, skilled(0.15, false), 30); const w = r.evs.filter(e => e.type === 'windup'); for (let i = 1; i < w.length; i++) if (w[i].stray && w[i - 1].stray) return false; return w.some(e => e.stray) && w.some(e => !e.stray); })());
  check('隣を叩いたあとは、ぽかんとする間（recoverStray）がある', (() => { const r = runG({ person: STRAYP, noRage: true, rng: () => 0 }, holdOn(4), 3); return r.g.human.mood === 'confuse' || r.evs.some(e => e.type === 'stray'); })());
  check('端の穴では内側の隣だけを狙う', (() => { for (let s = 1; s <= 100; s++) { const hu = newHuman(CFG, STRAYP); const e = startWindup(hu, 3, false, { stage: 0, rng: seeded(s) }, CFG); if (e.stray && e.hole !== 4) return false; const e2 = startWindup(hu, 5, false, { stage: 0, rng: seeded(s) }, CFG); if (e2.stray && e2.hole !== 4) return false; } return true; })());

  // 子どもの癖：隣は叩かない。空振りしてもすぐ次を叩く（せっかち）
  check('子どもは隣の穴を叩かない（バグに見えるので外した）', PERS('kid').stray === 0 && (() => { const r = runG({ person: PERS('kid'), noRage: true, rng: seeded(2) }, skilled(0.15, false), 30); return !r.evs.some(e => e.type === 'stray') && !r.evs.some(e => e.type === 'windup' && e.stray); })());
  check('子どもは空振りのあと、すぐ次を叩ける（立ち直りが他の人より短い）', (() => { const rec = id => { const r = runG({ person: PERS(id), noRage: true, rng: () => 0.99 }, skilled(0.15, false), 12); return r.g.human.recover; }; return PERS('kid').missMul < 1 && rec('kid') < rec('uncle') && Math.abs(rec('kid') - CFG.human.recoverMiss * PERS('kid').missMul) < 1e-9; })());

  // 待ち伏せ（おばあちゃん）：空振りした穴の上で構えて待つ
  function grannyAfterWhiff(next) {   // 最初の空振りまで 4 を押し続けて避け、そのあと next（穴番号）を押す
    const g = newGame(CFG, { person: PERS('granny'), noRage: true, rng: () => 0.99 }); let tw = null, last = [], whiffAt = null; const evs = [];
    for (let i = 0; i < 60 * 12 && !g.over; i++) {
      for (const e of last) if (e.type === 'windup' && whiffAt === null) tw = g.t;
      const press = whiffAt !== null ? next : (tw !== null && g.t - tw >= g.human.dur - 0.1 ? -1 : 4);
      last = stepGame(g, DT, press, CFG); for (const e of last) { evs.push(e); if (e.type === 'whiff' && whiffAt === null) whiffAt = g.t; }
      if (whiffAt !== null && g.t - whiffAt > 3.5) break;
    }
    return { g, evs, whiffAt };
  }
  const gr = grannyAfterWhiff(4);
  check('おばあちゃんは空振りのあと、その穴の上で構えて待つ（待ち伏せ）', gr.whiffAt !== null && gr.evs.some(e => e.type === 'windup' && e.ambush));
  check('同じ穴から出直すと、待ち伏せで素早く振りかぶる（短い予告）', (() => { const e = gr.evs.find(x => x.type === 'windup' && x.ambush); return e && near(e.dur, CFG.human.ambushWindup, 1e-9) && e.hole === 4; })());
  check('待ち伏せの振りかぶりでも、見てから避けられる長さがある', CFG.human.ambushWindup >= 0.25 + FALL + 0.1 - 1e-9, String(CFG.human.ambushWindup));
  const gr2 = grannyAfterWhiff(5);
  check('別の穴へ移れば待ち伏せにはかからない（すぐには狙われない・ふつうの振りかぶりで来る）', !gr2.evs.some(e => e.type === 'windup' && e.ambush) && gr2.evs.some(e => e.type === 'windup' && !e.ambush && e.hole === 5));
  check('おじさん・子どもは待ち伏せしない', (() => { for (const id of ['kid', 'uncle']) { const r = runG({ person: PERS(id), noRage: true, rng: () => 0.99 }, skilled(0.12, false), 30); if (r.evs.some(e => e.type === 'windup' && e.ambush)) return false; } return true; })());
})();

// ---- ランダムに来る人 ----
(() => {
  const rng = seeded(123), cnt = { kid: 0, uncle: 0, granny: 0 };
  for (let i = 0; i < 900; i++) cnt[pickPerson(rng, CFG).id]++;
  check('毎回ランダムに 3人から選ばれる（どの人も 25〜42% ずつ）', Object.values(cnt).every(c => c > 225 && c < 378), JSON.stringify(cnt));
  check('rng が 0 に近くても 1 に近くても範囲外にならない', pickPerson(() => 0, CFG).id === 'kid' && pickPerson(() => 0.9999999, CFG).id === 'granny');
  check('人の指定（id）でそのまま始められる', newGame(CFG, { person: 'uncle' }).person.id === 'uncle');
})();

// ---- 3人の難しさ・エスカレートの手応え（同じ操作の人を各 3人にぶつける） ----
(() => {
  const ids = ['kid', 'uncle', 'granny'];
  const JIT = 0.125, GREEDY = 0.12, SAFE = 0.30;
  function trial(id, margin, n) {
    const out = { score: [], bumps: [], stage: [], escaped: [] };
    for (let s = 1; s <= n; s++) {
      const r = runG({ person: PERS(id), rng: seeded(s * 7919 + 13) }, skilled(margin, PERS(id).ambush > 0, JIT, s), 61);
      out.score.push(r.g.score); out.bumps.push(r.g.bumps); out.stage.push(r.g.maxStage); out.escaped.push(r.g.reason === 'escaped' ? 1 : 0);
    }
    return out;
  }
  const N = 16, skillT = {}, carefulT = {};
  for (const id of ids) { skillT[id] = trial(id, GREEDY, N); carefulT[id] = trial(id, SAFE, N); }
  for (const id of ids) info(PERS(id).name + '（ギリギリ狙い＝' + GREEDY + ' 秒前に引っ込む・ばらつき ±' + JIT + '）', '平均 ' + Math.round(mean(skillT[id].score)) + ' 点／最高段階 ' + mean(skillT[id].stage).toFixed(1) + '／叩かれた回数 ' + mean(skillT[id].bumps).toFixed(2) + '／逃げきり ' + Math.round(mean(skillT[id].escaped) * 100) + '%');
  for (const id of ids) info(PERS(id).name + '（慎重＝' + SAFE + ' 秒前に引っ込む）', '平均 ' + Math.round(mean(carefulT[id].score)) + ' 点／最高段階 ' + mean(carefulT[id].stage).toFixed(1) + '／逃げきり ' + Math.round(mean(carefulT[id].escaped) * 100) + '%');
  const means = ids.map(id => mean(skillT[id].score));
  check('3人の難しさがそろっている（同じ操作で点の平均が 1.6 倍以内。子どもは攻撃が多い高リスク・高得点）', Math.max(...means) / Math.min(...means) <= 1.6, means.map(Math.round).join(' / '));
  check('ギリギリ狙いの操作（ミスは ±0.125 秒のばらつき）でも、誰が相手でも 6 割以上は逃げきれる', ids.every(id => mean(skillT[id].escaped) >= 0.6), ids.map(id => mean(skillT[id].escaped).toFixed(2)).join(' / '));
  check('ギリギリを狙う人ほど、怒りの段階が上がる（誰が相手でも）', ids.every(id => mean(skillT[id].stage) > mean(carefulT[id].stage) + 0.5), ids.map(id => mean(skillT[id].stage).toFixed(1) + ' vs ' + mean(carefulT[id].stage).toFixed(1)).join(' / '));
  check('ギリギリを狙う方が、慎重より点が高い（欲張りが報われる）', ids.every(id => mean(skillT[id].score) > mean(carefulT[id].score) * 1.15), ids.map(id => Math.round(mean(skillT[id].score)) + ' vs ' + Math.round(mean(carefulT[id].score))).join(' / '));
  check('上手な操作なら、誰が相手でも「激怒」以上まで怒らせられる（平均で段階 3 以上）', ids.every(id => mean(skillT[id].stage) >= 3), ids.map(id => mean(skillT[id].stage).toFixed(1)).join(' / '));
})();
