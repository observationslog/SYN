const splash = document.getElementById("splash");
const tapCrosshair = document.getElementById("tapCrosshair");
const statusClock = document.getElementById("statusClock");
const statusWeather = document.getElementById("statusWeather");
const statusCountry = document.getElementById("statusCountry");

const minimapFrame = document.getElementById("minimapFrame");
const mapLayer = document.getElementById("mapLayer");
const mapDots = document.getElementById("mapDots");
const gazeLine = document.getElementById("gazeLine");
const mapCoordsLast = document.getElementById("mapCoordsLast");
const mapCoordsSelf = document.getElementById("mapCoordsSelf");

const streetFrame = document.getElementById("streetFrame");
const streetPreview = document.getElementById("streetPreview");
const streetArrows = document.getElementById("streetArrows");

const viewer = document.getElementById("viewer");
const viewerImage = document.getElementById("viewer-image");
const viewerIndex = document.getElementById("viewer-index");
const viewerTitle = document.getElementById("viewer-title");
const viewerFields = ["observed", "generated", "address"]
  .map((key) => [key, document.getElementById(`viewer-${key}`)]);
const viewerDistance = document.getElementById("viewer-distance");
const viewerDistanceLabel = document.getElementById("viewer-distance-label");
const viewerViews = document.getElementById("viewer-views");
const viewerViewsLabel = document.getElementById("viewer-views-label");

const pad = (value, length) => String(value).padStart(length, "0");
const altText = (work) => work.title || work.address;
const formatCoords = ([lat, lon]) => `${lat.toFixed(4)}. ${lon.toFixed(4)}.`;
const filenameOf = (work) => (work.image.split("/").pop() || "").replace(/\.[^.]+$/, "");

// 緯度経度 → 長方形(拡大レイヤー)内の位置(%)。単純な等長方形図法
const positionOf = ([lat, lon]) => ({
  left: `${((lon + 180) / 360) * 100}%`,
  top: `${((90 - lat) / 180) * 100}%`,
});

const toRad = (deg) => (deg * Math.PI) / 180;

function distanceKm(a, b) {
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// 地点aから見た地点bの方位(度、北=0、時計回り)。ミニマップ(平らな地図)の上での方向。
// 経度の差は素直に引き算するだけで、右端から左端へは回り込まない
function bearingTo(a, b) {
  return ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 360) % 360;
}

let selfCoords = null;
let lastViewed = null; // { coords, work, durationMs }
let viewStartedAt = null;
let viewingWork = null;

setTimeout(() => splash.remove(), 2100);

// ---- 時計(年月日時分秒+1/100秒) ----
function updateClock() {
  const now = new Date();
  const parts = [
    now.getMonth() + 1, now.getDate(),
    now.getHours(), now.getMinutes(), now.getSeconds(),
    Math.floor(now.getMilliseconds() / 10),
  ];
  statusClock.textContent = now.getFullYear() + parts.map((part) => pad(part, 2)).join("");
}

updateClock();
setInterval(updateClock, 10);

// ---- 天気・現在の国(サイト右下)。現在地が取れてから取得する ----
const WEATHER_WORDS = {
  0: "SUNNY", 1: "SUNNY", 2: "CLOUDY", 3: "CLOUDY",
  45: "FOGGY", 48: "FOGGY",
  51: "RAINY", 53: "RAINY", 55: "RAINY", 56: "RAINY", 57: "RAINY",
  61: "RAINY", 63: "RAINY", 65: "RAINY", 66: "RAINY", 67: "RAINY",
  71: "SNOWY", 73: "SNOWY", 75: "SNOWY", 77: "SNOWY",
  80: "RAINY", 81: "RAINY", 82: "RAINY",
  85: "SNOWY", 86: "SNOWY",
  95: "STORMY", 96: "STORMY", 99: "STORMY",
};

async function updateSiteStatus([lat, lon]) {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    const data = await res.json();
    const code = data.current_weather && data.current_weather.weathercode;
    statusWeather.textContent = WEATHER_WORDS[code] || "";
  } catch (e) { statusWeather.textContent = ""; }

  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    const data = await res.json();
    statusCountry.textContent = data.countryName ? `STATE ${data.countryName.toUpperCase()}` : "";
  } catch (e) { statusCountry.textContent = ""; }
}

