/* ㉑ 音源スペックの指紋（吹奏系のパラメーターが勝手に変わるのを止める）
   ------------------------------------------------------------
   なぜこの検査があるか。

   ZCNOVA_ACOUSTIC_SPECS は「楽器1つにつき14行ほどの塊」が43個
   縦に並んだ表になっている。ここを直すとき、まとめて置換する書き方
   （正規表現で detuneMix:0.xx を探して書き換える等）を使うと、

     ・その楽器が INSTRUMENTS 側にも同じ名前で先に出てくる
     ・そちらには detuneMix が無い

   という組み合わせで、探索が**次の楽器の塊まで走って**しまう。
   実際に 2026-08-25 に、アコーディオンの 0.24 がフルートへ、
   ヴァイオリンの 0.17 がヴィオラへ書き込まれた。
   音は鳴るし例外も出ないので、検査②（音符の指紋）にも掛からない。
   → **数字を控えておく以外に気づく方法が無い。**

   ★ 狙って音を変えたときは控えを取り直す：
        ZC_UPDATE=1 node tests/run.mjs 21
      そのときは「どの楽器のどの値をなぜ変えたか」をコミット文に書くこと。

   控えとは別に、控えを取り直しても効く「物理的におかしい値」の検査も
   下に置いてある（控えだけだと、間違った値ごと控え直せてしまうため）。 */
import fs from 'node:fs';
import path from 'node:path';

export const name = '㉑ 音源スペックの指紋（楽器パラメーターの取り違え検出）';

