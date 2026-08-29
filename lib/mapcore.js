/**
 * mapcore.js — 3D に依存しない「地図の芯」。
 *
 * ここに three.js を import しない。理由: 投影・合成標高・時代フィルタ・
 * ラベル配置といった “間違えると気づきにくいロジック” を、ブラウザなしで
 * node からテストできるようにするため（tests/ から直接 import している）。
 *
 * 座標系（3D側の約束）:
 *   project(lon, lat) -> { x, z }   x=東, z=南（＝北が -z）。y は高さ。
 *   ExtrudeGeometry を rotation.x = -PI/2 で寝かせた時の向きに合わせてある。
 */

/* =============================================================== projection */

export const DEG = Math.PI / 180;

/**
 * 正距円筒図法（標準緯線つき）。日本ひと国ぶんの見た目地図なので、
 * 厳密な等角性より「形が素直で、緯度経度から一発で戻せる」ことを優先する。
 *
 * @param {[number,number,number,number]} bbox [minLon,minLat,maxLon,maxLat]
 * @param {{targetSize?:number}} opts targetSize = 出来上がりの最大辺（ワールド単位）
 */
export function makeProjection(bbox, { targetSize = 22 } = {}) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lonC = (minLon + maxLon) / 2;
  const latC = (minLat + maxLat) / 2;
  const kx = Math.cos(latC * DEG); // 標準緯線での経度→距離の縮み
  const wDeg = (maxLon - minLon) * kx;
  const hDeg = maxLat - minLat;
  const scale = targetSize / Math.max(wDeg, hDeg);

  const project = (lon, lat) => ({
    x: (lon - lonC) * kx * scale,
    z: -(lat - latC) * scale,
  });
  const unproject = (x, z) => ({
    lon: x / (kx * scale) + lonC,
    lat: -z / scale + latC,
  });

  return {
    project, unproject, scale, kx, lonC, latC,
    width: wDeg * scale,
    height: hDeg * scale,
    /** ワールド単位 → おおよそのkm（縮尺表示用） */
    unitsToKm: (u) => (u / scale) * 111.32,
  };
}

/* ==================================================================== noise */

/** 2D 整数ハッシュ → [0,1)。決定的（同じ入力なら常に同じ絵になる）。 */
export function hash2(ix, iy) {
  let h = (ix | 0) * 374761393 + (iy | 0) * 668265263;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** 値ノイズ（バイリニア＋スムーズステップ）。 */
export function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** オクターブを重ねた fBm。 */
export function fbm(x, y, octaves = 4) {
  let sum = 0, amp = 0.5, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(fx, fy) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03; fy *= 2.07;
  }
  return sum / norm;
}

/** 決定的な擬似乱数（mulberry32）。地形の散らばりを毎回同じにする。 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================================================== synthetic elevation ==== */

/**
 * 山脈の「芯」。実在の山地・山脈のおおよその位置に線分を置いてある。
 * これは **合成データ**（実際の標高ではない）。h は 0..1 の相対的な高さ感。
 *
 *  ▼▼▼ 実DEM差し替えポイント ▼▼▼
 *  国土地理院の標高タイル（DEM10B / DEM5A、出典表示が必要）を採用する際は、
 *  この RIDGES と heightAt() をまるごと「タイルから引いた実標高」に置き換える。
 *  3D 側は heightAt(lon, lat) -> 0..1 という契約しか見ていないので、
 *  差し替えは index.html を触らずに済む。
 *  参考: https://maps.gsi.go.jp/development/ichiran.html （利用規約の確認が必要）
 *  ▲▲▲
 */
export const RIDGES = [
  // 北海道
  { a: [142.90, 43.35], b: [143.05, 42.30], r: 0.34, h: 0.55, name: '日高山脈' },
  { a: [142.35, 43.35], b: [142.95, 43.95], r: 0.38, h: 0.62, name: '石狩・大雪' },
  { a: [140.85, 42.70], b: [141.10, 42.55], r: 0.22, h: 0.35, name: '渡島' },
  // 東北
  { a: [140.80, 40.45], b: [140.40, 37.45], r: 0.32, h: 0.52, name: '奥羽山脈' },
  { a: [140.05, 39.45], b: [139.90, 38.30], r: 0.28, h: 0.36, name: '出羽山地' },
  { a: [141.50, 40.00], b: [141.60, 38.90], r: 0.28, h: 0.30, name: '北上高地' },
  { a: [140.85, 39.85], b: [140.85, 39.85], r: 0.18, h: 0.48, name: '岩手山・八幡平' },
  { a: [140.05, 39.10], b: [140.05, 39.10], r: 0.15, h: 0.46, name: '鳥海山' },
  { a: [140.44, 38.14], b: [140.44, 38.14], r: 0.16, h: 0.40, name: '蔵王' },
  // 中部
  { a: [139.20, 37.50], b: [138.70, 36.70], r: 0.30, h: 0.52, name: '越後山脈' },
  { a: [137.60, 36.72], b: [137.72, 35.98], r: 0.28, h: 0.88, name: '飛騨山脈（北アルプス）' },
  { a: [137.85, 35.90], b: [138.00, 35.38], r: 0.20, h: 0.72, name: '木曽山脈' },
  { a: [138.20, 35.90], b: [138.30, 35.28], r: 0.26, h: 0.82, name: '赤石山脈（南アルプス）' },
  { a: [138.37, 35.97], b: [138.37, 35.97], r: 0.16, h: 0.58, name: '八ヶ岳' },
  { a: [136.77, 36.15], b: [136.77, 36.15], r: 0.20, h: 0.60, name: '白山' },
  { a: [138.73, 35.36], b: [138.73, 35.36], r: 0.20, h: 1.00, name: '富士山' },
  { a: [138.90, 36.05], b: [139.25, 35.72], r: 0.24, h: 0.46, name: '関東山地' },
  { a: [139.15, 35.45], b: [139.15, 35.45], r: 0.15, h: 0.32, name: '丹沢' },
  // 近畿・中国・四国
  { a: [136.40, 35.35], b: [136.18, 34.90], r: 0.20, h: 0.36, name: '伊吹・鈴鹿' },
  { a: [135.70, 34.20], b: [136.10, 34.02], r: 0.32, h: 0.50, name: '紀伊山地' },
  { a: [132.00, 34.95], b: [134.50, 35.20], r: 0.32, h: 0.34, name: '中国山地' },
  { a: [132.90, 33.75], b: [134.00, 33.88], r: 0.28, h: 0.46, name: '四国山地' },
  // 九州・南西諸島
  { a: [130.95, 32.20], b: [131.55, 32.90], r: 0.32, h: 0.46, name: '九州山地' },
  { a: [131.08, 32.88], b: [131.08, 32.88], r: 0.20, h: 0.42, name: '阿蘇' },
  { a: [130.87, 31.92], b: [130.87, 31.92], r: 0.18, h: 0.36, name: '霧島' },
  { a: [130.50, 30.35], b: [130.50, 30.35], r: 0.13, h: 0.40, name: '屋久島' },
  { a: [128.00, 26.55], b: [128.25, 26.72], r: 0.13, h: 0.14, name: '沖縄本島北部' },
];