// ---- タップ位置の十字表示(モバイル)。作品画面が開いている間/矢印をタップした時は更新しない ----
document.addEventListener("touchstart", (event) => {
  if (viewer.classList.contains("is-open")) return;
  if (event.target.closest(".compass-arrow")) return;
  const touch = event.touches[0];
  if (!touch) return;
  tapCrosshair.style.left = `${touch.pageX}px`;
  tapCrosshair.style.top = `${touch.pageY}px`;
  tapCrosshair.classList.add("is-visible");
}, { passive: true });

// 地図本体(.map-layer)のサイズ。style.css の .map-layer と同じ値にしておく
const LAYER_SCALE = 0.6;

// ---- ミニマップの中心を合わせる ----
// 地図本体は枠より小さく作ってあるので、世界地図そのものが枠からはみ出すことはない。
// 中心にしたい点は、その余白の範囲内でできるだけ中央へ寄せる(平行移動のみ、拡大縮小はしない)。
function recenterMap(coords) {
  const frameWidth = minimapFrame.clientWidth;
  const frameHeight = minimapFrame.clientHeight;
  const layerWidth = frameWidth * LAYER_SCALE;
  const layerHeight = frameHeight * LAYER_SCALE;
  const marginX = frameWidth - layerWidth;
  const marginY = frameHeight - layerHeight;
  const { left, top } = positionOf(coords);
  const targetX = (parseFloat(left) / 100) * layerWidth;
  const targetY = (parseFloat(top) / 100) * layerHeight;
  const x = Math.min(marginX, Math.max(0, frameWidth / 2 - targetX));
  const y = Math.min(marginY, Math.max(0, frameHeight / 2 - targetY));
  mapLayer.style.transform = `translate(${x}px, ${y}px)`;
}

function layerPixelOf(coords) {
  const { left, top } = positionOf(coords);
  return {
    x: (parseFloat(left) / 100) * (minimapFrame.clientWidth * LAYER_SCALE),
    y: (parseFloat(top) / 100) * (minimapFrame.clientHeight * LAYER_SCALE),
  };
}

// ---- 現在地点から最後に見た点への視線 ----
function updateGazeLine() {
  if (!selfCoords || !lastViewed) {
    gazeLine.hidden = true;
    return;
  }
  const from = layerPixelOf(selfCoords);
  const to = layerPixelOf(lastViewed.coords);
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  // 長さは固定(style.css の .gaze-line width)。現在地から短く伸びるだけの矢印にする
  gazeLine.style.left = `${from.x}px`;
  gazeLine.style.top = `${from.y}px`;
  gazeLine.style.transform = `rotate(${angle}deg)`;
  gazeLine.hidden = false;
}

// ---- 右下の座標表示(最後に見た点 / 1/8の確率で閲覧ログ表示) ----
function updateCoordsPanel() {
  mapCoordsSelf.textContent = selfCoords ? `YOU ${formatCoords(selfCoords)}` : "YOU --. --.";
  if (!lastViewed) {
    mapCoordsLast.textContent = "";
    return;
  }
  if (Math.random() < 1 / 8) {
    const minutes = pad(Math.floor(lastViewed.durationMs / 60000), 2);
    const seconds = pad(Math.floor((lastViewed.durationMs / 1000) % 60), 2);
    mapCoordsLast.textContent = `YOU VIEWED ${filenameOf(lastViewed.work).toUpperCase()} ${minutes}:${seconds}`;
  } else {
    mapCoordsLast.textContent = formatCoords(lastViewed.coords);
  }
}

// ---- ミニマップの点(表示専用。クリック・タップには反応しない) ----
function addDot({ coords, className = "" }) {
  const dot = document.createElement("span");
  dot.className = `map-dot ${className}`.trim();
  Object.assign(dot.style, positionOf(coords));
  mapDots.appendChild(dot);
  return dot;
}

const streetIndices = WORKS.map((_, index) => index).filter((index) => WORKS[index].coords);

streetIndices.forEach((index) => addDot({ coords: WORKS[index].coords }));

// いま見ている場所の赤い点。lastViewed が変わるたびに位置を更新する
let viewDot = null;
function updateViewDot() {
  if (!lastViewed) return;
  if (!viewDot) viewDot = addDot({ coords: lastViewed.coords, className: "is-view" });
  Object.assign(viewDot.style, positionOf(lastViewed.coords));
}

