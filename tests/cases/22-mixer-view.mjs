/* ㉒ ④「音を整える」の表示
   ------------------------------------------------------------
   ここは音量を決める場所なのに、長いあいだ**パート名しか出ていなかった**。

     ・どのパートがどの楽器か分からない（③まで見に行かないと分からない）
     ・**鳴らさない設定のパートも、鳴っているパートと見た目が同じ**

   実測（完全ランダムほか8編成×48曲）：鳴らさない設定のパートは
   140/384＝36%。3つに1つは、つまみを動かしても音が変わらないのに、
   画面からはそれが分からなかった。
   ミュートとソロは押せば点くので、「押せば点灯するけれど、
   もとの状態が点いていないので調整できない」という見え方になる。

   直したあとに見張るのはこの3つ。
     1. 各パートに楽器名が出ていて、③の音色と一致すること
     2. 聞こえないパートは沈んでいて、その理由が出ること
     3. ミュート・ソロ・③の入切に、その場で追従すること
        （組み直さずに class だけ付け替えているので、
          追従の呼び出しを1つ落とすと黙って古い表示のまま残る） */
export const name = '㉒ ④「音を整える」の表示';

export async function run({ page }){
  const checks = [];
  const r = await page.evaluate(async () => {
    const out = {};
    document.getElementById('makeBtn').click();
    await new Promise(r => setTimeout(r, 700));

    const box = k => document.querySelector(`#mixer .mix[data-mix="${k}"]`);
    const read = () => TRACKS.map(t => {
      const b = box(t.key);
      return { key:t.key,
        name: b && b.querySelector('.mname') ? b.querySelector('.mname').textContent.trim() : '',
        inst: b && b.querySelector('.minst') ? b.querySelector('.minst').textContent.trim() : '',
        off:  !!(b && b.classList.contains('mix-off')),
        why:  b && b.querySelector('.mwhy') ? b.querySelector('.mwhy').textContent.trim() : '',
        on: !!song.tracks[t.key].on, mute: !!song.tracks[t.key].mute, solo: !!song.tracks[t.key].solo };
    });

    out.first = read();
    /* ③に出ている音色（select）と突き合わせる */
    out.pairs = [];
    document.querySelectorAll('#trackArea select[data-inst-for]').forEach(sel => {
      const k = sel.dataset.instFor, b = box(k);
      out.pairs.push({ key:k,
        lane: (sel.selectedOptions[0] || {}).textContent || '',
        mix:  b && b.querySelector('.minst') ? b.querySelector('.minst').textContent.trim() : '' });
    });

    /* ミュートを押す → 沈む。もう一度押す → 戻る。 */
    const mk = 'mel1';
    box(mk).querySelector('[data-mute]').click();
    out.muted = read().find(x => x.key === mk);
    box(mk).querySelector('[data-mute]').click();
    out.unmuted = read().find(x => x.key === mk);

    /* ソロを押す → 他のパートが沈む。 */
    box(mk).querySelector('[data-solo]').click();
    out.soloed = read();
    box(mk).querySelector('[data-solo]').click();

    /* ③で「鳴らさない」に切り替える → ④も追従する。 */
    const btn = document.querySelector(`#trackArea [data-on-for="${mk}"]`);
    const wasOn = song.tracks[mk].on;
    if(btn) btn.click();
    out.laneToggled = read().find(x => x.key === mk);
    if(btn) btn.click();               // 元へ戻す
    out.laneBack = read().find(x => x.key === mk);
    out.wasOn = wasOn;
    return out;
  });

  /* 1. 楽器名が出ている */
  const noName = r.first.filter(x => !x.inst || x.inst === '—').map(x => x.key);
  checks.push({ ok: noName.length === 0,
    label: `全${r.first.length}パートに楽器名が出ている`,
    info: noName.length ? '出ていない: ' + noName.join(' ')
      : r.first.map(x => `${x.name}=${x.inst}`).join(' / ') });

  /* 2. ③の音色と一致 */
  const mismatch = r.pairs.filter(p => p.lane.trim() !== p.mix);
  checks.push({ ok: mismatch.length === 0,
    label: `③の音色と④の楽器名が一致（${r.pairs.length}パート）`,
    info: mismatch.map(p => `${p.key}: ③「${p.lane}」/ ④「${p.mix}」`).join(' / ') });

  /* 3. 鳴らさない設定のパートは沈んで理由が出る */
  const offs = r.first.filter(x => !x.on);
  const badOff = offs.filter(x => !x.off || !x.why);
  checks.push({ ok: badOff.length === 0,
    label: `鳴らさない設定のパートは沈んでいて理由が出る（${offs.length}件）`,
    info: badOff.length ? badOff.map(x => `${x.key} 沈み=${x.off} 理由=「${x.why}」`).join(' / ')
      : (offs.length ? offs.map(x => `${x.name}「${x.why}」`).join(' / ') : 'この曲は全パート鳴らす設定だった') });

  /* 4. ミュートに追従する */
  checks.push({ ok: r.muted.off && !!r.muted.why && !r.unmuted.off,
    label: 'ミュートを押すと沈み、外すと戻る',
    info: `押した後: 沈み=${r.muted.off} 理由=「${r.muted.why}」／外した後: 沈み=${r.unmuted.off}` });

  /* 5. ソロに追従する */
  const others = r.soloed.filter(x => x.key !== 'mel1');
  const notDim = others.filter(x => !x.off);
  const me = r.soloed.find(x => x.key === 'mel1');
  checks.push({ ok: notDim.length === 0 && me && !me.off,
    label: `ソロにすると他の${others.length}パートが沈み、そのパートは沈まない`,
    info: notDim.length ? '沈まなかった: ' + notDim.map(x => x.key).join(' ') : '' });

  /* 6. ③の入切に追従する */
  checks.push({ ok: r.wasOn ? (r.laneToggled.off && !r.laneBack.off) : (!r.laneToggled.off && r.laneBack.off),
    label: '③で「鳴らす／鳴らさない」を切り替えると④も追従する',
    info: `切替前=${r.wasOn ? '鳴らす' : '鳴らさない'} → 切替後の沈み=${r.laneToggled.off} → 戻した後=${r.laneBack.off}` });

  /* 7. どの編成でも、③の音色欄が「いま鳴っている音色」を指していること。
        ------------------------------------------------------------
        上の 2. は「いま画面に出ている曲」しか見ないので、当たらない編成が
        あると素通りする（実際、最初の実行では当たらず、全体を回して初めて
        オーケストラで見つかった）。ここは編成を総当たりして、
        実際に③を組み立てた画面の select を読む。

        低音レーンは bassOnly の音色しか並べていなかったのに、編成のほうは
        そうでない楽器（チューバ・ティンパニ・ファゴット）も低音に割り当てる。
        一致する option が無いと select は**先頭の項目**を表示するので、
        チューバが鳴っているのに「シンセベース」と出ていた。 */
  const scan = await page.evaluate(async () => {
    const MODES = ['fam_random_all','fam_piano','fam_guitar','fam_band','fam_full','fam_winds','fam_brass',
      'fam_bowedStrings','fam_concert','fam_orchestra','fam_rock','fam_jazz','fam_percussion','fam_drum'];
    const bad = []; let tot = 0;
    for(let i = 0; i < MODES.length * 6; i++){
      const m = MOODS[i % MOODS.length];
      song = makeSong(m.key, 2, MODES[i % MODES.length], 140, 555000 + i * 17);
      renderAll();
      document.querySelectorAll('#trackArea select[data-inst-for]').forEach(sel => {
        const k = sel.dataset.instFor; tot++;
        if(sel.value !== song.tracks[k].inst)
          bad.push(`${MODES[i % MODES.length]} ${k}: 鳴っているのは ${song.tracks[k].inst} / 出ているのは ${sel.value}`);
      });
    }
    document.getElementById('makeBtn').click();      // 画面を元へ戻す
    await new Promise(r => setTimeout(r, 600));
    return { tot, bad };
  });
  checks.push({ ok: scan.bad.length === 0,
    label: `どの編成でも③の音色欄が鳴っている音色を指す（14編成×6曲・${scan.tot}パート）`,
    info: scan.bad.length ? scan.bad.slice(0, 8).join('\n      ') +
      (scan.bad.length > 8 ? `\n      …ほか${scan.bad.length - 8}件` : '') +
      '\n      直す前は 15件（低音レーンのティンパニ・チューバ・ファゴット）' : '' });

  return { checks };
}
