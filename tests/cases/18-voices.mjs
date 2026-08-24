/* ⑱ 1音あたりの重さ（本物の部品の数）
   ------------------------------------------------------------
   「サックス・トランペットが絡むと音が割れて止まる」という報告への
   歯止め。原因は音の数でも音量でもなく、**1音を鳴らすのに作る
   本物の Web Audio の部品が多すぎた**こと。

   Tone の部品は1個が中でいくつもの本物の部品に化ける。実測:
       Tone.Filter      → 15個（Gain10・ConstantSource4・Biquad1）
       Tone.Oscillator  →  8個（Gain5・ConstantSource2・波1）
       Tone.Noise       →  7個（Gain5・音源1・波形1）
   ConstantSource は「鳴りっぱなしの音源」なので、置いてあるだけで
   計算を食う。管楽器の1音は 62個、吹奏楽の再生では毎秒852個も
   作っていた。端末の音の計算が間に合わなくなると、ブラウザは音を
   欠かす＝割れて聞こえ、やがて止まる。しかもこの詰まりは音の計算の
   側で起きるので「予約の余裕」には映らず、⑫の自動軽量化も働かない。

   ここでは「1音ぶんの部品の数」と「再生1秒あたりに作る部品の数」に
   上限を置く。うっかり Tone の部品へ戻したら、ここで落ちる。

   ⚠️ 数えるのは AudioContext の create○○ を横取りする形。
      Tone.js もこの入口を通るので、Tone 経由でも生でも同じに数えられる。 */
export const name = '⑱ 1音あたりの重さ';

/* 上限。実測値に少し余裕を持たせた値にする。
   （実測: 管楽器の本来の音 17〜20個 / 簡易版 6個 / 吹奏楽の再生 毎秒 約300個。
     直す前は 62個 / 26個 / 毎秒852個）
   ⚠️ 数え方の都合で、1回の呼び出しが2回数えられる部品がある
     （Tone の文脈 → standardized-audio-context → 本物、と2段になっているため）。
     絶対値そのものより「直す前と同じ数え方で何倍か」を見るための値。 */

export async function run({ page }){
  const r = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const proto = window.BaseAudioContext.prototype;
    let N = 0, 数える = false;
    const 元 = {};
    Object.getOwnPropertyNames(proto).filter(n => /^create/.test(n)).forEach(n => {
      const f = proto[n]; if(typeof f !== 'function') return;
      元[n] = f;
      proto[n] = function(...a){ if(数える) N++; return f.apply(this, a); };
    });
    const 戻す = () => Object.keys(元).forEach(n => { proto[n] = 元[n]; });

    const out = {};
    try{
      /* 1音ぶん。書き出し（live=false）は簡易版に落ちないので本来の音になる。 */
      const 一音 = async (lean) => {
        let 個 = 0; const 内訳 = {};
        await Tone.Offline(async (ctx) => {
          const v = new ZCnovaAcoustic('trumpet', false);
          v.connect(ctx.destination);
          /* 楽器そのものを作る分は数えない。鳴らす分だけ数える。 */
          数える = true; N = 0;
          if(lean){
            /* 簡易版は「同時に混んでいるとき」の姿。live を立てて数で落とす。 */
            v.live = true; v.active = 15;   /* 20以上は音そのものを止める判定なので、その手前 */
          }
          v.triggerAttackRelease('G4', 0.8, 0.05, 0.85);
          個 = N; 数える = false;
        }, 1.4, 1, 22050);
        return 個;
      };
      out.本来 = await 一音(false);
      out.簡易 = await 一音(true);

      /* 再生1秒あたり。いちばん重い編成（吹奏楽）で実際に鳴らして数える。 */
      pickPM = 'fam_concert'; pickMood = 'battle'; pickBars = 4;
      makeNewSong(20260824);
      await wait(500);
      zcLiteSetting = 'full';               // 自動で軽くする助けを切って素の重さを見る
      数える = true; N = 0;
      const t0 = performance.now();
      await ensurePlaying();
      await wait(8000);
      const 秒 = (performance.now() - t0) / 1000;
      const 個 = N;
      数える = false;
      stopPlayback();
      await wait(300);
      zcLiteSetting = 'auto';
      out.毎秒 = Math.round(個 / 秒);
      out.同時最大 = window.ZC_LIVE_VOICES ? 'あり' : 'なし';
    } finally { 戻す(); }
    return out;
  });

  return { checks: [
    { ok: r.本来 > 0 && r.本来 <= 26,
      label: `管楽器の1音が軽い（部品 ${r.本来}個／26個まで）`,
      info: r.本来 <= 26 ? 'Tone の包みを使っていた頃は 62個だった'
                         : 'Tone.Filter(15個)・Tone.Oscillator(8個) を音ごとに作っていないか' },
    { ok: r.簡易 > 0 && r.簡易 <= 10,
      label: `混んだときの簡易版はさらに軽い（${r.簡易}個／10個まで）`,
      info: r.簡易 <= 10 ? '直す前は 26個だった' : '簡易版が本来の音と同じ作りになっていないか' },
    { ok: r.毎秒 > 0 && r.毎秒 <= 420,
      label: `吹奏楽の再生が重すぎない（毎秒 ${r.毎秒}個の部品／420個まで）`,
      info: r.毎秒 <= 420 ? '直す前は毎秒852個で、端末の計算が間に合わず音が割れて止まっていた'
                          : '1音あたりの部品か、同時に鳴らす数が増えていないか' },
  ] };
}
