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
  let shakeAmp = 0, peek = 0, camX = 0;
  const holePts = Array.from({ length: 9 }, () => ({ x: 0, y: 0 }));

  function fit() {
    const w = view.clientWidth, h = view.clientHeight;
    renderer.setSize(w, h);
    document.documentElement.style.setProperty('--u', stage.clientWidth / 100 + 'px');
    camera.aspect = w / h;
    const hf = C.hfov * Math.PI / 180;                       // 横の画角を一定にして縦の画角を決める（細い画面でも台が収まる）
    camera.fov = 2 * Math.atan(Math.tan(hf / 2) / camera.aspect) * 180 / Math.PI;
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
  let state = 'title', g = newGame(CFG), press = -1, ptr = null, freeze = false;
  const hud = $('hud'), hint = $('hint');

  function refreshHud() {
    $('score').textContent = Math.floor(g.score);
    const left = Math.max(0, Math.ceil(CFG.duration - g.t));
    $('time').textContent = left; $('timeBox').classList.toggle('low', left <= 10);
    for (let i = 0; i < 3; i++) $('lump' + i).classList.toggle('on', i < g.bumps);
    $('titleBest').textContent = best;
  }
  function pop(html, cls) {
    const d = document.createElement('div'); d.className = 'pop ' + cls; d.innerHTML = html;
    $('pops').appendChild(d); setTimeout(() => d.remove(), 1150);
  }
  function show(id, on) { $(id).classList.toggle('on', on); }

  function startGame() {
    g = newGame(CFG); press = -1; state = 'play';
    show('titleScr', false); show('overScr', false); hud.classList.add('on');
    hint.classList.add('on'); setTimeout(() => hint.classList.remove('on'), 4200);
    refreshHud();
  }
  function endGame() {
    state = 'over'; press = -1; hud.classList.remove('on'); hint.classList.remove('on');
    const score = Math.floor(g.score), isNew = score > best;
    if (isNew) { best = score; saveBest(); }
    $('overTitle').textContent = g.reason === 'escaped' ? '逃げきり！' : '叩かれた…';
    $('overScore').textContent = score;
    $('overNew').classList.toggle('on', isNew);
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
        shakeAmp = Math.max(shakeAmp, e.hit ? 0.28 : 0.12);
        const p = holePos(e.hole, CFG); spawnPuffs(W, p.x, p.z, e.hit ? 8 : 6);
      } else if (e.type === 'whiff') {
        if (e.close >= 0.7) pop(e.label + '<small>+' + e.pts + '</small>', 'great');
        else if (e.close >= 0.35) pop(e.label + '<small>+' + e.pts + '</small>', 'near');
        else pop(e.label + '<small>+' + e.pts + '</small>', 'miss');
        $('scoreBox').classList.remove('bump'); void $('scoreBox').offsetWidth; $('scoreBox').classList.add('bump');
      } else if (e.type === 'bump') {
        pop('ピコッ！', 'bad');
      } else if (e.type === 'end') endGame();
    }
  }

  // ---- メインループ ----
  let last = performance.now(), simT = 0;
  function frame(nowMs) {
    const dt = Math.min(0.05, (nowMs - last) / 1000); last = nowMs; simT += dt;
    if (state === 'play' && !freeze) { onEvents(stepGame(g, dt, press, CFG)); refreshHud(); }
    updateWorld(W, g, dt, simT);
    // 出ている間は、出ている穴の真後ろへカメラが寄る（押す位置の判定は寄る前のカメラ基準のまま）
    const P = CFG.peek, mp = holePos(g.mole.hole, CFG);
    peek += ((state === 'play' ? clamp(g.mole.h, 0, 1) * P.amt : 0) - peek) * (1 - Math.exp(-dt * P.rate));
    camX += (mp.x - camX) * (1 - Math.exp(-dt * P.rate));
    shakeAmp = Math.max(0, shakeAmp - dt * 1.4);
    camera.position.set(lerp(C.pos[0], camX * P.xk, peek) + (Math.random() - 0.5) * shakeAmp, lerp(C.pos[1], P.y, peek) + (Math.random() - 0.5) * shakeAmp, lerp(C.pos[2], mp.z * P.zk + P.back, peek));
    camera.lookAt(lerp(C.look[0], camX * P.lookXk, peek), lerp(C.look[1], P.lookY, peek), lerp(C.look[2], P.lookZ, peek));
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
