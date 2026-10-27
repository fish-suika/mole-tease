// ===== 検証（three.js を使わない純粋ロジック） =====
const $out = document.getElementById('out');
let nOk = 0, nNg = 0;
function check(name, cond, why) {
  const d = document.createElement('div'); d.className = 'r ' + (cond ? 'ok' : 'ng'); d.textContent = name;
  if (!cond) { nNg++; const w = document.createElement('div'); w.className = 'why'; w.textContent = why || ''; d.appendChild(w); } else nOk++;
  $out.appendChild(d);
}
const near = (x, y, e) => Math.abs(x - y) <= (e || 1e-9);
const DT = 1 / 60;

// bot(g, ev) が押す穴（なければ -1）を返す。終わるか seconds たつまで回す
function run(bot, seconds) {
  const g = newGame(CFG), evs = [];
  let last = [];
  for (let i = 0; i < Math.round(seconds / DT) && !g.over; i++) {
    const e = stepGame(g, DT, bot(g, last), CFG);
    last = e; for (const x of e) evs.push(x);
  }
  return { g, evs };
}
const holdHole = n => () => n;
const hide = () => -1;

// ---- 押して出る・離して引っ込む ----
(() => {
  const m = newMole(); let now = 0;
  const adv = (s, p) => { for (let i = 0; i < Math.round(s / DT); i++) { now += DT; moleStep(m, DT, p, now, CFG); } };
  adv(0.05, 4);
  check('押すと出はじめる（0.05 秒ではまだ全部は出ない）', m.h > 0 && m.h < 1, String(m.h));
  adv(0.3, 4);
  check('押し続けると全部出る', near(m.h, 1, 1e-9), String(m.h));
  adv(0.05, -1);
  check('離すと引っ込みはじめる', m.h < 1 && m.h > 0, String(m.h));
  adv(0.3, -1);
  check('離して 0.3 秒で完全に引っ込む', m.h === 0, String(m.h));
  check('引っ込んだ時刻が記録される（叩かれる高さを離れた時刻）', m.exitTs[4] > 0.3 && m.exitTs[4] < 0.5, String(m.exitTs[4]));
  const t0 = now;
  adv(0.01, 7);
  check('別の穴を押すと、今の穴で引っ込んでから地下を移る（すぐには出ない）', m.h === 0 && m.hole === 4);
  adv(0.1, 7);
  check('地下を移っている間は出ない', m.h === 0 && m.hole === 4 && m.travel > 0);
  adv(0.15, 7);
  check('移動のあと、新しい穴から出はじめる', m.hole === 7 && m.h > 0, JSON.stringify({ hole: m.hole, h: m.h }));
  check('移動は 0.2 秒前後（0.15 秒でまだ出ていない→0.4 秒で出ている）', (() => { const q = newMole(); let n = 0; for (let i = 0; i < Math.round(0.15 / DT); i++) { n += DT; moleStep(q, DT, 7, n, CFG); } const a = q.hole === 4; for (let i = 0; i < Math.round(0.25 / DT); i++) { n += DT; moleStep(q, DT, 7, n, CFG); } return a && q.hole === 7 && q.h > 0; })());
  const m2 = newMole(); let n2 = 0;
  for (let i = 0; i < 30; i++) { n2 += DT; moleStep(m2, DT, 4, n2, CFG); }
  for (let i = 0; i < 3; i++) { n2 += DT; moleStep(m2, DT, 5, n2, CFG); }   // 出ている状態から別の穴へ指をずらす
  check('出ている最中に別の穴へずらすと、まず引っ込みはじめる', m2.h < 1 && m2.hole === 4);
})();

// ---- 穴の選び方（画面の座標） ----
(() => {
  const pts = [0, 1, 2].flatMap(r => [0, 1, 2].map(c => ({ x: 60 + c * 100, y: 300 + r * 60 })));
  check('穴のすぐ近くを押すとその穴', pickHole(162, 362, pts, -1) === 4);
  check('穴と穴のあいだは近い方', pickHole(100, 300, pts, -1) === 0 && pickHole(130, 300, pts, -1) === 1);
  check('いま押している穴から、境目では離れにくい（ヒステリシス）', pickHole(112, 300, pts, 0, 1.25) === 0 && pickHole(112, 300, pts, -1) === 1);
  check('境目をはっきり越えれば別の穴に移る', pickHole(150, 300, pts, 0, 1.25) === 1);
  check('画面のどこを押しても何かの穴になる（手前の下でも）', pickHole(10, 900, pts, -1) === 6);
})();