/** 点 p から線分 ab までの距離（度、経度は緯度で補正しない＝見た目優先）。 */
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cy = ay + dy * t;
  return Math.hypot(px - cx, py - cy);
}

/**
 * **合成**標高。0（海面すれすれ）〜 1（富士山あたり）。
 * 山脈線分からの距離をなだらかな釣鐘に通し、細かいノイズを少し足しただけ。
 * 実測ではない — README の「合成 vs 実測」を参照。
 *
 * 2026-08-28 以降、既定の出どころは**国土地理院の実測DEM**（`installElevationGrid`）に
 * なった。この関数は「格子が入っていない時の代替」として残してある
 * （オフラインの単体テスト・PNGが読めなかった時のフォールバック）。
 */
export function syntheticHeightAt(lon, lat) {
  let h = 0;
  for (const r of RIDGES) {
    const d = distToSegment(lon, lat, r.a[0], r.a[1], r.b[0], r.b[1]);
    if (d > r.r * 2.4) continue;
    const t = d / (r.r * 2.4);
    const fall = Math.exp(-3.2 * t * t); // 釣鐘
    h = Math.max(h, r.h * fall);
    h += r.h * fall * 0.18; // 山脈が重なる所は少し盛る
  }
  // 低い丘陵のざらつき（山が無い所でものっぺりさせない）
  h += fbm(lon * 2.3 + 17.5, lat * 2.3 + 3.1, 3) * 0.16;
  return Math.max(0, Math.min(1.35, h));
}

/* ============================================== 実測DEM（焼き込み格子） ==== */

/**
 * ビルド時に焼き込んだ標高格子。`tools/bake-dem.mjs` が国土地理院の標高タイルから
 * 作る `data/dem-japan.png` + `data/dem-japan.json` を、ブラウザ側は canvas 経由、
 * node 側は `tools/pngio.mjs` 経由で読み込んで**ここに挿す**。
 *
 * 3D側の契約は前から `heightAt(lon,lat) -> 0..1` のただ1本で、
 * 差し替え口はここしかない（README §2「実DEMへの差し替え口」）。
 * 挿さっていなければ `syntheticHeightAt` に落ちるので、**読み込みに失敗しても地図は出る**。
 */
let ELEV = null;

/**
 * @param {{width:number,height:number,bbox:number[],data:Uint8Array|number[],stops?:number[][]}} grid
 */
export function installElevationGrid(grid) {
  if (!grid) { ELEV = null; return null; }
  const { width, height, bbox, data } = grid;
  if (!width || !height || !Array.isArray(bbox) || bbox.length !== 4) {
    throw new Error('installElevationGrid: width/height/bbox が要る');
  }
  if (data.length !== width * height) {
    throw new Error(`installElevationGrid: 画素数が合わない（${data.length} != ${width}x${height}）`);
  }
  ELEV = { width, height, bbox, data, stops: grid.stops || null };
  return ELEV;
}

/** 今どちらの標高を使っているか。'dem' か 'synthetic'。 */
export const elevationSource = () => (ELEV ? 'dem' : 'synthetic');
export const elevationGrid = () => ELEV;

/** 焼き込み格子からのバイリニア取り出し（0..1）。枠の外は0（海）。 */
export function gridHeightAt(lon, lat, grid = ELEV) {
  if (!grid) return 0;
  const [minLon, minLat, maxLon, maxLat] = grid.bbox;
  const fx = ((lon - minLon) / (maxLon - minLon)) * (grid.width - 1);
  const fy = ((maxLat - lat) / (maxLat - minLat)) * (grid.height - 1);
  if (!(fx >= 0 && fy >= 0 && fx <= grid.width - 1 && fy <= grid.height - 1)) return 0;
  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  const i1 = Math.min(i0 + 1, grid.width - 1), j1 = Math.min(j0 + 1, grid.height - 1);
  const tx = fx - i0, ty = fy - j0;
  const d = grid.data;
  const a = d[j0 * grid.width + i0], b = d[j0 * grid.width + i1];
  const c = d[j1 * grid.width + i0], e = d[j1 * grid.width + i1];
  return ((a + (b - a) * tx) * (1 - ty) + (c + (e - c) * tx) * ty) / 255;
}

/**
 * 0..1 の高さ → おおよそのメートル。`stops`（bake-dem.mjs が書き出す区分線形の対応表）を
 * 逆に引く。**概算である**（8bit量子化・1〜2km格子・平滑化を経ているので、
 * 山頂の実標高より低めに出る。フッタと README にそう書く）。
 */
export function unitToMeters(u, stops = ELEV && ELEV.stops) {
  if (!stops || !stops.length) return null;
  if (u <= stops[0][1]) return stops[0][0];
  for (let i = 1; i < stops.length; i++) {
    const [m0, u0] = stops[i - 1], [m1, u1] = stops[i];
    if (u <= u1) return m0 + ((u - u0) / (u1 - u0)) * (m1 - m0);
  }
  return stops[stops.length - 1][0];
}

/**
 * 標高（0..1）。**焼き込んだ実測DEMが入っていればそれを、無ければ合成値を返す。**
 * 呼ぶ側（陸のテクスチャ・山の配置）はどちらか知らなくてよい。
 */
export function heightAt(lon, lat) {
  return ELEV ? gridHeightAt(lon, lat) : syntheticHeightAt(lon, lat);
}

/* ==================================================== geometry predicates == */

