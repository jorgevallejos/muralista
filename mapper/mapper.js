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

// --- Layer mutators (slice 3). All route through commitProjectChange() like
// every other control-side mutation. ---

function setLayerType(id, type) {
  const surface = project.surfaces.find((s) => s.id === id);
  if (!surface) return;
  surface.layer = surface.layer || { type: "pattern", src: null, opacity: 1, bpm: 96 };
  surface.layer.type = type;
  commitProjectChange();
}

function setLayerField(id, field, value) {
  const surface = project.surfaces.find((s) => s.id === id);
  if (!surface || !surface.layer) return;
  surface.layer[field] = value;
  commitProjectChange();
}

// --- Photo backdrop mutators (slice 3). Authoring aid only - output never
// sees project.photo (renderOutput/renderLayer never read it). ---

function setBackdropPhoto(dataUrl) {
  project.photo = dataUrl;
  commitProjectChange();
}

function clearBackdropPhoto() {
  project.photo = null;
  commitProjectChange();
}

// Phone photos can be huge; downscale to a max width via an offscreen canvas
// before storing as a dataURL so autosave stays well under localStorage's
// ~5-10MB budget.
const BACKDROP_MAX_WIDTH = 1600;

function loadBackdropPhotoFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, BACKDROP_MAX_WIDTH / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      setBackdropPhoto(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => window.alert("Could not read that image.");
    img.src = reader.result;
  };
  reader.onerror = () => window.alert("Could not read that file.");
  reader.readAsDataURL(file);
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

// Control-side memory of the last transport command sent, so a late-joining
// output (opened after Play was already pressed) can be brought up to speed
// in response to its 'hello' instead of sitting frozen on its first frame
// until the next transport click. See handleControlMessage.
let lastTransport = null;

// Control -> output: the downbeat timestamp all beat layers phase-lock to,
// so multiple beat surfaces pulse in sync. Re-anchored on every Play/Restart
// (see handleTransportButton) and replied to any output's 'hello' so a
// window opened mid-set still lands on the current phase.
let controlBeatAnchorT0 = null;

function broadcastBeatAnchor() {
  if (controlBeatAnchorT0 == null) return;
  channel.postMessage({ kind: "beatAnchor", t0: controlBeatAnchorT0, nonce: Date.now() });
}

// Wired to the header Play/Pause/Restart buttons. Play and Restart both
// re-anchor the beat phase to "now" (that moment becomes the new downbeat)
// before broadcasting the transport action itself.
function handleTransportButton(action) {
  if (action === "play" || action === "restart") {
    controlBeatAnchorT0 = Date.now();
    broadcastBeatAnchor();
  }
  lastTransport = action;
  broadcastTransport(action);
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
    broadcastBeatAnchor(); // no-op if no anchor set yet (nothing has played)
    if (lastTransport) {
      // Bring a late joiner up to speed on playback too - without this, an
      // output opened after Play was already pressed sits frozen on its
      // first frame until the next transport click. Always re-send with a
      // FRESH nonce (project convention: never re-send a stale nonce, so
      // the receiver's "treat every message as a fresh command" logic still
      // holds). A late joiner should join playback, not seek everyone back
      // to 0, so a last action of 'restart' is re-sent as 'play' - this is
      // the only place 'restart' semantics are altered for a joiner.
      const action = lastTransport === "restart" ? "play" : lastTransport;
      channel.postMessage({ kind: "transport", action, nonce: Date.now() });
    }
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
  } else if (msg.kind === "transport" && typeof msg.action === "string") {
    applyTransportAction(msg.action);
  } else if (msg.kind === "beatAnchor" && typeof msg.t0 === "number") {
    beatAnchorT0 = msg.t0;
  }
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
  renderBackdrop();
  renderLayerPanel();
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

      // Cheap authoring aid: badge the surface with its layer type near its
      // centroid, rather than actually rendering media in the preview
      // (explicitly out of scope for v1 - not worth it).
      const layerType = surface.layer && surface.layer.type;
      if (layerType === "video" || layerType === "image") {
        const [cx, cy] = surfaceCentroidNormalized(surface);
        const badge = document.createElementNS(SVG_NS, "text");
        badge.setAttribute("x", cx * PREVIEW_W);
        badge.setAttribute("y", cy * PREVIEW_H);
        badge.setAttribute("class", "preview-layer-badge");
        badge.textContent = layerType === "video" ? "▶ video" : "\u{1F5BC} image";
        svg.appendChild(badge);
      }
    });

  // Draggable corner handles for the selected surface only. Non-selected
  // surfaces stay plain outlines (drawn above).
  const selected = getSelectedSurface();
  if (selected) renderCornerHandles(svg, selected);
}

