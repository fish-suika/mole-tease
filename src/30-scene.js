// ===== 3D の世界：モグラ叩き台・モグラ・人間・ハンマー =====
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);

function lm(color, extra) { return new THREE.MeshLambertMaterial(Object.assign({ color }, extra)); }

function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 4;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#6a4a94' : '#5a3d82'; g.fillRect(i * 16, 0, 16, 4); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(1, 1); return t;
}

// 台：穴の開いた押し出し形。上面は赤いプラスチック、穴の内側は暗い
function buildTable() {
  const HW = 3.9, HD = 4.0, DEPTH = 3.4, R = CFG.holes.r;
  const shape = new THREE.Shape();
  shape.moveTo(-HW, -HD); shape.lineTo(HW, -HD); shape.lineTo(HW, HD); shape.lineTo(-HW, HD); shape.lineTo(-HW, -HD);
  for (let i = 0; i < 9; i++) {
    const p = holePos(i, CFG), hole = new THREE.Path();
    hole.absarc(p.x, -p.z, R, 0, Math.PI * 2, true); shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, -DEPTH, 0);
  const top = new THREE.MeshPhongMaterial({ color: 0xe8453c, shininess: 70, specular: 0x886666 });
  const side = new THREE.MeshLambertMaterial({ color: 0x2a1a22 });
  const mesh = new THREE.Mesh(geo, [top, side]);
  return mesh;
}

function buildMole() {
  const g = new THREE.Group();
  const fur = lm(0x8a5a3c), dark = lm(0x2a1a14), pink = lm(0xf4a6b0);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 18), fur); body.scale.set(1, 1.2, 1); body.position.y = 0.62;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.5, 24), fur); tube.position.y = -0.13;
  g.add(body, tube);
  const shell = [body, tube];   // 一人称のとき隠す部分（鼻と手は残す）
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), fur); ear.position.set(s * 0.44, 1.2, 0.04); g.add(ear); shell.push(ear);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), pink); inner.position.set(s * 0.44, 1.2, -0.08); g.add(inner); shell.push(inner);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), dark); eye.position.set(s * 0.24, 0.98, -0.53); g.add(eye); shell.push(eye);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), pink); hand.position.set(s * 0.4, 0.66, -0.52); hand.scale.set(1, 0.7, 1.2); g.add(hand); shell.push(hand);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), pink); nose.position.set(0, 0.8, -0.64); g.add(nose); shell.push(nose);
  // 叩かれたときの星
  const stars = new THREE.Group(); stars.position.y = 1.75;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), new THREE.MeshBasicMaterial({ color: 0xffd43b }));
    const a = i / 3 * Math.PI * 2; s.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55); stars.add(s);
  }
  stars.visible = false; g.add(stars);
  g.userData.stars = stars; g.userData.shell = shell;
  return g;
}

function buildHammer() {
  const g = new THREE.Group();
  const wood = lm(0xc98b4b), red = lm(0xe03131), gold = lm(0xffd43b);
  g.userData.mats = { head: red, band: gold, handle: wood };
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.9, 24), red); head.rotation.z = Math.PI / 2; head.position.y = 0.62;
  g.add(head);
  for (const s of [-1, 1]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.14, 24), gold); band.rotation.z = Math.PI / 2; band.position.set(s * 0.8, 0.62, 0); g.add(band); }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 2.6, 12), wood); handle.position.y = 2.0; g.add(handle);
  return g;
}

// 伸びるゴムの腕：from から to まで円柱を張る
function stretch(mesh, a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.scale.set(r, Math.max(len, 0.01), r);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}

// 叩く人 3人の見た目（骨組みは共通、色・小物・大きさだけ差し替え）
const LOOK = {
  kid:    { shirt: 0xf08c00, hair: 0xc92a2a, scale: 0.86, skin: 0xffd2a8, hammer: { head: 0xffd43b, band: 0xff6b6b, handle: 0xff922b, size: 0.72 } },   // 小さな黄色いおもちゃのハンマー
  uncle:  { shirt: 0x4c6ef5, hair: 0x2b2b2b, scale: 1.0,  skin: 0xf3c29a, hammer: { head: 0xe03131, band: 0xffd43b, handle: 0xc98b4b, size: 1.0 } },
  granny: { shirt: 0xe599f7, hair: 0xced4da, scale: 0.94, skin: 0xffdcc0, hammer: { head: 0x8d5a2b, band: 0x4a2f14, handle: 0x6b4423, size: 1.2 } },   // 大きな木づち
};
const SKIN_RAGE = new THREE.Color(0xff5a4a);