// 位置情報が取れない/応答が無い場合でも表示が止まったままにならないよう、先に初期状態を出しておく
updateCoordsPanel();

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      selfCoords = [coords.latitude, coords.longitude];
      addDot({ coords: selfCoords, className: "is-self" });
      recenterMap(selfCoords);
      updateCoordsPanel();
      updateGazeLine();
      updateSiteStatus(selfCoords);
    },
    () => { updateCoordsPanel(); },
    { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 },
  );
}

// ---- ストリート風ナビゲーション ----
// 座標が近い作品同士は1つの「場所」としてまとめ、横並びで表示する(今後増える作品にも適用される汎用の仕組み)
const STREET_CLUSTER_KM = 50;

function buildStreetClusters() {
  const parent = {};
  streetIndices.forEach((i) => { parent[i] = i; });
  function find(i) {
    while (parent[i] !== i) i = parent[i];
    return i;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  streetIndices.forEach((i) => {
    streetIndices.forEach((j) => {
      if (i < j && distanceKm(WORKS[i].coords, WORKS[j].coords) <= STREET_CLUSTER_KM) {
        union(i, j);
      }
    });
  });

  // 数値キーのオブジェクトは昇順に並び替わってしまうため、Mapで出現順(=WORKS配列の順)を保つ
  const clusters = [];
  const clusterByRoot = new Map();
  streetIndices.forEach((i) => {
    const root = find(i);
    if (!clusterByRoot.has(root)) {
      const cluster = { memberIndices: [], coords: null };
      clusterByRoot.set(root, cluster);
      clusters.push(cluster);
    }
    clusterByRoot.get(root).memberIndices.push(i);
  });

  clusters.forEach((cluster) => {
    const lat = cluster.memberIndices.reduce((sum, i) => sum + WORKS[i].coords[0], 0) / cluster.memberIndices.length;
    const lon = cluster.memberIndices.reduce((sum, i) => sum + WORKS[i].coords[1], 0) / cluster.memberIndices.length;
    cluster.coords = [lat, lon];
  });

  return clusters;
}

const streetClusters = buildStreetClusters();

// 近い(この距離以内の)場所は相互に矢印でつなぐ。それだけだと「自分の最寄り1件」にしか
// 矢印が出ず、相手側からの矢印が無いと一方通行になって迷子になる(例:NYの最寄りがエルサルバドル
// でも、エルサルバドルの最寄りがメキシコだと、エルサルバドルからNYへ戻れない)。
// そのため全体を最小スパニングツリーで繋ぎ、どこからでも全ての場所へ辿り着けるようにする。
const STREET_NEARBY_KM = 500;

function buildStreetAdjacency() {
  const n = streetClusters.length;
  const adjacency = Array.from({ length: n }, () => new Set());
  const connect = (a, b) => {
    adjacency[a].add(b);
    adjacency[b].add(a);
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (distanceKm(streetClusters[i].coords, streetClusters[j].coords) <= STREET_NEARBY_KM) {
        connect(i, j);
      }
    }
  }

  // 最小スパニングツリー(Prim法)で全体の接続を保証する
  if (n > 1) {
    const inTree = new Array(n).fill(false);
    inTree[0] = true;
    let count = 1;
    while (count < n) {
      let best = null;
      for (let i = 0; i < n; i += 1) {
        if (!inTree[i]) continue;
        for (let j = 0; j < n; j += 1) {
          if (inTree[j]) continue;
          const d = distanceKm(streetClusters[i].coords, streetClusters[j].coords);
          if (!best || d < best.d) best = { i, j, d };
        }
      }
      if (!best) break;
      connect(best.i, best.j);
      inTree[best.j] = true;
      count += 1;
    }
  }

  return adjacency;
}

const streetAdjacency = buildStreetAdjacency();

function nearbyClustersOf(clusterIndex) {
  return Array.from(streetAdjacency[clusterIndex]);
}

let currentClusterIndex = null;

