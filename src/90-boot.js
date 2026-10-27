// ===== 起動・メインループ・入力・ゲームの流れ =====
// state：title → intro（地下からのぞく・人間が来る。タップで飛ばせる）→ play → outro（退場）→ over（結果）
(function boot() {
  const $ = id => document.getElementById(id);
  const stage = $('stage'), view = $('view');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  view.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const W = createWorld(scene);
  const camera = new THREE.PerspectiveCamera(60, 9 / 16, 0.1, 80);
  const C = CFG.cam;
  let shakeAmp = 0, peek = 0, camX = 0, tilt = 0, baseFov = 60, hold = 0, kick = 0, slowT = 0;   // hold＝ヒットストップ（秒）、kick＝画角のはずみ、slowT＝スロー（実時間の秒）
  const holePts = Array.from({ length: 9 }, () => ({ x: 0, y: 0 }));

  function fit() {
    const w = view.clientWidth, h = view.clientHeight;
    renderer.setSize(w, h);
    document.documentElement.style.setProperty('--u', stage.clientWidth / 100 + 'px');
    camera.aspect = w / h;
    const hf = C.hfov * Math.PI / 180;                       // 横の画角を一定にして縦の画角を決める（細い画面でも台が収まる）
    camera.fov = baseFov = 2 * Math.atan(Math.tan(hf / 2) / camera.aspect) * 180 / Math.PI;
    camera.position.set(C.pos[0], C.pos[1], C.pos[2]);
    camera.lookAt(C.look[0], C.look[1], C.look[2]);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    // 穴の画面上の位置（押した場所から穴を決めるのに使う）
    const v = new THREE.Vector3();
    for (let i = 0; i < 9; i++) {
      const p = holePos(i, CFG); v.set(p.x, 0.3, p.z).project(camera);
      holePts[i].x = (v.x * 0.5 + 0.5) * w; holePts[i].y = (-v.y * 0.5 + 0.5) * h;
    }
  }
  addEventListener('resize', fit); fit();

  // ---- 保存（使えないときは保存しないだけ） ----
  const KEY = 'mole-tease-best';
  let best = 0;
  try { best = parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch (e) { }
  function saveBest() { try { localStorage.setItem(KEY, String(best)); } catch (e) { } }

  // ---- 状態 ----
  let state = 'title', g = newGame(CFG), press = -1, ptr = null, freeze = false, whoTimer = 0, paused = false;
  let introT = 0, outroT = 0, prevH = 0, lastTick = -1, stepT = 0, introFlags = {}, lastResult = null;
  const hud = $('hud'), hint = $('hint');
  const STAGE_COLORS = ['#74c0fc', '#ffd43b', '#ff922b', '#ff6b6b', '#e64980'];

  function refreshHud() {
    $('score').textContent = Math.floor(g.score);
    const left = Math.max(0, Math.ceil(CFG.duration - g.t));
    $('time').textContent = left; $('timeBox').classList.toggle('low', left <= 10);
    for (let i = 0; i < 3; i++) $('lump' + i).classList.toggle('on', i < g.bumps);
    $('rageFill').style.width = clamp(g.rage, 0, 100) + '%'; $('rage').className = 'r' + g.stage; $('rageName').textContent = CFG.stages[g.stage].name;
    $('mult').textContent = '×' + g.mult; $('multBox').className = 'chip m' + g.mult + ($('multBox').classList.contains('bump') ? ' bump' : '');
    $('titleBest').textContent = best;
  }
  // 表示は 2 か所：main（空振り・叩かれた）と stage（怒りの段階）。同じ場所に出すときは前のものを消す（文字が重ならないように）
  function pop(html, cls, slot) {
    const box = $(slot === 'stage' ? 'popsStage' : 'pops');
    while (box.firstChild) box.firstChild.remove();
    const d = document.createElement('div'); d.className = 'pop ' + cls; d.innerHTML = html;
    box.appendChild(d); setTimeout(() => d.remove(), 1150);
  }
  function show(id, on) { $(id).classList.toggle('on', on); }
  function clearPops() { for (const id of ['pops', 'popsStage']) { const b = $(id); while (b.firstChild) b.firstChild.remove(); } }

  // ---- ゲームの流れ ----
  function startGame(id) {
    // 人の指定（文字列）は検証用。ふだんは毎回ランダムに 3人から（タイトルに映っている人が、そのまま来る）
    const keep = state === 'title' ? g.person : undefined;
    g = newGame(CFG, typeof id === 'string' ? { person: id } : keep ? { person: keep } : undefined);
    press = -1; ptr = null; paused = false; show('pauseScr', false);
    state = 'intro'; introT = 0; introFlags = {}; stepT = 0; prevH = 0; lastTick = -1; slowT = 0; hold = 0;
    show('titleScr', false); show('overScr', false); hud.classList.remove('on'); hint.classList.remove('on'); $('who').classList.remove('on'); clearPops();
    peek = CFG.fps.amt; camX = holePos(4, CFG).x;       // 地下の穴の中から始まる
    $('iris').style.opacity = 1; show('skip', true);
    SFX.unlock(); SFX.rumble();
    refreshHud();
  }
  function beginPlay() {
    state = 'play'; show('skip', false); $('iris').style.opacity = 0;
    hud.classList.add('on');
    hint.classList.add('on'); setTimeout(() => hint.classList.remove('on'), 4200);
    $('whoName').textContent = 'あいて：' + g.person.name; $('who').classList.add('on'); clearTimeout(whoTimer); whoTimer = setTimeout(() => $('who').classList.remove('on'), 4200);
    g.human.wait = 0.7;
    refreshHud();
  }
  function endGame() {
    state = 'outro'; outroT = 0; press = -1; ptr = null; hud.classList.remove('on'); hint.classList.remove('on'); $('who').classList.remove('on'); $('mini').classList.remove('on');
    const score = Math.floor(g.score), isNew = score > best;
    if (isNew) { best = score; saveBest(); }
    const stName = CFG.stages[g.maxStage].name;
    lastResult = { name: g.person.name, score, maxStage: g.maxStage, stageName: stName, whiffs: g.whiffs, reason: g.reason, best, isNew };
    $('overTitle').textContent = g.reason === 'escaped' ? '逃げきり！' : '叩かれた…';
    $('overScore').textContent = score;
    $('overNew').classList.toggle('on', isNew);
    $('overWho').textContent = g.person.name + (g.maxStage > 0 ? 'を「' + stName + '」まで怒らせた' : 'は最後まで平静だった');
    $('overStat').textContent = '空振りさせた ' + g.whiffs + ' 回';
    $('overBest').textContent = '自己ベスト ' + best + ' 点';
    setTimeout(() => (g.reason === 'escaped' ? SFX.win : SFX.lose)(), 350);
  }
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);

  // 一時停止（別のタブ・アプリに移ったとき）
  function setPaused(p) {
    if (p === paused) return;
    paused = p; show('pauseScr', p); if (p) { press = -1; ptr = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setPaused(true); });
  addEventListener('blur', () => { ptr = null; press = -1; if (state === 'play') setPaused(true); });
  $('resumeBtn').addEventListener('click', () => { setPaused(false); last = performance.now(); });

  // ---- 入力：押している間だけ顔を出す ----
  function holeAt(e, cur) {
    const r = view.getBoundingClientRect();
    return pickHole(e.clientX - r.left, e.clientY - r.top, holePts, cur, 1.25);
  }
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.screen') || e.target.closest('.ibtn')) return;
    if (state === 'intro') { beginPlay(); g.mole.h = 0; return; }       // 開始の演出はタップで飛ばせる
    if (state !== 'play' || paused || ptr !== null) return;
    ptr = e.pointerId; try { stage.setPointerCapture(e.pointerId); } catch (x) { }
    press = holeAt(e, -1); e.preventDefault();
  });
  stage.addEventListener('pointermove', e => { if (e.pointerId === ptr && state === 'play') press = holeAt(e, press); });
  function release(e) { if (e.pointerId === ptr) { ptr = null; press = -1; } }
  stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);

  // ---- 音（♪ で入り切り。iPhone などは操作のたびに有効化する） ----
  $('soundBtn').classList.toggle('off', SFX.isMuted());
  $('soundBtn').addEventListener('click', e => { e.stopPropagation(); SFX.unlock(); SFX.setMuted(!SFX.isMuted()); $('soundBtn').classList.toggle('off', SFX.isMuted()); if (!SFX.isMuted()) setTimeout(SFX.blip, 80); });
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click']) addEventListener(ev, () => SFX.unlock(), { capture: true });

  // ---- X 共有：スマホは画像つき（Web Share API）、PC は X の投稿画面（文章＋URL。画像は自動では付けられない） ----
  function resultCanvas() {
    const r = lastResult || { name: '', score: 0, maxStage: 0, stageName: '平静', whiffs: 0, reason: 'escaped', best: 0 };
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
    const x = c.getContext('2d'), F = '"Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif';
    const bg = x.createLinearGradient(0, 0, 0, 1350); bg.addColorStop(0, '#4a2f6b'); bg.addColorStop(1, '#1d1530');
    x.fillStyle = bg; x.fillRect(0, 0, 1080, 1350);
    x.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(180 + (i % 3) * 360, 1020 + Math.floor(i / 3) * 110, 110, 40, 0, 0, Math.PI * 2); x.fill(); }   // 台の穴
    x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '900 72px ' + F; x.fillText('叩かれないモグラ', 540, 180);
    x.fillStyle = '#c9c0e0'; x.font = '700 48px ' + F; x.fillText(r.reason === 'escaped' ? '60 秒、逃げきった' : '叩かれてしまった…', 540, 260);
    x.font = '900 330px ' + F; const sw = x.measureText(String(r.score)).width; x.font = '900 100px ' + F; const uw = x.measureText('点').width;   // 数字の右に「点」を並べる
    const sx = 540 - (sw + 16 + uw) / 2; x.textAlign = 'left';
    x.fillStyle = '#ffd43b'; x.font = '900 330px ' + F; x.fillText(String(r.score), sx, 680);
    x.fillStyle = '#fff'; x.font = '900 100px ' + F; x.fillText('点', sx + sw + 16, 680); x.textAlign = 'center';
    x.fillStyle = '#fff'; x.font = '700 54px ' + F; x.fillText(r.name, 540, 860);
    x.fillStyle = STAGE_COLORS[r.maxStage]; x.font = '900 76px ' + F; x.fillText(r.maxStage > 0 ? '「' + r.stageName + '」まで怒らせた' : '最後まで平静だった', 540, 960);
    x.fillStyle = '#c9c0e0'; x.font = '700 46px ' + F; x.fillText('空振りさせた ' + r.whiffs + ' 回　自己ベスト ' + r.best + ' 点', 540, 1100);
    x.fillText('#' + CFG.share.hashtag, 540, 1250);
    return c;
  }
  async function share() {
    if (!lastResult) return;
    const url = CFG.share.url || (/^https?:/.test(location.href) ? location.href.split('#')[0] : '');
    const text = shareText(lastResult, CFG);
    if (matchMedia('(pointer: coarse)').matches && navigator.share && navigator.canShare) {
      try {
        const blob = await new Promise(r => resultCanvas().toBlob(r, 'image/png'));
        const file = new File([blob], 'mole-tease.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: text + (url ? ' ' + url : '') }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    window.open(tweetUrl(text, url), '_blank', 'noopener');
  }
  $('shareBtn').addEventListener('click', share);

  // ---- 出来事の見た目と音 ----
  function onEvents(evs) {
    for (const e of evs) {
      if (e.type === 'windup') SFX.windup(e.dur);
      else if (e.type === 'feint') SFX.feint();
      else if (e.type === 'impact') {
        shakeAmp = Math.max(shakeAmp, e.hit ? 0.5 : 0.18);
        SFX.slam(g.stage >= 3);
        if (e.hit) { const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
        const p = holePos(e.hole, CFG); spawnPuffs(W, p.x, p.z, e.hit ? 8 : 6); if (e.hit) spawnPuffs(W, p.x, p.z, 7, true);   // 叩かれたら黄色い星が弾ける
      } else if (e.type === 'whiff') {
        SFX.whiff(e.close);
        if (e.close >= 0.7) { pop(e.label + '<small>+' + e.pts + '</small>', 'great'); slowT = 0.5; kick = Math.max(kick, 0.5); SFX.slowmo(); }   // 紙一重はスロー
        else if (e.close >= 0.35) pop(e.label + '<small>+' + e.pts + '</small>', 'near');
        else pop(e.label + '<small>+' + e.pts + '</small>', 'miss');
        $('scoreBox').classList.remove('bump'); void $('scoreBox').offsetWidth; $('scoreBox').classList.add('bump');
      } else if (e.type === 'stage') {
        shakeAmp = Math.max(shakeAmp, 0.35);
        // 段階アップは「この瞬間」だと分かるように：一瞬止まる（ヒットストップ）・段階の色で画面が縁取られて光る・画面が大きくゆれて画角がはずむ・人間がぷくっと膨らむ・ゲージ、倍率が光る。
        // 文字は空振りの文字と重ならないよう少しあとに、段階名だけを別の場所に出す
        const rg = $('rage'); rg.classList.remove('up', 'down'); void rg.offsetWidth; rg.classList.add(e.stage > e.from ? 'up' : 'down');
        const rn = $('rageName'); rn.classList.remove('bump'); void rn.offsetWidth; rn.classList.add('bump');
        const mb = $('multBox'); mb.classList.remove('bump'); void mb.offsetWidth; mb.classList.add('bump');
        if (e.stage > e.from) {
          hold = 0.14; kick = 1; shakeAmp = Math.max(shakeAmp, 0.7); W.pulse = 1; SFX.stage(e.stage);
          const sf = $('sflash'); sf.style.setProperty('--sc', STAGE_COLORS[e.stage]); sf.classList.remove('on'); void sf.offsetWidth; sf.classList.add('on');
          const nm = CFG.stages[e.stage].name; setTimeout(() => { if (state === 'play') pop(nm + '！', 'rage', 'stage'); }, 650);
        } else SFX.cool();
      } else if (e.type === 'bump') {
        pop('ピコッ！', 'bad'); SFX.bump();
      } else if (e.type === 'end') endGame();
    }
  }

  // ---- メインループ ----
  let last = performance.now(), simT = 0;
  function frame(nowMs) {
    const real = Math.min(0.05, (nowMs - last) / 1000); last = nowMs;
    slowT = Math.max(0, slowT - real);
    const dt = paused ? 0 : real * (slowT > 0 ? 0.3 : 1); simT += dt;    // 紙一重のあとは少しスロー

    if (state === 'play' && !freeze && !paused) {
      if (hold > 0) hold -= dt; else { onEvents(stepGame(g, dt, press, CFG)); refreshHud(); }
      // 顔を出す・引っ込む音、残り 10 秒のカチ
      if (prevH < 0.05 && g.mole.h >= 0.05) SFX.pop(); else if (prevH > 0.3 && g.mole.h <= 0.3) SFX.hide();
      prevH = g.mole.h;
      const left = Math.ceil(CFG.duration - g.t); if (left <= 10 && left > 0 && left !== lastTick) { lastTick = left; SFX.tick(); }
    } else if (state === 'intro') {
      introT += dt; const ist = introState(introT);
      g.mole.h = ist.moleH;
      if (!introFlags.pop && introT > 0.5) { introFlags.pop = true; SFX.pop(); }
      if (ist.walking) { stepT -= dt; if (stepT <= 0) { stepT = 0.34; SFX.step(); } }
      if (!introFlags.coin && introT > 1.95) { introFlags.coin = true; SFX.coin(); }
      $('iris').style.setProperty('--r', (ist.irisU * 100) + '%'); $('iris').style.opacity = 1 - clamp((introT - 1.1) / 0.4, 0, 1);
      if (introT >= INTRO_DUR) { beginPlay(); }
    } else if (state === 'outro' || state === 'over') {
      if (state === 'outro') {
        outroT += dt; const ost = outroState(outroT, g.reason);
        if (ost.moleH != null) g.mole.h = ost.moleH;
        if (ost.walking) { stepT -= dt; if (stepT <= 0) { stepT = g.reason === 'escaped' ? 0.5 : 0.3; SFX.step(); } }
        if (outroT >= OUTRO_DUR) { state = 'over'; show('overScr', true); }
      }
    }
    const X = state === 'intro' ? { mode: 'intro', t: introT } : (state === 'outro' || state === 'over') ? { mode: 'outro', t: Math.min(outroT, OUTRO_DUR), reason: g.reason } : { mode: 'play', t: 0 };
    updateWorld(W, g, dt, simT, X);

    // 出ている間は一人称：出ている穴の、モグラの目の位置へカメラが降りる（押す位置の判定は俯瞰のカメラ基準のまま）。開始は地下から上がってくる
    const P = CFG.fps, mp = holePos(g.mole.hole, CFG), ist2 = state === 'intro' ? introState(introT) : null;
    peek += ((ist2 ? P.amt : state === 'play' ? clamp(g.mole.h, 0, 1) * P.amt : 0) - peek) * (1 - Math.exp(-real * P.rate));
    camX += (mp.x - camX) * (1 - Math.exp(-real * P.rate));
    shakeAmp = Math.max(0, shakeAmp - real * 1.4);
    const eyeY = ist2 ? lerp(-0.95, P.eyeBase + P.eyeK * 0.9, ist2.camU) : P.eyeBase + P.eyeK * g.mole.h;
    const sx = (Math.random() - 0.5) * shakeAmp, sy = (Math.random() - 0.5) * shakeAmp;
    tilt += ((state === 'play' && (g.human.phase === 'windup' || g.human.phase === 'strike') && g.human.target === g.mole.hole ? 1 : 0) - tilt) * (1 - Math.exp(-real * P.tiltRate));
    const pitch = (P.pitch + (ist2 ? (1 - ist2.camU) * 34 : 0) + P.windupPitch * tilt) * Math.PI / 180;
    camera.position.set(lerp(C.pos[0], camX, peek) + sx, lerp(C.pos[1], eyeY, peek) + sy, lerp(C.pos[2], mp.z + P.back, peek));
    camera.lookAt(lerp(C.look[0], camX * P.lookXk, peek), lerp(C.look[1], eyeY + P.lookDist * Math.tan(pitch), peek), lerp(C.look[2], mp.z - P.lookDist, peek));
    kick = Math.max(0, kick - real * 3);
    const fov = lerp(baseFov, P.fov, peek) + 9 * kick;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    W.fpsView = peek > P.hideAt;
    $('tunnel').style.opacity = peek;
    {   // 危険の知らせ：振りかぶりが進むほど画面の縁が赤く、脈打つ。タイミングバーは「ここで離すと紙一重」の帯つき
      const hu = g.human, A = CFG.assist, danger = state === 'play' && (hu.phase === 'windup' || hu.phase === 'strike') && !hu.feint;
      const total = hu.dur + CFG.human.strike, u = danger ? clamp((hu.phase === 'windup' ? hu.t : hu.dur + hu.t) / total, 0, 1) : 0;
      $('danger').style.opacity = danger ? clamp(Math.pow(u, 1.5) * (0.65 + 0.35 * Math.sin(simT * (9 + 18 * u))) + 0.08, 0, 1) : 0;
      const showBar = danger && A.bar;
      $('clock').classList.toggle('on', showBar); $('clockLab').classList.toggle('on', showBar && g.whiffs < 3);
      if (showBar) $('clockFill').style.width = (u * 100) + '%';
    }
    const mini = $('mini'); mini.classList.toggle('on', state === 'play' && peek > 0.2);
    if (state === 'play') { const cells = mini.children, hu = g.human, on = (hu.phase === 'windup' || hu.phase === 'strike') && !hu.feint, rc = CFG.stages[hu.stage].reach; for (let i = 0; i < 9; i++) cells[i].className = on && (i === hu.target || i === hu.target2) ? 'tg' : on && rc && ((hu.target >= 0 && rowOf(i) === rowOf(hu.target) && Math.abs(colOf(i) - colOf(hu.target)) <= rc) || (hu.target2 >= 0 && rowOf(i) === rowOf(hu.target2) && Math.abs(colOf(i) - colOf(hu.target2)) <= rc)) ? 'rc' : i === g.mole.hole ? 'me' : ''; }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  refreshHud();
  requestAnimationFrame(frame);

  // 検証用の窓口（遊ぶのには使わない）
  window.__t = {
    start: startGame, state: () => state, game: () => g, holePts: () => holePts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
    setPress: h => { press = h; }, freeze: f => { freeze = f; }, skip: () => { if (state === 'intro') { beginPlay(); g.mole.h = 0; } }, setIntroT: t => { introT = t; }, introT: () => introT, outroT: () => outroT, setOutroT: t => { outroT = t; }, scene, camera, W,
  };
})();