function buildHuman(id) {
  const L = LOOK[id], g = new THREE.Group(), body = new THREE.Group();   // body＝大きさを変える部分（腕は世界座標で張るので別）
  g.add(body);
  const skin = lm(L.skin), shirt = lm(L.shirt), white = lm(0xffffff), dark = lm(0x2a1a14), hair = lm(L.hair), cheek = lm(0xff9a9a), mouthM = lm(0x7a1f1f);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.45, 4.0, 24), shirt); torso.position.y = 0.9;
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1.2, 24, 16), shirt); shoulders.position.y = 2.9; shoulders.scale.set(1.25, 0.55, 0.9);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.6, 12), skin); neck.position.y = 3.2;
  const head = new THREE.Group(); head.position.y = 4.2;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.25, 28, 20), skin); head.add(skull);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.29, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), hair); cap.position.y = 0.05; head.add(cap);
  const eyes = [], pupils = [], brows = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), white); eye.position.set(s * 0.46, 0.14, 1.0); eye.scale.set(1, 1.15, 0.7); head.add(eye); eyes.push(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), dark); pupil.position.set(s * 0.46, 0.14, 1.2); head.add(pupil); pupils.push(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.11, 0.12), id === 'granny' ? lm(0x868e96) : hair); brow.position.set(s * 0.5, 0.58, 1.12); head.add(brow); brows.push(brow);
    const ck = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), cheek); ck.position.set(s * 0.82, -0.3, 0.86); ck.scale.set(1, 0.6, 0.4); head.add(ck);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skin); nose.position.set(0, -0.12, 1.27); head.add(nose);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 20, Math.PI), dark); smile.rotation.z = Math.PI; smile.position.set(0, -0.28, 1.14); head.add(smile);
  const open = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), mouthM); open.scale.set(1, 1.1, 0.4); open.position.set(0, -0.58, 1.14); head.add(open);
  const steam = new THREE.Group();                                   // 激怒以上の湯気（頭の両わき）
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    p.userData = { s, k }; steam.add(p);
  }
  steam.visible = false; head.add(steam);

  // 小物（ひと目で分かる印）
  if (id === 'kid') {                                                 // 赤い帽子（つば）
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 24, 1, false, -Math.PI * 0.55, Math.PI * 1.1), hair); brim.position.set(0, 0.55, 0.85); brim.rotation.x = 0.1; head.add(brim);
  } else if (id === 'uncle') {                                        // メガネとネクタイ
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 20), dark); r.position.set(s * 0.46, 0.14, 1.2); head.add(r); }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), dark); bridge.position.set(0, 0.16, 1.22); head.add(bridge);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.7, 0.1), lm(0xe03131)); tie.position.set(0, 1.95, 1.2); body.add(tie);
  } else {                                                            // 丸メガネ・おだんご・割烹着
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 8, 20), lm(0x868e96)); r.position.set(s * 0.46, 0.14, 1.2); head.add(r); }
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), hair); bun.position.set(0, 1.4, -0.2); head.add(bun);
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 3.0, 20, 1, false, -Math.PI * 0.5, Math.PI), lm(0xffffff)); apron.position.set(0, 1.1, 0.35); apron.scale.set(1.02, 1, 1.0); body.add(apron);
  }

  body.add(torso, shoulders, neck, head);
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), shirt), armL = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), shirt);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), skin), handL = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), skin);
  const handR2 = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), skin), armR2 = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), shirt);   // 2本目のハンマーを持つ手（錯乱）
  armR2.visible = handR2.visible = false;
  g.add(armR, armL, handR, handL, armR2, handR2);
  g.userData = { id, head, pupils, brows, smile, open, steam, armR, armL, handR, handL, armR2, handR2, skin, cheek, baseSkin: new THREE.Color(L.skin) };
  body.scale.setScalar(L.scale); g.userData.hs = L.scale;
  return g;
}