/** レイキャスティング法。ring は [[lon,lat], ...]（閉じていなくてよい）。 */
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** japan-coast.json の polygons に対する陸判定（穴も見る）。 */
export function pointInLand(lon, lat, polygons) {
  for (const p of polygons) {
    if (!pointInRing(lon, lat, p.rings[0])) continue;
    let inHole = false;
    for (let i = 1; i < p.rings.length; i++) {
      if (pointInRing(lon, lat, p.rings[i])) { inHole = true; break; }
    }
    if (!inHole) return p;
  }
  return null;
}

/** リングの bbox。 */
export function ringBBox(ring) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of ring) {
    if (x < a) a = x; if (y < b) b = y;
    if (x > c) c = x; if (y > d) d = y;
  }
  return [a, b, c, d];
}

/* ================================================================== 陸判定 */

/**
 * 陸判定の索引。外接矩形で足切りしてから多角形に入る。
 * 山の配置で数万回呼ぶので、ここが素朴だと起動が目に見えて遅くなる。
 * （`index.html` の `isLand()` はこれを使う。**同じ判定を2箇所に書かない**）
 */
export function makeLandIndex(polygons) {
  const items = polygons.map((p) => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [lon, lat] of p.rings[0]) {
      if (lon < a) a = lon; if (lat < b) b = lat;
      if (lon > c) c = lon; if (lat > d) d = lat;
    }
    return { poly: p, bbox: [a, b, c, d] };
  });
  return {
    items,
    isLand(lon, lat) {
      for (const it of items) {
        const bb = it.bbox;
        if (lon < bb[0] || lon > bb[2] || lat < bb[1] || lat > bb[3]) continue;
        if (pointInLand(lon, lat, [it.poly])) return true;
      }
      return false;
    },
  };
}

/* ==================================================================== 山 === */

/**
 * 山を置かない半径（ワールド単位）を1地点ぶん決める。
 *
 * ## なぜ固定半径をやめたか（tech-ishi §2.2 の実測）
 *
 * v0.2 は全地点いっぺんに `HILL_CLEAR = 0.52` の**正方形**を禁止区域にしていた。
 * 1ワールド単位 = 107.5km なので、これは1地点あたり約12,500km²。日本の陸地は約378,000km²。
 * 30件なら成立するが、**100件で山が595→179本、400件で15本**まで消えた
 * （＝地点を増やすと地形が消える設計だった）。
 *
 * ## 置き換えの考え方
 *
 *   1. 出発点は**そのマーカーが実際に地面を覆う半径** `footR`（＝描かれている足元）。
 *      「山がマーカーに刺さらない」ために必要なのはここまでで、それ以上は根拠が無い。
 *   2. `tier` でわずかに増減させる（重要な地点の足元は少し広く空ける）。
 *   3. **近くに他の地点が n 件あるとき 1/√(1+n) に縮める**。ここが地点数からの独立化の核心で、
 *      密集地帯（畿内など）で禁止区域が面積として飽和するのを防ぐ。孤立した地点の
 *      見え方は v0.2 とほぼ同じ（0.515 ≒ 0.52）まま、密集地帯だけが緩む。
 *
 * @param {{x:number,z:number,tier?:number,footR?:number}} site
 * @param {Array} sites 同じ形の全地点（自分を含んでよい）
 */
export const HILL_CLEAR_OPTS = {
  min: 0.16,        // これ以下にすると山がマーカーに刺さる
  max: 0.62,        // 孤立地点でもこれ以上は空けない
  footK: 1.30,      // 足元半径の何倍を空けるか（1.128倍で v0.2 の正方形と同じ面積）
  tierK: { 1: 1.06, 2: 1.00, 3: 0.92 },
  near: 1.6,        // 「近く」の定義（ワールド単位。約170km）
  densScale: 0.35,  // 近傍1件あたりの効き。0 にすると密度連動が消える
  fallbackFootR: 0.42,
};

export function hillClearRadius(site, sites, opts = {}) {
  const o = { ...HILL_CLEAR_OPTS, ...opts };
  let n = 0;
  const near2 = o.near * o.near;
  if (o.near > 0 && o.densScale > 0) {
    for (const t of sites) {
      if (t === site) continue;
      const dx = t.x - site.x, dz = t.z - site.z;
      if (dx * dx + dz * dz < near2) n++;
    }
  }
  const foot = Number.isFinite(site.footR) && site.footR > 0 ? site.footR : o.fallbackFootR;
  const k = o.tierK[site.tier] || o.tierK[2];
  return clamp((foot * o.footK * k) / Math.sqrt(1 + n * o.densScale), o.min, o.max);
}

/**
 * 列島に置く山を決める（**three.js を使わない純粋な計算**）。
 * index.html はこの結果を InstancedMesh に流し込むだけにしてある。
 * こうしないと「地点を増やすと山が消える」類の事故を node から測れない
 * （実際 v0.2 の消失は、ブラウザのコンソールを目で読むまで誰も気づかなかった）。
 *
 * @returns {{tiers:Array<Array>, snow:Array, radii:Map<any,number>, candidates:number}}
 */
/**
 * 山の見え方のつまみ。**実測DEMに替えた時に、v0.2 の絵に合わせ直した値**である
 * （合成標高と実測では 0..1 の意味が違うので、そのままだと山も雪も消える）。
 * 【実測 2026-08-28 / 30地点・`tools/hill_bench.mjs`】
 *   v0.2（合成＋固定クリアランス）: 山 616本 (190/334/92) 雪 30
 *   本設定（実測DEM＋密度連動）    : 山 623本 (180/387/56) 雪 18
 */
export const HILL_TUNE = {
  step: 0.15,        // 候補グリッド（度）
  keepBase: 0.05,    // 平地をどれだけ残すか（低いほど平野がすっきりする）
  keepGain: 1.9,     // 標高で立ち上がる速さ
  bandMid: 0.20,     // ここから中段（濃い緑）。実測DEMで約 340m
  bandHi: 0.50,      // ここから高段（岩色）。実測DEMで約 1,240m
  snowAt: 0.55,      // 雪をかぶる山の高さ（ワールド単位の cone 高さ）
};

/**
 * @param {object} a
 * @param {number[]} a.bbox  [minLon,minLat,maxLon,maxLat]
 * @param {object} a.proj    makeProjection の戻り
 * @param {Array}  a.sites   [{id,x,z,tier,footR}]
 * @param {(lon:number,lat:number)=>boolean} a.isLand
 */
