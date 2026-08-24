/* ⑪ 打ち込み画面の操作まわり
   ------------------------------------------------------------
   ここで見張るのは、どれも「動いているように見えて動いていない」形の不具合。
     1. マスの色 … 木管・金管は色の指定がそのまま抜けていて、押しても
        class は付くのに見た目が変わらず「打ち込めない」と見えていた。
        トラックを足したときの入れ忘れなので、全パートを機械で確かめる。
     2. 試聴   … ボタンが見出しの中にあり、開閉の判定に先に吸われて
        一度も動いていなかった。
     3. 言い方 … 効果音レーンだけ「消音／全消し」で、ほかは
        「鳴らす／消去」だった。
     4. 書き出し中 … 再生を止めるのは通し、始めるのは断ること。
        30〜60秒の計算とCPUを取り合ったまま止め方が分からなくなる。 */
export const name = '⑪ 打ち込み画面の操作';

export async function run({ page, errors }){
  const before = errors.length;
  const r = await page.evaluate(async () => {
    const out = {};
    document.getElementById('makeBtn').click();
    await new Promise(r => setTimeout(r, 700));
    const c3 = document.getElementById('card3');
    if(!c3.classList.contains('open')) c3.querySelector('.fold-head').click();
    await new Promise(r => setTimeout(r, 300));

    /* 1. すべてのパートで、押すとマスの色が変わること */
    out.色が変わらないパート = [];
    for(const k of ['mel1','mel2','sub','bass','wind1','wind2']){
      const box = [...document.querySelectorAll('#trackArea .trk')].find(x => x.dataset.trk === k);
      if(!box){ out.色が変わらないパート.push(k + '(レーン無し)'); continue; }
      if(!box.classList.contains('open')){ box.querySelector('.trk-head').click(); await new Promise(r => setTimeout(r, 250)); }
      const cells = [...box.querySelectorAll('.cell')];
      /* いま消えているマスを選ぶ（点いているマスを押すと消えるので判定できない） */
      const idx = cells.findIndex(c => !/\bon-/.test(c.className));
      if(idx < 0){ out.色が変わらないパート.push(k + '(消えているマスが無い)'); continue; }
      const 消えた色 = getComputedStyle(cells[idx]).backgroundColor;
      cells[idx].click();
      await new Promise(r => setTimeout(r, 180));
      const now = [...box.querySelectorAll('.cell')][idx];
      if(getComputedStyle(now).backgroundColor === 消えた色) out.色が変わらないパート.push(k);
    }

    /* 2. 試聴が動く（レーンの開閉に吸われない） */
    const box = [...document.querySelectorAll('#trackArea .trk')].find(x => x.dataset.trk === 'mel1');
    const 開閉前 = box.classList.contains('open');
    box.querySelector('[data-preview-for]').click();
    await new Promise(r => setTimeout(r, 600));
    const b2 = [...document.querySelectorAll('#trackArea .trk')].find(x => x.dataset.trk === 'mel1');
    out.試聴 = { 始まった: zcTrackPreview === 'mel1' && Tone.Transport.state === 'started',
                 開閉が変わっていない: b2.classList.contains('open') === 開閉前,
                 ボタン: b2.querySelector('[data-preview-for]').textContent };
    b2.querySelector('[data-preview-for]').click();
    await new Promise(r => setTimeout(r, 400));
    out.試聴.止まった = (zcTrackPreview === null && Tone.Transport.state === 'stopped');

    /* 3. 効果音レーンの言い方がほかとそろっている */
    const se = [...document.querySelectorAll('#trackArea .trk')].find(x => x.dataset.trk === 'se');
    out.効果音のボタン = se ? [...se.querySelectorAll('button')].map(x => x.textContent.trim()).filter(Boolean) : [];

    /* 4. 書き出しの計算中は再生を始められない／止めるのは効く */
    document.getElementById('playBtn').click();
    await new Promise(r => setTimeout(r, 700));
    const 鳴っている = Tone.Transport.state === 'started';
    rendering = true;
    const pr = renderSong(song, () => {});
    await new Promise(r => setTimeout(r, 500));
    const 書き出しで止まった = Tone.Transport.state === 'stopped';
    document.getElementById('playBtn').click();
    await new Promise(r => setTimeout(r, 400));
    const 押しても始まらない = Tone.Transport.state === 'stopped';
    await pr; rendering = false;
    document.getElementById('playBtn').click();
    await new Promise(r => setTimeout(r, 600));
    const 終わったら鳴らせる = Tone.Transport.state === 'started';
    document.getElementById('playBtn').click();
    out.書き出し中 = { 鳴っている, 書き出しで止まった, 押しても始まらない, 終わったら鳴らせる };
    return out;
  });

  const checks = [];
  checks.push({ ok: r.色が変わらないパート.length === 0,
    label: '全パートで、押すとマスの色が変わる（木管・金管を含む）',
    info: r.色が変わらないパート.join(' / ') });
  checks.push({ ok: r.試聴.始まった && r.試聴.開閉が変わっていない && r.試聴.止まった,
    label: `「▶ 試聴」で鳴り、もう一度押すと止まる（レーンの開閉に吸われない）`,
    info: JSON.stringify(r.試聴) });
  checks.push({ ok: r.効果音のボタン.includes('鳴らす') || r.効果音のボタン.includes('鳴らさない'),
    label: `効果音レーンの言い方がほかのパートとそろっている（${r.効果音のボタン.join(' / ')}）` });
  const e = r.書き出し中;
  checks.push({ ok: e.鳴っている && e.書き出しで止まった && e.押しても始まらない && e.終わったら鳴らせる,
    label: '書き出しの計算中は再生が始まらない（終われば鳴らせる）',
    info: JSON.stringify(e) });
  checks.push({ ok: errors.length === before,
    label: 'この一連でJSエラーが出ない',
    info: errors.slice(before).join(' / ') });
  return { checks };
}
