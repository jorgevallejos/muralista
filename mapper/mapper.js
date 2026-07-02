"use strict";

/*
 * Wall Mapper — mapper.js
 *
 * Single script serving two roles, chosen by the URL query string:
 *   http://localhost:8123/mapper.html          -> control window
 *   http://localhost:8123/mapper.html?output    -> output window (projector)
 *
 * Sections: STATE, SYNC, WARP, CONTROL UI, OUTPUT RENDERING, ROLE / INIT.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "wallmapper.project.v1";
const PREVIEW_W = 1600; // matches preview-svg viewBox
const PREVIEW_H = 900;

// =========================================================================
// STATE
// =========================================================================
// `project` is the single source of truth on the control side. The output
// side treats whatever it last received over BroadcastChannel as truth and
// never writes to localStorage itself.

function emptyProject() {
  return { version: 1, photo: null, surfaces: [] };
}

function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidProject(parsed)) return parsed;
    }
  } catch (err) {
    console.warn("Wall Mapper: could not read saved project, starting fresh.", err);
  }
  return emptyProject();
}

function saveProject(proj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(proj));
}

function isValidProject(obj) {
  return !!obj && typeof obj === "object" && typeof obj.version === "number" && Array.isArray(obj.surfaces);
}

function genSurfaceId() {
  // Short unique-enough slug: timestamp base36 + a few random base36 chars
  // (guards against two surfaces created in the same millisecond).
  return "s-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function defaultSurface(index) {
  return {
    id: genSurfaceId(),
    name: `Surface ${index}`,
    corners: [
      [0.35, 0.35],
      [0.65, 0.35],
      [0.65, 0.65],
      [0.35, 0.65],
    ],
    layer: { type: "pattern", src: null, opacity: 1, bpm: 96 },
    visible: true,
  };
}

// The project state, live in memory. Populated below once the role is known.
let project = emptyProject();

// Control-local UI state — never persisted, never broadcast.
let selectedSurfaceId = null;

// Which of the selected surface's 4 corners (0=TL,1=TR,2=BR,3=BL) arrow-key
// nudges apply to. Selected via the 1-4 keys. Control-local, never persisted.
let activeCornerIndex = 0;

// Latest output-window size in real screen pixels, learned from the
// 'outputSize' broadcast (see WARP/SYNC below) so arrow-key nudges can be
// expressed in output pixels regardless of preview scale. Falls back to a
// common projector resolution until an output window has reported in.
let outputSize = { w: 1920, h: 1080 };

function clampCoord(v) {
  // Corners are normalized 0-1 output-space, but we allow slight overshoot
  // beyond the frame since projector framing sometimes needs a surface's
  // corner to sit just off-screen.
  return Math.max(-0.2, Math.min(1.2, v));
}

function getSelectedSurface() {
  return project.surfaces.find((s) => s.id === selectedSurfaceId) || null;
}

// --- Mutators (control-side only). Each one mutates `project` in place,
// then the caller is responsible for persisting/broadcasting/rendering
// via `commitProjectChange()`. ---

function addSurface() {
  const surface = defaultSurface(project.surfaces.length + 1);
  project.surfaces.push(surface);
  selectedSurfaceId = surface.id;
  activeCornerIndex = 0;
  commitProjectChange();
}

function removeSurface(id) {
  project.surfaces = project.surfaces.filter((s) => s.id !== id);
  if (selectedSurfaceId === id) selectedSurfaceId = null;
  commitProjectChange();
}

function renameSurface(id, name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  const surface = project.surfaces.find((s) => s.id === id);
  if (!surface) return;
  surface.name = trimmed;
  commitProjectChange();
}

function toggleSurfaceVisible(id) {
  const surface = project.surfaces.find((s) => s.id === id);
  if (!surface) return;
  surface.visible = !surface.visible;
  commitProjectChange();
}

function selectSurface(id) {
  selectedSurfaceId = id;
  activeCornerIndex = 0;
  renderControl(); // selection is local UI state, no save/broadcast needed
}

function replaceProject(newProject) {
  project = newProject;
  selectedSurfaceId = null;
  activeCornerIndex = 0;
  commitProjectChange();
}

// Persist + broadcast + re-render, called after every control-side mutation.
function commitProjectChange() {
  saveProject(project);
  broadcastState();
  renderControl();
}

// =========================================================================
// SYNC (BroadcastChannel)
// =========================================================================

const channel = new BroadcastChannel("mapper");

function broadcastState() {
  channel.postMessage({ kind: "state", project });
}

// Transport message shape (structure only — consumers land in slice 3 when
// video/layers arrive). Always carries a changing nonce so a receiver can
// treat every message as a fresh command rather than deduping by value
// (the lyric-translator's storage-event lesson applies to BroadcastChannel
// too: don't rely on "value changed" semantics for command messages).
function broadcastTransport(action) {
  channel.postMessage({ kind: "transport", action, nonce: Date.now() });
}

// Control -> output: flash each visible surface's name/id on the output
// window for a couple seconds so Jorge can tell which physical surface is
// which while standing at the wall. Always carries a changing nonce (project
// convention) so the output treats every click as a fresh trigger, even if
// somehow the same millisecond repeats.
function broadcastIdentify() {
  channel.postMessage({ kind: "identify", nonce: Date.now() });
}

// Output -> control: report the output window's actual pixel size so arrow-
// key nudges (control-side) can be expressed in real output pixels. Sent on
// load and on every resize; always carries a nonce per project convention,
// though this consumer reads current w/h directly rather than diffing.
function broadcastOutputSize() {
  channel.postMessage({ kind: "outputSize", w: window.innerWidth, h: window.innerHeight, nonce: Date.now() });
}

function handleControlMessage(event) {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.kind === "hello") {
    // A fresh output window just opened and wants the current state.
    broadcastState();
  } else if (msg.kind === "outputSize" && typeof msg.w === "number" && typeof msg.h === "number") {
    outputSize = { w: msg.w, h: msg.h };
  }
}

function handleOutputMessage(event) {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.kind === "state" && isValidProject(msg.project)) {
    project = msg.project;
    renderOutput();
  } else if (msg.kind === "identify") {
    showIdentifyOverlay();
  }
  // 'transport' messages have no consumer yet in this slice.
}

// =========================================================================
// WARP (homography -> CSS matrix3d)
// =========================================================================
// Pure math, no DOM. Solves the standard planar projective transform (a
// "homography") that maps 4 source points onto 4 destination points, via
// the classic Direct Linear Transform setup: each correspondence gives 2
// linear equations in the 8 unknowns h0..h7 of
//
//   H = [ h0  h1  h2 ]
//       [ h3  h4  h5 ]
//       [ h6  h7   1 ]     (h8 fixed at 1 - defined up to scale)
//
// solved with plain Gaussian elimination + partial pivoting (no libraries -
// this is a spike). Verified standalone against known square->quad cases
// (identity, translation, keystone trapezoid, arbitrary skew) by round-
// tripping through the actual matrix3d column order + perspective divide -
// see the slice-2 build report for the script; not checked into the repo
// since this is a plain-JS spike with no test runner.

function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => row.concat([b[i]])); // augmented matrix, copy so we don't mutate inputs

  for (let col = 0; col < n; col++) {
    // Partial pivot: swap in the row with the largest magnitude in this
    // column, for numerical stability.
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(M[pivotRow][col]) < 1e-12) return null; // singular - degenerate corners (e.g. collinear)
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
      }
    }
  }

  return M.map((row, i) => row[n] / row[i]);
}

// srcCorners/dstCorners: 4 points each, [top-left, top-right, bottom-right,
// bottom-left] order (matches surface.corners everywhere in this app).
// Returns { h0..h7 } or null if the corners are degenerate (e.g. 3+ collinear).
function computeHomography(srcCorners, dstCorners) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = srcCorners[i];
    const [X, Y] = dstCorners[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  const h = solveLinearSystem(A, b);
  if (!h) return null;
  const [h0, h1, h2, h3, h4, h5, h6, h7] = h;
  return { h0, h1, h2, h3, h4, h5, h6, h7 };
}

// Embeds the 3x3 homography into a 4x4 CSS matrix3d(). The standard trick:
// build a matrix that leaves z untouched (row 3 = [0,0,1,0]) and puts the
// homography's perspective row (h6,h7,0,1) into row 4, so the GPU's own
// perspective divide (x/w, y/w) after the matrix multiply reproduces the 2D
// projective transform. CSS matrix3d(...) args are column-major, so the
// rows below get transposed into columns when written out.
function homographyToMatrix3dString(h) {
  const { h0, h1, h2, h3, h4, h5, h6, h7 } = h;
  const m = [
    h0, h3, 0, h6, // column 1
    h1, h4, 0, h7, // column 2
    0, 0, 1, 0, // column 3 (z passthrough)
    h2, h5, 0, 1, // column 4 (translation + perspective constant)
  ];
  return `matrix3d(${m.join(",")})`;
}

// The pattern/layer content is drawn into a fixed 1000x1000px "unit square"
// local coordinate space; this is the homography's source domain for every
// surface. Corner order matches surface.corners: [TL, TR, BR, BL].
const UNIT_SIZE = 1000;
const UNIT_SRC_CORNERS = [
  [0, 0],
  [UNIT_SIZE, 0],
  [UNIT_SIZE, UNIT_SIZE],
  [0, UNIT_SIZE],
];

// Returns a matrix3d() string mapping the UNIT_SIZE content box onto the
// surface's normalized corners, scaled into window-pixel space (w,h) - or
// null if the corners are currently degenerate (caller should skip render).
function surfaceMatrix3d(surface, w, h) {
  const dstCorners = surface.corners.map(([nx, ny]) => [nx * w, ny * h]);
  const H = computeHomography(UNIT_SRC_CORNERS, dstCorners);
  return H ? homographyToMatrix3dString(H) : null;
}

// =========================================================================
// CONTROL UI
// =========================================================================

function renderControl() {
  renderSurfaceList();
  renderPreview();
}

function renderSurfaceList() {
  const list = document.getElementById("surface-list");
  list.innerHTML = "";

  if (project.surfaces.length === 0) {
    const empty = document.createElement("li");
    empty.className = "surface-list-empty";
    empty.textContent = "No surfaces yet. Add one to get started.";
    list.appendChild(empty);
    return;
  }

  project.surfaces.forEach((surface) => {
    const row = document.createElement("li");
    row.className = "surface-row";
    if (surface.id === selectedSurfaceId) row.classList.add("selected");
    if (!surface.visible) row.classList.add("hidden-surface");

    row.addEventListener("click", () => selectSurface(surface.id));

    const nameSpan = document.createElement("span");
    nameSpan.className = "surface-name";
    nameSpan.textContent = surface.name;
    row.appendChild(nameSpan);

    const actions = document.createElement("div");
    actions.className = "surface-actions";

    const visBtn = document.createElement("button");
    visBtn.type = "button";
    visBtn.className = "icon-btn";
    visBtn.title = surface.visible ? "Hide surface" : "Show surface";
    visBtn.textContent = surface.visible ? "\u{1F441}" : "\u{1F648}"; // eye / eye-blocked-ish
    visBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSurfaceVisible(surface.id);
    });
    actions.appendChild(visBtn);

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "icon-btn";
    renameBtn.title = "Rename surface";
    renameBtn.textContent = "✏️"; // pencil
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = window.prompt("Rename surface", surface.name);
      if (next !== null) renameSurface(surface.id, next);
    });
    actions.appendChild(renameBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn danger";
    deleteBtn.title = "Delete surface";
    deleteBtn.textContent = "\u{1F5D1}️"; // trash
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.confirm(`Delete "${surface.name}"?`)) removeSurface(surface.id);
    });
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    list.appendChild(row);
  });
}

function renderPreview() {
  const svg = document.getElementById("preview-svg");
  svg.innerHTML = "";

  project.surfaces
    .filter((s) => s.visible)
    .forEach((surface) => {
      const points = surface.corners
        .map(([x, y]) => `${x * PREVIEW_W},${y * PREVIEW_H}`)
        .join(" ");
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute("points", points);
      poly.setAttribute("class", "preview-surface-outline");
      if (surface.id === selectedSurfaceId) poly.classList.add("selected");
      svg.appendChild(poly);
    });

  // Draggable corner handles for the selected surface only. Non-selected
  // surfaces stay plain outlines (drawn above).
  const selected = getSelectedSurface();
  if (selected) renderCornerHandles(svg, selected);
}

function renderCornerHandles(svg, surface) {
  surface.corners.forEach((corner, i) => {
    const [nx, ny] = corner;
    const cx = nx * PREVIEW_W;
    const cy = ny * PREVIEW_H;

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "corner-handle" + (i === activeCornerIndex ? " active" : ""));

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", 12);
    group.appendChild(circle);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", cx);
    label.setAttribute("y", cy);
    label.textContent = String(i + 1);
    group.appendChild(label);

    group.addEventListener("pointerdown", (e) => startCornerDrag(e, svg, surface, i));
    svg.appendChild(group);
  });
}

// Drag a single corner handle. Renders locally every pointermove for
// immediate visual feedback (both in the preview and, throttled, on the
// live output), but only saves+broadcasts at most every ~80ms plus once on
// release - the same "render fast, commit throttled" split slice 1's
// commitProjectChange() choke point was designed for.
function startCornerDrag(e, svg, surface, cornerIndex) {
  e.preventDefault();
  e.stopPropagation();
  activeCornerIndex = cornerIndex;

  const handle = e.currentTarget;
  handle.setPointerCapture(e.pointerId);

  const THROTTLE_MS = 80;
  let lastCommitAt = 0;

  function pointerToNormalized(evt) {
    // preview-svg's viewBox (1600x900) matches its rendered aspect ratio
    // exactly (.preview-box is 16/9), so no letterboxing - a fraction of
    // the element's own bounding box is already the normalized 0-1 coord.
    const rect = svg.getBoundingClientRect();
    const nx = (evt.clientX - rect.left) / rect.width;
    const ny = (evt.clientY - rect.top) / rect.height;
    return [clampCoord(nx), clampCoord(ny)];
  }

  function onMove(evt) {
    surface.corners[cornerIndex] = pointerToNormalized(evt);
    renderPreview(); // local-only, fast
    const now = Date.now();
    if (now - lastCommitAt >= THROTTLE_MS) {
      lastCommitAt = now;
      saveProject(project);
      broadcastState();
    }
  }

  function onUp() {
    handle.releasePointerCapture(e.pointerId);
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onUp);
    commitProjectChange(); // final save+broadcast+render, guarantees no drift
  }

  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onUp);
}

// =========================================================================
// CALIBRATION (arrow-key nudge)
// =========================================================================
// The critical live-calibration UX: select a surface, press 1-4 to pick a
// corner, then arrow-key nudge it in real output pixels while watching the
// projected result. Nudges are discrete (no throttle needed) and route
// through the normal commitProjectChange() choke point.

function isTextInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

const NUDGE_ARROW_DELTAS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

function nudgeActiveCorner(dxPx, dyPx) {
  const surface = getSelectedSurface();
  if (!surface) return;
  const [x, y] = surface.corners[activeCornerIndex];
  surface.corners[activeCornerIndex] = [
    clampCoord(x + dxPx / outputSize.w),
    clampCoord(y + dyPx / outputSize.h),
  ];
  commitProjectChange();
}

function handleControlKeydown(e) {
  if (isTextInputFocused()) return;
  if (!selectedSurfaceId) return;

  if (e.key >= "1" && e.key <= "4") {
    activeCornerIndex = Number(e.key) - 1;
    renderPreview();
    return;
  }

  const delta = NUDGE_ARROW_DELTAS[e.key];
  if (delta) {
    e.preventDefault(); // don't let arrows scroll the page
    const step = e.shiftKey ? 1 : 5; // output px; shift = fine
    nudgeActiveCorner(delta[0] * step, delta[1] * step);
  }
}

function exportProject() {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wallmapper-project.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importProjectFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!isValidProject(parsed)) {
        window.alert("That file doesn't look like a Wall Mapper project (missing version/surfaces).");
        return;
      }
      replaceProject(parsed);
    } catch (err) {
      window.alert("Could not read that file as JSON.");
      console.error("Wall Mapper import error:", err);
    }
  };
  reader.onerror = () => {
    window.alert("Could not read that file.");
  };
  reader.readAsText(file);
}

function wireControlEvents() {
  document.getElementById("btn-add-surface").addEventListener("click", addSurface);

  document.getElementById("btn-open-output").addEventListener("click", () => {
    window.open("mapper.html?output", "mapper-output");
  });

  document.getElementById("btn-identify").addEventListener("click", broadcastIdentify);

  document.getElementById("btn-export").addEventListener("click", exportProject);

  const fileInput = document.getElementById("file-import");
  document.getElementById("btn-import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) importProjectFromFile(file);
    fileInput.value = ""; // allow re-importing the same filename later
  });
}

function initControl() {
  document.getElementById("control-root").hidden = false;
  channel.addEventListener("message", handleControlMessage);
  wireControlEvents();
  // Keydown on the whole document (not a specific element) so nudging works
  // no matter what's focused in the control window, short of a text input.
  document.addEventListener("keydown", handleControlKeydown);
  renderControl();
}

// =========================================================================
// OUTPUT RENDERING
// =========================================================================
// Per visible surface: a fixed 1000x1000 wrapper div, warped onto the
// surface's corners (in current window pixels) via matrix3d - see the WARP
// section above for the homography math. Re-renders on every received
// state and on window resize (wired in initOutput()).

function renderOutput() {
  const container = document.getElementById("output-surfaces");
  container.innerHTML = "";

  const w = window.innerWidth;
  const h = window.innerHeight;

  project.surfaces
    .filter((s) => s.visible)
    .forEach((surface) => renderOutputSurface(container, surface, w, h));
}

function renderOutputSurface(container, surface, w, h) {
  const transform = surfaceMatrix3d(surface, w, h);
  if (!transform) return; // degenerate corners (e.g. collinear) - skip rather than throw

  const wrapper = document.createElement("div");
  wrapper.className = "surface-wrapper";
  wrapper.dataset.surfaceId = surface.id;
  wrapper.style.width = `${UNIT_SIZE}px`;
  wrapper.style.height = `${UNIT_SIZE}px`;
  wrapper.style.transform = transform;

  wrapper.appendChild(renderLayer(surface));
  container.appendChild(wrapper);
}

// Renders the content that lives inside a surface's warped wrapper. This
// slice only implements the calibration 'pattern' layer; any other
// layer.type (video/image/beat) also falls back to the pattern for now -
// slice 3 adds the real layer types here.
function renderLayer(surface) {
  return renderPatternLayer(surface);
}

// 1000x1000 canvas: numbered grid + brighter center crosshair + the
// surface's name + numbered corner markers 1-4 matching the nudge keys and
// surface.corners order [TL, TR, BR, BL]. Each surface gets a distinct hue
// (derived from its id) so multiple surfaces read as distinguishable
// patches of color/pattern on the wall.
function renderPatternLayer(surface) {
  const canvas = document.createElement("canvas");
  canvas.width = UNIT_SIZE;
  canvas.height = UNIT_SIZE;
  canvas.className = "pattern-canvas";
  const ctx = canvas.getContext("2d");
  const hue = surfaceHue(surface);

  ctx.fillStyle = `hsl(${hue}, 55%, 12%)`;
  ctx.fillRect(0, 0, UNIT_SIZE, UNIT_SIZE);

  // 10x10 grid.
  const cell = UNIT_SIZE / 10;
  ctx.strokeStyle = `hsl(${hue}, 70%, 45%)`;
  ctx.lineWidth = 2;
  for (let i = 1; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, UNIT_SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(UNIT_SIZE, i * cell);
    ctx.stroke();
  }

  // Outer border.
  ctx.strokeStyle = `hsl(${hue}, 80%, 65%)`;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, UNIT_SIZE - 4, UNIT_SIZE - 4);

  // Brighter center crosshair.
  const mid = UNIT_SIZE / 2;
  ctx.strokeStyle = `hsl(${hue}, 90%, 80%)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mid - cell, mid);
  ctx.lineTo(mid + cell, mid);
  ctx.moveTo(mid, mid - cell);
  ctx.lineTo(mid, mid + cell);
  ctx.stroke();

  // Surface name, large, centered (offset below the crosshair so it doesn't
  // overlap it).
  ctx.fillStyle = "#fff";
  ctx.font = "bold 64px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(surface.name, mid, mid + cell * 1.6);

  // Numbered corner markers 1-4, matching both the nudge keys and
  // surface.corners order [TL, TR, BR, BL].
  const markerInset = 70;
  const markerPositions = [
    [markerInset, markerInset],
    [UNIT_SIZE - markerInset, markerInset],
    [UNIT_SIZE - markerInset, UNIT_SIZE - markerInset],
    [markerInset, UNIT_SIZE - markerInset],
  ];
  markerPositions.forEach(([mx, my], i) => {
    ctx.beginPath();
    ctx.arc(mx, my, 44, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.85)`;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#111";
    ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
    ctx.fillText(String(i + 1), mx, my + 2);
  });

  return canvas;
}

function surfaceHue(surface) {
  // Deterministic hue derived from the surface id (simple string hash) so
  // colors stay stable across re-renders instead of flickering, and
  // distinct surfaces reliably land on distinct hues.
  let hash = 0;
  for (let i = 0; i < surface.id.length; i++) {
    hash = (hash * 31 + surface.id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

// =========================================================================
// IDENTIFY (output overlay)
// =========================================================================
// In response to a broadcast 'identify', overlay each visible surface's
// name + id at its centroid in plain screen space (unwarped - this is a
// readability aid, not part of the projected content) for ~2s.

let identifyTimer = null;

function showIdentifyOverlay() {
  const container = document.getElementById("output-identify");
  container.innerHTML = "";

  const w = window.innerWidth;
  const h = window.innerHeight;

  project.surfaces
    .filter((s) => s.visible)
    .forEach((surface) => {
      const points = surface.corners.map(([nx, ny]) => [nx * w, ny * h]);
      const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
      const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;

      const label = document.createElement("div");
      label.className = "identify-label";
      label.style.left = `${cx}px`;
      label.style.top = `${cy}px`;
      label.textContent = `${surface.name}\n${surface.id}`;
      container.appendChild(label);
    });

  window.clearTimeout(identifyTimer);
  identifyTimer = window.setTimeout(() => {
    container.innerHTML = "";
  }, 2000);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.warn("Wall Mapper: fullscreen request failed.", err);
    });
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function initOutput() {
  document.getElementById("output-root").hidden = false;
  channel.addEventListener("message", handleOutputMessage);
  window.addEventListener("resize", () => {
    renderOutput();
    broadcastOutputSize();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") toggleFullscreen();
  });
  window.addEventListener("dblclick", toggleFullscreen);

  renderOutput();
  channel.postMessage({ kind: "hello" });
  broadcastOutputSize();
}

// =========================================================================
// ROLE DETECTION / INIT
// =========================================================================

const isOutputRole = new URLSearchParams(window.location.search).has("output");

if (isOutputRole) {
  document.body.classList.add("role-output");
  project = emptyProject(); // output never seeds from localStorage; waits for state broadcast
  initOutput();
} else {
  project = loadProject();
  initControl();
}