function applyHammerLook(h, look) { const m = h.userData.mats; m.head.color.setHex(look.head); m.band.color.setHex(look.band); m.handle.color.setHex(look.handle); }

// 世界を作って返す
function createWorld(scene) {
  scene.background = new THREE.Color(0x4a2f6b);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a88, 0.95));
  const sun = new THREE.DirectionalLight(0xfff0dd, 0.75); sun.position.set(3, 9, 7); scene.add(sun);

  // 奥の壁（縞）と床
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 18), new THREE.MeshBasicMaterial({ map: stripeTexture() }));
  wall.position.set(0, 7, -12); scene.add(wall);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), lm(0x2b1d3f)); floor.rotation.x = -Math.PI / 2; floor.position.y = -3.4; scene.add(floor);

  scene.add(buildTable());
  const W = { holes: [], rims: [], moleG: null, humans: {}, human: null, hammer: null, hammer2: null, shadow: null, shadow2: null, pose: { x: 0, y: 2.2, z: -1.4, tilt: -0.3, s: 1 }, from: null, key: -1, puffs: [], fpsView: false };

  for (let i = 0; i < 9; i++) {
    const p = holePos(i, CFG);
    const rim = new THREE.Mesh(new THREE.RingGeometry(CFG.holes.r, CFG.holes.r + 0.2, 32), new THREE.MeshBasicMaterial({ color: 0xffd43b }));
    rim.rotation.x = -Math.PI / 2; rim.position.set(p.x, 0.012, p.z); scene.add(rim);
    W.rims.push(rim); W.holes.push(p);
  }

  W.moleG = buildMole(); scene.add(W.moleG);
  for (const id of ['kid', 'uncle', 'granny']) { const h = buildHuman(id); h.position.set(0, 0, -5.3); h.visible = false; scene.add(h); W.humans[id] = h; }
  W.hammer = buildHammer(); scene.add(W.hammer);
  W.hammer2 = buildHammer(); W.hammer2.visible = false; scene.add(W.hammer2);
  const mkShadow = () => { const s = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false })); s.rotation.x = -Math.PI / 2; s.position.y = 0.03; scene.add(s); return s; };
  W.shadow = mkShadow(); W.shadow2 = mkShadow();
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf1e3c8, transparent: true, opacity: 0 }));
    m.visible = false; scene.add(m); W.puffs.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  return W;
}

function spawnPuffs(W, x, z, n) {
  let k = 0;
  for (const p of W.puffs) {
    if (p.life > 0 || k >= n) continue;
    const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 1.6;
    p.life = 0.5 + Math.random() * 0.25; p.max = p.life;
    p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 1.4 + Math.random() * 1.2;
    p.mesh.position.set(x, 0.2, z); p.mesh.visible = true; k++;
  }
}

// 狙う穴とフェーズからハンマーの姿勢（足元＝頭の底の中心）を決める
function hammerGoal(kind, target) {
  if (kind === 'rest') return { x: 2.3, y: 1.3, z: -3.3, tilt: -0.25 };
  const p = holePos(target, CFG);
  if (kind === 'raised') return { x: p.x, y: 5.6, z: p.z - 0.5, tilt: -0.85 };
  if (kind === 'hover') return { x: p.x, y: 2.7, z: p.z - 0.4, tilt: -0.5 };           // 待ち伏せ：穴の上で構えて待つ
  return { x: p.x, y: 0.0, z: p.z - 0.35, tilt: 0.12 };            // strike
}
const mixPose = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), tilt: lerp(a.tilt, b.tilt, t) });

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();

// 2本目のハンマー（錯乱）。1本目と同じ時間割で、前のポーズからの滑らかさは省く
function pose2For(hu) {
  const rest = hammerGoal('rest'), raised = hammerGoal('raised', hu.target2), hitP = hammerGoal('strike', hu.target2);
  if (hu.phase === 'windup') { const u = clamp(hu.t / hu.dur, 0, 1); return mixPose(rest, raised, easeOut(clamp(u / 0.7, 0, 1))); }
  if (hu.phase === 'strike') { const u = clamp(hu.t / CFG.human.strike, 0, 1); return mixPose(raised, hitP, u * u); }
  if (hu.phase === 'recover') { const u = clamp(hu.t / hu.recover, 0, 1); return mixPose(hitP, rest, easeOut(clamp((u - 0.35) / 0.65, 0, 1))); }
  return rest;
}

