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

function distanceKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// 地点aから見た地点bの方位(度、北=0、時計回り)
function bearingTo(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLon = toRad(b[1] - a[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
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

// ---- タップ位置の照準表示(モバイル)。作品画面が開いている間/矢印をタップした時は更新しない ----
// 長方形(ストリート/ミニマップ)の中をタップしている間だけ照準、外では十字
document.addEventListener("touchstart", (event) => {
  if (viewer.classList.contains("is-open")) return;
  if (event.target.closest(".street-arrow")) return;
  const touch = event.touches[0];
  if (!touch) return;
  tapCrosshair.style.left = `${touch.pageX}px`;
  tapCrosshair.style.top = `${touch.pageY}px`;
  tapCrosshair.classList.add("is-visible");
  const insideFrame = Boolean(event.target.closest(".street-frame, .minimap-frame"));
  tapCrosshair.classList.toggle("is-aim", insideFrame);
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

// ---- 太陽直下点(ページを開いた時点のみ計算。簡易計算) ----
function subsolarPoint() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const declination = 23.44 * Math.sin(((360 / 365) * (dayOfYear - 81) * Math.PI) / 180);
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
  const longitude = ((12 - utcHours) * 15 + 540) % 360 - 180;
  return [declination, longitude];
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
addDot({ coords: subsolarPoint(), className: "is-sun" });

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

  // 矢印は地面の帯(下段)に並べる選択肢。方位(位置関係)は左右どちら寄りに置くか・
  // 左右どちらへ傾けるかの判断だけに使い、見た目は常に同じ薄い縦潰れ形を保つ(回転はしない)
  streetArrows.innerHTML = "";
  const targets = nearbyClustersOf(clusterIndex);
  const targetsWithBearing = targets
    .map((targetIndex) => ({ targetIndex, bearing: bearingTo(cluster.coords, streetClusters[targetIndex].coords) }))
    .sort((a, b) => a.bearing - b.bearing);

  targetsWithBearing.forEach(({ targetIndex, bearing }, i) => {
    const targetWork = WORKS[streetClusters[targetIndex].memberIndices[0]];
    const arrow = document.createElement("button");
    const mid = (targetsWithBearing.length - 1) / 2;
    const lean = i < mid ? "left" : i > mid ? "right" : "";
    arrow.className = lean ? `street-arrow street-arrow--${lean}` : "street-arrow";
    arrow.setAttribute("aria-label", altText(targetWork));
    arrow.addEventListener("click", (event) => {
      event.stopPropagation();
      showStreetCluster(targetIndex);
    });
    streetArrows.appendChild(arrow);
  });

  // 到着した場所として、視線・ミニマップ・右下表示を更新する(場所の代表作品はまとまりの先頭)
  lastViewed = { coords: cluster.coords, work: WORKS[cluster.memberIndices[0]], durationMs: 0 };
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
