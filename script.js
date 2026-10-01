const splash = document.getElementById("splash");
const tapCrosshair = document.getElementById("tapCrosshair");
const pageClock = document.getElementById("pageClock");

const mapFrame = document.getElementById("mapFrame");
const mapImage = document.getElementById("mapImage");
const mapDots = document.getElementById("mapDots");
const mapCoordsHover = document.getElementById("mapCoordsHover");
const mapCoordsSelf = document.getElementById("mapCoordsSelf");

const viewer = document.getElementById("viewer");
const viewerImage = document.getElementById("viewer-image");
const viewerIndex = document.getElementById("viewer-index");
const viewerTitle = document.getElementById("viewer-title");
const viewerFields = ["coords", "observed", "generated", "address", "note"]
  .map((key) => [key, document.getElementById(`viewer-${key}`)]);

const pad = (value, length) => String(value).padStart(length, "0");
const altText = (work) => work.title || work.address;
const formatCoords = ([lat, lon]) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

// 緯度経度 → 長方形内の位置(%)。単純な等長方形図法
const positionOf = ([lat, lon]) => ({
  left: `${((lon + 180) / 360) * 100}%`,
  top: `${((90 - lat) / 180) * 100}%`,
});

setTimeout(() => splash.remove(), 2100);

// ---- 時計(年月日時分秒+1/100秒) ----
function updateClock() {
  const now = new Date();
  const parts = [
    now.getMonth() + 1, now.getDate(),
    now.getHours(), now.getMinutes(), now.getSeconds(),
    Math.floor(now.getMilliseconds() / 10),
  ];
  pageClock.textContent = now.getFullYear() + parts.map((part) => pad(part, 2)).join("");
}

updateClock();
setInterval(updateClock, 10);

// ---- タップ位置の照準表示(モバイル) ----
document.addEventListener("touchstart", (event) => {
  const touch = event.touches[0];
  if (!touch) return;
  tapCrosshair.style.left = `${touch.pageX}px`;
  tapCrosshair.style.top = `${touch.pageY}px`;
  tapCrosshair.classList.add("is-visible");
}, { passive: true });

// ---- 地図 ----
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

function addDot({ coords, className = "", onEnter, onLeave, onClick }) {
  const dot = document.createElement("span");
  dot.className = `map-dot ${className}`.trim();
  Object.assign(dot.style, positionOf(coords));
  if (onEnter) dot.addEventListener("mouseenter", onEnter);
  if (onLeave) dot.addEventListener("mouseleave", onLeave);
  if (onClick) dot.addEventListener("click", onClick);
  mapDots.appendChild(dot);
  return dot;
}

function showWork(work) {
  mapImage.src = work.image;
  mapImage.alt = altText(work);
  mapImage.classList.add("is-visible");
  mapCoordsHover.textContent = formatCoords(work.coords);
}

function hideWork() {
  mapImage.classList.remove("is-visible");
  mapCoordsHover.textContent = "";
}

function closePicker() {
  const open = mapDots.querySelector(".map-picker");
  if (open) open.remove();
}

function openPicker(dot, indices) {
  closePicker();
  const picker = document.createElement("div");
  picker.className = "map-picker";
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
    picker.appendChild(thumb);
  });
  dot.appendChild(picker);
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".map-dot")) closePicker();
});

groupByProximity(WORKS.map((_, index) => index).filter((index) => WORKS[index].coords)).forEach(
  ({ lat, lon, indices }) => {
    if (indices.length === 1) {
      const work = WORKS[indices[0]];
      addDot({
        coords: work.coords,
        onEnter: () => showWork(work),
        onLeave: hideWork,
        onClick: () => openViewer(indices[0]),
      });
      return;
    }
    const dot = addDot({
      coords: [lat, lon],
      onClick: (event) => {
        event.stopPropagation();
        openPicker(dot, indices);
      },
    });
  },
);

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const here = [coords.latitude, coords.longitude];
      mapCoordsSelf.textContent = formatCoords(here);
      addDot({ coords: here, className: "is-self" });
    },
    () => { mapCoordsSelf.textContent = "-- --"; },
  );
}

// ---- 拡大表示 ----
function setViewerOpen(isOpen) {
  viewer.classList.toggle("is-open", isOpen);
  viewer.setAttribute("aria-hidden", String(!isOpen));
  document.body.style.overflow = isOpen ? "hidden" : "";
}

function openViewer(index) {
  const work = WORKS[index];
  viewerImage.src = work.image;
  viewerImage.alt = altText(work);
  viewerIndex.textContent = pad(index + 1, 3);
  viewerTitle.textContent = work.title || "";
  viewerFields.forEach(([key, element]) => {
    element.textContent = key === "coords" && work.coords
      ? formatCoords(work.coords)
      : work[key] || "";
  });
  setViewerOpen(true);
}

viewer.addEventListener("click", (event) => {
  if (event.target === viewer || event.target.closest(".viewer-close")) setViewerOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setViewerOpen(false);
});