// ---- 人間の動き ----
(() => {
  const { g, evs } = run(holdHole(4), 3);
  const w = evs.find(e => e.type === 'windup'), i = evs.find(e => e.type === 'impact');
  check('顔を出し続けると人間が振りかぶる', !!w && w.hole === 4);
  check('振りかぶりから振り下ろしまで予告の長さがある', (() => { const a = run(holdHole(4), 4); let tw = null, ts = null, k = 0; const g2 = newGame(CFG); for (let n = 0; n < 240; n++) { const e = stepGame(g2, DT, 4, CFG); for (const x of e) { if (x.type === 'windup' && tw === null) tw = g2.t; if (x.type === 'impact' && ts === null) ts = g2.t; } } return ts - tw >= CFG.human.windup + CFG.human.strike - 0.03 && ts - tw <= CFG.human.windup + CFG.human.strike + 0.03; })());
  check('出たままだと叩かれる（当たり）', !!i && i.hit === true);
  check('当たるとたんこぶ 1 つ・イベントが出る', g.bumps >= 1 && evs.some(e => e.type === 'bump' && e.bumps === 1));
  const early = run(holdHole(4), 0.5);
  check('開始直後の待ちのあいだは狙わない', !early.evs.some(e => e.type === 'windup'));
  check('出てすぐ引っ込めば（気づく前に）狙われない', (() => {
    const g2 = newGame(CFG); let n = 0, ev2 = [];
    for (; n < 60 * 2; n++) ev2 = ev2.concat(stepGame(g2, DT, -1, CFG));           // 2 秒（最初の待ち）隠れる
    for (n = 0; n < 8; n++) ev2 = ev2.concat(stepGame(g2, DT, 4, CFG));            // 0.13 秒出る
    for (n = 0; n < 120; n++) ev2 = ev2.concat(stepGame(g2, DT, -1, CFG));
    return !ev2.some(e => e.type === 'windup');
  })());
  check('隠れ続けても罰はない（60 秒たって逃げきり・点は 0・たんこぶ 0）', (() => { const r = run(hide, 70); return r.g.over && r.g.reason === 'escaped' && r.g.score === 0 && r.g.bumps === 0 && r.g.t >= CFG.duration; })());
  check('出っぱなしだと 3 回叩かれて終わる', (() => { const r = run(holdHole(4), 70); return r.g.over && r.g.reason === 'bumped' && r.g.bumps === CFG.maxBumps && r.g.t < CFG.duration; })());
  check('叩かれたあとのつぶれたモグラは、人間が次を狙う前に起きる', CFG.mole.stunTime <= CFG.human.recoverHit);
})();

// ---- ギリギリ度（空振りの手応え） ----
// 振りかぶりが始まってから d 秒後に離すボット
function dodgeBot(d, hole) {
  let tw = null;
  return (g, last) => {
    for (const e of last) { if (e.type === 'windup') tw = g.t; if (e.type === 'impact') tw = null; }
    if (tw !== null && g.t - tw >= d) return -1;
    return hole;
  };
}
function firstWhiff(d) {
  const g = newGame(CFG), bot = dodgeBot(d, 4); let last = [];
  for (let i = 0; i < 60 * 8 && !g.over; i++) { last = stepGame(g, DT, bot(g, last), CFG); const w = last.find(e => e.type === 'whiff'); if (w) return w; if (last.some(e => e.type === 'bump')) return null; }
  return null;
}
(() => {
  const total = CFG.human.windup + CFG.human.strike;
  const early = firstWhiff(0.15), mid = firstWhiff(total - 0.30), late = firstWhiff(total - 0.17), tooLate = firstWhiff(total - 0.06);
  check('振りかぶり直後に引っ込めば空振り（ギリギリ度は低い）', early && early.close < 0.1, JSON.stringify(early));
  check('途中で引っ込めば、ギリギリ度は中くらい', mid && mid.close > 0.1 && mid.close < 0.7, JSON.stringify(mid));
  check('粘ってから引っ込むと、ギリギリ度が高い', late && late.close >= 0.7, JSON.stringify(late));
  check('粘りすぎると叩かれる（引っ込む前に当たる）', tooLate === null);
  check('粘るほど空振りの点が増える', early.pts < mid.pts && mid.pts < late.pts, [early.pts, mid.pts, late.pts].join(' < '));
  check('ギリギリの空振りの点は、基本の点より十分大きい（欲張りの理由になる）', late.pts >= CFG.score.whiffBase * 5, String(late.pts));
  check('ギリギリ度は 0〜1 に収まる', [early, mid, late].every(w => w.close >= 0 && w.close <= 1));
  check('ギリギリ度が高いほど言い方が強い', whiffLabel(0.9) === '紙一重！' && whiffLabel(0.5) === 'ギリギリ！' && whiffLabel(0.1) === 'スカッ');
  check('引っ込んでから叩かれるまでの隙間が 0 ならギリギリ度 1', (() => { const g = newGame(CFG); const m = g.mole; m.exitTs[4] = 10; const hu = g.human; hu.phase = 'strike'; hu.t = CFG.human.strike - 0.001; hu.target = 4; m.hole = 4; m.h = 0; const e = humanStep(hu, 0.01, m, 10, CFG); return near(e[0].close, 1, 1e-9); })());
})();

