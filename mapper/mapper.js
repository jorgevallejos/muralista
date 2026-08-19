"use strict";

/*
 * Muralista — mapper.js
 *
 * Single script serving two roles, chosen by the URL query string:
 *   http://localhost:8123/mapper.html          -> control window
 *   http://localhost:8123/mapper.html?output    -> output window (projector)
 *
 * Sections: STATE, SYNC, WARP, CONTROL UI, OUTPUT RENDERING, ROLE / INIT.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
// DO NOT RENAME (decided 2026-08-20, with the Muralista rename). This key still carries the
// old "Wall Mapper" working title on purpose: every mapping Jorge has autosaved lives under
// it. Renaming it to match the product name orphans all of them, silently — the same failure
// as Pregonero's bundle-ID change, in a different costume. Same for BroadcastChannel("mapper")
// and the export filename below. See context/tramoya/rename-runbook.md.
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
    console.warn("Muralista: could not read saved project, starting fresh.", err);
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
// nudges apply to. Selected via the 1-4 keys. `null` means "whole surface"
// mode (0 or Escape clears back to this): arrow keys translate all 4
// corners together instead of nudging a single one. Control-local, never
// persisted. Defaults to null on every fresh selection so a click-select
// can be followed straight by arrow-key coarse placement, no extra keypress
// needed - corner precision is opt-in via 1-4.
let activeCornerIndex = null;

// Latest output-window size in real screen pixels, learned from the
// 'outputSize' broadcast (see WARP/SYNC below) so arrow-key nudges can be
// expressed in output pixels regardless of preview scale. Falls back to a
// common projector resolution until an output window has reported in.
let outputSize = { w: 1920, h: 1080 };

// Corners are normalized 0-1 output-space, but we allow slight overshoot
// beyond the frame since projector framing sometimes needs a surface's
// corner to sit just off-screen. Shared by single-corner clamping
// (clampCoord) and whole-surface translate clamping (clampTranslateDelta)
// so both use the same overshoot range.
const CORNER_OVERSHOOT_MIN = -0.2;
const CORNER_OVERSHOOT_MAX = 1.2;

function clampCoord(v) {
  return Math.max(CORNER_OVERSHOOT_MIN, Math.min(CORNER_OVERSHOOT_MAX, v));
}

// Clamps a proposed [dx, dy] translation so that applying it to EVERY corner
// in `corners` keeps every corner's coordinate inside the overshoot range,
// clamping each axis as a whole rather than per-corner - a per-corner clamp
// would distort the quad (e.g. one corner stops while the others keep
// moving); this instead finds the tightest corner on each axis and freezes
// the whole surface's motion on that axis at the point that corner would
// cross the bound, leaving the other axis free to keep moving.
function clampTranslateDelta(corners, [dx, dy]) {
  let dxMin = -Infinity, dxMax = Infinity, dyMin = -Infinity, dyMax = Infinity;
  corners.forEach(([x, y]) => {
    dxMin = Math.max(dxMin, CORNER_OVERSHOOT_MIN - x);
    dxMax = Math.min(dxMax, CORNER_OVERSHOOT_MAX - x);
    dyMin = Math.max(dyMin, CORNER_OVERSHOOT_MIN - y);
    dyMax = Math.min(dyMax, CORNER_OVERSHOOT_MAX - y);
  });
  return [Math.min(Math.max(dx, dxMin), dxMax), Math.min(Math.max(dy, dyMin), dyMax)];
}

// Shared pointer -> normalized output-space conversion for the preview SVG.
// preview-svg's viewBox (1600x900) matches its rendered aspect ratio exactly
// (.preview-box is 16/9), so no letterboxing - a fraction of the element's
// own bounding box is already the normalized 0-1 coord. Unclamped: callers
// decide whether/how to clamp (a single corner clamps itself directly; a
// whole-surface drag clamps the aggregate delta instead - see
// clampTranslateDelta).
function svgPointerToNormalized(evt, svg) {
  const rect = svg.getBoundingClientRect();
  return [(evt.clientX - rect.left) / rect.width, (evt.clientY - rect.top) / rect.height];
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
  activeCornerIndex = null;
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

// --- Z-order (v2.2). project.surfaces array order IS render order IS
// stacking order in both preview and output (later = on top) - these just
// move a surface one slot within that same array. No-op at either end of
// the list (buttons are also disabled there in the UI, but the mutator
// stays defensive since it's reachable from the smoke-test harness too). ---

function moveSurfaceUp(id) {
  const idx = project.surfaces.findIndex((s) => s.id === id);
  if (idx <= 0) return;
  const [surface] = project.surfaces.splice(idx, 1);
  project.surfaces.splice(idx - 1, 0, surface);
  commitProjectChange();
}

function moveSurfaceDown(id) {
  const idx = project.surfaces.findIndex((s) => s.id === id);
  if (idx === -1 || idx >= project.surfaces.length - 1) return;
  const [surface] = project.surfaces.splice(idx, 1);
  project.surfaces.splice(idx + 1, 0, surface);
  commitProjectChange();
}

// --- Duplicate (v2.2): the one-gesture way to register an alpha overlay
// exactly onto an existing (usually video) surface - same corners, same
// layer, inserted immediately after the original so it renders on top of it
// per the z-order rule above. Corners and layer are deep-copied so editing
// the copy (e.g. switching its layer to an overlay .webm) never touches the
// original. ---

function duplicateSurface(id) {
  const idx = project.surfaces.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const original = project.surfaces[idx];
  const copy = {
    id: genSurfaceId(),
    name: `${original.name} copy`,
    corners: original.corners.map(([x, y]) => [x, y]),
    layer: original.layer
      ? JSON.parse(JSON.stringify(original.layer))
      : { type: "pattern", src: null, opacity: 1, bpm: 96 },
    visible: original.visible,
  };
  project.surfaces.splice(idx + 1, 0, copy);
  selectedSurfaceId = copy.id;
  activeCornerIndex = null;
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
  activeCornerIndex = null;
  renderControl(); // selection is local UI state, no save/broadcast needed
}

function replaceProject(newProject) {
  project = newProject;
  selectedSurfaceId = null;
  activeCornerIndex = null;
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
  } else if (msg.kind === "audio" && typeof msg.level === "number") {
    handleAudioMessage(msg);
  }
}

// =========================================================================
// AUDIO REACTIVITY (output-side)
// =========================================================================
// Consumes the compact `{kind:'audio', level, onset, t}` envelope broadcast
// by the control window's mic capture loop (see MIC section, control-side
// only). Ephemeral by design, mirroring the broadcast: nothing here is
// persisted, and this state is never part of `project`.
//
// `latestAudio` is the raw last-received sample. If no audio message has
// arrived for AUDIO_STALE_MS (mic off, or the control window/tab closed),
// readers must treat the level as 0 rather than freezing on the last value -
// currentRawAudioLevel() below is the single place that decay rule lives.

let latestAudio = { level: 0, lastOnsetAt: 0 };
let lastAudioMessageAt = 0;
const AUDIO_STALE_MS = 1000;

function handleAudioMessage(msg) {
  latestAudio.level = Math.max(0, Math.min(1, msg.level));
  if (msg.onset) latestAudio.lastOnsetAt = performance.now();
  lastAudioMessageAt = performance.now();
}

function currentRawAudioLevel() {
  if (performance.now() - lastAudioMessageAt > AUDIO_STALE_MS) return 0;
  return latestAudio.level;
}

// A single eased copy of the raw level, updated once per output animation
// frame (see startAudioReactiveLoop) so every mic-reactive consumer (beat
// mic-mode canvases, the opacity modulation loop) reads the same smoothed
// value instead of each re-deriving its own - the raw level only updates at
// the control window's ~30Hz broadcast rate, so a per-frame reader smooths
// that into something that doesn't visibly step.
let smoothedAudioLevel = 0;
const AUDIO_SMOOTHING = 0.25; // 0..1, higher = snappier / less smoothing

function tickAudioSmoothing() {
  const target = currentRawAudioLevel();
  smoothedAudioLevel += (target - smoothedAudioLevel) * AUDIO_SMOOTHING;
}

// Shared rAF loop (started once from initOutput): keeps smoothedAudioLevel
// current every frame, then applies opacity modulation to media layers with
// micReactivity > 0. Deliberately does NOT add a per-entry loop - per the
// v2.3 spec, one shared loop iterates outputSurfaceElements each frame and
// only touches entries that opted in, leaving every other entry's opacity
// exactly as the normal state-render path (renderLayer) set it.
function audioReactiveFrame() {
  tickAudioSmoothing();
  outputSurfaceElements.forEach((entry) => {
    if (entry.micReactivity > 0 && entry.contentEl) {
      const base = entry.baseOpacity ?? 1;
      const effective = base * (1 - entry.micReactivity + entry.micReactivity * smoothedAudioLevel);
      entry.contentEl.style.opacity = String(effective);
    }
  });
  requestAnimationFrame(audioReactiveFrame);
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

  project.surfaces.forEach((surface, index) => {
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

    // Z-order: moves the surface within project.surfaces, which is the
    // render/stacking order in both preview and output (later = on top).
    // Disabled at the ends of the list rather than hidden, so the row's
    // button layout stays stable as surfaces reorder around it.
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "icon-btn";
    upBtn.title = "Move up the list (render earlier / further back)";
    upBtn.textContent = "▲"; // ▲
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveSurfaceUp(surface.id);
    });
    actions.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "icon-btn";
    downBtn.title = "Move down the list (render later / on top)";
    downBtn.textContent = "▼"; // ▼
    downBtn.disabled = index === project.surfaces.length - 1;
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveSurfaceDown(surface.id);
    });
    actions.appendChild(downBtn);

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

    // Duplicate: the one-gesture way to register an overlay exactly onto an
    // existing surface (same corners, same layer, dropped in right after the
    // original so it renders on top - see duplicateSurface()).
    const dupBtn = document.createElement("button");
    dupBtn.type = "button";
    dupBtn.className = "icon-btn";
    dupBtn.title = "Duplicate surface (same corners + layer, for exact registration)";
    dupBtn.textContent = "⧉"; // ⧉
    dupBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      duplicateSurface(surface.id);
    });
    actions.appendChild(dupBtn);

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
      // Click-to-select + whole-surface drag in one gesture. Polygons are
      // appended in list order, so paint order already makes a later surface
      // sit on top of an earlier one - the browser's own hit-testing picks
      // the topmost polygon under the pointer with no extra bookkeeping.
      poly.addEventListener("pointerdown", (e) => startSurfaceDrag(e, svg, surface));
      svg.appendChild(poly);

      // Cheap authoring aid: badge the surface with its layer type near its
      // centroid, rather than actually rendering media in the preview
      // (explicitly out of scope for v1 - not worth it). A .webm image layer
      // is badged as "overlay" rather than "image" - it's transport-synced
      // content, not a static picture, and the badge should say so at a
      // glance.
      const layer = surface.layer;
      const layerType = layer && layer.type;
      if (layerType === "video" || layerType === "image") {
        const isAlphaOverlay = layerType === "image" && /\.webm$/i.test((layer && layer.src) || "");
        const [cx, cy] = surfaceCentroidNormalized(surface);
        const badge = document.createElementNS(SVG_NS, "text");
        badge.setAttribute("x", cx * PREVIEW_W);
        badge.setAttribute("y", cy * PREVIEW_H);
        badge.setAttribute("class", "preview-layer-badge");
        badge.textContent = layerType === "video" ? "▶ video" : isAlphaOverlay ? "▶ overlay" : "\u{1F5BC} image";
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

    // Larger invisible hit target behind the visible dot. Projector-session
    // use is hurried and imprecise - pointer events bubble from either
    // circle up to the group's single listener below, so this just widens
    // what counts as "on the handle" without changing the drag logic.
    // pointer-events:all (set in CSS) is required because the fill is
    // transparent: SVG's default hit-testing (visiblePainted) only counts
    // painted areas, so an unpainted circle would otherwise be a click-
    // through hole even though it's present in the DOM.
    const hitTarget = document.createElementNS(SVG_NS, "circle");
    hitTarget.setAttribute("cx", cx);
    hitTarget.setAttribute("cy", cy);
    hitTarget.setAttribute("r", 18);
    hitTarget.setAttribute("class", "corner-handle-hit");
    group.appendChild(hitTarget);

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", 10);
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
  capturePointerSafely(handle, e.pointerId);

  const THROTTLE_MS = 80;
  let lastCommitAt = 0;

  function pointerToNormalized(evt) {
    const [nx, ny] = svgPointerToNormalized(evt, svg);
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
    releasePointerSafely(handle, e.pointerId);
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onUp);
    commitProjectChange(); // final save+broadcast+render, guarantees no drift
  }

  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onUp);
}

// setPointerCapture/releasePointerCapture require a genuinely "active"
// pointer (per spec) and throw an InvalidPointerId DOMException otherwise -
// which happens for untrusted/synthetic pointerdown events (e.g. the smoke-
// test harness) and, per some browsers, in rarer real-world edge cases too.
// Capture is an optimization (keeps the drag alive if the cursor leaves the
// element mid-gesture) - a failure to acquire/release it must never abort
// the gesture itself (selection, dragging, and the final commit all still
// need to happen via the plain addEventListener fallback).
function capturePointerSafely(el, pointerId) {
  try {
    el.setPointerCapture(pointerId);
  } catch (err) {
    console.warn("Muralista: setPointerCapture failed, continuing without capture.", err);
  }
}

function releasePointerSafely(el, pointerId) {
  try {
    el.releasePointerCapture(pointerId);
  } catch (err) {
    // Already released/never captured - nothing to do.
  }
}

// Drag a whole surface (pointerdown inside its polygon, not on a corner
// handle): translate all 4 corners by the same delta, so the quad keeps its
// shape. Also handles click-to-select - if the surface wasn't already
// selected, selecting it and starting the drag happen in this one gesture
// (matches sidebar-click selection: updates selectedSurfaceId, resets to
// whole-surface nudge mode, re-renders sidebar/preview/layer panel). Same
// "render fast, commit throttled, final commit on release" pattern as
// startCornerDrag.
function startSurfaceDrag(e, svg, surface) {
  e.preventDefault();
  e.stopPropagation();

  const target = e.currentTarget;
  capturePointerSafely(target, e.pointerId);

  if (selectedSurfaceId !== surface.id) {
    selectedSurfaceId = surface.id;
    activeCornerIndex = null;
    renderControl(); // full re-render (sidebar highlight, layer panel, handles)
  }

  const originalCorners = surface.corners.map(([x, y]) => [x, y]);
  const start = svgPointerToNormalized(e, svg);

  const THROTTLE_MS = 80;
  let lastCommitAt = 0;

  function onMove(evt) {
    const p = svgPointerToNormalized(evt, svg);
    const rawDelta = [p[0] - start[0], p[1] - start[1]];
    const [dx, dy] = clampTranslateDelta(originalCorners, rawDelta);
    surface.corners = originalCorners.map(([x, y]) => [x + dx, y + dy]);
    renderPreview(); // local-only, fast
    const now = Date.now();
    if (now - lastCommitAt >= THROTTLE_MS) {
      lastCommitAt = now;
      saveProject(project);
      broadcastState();
    }
  }

  function onUp() {
    releasePointerSafely(target, e.pointerId);
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
    commitProjectChange(); // final save+broadcast+render, guarantees no drift
  }

  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
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

    if (layer.type === "image") {
      const webmHint = document.createElement("p");
      webmHint.className = "layer-hint";
      webmHint.textContent = "A .webm source (alpha transparency, Chrome-only) is a transport-synced overlay: it joins Play/Pause/Restart like a video layer instead of autoplaying on its own, so it starts on the same downbeat.";
      container.appendChild(webmHint);
    }

    // Mic reactivity (v2.3): 0 = off, exactly the current behavior (and the
    // field is simply absent from projects saved before it existed). Above
    // 0, the OUTPUT modulates this layer's effective opacity with the room's
    // smoothed mic level - see audioReactiveFrame(). Only offered on media
    // layers: pattern/beat generate their own content (beat has its own mic
    // mode instead).
    const micRow = document.createElement("div");
    micRow.className = "layer-field";
    const micLabel = document.createElement("label");
    micLabel.textContent = "Mic reactivity";
    micLabel.setAttribute("for", "layer-micreactivity-input");
    const micInput = document.createElement("input");
    micInput.type = "range";
    micInput.id = "layer-micreactivity-input";
    micInput.min = "0";
    micInput.max = "1";
    micInput.step = "0.01";
    micInput.value = String(layer.micReactivity ?? 0);
    const micValue = document.createElement("span");
    micValue.id = "layer-micreactivity-value";
    micValue.className = "layer-opacity-value";
    micValue.textContent = Number(layer.micReactivity ?? 0).toFixed(2);
    micInput.addEventListener("input", () => {
      micValue.textContent = Number(micInput.value).toFixed(2);
      setLayerField(surface.id, "micReactivity", Number(micInput.value));
    });
    const micHint = document.createElement("p");
    micHint.className = "layer-hint";
    micHint.textContent = "0 = always visible. Above 0, the room's loudness fades the layer in on the output (needs the mic enabled below).";
    micRow.append(micLabel, micInput, micValue, micHint);
    container.appendChild(micRow);
  }

  // Beat: mode selector (BPM / Mic) + BPM field (bpm mode only). beatMode
  // defaults to 'bpm' everywhere it's read, so projects saved before the
  // field existed behave exactly as before.
  if (layer.type === "beat") {
    const modeRow = document.createElement("div");
    modeRow.className = "layer-field";
    const modeLabel = document.createElement("label");
    modeLabel.textContent = "Mode";
    modeLabel.setAttribute("for", "layer-beatmode-select");
    const modeSelect = document.createElement("select");
    modeSelect.id = "layer-beatmode-select";
    [
      ["bpm", "BPM"],
      ["mic", "Mic (sound-reactive)"],
    ].forEach(([value, label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      modeSelect.appendChild(opt);
    });
    modeSelect.value = layer.beatMode || "bpm";
    modeRow.append(modeLabel, modeSelect);
    container.appendChild(modeRow);

    const bpmRow = document.createElement("div");
    bpmRow.className = "layer-field";
    bpmRow.id = "layer-bpm-row";
    bpmRow.hidden = (layer.beatMode || "bpm") !== "bpm";
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

    // Wired after bpmRow exists: switching modes commits the change AND
    // shows/hides the BPM field locally. A mode change flows through the
    // normal renderLayer reconcile on the output, which live-updates
    // entry.beatMode without recreating the canvas (same rule as live bpm
    // edits - the rAF loop reads the entry each frame).
    modeSelect.addEventListener("change", () => {
      setLayerField(surface.id, "beatMode", modeSelect.value);
      bpmRow.hidden = modeSelect.value !== "bpm";
    });
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

  const micInput = container.querySelector("#layer-micreactivity-input");
  if (micInput && active !== micInput) micInput.value = String(layer.micReactivity ?? 0);
  const micValue = container.querySelector("#layer-micreactivity-value");
  if (micValue) micValue.textContent = Number(layer.micReactivity ?? 0).toFixed(2);

  const modeSelect = container.querySelector("#layer-beatmode-select");
  if (modeSelect && active !== modeSelect) modeSelect.value = layer.beatMode || "bpm";
  const bpmRow = container.querySelector("#layer-bpm-row");
  if (bpmRow) bpmRow.hidden = (layer.beatMode || "bpm") !== "bpm";
}

// =========================================================================
// MIC (control window only)
// =========================================================================
// Captures the room's sound and turns it into a compact, EPHEMERAL envelope
// broadcast for output layers to react to - see v2 direction workstream 2 in
// project-context.md: "context awareness = control logic, not generation".
// Nothing here is persisted or routed through commitProjectChange(); a
// localStorage write at audio rate would be pathological, and this data has
// no meaning after the moment it's sampled. Control-local state only.

const MIC_LOOP_HZ = 30; // plenty for a level/onset envelope, cheaper than rAF
const MIC_LOOP_MS = 1000 / MIC_LOOP_HZ;
const MIC_RELEASE_SECONDS = 0.3; // envelope follower: instant attack, ~0.3s decay
const MIC_ONSET_FACTOR = 1.8; // instantaneous RMS must beat the running average by this much
const MIC_ONSET_MIN_RMS = 0.02; // ignore the running average's own noise floor near silence
const MIC_ONSET_REFRACTORY_MS = 150;
const MIC_RUNNING_AVG_SMOOTHING = 0.05; // the "room average" follows slowly, so transients stand out

let micStream = null;
let micAudioCtx = null;
let micAnalyser = null;
let micDataArray = null;
let micLoopId = null;
let micEnvelope = 0; // smoothed 0..1 level, attack-fast/release-slow
let micRunningAvg = 0; // slow-following RMS average, the onset baseline
let micLastOnsetAt = 0; // Date.now() of the last onset, for the refractory window
let micOnsetFlashTimer = null;

function isMicEnabled() {
  return micStream != null;
}

function toggleMic() {
  if (isMicEnabled()) {
    disableMic();
  } else {
    enableMic();
  }
}

async function enableMic() {
  const statusEl = document.getElementById("mic-status");
  const toggleBtn = document.getElementById("btn-mic-toggle");
  statusEl.textContent = "";
  try {
    // echoCancellation/noiseSuppression/autoGainControl all off: we want the
    // real room signal (for level + onset detection), not a cleaned-up voice
    // signal - Chrome's voice processing would flatten exactly the dynamics
    // this feature reacts to.
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    micAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = micAudioCtx.createMediaStreamSource(micStream);
    micAnalyser = micAudioCtx.createAnalyser();
    micAnalyser.fftSize = 2048;
    micDataArray = new Float32Array(micAnalyser.fftSize);
    source.connect(micAnalyser);

    micEnvelope = 0;
    micRunningAvg = 0;
    micLastOnsetAt = 0;

    micLoopId = window.setInterval(micAnalysisTick, MIC_LOOP_MS);
    toggleBtn.textContent = "Disable mic";
  } catch (err) {
    micStream = null;
    statusEl.textContent = `Mic unavailable: ${(err && err.message) || err}`;
    console.warn("Muralista: getUserMedia failed.", err);
  }
}

function disableMic() {
  if (micLoopId != null) {
    window.clearInterval(micLoopId);
    micLoopId = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  if (micAudioCtx) {
    micAudioCtx.close().catch(() => {});
    micAudioCtx = null;
  }
  micAnalyser = null;
  micDataArray = null;

  document.getElementById("btn-mic-toggle").textContent = "Enable mic";
  document.getElementById("mic-status").textContent = "";
  const fill = document.getElementById("mic-meter-fill");
  if (fill) fill.style.width = "0%";
}

// Runs at MIC_LOOP_HZ (~33ms). Computes RMS from the time-domain buffer,
// applies an attack-fast/release-slow envelope follower so the broadcast
// level rises the instant the room gets loud but decays smoothly rather than
// chopping to silence between transients, detects onsets as the
// instantaneous RMS spiking over a slow-following running average (with a
// refractory window so one transient doesn't retrigger on its own decay),
// then broadcasts the result and updates the local meter.
function micAnalysisTick() {
  if (!micAnalyser) return;
  micAnalyser.getFloatTimeDomainData(micDataArray);

  let sumSquares = 0;
  for (let i = 0; i < micDataArray.length; i++) {
    sumSquares += micDataArray[i] * micDataArray[i];
  }
  const rms = Math.sqrt(sumSquares / micDataArray.length); // roughly 0..1

  const releasePerTick = 1 - Math.exp(-(MIC_LOOP_MS / 1000) / MIC_RELEASE_SECONDS);
  if (rms > micEnvelope) {
    micEnvelope = rms; // attack: instant
  } else {
    micEnvelope += (rms - micEnvelope) * releasePerTick; // release: exponential decay
  }
  const level = Math.max(0, Math.min(1, micEnvelope));

  // Onset check compares against the PRE-update running average, then the
  // average is updated after - otherwise a loud sample would drag its own
  // baseline up before the comparison, making onsets harder to trigger.
  const prevRunningAvg = micRunningAvg;
  micRunningAvg += (rms - micRunningAvg) * MIC_RUNNING_AVG_SMOOTHING;

  const now = Date.now();
  let onset = false;
  if (
    rms > prevRunningAvg * MIC_ONSET_FACTOR &&
    rms > MIC_ONSET_MIN_RMS &&
    now - micLastOnsetAt > MIC_ONSET_REFRACTORY_MS
  ) {
    onset = true;
    micLastOnsetAt = now;
  }

  channel.postMessage({ kind: "audio", level, onset, t: now });
  updateMicMeterUI(level, onset);
}

function updateMicMeterUI(level, onset) {
  const fill = document.getElementById("mic-meter-fill");
  if (fill) fill.style.width = `${Math.round(level * 100)}%`;

  if (onset) {
    const dot = document.getElementById("mic-onset-dot");
    if (dot) {
      dot.classList.add("flash");
      window.clearTimeout(micOnsetFlashTimer);
      micOnsetFlashTimer = window.setTimeout(() => dot.classList.remove("flash"), 150);
    }
  }
}

// =========================================================================
// CALIBRATION (arrow-key nudge)
// =========================================================================
// The critical live-calibration UX: select a surface, then arrow-key nudge
// it in real output pixels while watching the projected result. With no
// active corner (the default on selection, or after 0/Escape), arrows move
// the WHOLE surface - fast coarse placement. Press 1-4 to pick a single
// corner for fine precision nudging instead. Nudges are discrete (no
// throttle needed) and route through the normal commitProjectChange() choke
// point.

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

// Whole-surface counterpart to nudgeActiveCorner: translates all 4 corners
// by the same output-pixel delta, using the same axis-wise clamp as
// pointer-drag translation (clampTranslateDelta) so an arrow nudge can't
// distort the quad at the overshoot boundary either.
function nudgeWholeSurface(dxPx, dyPx) {
  const surface = getSelectedSurface();
  if (!surface) return;
  const rawDelta = [dxPx / outputSize.w, dyPx / outputSize.h];
  const [dx, dy] = clampTranslateDelta(surface.corners, rawDelta);
  surface.corners = surface.corners.map(([x, y]) => [x + dx, y + dy]);
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

  if (e.key === "0" || e.key === "Escape") {
    activeCornerIndex = null; // back to whole-surface nudge mode
    renderPreview();
    return;
  }

  const delta = NUDGE_ARROW_DELTAS[e.key];
  if (delta) {
    e.preventDefault(); // don't let arrows scroll the page
    const step = e.shiftKey ? 1 : 5; // output px; shift = fine
    if (activeCornerIndex == null) {
      nudgeWholeSurface(delta[0] * step, delta[1] * step);
    } else {
      nudgeActiveCorner(delta[0] * step, delta[1] * step);
    }
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
        window.alert("That file doesn't look like a Muralista project (missing version/surfaces).");
        return;
      }
      replaceProject(parsed);
    } catch (err) {
      window.alert("Could not read that file as JSON.");
      console.error("Muralista import error:", err);
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

  document.getElementById("btn-mic-toggle").addEventListener("click", toggleMic);
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

  reconcileOutputSurfaceOrder(container, visibleSurfaces);
}

// Surface list order = render order = stacking order (later = on top, see
// project-context v2 direction), so #output-surfaces' DOM child order must
// track project.surfaces order - otherwise a z-order move (moveSurfaceUp/
// Down) changes the data but the wrapper divs stay in their old paint order
// on the actual output. renderOutputSurface() above only appends a wrapper
// the FIRST time a surface is seen; on every later render it reuses the
// existing element in place, so without this step a reorder would be
// invisible on the wall.
//
// appendChild on an element already in the document just moves it (cheap,
// idempotent) - but re-parenting a <video> element directly DOES interrupt
// playback in Chrome (moving a media element triggers a load reset). Here we
// only ever move the per-surface WRAPPER div, never the <video>/<img>/canvas
// itself - the video stays put inside its wrapper, only the wrapper's
// position among its siblings changes, so this does not reset playback.
// Still: only touch the DOM when the order actually drifted from what's
// wanted (checked below) - calibration nudges and resizes call renderOutput()
// on every commit/frame and must NOT reorder anything when nothing moved.
function reconcileOutputSurfaceOrder(container, visibleSurfaces) {
  const wanted = visibleSurfaces
    .map((s) => outputSurfaceElements.get(s.id))
    .filter(Boolean)
    .map((entry) => entry.wrapper);

  const current = Array.from(container.children);
  const alreadyInOrder =
    wanted.length === current.length && wanted.every((el, i) => el === current[i]);
  if (alreadyInOrder) return;

  wanted.forEach((wrapper) => container.appendChild(wrapper));
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
    entry = {
      wrapper,
      layerType: null,
      layerSrc: null,
      contentEl: null,
      rafId: null,
      beatToken: null,
      bpm: null,
      beatMode: "bpm", // live-read each beat frame, like bpm (v2.3)
      hue: null,
      micReactivity: 0, // 0 = the shared audio loop leaves this entry alone (v2.3)
      baseOpacity: 1, // the layer's own static opacity, the modulation baseline
    };
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
  }

  if (layer.type === "beat") {
    // Live values; the running rAF loop reads these off the entry each frame,
    // so bpm AND mode changes take effect without recreating the canvas.
    entry.bpm = layer.bpm || 96;
    entry.beatMode = layer.beatMode || "bpm";
  }

  // micReactivity/baseOpacity feed the shared audio-reactive rAF loop
  // (audioReactiveFrame). Missing field (old projects) -> 0 -> the loop
  // never touches this entry, so the static opacity below is final - exactly
  // the pre-v2.3 behavior. When reactivity IS on, the static write below
  // still happens on every state render; that's fine, the audio loop
  // overwrites it again next frame.
  entry.micReactivity =
    layer.type === "video" || layer.type === "image" ? layer.micReactivity ?? 0 : 0;
  entry.baseOpacity = layer.opacity ?? 1;

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
// 'video' layer AND for an alpha-webm 'image' layer (v2.2 - see
// createImageLayerElement) so a transport command can apply to all of them
// at once.
const registeredVideoEls = new Set();
let transportPlaying = false;

function playVideoQuietly(video) {
  const p = video.play();
  // Videos are muted so autoplay policy shouldn't block this, but a play()
  // promise can still reject (e.g. interrupted by a near-simultaneous
  // pause()) - don't let that become an unhandled rejection.
  if (p && typeof p.catch === "function") {
    p.catch((err) => console.warn("Muralista: video play() was rejected.", err));
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
    // Alpha WebM (VP9 transparency, Chrome-only): the v2.2 AI-animation
    // overlay slot. An overlay authored against the show timeline needs to
    // start on the same downbeat as everything else, so it joins the shared
    // transport exactly like a 'video' layer (registeredVideoEls + the
    // transportPlaying join-mid-playback pattern) rather than autoplaying on
    // its own. The type distinction between 'video' and alpha-webm 'image'
    // blurs here - that's fine: an overlay IS content synced to the show
    // clock, same as the base video.
    const video = document.createElement("video");
    video.className = "layer-image-webm";
    video.src = src;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    registeredVideoEls.add(video);
    if (transportPlaying) playVideoQuietly(video);
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
  entry.beatMode = layer.beatMode || "bpm"; // missing field (old projects) -> bpm, unchanged behavior
  entry.hue = surfaceHue(surface);

  // A fresh token per (re)start; the loop bails as soon as it no longer
  // matches entry.beatToken, i.e. the moment this layer gets torn down or
  // replaced - avoids a stray rAF callback drawing into a detached canvas.
  const token = {};
  entry.beatToken = token;

  // Per-canvas mic-mode animation state (not on the entry: it's internal to
  // this loop, reset if the canvas is ever recreated). seenOnsetAt tracks
  // which latestAudio.lastOnsetAt this canvas has already spawned a flash
  // for, so one onset = one flash even across many frames.
  const micState = { seenOnsetAt: 0, flashStartedAt: 0 };

  function frame() {
    if (entry.beatToken !== token) return;
    // Mode is read live off the entry each frame (like bpm), so a panel
    // change flips the drawing without recreating the canvas.
    if (entry.beatMode === "mic") {
      drawMicBeatFrame(ctx, entry.hue, micState);
    } else {
      drawBeatFrame(ctx, entry.bpm, entry.hue);
    }
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

// Mic mode (v2.3): the pulse follows the room instead of a clock. Two parts,
// same hue system as bpm mode:
//   - breathing: a core glow whose radius + brightness track the shared
//     smoothedAudioLevel (already eased per-frame; silence/stale audio decays
//     it to 0, so the surface fades to its dark base when the mic is off).
//   - onset flash: an expanding ring spawned whenever latestAudio.lastOnsetAt
//     changes (one flash per onset), fading out over ~400ms.
// Kept deliberately smooth and simple - this is a stage visual, not a VU
// meter.
const MIC_FLASH_DURATION_MS = 400;

function drawMicBeatFrame(ctx, hue, micState) {
  const level = smoothedAudioLevel; // updated once per frame by the shared audio loop
  const mid = UNIT_SIZE / 2;
  const maxR = UNIT_SIZE * 0.45;
  const now = performance.now();

  // Spawn a flash when a new onset has arrived since the last one we drew.
  if (latestAudio.lastOnsetAt > micState.seenOnsetAt) {
    micState.seenOnsetAt = latestAudio.lastOnsetAt;
    micState.flashStartedAt = now;
  }

  ctx.fillStyle = `hsl(${hue}, 55%, 6%)`;
  ctx.fillRect(0, 0, UNIT_SIZE, UNIT_SIZE);

  // Breathing core: radius and alpha grow with the room's level. A small
  // floor radius keeps a faint ember visible in quiet moments so the surface
  // doesn't read as dead between songs.
  const coreR = maxR * (0.12 + 0.55 * level);
  const glow = ctx.createRadialGradient(mid, mid, 0, mid, mid, coreR);
  glow.addColorStop(0, `hsla(${hue}, 90%, ${55 + 25 * level}%, ${0.15 + 0.75 * level})`);
  glow.addColorStop(1, "hsla(0, 0%, 0%, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(mid, mid, coreR, 0, Math.PI * 2);
  ctx.fill();

  // Onset flash: an expanding, fading ring - same visual language as the
  // bpm pulse ring, but triggered by the room instead of the clock.
  const flashAge = now - micState.flashStartedAt;
  if (micState.flashStartedAt > 0 && flashAge < MIC_FLASH_DURATION_MS) {
    const t = flashAge / MIC_FLASH_DURATION_MS; // 0..1 over the flash life
    ctx.beginPath();
    ctx.arc(mid, mid, Math.max(maxR * t, 1), 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, 90%, 70%, ${1 - t})`;
    ctx.lineWidth = 18 * (1 - t * 0.6);
    ctx.stroke();
  }
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
      console.warn("Muralista: fullscreen request failed.", err);
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

  // The one shared audio-reactive loop (v2.3): keeps smoothedAudioLevel
  // eased every frame and applies mic-driven opacity modulation to media
  // layers that opted in. Started once for the window's lifetime - with no
  // audio broadcasts arriving it settles at level 0 and, for entries with
  // micReactivity 0, never touches anything.
  requestAnimationFrame(audioReactiveFrame);
}

// =========================================================================
// ROLE DETECTION / INIT
// =========================================================================

// Opening mapper.html straight from Finder (file://) breaks BroadcastChannel
// and media loading - catch it loudly instead of failing silently.
if (window.location.protocol === "file:") {
  window.alert(
    "Muralista must be served over HTTP, not opened as a file.\n\n" +
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
