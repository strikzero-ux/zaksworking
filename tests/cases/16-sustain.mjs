/* ⑯ 伸びる音が「生きて」いるか
   ------------------------------------------------------------
   実楽器の伸ばす音は必ずゆらぐ（息・弓・胴の共鳴）。伸ばしている間の
   0.15〜8Hz のゆらぎを測ると、チェロ25〜43% / バイオリン16〜32% /
   フルート25% / トランペット10〜29% ある。
   ところが Tone 製の音源は **シンセ 0% / エレピ 0.2%** で、
   数学的に完全に一定の波が鳴り続けていた。人の耳はこれに順応できず
   「電子音声っぽい・不快」と感じる。

   ここで守るのは2つ。
     1. 止まっていた音源がちゃんと動いていること
     2. その揺れが Transport に同期していること
        ＝ **2回計算しても1サンプルも違わない**こと。
        同期を外すと「いつ再生を始めたか」で位相が変わり、
        再生で聴いた音と書き出したファイルの音が違うものになる。

   あわせて「はね」（立ち上がりの山 ÷ 伸ばしている所）も見る。
   直す前は シンセ6.3倍 / エレピ9.6倍で、ドンと出たあと細い音だけが
   残っていた（管弦楽器は1.3〜2.4倍）。 */
export const name = '⑯ 伸びる音の生きた揺れ';

export async function run({ page }){
  const r = await page.evaluate(async () => {
    function fft(re, im){ const n = re.length;
      for(let i=1,j=0;i<n;i++){ let b=n>>1; for(; j&b; b>>=1) j^=b; j^=b;
        if(i<j){ let t=re[i];re[i]=re[j];re[j]=t; t=im[i];im[i]=im[j];im[j]=t; } }
      for(let len=2;len<=n;len<<=1){ const a=-2*Math.PI/len, wr=Math.cos(a), wi=Math.sin(a);
        for(let i=0;i<n;i+=len){ let cr=1, ci=0;
          for(let k=0;k<len/2;k++){ const ur=re[i+k], ui=im[i+k];
            const vr=re[i+k+len/2]*cr - im[i+k+len/2]*ci, vi=re[i+k+len/2]*ci + im[i+k+len/2]*cr;
            re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
            const nc=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=nc; } } } }
    /* buildEngine と同じ順でつなぐ（揺れ → 出力そろえ） */
    async function 鳴らす(inst){
      return await Tone.Offline(({ transport }) => {
        const own = () => {};
        const v = makeVoice(inst, {}, false);
        const trim = new Tone.Gain(zcInstTrim(inst));
        const out = new Tone.Gain(1); trim.connect(out); out.toDestination();
        const wob = zcMakeWobble(inst, own);
        if(wob){ v.connect(wob); wob.connect(trim); } else { v.connect(trim); }
        transport.schedule(t => v.triggerAttackRelease('C4', 2.4, t, 0.8 * pitchTilt('C4')), 0.05);
        transport.start(0);
      }, 3.2);
    }
    function 調べる(buf){
      const d = buf.getChannelData(0), sr = buf.sampleRate;
      const k = Math.exp(-2*Math.PI*120/sr); let e = 0; const env = new Float64Array(d.length);
      for(let i=0;i<d.length;i++){ e = k*e + (1-k)*Math.abs(d[i]); env[i] = e; }
      const a = Math.floor(sr*0.6), b = Math.floor(sr*2.2);
      let N = 1; while(N*2 <= b-a) N *= 2;
      const re = new Float64Array(N), im = new Float64Array(N);
      let mean = 0; for(let i=0;i<N;i++) mean += env[a+i]; mean /= N;
      for(let i=0;i<N;i++){ const w = 0.5 - 0.5*Math.cos(2*Math.PI*i/(N-1)); re[i] = (env[a+i]-mean)*w; }
      fft(re, im);
      const sc = 2/(N*0.5);
      let 遅い = 0;
      for(let i=1;i<N/2;i++){ const f = i*sr/N, amp = Math.sqrt(re[i]*re[i]+im[i]*im[i])*sc;
        if(f >= 0.15 && f < 8) 遅い += amp*amp; }
      let 山 = 0; const p0 = Math.floor(sr*0.03), p1 = Math.floor(sr*0.35);
      for(let i=p0;i<p1;i++) if(env[i] > 山) 山 = env[i];
      return { 揺れ: +(Math.sqrt(遅い)/Math.max(mean,1e-9)*100).toFixed(1),
               はね: +(山/Math.max(mean,1e-9)).toFixed(2) };
    }
    const out = { 音色:{} };
    for(const inst of Object.keys(ZC_WOBBLE)){
      out.音色[(INSTRUMENTS[inst]||{}).label || inst] = 調べる(await 鳴らす(inst));
    }
    /* 同じものを2回계算して、1サンプルも違わないこと */
    const x = await 鳴らす('synth'), y = await 鳴らす('synth');
    const dx = x.getChannelData(0), dy = y.getChannelData(0);
    let 差 = 0; for(let i=0;i<dx.length;i++){ const v = Math.abs(dx[i]-dy[i]); if(v > 差) 差 = v; }
    out.二回計算した差 = 差;
    return out;
  });

  const 一覧 = Object.entries(r.音色)
    .map(([k,v]) => `${k} 揺れ${v.揺れ}%・はね${v.はね}倍`).join(' / ');
  const 止まっている = Object.entries(r.音色).filter(([, v]) => v.揺れ < 3).map(([k]) => k);
  const はねすぎ    = Object.entries(r.音色).filter(([, v]) => v.はね > 4).map(([k]) => k);
  return { checks: [
    { ok: 止まっている.length === 0,
      label: '伸ばす音が止まっていない（どれも3%以上ゆらぐ）',
      info: 止まっている.length ? '止まっている: ' + 止まっている.join(' / ') : 一覧 },
    { ok: はねすぎ.length === 0,
      label: '「はねて細くなる」形になっていない（立ち上がりが4倍以内）',
      info: はねすぎ.length ? '4倍を超えた: ' + はねすぎ.join(' / ')
                            : '直す前は シンセ6.3倍 / エレピ9.6倍だった' },
    { ok: r.二回計算した差 === 0,
      label: '揺れが曲の頭に同期している（2回計算して1サンプルも違わない）',
      info: r.二回計算した差 === 0 ? ''
        : `差 ${r.二回計算した差}。sync() を外すと再生と書き出しで音が変わる` },
  ] };
}
