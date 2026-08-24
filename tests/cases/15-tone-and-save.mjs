/* ⑮ 高い音のざわつき／保存が使えない環境
   ------------------------------------------------------------
   1. 高い音の「ざわつき」
      fatsawtooth は同じ波を spread（セント）だけずらして重ねる。ずれが
      同じセントなら、うなりの速さは音の高さに比例して速くなる。人の耳が
      いちばんざらつくと感じるのが毎秒15〜70回で、高い音でちょうどそこへ
      入る。ここを広げ直すと「シンセ・リードが耳にざわつく」が再発する。
      音の揺れのうち毎秒15〜70回ぶんの割合を測って見張る。

      ★ 音量の側（pitchTilt）は別問題。実測では C6 は C4 より小さく
        鳴っており、そちらを下げても、ざわつきは1%も減らない。

   2. 保存が使えない環境（プライベートウィンドウ／サイトデータ禁止／
      よそのページへの埋め込み）で、押しても何も起きない状態にしないこと。
      保存ボタンは**2つある**（⑤の中と上部バーの💾）。片方だけ止めた
      状態が、いちばん気づかれにくい壊れ方。 */
import { APP_FILE } from '../lib/serve.mjs';
import fs from 'node:fs';

export const name = '⑮ 高い音のざわつき／保存が使えないとき';

