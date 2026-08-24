/* ⑫ 再生が重いときだけ音を軽くする（自動判定）
   ------------------------------------------------------------
   長い音が重なるところで「音が崩れて鳴らなくなる」という報告への対策。
   端末ごとに限界が違うので固定のしきい値では当てられない。そこで
   **予約の余裕**（予約時刻 − いまの時刻）を数えて、無くなってきたら
   部品を減らした簡易版へ落とす。

   ここで守るのは2つ。どちらか片方だけでは役に立たない。
     1. ふつうに鳴っているときに勝手に軽くならないこと。
        （一度これを外し、Tone.now() で測って 83% を「遅れ」と誤判定した。
          Tone.now() は先読み 0.3 秒を足した値を返すため、正常でも
          必ず「予約より先」になる。生の時計で測ること。）
     2. 本当に余裕が無くなったら軽くなり、戻ったら元に戻ること。
   つまみ（自動／軽くする／そのまま）が効くことも合わせて見る。 */
export const name = '⑫ 重いときだけ音を軽くする';

export async function run({ page, errors }){
  const before = errors.length;
  const r = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};

    /* 1. ふつうに鳴らして、勝手に軽くならないこと */
    pickPM = 'orchestra'; pickMood = 'battle'; pickBars = 4;
    makeNewSong(20260824);
    await wait(400);
    zcLiteSetting = 'auto'; zcLiteAuto = false;
    const 余裕 = [];
    const 元 = window.zcWatchLateness;
    window.zcWatchLateness = function(t){ 余裕.push(t - Tone.getContext().currentTime); return 元.call(this, t); };
    await ensurePlaying();
    await wait(9000);
    stopPlayback();
    window.zcWatchLateness = 元;
    await wait(300);
    余裕.sort((a, b) => a - b);
    out.正常時 = { 勝手に軽くなった: zcLiteAuto, 見た音数: 余裕.length,
                   最小余裕: +(余裕[0] || 0).toFixed(3) };

    /* 2. 余裕が無くなったら軽くなる（2秒ごとに見直すので実時間で待つ） */
    zcLiteSetting = 'auto'; zcLiteAuto = false;
    for(let i = 0; i < 25; i++) zcWatchLateness(Tone.getContext().currentTime);
    await wait(2200);
    zcWatchLateness(Tone.getContext().currentTime);
    out.詰まったとき = { 軽くなった: zcLiteAuto, いま軽い: zcLiteOn() };

    /* 3. 余裕が戻れば元に戻る */
    for(let i = 0; i < 25; i++) zcWatchLateness(Tone.getContext().currentTime + 0.3);
    await wait(2200);
    zcWatchLateness(Tone.getContext().currentTime + 0.3);
    out.戻ったとき = { 元に戻った: !zcLiteAuto, いま軽い: zcLiteOn() };

    /* 4. つまみ。押した通りに効いて、覚えていること */
    out.つまみ = {};
    for(const v of ['light', 'full', 'auto']){
      document.querySelector(`#litePick button[data-lite="${v}"]`).click();
      await wait(120);
      out.つまみ[v] = { 設定: zcLiteSetting, いま軽い: zcLiteOn(),
                        覚えた: zcLSGet('zbs-lite'),
                        印: (document.querySelector('#litePick button.active') || {}).dataset?.lite };
    }
    return out;
  });

  const checks = [
    { ok: r.正常時.勝手に軽くなった === false && r.正常時.見た音数 > 20,
      label: 'ふつうに鳴らしているときは軽くならない', info: JSON.stringify(r.正常時) },
    { ok: r.詰まったとき.軽くなった === true && r.詰まったとき.いま軽い === true,
      label: '予約の余裕が無くなったら軽くなる', info: JSON.stringify(r.詰まったとき) },
    { ok: r.戻ったとき.元に戻った === true && r.戻ったとき.いま軽い === false,
      label: '余裕が戻れば本来の音に戻る', info: JSON.stringify(r.戻ったとき) },
    { ok: r.つまみ.light.いま軽い === true && r.つまみ.full.いま軽い === false
          && r.つまみ.auto.設定 === 'auto'
          && ['light','full','auto'].every(v => r.つまみ[v].覚えた === v && r.つまみ[v].印 === v),
      label: 'つまみ（自動／軽くする／そのまま）が効いて覚える', info: JSON.stringify(r.つまみ) },
    { ok: errors.length === before, label: '画面のエラーが増えていない',
      info: errors.slice(before).join('\n') },
    ...(await 簡易版で鳴りすぎないか(page)),
  ];
  return { checks };
}

/* 【書き出しが簡易版で鳴っていないか】
   ------------------------------------------------------------
   簡易版（lean）は発振器1本だけで、息の音・揺れ・歪みが全部落ちる。
   軽くするための逃げ道であって、音としては「ただのシンセ」になる。

   以前は「その楽器1台の重なり数（busy）」で落としていたため、
   **楽器1つの編成**では旋律も和音も同じ1台に集まり、全体としては
   軽いのにその1台だけがしきい値に届いていた。実測:
       クラリネットだけ 51% / サックスだけ 51% / フルートだけ 38%
   半分以上が発振器1本で鳴っていたので「管楽器なのにシンセ」に聞こえた。

   いまは全体の負荷で見て、**落とすのは再生中だけ**にしてある。
   書き出しは実時間で動かないので間に合わなくなることが無く、
   常に本来の音で書き出される。ここが 0 でなくなったら、
   判定がまた「楽器1台ぶん」に戻っている。 */
async function 簡易版で鳴りすぎないか(page){
  const r = await page.evaluate(async () => {
    const 元 = window.ZCnovaAcoustic.prototype._one;
    let 全 = 0, 簡易 = 0;
    window.ZCnovaAcoustic.prototype._one = function(note, dur, time, vel, chord){
      全++;
      const sec = typeof dur === 'number' ? dur : Tone.Time(dur || '8n').toSeconds();
      const longNote = sec >= 0.45;
      const LIVE = window.ZC_LIVE_VOICES ? window.ZC_LIVE_VOICES() : 0;
      const lean = this.live && (
           (!!chord   && (this.active >= 8  || LIVE >= 14))
        || (!longNote && (this.active >= 8  || LIVE >= 14))
        || ( longNote && (this.active >= 14 || LIVE >= 20)));
      if(lean) 簡易++;
      return 元.apply(this, arguments);
    };
    const out = {};
    try{
      for(const [pm, 名] of [['clarinet','クラリネットだけ'], ['sax','サックスだけ'],
                             ['fam_concert','吹奏楽']]){
        全 = 0; 簡易 = 0;
        pickPM = pm; pickBars = 1; pickSec = 15; pickMood = 'bright';
        makeNewSong(20260824);
        await renderSong(song, null);
        out[名] = { 全, 簡易 };
      }
    } finally { window.ZCnovaAcoustic.prototype._one = 元; }
    return out;
  });
  const 悪い = Object.entries(r).filter(([, v]) => v.簡易 > 0)
    .map(([k, v]) => `${k} ${v.簡易}/${v.全}`);
  const 一覧 = Object.entries(r).map(([k, v]) => `${k} ${v.全}音`).join(' / ');
  return [
    { ok: 悪い.length === 0,
      label: '書き出しは簡易版を使わない（管楽器が本来の音のまま出る）',
      info: 悪い.length ? '簡易版で鳴った: ' + 悪い.join(' / ')
                        : 一覧 + '  ／ 直す前は「クラリネットだけ」で51%が簡易版だった' },
  ];
}