// 手とハンマーをつなぐ（ゴムの腕）。base＝肩の位置
function reach(U, arm, hand, base, pose, scale, r) {
  const grip = _v1.set(pose.x, pose.y + 2.1 * scale * Math.cos(pose.tilt), pose.z + 2.1 * scale * Math.sin(pose.tilt));
  stretch(arm, base, grip, r); hand.position.copy(grip);
}

// ゲームの状態を 3D に反映する
function updateWorld(W, g, dt, now) {
  const m = g.mole, hu = g.human, S = CFG.stages[g.stage];

  // --- 今回の人だけ見せる ---
  const H = W.humans[g.person.id];
  if (W.human !== H) { if (W.human) W.human.visible = false; W.human = H; H.visible = true; W.key = -1; applyHammerLook(W.hammer, LOOK[g.person.id].hammer); applyHammerLook(W.hammer2, LOOK[g.person.id].hammer); }
  const hsz = LOOK[g.person.id].hammer.size;
  const U = H.userData, hs = U.hs;

  // --- モグラ ---
  const mp = holePos(m.hole, CFG);
  const mg = W.moleG;
  mg.position.set(mp.x, -2.15 + 2.15 * m.h, mp.z);
  mg.visible = m.h > 0.01;
  const flat = m.stun > CFG.mole.stunTime - CFG.mole.flatTime;
  mg.scale.set(flat ? 1.25 : 1, flat ? 0.6 : 1, flat ? 1.25 : 1);
  mg.rotation.z = m.stun > 0 ? Math.sin(now * 30) * 0.12 : Math.sin(now * 9) * 0.04 * m.h;
  const stars = mg.userData.stars;
  stars.visible = m.stun > 0; stars.rotation.y = now * 9;
  stars.position.y = 1.75 + 0.15 * Math.sin(now * 12);
  if (m.stun > 0) mg.visible = true;
  for (const part of mg.userData.shell) part.visible = !W.fpsView;

  // --- ハンマー（1本目） ---
  if (hu.seq !== W.key) { W.key = hu.seq; W.from = { x: W.pose.x, y: W.pose.y, z: W.pose.z, tilt: W.pose.tilt }; }
  const rest = hammerGoal('rest'), tg = hu.target >= 0 ? hu.target : 4;
  let raised = hammerGoal('raised', tg); const hitP = hammerGoal('strike', tg), hover = hammerGoal('hover', tg);
  if (hu.feint) raised = { x: raised.x, y: lerp(rest.y, raised.y, 0.62), z: raised.z, tilt: lerp(rest.tilt, raised.tilt, 0.62) };   // フェイントは上げきらない（見分けるヒント）
  let pose;
  if (hu.phase === 'windup') {
    const u = clamp(hu.t / hu.dur, 0, 1);
    pose = mixPose(W.from, raised, easeOut(clamp(u / 0.7, 0, 1)));
    if (u > 0.7) { pose.x += Math.sin(now * 55) * 0.06 * (u - 0.7) / 0.3; pose.y += Math.sin(now * 40) * 0.05; }
    if (hu.strayed) pose.x += Math.sin(now * 13) * 0.5 * easeOut(clamp(u / 0.7, 0, 1));   // 雑：狙いがふらふら揺れる
  } else if (hu.phase === 'strike') {
    const u = clamp(hu.t / CFG.human.strike, 0, 1);
    pose = mixPose(raised, hitP, u * u);
  } else if (hu.phase === 'ambush') {
    pose = mixPose(W.from, hover, easeOut(clamp(hu.t / 0.25, 0, 1)));
    pose.y += Math.sin(now * 9) * 0.06;
  } else if (hu.phase === 'recover') {
    const u = clamp(hu.t / hu.recover, 0, 1);
    if (hu.mood === 'happy' || hu.mood === 'miss' || hu.mood === 'confuse') pose = mixPose(hitP, rest, easeOut(clamp((u - 0.35) / 0.65, 0, 1)));
    else if (hu.mood === 'feint') {   // 途中まで振り下ろして空中でぴたっと止め、にやり。そのあと引く（「わざと」と分かる動き）
      const fake = mixPose(W.from, hitP, 0.28);
      pose = u < 0.3 ? mixPose(W.from, fake, Math.sqrt(u / 0.3)) : u < 0.65 ? { x: fake.x + Math.sin(now * 40) * 0.05, y: fake.y + Math.sin(now * 34) * 0.04, z: fake.z, tilt: fake.tilt } : mixPose(fake, rest, easeOut((u - 0.65) / 0.35));
    } else pose = mixPose(W.from, rest, easeOut(u));
  } else {
    pose = mixPose(W.pose, rest, 1 - Math.exp(-dt * 7));
  }
  W.pose = pose;
  W.scaleS = lerp(W.scaleS || 1, hu.phase === 'windup' || hu.phase === 'strike' ? CFG.stages[hu.stage].scale : S.scale, 1 - Math.exp(-dt * 9));
  const sc = W.scaleS * hsz;   // 段階の大きさ × 人ごとのハンマーの大きさ
  const hm = W.hammer; hm.scale.setScalar(sc); hm.position.set(pose.x, pose.y, pose.z); hm.rotation.x = pose.tilt;

  // --- ハンマー（2本目：錯乱） ---
  const two = hu.target2 >= 0 && (hu.phase === 'windup' || hu.phase === 'strike' || hu.phase === 'recover');
  W.hammer2.visible = two; U.armR2.visible = U.handR2.visible = two;
  let pose2 = null;
  if (two) {
    pose2 = pose2For(hu);
    const h2 = W.hammer2; h2.scale.setScalar(CFG.stages[hu.stage].scale * hsz); h2.position.set(pose2.x, pose2.y, pose2.z); h2.rotation.x = pose2.tilt;
  }

  // 影と縁（予告）
  const warn = hu.phase === 'windup' || hu.phase === 'strike';
  for (let i = 0; i < 9; i++) {
    const hot = warn && (i === hu.target || i === hu.target2) && !hu.feint;
    W.rims[i].material.color.setHex(hot ? (Math.floor(now * 14) % 2 ? 0xff3b30 : 0xffd43b) : 0xffd43b);
  }
  const shade = (sh, target, on, u, scale) => {
    if (on) { const tp = holePos(target, CFG); sh.position.set(tp.x, 0.03, tp.z); sh.scale.setScalar(lerp(0.5, 1.15, u) * scale); sh.material.opacity = lerp(0.1, 0.5, u); }
    else sh.material.opacity = Math.max(0, sh.material.opacity - dt * 3);
  };
  const wu = hu.phase === 'windup' ? clamp(hu.t / hu.dur, 0, 1) : 1;
  shade(W.shadow, hu.target, warn, wu, sc);
  shade(W.shadow2, hu.target2, warn && hu.target2 >= 0, wu, CFG.stages[hu.stage].scale * hsz);

  // --- 人間（腕・表情・怒り） ---
  const humanPos = H.position;
  const shR = _v2.set(humanPos.x + 1.65 * hs, 2.8 * hs, humanPos.z + 0.1 * hs);
  reach(U, U.armR, U.handR, shR, pose, sc, 0.3);
  U.armR.position.sub(humanPos); U.handR.position.sub(humanPos);
  if (two) {
    const shR2 = _v3.set(humanPos.x - 1.65 * hs, 2.8 * hs, humanPos.z + 0.1 * hs);
    reach(U, U.armR2, U.handR2, shR2, pose2, CFG.stages[hu.stage].scale * hsz, 0.3);
    U.armR2.position.sub(humanPos); U.handR2.position.sub(humanPos);
  }
  const shL = _v4.set(-1.65 * hs, 2.8 * hs, 0.1 * hs), handLp = new THREE.Vector3(-2.0, 0.6, 1.5);
  stretch(U.armL, shL, handLp, 0.3); U.handL.position.copy(handLp);
  if (two) { U.armL.visible = U.handL.visible = false; } else { U.armL.visible = U.handL.visible = true; }

  // 顔色：怒りが上がるほど赤くなる
  const red = clamp(g.rage / 85, 0, 1);
  U.skin.color.copy(U.baseSkin).lerp(SKIN_RAGE, red);

  // 表情（文字なし。顔と動きだけ）
  const sg = g.stage;
  let mood = hu.mood; if (mood === 'calm' && sg >= 3) mood = 'rage';
  U.smile.visible = mood === 'calm' || mood === 'aim' || mood === 'happy' || mood === 'feint';
  U.open.visible = mood === 'miss' || mood === 'rage' || mood === 'confuse';
  U.smile.scale.setScalar(mood === 'happy' || mood === 'feint' ? 1.35 : mood === 'aim' ? 0.7 : 1);
  U.smile.position.y = mood === 'aim' ? -0.42 : -0.28;
  const browTilt = mood === 'aim' ? 0.45 + sg * 0.06 : mood === 'miss' ? -0.35 : mood === 'confuse' ? -0.25 : mood === 'happy' ? -0.15 : mood === 'rage' ? 0.6 : mood === 'feint' ? 0.3 : sg * 0.08;
  U.brows[0].rotation.z = -browTilt; U.brows[1].rotation.z = browTilt;
  U.brows[0].position.y = U.brows[1].position.y = mood === 'miss' ? 0.72 : 0.58;
  const gz = hu.target >= 0 && (hu.phase === 'windup' || hu.phase === 'strike') ? holePos(hu.target, CFG) : { x: 0, z: 0 };
  const swirl = sg >= 4 ? Math.sin(now * 22) * 0.1 : 0;
  const away = mood === 'confuse' ? 0.1 : 0;
  U.pupils[0].position.x = -0.46 + away + clamp(gz.x * 0.06, -0.1, 0.1) + swirl; U.pupils[1].position.x = 0.46 + away + clamp(gz.x * 0.06, -0.1, 0.1) + swirl;
  U.pupils[0].position.y = U.pupils[1].position.y = 0.14 - (warn ? 0.07 : 0) + (sg >= 4 ? Math.cos(now * 22) * 0.08 : 0);
  // 体の動き：振りかぶりで反る、空振りで首をふる、当てたら弾む、フェイントで肩をゆらす、激怒で台をバンバン
  let lean = 0, shake = 0, bob = 0;
  if (hu.phase === 'windup') lean = -0.12 * clamp(hu.t / hu.dur, 0, 1);
  else if (hu.phase === 'strike') lean = 0.2;
  else if (hu.phase === 'recover' && hu.mood === 'miss') shake = Math.sin(hu.t * 28) * 0.18 * (1 - hu.t / hu.recover);
  else if (hu.phase === 'recover' && hu.mood === 'happy') bob = Math.abs(Math.sin(hu.t * 12)) * 0.25;
  else if (hu.phase === 'recover' && hu.mood === 'feint') bob = Math.abs(Math.sin(hu.t * 16)) * 0.12;
  if (sg >= 3 && hu.phase === 'idle') bob += Math.abs(Math.sin(now * 14)) * 0.14;
  if (U.id === 'kid' && (hu.phase === 'idle' || hu.phase === 'recover' && hu.mood !== 'happy')) { bob += Math.abs(Math.sin(now * 11)) * 0.22; shake += Math.sin(now * 7) * 0.16; }   // せっかち：じっとしていない
  if (sg >= 4) shake += Math.sin(now * 40) * 0.08;
  U.head.rotation.z = mood === 'confuse' ? 0.3 : mood === 'feint' ? Math.sin(now * 9) * 0.14 : 0;   // ぽかんと首をかしげる／にやりとゆらす
  U.head.rotation.x = lean * 0.6; U.head.rotation.y = shake; U.head.position.y = 4.2 + bob;
  // 湯気
  U.steam.visible = sg >= 3;
  if (U.steam.visible) U.steam.children.forEach(p => { const { s, k } = p.userData, ph = (now * 1.4 + k * 0.5) % 1; p.position.set(s * (1.3 + ph * 0.3), 0.2 + ph * 1.6, 0.3); p.scale.setScalar(0.5 + ph * 0.9); p.material.opacity = 0.7 * (1 - ph); });

  // --- 土ぼこり ---
  for (const p of W.puffs) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    const t = 1 - p.life / p.max;
    p.mesh.position.x += p.vx * dt; p.mesh.position.z += p.vz * dt; p.vy -= 5 * dt; p.mesh.position.y = Math.max(0.1, p.mesh.position.y + p.vy * dt);
    p.mesh.scale.setScalar(0.6 + t * 1.4); p.mesh.material.opacity = 0.75 * (1 - t);
  }
}
