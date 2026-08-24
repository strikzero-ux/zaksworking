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
  ];
  return { checks };
}
