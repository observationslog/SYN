const splash = document.getElementById("splash");
const tapCrosshair = document.getElementById("tapCrosshair");
const statusClock = document.getElementById("statusClock");
const statusWeather = document.getElementById("statusWeather");
const statusCountry = document.getElementById("statusCountry");

const mapFrame = document.getElementById("mapFrame");
const mapLayer = document.getElementById("mapLayer");
const mapDots = document.getElementById("mapDots");
const gazeLine = document.getElementById("gazeLine");
const mapCoordsLast = document.getElementById("mapCoordsLast");
const mapCoordsSelf = document.getElementById("mapCoordsSelf");

const viewer = document.getElementById("viewer");
const viewerImage = document.getElementById("viewer-image");
const viewerIndex = document.getElementById("viewer-index");
const viewerTitle = document.getElementById("viewer-title");
const viewerFields = ["observed", "generated", "address", "note"]
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

// ---- タップ位置の照準表示(モバイル)。作品画面が開いている間は更新しない ----
document.addEventListener("touchstart", (event) => {
  if (viewer.classList.contains("is-open")) return;
  if (event.target.closest("#mapFrame")) return; // マップ上のタップは照準を動かさない
  const touch = event.touches[0];
  if (!touch) return;
  tapCrosshair.style.left = `${touch.pageX}px`;
  tapCrosshair.style.top = `${touch.pageY}px`;
  tapCrosshair.classList.add("is-visible");
}, { passive: true });

// 地図本体(.map-layer)のサイズ。style.css の .map-layer と同じ値にしておく
const LAYER_SCALE = 0.6;

// ---- 地図の中心を合わせる ----
// 地図本体は枠より小さく作ってあるので、世界地図そのものが枠からはみ出すことはない。
// 中心にしたい点は、その余白の範囲内でできるだけ中央へ寄せる(平行移動のみ、拡大縮小はしない)。
function recenterMap(coords) {
  const frameWidth = mapFrame.clientWidth;
  const frameHeight = mapFrame.clientHeight;
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
    x: (parseFloat(left) / 100) * (mapFrame.clientWidth * LAYER_SCALE),
    y: (parseFloat(top) / 100) * (mapFrame.clientHeight * LAYER_SCALE),
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

window.addEventListener("resize", () => {
  recenterMap(lastViewed ? lastViewed.coords : selfCoords || [0, 0]);
  updateGazeLine();
});

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

// ---- 地図上の点 ----
// 近い座標(同じ都市内など)は1つの点に統合する。この度数以内なら同じ点とみなす
const CLUSTER_THRESHOLD_DEG = 3;

function groupByProximity(indices) {
  const clusters = [];
  indices.forEach((index) => {
    const [lat, lon] = WORKS[index].coords;
    const cluster = clusters.find(
      (c) => Math.hypot(c.lat - lat, c.lon - lon) < CLUSTER_THRESHOLD_DEG,
    );
    if (cluster) {
      cluster.indices.push(index);
    } else {
      clusters.push({ lat, lon, indices: [index] });
    }
  });
  return clusters;
}

function addDot({ coords, className = "", onClick }) {
  const dot = document.createElement("span");
  dot.className = `map-dot ${className}`.trim();
  Object.assign(dot.style, positionOf(coords));
  if (onClick) dot.addEventListener("click", onClick);
  mapDots.appendChild(dot);
  return dot;
}

function closePicker() {
  const open = mapFrame.querySelector(".map-picker");
  if (open) open.remove();
}

// 長方形(マップ)の中に収まる位置に表示する。マップ自体に重ねるので埋もれない
function openPicker(dot, indices) {
  closePicker();
  const picker = document.createElement("div");
  picker.className = "map-picker";
  const box = document.createElement("div");
  box.className = "map-picker-box";
  indices.forEach((index) => {
    const work = WORKS[index];
    const thumb = document.createElement("button");
    thumb.className = "map-picker-item";
    thumb.style.backgroundImage = `url("${work.image}")`;
    thumb.setAttribute("aria-label", altText(work));
    thumb.addEventListener("click", (event) => {
      event.stopPropagation();
      closePicker();
      openViewer(index);
    });
    box.appendChild(thumb);
  });
  picker.appendChild(box);
  mapFrame.appendChild(picker);
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".map-dot")) closePicker();
});

groupByProximity(WORKS.map((_, index) => index).filter((index) => WORKS[index].coords)).forEach(
  ({ lat, lon, indices }) => {
    if (indices.length === 1) {
      addDot({
        coords: WORKS[indices[0]].coords,
        onClick: () => openViewer(indices[0]),
      });
      return;
    }
    const dot = addDot({ coords: [lat, lon] });
    dot.addEventListener("click", (event) => {
      event.stopPropagation();
      openPicker(dot, indices);
    });
  },
);

addDot({ coords: subsolarPoint(), className: "is-sun" });

// 位置情報が取れない/応答が無い場合でも表示が止まったままにならないよう、先に初期状態を出しておく
updateCoordsPanel();

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      selfCoords = [coords.latitude, coords.longitude];
      addDot({
        coords: selfCoords,
        className: "is-self",
        onClick: () => {
          lastViewed = null;
          recenterMap(selfCoords);
          updateGazeLine();
          updateCoordsPanel();
        },
      });
      recenterMap(selfCoords);
      updateCoordsPanel();
      updateGazeLine();
      updateSiteStatus(selfCoords);
    },
    () => { updateCoordsPanel(); },
    { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 },
  );
}

// ---- 拡大表示 ----
function setViewerOpen(isOpen) {
  viewer.classList.toggle("is-open", isOpen);
  viewer.setAttribute("aria-hidden", String(!isOpen));
  document.body.style.overflow = isOpen ? "hidden" : "";
}

function viewCountKey(work) {
  return `syn_views_${filenameOf(work)}`;
}

function distanceKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
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
