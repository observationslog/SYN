const ledger = document.getElementById("ledger");
const splash = document.getElementById("splash");
const pageCoords = document.getElementById("pageCoords");
const pageClock = document.getElementById("pageClock");
const tapCrosshair = document.getElementById("tapCrosshair");

const viewer = document.getElementById("viewer");
const viewerImage = document.getElementById("viewer-image");
const viewerIndex = document.getElementById("viewer-index");
const viewerTitle = document.getElementById("viewer-title");
const viewerRoad = document.getElementById("viewer-road");
const viewerLocation = document.getElementById("viewer-location");
const viewerObserved = document.getElementById("viewer-observed");
const viewerGenerated = document.getElementById("viewer-generated");
const viewerNote = document.getElementById("viewer-note");
const viewerClose = document.querySelector(".viewer-close");

const MOBILE_QUERY = "(max-width: 640px)";
const COLUMNS_MOBILE = 3;
const COLUMNS_DESKTOP = 4;

function formatCoords(x, y) {
  return `${String(Math.round(x)).padStart(4, "0")} ${String(Math.round(y)).padStart(4, "0")}`;
}

function updatePointer(x, y, showCrosshair = false) {
  pageCoords.textContent = formatCoords(x, y);

  if (showCrosshair) {
    tapCrosshair.style.left = `${x}px`;
    tapCrosshair.style.top = `${y}px`;
    tapCrosshair.classList.add("is-visible");
  }
}

document.addEventListener("mousemove", (event) => {
  updatePointer(event.pageX, event.pageY);
});

document.addEventListener("touchstart", (event) => {
  const touch = event.touches[0];
  if (touch) updatePointer(touch.pageX, touch.pageY, true);
}, { passive: true });

function pad2(number) {
  return String(number).padStart(2, "0");
}

function updateClock() {
  const now = new Date();
  pageClock.textContent =
    `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
    `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}` +
    `${pad2(Math.floor(now.getMilliseconds() / 10))}`;
}

updateClock();
setInterval(updateClock, 10);

setTimeout(() => {
  splash.style.display = "none";
}, 2100);

function pad(number) {
  return String(number).padStart(3, "0");
}

function currentColumns() {
  return window.matchMedia(MOBILE_QUERY).matches ? COLUMNS_MOBILE : COLUMNS_DESKTOP;
}

function renderGridLines(columns, rows) {
  const gridLines = document.createElement("div");
  gridLines.className = "grid-lines";
  gridLines.setAttribute("aria-hidden", "true");

  // 隣り合う線は逆向きに流す(奇数番目だけ flip)
  const addLine = (orientation, index, count) => {
    const line = document.createElement("span");
    line.className = `grid-line ${orientation}${index % 2 ? " flip" : ""}`;
    line.style[orientation === "vertical" ? "left" : "top"] = `${(100 / count) * index}%`;
    gridLines.appendChild(line);
  };

  for (let column = 1; column < columns; column++) addLine("vertical", column, columns);
  for (let row = 1; row < rows; row++) addLine("horizontal", row, rows);

  return gridLines;
}

function render() {
  ledger.replaceChildren();

  WORKS.forEach((work, index) => {
    const entry = document.createElement("article");
    entry.className = "entry";
    entry.addEventListener("click", () => openViewer(index));

    const thumb = document.createElement("div");
    thumb.className = "entry-thumb";

    const image = document.createElement("img");
    image.src = work.image;
    image.alt = work.title || work.location;
    image.loading = "lazy";
    thumb.appendChild(image);

    const title = document.createElement("h2");
    title.className = "entry-title";
    title.textContent = work.title;

    const meta = document.createElement("div");
    meta.className = "entry-meta";
    meta.innerHTML = `
      <span class="entry-index">${pad(index + 1)}</span>
      <span class="entry-location">${work.location}</span>
      <span class="entry-year">${work.observed || ""}</span>
    `;

    const rays = document.createElement("div");
    rays.className = "entry-rays";
    rays.setAttribute("aria-hidden", "true");
    rays.innerHTML = `
      <span class="ray ray-tl"></span>
      <span class="ray ray-tr"></span>
      <span class="ray ray-bl"></span>
      <span class="ray ray-br"></span>
    `;

    entry.append(rays, thumb, title, meta);
    ledger.appendChild(entry);
  });

  const columns = currentColumns();
  const fillerCount = (columns - (WORKS.length % columns)) % columns;
  for (let i = 0; i < fillerCount; i++) {
    const filler = document.createElement("div");
    filler.className = "entry";
    filler.setAttribute("aria-hidden", "true");
    ledger.appendChild(filler);
  }

  ledger.appendChild(renderGridLines(columns, (WORKS.length + fillerCount) / columns));
}

function openViewer(index) {
  const work = WORKS[index];

  viewerImage.src = work.image;
  viewerImage.alt = work.title || work.location;
  viewerIndex.textContent = pad(index + 1);
  viewerTitle.textContent = work.title;
  viewerRoad.textContent = work.road || "";
  viewerLocation.textContent = work.location;
  viewerObserved.textContent = work.observed || "";
  viewerGenerated.textContent = work.generated || "";
  viewerNote.textContent = work.note || "";

  viewer.classList.add("is-open");
  viewer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeViewer() {
  viewer.classList.remove("is-open");
  viewer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

viewerClose.addEventListener("click", closeViewer);
viewer.addEventListener("click", (event) => {
  if (event.target === viewer) closeViewer();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && viewer.classList.contains("is-open")) closeViewer();
});

let columns = currentColumns();
render();

window.addEventListener("resize", () => {
  const nextColumns = currentColumns();
  if (nextColumns !== columns) {
    columns = nextColumns;
    render();
  }
});