// ---- コンパス(選択肢の矢印) ----
// 矢印は線で描いた山形。中心の周りの三重の楕円(内・中・外)に、目的地の正確な方位で置く(北が上)。
// 方位が近くて重なる矢印だけ、距離の近い順に内→中→外へ並べる(何kmかは関係なく順位のみ)。
// 重ならない矢印は一番内側。4つ以上重なった分は外側に置く。輪の線そのものは描かない。
const COMPASS_RINGS = 3;
const COMPASS_RING_FRACTIONS = [0.4, 0.7, 1]; // 内・中・外の輪の半径(外側を1とした比)
const COMPASS_OVERLAP_DEG = 40; // この角度以内の矢印同士は「重なる」とみなす
const COMPASS_FLATTEN = 0.6; // 地面を縦に潰す割合
const COMPASS_DEPTH = 0.3; // 遠近の強さ。大きいほど奥(北)が小さく、手前(南)が大きくなる
const SVG_NS = "http://www.w3.org/2000/svg";

function assignCompassRings(items) {
  const parent = items.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i];
    return i;
  };
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const diff = Math.abs(items[i].bearing - items[j].bearing);
      if (Math.min(diff, 360 - diff) <= COMPASS_OVERLAP_DEG) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  items.forEach((item, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  });
  groups.forEach((group) => {
    group.sort((a, b) => a.distance - b.distance);
    group.forEach((item, rank) => { item.ring = Math.min(rank, COMPASS_RINGS - 1); });
  });
}

function drawCompass(items) {
  streetArrows.innerHTML = "";
  if (items.length === 0) return;
  assignCompassRings(items);

  const width = streetArrows.clientWidth;
  const height = streetArrows.clientHeight;
  const flatten = COMPASS_FLATTEN;
  const depth = COMPASS_DEPTH;
  const half = Math.min(16, Math.max(8, height * 0.14)); // 山形の半分の長さ(地面上の長さ。手前ほど大きく見える)
  const wing = half * 0.95; // 山形の開き(半幅)
  const pad = half * 0.8;

  // 地面(東=u、北=z)を斜めから見たように投影する。奥(北)ほど小さく、手前(南)ほど大きい。
  // 山形は地面の上で描いてから投影し、線の太さは一定(CSS)のまま。
  // 外側の輪(半径R)の南北の端がちょうど帯に収まるようにRと中心を決める
  const scaleAt = (z) => 1 / (1 + depth * z);
  const north = flatten * scaleAt(1);
  const south = flatten * scaleAt(-1);
  const outerRadius = Math.min((height - pad * 2) / (north + south), width * 0.42);
  const cx = width / 2;
  const cy = pad + north * outerRadius;
  // 帯が縦に狭いと輪の間隔が詰まって矢印が重なるので、横方向の位置だけ広げる(帯の幅に収まる範囲で最大2倍)
  const spreadX = Math.max(1, Math.min(2, (width * 0.42) / outerRadius));
  const project = (u, z) => {
    const s = 1 / (1 + (depth * z) / outerRadius);
    return [cx + u * s, cy - flatten * z * s];
  };

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "compass");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  items.forEach(({ targetIndex, bearing, ring }) => {
    const theta = toRad(bearing);
    const du = Math.sin(theta); // 進行方向(地面上。北=z、東=u)
    const dz = Math.cos(theta);
    const pu = Math.cos(theta); // 進行方向に直交する向き
    const pz = -Math.sin(theta);
    const radius = outerRadius * COMPASS_RING_FRACTIONS[ring];
    const mu = du * radius * spreadX; // 置く位置だけ横に広げる(山形の形は広げない)
    const mz = dz * radius;

    const apex = project(mu + du * half, mz + dz * half);
    const wingA = project(mu - du * half * 0.6 + pu * wing, mz - dz * half * 0.6 + pz * wing);
    const wingB = project(mu - du * half * 0.6 - pu * wing, mz - dz * half * 0.6 - pz * wing);
    const [hx, hy] = project(mu, mz);

    const targetWork = WORKS[streetClusters[targetIndex].memberIndices[0]];
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "compass-arrow");
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("aria-label", altText(targetWork));

    const hit = document.createElementNS(SVG_NS, "circle");
    hit.setAttribute("class", "compass-arrow-hit");
    hit.setAttribute("cx", hx);
    hit.setAttribute("cy", hy);
    hit.setAttribute("r", Math.max(14, half * 1.4));

    const line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("class", "compass-arrow-line");
    line.setAttribute("points", [wingA, apex, wingB].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "));

    group.append(hit, line);
    const go = (event) => {
      event.stopPropagation();
      showStreetCluster(targetIndex);
    };
    group.addEventListener("click", go);
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        go(event);
      }
    });
    svg.appendChild(group);
  });

  streetArrows.appendChild(svg);
}