function surfaceCentroidNormalized(surface) {
  const xs = surface.corners.map((c) => c[0]);
  const ys = surface.corners.map((c) => c[1]);
  return [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length];
}

function renderBackdrop() {
  const img = document.getElementById("preview-backdrop");
  if (project.photo) {
    img.src = project.photo;
    img.hidden = false;
  } else {
    img.hidden = true;
    img.removeAttribute("src");
  }
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
// LAYER PANEL (sidebar, selected surface's layer)
// =========================================================================
// Rebuilds the panel's DOM only when its "key" (surface id + layer type)
// changes - typing in the src field or dragging the opacity slider fires
// commitProjectChange() on every keystroke/input, which would otherwise
// recreate the input mid-edit and lose focus/cursor position. Same-key
// re-renders instead just refresh field values, skipping whichever field
// currently has focus.

let layerPanelKey = null;

function renderLayerPanel() {
  const container = document.getElementById("layer-panel");
  const surface = getSelectedSurface();

  if (!surface) {
    layerPanelKey = null;
    container.innerHTML = '<p class="layer-panel-empty">Select a surface to edit its layer.</p>';
    return;
  }

  surface.layer = surface.layer || { type: "pattern", src: null, opacity: 1, bpm: 96 };
  const layer = surface.layer;
  const key = `${surface.id}:${layer.type}`;

  if (key !== layerPanelKey) {
    layerPanelKey = key;
    buildLayerPanel(container, surface, layer);
  } else {
    updateLayerPanelValues(container, layer);
  }
}

function buildLayerPanel(container, surface, layer) {
  container.innerHTML = "";

  // Type selector.
  const typeRow = document.createElement("div");
  typeRow.className = "layer-field";
  const typeLabel = document.createElement("label");
  typeLabel.textContent = "Type";
  typeLabel.setAttribute("for", "layer-type-select");
  const typeSelect = document.createElement("select");
  typeSelect.id = "layer-type-select";
  ["pattern", "video", "image", "beat"].forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    typeSelect.appendChild(opt);
  });
  typeSelect.value = layer.type;
  typeSelect.addEventListener("change", () => setLayerType(surface.id, typeSelect.value));
  typeRow.append(typeLabel, typeSelect);
  container.appendChild(typeRow);

  // Video / image: src path field + file-pick convenience.
  if (layer.type === "video" || layer.type === "image") {
    const srcRow = document.createElement("div");
    srcRow.className = "layer-field";
    const srcLabel = document.createElement("label");
    srcLabel.textContent = "Source (relative to mapper/media/)";
    srcLabel.setAttribute("for", "layer-src-input");
    const srcInput = document.createElement("input");
    srcInput.type = "text";
    srcInput.id = "layer-src-input";
    // "e.g." prefix matters: a bare filename placeholder reads as an actual
    // prefilled value, and users assume the video is already linked.
    srcInput.placeholder = layer.type === "video" ? "e.g. media/cerdo.mp4" : "e.g. media/character.png";
    srcInput.value = layer.src || "";
    // 'change' (blur/Enter), not 'input': the reconciling output render
    // recreates the video/image element whenever layer.src changes, so
    // committing on every keystroke would churn through a fetch for every
    // partial path typed (e.g. "media/cer...") instead of just the final one.
    srcInput.addEventListener("change", () => setLayerField(surface.id, "src", srcInput.value));
    srcRow.append(srcLabel, srcInput);
    container.appendChild(srcRow);

    const fileRow = document.createElement("div");
    fileRow.className = "layer-field";
    const fileBtn = document.createElement("button");
    fileBtn.type = "button";
    fileBtn.textContent = "Pick file…";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.hidden = true;
    fileInput.accept = layer.type === "video" ? "video/*" : "image/*,.webm";
    fileBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) {
        const relPath = `media/${file.name}`;
        srcInput.value = relPath;
        setLayerField(surface.id, "src", relPath);
      }
      fileInput.value = "";
    });
    const hint = document.createElement("p");
    hint.className = "layer-hint";
    hint.textContent = "Picking a file only fills in the path above - the file itself must already be copied into mapper/media/.";
    fileRow.append(fileBtn, fileInput, hint);
    container.appendChild(fileRow);
  }

  // Beat: BPM field.
  if (layer.type === "beat") {
    const bpmRow = document.createElement("div");
    bpmRow.className = "layer-field";
    const bpmLabel = document.createElement("label");
    bpmLabel.textContent = "BPM";
    bpmLabel.setAttribute("for", "layer-bpm-input");
    const bpmInput = document.createElement("input");
    bpmInput.type = "number";
    bpmInput.id = "layer-bpm-input";
    bpmInput.min = "20";
    bpmInput.max = "300";
    bpmInput.value = String(layer.bpm ?? 96);
    bpmInput.addEventListener("input", () => {
      const n = Number(bpmInput.value);
      if (Number.isFinite(n) && n > 0) setLayerField(surface.id, "bpm", n);
    });
    bpmRow.append(bpmLabel, bpmInput);
    container.appendChild(bpmRow);
  }

  // Opacity (all layer types).
  const opacityRow = document.createElement("div");
  opacityRow.className = "layer-field";
  const opacityLabel = document.createElement("label");
  opacityLabel.textContent = "Opacity";
  opacityLabel.setAttribute("for", "layer-opacity-input");
  const opacityInput = document.createElement("input");
  opacityInput.type = "range";
  opacityInput.id = "layer-opacity-input";
  opacityInput.min = "0";
  opacityInput.max = "1";
  opacityInput.step = "0.01";
  opacityInput.value = String(layer.opacity ?? 1);
  const opacityValue = document.createElement("span");
  opacityValue.id = "layer-opacity-value";
  opacityValue.className = "layer-opacity-value";
  opacityValue.textContent = Number(layer.opacity ?? 1).toFixed(2);
  opacityInput.addEventListener("input", () => {
    opacityValue.textContent = Number(opacityInput.value).toFixed(2);
    setLayerField(surface.id, "opacity", Number(opacityInput.value));
  });
  opacityRow.append(opacityLabel, opacityInput, opacityValue);
  container.appendChild(opacityRow);
}

