# tests/vendor — 検査用に置いてある外部ライブラリの控え

本体は CDN から読み込みますが、検査はネットが無い所でも通したいので、
配信物とまったく同じものをここに置いています。

| ファイル | 版 | ライセンス | 取得元 |
|---|---|---|---|
| `Tone.js` | 14.8.49 | MIT | https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js |
| `lame.min.js` | lamejs 1.2.1 | LGPL-3.0 | https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js |

- どちらも**一切手を加えていない配信物そのもの**です。
- 本体 HTML に書いてある `integrity`（SHA-384）と、この2ファイルの
  ハッシュが一致することを `tests/cases/03-sri.mjs` が毎回確かめます。
- ライブラリの版を上げるときは、**ここのファイルも差し替えて**ください。
  差し替えないと 03 が「HTML に古い／余分なハッシュが残っている」で落ちます。
- lamejs は LGPL-3.0 のため、本体へ溶かし込まず別ファイルのまま置いています
  （LGPL の条件）。LAME 本家: https://lame.sourceforge.io/