export function planHills({ bbox, proj, sites, isLand, seed = 20260824,
                            clearOpts = {}, clearShape = 'circle', tune = {} }) {
  const T = { ...HILL_TUNE, ...tune };
  const { step, keepBase, keepGain, bandMid, bandHi, snowAt } = T;
  const rng = makeRng(seed);
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const radii = new Map();
  const square = clearShape === 'square';   // v0.2 の再現用（ベンチが旧規則を出すため）
  const clearings = sites.map((s) => {
    const r = hillClearRadius(s, sites, clearOpts);
    radii.set(s.id ?? s, r);
    return [s.x, s.z, square ? r : r * r];
  });

  const tiers = [[], [], []];
  const snow = [];
  let candidates = 0;
  for (let lat = minLat; lat <= maxLat; lat += step) {
    for (let lon = minLon; lon <= maxLon; lon += step) {
      const jl = lon + (rng() - 0.5) * step * 0.9;
      const jb = lat + (rng() - 0.5) * step * 0.9;
      if (!isLand(jl, jb)) continue;
      candidates++;

      const h = heightAt(jl, jb);
      // 低いところは間引く。高いところは必ず置く。
      const keep = clamp(keepBase + h * keepGain, 0, 1);
      if (rng() > keep) continue;

      const p = proj.project(jl, jb);
      let tooClose = false;
      for (let i = 0; i < clearings.length; i++) {
        const dx = p.x - clearings[i][0], dz = p.z - clearings[i][1];
        const hit = square
          ? (Math.abs(dx) < clearings[i][2] && Math.abs(dz) < clearings[i][2])
          : (dx * dx + dz * dz < clearings[i][2]);
        if (hit) { tooClose = true; break; }
      }
      if (tooClose) continue;

      const hh = 0.10 + h * 0.72 * (0.82 + rng() * 0.36);
      const rr = (0.105 + h * 0.115) * (0.78 + rng() * 0.5);
      const rot = rng() * Math.PI * 2;
      const tilt = (rng() - 0.5) * 0.16;
      const tiltDir = rng() * Math.PI * 2;
      const tier = h > bandHi ? 2 : h > bandMid ? 1 : 0;
      const o = { x: p.x, z: p.z, h: hh, r: rr, rot, tilt, tiltDir };
      tiers[tier].push(o);
      // 雪は「いちばん高い所だけ」。閾値を下げると列島じゅうが白くなって、
      // アルプスの意味が消える。
      if (hh > snowAt) snow.push(o);
    }
  }
  return { tiers, snow, radii, candidates };
}

/* ========================================================= era & site logic */

/** 年 → 時代 id（境界が重なる時は後の時代を採る）。範囲外は null。 */
export function eraOfYear(eras, year) {
  let hit = null;
  for (const e of eras) if (year >= e.from && year <= e.to) hit = e;
  return hit;
}

/**
 * 跡地相に段が無いときに採る姿（G-184）。`tools/sites.py SITE_PHASE_KIND` と同じ値。
 * **「いま何が建っているか分からない」ときの逃げ場**であって、機能期の姿を
 * 現代へ持ち越さないための既定である（2026年の地図に「秀吉の城」を立てない）。
 */
export const SITE_PHASE_KIND = 'ruins';

const eraById = (eras, id) => (Array.isArray(eras) ? eras.find((e) => e.id === id) : null) || null;
const overlaps = (era, a, b) => era.to >= a && era.from <= b;

/**
 * その時代が**跡地相**（`site_since` 以降・史跡として存続している相）に入っているか。
 *
 * 境界の時代——`site_since` を含みながら機能期とも重なる時代——は **機能期として扱う**。
 * 跡地相へ倒すと「まだ城だった年」を遺跡シルエットで描くことになるからで、
 * そういう地点は段を手で書くべきである（`tools/sites.py site_phase_era_ids` と同じ判定）。
 *
 * @param {{ended?:number|null, site_since?:number|null, built?:number|null}} site
 * @param {{id:string, from:number, to:number}|null} era
 */
export function inSitePhase(site, era) {
  if (!site || !era) return false;
  const since = site.site_since;
  if (since == null || era.to < since) return false;
  const ended = site.ended;
  if (ended != null && era.from <= ended) return false;   // 機能期と重なる時代は機能期
  return true;
}

/** その時代に「存在していた」地点か。era タグを正とする。 */
export function siteInEra(site, eraId) {
  return Array.isArray(site.eras) && site.eras.includes(eraId);
}

export function sitesInEra(sites, eraId) {
  return sites.filter((s) => siteInEra(s, eraId));
}

/**
 * その時代に効いている `timeline` の項目を返す（無ければ null）。
 *
 * **「その時代ちょうどの項目」ではなく「その時代までに起きた最後の変化」を返す**のが要点。
 * 江戸城は 室町(太田道灌の城) → 安土桃山(家康入城) → 江戸(将軍の城) → 明治(皇居) と
 * 4回しか姿を変えないが、時代は11ある。全時代ぶんの項目を書かせると、
 * 同じ文を何度も書くことになり、**書き手が必ず食い違わせる**。
 *
 * **繰り上げは相の中でだけ効く**（G-184。`eras` を渡した時）。機能期の段が跡地相へ
 * 繰り上がると、平城京の 2026年に「平城京」の説明が出る——都は 784年に終わっている。
 * 1100年の空白は欠落ではなく事実なので、相をまたいだ段は「無い」と答える。
 * `eras` を渡さない古い呼び出しは今までどおり（相を見ない）。
 *
 * @param {{timeline?:Array, ended?:number|null, site_since?:number|null}} site
 * @param {string} eraId いま表示している時代
 * @param {string[]} eraIds `eras.json` の並び（時代の前後関係の唯一の出所）
 * @param {Array<{id:string,from:number,to:number}>|null} eras 相を見るなら `eras.json` の配列
 */
export function timelineAt(site, eraId, eraIds, eras = null) {
  const tl = site && site.timeline;
  if (!Array.isArray(tl) || !tl.length) return null;
  const now = eraIds.indexOf(eraId);
  if (now < 0) return null;
  const wantSite = eras ? inSitePhase(site, eraById(eras, eraId)) : null;
  let best = null, bestIdx = -1;
  for (const t of tl) {
    const i = eraIds.indexOf(t.era);
    if (i < 0 || i > now) continue;
    if (eras && inSitePhase(site, eraById(eras, t.era)) !== wantSite) continue;
    if (i > bestIdx) { bestIdx = i; best = t; }
  }
  return best;
}

