/* ⑤ 曲のゆらぎ（同じグループから候補を借りるしくみ）
   ------------------------------------------------------------
   ここで守りたい約束は3つ。
     1. 「いつもどおり」では、その曲調の候補以外は絶対に出ない
     2. 借りるときも、必ず**同じカテゴリの曲調が持っている候補**から借りる
        （明るいが変わり種から借りない＝曲調の意味が消えない）
     3. 同じ曲番号＋同じゆらぎなら、いつも同じ曲になる
   3つめが崩れると、保存した曲が読み込み直しで別物になる。 */
export const name = '⑤ 曲のゆらぎ';

export async function run({ page }){
  const r = await page.evaluate(() => {
    const AX = ['progs','bass','cpat'];
    const out = { 段: Object.keys(ZC_SPREAD), ボタン: document.querySelectorAll('#spreadPick button').length };

    /* --- 1・2. 借りた候補がどこから来ているか --- */
    const check = (sp) => {
      let 総数 = 0, 候補外 = 0, カテゴリ外 = 0;
      MOODS.forEach((m, mi) => {
        const catKeys = new Set();
        moodsOfCat(moodCatOf(m.key)).forEach(x => (x.progs || []).forEach(k => catKeys.add(k)));
        for(let i = 0; i < 12; i++){
          const sg = makeSong(m.key, 4, 'fam_random_all', 120, 90000 + mi * 211 + i * 13, { spread: sp });
          sg.phrases.forEach(ph => {
            if(!ph.progKey) return;
            総数++;
            if((m.progs || []).indexOf(ph.progKey) < 0){
              候補外++;
              if(!catKeys.has(ph.progKey)) カテゴリ外++;
            }
          });
        }
      });
      return { 総数, 候補外, カテゴリ外, 割合: Math.round(候補外 / Math.max(1, 総数) * 100) };
    };
    out.いつもどおり = check('off');
    out.すこし広め   = check('some');
    out.大きく広げる = check('wide');

    /* --- 3. 同じ曲番号＋同じゆらぎなら同じ曲 --- */
    const sig = sg => JSON.stringify(sg.phrases.map(p => [p.mel1, p.chord, p.bass, p.drum]));
    let 同じ = 0, 回数 = 0;
    ['off','some','wide'].forEach(sp => {
      MOODS.slice(0, 10).forEach((m, mi) => {
        回数++;
        const a = makeSong(m.key, 4, 'fam_random_all', 120, 4242 + mi, { spread: sp });
        const c = makeSong(m.key, 4, 'fam_random_all', 120, 4242 + mi, { spread: sp });
        if(sig(a) === sig(c)) 同じ++;
      });
    });
    out.再現性 = `${同じ}/${回数}`;

    /* --- おまけ：ゆらぎを変えれば実際に別の曲になる --- */
    const base = sig(makeSong('bright', 4, 'fam_random_all', 120, 777, { spread:'off' }));
    const wide = sig(makeSong('bright', 4, 'fam_random_all', 120, 777, { spread:'wide' }));
    out.効いている = base !== wide;

    /* --- 保存に残るか（読み込み直しで同じゆらぎに戻せるか） --- */
    const sg = makeSong('calm', 2, 'fam_random_all', 120, 999, { spread:'wide' });
    out.曲に焼き込まれる = JSON.parse(JSON.stringify(sg)).spread === 'wide';
    return out;
  });

  const checks = [];
  checks.push({ ok: r.ボタン === r.段.length,
    label: `ゆらぎのボタンが${r.段.length}段そろっている`, info: r.ボタン === r.段.length ? '' : `画面のボタン ${r.ボタン}個` });
  checks.push({ ok: r.いつもどおり.候補外 === 0,
    label: `「いつもどおり」は曲調の候補だけを使う（${r.いつもどおり.総数}フレーズ）`,
    info: r.いつもどおり.候補外 ? `候補外が ${r.いつもどおり.候補外}件` : '' });
  ['すこし広め','大きく広げる'].forEach(k => {
    checks.push({ ok: r[k].候補外 > 0 && r[k].カテゴリ外 === 0,
      label: `「${k}」は同じグループの中からだけ借りる（借りた割合 ${r[k].割合}%）`,
      info: r[k].カテゴリ外 ? `グループ外から借りた件数 ${r[k].カテゴリ外}` :
            (r[k].候補外 === 0 ? '一度も借りていない（設定が効いていない）' : '') });
  });
  checks.push({ ok: r.再現性.split('/')[0] === r.再現性.split('/')[1],
    label: `同じ曲番号＋同じゆらぎなら同じ曲（${r.再現性}）` });
  checks.push({ ok: r.効いている, label: 'ゆらぎを変えると別の曲になる' });
  checks.push({ ok: r.曲に焼き込まれる, label: 'ゆらぎが曲に焼き込まれ、保存に残る' });
  return { checks };
}
