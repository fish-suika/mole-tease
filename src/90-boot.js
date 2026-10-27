// ===== 起動・メインループ・入力・ゲームの流れ =====
// state：title → play → over。play のあいだ、押している穴を stepGame に渡す
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
  let shakeAmp = 0, peek = 0, camX = 0, tilt = 0, baseFov = 60, hold = 0, kick = 0;   // hold＝ヒットストップ（秒）、kick＝画角のはずみ
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
  let state = 'title', g = newGame(CFG), press = -1, ptr = null, freeze = false, whoTimer = 0;
  const hud = $('hud'), hint = $('hint');

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
  {   // タイミングバーの帯：引っ込むのに掛かる時間を見込んで、ギリギリ度が zoneNear 以上になる離し方〜当たる直前まで
    const Z = releaseZone(CFG), total = Z.total, from = Z.from, to = Z.to, zone = $('clockZone');
    zone.style.left = (from / total * 100) + '%'; zone.style.width = ((to - from) / total * 100) + '%';
  }
  function show(id, on) { $(id).classList.toggle('on', on); }

  function startGame(id) {
    // 人の指定（文字列）は検証用。ふだんは毎回ランダムに 3人から
    g = newGame(CFG, typeof id === 'string' ? { person: id } : undefined); press = -1; state = 'play';
    show('titleScr', false); show('overScr', false); hud.classList.add('on');
    hint.classList.add('on'); setTimeout(() => hint.classList.remove('on'), 4200);
    $('whoName').textContent = 'あいて：' + g.person.name; $('who').classList.add('on'); clearTimeout(whoTimer); whoTimer = setTimeout(() => $('who').classList.remove('on'), 4200);
    refreshHud();
  }
  function endGame() {
    state = 'over'; press = -1; hud.classList.remove('on'); hint.classList.remove('on');
    const score = Math.floor(g.score), isNew = score > best;
    if (isNew) { best = score; saveBest(); }
    $('overTitle').textContent = g.reason === 'escaped' ? '逃げきり！' : '叩かれた…';
    $('overScore').textContent = score;
    $('overNew').classList.toggle('on', isNew);
    $('overWho').textContent = g.person.name + (g.maxStage > 0 ? 'を「' + CFG.stages[g.maxStage].name + '」まで怒らせた' : 'は最後まで平静だった');
    $('overStat').textContent = '空振りさせた ' + g.whiffs + ' 回';
    $('overBest').textContent = '自己ベスト ' + best + ' 点';
    setTimeout(() => show('overScr', true), g.reason === 'escaped' ? 500 : 900);
  }
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);

  // ---- 入力：押している間だけ顔を出す ----
  function holeAt(e, cur) {
    const r = view.getBoundingClientRect();
    return pickHole(e.clientX - r.left, e.clientY - r.top, holePts, cur, 1.25);
  }
  stage.addEventListener('pointerdown', e => {
    if (state !== 'play' || ptr !== null || e.target.closest('.screen')) return;
    ptr = e.pointerId; try { stage.setPointerCapture(e.pointerId); } catch (x) { }
    press = holeAt(e, -1); e.preventDefault();
  });
  stage.addEventListener('pointermove', e => { if (e.pointerId === ptr && state === 'play') press = holeAt(e, press); });
  function release(e) { if (e.pointerId === ptr) { ptr = null; press = -1; } }
  stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);
  addEventListener('blur', () => { ptr = null; press = -1; });

  // ---- 出来事の見た目 ----
  function onEvents(evs) {
    for (const e of evs) {
      if (e.type === 'impact') {
        shakeAmp = Math.max(shakeAmp, e.hit ? 0.5 : 0.18);
        if (e.hit) { const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
        const p = holePos(e.hole, CFG); spawnPuffs(W, p.x, p.z, e.hit ? 8 : 6);
      } else if (e.type === 'whiff') {
        if (e.close >= 0.7) pop(e.label + '<small>+' + e.pts + '</small>', 'great');
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
          hold = 0.14; kick = 1; shakeAmp = Math.max(shakeAmp, 0.7); W.pulse = 1;
          const sf = $('sflash'); sf.style.setProperty('--sc', ['#74c0fc', '#ffd43b', '#ff922b', '#ff6b6b', '#e64980'][e.stage]); sf.classList.remove('on'); void sf.offsetWidth; sf.classList.add('on');
          const nm = CFG.stages[e.stage].name; setTimeout(() => { if (state === 'play') pop(nm + '！', 'rage', 'stage'); }, 650);
        }
      } else if (e.type === 'bump') {
        pop('ピコッ！', 'bad');
      } else if (e.type === 'end') endGame();
    }
  }

  // ---- メインループ ----
  let last = performance.now(), simT = 0;
  function frame(nowMs) {
    const dt = Math.min(0.05, (nowMs - last) / 1000); last = nowMs; simT += dt;
    if (state === 'play' && !freeze) { if (hold > 0) hold -= dt; else { onEvents(stepGame(g, dt, press, CFG)); refreshHud(); } }
    updateWorld(W, g, dt, simT);
    // 出ている間は一人称：出ている穴の、モグラの目の位置へカメラが降りる（押す位置の判定は俯瞰のカメラ基準のまま）
    const P = CFG.fps, mp = holePos(g.mole.hole, CFG);
    peek += ((state === 'play' ? clamp(g.mole.h, 0, 1) * P.amt : 0) - peek) * (1 - Math.exp(-dt * P.rate));
    camX += (mp.x - camX) * (1 - Math.exp(-dt * P.rate));
    shakeAmp = Math.max(0, shakeAmp - dt * 1.4);
    const eyeY = P.eyeBase + P.eyeK * g.mole.h;
    const sx = (Math.random() - 0.5) * shakeAmp, sy = (Math.random() - 0.5) * shakeAmp;
    tilt += ((state === 'play' && (g.human.phase === 'windup' || g.human.phase === 'strike') && g.human.target === g.mole.hole ? 1 : 0) - tilt) * (1 - Math.exp(-dt * P.tiltRate));
    const pitch = (P.pitch + P.windupPitch * tilt) * Math.PI / 180;
    camera.position.set(lerp(C.pos[0], camX, peek) + sx, lerp(C.pos[1], eyeY, peek) + sy, lerp(C.pos[2], mp.z + P.back, peek));
    camera.lookAt(lerp(C.look[0], camX * P.lookXk, peek), lerp(C.look[1], eyeY + P.lookDist * Math.tan(pitch), peek), lerp(C.look[2], mp.z - P.lookDist, peek));
    kick = Math.max(0, kick - dt * 3);
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
  requestAnimationFrame(frame);

  // 検証用の窓口（遊ぶのには使わない）
  window.__t = {
    start: startGame, state: () => state, game: () => g, holePts: () => holePts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
    setPress: h => { press = h; }, freeze: f => { freeze = f; }, scene, camera, W,
  };
})();