export async function run({ page, root }){
  const file = path.join(root, 'tests', 'fixtures', 'spec-fingerprint.json');

  const dump = await page.evaluate(() => {
    const S = window.ZCNOVA_ACOUSTIC_SPECS;
    /* キーの並び順に左右されない書き方へ揃えてから潰す。 */
    const canon = (v) => {
      if(Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
      if(v && typeof v === 'object')
        return '{' + Object.keys(v).sort().map(k => k + ':' + canon(v[k])).join(',') + '}';
      return typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : JSON.stringify(v);
    };
    const h32 = (s) => {
      let h = 0x811c9dc5;
      for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return (h >>> 0).toString(16).padStart(8, '0');
    };

    /* 楽器の系統。スペック名は INSTRUMENTS のキーとだいたい同じで、
       独奏用は '_solo' が付くだけなので落として引く。 */
    const famOf = (name) => {
      const base = name.replace(/_solo$/, '');
      const I = (typeof INSTRUMENTS !== 'undefined') ? INSTRUMENTS : {};
      return (I[base] && I[base].fam) || (I[name] && I[name].fam) || '';
    };

    const out = {};
    Object.keys(S).sort().forEach(k => {
      const p = S[k];
      out[k] = {
        fam:  famOf(k),
        指紋:  h32(canon(p)),
        /* 取り違えが起きた実績のある値は、潰さず生で控える。
           落ちたときに「何がどこから来たのか」がその場で分かるように。 */
        range: p.range, detuneCents: p.detuneCents, detuneMix: p.detuneMix,
        drive: p.drive, cutoff: p.tone && p.tone.cutoff,
        sustain: p.env && p.env.sustain, release: p.env && p.env.release,
        vibrato: p.vibrato ? [p.vibrato.rate, p.vibrato.depth] : null,
        outGain: p.outGain,
      };
    });
    return out;
  });

  const checks = [];
  const WIND = /木管|金管|リード/;
  const names = Object.keys(dump);

  /* ---- ⓐ 控えと突き合わせる ---- */
  const update = process.env.ZC_UPDATE === '1';
  if(!fs.existsSync(file) || update){
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(dump, null, 1) + '\n');
    checks.push({ ok: true, label: `控えを書き出しました（${names.length}楽器）`,
      info: update ? '※ ZC_UPDATE=1 で更新したので、この回は比較していません'
                   : '※ 控えが無かったので新規作成しました' });
  }else{
    const before = JSON.parse(fs.readFileSync(file, 'utf8'));
    const diffs = [];
    names.forEach(k => {
      const a = before[k], c = dump[k];
      if(!a){ diffs.push(`${k}: 控えに無い（楽器が増えた）`); return; }
      if(a.指紋 === c.指紋) return;
      /* 何が動いたかをその場で並べる。 */
      const moved = Object.keys(c).filter(f => f !== '指紋' &&
        JSON.stringify(a[f]) !== JSON.stringify(c[f]))
        .map(f => `${f} ${JSON.stringify(a[f])}→${JSON.stringify(c[f])}`);
      diffs.push(`${k}(${c.fam}): ` + (moved.length ? moved.join(' / ') : '控えに出していない値'));
    });
    Object.keys(before).forEach(k => { if(!dump[k]) diffs.push(`${k}: 今回いない（楽器が減った）`); });
    checks.push({
      ok: diffs.length === 0,
      label: `${names.length}楽器のパラメーターが控えと一致`,
      info: diffs.length === 0 ? '' :
        `${diffs.length}楽器が変化\n      - ` + diffs.slice(0, 12).join('\n      - ') +
        (diffs.length > 12 ? `\n      - …ほか${diffs.length - 12}件` : '') +
        '\n      狙った変更なら ZC_UPDATE=1 node tests/run.mjs 21 で控えを更新',
    });
  }

  /* ---- ⓑ 控えを取り直しても効く検査 ----
     間違った値ごと控え直してしまう事故があるので、
     「その楽器としてありえない値」は控えと無関係に落とす。 */

  /* 同じ数値の並びを持つ楽器が2つあってはいけない。
     塊ごとコピーして名前だけ変えた、を捕まえる。 */
  const byPrint = {};
  names.forEach(k => { (byPrint[dump[k].指紋] = byPrint[dump[k].指紋] || []).push(k); });
  const dup = Object.values(byPrint).filter(a => a.length > 1);
  checks.push({ ok: dup.length === 0, label: '中身がまったく同じ楽器は無い',
    info: dup.length ? dup.map(a => a.join(' = ')).join(' / ') : '' });

  /* 管楽器は「1人が1本を吹く」。ユニゾンを厚く積むのは物理的におかしい。
     ここが太ると、伸ばした音が濁って BGM に使えなくなる（2026-08-25）。

     2つだけ例外がある。この2つは「1人1本」ではないので外す：
       accordion … 1つの音に複数のリードが同時に鳴る楽器（ミュゼット）
       brass      … 単体の楽器ではなく金管の合奏
     残りの最大は horn の 0.24 なので、しきい値は 0.25 に置く。
     取り違えの実例（アコーディオンの 0.26 がフルートへ）はこれで落ちる。 */
  const MULTI_REED = /^(accordion|brass)(_solo)?$/;
  const thick = names.filter(k => WIND.test(dump[k].fam) && !MULTI_REED.test(k)
                                  && dump[k].detuneMix > 0.25)
    .map(k => `${k} ${dump[k].detuneMix}`);
  checks.push({ ok: thick.length === 0, label: '管楽器のユニゾン（detuneMix）が 0.25 以下',
    info: thick.join(' / ') });

  /* ビブラートは人が掛けられる速さの中に居ること。
     取り違えると、木管に弦の値（遅くて深い）が入ったりする。
     打楽器（depth:0）とクラリネット（ほぼ掛けないので 8cent）は
     そもそもビブラートを掛けていないので、深さ12cent 未満は見ない。 */
  const vib = names.filter(k => dump[k].vibrato && dump[k].vibrato[1] >= 12)
    .filter(k => { const [r, d] = dump[k].vibrato; return r < 3.0 || r > 8.0 || d > 60; })
    .map(k => `${k} ${dump[k].vibrato.join('Hz/')}cent`);
  checks.push({ ok: vib.length === 0, label: '掛けている楽器のビブラートが 3〜8Hz・60cent 以内',
    info: vib.join(' / ') });

  /* 音域。狭すぎ・広すぎ・上下逆は取り違えの分かりやすい形。 */
  const rng = names.filter(k => {
    const r = dump[k].range;
    return !Array.isArray(r) || r.length !== 2 || r[1] - r[0] < 11 || r[1] - r[0] > 64;
  }).map(k => `${k} ${JSON.stringify(dump[k].range)}`);
  checks.push({ ok: rng.length === 0, label: '音域が 1〜5オクターブの範囲に収まっている',
    info: rng.join(' / ') });

  /* 歪み・フィルタ・出力の桁違い。 */
  const odd = names.filter(k => {
    const d = dump[k];
    return !(d.drive >= 0 && d.drive <= 1)
        || !(d.cutoff === undefined || (d.cutoff >= 200 && d.cutoff <= 16000))
        || !(d.sustain === undefined || (d.sustain >= 0 && d.sustain <= 1))
        || !(d.outGain === undefined || (d.outGain > 0 && d.outGain <= 3));
  }).map(k => `${k} drive=${dump[k].drive} cutoff=${dump[k].cutoff} out=${dump[k].outGain}`);
  checks.push({ ok: odd.length === 0, label: '歪み・フィルタ・出力が取りうる値の中',
    info: odd.join(' / ') });

  return { checks };
}
