# 日本史ジオラマ / Japan History Diorama

日本列島の立体ジオラマの上に城と史跡を並べ、時代スライダーで歴史をたどる1枚もののWebページです。
標高は国土地理院の標高タイルを加工した実測値で、外部サービスへの通信は1件もありません。

A single-page 3D diorama of the Japanese archipelago: castles and heritage sites placed on real
terrain, browsable era by era with a time slider. Elevation is derived from Japanese government
elevation tiles. The page makes no external requests at all.

- 日本語で開く / Open in Japanese: `index.html`
- English: `index.html?lang=en`

---

## AI開示 / AI disclosure

この画面はAIが運営・応対しています。日本史ジオラマの解説文・実装・地図の構成は、株式会社DIGITのAIエージェントが作成しました。
人間ではありません。人間による監修は入っていません。支出・方針の承認は人間のオーナーが行います。

This screen is operated and answered by AI. The texts, code and map composition of Japan History
Diorama were produced by the AI agents of DIGIT Inc. Not by a human. No human editorial review was
applied. Spending and policy decisions are approved by the human owner.

## 配信とアクセスログについて / Hosting and access logs

本サイトは GitHub Pages で配信されます。GitHub は配信元として訪問者のIPアドレスを記録します（GitHubのセキュリティ目的）。当社はこれを受領も取得もしません。サイト自身は Cookie・外部リクエスト・アクセス解析を一切使いません。

This site is served by GitHub Pages. GitHub logs visitors' IP addresses for its own security purposes.
DIGIT neither receives nor obtains them. The site itself uses no cookies, no external requests, and no analytics.

---

## 手元で動かす / Run locally

`fetch` を使うため、ファイルを直接開く（`file://`）のではなく静的サーバ越しに開いてください。

```bash
python3 -m http.server 8080
# → http://localhost:8080/           （日本語）
# → http://localhost:8080/?lang=en   （English）
```

ビルド手順はありません。バンドラも、パッケージマネージャも、ビルド成果物も使いません。
`index.html` と `lib/` `data/` `vendor/` がそのまま配信される構成です。

No build step. No bundler, no package manager, no generated artifacts — `index.html` plus
`lib/`, `data/`, `vendor/` are served as they are.

## 中身 / What is in here

| パス | 中身 |
|---|---|
| `index.html` | ページ本体（HTML・CSS・描画コード） |
| `lib/mapcore.js` | 投影・標高サンプリング・時代判定などの純粋関数 |
| `data/sites.json` `data/sites.jsonl` | 史跡・城のデータ（同じ内容の2形式） |
| `data/eras.json` | 時代の区分と概説 |
| `data/japan-coast.json` | 海岸線（Natural Earth 由来の派生データ） |
| `data/dem-japan.png` `data/dem-japan.json` | 標高（国土地理院の標高タイル由来の派生データ）とそのヘッダ |
| `data/README.md` | データの各フィールドの意味と、ライセンスの線引き |
| `vendor/three/` | three.js r169（MIT・改変なし） |
| `vendor/LICENSE.txt` | 同梱した他者コードの許諾表示（MIT本文） |
| `LICENSE` `NOTICE` `LICENSE-DATA.md` | ライセンス3層 |

## 出典 / Attribution

- **地形**: 地理院タイル（標高タイル（基盤地図情報数値標高モデル））を加工して作成。
  出典: 国土地理院ウェブサイト。規約: 国土地理院コンテンツ利用規約。
  加工の内容と取得日は `data/dem-japan.json` に、また `data/dem-japan.png` の tEXt/iTXt チャンクに
  記録してあります（画像を単体で持ち出しても帰属が剥がれません）。
- **海岸線**: Natural Earth（パブリックドメイン）。
- **史跡情報**: 文化庁 国指定文化財等データベース。個々の出典と取得日は `data/sites.json` の
  各地点の `source` / `timeline[].sources` にあります。
- **3D描画**: three.js r169（MIT）。本文は `vendor/LICENSE.txt`。

## ライセンス / License

| 対象 | ライセンス |
|---|---|
| コード（`index.html`・`lib/`） | Apache License 2.0（`LICENSE`・`NOTICE`） |
| 解説文（散文） | CC BY-ND 4.0 |
| 構造化データ（座標・年代・指定区分・出典配列などの事実フィールド） | CC BY 4.0 |
| 地形・海岸線の派生データ、`vendor/` の他者コード | **当社ライセンスの対象外**（各出典者の条件による） |

線引きの詳細は `LICENSE-DATA.md` と `data/README.md` を参照してください。
散文と事実フィールドの区別は「散文っぽいもの」ではなく**フィールド名の列挙**で引いてあります。

Code is Apache-2.0; prose is CC BY-ND 4.0; structured factual data is CC BY 4.0. Terrain and
coastline derivatives, and the third-party code under `vendor/`, are **outside** DIGIT's license and
remain under their own sources' terms. See `LICENSE-DATA.md`.

## 誤りの指摘 / Corrections

史実・年代・出典の誤りを見つけたら、Issue で指摘してください。解説文は CC BY-ND 4.0（改変不可）ですが、
**誤りの指摘は歓迎します**——直すのは当社の仕事です。

Found a factual error? Please open an issue. The prose is ND (no derivatives), but corrections are
very welcome — fixing it is our job.

---

株式会社DIGIT / DIGIT Inc.

> 補記（2026-08-28）: ライセンスの線引きの**正本は `LICENSE-DATA.md`**——本READMEの表はその要約です。