function showStreetCluster(clusterIndex) {
  currentClusterIndex = clusterIndex;
  const cluster = streetClusters[clusterIndex];

  // 場所にまとまった作品を横並びで表示。それぞれ個別にタップでフルスクリーン表示を開く
  streetPreview.innerHTML = "";
  const frameWidth = streetFrame.clientWidth;
  const frameHeight = streetFrame.clientHeight;
  const count = cluster.memberIndices.length;
  const itemSize = Math.min(
    Math.min(frameWidth, frameHeight) * 0.34,
    (frameWidth * 0.86) / count - 8,
  );
  cluster.memberIndices.forEach((workIndex) => {
    const work = WORKS[workIndex];
    const img = document.createElement("img");
    img.className = "street-cluster-item";
    img.src = work.image;
    img.alt = altText(work);
    img.style.width = `${itemSize}px`;
    img.style.height = `${itemSize}px`;
    img.addEventListener("click", (event) => {
      event.stopPropagation();
      openViewer(workIndex);
    });
    streetPreview.appendChild(img);
  });

  // 矢印は下段に、現在の場所から見た目的地の方位に描く(北が上)。詳細は drawCompass
  const targets = nearbyClustersOf(clusterIndex).map((targetIndex) => ({
    targetIndex,
    bearing: bearingTo(cluster.coords, streetClusters[targetIndex].coords),
    distance: distanceKm(cluster.coords, streetClusters[targetIndex].coords),
  }));
  drawCompass(targets);

  // 到着した場所として、視線・ミニマップ・右下表示を更新する(場所の代表作品はまとまりの先頭)
  lastViewed = { coords: cluster.coords, work: WORKS[cluster.memberIndices[0]], durationMs: 0 };
  updateViewDot();
  recenterMap(cluster.coords);
  updateGazeLine();
  updateCoordsPanel();
}

if (streetClusters.length > 0) showStreetCluster(0);

window.addEventListener("resize", () => {
  recenterMap(lastViewed ? lastViewed.coords : selfCoords || [0, 0]);
  updateGazeLine();
  if (currentClusterIndex !== null) showStreetCluster(currentClusterIndex);
});

// ---- 拡大表示 ----
function setViewerOpen(isOpen) {
  viewer.classList.toggle("is-open", isOpen);
  viewer.setAttribute("aria-hidden", String(!isOpen));
  document.body.style.overflow = isOpen ? "hidden" : "";
}

function viewCountKey(work) {
  return `syn_views_${filenameOf(work)}`;
}

function openViewer(index) {
  const work = WORKS[index];
  viewingWork = work;
  viewerImage.src = work.image;
  viewerImage.alt = altText(work);
  viewerIndex.textContent = work.coords ? formatCoords(work.coords) : "";
  viewerTitle.textContent = work.title || "";
  viewerFields.forEach(([key, element]) => {
    element.textContent = work[key] || "";
  });

  if (selfCoords && work.coords) {
    viewerDistance.textContent = `${Math.round(distanceKm(selfCoords, work.coords))}km`;
    viewerDistance.hidden = false;
    viewerDistanceLabel.hidden = false;
  } else {
    viewerDistance.hidden = true;
    viewerDistanceLabel.hidden = true;
  }

  const key = viewCountKey(work);
  const count = Number(localStorage.getItem(key) || "0") + 1;
  localStorage.setItem(key, String(count));
  if (count >= 2) {
    viewerViews.textContent = String(count);
    viewerViews.hidden = false;
    viewerViewsLabel.hidden = false;
  } else {
    viewerViews.hidden = true;
    viewerViewsLabel.hidden = true;
  }

  viewStartedAt = Date.now();
  setViewerOpen(true);
}

function closeViewer() {
  if (viewer.classList.contains("is-open") && viewStartedAt && viewingWork && viewingWork.coords) {
    lastViewed = { coords: viewingWork.coords, work: viewingWork, durationMs: Date.now() - viewStartedAt };
    updateViewDot();
    recenterMap(lastViewed.coords);
    updateGazeLine();
    updateCoordsPanel();
  }
  viewStartedAt = null;
  viewingWork = null;
  setViewerOpen(false);
}

viewer.addEventListener("click", () => closeViewer());

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeViewer();
});