/**
 * その時代の姿（kind）。timeline があればそれを、無ければ地点の既定 kind。
 * **跡地相で段が無い時だけ `SITE_PHASE_KIND`**（`eras` を渡した時。G-184）——
 * 既定 kind をそのまま出すと、集落遺跡が 2026年に竪穴住居として立つ。
 */
export function kindAt(site, eraId, eraIds, eras = null) {
  const t = timelineAt(site, eraId, eraIds, eras);
  if (t && t.kind) return t.kind;
  if (eras && inSitePhase(site, eraById(eras, eraId))) return SITE_PHASE_KIND;
  return site.kind;
}

/** その時代の呼び名。timeline があればそれを、無ければ地図用の短縮名。 */
export function labelAt(site, eraId, eraIds, lang = 'ja', eras = null) {
  const t = timelineAt(site, eraId, eraIds, eras);
  const key = lang === 'ja' ? 'label_ja' : 'label_en';
  if (t && t[key]) return t[key];
  return lang === 'ja' ? (site.label_ja || site.ja) : (site.label_en || site.en);
}

/** その地点が時代で姿・呼び名を変えるか（タイムラプスを持っているか）。 */
export const hasTimeline = (site) => Array.isArray(site.timeline) && site.timeline.length > 0;

/** timeline に出てくる kind をすべて集める（マーカーのスロット確保に使う）。 */
export function kindsOf(site) {
  const out = [site.kind];
  for (const t of (site.timeline || [])) if (t.kind && !out.includes(t.kind)) out.push(t.kind);
  // 跡地相を持つ地点は、段が無い時代で `SITE_PHASE_KIND` に倒れうる。
  // スロットを確保しておかないと、時代を送った瞬間に置き場所が無くなる（G-184）。
  if (site.site_since != null && !out.includes(SITE_PHASE_KIND)) out.push(SITE_PHASE_KIND);
  return out;
}

/** 年の表示（負の年＝紀元前）。 */
export function formatYear(year, lang = 'ja') {
  if (year == null || Number.isNaN(year)) return lang === 'ja' ? '—' : '—';
  if (year < 0) return lang === 'ja' ? `紀元前${Math.abs(year)}年` : `${Math.abs(year)} BCE`;
  return lang === 'ja' ? `${year}年` : `${year} CE`;
}

/**
 * `built` が一次で裏づかず、**当社が地図上の起点として置いた年**であることの印
 * （`sites.jsonl` の `built_basis`。G-187 / シノ §12-7 N-3）。
 */
export const BUILT_ANCHOR = 'our-anchor';

/**
 * 年代行に起点の注記を出す地点か。**判定はデータの印だけを見る**——
 * ここに地点idの一覧を書くと、データを直しても画面が直らない（印が印でなくなる）。
 */
export function isBuiltAnchored(site) {
  return !!site && site.built_basis === BUILT_ANCHOR && site.built != null;
}

/**
 * 起点の注記。**日英で同じ事実を言う**（片方の言語だけ裸の数字、という状態を作らない）。
 *
 * なぜ年代行の中に置くか（シノ §12-7 N-3）: 開示そのものは既に段の note にあったが、
 * 数字は「年代」行に、開示は画面の別の場所にあった。読者が数字を読む場所と、
 * その数字がどこから来たかを読む場所が違えば、**開示は在っても届かない**。
 */
export const BUILT_ANCHOR_NOTE = {
  ja: '（この地図が置いた起点。同時代の記録は無い）',
  en: ' (a starting point placed by this map; no contemporary record)',
};

/**
 * 地点カードの「年代」行をつくる。**これは機能期の年である**（G-184）——
 * 都・城・集落として働いていた期間で、跡地としての存続は別の行（`sitePhaseText`）に出す。
 * 1行に押し込むと「784年に終わった場所が2026年の地図に出ている」の説明にならない。
 *
 * `built_basis` の印がある地点は、**同じ行に**起点の注記を付ける（G-187）。
 */
export function lifespanText(site, lang = 'ja') {
  const b = site.built, d = site.ended;
  const note = isBuiltAnchored(site) ? (lang === 'ja' ? BUILT_ANCHOR_NOTE.ja : BUILT_ANCHOR_NOTE.en) : '';
  if (b == null && d == null) return lang === 'ja' ? '年代不詳' : 'Date not fixed';
  if (b != null && d != null) return `${formatYear(b, lang)} – ${formatYear(d, lang)}${note}`;
  if (b != null) {
    return lang === 'ja' ? `${formatYear(b, lang)} 〜${note}` : `${formatYear(b, lang)} –${note}`;
  }
  return lang === 'ja' ? `〜 ${formatYear(d, lang)}` : `– ${formatYear(d, lang)}`;
}

/** 跡地・史跡として存続を始めた年の行。`site_since` が無ければ null（行を出さない）。 */
export function sitePhaseText(site, lang = 'ja') {
  if (!site || site.site_since == null) return null;
  return lang === 'ja' ? `${formatYear(site.site_since, lang)} 〜`
                       : `${formatYear(site.site_since, lang)} –`;
}

/* ================================================================== inset */

/**
 * インセット（沖縄の別枠）が受け持つ緯度の線。**本体の収まり計算が外している線と同じ1本**
 * である（`buildFitPoints` の `isMain = lat >= INSET_LAT_MAX`）——ここを2箇所に別々の数で
 * 書くと、「本体の枠には収めないが本体には描く」地点が生まれ、その地点だけが
 * 制御から漏れる。G-219 の差し戻し（枠だけ畳んで中身が残った）はその形だった。
 */
export const INSET_LAT_MAX = 30;

/** その地点をインセットが受け持つか（＝本体の絵では畳んでよい側か）。 */
export const isInsetSite = (site) => !!site && Number(site.lat) < INSET_LAT_MAX;

/**
 * 「読者が折り返しの下へ送り始めた」の線（px）。4px は指やホイールが触れただけを
 * 送りと数えないための遊びで、`#inset` を畳む条件と**同じ値でなければならない**。
 */
export const INSET_FOLD_SCROLL = 4;

