// ===== 調整用の数値（遊んで直す） =====
// 穴は 3×3。行 0＝奥（人間に近い）、行 2＝手前（こちらに近い）。座標の単位はおもちゃの台の「メートルもどき」
const CFG = {
  duration: 60,           // 逃げきりまでの秒数
  maxBumps: 3,            // たんこぶがこの数で終わり
  holes: { dx: 1.8, dz: 2.1, z0: -2.1, r: 0.8 },   // 穴の間隔（横・奥行き）、いちばん奥の行の z、穴の半径
  mole: {
    rise: 7.5,            // 出る速さ（高さ 0〜1 を毎秒）
    fall: 9,              // 引っ込む速さ
    moveTime: 0.2,        // 別の穴へ地下を移る時間
    hitH: 0.3,            // この高さより上に出ていたら叩かれる
    exposeH: 0.5,         // この高さ以上で「顔を出している」＝人間に見つかる・点が入る
    flatH: 0.4,           // 叩かれてつぶれた高さ
    flatTime: 0.35,       // つぶれたままの時間
    stunTime: 0.9,        // 叩かれてから出られない時間
  },
  human: {
    firstWait: 1.6,       // 開始してから最初に狙うまでの待ち

    windup: 0.70,         // 振りかぶり（予告）の長さ
    strike: 0.12,         // 振り下ろしの長さ
    recoverMiss: 0.55,    // 空振り後に次を狙えるまで
    recoverHit: 1.0,      // 当てたあと
    idleWait: 0.15,       // 次を狙う前のひと呼吸
    minWindup: 0.45,      // 怒りで速くなっても、振りかぶりはこれ未満にしない（見てから避けられる下限）
    feintAt: 0.8,         // フェイントは振りかぶりのこの割合で止めて引く（ハンマーを上げきらない）
    recoverFeint: 0.35,   // フェイントのあと次を狙えるまで
    ambushWindup: 0.5,    // 待ち伏せ中に同じ穴から出たときの、素早い振りかぶり
    ambushReaction: 0.12, // 待ち伏せ中に気づくまで
    recoverAmbush: 0.25,  // 待ち伏せをあきらめたあと
  },
  // 怒り（0〜max）：空振りで上がる（ギリギリなほど大きく）、時間でさめる、叩くと少し下がる。段階は th 以上で上がり、点の倍率＝段階（×1〜×5）
  rage: { max: 100, whiffBase: 2, whiffNear: 15, decay: 3.2, hitDrop: 15 },
  stages: [
    { name: '平静', th: 0,  windupMul: 1.0,  feint: 0,    reach: 0, hammers: 1, scale: 1 },
    { name: 'むっ', th: 18, windupMul: 0.88, feint: 0,    reach: 0, hammers: 1, scale: 1 },
    { name: 'ムキ', th: 42, windupMul: 0.8,  feint: 0.18, reach: 0, hammers: 1, scale: 1.1 },
    { name: '激怒', th: 68, windupMul: 0.75, feint: 0.18, reach: 1, hammers: 1, scale: 1.7 },   // 巨大ハンマー：左右の隣の穴まで届く
    { name: '錯乱', th: 88, windupMul: 0.75, feint: 0.22, reach: 1, hammers: 2, scale: 1.7 },   // 2本同時
  ],
  // 叩く人 3人（毎回ランダムに 1人）。windupMul＝振りかぶりの長さの倍率、reaction＝気づくまで、stray＝隣を叩く率、feint＝フェイント率、ambush＝待ち伏せの秒数、rageUp/rageDown＝怒りの上がりやすさ・さめやすさ
  persons: [
    { id: 'kid',    name: 'せっかちな子ども',     windupMul: 0.62, reaction: 0.22, stray: 0.25, feint: 0,    ambush: 0,   rageUp: 1.3, rageDown: 1.5 },
    { id: 'uncle',  name: '負けず嫌いのおじさん', windupMul: 1.0,  reaction: 0.30, stray: 0,    feint: 0.22, ambush: 0,   rageUp: 1.0, rageDown: 0.55 },
    { id: 'granny', name: '正確なおばあちゃん',   windupMul: 1.1,  reaction: 0.30, stray: 0,    feint: 0,    ambush: 1.3, rageUp: 1.35, rageDown: 1.0 },
  ],
  score: {
    pps: 100,             // 顔を出している間の毎秒の点
    whiffBase: 50,        // 空振りさせたときの基本点
    whiffNear: 450,       // ギリギリなほど足される点（closeness の2乗で効く）
    nearWindow: 0.30,     // 人間が叩く直前、何秒以内に引っ込んだらギリギリとみなすか
    scoreH: 0.5,          // この高さ以上で点が入る
  },
  // カメラ：モグラの目の高さ。台の手前の端から奥の人間を見上げる／少し見下ろす
  cam: { pos: [0, 6.0, 7.2], look: [0, 2.4, -1.6], hfov: 48 },
  // タイミングバー（振りかぶりの間だけ出る補助）。zoneFrom＝ここから先で離すと「ギリギリ」（ギリギリ度の下限）、assist＝false で非表示
  assist: { bar: false, zoneNear: 0.35 },
  // モグラが出ている間は一人称視点：カメラがモグラの目の位置へ降りる（引っ込むと元の俯瞰）。amt＝0 で無効
  // eyeBase＋eyeK×高さ＝目の高さ、back＝穴の中心より後ろへ、pitch＝見上げる角度（度）、windupPitch＝振りかぶりのあいだ頭上のハンマーを見上げる分（度）、hideAt＝この寄り具合を超えたらモグラの体を隠す（鼻と手だけ残す）
  fps: { amt: 1, eyeBase: 0.08, eyeK: 0.92, back: 0.45, pitch: 11, lookDist: 10, lookXk: 0.25, rate: 9, hideAt: 0.35, fov: 84, windupPitch: 42, tiltRate: 6 },
};
