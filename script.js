const ledger = document.getElementById("ledger");
const splash = document.getElementById("splash");
const pageCoords = document.getElementById("pageCoords");
const pageClock = document.getElementById("pageClock");
const tapCrosshair = document.getElementById("tapCrosshair");

const viewer = document.getElementById("viewer");
const viewerImage = document.getElementById("viewer-image");
const viewerIndex = document.getElementById("viewer-index");
const viewerTitle = document.getElementById("viewer-title");
const viewerFields = ["road", "location", "observed", "generated", "note"]
  .map((key) => [key, document.getElementById(`viewer-${key}`)]);

// style.css の @media (max-width: 640px) と揃える
const mobileQuery = window.matchMedia("(max-width: 640px)");
const currentColumns = () => (mobileQuery.matches ? 3 : 4);

const pad = (value, length) => String(value).padStart(length, "0");
const altText = (work) => work.title || work.location;

setTimeout(() => splash.remove(), 2100);

// ---- 座標(スマホでは最後に触れた位置) ----
function updatePointer(x, y, showCrosshair = false) {
  pageCoords.textContent = `${pad(Math.round(x), 4)} ${pad(Math.round(y), 4)}`;
  if (showCrosshair) {
    tapCrosshair.style.left = `${x}px`;
    tapCrosshair.style.top = `${y}px`;
    tapCrosshair.classList.add("is-visible");
  }
}

document.addEventListener("mousemove", (event) => updatePointer(event.pageX, event.pageY));
document.addEventListener("touchstart", (event) => {
  const touch = event.touches[0];
  if (touch) updatePointer(touch.pageX, touch.pageY, true);
}, { passive: true });

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

// ---- 一覧 ----
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
  const columns = currentColumns();
  ledger.replaceChildren();

  WORKS.forEach((work, index) => {
    const entry = document.createElement("article");
    entry.className = "entry";
    entry.innerHTML = `
      <div class="entry-rays" aria-hidden="true">
        <span class="ray ray-tl"></span>
        <span class="ray ray-tr"></span>
        <span class="ray ray-bl"></span>
        <span class="ray ray-br"></span>
      </div>
      <div class="entry-thumb"><img loading="lazy"></div>
      ${work.title ? `<h2 class="entry-title">${work.title}</h2>` : ""}
      <div class="entry-meta">
        <span class="entry-index">${pad(index + 1, 3)}</span>
        <span class="entry-location">${work.location}</span>
        <span class="entry-year">${work.observed || ""}</span>
      </div>
    `;

    const image = entry.querySelector("img");
    image.src = work.image;
    image.alt = altText(work);

    entry.addEventListener("click", () => openViewer(index));
    ledger.appendChild(entry);
  });

  // 最後の行が埋まらない分は、空のマスで埋めて枠を完成させる
  const fillerCount = (columns - (WORKS.length % columns)) % columns;
  for (let i = 0; i < fillerCount; i++) {
    const filler = document.createElement("div");
    filler.className = "entry";
    filler.setAttribute("aria-hidden", "true");
    ledger.appendChild(filler);
  }

  ledger.appendChild(renderGridLines(columns, (WORKS.length + fillerCount) / columns));
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
    element.textContent = work[key] || "";
  });
  setViewerOpen(true);
}

viewer.addEventListener("click", (event) => {
  if (event.target === viewer || event.target.closest(".viewer-close")) setViewerOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setViewerOpen(false);
});

render();
mobileQuery.addEventListener("change", render);
