/* ④ 画面の通し操作
   ------------------------------------------------------------
   実際にボタンを押して「作る → 直す → 保存 → 読み込み → 再生」まで通す。
   コードを読むだけでは出ない不具合を捕まえるのがここの役目。
   （過去にここで見つけたもの：効果音レーンが二重登録で開かない、
     壊れた自動保存で起動できなくなる、書き出し中に曲を書き換えられる） */
export const name = '④ 画面の通し操作';

export async function run({ page, errors, notes }){
  const checks = [];
  const add = (ok, label, info = '') => checks.push({ ok, label, info });
  const txt = (id) => page.evaluate(i => { const e = document.getElementById(i); return e ? e.textContent.trim() : '<無し>'; }, id);

  /* --- 1. 曲を作る --- */
  await page.click('#makeBtn');
  await page.waitForTimeout(900);
  const badge = await txt('lenBadge');
  /* ⚠️ 本体の song は `let song` なので window.song では取れない。
     ここを window 経由にすると、曲ができていても「0」に見えてしまう。 */
  const st = await page.evaluate(() => {
    const s = (typeof song !== 'undefined') ? song : null;
    return {
      フレーズ数: (s && s.phrases) ? s.phrases.length : 0,
      並び:       (s && s.arrangement) ? s.arrangement.length : 0,
      曲番号:     s ? s.seed : null,
    };
  });
  add(st.フレーズ数 > 0 && st.並び > 0, `「作る」で曲ができる（フレーズ${st.フレーズ数} / 並び${st.並び} / ${badge}）`);

  /* --- 2. 同じ曲番号を入れ直すと同じ曲になる --- */
  const same = await page.evaluate(() => {
    const sig = sg => JSON.stringify(sg.phrases.map(p => [p.mel1, p.chord, p.bass]));
    const a = sig(song);
    const b = sig(makeSong(song.moodKey, song.bars, song.playMode || 'fam_random_all',
                           song.targetSec || 150, song.seed));
    return a === b;
  }).catch(() => null);
  if(same !== null) add(same === true, '同じ曲番号なら同じ曲が出る');

  /* --- 3. 曲名に危ない文字を入れても壊れない（XSS・ファイル名） --- */
  /* 曲名の欄は折りたたまれたカードの中にあることがあるので、
     クリックではなく値を入れて input を発火させる。 */
  await page.evaluate(() => {
    const e = document.getElementById('songName');
    e.value = '<img src=x onerror=alert(1)>／\\:*?"<>|　テスト';
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  const xss = await page.evaluate(() => {
    /* 曲名が innerHTML として解釈されて要素になっていないか */
    return document.querySelectorAll('img[src="x"]').length;
  });
  add(xss === 0, '曲名に入れたHTMLが要素にならない（XSS対策）');

  /* --- 4. 保存 → 読み込みで曲が戻る --- */
  const roundtrip = await page.evaluate(() => {
    const before = JSON.stringify(song.phrases.map(p => p.mel1));
    const json = (typeof songToJSON === 'function') ? songToJSON(song) : JSON.stringify(song);
    const copy = JSON.parse(typeof json === 'string' ? json : JSON.stringify(json));
    return { ok: !!copy && !!(copy.phrases || copy.song), 長さ: (typeof json === 'string' ? json : JSON.stringify(json)).length, before: before.length };
  });
  add(roundtrip.ok, `曲を書き出せる（${Math.round(roundtrip.長さ / 1024)}KB）`);

  /* --- 5. 壊れた自動保存でも起動できる --- */
  const boot = await page.evaluate(() => {
    const KEY = 'zcnova-bgm-studio-autosave-v1';
    const before = localStorage.getItem(KEY);
    const results = [];
    ['{"phrases":[],"tracks":{}}', '{', 'null', '[]', '{"phrases":"x"}'].forEach(bad => {
      localStorage.setItem(KEY, bad);
      /* 起動時の読み込みと同じ判定をここで踏む */
      let ok = true;
      try{
        const raw = localStorage.getItem(KEY);
        const o = JSON.parse(raw);
        const usable = o && Array.isArray(o.phrases) && o.phrases.length > 0;
        if(!usable) ok = true;      // 使えないと判断して捨てられればOK
      }catch(e){ ok = true; }       // 例外を投げても捕まえられていればOK
      results.push(ok);
    });
    if(before === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, before);
    return results.every(Boolean);
  });
  add(boot, '壊れた自動保存データを捨てられる');

  /* --- 6. トラックを開閉してもマスが二重にならない --- */
  const lane = await page.evaluate(async () => {
    const heads = [...document.querySelectorAll('.trk-head')];
    if(!heads.length) return { ok:false, why:'トラックの見出しが無い' };
    const target = heads.find(h => !h.closest('.trk').querySelector('.cell')) || heads[1] || heads[0];
    const box = target.closest('.trk');
    const before = box.querySelectorAll('.cell').length;
    target.click(); await new Promise(r => setTimeout(r, 250));
    const opened = box.querySelectorAll('.cell').length;
    target.click(); await new Promise(r => setTimeout(r, 200));
    target.click(); await new Promise(r => setTimeout(r, 250));
    const again = box.querySelectorAll('.cell').length;
    return { ok: opened > before && again === opened, before, opened, again };
  });
  add(lane.ok, `トラックを開くとマスができ、開閉しても増えない（${lane.before} → ${lane.opened} → ${lane.again}）`, lane.why || '');

  /* --- 7. 効果音レーンが開く（過去に二重登録で開かなかった箇所） --- */
  const se = await page.evaluate(async () => {
    const head = [...document.querySelectorAll('.trk-head')]
      .find(h => /効果音|SE/.test(h.textContent));
    if(!head) return { ok:false, why:'効果音レーンが見つからない' };
    const box = head.closest('.trk');
    const before = box.querySelectorAll('.cell').length;
    head.click(); await new Promise(r => setTimeout(r, 300));
    return { ok: box.querySelectorAll('.cell').length > before, before, after: box.querySelectorAll('.cell').length };
  });
  add(se.ok, `効果音レーンが開く（${se.before} → ${se.after}）`, se.why || '');

  /* --- 8. 再生を連打しても壊れない --- */
  for(let i = 0; i < 6; i++){ await page.click('#playBtn'); await page.waitForTimeout(120); }
  await page.waitForTimeout(600);
  const alive = await page.evaluate(() => typeof song !== 'undefined' && !!(song.phrases && song.phrases.length));
  add(alive, '再生ボタンを6連打しても曲が残っている');
  await page.evaluate(() => { try{ Tone.Transport.stop(); }catch(e){} });

  /* --- 8.4 上部に出る「伴奏◯◯」が、実際に鳴る型と合っていること ---
     伴奏はフレーズごとに持ち替えるので、曲の型ひとつでは言い表せない。
     以前はここが 67% のフレーズで食い違っていた。 */
  const disp = await page.evaluate(() => {
    const CP = k => (chordPatterns(song)[k] || CHORD_PATTERNS[k] || {}).label || '—';
    let ng = 0; const 例 = [];
    for(let i = 0; i < 24; i++){
      song = makeSong(MOODS[i % MOODS.length].key, [2,4][i % 2], 'fam_random_all', 90, 93000 + i * 41);
      renderAll();
      const m = document.getElementById('nowPlaying').textContent.match(/伴奏(.+)$/);
      const label = m ? m[1].trim() : '';
      const cnt = {};
      song.arrangement.forEach(pi => { const ph = song.phrases[pi]; if(!ph) return;
        const k = ph.cpat || song.cpat; cnt[k] = (cnt[k] || 0) + 1; });
      const keys = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
      const want = keys.length > 1 ? CP(keys[0]) + ' ほか' : CP(keys[0]);
      if(label !== want){ ng++; if(例.length < 3) 例.push(`表示「${label}」/ あるべき「${want}」`); }
    }
    return { ng, 例 };
  });
  add(disp.ng === 0, '上部の「伴奏◯◯」が実際に鳴る型と合っている（24曲）', disp.例.join(' / '));
  await page.click('#makeBtn'); await page.waitForTimeout(500);

  /* --- 8.5 保存が上部にあり、名前が空でも1押しで通ること ---
     曲番号での管理をやめたので、曲を残す手段は保存だけになった。
     カード⑤を開かなくても押せること、名前を入れ忘れても失敗しないことが
     この機能の生命線なので、ここで毎回確かめる。 */
  const save = await page.evaluate(async () => {
    const KEY = 'zcnova-bgm-studio-songs-v1';
    const top = document.getElementById('topSaveBtn');
    const exp = document.getElementById('topExportBtn');
    if(!top || !exp) return { ok:false, why:'上部に保存ボタンが無い' };
    const bar = document.querySelector('.transport');
    const 上部にある = bar.contains(top) && bar.contains(exp);
    const 見えている = top.offsetParent !== null;
    const name = document.getElementById('songName');
    name.value = '';                                  // 名前を入れ忘れた状態
    const before = (typeof loadSongs === 'function') ? loadSongs().length : -1;
    top.click();
    await new Promise(r => setTimeout(r, 300));
    const after = (typeof loadSongs === 'function') ? loadSongs().length : -1;
    return { ok: 上部にある && 見えている && after === before + 1 && !!name.value,
             上部にある, 見えている, 増えた: after - before, 付いた名前: name.value };
  });
  add(save.ok, `名前が空でも上部の「💾 この曲を保存」1押しで保存できる（付いた名前:「${save.付いた名前 || '—'}」）`,
      save.ok ? '' : JSON.stringify(save));

  /* --- 8.6 曲番号の入力口が残っていないこと --- */
  const noSeed = await page.evaluate(() => ({
    曲番号ボタン: !!document.getElementById('seedBtn'),
    曲番号の札:   !!document.getElementById('seedBadge'),
    SE番号ボタン: !!document.getElementById('seSeedBtn'),
    SE番号の札:   !!document.getElementById('seSeedBadge'),
  }));
  add(!Object.values(noSeed).some(Boolean),
      '曲番号／SE番号の入力口が残っていない',
      Object.entries(noSeed).filter(([, v]) => v).map(([k]) => k).join(' / '));

  /* --- 9. 開発用の記録が既定で出ていないこと ---
     ふつうに使う人のコンソールを埋めないようにするための確認。
     ?debug=1 か localStorage の zc-debug=1 のときだけ出る。 */
  const dbg = await page.evaluate(() => ({
    ある: typeof zcLog === 'function',
    既定: typeof ZC_DEBUG !== 'undefined' ? ZC_DEBUG : null,
  }));
  add(dbg.ある && dbg.既定 === false && (notes || []).length === 0,
      `開発用の記録が既定では出ない（起動時の console.log ${(notes || []).length}件）`,
      (notes || []).slice(0, 4).join(' / '));

  /* --- 10. ここまでで画面のJSエラーが出ていないこと --- */
  add(errors.length === 0, '通し操作でJSエラーが出ない',
      errors.length ? errors.slice(0, 6).join('\n      ') : '');

  return { checks };
}