// Refreshes field values without rebuilding the DOM (see renderLayerPanel).
// Skips whichever field is currently focused so an in-progress edit isn't
// clobbered by the re-render its own commit triggered.
function updateLayerPanelValues(container, layer) {
  const active = document.activeElement;

  const typeSelect = container.querySelector("#layer-type-select");
  if (typeSelect && active !== typeSelect) typeSelect.value = layer.type;

  const srcInput = container.querySelector("#layer-src-input");
  if (srcInput && active !== srcInput) srcInput.value = layer.src || "";

  const bpmInput = container.querySelector("#layer-bpm-input");
  if (bpmInput && active !== bpmInput) bpmInput.value = String(layer.bpm ?? 96);

  const opacityInput = container.querySelector("#layer-opacity-input");
  if (opacityInput && active !== opacityInput) opacityInput.value = String(layer.opacity ?? 1);
  const opacityValue = container.querySelector("#layer-opacity-value");
  if (opacityValue) opacityValue.textContent = Number(layer.opacity ?? 1).toFixed(2);
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
    const win = window.open("mapper.html?output", "mapper-output");
    if (win) {
      // If the named window already exists (possibly behind other windows or
      // on another display), window.open only re-navigates it - bring it
      // forward so the click never looks like a no-op.
      win.focus();
    } else {
      window.alert(
        "Chrome blocked the output window popup.\n\n" +
          "Click the blocked-popup icon at the right end of the address bar " +
          "and allow popups for localhost, then try again."
      );
    }
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

  document.getElementById("btn-play").addEventListener("click", () => handleTransportButton("play"));
  document.getElementById("btn-pause").addEventListener("click", () => handleTransportButton("pause"));
  document.getElementById("btn-restart").addEventListener("click", () => handleTransportButton("restart"));

  const backdropInput = document.getElementById("file-backdrop");
  document.getElementById("btn-backdrop").addEventListener("click", () => backdropInput.click());
  backdropInput.addEventListener("change", () => {
    const file = backdropInput.files && backdropInput.files[0];
    if (file) loadBackdropPhotoFile(file);
    backdropInput.value = "";
  });
  document.getElementById("btn-backdrop-clear").addEventListener("click", clearBackdropPhoto);
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

// Reconciliation map: surfaceId -> { wrapper, layerType, layerSrc, contentEl,
// rafId, beatToken, bpm, hue }. renderOutput() runs on every received state
// AND on every window resize (arrow-key nudges commit a state broadcast per
// keystroke). Without this map, the old "container.innerHTML = ''; rebuild
// everything" approach would tear down and recreate every <video>/beat
// canvas on every single nudge or resize - restarting playback and losing
// beat phase constantly, which is exactly wrong for calibrating WHILE video
// plays. Now: the wrapper transform + layer opacity update every render: the
// underlying video/image/canvas element only gets recreated when its
// surface's layer.type or layer.src actually changes.
const outputSurfaceElements = new Map();

function renderOutput() {
  const container = document.getElementById("output-surfaces");
  const w = window.innerWidth;
  const h = window.innerHeight;

  const visibleSurfaces = project.surfaces.filter((s) => s.visible);
  const visibleIds = new Set(visibleSurfaces.map((s) => s.id));

  // Drop entries for surfaces that were removed or hidden since the last
  // render (also stops/pauses their media - see teardownLayerContent).
  for (const [id, entry] of outputSurfaceElements) {
    if (!visibleIds.has(id)) {
      teardownLayerContent(entry);
      entry.wrapper.remove();
      outputSurfaceElements.delete(id);
    }
  }

  visibleSurfaces.forEach((surface) => renderOutputSurface(container, surface, w, h));
}

function renderOutputSurface(container, surface, w, h) {
  const transform = surfaceMatrix3d(surface, w, h);
  const existing = outputSurfaceElements.get(surface.id);

  if (!transform) {
    // Degenerate corners (e.g. collinear) - skip rather than throw, and tear
    // down any element that existed from before the corners went degenerate.
    if (existing) {
      teardownLayerContent(existing);
      existing.wrapper.remove();
      outputSurfaceElements.delete(surface.id);
    }
    return;
  }

  let entry = existing;
  if (!entry) {
    const wrapper = document.createElement("div");
    wrapper.className = "surface-wrapper";
    wrapper.dataset.surfaceId = surface.id;
    wrapper.style.width = `${UNIT_SIZE}px`;
    wrapper.style.height = `${UNIT_SIZE}px`;
    container.appendChild(wrapper);
    entry = { wrapper, layerType: null, layerSrc: null, contentEl: null, rafId: null, beatToken: null, bpm: null, hue: null };
    outputSurfaceElements.set(surface.id, entry);
  }

  entry.wrapper.style.transform = transform;
  renderLayer(surface, entry);
}

// Renders (or reconciles) the content that lives inside a surface's warped
// wrapper. Only recreates the content element when layer.type or layer.src
// changed since the last render; otherwise just refreshes cheap properties
// (opacity, and for 'beat', the live bpm the running rAF loop reads) on the
// existing element so playback/animation state survives.
function renderLayer(surface, entry) {
  const layer = surface.layer || { type: "pattern", src: null, opacity: 1, bpm: 96 };
  const nextSrc = layer.src || null;
  const typeChanged = entry.layerType !== layer.type;
  const srcChanged = entry.layerSrc !== nextSrc;

  if (typeChanged || srcChanged) {
    teardownLayerContent(entry); // pause/stop+detach whatever was there before
    entry.wrapper.innerHTML = "";
    entry.contentEl = createLayerElement(surface, layer, entry);
    entry.wrapper.appendChild(entry.contentEl);
    entry.layerType = layer.type;
    entry.layerSrc = nextSrc;
  } else if (layer.type === "beat") {
    entry.bpm = layer.bpm || 96; // live value; the running rAF loop reads entry.bpm each frame
  }

  if (entry.contentEl) {
    entry.contentEl.style.opacity = String(layer.opacity ?? 1);
  }
}

function createLayerElement(surface, layer, entry) {
  switch (layer.type) {
    case "video":
      return createVideoLayerElement(layer, surface);
    case "image":
      return createImageLayerElement(layer, surface);
    case "beat":
      return createBeatLayerElement(surface, layer, entry);
    case "pattern":
    default:
      return renderPatternLayer(surface);
  }
}

// Stops/detaches whatever content element (if any) currently lives in an
// entry: pauses+releases a <video>, cancels a beat layer's rAF loop. Safe to
// call on an entry with no content yet.
function teardownLayerContent(entry) {
  if (entry.rafId != null) {
    cancelAnimationFrame(entry.rafId);
    entry.rafId = null;
  }
  entry.beatToken = null; // any in-flight rAF callback checks this and bails
  if (entry.contentEl) {
    // Media layers are a .layer-box wrapper with the <video>/<img> inside
    // (so a failure note can overlay them) - release any video found.
    const video =
      entry.contentEl.tagName === "VIDEO"
        ? entry.contentEl
        : entry.contentEl.querySelector && entry.contentEl.querySelector("video");
    if (video) {
      registeredVideoEls.delete(video);
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    entry.contentEl = null;
  }
}

// Wraps a media element in a box with an overlay note that appears when the
// media has no source or fails to load. Black-on-black failures are
// undebuggable mid-calibration at a projector - failures must be VISIBLE on
// the output itself.
function wrapMediaWithFailureNote(mediaEl, surface, layer, kindLabel) {
  const box = document.createElement("div");
  box.className = "layer-box";

  const note = document.createElement("div");
  note.className = "layer-note";
  note.hidden = true;

  if (!layer.src) {
    note.textContent = `${surface.name}\nno ${kindLabel} source set`;
    note.hidden = false;
  } else {
    mediaEl.addEventListener("error", () => {
      note.textContent = `${surface.name}\n${kindLabel} failed to load:\n${layer.src}`;
      note.hidden = false;
    });
  }

  box.append(mediaEl, note);
  return box;
}

// =========================================================================
// TRANSPORT (output-side: play/pause/restart every video layer element)
// =========================================================================
// Shared clock per the kickoff decision: every video layer on the output
// responds to the same global transport command, not an independent one per
// surface. registeredVideoEls tracks every <video> currently mounted for a
// 'video' layer (not the alpha-webm 'image' variant, which autoplays on its
// own per spec - see createImageLayerElement) so a transport command can
// apply to all of them at once.
const registeredVideoEls = new Set();
let transportPlaying = false;

function playVideoQuietly(video) {
  const p = video.play();
  // Videos are muted so autoplay policy shouldn't block this, but a play()
  // promise can still reject (e.g. interrupted by a near-simultaneous
  // pause()) - don't let that become an unhandled rejection.
  if (p && typeof p.catch === "function") {
    p.catch((err) => console.warn("Wall Mapper: video play() was rejected.", err));
  }
}

function applyTransportAction(action) {
  if (action === "play") {
    transportPlaying = true;
    registeredVideoEls.forEach(playVideoQuietly);
  } else if (action === "pause") {
    transportPlaying = false;
    registeredVideoEls.forEach((v) => v.pause());
  } else if (action === "restart") {
    transportPlaying = true;
    registeredVideoEls.forEach((v) => {
      v.currentTime = 0;
      playVideoQuietly(v);
    });
  }
}

// =========================================================================
// LAYER ELEMENT FACTORIES (video / image / beat)
// =========================================================================

function createVideoLayerElement(layer, surface) {
  const video = document.createElement("video");
  video.className = "layer-video";
  video.src = layer.src || "";
  video.muted = true;
  video.playsInline = true;
  video.loop = true; // sensible live default for a spike (no scripted stop point)
  video.preload = "auto";
  registeredVideoEls.add(video);
  // A surface switched to 'video' (or added) while transport is already
  // playing should join the shared clock rather than sit on its first frame.
  if (transportPlaying) playVideoQuietly(video);
  return wrapMediaWithFailureNote(video, surface, layer, "video");
}

function createImageLayerElement(layer, surface) {
  const src = layer.src || "";
  if (/\.webm$/i.test(src)) {
    // Alpha WebM stretch goal (VP9 transparency) - Chrome-only, autoplays
    // independently rather than joining the global video transport.
    const video = document.createElement("video");
    video.className = "layer-image-webm";
    video.src = src;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    playVideoQuietly(video);
    return wrapMediaWithFailureNote(video, surface, layer, "video");
  }
  const img = document.createElement("img");
  img.className = "layer-image";
  img.src = src;
  img.alt = "";
  return wrapMediaWithFailureNote(img, surface, layer, "image");
}

function createBeatLayerElement(surface, layer, entry) {
  const canvas = document.createElement("canvas");
  canvas.width = UNIT_SIZE;
  canvas.height = UNIT_SIZE;
  canvas.className = "beat-canvas";
  const ctx = canvas.getContext("2d");

  entry.bpm = layer.bpm || 96;
  entry.hue = surfaceHue(surface);

  // A fresh token per (re)start; the loop bails as soon as it no longer
  // matches entry.beatToken, i.e. the moment this layer gets torn down or
  // replaced - avoids a stray rAF callback drawing into a detached canvas.
  const token = {};
  entry.beatToken = token;

  function frame() {
    if (entry.beatToken !== token) return;
    drawBeatFrame(ctx, entry.bpm, entry.hue);
    entry.rafId = requestAnimationFrame(frame);
  }
  entry.rafId = requestAnimationFrame(frame);

  return canvas;
}

// Module-level default: until a 'beatAnchor' broadcast arrives, phase from
// the moment this output window loaded (same-machine clocks, Date.now() is
// fine per kickoff - no NTP-grade sync needed for a spike).
let beatAnchorT0 = Date.now();

function beatPhase(bpm) {
  const periodMs = 60000 / (bpm || 96);
  return ((Date.now() - beatAnchorT0) % periodMs) / periodMs; // 0..1, wraps every beat
}

// Simple radial pulse: a ring expands from center and fades out over one
// beat period, plus a soft core glow, in the surface's own hue so multiple
// beat surfaces read as distinguishable even though they share phase.
function drawBeatFrame(ctx, bpm, hue) {
  const phase = beatPhase(bpm);
  const mid = UNIT_SIZE / 2;
  const maxR = UNIT_SIZE * 0.45;

  ctx.fillStyle = `hsl(${hue}, 55%, 6%)`;
  ctx.fillRect(0, 0, UNIT_SIZE, UNIT_SIZE);

  const glow = ctx.createRadialGradient(mid, mid, 0, mid, mid, maxR * 0.4);
  glow.addColorStop(0, `hsla(${hue}, 90%, 70%, ${0.55 * (1 - phase)})`);
  glow.addColorStop(1, "hsla(0, 0%, 0%, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(mid, mid, maxR * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(mid, mid, Math.max(maxR * phase, 1), 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${1 - phase})`;
  ctx.lineWidth = 16 * (1 - phase * 0.6);
  ctx.stroke();
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

// Opening mapper.html straight from Finder (file://) breaks BroadcastChannel
// and media loading - catch it loudly instead of failing silently.
if (window.location.protocol === "file:") {
  window.alert(
    "Wall Mapper must be served over HTTP, not opened as a file.\n\n" +
      "In a terminal:  cd mapper && python3 -m http.server 8123\n" +
      "Then open:  http://localhost:8123/mapper.html"
  );
}

const isOutputRole = new URLSearchParams(window.location.search).has("output");

if (isOutputRole) {
  document.body.classList.add("role-output");
  project = emptyProject(); // output never seeds from localStorage; waits for state broadcast
  initOutput();
} else {
  project = loadProject();
  initControl();
}