/**
 * 送り始めたか＝**沖縄の見せ方をまとめて畳むか**。
 *
 * 畳む対象は4つあり、**全部がこの1本の述語を共有する**:
 *   ① 枠と見出し（`#inset` の `display`）
 *   ② 中身（インセット用カメラの WebGL シザー描画）
 *   ③ ラベル（`updateLabels` の配置経路。**配置に入れたまま隠すのではなく、
 *      配置計算そのものに入れない**——入れると箱を失った生テキストだけが残る）
 *   ④ 本体の絵に立っている同じ地点のマーカー（模型・接地影・足元の円盤）
 *
 * ①だけに掛かっていたのが G-219 差し戻しの中身である。時代バーの薄紙（`#erabar` の
 * ぼかし）は台といっしょに上へ流れるが、キャンバスとラベルは `fixed` で画面に残るので、
 * 送るほど「薄紙が隠していた沖縄」が見切れの帯（`#fold-cue`）に**現れる**
 * ——1280x720 実測で首里城の屋根と影が帯の x57〜213px に出た（G-224）。
 */
export const insetFolded = (scrollY = 0) => Number(scrollY) > INSET_FOLD_SCROLL;

/* =============================================================== label flow */

/**
 * ラベルの重要度の重み。**`tier` がここに入っていなかったことが、
 * 「地点を30→100に増やすと画面に出る"本物の城の名前"が11→8件に減る」の直接の原因**だった
 * （tech-ishi §2.3 の実測）。選ばれ方が実質「カメラに近い順」＝ほぼ運になっていた。
 */
export const TIER_WEIGHT = { 1: 3, 2: 2, 3: 1 };

/**
 * ラベルの優先度。**選択 > ホバー > tier > その時代に生きている > 手前** の順で効く。
 * 桁を分けてあるので、下位の項がどれだけ大きくても上位を逆転しない。
 *
 * @param {{tier?:number, alive?:number, depth?:number, selected?:boolean, hovered?:boolean}} a
 */
export function labelPriority({ tier = 2, alive = 0, depth = 0, selected = false, hovered = false }) {
  return (selected ? 1e6 : 0)
       + (hovered ? 1e5 : 0)
       + (TIER_WEIGHT[tier] || 1) * 1000
       + clamp(alive, 0, 1) * 100
       + (1 - clamp(depth, -1, 1)) * 10;
}

/**
 * LOD の2点（カメラ距離・ワールド単位）。**ラベルの本数（`labelBudget`）と
 * 模型の譲り合い（`reliefFloor`）が同じ2点を共有する。**
 * 同じ問いに2つの数を持つと、片方だけ動かした日に「名前は増えたのに模型は退いたまま」
 * のような、画面の上でしか気づけない食い違いになる（G-138 で一度払った授業料と同じ形）。
 */
export const LOD_NEAR = 7;
export const LOD_FAR = 14;

/**
 * 同時に出してよいラベルの数（LOD）。
 * 【実測 tech-ishi §4.2】俯瞰の画面に34px以上離して置ける地点数は **20〜25件が上限**。
 * データが何件になっても俯瞰はここで頭打ちにする — でないと、量を増やすほど
 * 画面の情報が減る（＝重要な地点の名前が、重要でない地点に消される）。
 */
export function labelBudget(dist, { overview = 25, close = 40, far = LOD_FAR, nearD = LOD_NEAR } = {}) {
  if (!(dist > 0)) return overview;
  if (dist >= far) return overview;
  if (dist <= nearD) return close;
  return Math.round(overview + (close - overview) * ((far - dist) / (far - nearD)));
}

/**
 * 2つの矩形の重なり（重なっていなければ `null`）。
 *
 * **`getBoundingClientRect()` の形（left/right/top/bottom）をそのまま受ける。**
 * 実ブラウザで測った値を、検査の側で作り直さずに渡せるようにするためで、
 * ラベル同士の回避（`layoutLabels`）と、HTMLの板同士の重なり検査
 * （`build/check-layout.mjs`: カード対時代バー・G-190）が**同じ1本の判定**を使う。
 * 判定を2本持つと、片方だけ直したときに「テストは緑・画面は重なったまま」になる。
 *
 * 辺が一致するだけ（`right === left`）は重なりではない——隣り合わせに置いた板が
 * 毎回赤くなると、検査そのものが無視されるようになる。
 */
