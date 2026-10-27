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
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), fur); ear.position.set(s * 0.44, 1.2, 0.04); g.add(ear);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), pink); inner.position.set(s * 0.44, 1.2, -0.08); g.add(inner);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), dark); eye.position.set(s * 0.24, 0.98, -0.53); g.add(eye);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), pink); hand.position.set(s * 0.52, 0.2, -0.5); hand.scale.set(1, 0.7, 1.2); g.add(hand);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), pink); nose.position.set(0, 0.82, -0.62); g.add(nose);
  // 叩かれたときの星
  const stars = new THREE.Group(); stars.position.y = 1.75;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), new THREE.MeshBasicMaterial({ color: 0xffd43b }));
    const a = i / 3 * Math.PI * 2; s.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55); stars.add(s);
  }
  stars.visible = false; g.add(stars);
  g.userData.stars = stars;
  return g;
}

function buildHammer() {
  const g = new THREE.Group();
  const wood = lm(0xc98b4b), red = lm(0xe03131), gold = lm(0xffd43b);
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

function buildHuman() {
  const g = new THREE.Group();
  const skin = lm(0xffd2a8), shirt = lm(0x3b82f6), white = lm(0xffffff), dark = lm(0x2a1a14), hair = lm(0x4a2c1a), cheek = lm(0xff9a9a), mouthM = lm(0x7a1f1f);
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
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.11, 0.12), hair); brow.position.set(s * 0.5, 0.58, 1.12); head.add(brow); brows.push(brow);
    const ck = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), cheek); ck.position.set(s * 0.82, -0.3, 0.86); ck.scale.set(1, 0.6, 0.4); head.add(ck);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skin); nose.position.set(0, -0.12, 1.27); head.add(nose);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 20, Math.PI), dark); smile.rotation.z = Math.PI; smile.position.set(0, -0.28, 1.14); head.add(smile);
  const open = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), mouthM); open.scale.set(1, 1.1, 0.4); open.position.set(0, -0.58, 1.14); head.add(open);
  g.add(torso, shoulders, neck, head);
  const armMat = shirt, armR = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), armMat), armL = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), armMat);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), skin), handL = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), skin);
  g.add(armR, armL, handR, handL);
  g.userData = { head, pupils, brows, smile, open, armR, armL, handR, handL };
  return g;
}

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
  const W = { holes: [], rims: [], moleG: null, human: null, hammer: null, shadow: null, pose: { x: 0, y: 2.2, z: -1.4, tilt: -0.3, s: 1 }, from: null, key: '', puffs: [], shakeReq: 0 };

  for (let i = 0; i < 9; i++) {
    const p = holePos(i, CFG);
    const rim = new THREE.Mesh(new THREE.RingGeometry(CFG.holes.r, CFG.holes.r + 0.2, 32), new THREE.MeshBasicMaterial({ color: 0xffd43b }));
    rim.rotation.x = -Math.PI / 2; rim.position.set(p.x, 0.012, p.z); scene.add(rim);
    W.rims.push(rim); W.holes.push(p);
  }

  W.moleG = buildMole(); scene.add(W.moleG);
  W.human = buildHuman(); W.human.position.set(0, 0, -5.3); scene.add(W.human);
  W.hammer = buildHammer(); scene.add(W.hammer);
  W.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
  W.shadow.rotation.x = -Math.PI / 2; W.shadow.position.y = 0.03; scene.add(W.shadow);
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
  if (kind === 'raised') return { x: p.x, y: 3.7, z: p.z - 0.5, tilt: -0.75 };
  return { x: p.x, y: 0.0, z: p.z, tilt: 0.12 };            // strike
}
const mixPose = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), tilt: lerp(a.tilt, b.tilt, t) });

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

