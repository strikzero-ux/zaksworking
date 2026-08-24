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

    /* 2-b. 音色を替えてもレーンが開いたまま・選択欄が作り直されないこと。
       以前は替えるたびに画面を丸ごと組み直していたので、続けて別の音色を
       選ぼうとすると開き直しになっていた。 */
    {
      const k = 'mel1';
      let bx = [...document.querySelectorAll('#trackArea .trk')].find(x => x.dataset.trk === k);
      if(!bx.classList.contains('open')){ bx.querySelector('.trk-head').click(); await new Promise(r => setTimeout(r, 250)); }
      bx = [...document.querySelectorAll('#trackArea .trk')].find(x => x.dataset.trk === k);
      const sel0 = bx.querySelector('[data-inst-for]');
      const cand = [...sel0.options].map(o => o.value).filter(v => v !== sel0.value).slice(0, 3);
      const 結果 = [];
      for(const v of cand){
        const bxN = [...document.querySelectorAll('#trackArea .trk')].find(x => x.dataset.trk === k);
        const sel = bxN.querySelector('[data-inst-for]');
        sel.value = v; sel.dispatchEvent(new Event('change', { bubbles:true }));
        await new Promise(r => setTimeout(r, 350));
        const bx2 = [...document.querySelectorAll('#trackArea .trk')].find(x => x.dataset.trk === k);
        結果.push(bx2.classList.contains('open') && song.tracks[k].inst === v);
      }
      out.音色を替えても開いたまま = 結果.every(Boolean) + '（' + 結果.length + '回試した）';
    }

    /* 3. 効果音レーンの言い方がほかとそろっている */
    const se = [...document.querySelectorAll('#trackArea .trk')].find(x => x.dataset.trk === 'se');
    out.効果音のボタン = se ? [...se.querySelectorAll('button')].map(x => x.textContent.trim()).filter(Boolean) : [];

    /* 3-b. ④の「聴く範囲」。選んだところだけを鳴らし、曲データは触らないこと。
       ここで song.arrangement を書き換える作りにすると、自動保存や書き出しに
       半端な曲が入り込む。範囲は再生の予約時にだけ使う。 */
    {
      const c4 = document.getElementById('card4');
      if(!c4.classList.contains('open')) c4.querySelector('.fold-head').click();
      await new Promise(r => setTimeout(r, 250));
      const w = document.getElementById('mixRangePick');
      const 並び前 = song.arrangement.slice().join(',');
      const 項目 = w ? w.options.length : 0;
      let 範囲 = null, 全部に戻る = false, 並び無事 = false;
      if(w && 項目 >= 2){
        w.value = w.options[1].value;
        w.dispatchEvent(new Event('change', { bubbles:true }));
        await new Promise(r => setTimeout(r, 250));
        範囲 = zcPlayOrder ? { from: zcPlayOrder[0], to: zcPlayOrder[zcPlayOrder.length - 1] } : null;
        並び無事 = song.arrangement.slice().join(',') === 並び前;
        document.getElementById('playBtn').click();     // 上のバーは曲ぜんぶ
        await new Promise(r => setTimeout(r, 600));
        全部に戻る = (zcPlayOrder === null);
        document.getElementById('playBtn').click();
        await new Promise(r => setTimeout(r, 300));
      }
      out.聴く範囲 = { 項目, 範囲: 範囲 ? (範囲.from + '-' + 範囲.to) : null, 全部に戻る, 並び無事 };
    }

    /* 3-c. 頭／終わり／繋ぎ目が「その場で」鳴ること。
       以前は曲を丸ごと計算し終わるまで無音で待たされ、止める手段も
       無かった。押した瞬間に鳴り、もう一度押すと止まることを見る。 */
    {
      song.fadeIn = 3; song.fadeOut = 3; syncControls();
      const res = {};
      for(const id of ['fadeInPreviewBtn','fadeOutPreviewBtn','loopCheckBtn']){
        const t0 = performance.now();
        document.getElementById(id).click();
        await new Promise(r => setTimeout(r, 800));
        const 鳴った = Tone.Transport.state === 'started';
        const 順 = zcPlayOrder ? zcPlayOrder.length : 0;
        const 待ち = (performance.now() - t0) / 1000;
        document.getElementById(id).click();
        await new Promise(r => setTimeout(r, 400));
        res[id] = { 鳴った, 順, 待ち: +待ち.toFixed(1),
                    止まった: Tone.Transport.state === 'stopped' && zcPlayOrder === null };
      }
      out.端の試聴 = res;
    }

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
  checks.push({ ok: String(r.音色を替えても開いたまま).startsWith('true'),
    label: `音色を替えてもレーンが開いたまま（${r.音色を替えても開いたまま}）` });
  const mr = r.聴く範囲 || {};
  checks.push({ ok: mr.項目 >= 2 && !!mr.範囲 && mr.全部に戻る && mr.並び無事,
    label: `④の「聴く範囲」で一部だけ鳴らせる（曲データは触らない）`,
    info: JSON.stringify(mr) });
  const ed = r.端の試聴 || {};
  const edOk = Object.values(ed).every(x => x.鳴った && x.順 > 0 && x.止まった && x.待ち < 2);
  checks.push({ ok: edOk,
    label: '頭・終わり・繋ぎ目がその場で鳴り、もう一度押すと止まる',
    info: JSON.stringify(ed) });
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