export function overlapRect(a, b) {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  if (!(right > left && bottom > top)) return null;
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

/** 重なっているか（面積が要らない呼び出し側のための薄い口）。 */
export const rectsOverlap = (a, b) => overlapRect(a, b) !== null;

/**
 * 画面に出すラベルを選ぶ。近すぎるものは優先度の低い方を落とす（重なり防止）。
 * 3D と切り離してテストできるよう、入力は素の 2D 配列。
 *
 * @param {{id:string,x:number,y:number,w:number,h:number,priority:number}[]} items
 * @param {{padding?:number, limit?:number}} opts limit = 同時表示の上限（LOD）
 * @returns {Set<string>} 表示してよい id
 */
export function layoutLabels(items, { padding = 4, limit = Infinity } = {}) {
  const sorted = items.slice().sort((a, b) => b.priority - a.priority);
  const placed = [];
  const keep = new Set();
  for (const it of sorted) {
    if (keep.size >= limit) break;
    const box = {
      left: it.x - it.w / 2 - padding, right: it.x + it.w / 2 + padding,
      top: it.y - it.h / 2 - padding, bottom: it.y + it.h / 2 + padding,
    };
    if (placed.some((p) => overlapRect(box, p))) continue;
    placed.push(box);
    keep.add(it.id);
  }
  return keep;
}

/* ========================================================= 密集の譲り合い == */

/**
 * 密集した所で模型が譲る大きさの下限。
 *
 * 【実測 G-11】大阪と二条は俯瞰の画面で **13.9px** しか離れていない。両方を
 * 「重ならない2つの城」として描くには双方を 14px 以下にする必要があり、
 * **その大きさでは天守のシルエットが読めない**（＝どんな下限を選んでも交差は残る）。
 * 交差を消すのは最初から不可能なので、下限は「交差を消す」ためではなく
 * **屋根の高さに段を作る**ために置く。0.42 は俯瞰の 55px を 23px へ落とす値で、
 * 天端が 295px と 326px に割れて稜線が切れる（実測は `build/measure-density.mjs`）。
 */
export const RELIEF_FLOOR = 0.42;

/**
 * 譲っても下回らせない**画面上の大きさ**（px・模型の長辺）。
 * 比（`RELIEF_FLOOR`）だけでは画面が小さいほど模型が消えていく——
 * 320x640 の俯瞰では天守がフルサイズで 23px しかなく、0.42 倍は 10px ＝ 点である。
 * 「城のシルエットが読めるか」はオーナー検分の項目なので、**読める下限は px で置く**。
 */
export const RELIEF_MIN_PX = 18;

/**
 * カメラ距離で決まる「譲りの下限」。**寄り切ったら誰も譲らない**（＝1.0）。
 *
 * なぜ距離で切るか: 譲りの計算は画面座標なので、**寄っても引いても比が変わらない**
 * （実測: 俯瞰も d6.2 も近畿の交差は9組のまま。絶対pxが増えるだけ）。
 * つまり画面座標だけで書くと、譲りは**永久に解けない**——近畿の城は永遠に小さいままになる。
 * 解けるのは「カメラが近い」という**ワールド側の量**を混ぜたときだけである。
 * 段の2点は `labelBudget` と同じ `LOD_NEAR` / `LOD_FAR`。
 */
export function reliefFloor(dist, { floor = RELIEF_FLOOR, near = LOD_NEAR, far = LOD_FAR } = {}) {
  if (!(dist > 0)) return floor;
  if (dist >= far) return floor;
  if (dist <= near) return 1;
  return floor + (1 - floor) * ((far - dist) / (far - near));
}

/* ==================================================== 当たり判定の的（G-241）== */

/**
 * **実際に描かれている模型の伸び**（0.14..1.0）に譲り（`relief`）を掛けた倍率。
 *
 * この式は `index.html` の `refreshMarkerMatrices()`（模型・接地影）と
 * `pickAnchorHeight()` が**共有する1本**である。写しを増やさないためにここに置いた
 * ——G-11 で「壁の判定を2本持つと、片方だけ直した日に検査は緑・画面は壁のまま」に
 * なると分かっている。**絵と当たりがズレたのが G-241 の正体**なので、
 * 絵の式と当たりの式は同じ1本でなければならない。
 */
export function markerGrow(alive, relief = 1) {
  return relief * (0.14 + 0.86 * alive);
}

/**
 * 当たり判定の探索半径（px）。**近すぎる隣を弾くための半径ではなく、指の太さ**である。
 * `tools/mapgeo.py PICK_RADIUS` が同じ 34 を持ち、`tools/sites.py lint-density` が
 * これで最近傍を数える（Python 側は `index.html pickAt()` の半径として明記済み）。
 *
 * **譲り（G-11）でこの半径を縮めない。** 縮めると譲った城のまわりに押せない穴が空く
 * ——曖昧さは半径ではなく「いちばん近い的が勝つ」で解く。的が絵の上に乗っていれば、
 * 隣の的より自分の的のほうが必ず近い（実測 G-241）。
 */
export const PICK_RADIUS = 34;

/**
 * 「その時代に居る」と見なす `alive` の線。名札を出す条件と**当たり判定の条件を
 * この1本で共有する**——2本持つと「名前が出ていないのにカードだけ開く」が起きる
 * （実際に起きていた: 江戸の画面で飛鳥宮のカードが開く）。
 */
export const LABEL_ALIVE_MIN = 0.18;

/**
 * 当たり判定の的を模型のどの高さに置くか（0=足元・1=天端）。
 *
 * 0.5＝**胴**。`index.html` の `pickAt` のコメントは元から「城の胴あたりを狙う」と
 * 書いてあったが、実装は名札の吊り位置（`s.sy`）を流用して**その 16px 上**を的に
 * していた＝屋根の更に上である。コメントの意図どおりの高さに直した。
 */
export const PICK_TORSO = 0.5;

/**
 * 当たり判定の的の**高さ**（`MARKER_Y` からの相対・ワールド単位）。
 *
 * 【なぜ名札の高さを使ってはいけないか・実測 G-241】名札の吊り高さは
 * `topY * (0.34 + 0.66*alive)` という**別の曲線**で、しかも譲りを掛けない
 * （G-11 で意図的にそうした——掛けたら名札が1枚落ちて「徳川の城」が消えた）。
 * その高さを当たりの的に流用していたので、譲った城では的が**絵の 48px 上**に浮いた。
 * 1280x720・江戸で姫路城の絵の中心を押すと **大仙陵古墳** のカードが開く
 * （実クリックで確認・`build/probe-pick-truth.mjs`）。的は絵に付ける。
 */
export function pickAnchorHeight(topY, alive, relief = 1, { torso = PICK_TORSO } = {}) {
  return topY * markerGrow(alive, relief) * torso;
}

/** 足元（`ax`,`ay`）を動かさずに `f` 倍した箱。**模型は接地点を軸に縮む。** */
export function scaleBox(it, f) {
  return {
    left: it.ax + (it.left - it.ax) * f, right: it.ax + (it.right - it.ax) * f,
    top: it.ay + (it.top - it.ay) * f, bottom: it.ay + (it.bottom - it.ay) * f,
  };
}

/**
 * `base + slope*f <= limitBase + limitSlope*f` が成り立つ f の上限（[0,1] の外なら -Infinity）。
 * `denom > 0` は「縮めるほど成り立つ」向き、`denom < 0` は「縮めても向きが変わらない」向きで、
 * 後者は f=1 で成り立っているかだけを見る（**縮小で悪化する向きに f を探しにいかない**）。
 */
function upperF(base, slope, limitBase, limitSlope) {
  const denom = slope - limitSlope;
  const num = limitBase - base;
  if (Math.abs(denom) < 1e-9) return num >= 0 ? 1 : -Infinity;
  if (denom > 0) return num / denom;
  return denom <= num ? 1 : -Infinity;
}

/**
 * 「相手 `p`（大きさは固定）に触れないでいられる最大の縮小率」。無ければ 0。
 * **片方だけが譲る**場合に使う（選択中・ホバー中の地点は譲らせない）。
 */
export function clearScaleFactor(it, p, padding = 0) {
  const cands = [
    upperF(it.ax, it.right - it.ax, p.left - padding, 0),   // 左へ抜ける
    upperF(p.right + padding, 0, it.ax, it.left - it.ax),   // 右へ抜ける
    upperF(it.ay, it.bottom - it.ay, p.top - padding, 0),   // 上へ抜ける
    upperF(p.bottom + padding, 0, it.ay, it.top - it.ay),   // 下へ抜ける
  ];
  const best = Math.max(...cands);
  return best >= 1 ? 1 : (best > 0 ? best : 0);
}

/**
 * 「**両方**を f 倍したときに離れる」最大の f。無ければ 0。**対称**である
 * （`pairScaleFactor(a,b) === pairScaleFactor(b,a)`）。
 *
 * 対称であることが要点で、勝者を決める形（貪欲）にすると
 *   ① 勝者だけがフルサイズで残り、**その1つが群全体を跨いで壁を作り直す**
 *      （実測: 768x1024 俯瞰で姫路が 89px のまま大阪・二条・彦根・大仙陵の全部と交差）
 *   ② 勝ち負けを decide するのが depth の小数第4位なので、カメラを少し回すだけで
 *      **どの城が大きいかが入れ替わる**（絵がちらつく）
 * の2つが同時に起きる。譲り合いに順序を持ち込まないことで、両方が構造的に消える。
 */
export function pairScaleFactor(a, b, padding = 0) {
  const cands = [
    // a が左／b が左（`padding` は定数の隙間なので**傾きではなく切片**に足す）
    upperF(a.ax + padding, a.right - a.ax, b.ax, b.left - b.ax),
    upperF(b.ax + padding, b.right - b.ax, a.ax, a.left - a.ax),
    // a が上／b が上
    upperF(a.ay + padding, a.bottom - a.ay, b.ay, b.top - b.ay),
    upperF(b.ay + padding, b.bottom - b.ay, a.ay, a.top - a.ay),
  ];
  const best = Math.max(...cands);
  return best >= 1 ? 1 : (best > 0 ? best : 0);
}

/**
 * 密集した所で模型の大きさを譲り合わせる（G-11）。**間引かない・動かさない。**
 *
 * 判断の軸は製品の核である。江戸の近畿に城が密集していること**自体が史実の情報**なので、
 * 消すのも位置をずらすのも情報を壊す。譲るのは**大きさだけ**で、**件数は1件も減らない**
 * （読者は数えられるし、押せるし、寄れば全部フルサイズに戻る）。
 *
 * 規律は3つだけ:
 *   ① 触れ合っている2件は**等しく**譲る（勝者を作らない＝上の `pairScaleFactor` 参照）
 *   ② 譲りには下限がある（`floor`）。読めない大きさまで縮めるのは「消した」のと同じ
 *   ③ **選択中・ホバー中（`hold`）は譲らない**——相手だけが譲る。
 *      密集の中の1件を読者が名指ししたのだから、そこは元の大きさで見せる。
 *
 * @param {{id:string, ax:number, ay:number, left:number, right:number, top:number,
 *          bottom:number, hold?:boolean}[]} items 足元(ax,ay)と**フルサイズの**画面箱
 * @param {{floor?:number, padding?:number}} opts
 * @returns {Map<string, number>} id → 倍率（`floor`..1）
 */
export function relieveCrowding(items, { floor = RELIEF_FLOOR, padding = 0, minPx = RELIEF_MIN_PX } = {}) {
  const lo = clamp(floor, 0, 1);
  // 下限は**比と px の両方**で持つ。比だけだと、もともと模型が小さい画面
  // （320x640 の俯瞰では天守がフルサイズで 23px しかない）で読めない大きさまで縮む。
  // px だけだと、大きい画面でほとんど縮まなくなる。**譲れなくなる線は px で決まる。**
  const floorOf = (it) => {
    const size = Math.max(it.right - it.left, it.bottom - it.top);
    return clamp(Math.max(lo, size > 0 ? minPx / size : 1), 0, 1);
  };
  const out = new Map();
  for (const it of items) out.set(it.id, 1);
  const take = (id, f) => { if (f < out.get(id)) out.set(id, f); };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      // フルサイズで触れていない組は、そもそも何も要求しない。
      if (!overlapRect(a, b)) continue;
      if (a.hold && b.hold) continue;                       // どちらも名指しされている
      if (a.hold) { take(b.id, clearScaleFactor(b, a, padding)); continue; }
      if (b.hold) { take(a.id, clearScaleFactor(a, b, padding)); continue; }
      const f = pairScaleFactor(a, b, padding);
      take(a.id, f); take(b.id, f);
    }
  }
  for (const it of items) out.set(it.id, clamp(out.get(it.id), floorOf(it), 1));
  return out;
}