// ゲームの状態を 3D に反映する
function updateWorld(W, g, dt, now) {
  const m = g.mole, hu = g.human;

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

  // --- ハンマー ---
  const key = hu.seq;
  if (key !== W.key) { W.key = key; W.from = { x: W.pose.x, y: W.pose.y, z: W.pose.z, tilt: W.pose.tilt }; }
  const rest = hammerGoal('rest'), raised = hu.target >= 0 ? hammerGoal('raised', hu.target) : rest, hitP = hu.target >= 0 ? hammerGoal('strike', hu.target) : rest;
  let pose;
  if (hu.phase === 'windup') {
    const u = clamp(hu.t / CFG.human.windup, 0, 1);
    pose = mixPose(W.from, raised, easeOut(clamp(u / 0.7, 0, 1)));
    if (u > 0.7) { pose.x += Math.sin(now * 55) * 0.06 * (u - 0.7) / 0.3; pose.y += Math.sin(now * 40) * 0.05; }
  } else if (hu.phase === 'strike') {
    const u = clamp(hu.t / CFG.human.strike, 0, 1);
    pose = mixPose(raised, hitP, u * u);
  } else if (hu.phase === 'recover') {
    const u = clamp(hu.t / hu.recover, 0, 1);
    pose = mixPose(hitP, rest, easeOut(clamp((u - 0.35) / 0.65, 0, 1)));
  } else {
    pose = mixPose(W.pose, rest, 1 - Math.exp(-dt * 7));
  }
  W.pose = pose;
  const hm = W.hammer; hm.position.set(pose.x, pose.y, pose.z); hm.rotation.x = pose.tilt;

  // 影と縁（予告）
  const warn = hu.phase === 'windup' || hu.phase === 'strike';
  for (let i = 0; i < 9; i++) W.rims[i].material.color.setHex(warn && i === hu.target ? (Math.floor(now * 14) % 2 ? 0xff3b30 : 0xffd43b) : 0xffd43b);
  if (warn) {
    const tp = holePos(hu.target, CFG), u = hu.phase === 'windup' ? clamp(hu.t / CFG.human.windup, 0, 1) : 1;
    W.shadow.position.set(tp.x, 0.03, tp.z);
    W.shadow.scale.setScalar(lerp(0.5, 1.15, u));
    W.shadow.material.opacity = lerp(0.1, 0.5, u);
  } else W.shadow.material.opacity = Math.max(0, W.shadow.material.opacity - dt * 3);

  // --- 人間 ---
  const U = W.human.userData, headW = U.head;
  const grip = _v1.set(pose.x, pose.y + 2.1 * Math.cos(pose.tilt), pose.z + 2.1 * Math.sin(pose.tilt));
  const humanPos = W.human.position;
  const shR = _v2.set(humanPos.x + 1.65, 2.8, humanPos.z + 0.1);
  stretch(U.armR, shR, grip, 0.3); U.handR.position.copy(grip);
  // 右腕は世界座標で張るので、人間グループの変換を打ち消さないよう位置を直接置く（人間は回転・拡大しない）
  U.armR.position.sub(humanPos); U.handR.position.sub(humanPos);
  const shL = new THREE.Vector3(-1.65, 2.8, 0.1), handLp = new THREE.Vector3(-2.0, 0.6, 1.5);
  stretch(U.armL, shL, handLp, 0.3); U.handL.position.copy(handLp);

  // 表情
  const mood = hu.mood;
  U.smile.visible = mood === 'calm' || mood === 'aim' || mood === 'happy';
  U.open.visible = mood === 'miss';
  U.smile.scale.setScalar(mood === 'happy' ? 1.35 : mood === 'aim' ? 0.7 : 1);
  U.smile.position.y = mood === 'aim' ? -0.42 : -0.28;
  const browTilt = mood === 'aim' ? 0.45 : mood === 'miss' ? -0.35 : mood === 'happy' ? -0.15 : 0;
  U.brows[0].rotation.z = -browTilt; U.brows[1].rotation.z = browTilt;
  U.brows[0].position.y = U.brows[1].position.y = mood === 'miss' ? 0.72 : 0.58;
  // 視線：狙う穴のほうを見る
  const gz = hu.target >= 0 && (hu.phase === 'windup' || hu.phase === 'strike') ? holePos(hu.target, CFG) : { x: 0, z: 0 };
  U.pupils[0].position.x = -0.46 + clamp(gz.x * 0.06, -0.1, 0.1); U.pupils[1].position.x = 0.46 + clamp(gz.x * 0.06, -0.1, 0.1);
  U.pupils[0].position.y = U.pupils[1].position.y = 0.14 - (warn ? 0.07 : 0);
  // 体の動き：振りかぶりで少し反る、空振りで首をふる、当てたら弾む
  let lean = 0, shake = 0, bob = 0;
  if (hu.phase === 'windup') lean = -0.12 * clamp(hu.t / CFG.human.windup, 0, 1);
  else if (hu.phase === 'strike') lean = 0.2;
  else if (hu.phase === 'recover' && hu.mood === 'miss') shake = Math.sin(hu.t * 28) * 0.18 * (1 - hu.t / hu.recover);
  else if (hu.phase === 'recover' && hu.mood === 'happy') bob = Math.abs(Math.sin(hu.t * 12)) * 0.25;
  headW.rotation.x = lean * 0.6; headW.rotation.y = shake; headW.position.y = 4.2 + bob;

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