export async function run({ page, url }){
  const checks = [];

  /* ---- 1. ざわつき ---- */
  const 音 = await page.evaluate(async () => {
    function fft(re, im){
      const n = re.length;
      for(let i=1,j=0;i<n;i++){ let b=n>>1; for(;j&b;b>>=1) j^=b; j^=b;
        if(i<j){ let t=re[i];re[i]=re[j];re[j]=t; t=im[i];im[i]=im[j];im[j]=t; } }
      for(let len=2;len<=n;len<<=1){ const a=-2*Math.PI/len, wr=Math.cos(a), wi=Math.sin(a);
        for(let i=0;i<n;i+=len){ let cr=1,ci=0;
          for(let k=0;k<len/2;k++){ const ur=re[i+k],ui=im[i+k];
            const vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci, vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;
            re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
            const nc=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=nc; } } }
    }
    /* 音の「揺れ」のうち、毎秒15〜70回ぶんが占める割合（％） */
    async function ざらつき(inst, note){
      const buf = await Tone.Offline(() => {
        const v = makeVoice(inst, {}, false);
        const g = new Tone.Gain(1); g.toDestination();
        (v.connect ? v.connect(g) : v.output.connect(g));
        v.triggerAttackRelease(note, 1.2, 0.05, 0.8 * pitchTilt(note));
      }, 2.2);
      const d = buf.getChannelData(0), sr = buf.sampleRate;
      const a = Math.floor(sr*0.35), b = Math.floor(sr*1.15);
      const k = Math.exp(-2*Math.PI*120/sr); let e = 0; const env = [];
      for(let i=a;i<b;i++){ e = k*e + (1-k)*Math.abs(d[i]); env.push(e); }
      let N = 1; while(N*2 <= env.length) N *= 2;
      const re = new Float64Array(N), im = new Float64Array(N);
      let mean = 0; for(let i=0;i<N;i++) mean += env[i]; mean /= N;
      for(let i=0;i<N;i++){ const w = 0.5-0.5*Math.cos(2*Math.PI*i/(N-1)); re[i] = (env[i]-mean)*w; }
      fft(re, im);
      let rough = 0, all = 0;
      for(let i=1;i<N/2;i++){ const f = i*sr/N, p = re[i]*re[i]+im[i]*im[i];
        if(f>2 && f<300){ all += p; if(f>=15 && f<=70) rough += p; } }
      return +(rough/(all||1)*100).toFixed(1);
    }
    const out = { 広がり:{} };
    ['lead','fat'].forEach(k => { out.広がり[k] = INSTRUMENTS[k].opts.oscillator.spread; });
    out.リードC6 = await ざらつき('lead', 'C6');
    out.リードC4 = await ざらつき('lead', 'C4');
    out.厚みパッドC6 = await ざらつき('fat', 'C6');
    out.厚みパッドC4 = await ざらつき('fat', 'C4');
    /* 音量の側も一緒に見ておく（高い音を下げすぎていないか） */
    out.pitchTilt = { C5:+pitchTilt('C5').toFixed(3), C6:+pitchTilt('C6').toFixed(3), C7:+pitchTilt('C7').toFixed(3) };
    return out;
  });
  checks.push({ ok: 音.リードC6 <= 3 && 音.厚みパッドC6 <= 3,
    label: `高い音がざわつかない（リード ${音.リードC6}% / 厚みパッド ${音.厚みパッドC6}%、3%以下なら可）`,
    info: `広げ直すと再発する。実測：リード spread16 で 6.8%／厚みパッド spread30 で 30.7%。いまは ${JSON.stringify(音.広がり)}` });
  checks.push({ ok: 音.リードC4 <= 1 && 音.厚みパッドC4 <= 1,
    label: `低い音の厚みは元のまま（リード ${音.リードC4}% / 厚みパッド ${音.厚みパッドC4}%）` });
  checks.push({ ok: 音.pitchTilt.C5 === 1 && 音.pitchTilt.C6 > 0.3 && 音.pitchTilt.C6 < 0.6,
    label: '高い音の音量の抑えが行き過ぎていない', info: JSON.stringify(音.pitchTilt) });

  /* ---- 2. 保存が使えないとき ---- */
  const p2 = await page.context().newPage();
  /* localStorage を「書くと例外」にして、Safari のプライベートを真似る */
  await p2.addInitScript(() => {
    const 壊す = () => { throw new DOMException('QuotaExceededError'); };
    try{
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get(){ return { getItem: 壊す, setItem: 壊す, removeItem: 壊す, clear: 壊す, key: 壊す, length: 0 }; },
      });
    }catch(e){}
  });
  let 保存不可 = null;
  try{
    await p2.goto(url, { waitUntil: 'load', timeout: 30000 });
    await p2.waitForTimeout(1500);
    保存不可 = await p2.evaluate(() => ({
      画面が出ている: !!document.getElementById('makeBtn'),
      曲は作れる: (() => { try{ document.getElementById('makeBtn').click(); return true; }catch(e){ return false; } })(),
      '⑤の保存が止まっている': !!document.getElementById('saveBtn') && document.getElementById('saveBtn').disabled,
      '上部の💾が止まっている': !!document.getElementById('topSaveBtn') && document.getElementById('topSaveBtn').disabled,
      案内が出ている: /この開き方では、曲を保存できません/.test(document.body.innerText),
      容量のせいにしていない: !/容量がいっぱい/.test(document.body.innerText),
    }));
  }catch(e){ 保存不可 = { 落ちた: e.message.slice(0, 80) }; }
  finally{ await p2.close(); }

  checks.push({ ok: !!保存不可 && 保存不可.画面が出ている && 保存不可.曲は作れる,
    label: '保存が使えなくてもアプリは動く（曲は作れて書き出せる）', info: JSON.stringify(保存不可) });
  checks.push({ ok: !!保存不可 && 保存不可['⑤の保存が止まっている'] && 保存不可['上部の💾が止まっている'],
    label: '保存ボタンが2つとも止まる（片方だけ残すと押しても何も起きない）' });
  checks.push({ ok: !!保存不可 && 保存不可.案内が出ている && 保存不可.容量のせいにしていない,
    label: '理由を画面に出す（容量のせいにして曲を消させない）' });

  /* 本体の並び順：この案内は status / zcLog を使うので最後に置くこと */
  const src = fs.readFileSync(APP_FILE, 'utf8');
  checks.push({ ok: src.lastIndexOf('__zcRecheckStorage') > src.lastIndexOf('function zcLSSet'),
    label: '保存の案内は本体より後ろに置いてある' });
  return { checks };
}