// ---- 点数 ----
(() => {
  const g = newGame(CFG); g.human.wait = 99;     // 人間が動かない状態で点だけ測る
  for (let i = 0; i < 60; i++) stepGame(g, DT, 4, CFG);
  check('出ている間だけ毎秒 pps 点が入る（1 秒で約 pps−出はじめの分）', g.score > CFG.score.pps * 0.8 && g.score <= CFG.score.pps + 1e-6, String(g.score));
  const g2 = newGame(CFG); g2.human.wait = 99;
  for (let i = 0; i < 120; i++) stepGame(g2, DT, -1, CFG);
  check('隠れている間は点が入らない', g2.score === 0);
  check('倍率がかかる（Phase 2 の怒りの倍率の土台）', (() => { const a = newGame(CFG), b = newGame(CFG); a.human.wait = b.human.wait = 99; b.mult = 3; for (let i = 0; i < 60; i++) { stepGame(a, DT, 4, CFG); stepGame(b, DT, 4, CFG); } return near(b.score / a.score, 3, 1e-6); })());
  const g3 = newGame(CFG); g3.human.wait = 99;
  for (let i = 0; i < 3; i++) stepGame(g3, DT, 4, CFG);
  check('出はじめ（半分以下）の高さでは点が入らない', g3.score === 0, String(g3.score));
})();

// ---- 「ギリギリで空振りさせる」戦略が、他より得 ----
(() => {
  const total = CFG.human.windup + CFG.human.strike;
  const hid = run(hide, 70), holdAll = run(holdHole(4), 70);
  const careful = run(dodgeBot(total - 0.35, 4), 70);                 // 余裕をもって避ける
  const greedy = run(dodgeBot(total - 0.2, 4), 70);                    // ギリギリまで粘る
  check('隠れ続けるより、避けながら出る方が点が高い', careful.g.score > hid.g.score + 2000, careful.g.score + ' vs ' + hid.g.score);
  check('出っぱなしより、避けながら出る方が点が高い（叩かれて終わるから）', careful.g.score > holdAll.g.score, careful.g.score + ' vs ' + holdAll.g.score);
  check('余裕をもって避けるボットは 60 秒逃げきれる', careful.g.reason === 'escaped' && careful.g.bumps === 0, careful.g.reason + ' bumps=' + careful.g.bumps);
  check('ギリギリまで粘る方が、余裕を持つより点が高い（からかうほど得）', greedy.g.reason === 'escaped' && greedy.g.score > careful.g.score, greedy.g.score + ' vs ' + careful.g.score);
  check('空振りを何度も起こせる（60 秒で 20 回以上）', careful.g.whiffs >= 20, String(careful.g.whiffs));
})();

// ---- 設定の整合 ----
(() => {
  const H = CFG.human, M = CFG.mole;
  check('モグラが気づかれてから引っ込むのに必要な時間 < 予告の長さ（避けられる）', (1 - M.hitH) / M.fall + 0.25 < H.windup, '');
  check('引っ込むのは振り下ろし 0.12 秒より速い（振りかぶり中に離せば間に合う）', (1 - M.hitH) / M.fall < H.windup);
  check('穴は 3×3 の 9 個で、重ならない', (() => { for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) { const a = holePos(i, CFG), b = holePos(j, CFG); if (Math.hypot(a.x - b.x, a.z - b.z) < CFG.holes.r * 2) return false; } return true; })());
  check('行 0 が奥・行 2 が手前', holePos(0, CFG).z < holePos(6, CFG).z && holePos(0, CFG).x < holePos(2, CFG).x);
})();

// ---- タイミングバーの帯（離す時刻） ----
(() => {
  const Z = releaseZone(CFG);
  const a = firstWhiff(Z.from), b = firstWhiff(Z.to), c = firstWhiff(Z.to + 0.1);
  check('帯の始まりで離すと空振り、ギリギリ度は設定の下限（0.35）前後', a && near(a.close, CFG.assist.zoneNear, 0.1), JSON.stringify(a));
  check('帯の終わりで離しても叩かれずに空振り（ギリギリ度は高い）', b && b.close > 0.7, JSON.stringify(b));
  check('帯を過ぎて離すと叩かれる', c === null);
  check('帯はバーの中（0〜total）に収まり、幅がある', Z.from > 0 && Z.to < Z.total && Z.to - Z.from > 0.05, JSON.stringify(Z));
})();
