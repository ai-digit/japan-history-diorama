# data/ — 配信データとライセンスの線引き

このディレクトリのファイルは**層が違う**。1つのライセンスで丸ごと覆えない。
全体の枠組みは `../LICENSE-DATA.md`、当社コードは `../LICENSE`、
同梱した他者コードは `../vendor/LICENSE.txt` を見ること。

| ファイル | 中身 | ライセンス |
|---|---|---|
| `sites.jsonl` | **正本**。30地点（1行1地点） | 下表のとおり**フィールドごと**に ND / BY |
| `sites.json` | `sites.jsonl` からの生成物（手で編集しない） | 同上 |
| `eras.json` | 11時代（手書き） | 同上 |
| `japan-coast.json` | Natural Earth 1:50m (v5.1.2) の派生 | **パブリックドメイン**（当社ライセンスの対象外） |
| `dem-japan.png` / `dem-japan.json` | 地理院タイル（標高タイル）の派生 | **国土地理院コンテンツ利用規約による**（当社ライセンスの対象外） |

---

## フィールドごとの線引き

**「散文っぽいもの」という判定に任せない。線は名前で引く。**
下の2つの表は当社の公開前検査が機械で読む（検査のスクリプトはこの配布には含まれない）。
`sites.jsonl` と `eras.json` に現れるフィールド名は、**どちらか一方に必ず載っていなければならない**。
新しいフィールドを足して分類を書き忘れると、その検査が**赤になる**
——これは fail-closed であって、警告ではない。

### CC BY-ND 4.0（当社が書いた散文。**改変不可**）

<!-- ND-FIELDS:BEGIN -->
`desc_ja` `desc_en` `note_ja` `note_en` `summary_ja` `summary_en`
`eras_note` `site_since_note` `built_basis_note` `no_designation` `note` `text` `what`
<!-- ND-FIELDS:END -->

- `desc_ja` / `desc_en` — 地点の解説文（本文）
- `note_ja` / `note_en` — `timeline` 各段の短い説明
- `summary_ja` / `summary_en` — 時代の概説（`eras.json`）
- `eras_note` — その地点の時代判定についての注記
- `site_since_note` — 跡地・史跡としての存続がいつ始まったと当社が判断したか、その理由
- `built_basis_note` — 築造年（`built`）を当社がどう置いたか、その理由（一次が何と言っているか）
- `no_designation` — 指定を受けていない理由の説明
- `note` — 出典の利用条件についての当社の観察（`sources[].note`・`rights.note`）
- `text` — 権利についての注記（`rights.text`）
- `what` — そのファイルが何であるかの説明（`meta.what`）

### CC BY 4.0（事実フィールド・構造。**改変可・帰属のみ**）

<!-- BY-FIELDS:BEGIN -->
`id` `ja` `en` `kana` `label_ja` `label_en` `lat` `lon` `pref_code` `kind` `tier`
`built` `built_basis` `keep_built` `ended` `site_since` `event_year` `era` `eras` `eras_exclude` `from` `to`
`years_ja` `years_en` `status` `added` `designated_name` `designated` `first_designated`
`category` `criteria` `notice_no` `first_notice_no` `authority` `name` `location` `point`
`role` `url` `retrieved` `link_policy` `image` `rights` `sources` `timeline` `meta`
`written_by`
<!-- BY-FIELDS:END -->

`built_basis` は `"our-anchor"` の1語しか取らない**印**である（当社が置いた起点であることを
画面の年代行に注記させる）。散文は隣の `built_basis_note` に分けてあり、そちらは ND 側に置いた。

座標・年代・指定区分・告示日・出典配列といった**事実そのものに著作権は及ばない**。
収録対象の選択と体系にデータベース著作物性がありうるので、BY を掛けて帰属だけを求める。

---

## 当社ライセンスの対象外（カーブアウト）

* **`criteria`（指定基準の類型名）は文化庁の告示の文言**である。BY 表に置いてあるのは
  「このフィールドは事実側だ」という分類であって、**当社が当該文言の権利者だという意味ではない**。
  引用部分の権利は各出典者に帰属する。
* **`sources[]` は参照であって転載ではない。** 出典先の本文を当社は複製していない。
* **`japan-coast.json`** — Natural Earth はパブリックドメイン。当社の加工（間引き・島の選別）に
  ついても権利主張はしない。
* **`dem-japan.png` / `dem-japan.json`** — 地理院タイル（標高タイル（基盤地図情報数値標高
  モデル））を加工して作成。出典: 国土地理院ウェブサイト
  https://maps.gsi.go.jp/development/ichiran.html ／
  規約: https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html
  **当社は当該規約の解釈を代弁しない。利用者は自分で規約に当たること。**
  帰属は **PNG の `tEXt`/`iTXt` チャンクにも焼き込んである**ので、画像ファイル単体で
  持ち出しても出典が付いてくる（`exiftool` や `pngcheck -t` で読める）。

## 保証しないもの

年代・区分・解説は**AIが作成し、人間の監修を経ていない**。判断に用いる場合は、
必ず `sources` 配列の一次出典に当たること。
