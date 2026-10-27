// ===== Phase 3・4：開始・退場の時間割と X 共有 =====
(() => {
  const I0 = introState(0), I1 = introState(INTRO_DUR), Im = introState(1.0);
  check('開始：人間は画面の外（左）から歩いてきて、最後は中央にいる', I0.x <= -8.9 && near(I1.x, 0, 1e-9) && introState(0.9).x < introState(1.5).x);
  check('開始：人間は歩いている間だけ walking', introState(0.1).walking === false && introState(1.0).walking === true && introState(2.0).walking === false);
  check('開始：モグラは地下（0）から顔を出して 0.9 で止まる', I0.moleH === 0 && near(I1.moleH, 0.9, 1e-9) && introState(0.4).moleH > 0 && introState(0.4).moleH < 0.9);
  check('開始：コインは歩き終わってから飛ぶ（1.7〜2.3 秒）', introState(1.6).coinU === -1 && introState(2.0).coinU > 0 && introState(2.0).coinU < 1 && introState(2.4).coinU === -1);
  check('開始：コインのあとにハンマーを構えてにらむ（aim）', introState(2.0).mood === 'calm' && introState(2.6).mood === 'aim' && introState(2.0).hoverU === 0 && near(I1.hoverU, 1, 1e-9));
  check('開始：カメラ・光の広がりは 0→1 に収まる', [0, 0.5, 1.0, 2.0, INTRO_DUR].every(t => { const s = introState(t); return s.camU >= 0 && s.camU <= 1 && s.irisU >= 0 && s.irisU <= 1; }));
  check('開始：2〜3 秒台（タップで飛ばせる長さ）', INTRO_DUR >= 2 && INTRO_DUR <= 3.5);

  const Oe0 = outroState(0, 'escaped'), Oe = outroState(OUTRO_DUR, 'escaped'), Ob = outroState(OUTRO_DUR, 'bumped');
  check('退場（逃げきり）：ハンマーを台に置き、肩を落とし、しょんぼりして右へ去る', Oe.downU === 1 && Oe.slumpU === 1 && Oe.mood === 'sad' && Oe.x > 5 && Oe0.x === 0);
  check('退場（逃げきり）：最初は置く前（calm）、そのあと sad', outroState(0.3, 'escaped').mood === 'calm' && outroState(1.0, 'escaped').mood === 'sad');
  check('退場（逃げきり）：モグラがぴょこっと出る（0→1）', Oe0.moleH === 0 && near(Oe.moleH, 1, 1e-9));
  check('退場（叩かれた）：ガッツポーズ（fistU）して満足げ（happy）に去る。ハンマーは置かない', outroState(0.5, 'bumped').fistU > 0.9 && Ob.fistU === 0 && Ob.mood === 'happy' && Ob.downU === 0 && Ob.slumpU === 0 && Ob.x > 5 && Ob.moleH === null);
  check('退場：去るのは終わりまでに右（x 正）へ。去り始めは逃げきり 1.3 秒・叩かれた 1.0 秒', outroState(1.2, 'escaped').x === 0 && outroState(1.2, 'bumped').x > 0 && outroState(2.0, 'escaped').x < outroState(2.6, 'escaped').x);
  check('退場：2〜3 秒台', OUTRO_DUR >= 2 && OUTRO_DUR <= 3.5);

  // ---- X 共有の文章 ----
  const R = { name: '負けず嫌いのおじさん', score: 12345, maxStage: 3, reason: 'escaped' };
  const tx = shareText(R, CFG);
  check('共有文：相手・最高段階・点・逃げきり・ハッシュタグが入る', tx.includes('負けず嫌いのおじさん') && tx.includes('「激怒」') && tx.includes('12345点') && tx.includes('逃げきり') && tx.includes('#' + CFG.share.hashtag), tx);
  check('共有文：叩かれて終わりなら「逃げきり」を付けない', !shareText({ name: '子ども', score: 10, maxStage: 1, reason: 'bumped' }, CFG).includes('逃げきり'));
  check('共有文：最後まで平静なら「怒らせた」ではなく挑戦', !shareText({ name: '子ども', score: 10, maxStage: 0, reason: 'escaped' }, CFG).includes('怒らせた') && shareText({ name: '子ども', score: 10, maxStage: 0, reason: 'escaped' }, CFG).includes('挑戦'));
  check('共有：X の投稿画面の URL（文章と URL をエンコード）', (() => { const u = tweetUrl('あ b', 'https://x.test/p?q=1'); return u.startsWith('https://twitter.com/intent/tweet?text=') && u.includes(encodeURIComponent('あ b')) && u.includes('&url=' + encodeURIComponent('https://x.test/p?q=1')); })());
  check('共有：公開先 URL が設定されている', /^https:\/\/.+\/$/.test(CFG.share.url));
  check('全段階に名前がある（結果・共有に使う）', CFG.stages.every(s => typeof s.name === 'string' && s.name.length > 0));
})();
