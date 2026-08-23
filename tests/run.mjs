#!/usr/bin/env node
/* ZCNOVA BGM Studio 検査一式
   ------------------------------------------------------------
   使い方:
       node tests/run.mjs              全部走らせる
       node tests/run.mjs 02           番号の合うものだけ走らせる
       ZC_UPDATE=1 node tests/run.mjs  指紋の控えを取り直す
       ZC_CHROME=/path/to/chrome ...   使う Chromium を指定する

   合格なら終了コード 0、1つでも落ちれば 1。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, ROOT } from './lib/serve.mjs';
import { openApp } from './lib/page.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2] || '';

const files = fs.readdirSync(path.join(HERE, 'cases')).filter(f => f.endsWith('.mjs')).sort()
  .filter(f => !only || f.startsWith(only));
if(!files.length){ console.error('走らせる検査がありません:', only); process.exit(1); }

const server = await startServer();
let browser, page, errors;
let pass = 0, fail = 0;
const started = Date.now();

try{
  ({ browser, page, errors } = await openApp(server.url));
  console.log('ZCNOVA BGM Studio 検査\n' + '='.repeat(56));

  for(const f of files){
    const mod = await import(path.join(HERE, 'cases', f));
    const t0 = Date.now();
    let res;
    try{
      res = await mod.run({ page, errors, root: ROOT, url: server.url });
    }catch(e){
      res = { checks: [{ ok: false, label: '検査そのものが落ちた', info: e.stack || e.message }] };
    }
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n${mod.name}  [${sec}秒]`);
    res.checks.forEach(c => {
      console.log(`  ${c.ok ? '✅' : '❌'} ${c.label}`);
      if(c.info) console.log('      ' + String(c.info).replace(/\n/g, '\n'));
      c.ok ? pass++ : fail++;
    });
  }
} finally {
  if(browser) await browser.close();
  await server.close();
}

const sec = ((Date.now() - started) / 1000).toFixed(1);
console.log('\n' + '='.repeat(56));
console.log(fail === 0 ? `✅ 全部合格（${pass}件 / ${sec}秒）` : `❌ ${fail}件 不合格（合格 ${pass}件 / ${sec}秒）`);
process.exit(fail === 0 ? 0 : 1);