/**
 * 画面の上で**輪郭が融合している**組を返す（＝箱が交差した2件）。
 *
 * 【最初に立てた仮説と、実測がそれを否定した経緯】
 *   受け皿は「横並びの壁」と書いてあり、実測でも 1280x720・江戸・俯瞰の近畿4城の
 *   天端は 287/288/293/295px ＝ **8px 以内に揃っていた**。そこで最初は
 *   「箱が交差し、かつ天端が揃っている組」を壁と定義した。
 *   ところが譲り合いを入れて測り直すと、**壁の組数は 5→5 のまま・天端の散らばりは
 *   35px→8px と"悪化"した**のに、絵は明らかに直っていた（城が4つ数えられる）。
 *   揃っていたのは、譲った4城が同じ下限へ落ちたからで、**天端の一致は症状の一部でしかない**。
 *   眼が城を分けているのは**横の切れ目**である。だから定義を交差だけに戻した。
 *   天端の差は「判定」ではなく**添える数**として持つ（読む人が形を見られるように）。
 *
 * この1本を `build/check-layout.mjs`・`build/measure-density.mjs`・テストが共有する
 * ——判定を2本持つと、片方だけ直した日に「検査は緑・画面は壁のまま」になる
 * （`overlapRect` を1本に寄せたのと同じ理由）。
 *
 * @param {{id:string,left:number,right:number,top:number,bottom:number}[]} boxes
 * @returns {{a:string,b:string,hx:number,vy:number,topGap:number}[]}
 */
export function mergedPairs(boxes) {
  const out = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ov = overlapRect(a, b);
      if (!ov) continue;
      out.push({ a: a.id, b: b.id, hx: ov.width, vy: ov.height, topGap: Math.abs(a.top - b.top) });
    }
  }
  return out;
}

/* ================================================================ easing == */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOutCubic = (t) => {
  t = clamp(t, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
/** フレームレートに依存しない指数追従。dt 秒で目標の (1-e^-k dt) だけ近づく。 */
export const damp = (cur, target, k, dt) => lerp(cur, target, 1 - Math.exp(-k * dt));
