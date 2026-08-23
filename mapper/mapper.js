"use strict";

/*
 * Muralista — mapper.js
 *
 * Single script serving two roles, chosen by the URL query string:
 *   http://localhost:8123/mapper.html          -> control window
 *   http://localhost:8123/mapper.html?output    -> output window (projector)
 *
 * Both URLs may carry a `v=<build token>` parameter; mapper.html's bootstrap
 * uses it to cache-bust this file and mapper.css, and the control window passes
 * its own token to the output window so both always run the same build.
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

// Schema version of the project object. v2 (2026-08-22) added the camera
// backdrop's backdropMode / cameraDeviceId / cameraQuad. v3 (2026-08-22)
// REMOVED the layer field micReactivity and the beat layer's "mic" mode,
// when the sound-reactive layer came out - Muralista is a desk tool and
// never runs during a show, so a field describing how a layer answers a
// live room has no executor here. v4 (2026-08-23) REMOVED the beat layer
// itself, along with beatMode and bpm: with mic mode gone it was a circle
// pulsing at a fixed BPM, and nothing v1 does with a wall needs one. This
// is NOT the "v1" in STORAGE_KEY - that suffix is part of an address and
// never changes (see the guard comment on STORAGE_KEY above). Older
// projects stay readable: migrateProject() fills in what they predate and
// drops what they outlived. v5 (2026-08-23) ADDED the top-level keepOuts
// array: regions the projector holds dark. It is a sibling of surfaces, not
// a member of it - a keep-out carries no content, so it needs no homography
// and is not bound to four corners. See KEEP-OUTS below.
const PROJECT_VERSION = 5;

function emptyProject() {
  return {
    version: PROJECT_VERSION,
    photo: null,
    // "photo" (a still loaded by hand) or "camera" (a live webcam feed
    // rectified into output space). Both are authoring aids only; neither
    // ever reaches the output window.
    backdropMode: "photo",
    // Which video input the camera backdrop uses, remembered so a room's
    // mapping comes back pointing at the same webcam.
    cameraDeviceId: null,
    // The projector's lit rectangle as the camera sees it: 4 points in
    // normalized camera space, [TL, TR, BR, BL] like surface.corners.
    // null until calibrated.
    cameraQuad: null,
    surfaces: [],
    // Regions the projector holds dark. Black is a decision about the
    // layout, so it is an object in the mapping rather than a black image on
    // a surface. See KEEP-OUTS below.
    keepOuts: [],
  };
}

function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidProject(parsed)) return migrateProject(parsed);
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

// 4 points, each a pair of finite numbers - the shape surface.corners uses,
// and the shape project.cameraQuad uses.
function isValidQuad(q) {
  return (
    Array.isArray(q) &&
    q.length === 4 &&
    q.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && isFinite(n)))
  );
}

// Brings a project of any earlier schema version up to PROJECT_VERSION by
// filling in what it predates and dropping what it outlived. Runs on load
// AND on import, so a venue JSON exported before the camera existed opens
// without complaint - it simply carries no camera calibration, which is
// exactly true of it - and one exported while layers were sound-reactive
// opens too, simply without that behavior.
function migrateProject(obj) {
  const proj = Object.assign({}, obj);
  if (proj.backdropMode !== "camera") proj.backdropMode = "photo";
  if (typeof proj.cameraDeviceId !== "string") proj.cameraDeviceId = null;
  if (!isValidQuad(proj.cameraQuad)) proj.cameraQuad = null;

  // v3: the sound-reactive layer is gone. v4: so is the beat layer. Copy
  // each surface (and its layer) rather than mutating in place - the object
  // handed to us may be a parsed import the caller still holds. A v2 layer
  // that opted into mic reactivity simply loses it; a beat layer from v2/v3
  // becomes a test pattern, which is the honest fallback - the surface stays
  // on the wall and stays visible, it just stops pulsing.
  proj.surfaces = (Array.isArray(proj.surfaces) ? proj.surfaces : []).map((surface) => {
    if (!surface || typeof surface !== "object" || !surface.layer) return surface;
    const layer = Object.assign({}, surface.layer);
    delete layer.micReactivity;
    delete layer.beatMode;
    delete layer.bpm;
    if (layer.type === "beat") layer.type = "pattern";
    return Object.assign({}, surface, { layer });
  });

  // v5: keep-outs. A project that predates them simply carries none, which
  // is exactly true of it. Rings are sanitized rather than trusted - an
  // imported file is arbitrary JSON, and a ring under the 3-point floor (or
  // carrying a non-finite coordinate) would paint as a degenerate polygon
  // with no visible cause at a projector. Anything unusable is dropped here
  // rather than half-repaired downstream: migrateProject is the single
  // enforcement point, on load AND on import.
  proj.keepOuts = (Array.isArray(proj.keepOuts) ? proj.keepOuts : [])
    .filter((k) => k && typeof k === "object" && isValidPointRing(k.points))
    .map((k, i) => ({
      id: typeof k.id === "string" && k.id ? k.id : genKeepOutId(),
      name: typeof k.name === "string" && k.name.trim() ? k.name.trim() : `Keep-out ${i + 1}`,
      points: k.points.map(([x, y]) => [clampCoord(x), clampCoord(y)]),
      margin: clampMargin(k.margin),
      visible: k.visible !== false,
    }));

  proj.version = PROJECT_VERSION;
  return proj;
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
    layer: { type: "pattern", src: null, opacity: 1 },
    visible: true,
  };
}

// =========================================================================
// KEEP-OUTS
// =========================================================================
// A keep-out is a region the projector holds dark. Muralista's design is
// subtractive - the projector floods the whole background and the mapping is
// a layout of that flood, INCLUDING which parts stay dark - so black has to
// be an object in the mapping, not a black PNG parked on a surface.
//
// Its first job is the performer, and the driver is eye comfort rather than
// composition: standing in the beam is physically unpleasant and nobody is
// going to do it for a whole set.
//
// THE RULE THAT GOVERNS ALL OF THIS: trace the performer's SHADOW, never the
// performer. The camera and the projector lens do not sit in the same place,
// so they genuinely disagree about where a body is - measured in the studio
// at roughly two thirds of a head width on the wall, with the camera as
// close to the lens as it would physically go. The shadow has no such error
// and cannot: it is by construction the exact set of projector pixels the
// body blocks, because the projector drew it, and it lands on the wall plane
// where the existing homography is exact. Also stated in README under
// "Keep-outs and the shadow rule" and in the CAMERA BACKDROP section below.
//
// A KEEP-OUT IS NOT A SURFACE, and the model here is deliberately not bent
// around the surface one. Every surface is exactly four corners because four
// corners is what a homography needs to warp content onto a quad. A keep-out
// carries no content - it holds black - so it needs no warp, no homography
// and no four-corner constraint. An irregular polygon is the CHEAP version
// here, not the expensive one: it asks for less machinery, not more.

const KEEPOUT_MIN_POINTS = 3;

// Margin is a fraction of FRAME HEIGHT, rendered as a stroke rather than as
// a polygon offset - see applyKeepOutMarginStroke().
const KEEPOUT_MARGIN_MAX = 0.15;

// A ring of >= 3 normalized points, the shape keepOut.points uses. Unlike a
// surface's corners there is no upper count constraint and no exact count:
// nothing about holding black needs four points.
function isValidPointRing(pts) {
  return (
    Array.isArray(pts) &&
    pts.length >= KEEPOUT_MIN_POINTS &&
    pts.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && isFinite(n)))
  );
}

function clampMargin(v) {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(KEEPOUT_MARGIN_MAX, n));
}

function genKeepOutId() {
  // Same scheme as genSurfaceId, different prefix so an id says at a glance
  // which list it belongs to.
  return "k-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// A new keep-out arrives as a tall hexagon rather than a rectangle: the case
// it exists for is a standing performer, and starting from a shape that
// already leans that way means fewer points to push. Six points is "a
// handful" - enough to be worth editing, few enough to read.
function defaultKeepOut(index) {
  return {
    id: genKeepOutId(),
    name: `Keep-out ${index}`,
    points: [
      [0.44, 0.28],
      [0.56, 0.28],
      [0.59, 0.6],
      [0.56, 0.9],
      [0.44, 0.9],
      [0.41, 0.6],
    ],
    margin: 0,
    visible: true,
  };
}

// The project state, live in memory. Populated below once the role is known.
let project = emptyProject();

// Control-local UI state — never persisted, never broadcast.
let selectedSurfaceId = null;

// The selected keep-out, and which of its points is live for the Delete key
// and the panel's delete button. Selection is EXCLUSIVE with
// selectedSurfaceId: the preview shows draggable handles for one thing at a
// time, and a second live set of handles at a projector is a misclick
// waiting to happen. selectSurface()/selectKeepOutState() enforce it.
let selectedKeepOutId = null;
let selectedPointIndex = null;

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
  clearKeepOutSelection(); // selection is exclusive across the two lists
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
      : { type: "pattern", src: null, opacity: 1 },
    visible: original.visible,
  };
  project.surfaces.splice(idx + 1, 0, copy);
  selectedSurfaceId = copy.id;
  activeCornerIndex = null;
  clearKeepOutSelection();
  commitProjectChange();
}

// --- Keep-out mutators. Same contract as the surface mutators above:
// mutate `project` in place, then commitProjectChange() persists,
// broadcasts and re-renders. Keep-outs live in their own top-level array,
// so none of the surface machinery - z-order, duplicate, layers - reaches
// them, which is the point. ---

function getSelectedKeepOut() {
  return project.keepOuts.find((k) => k.id === selectedKeepOutId) || null;
}

// The two halves of exclusive selection (see selectedKeepOutId). Selecting a
// keep-out drops any surface selection and vice versa; both also drop the
// live point/corner index, since an index from the previous shape means
// nothing against the new one.
function clearKeepOutSelection() {
  selectedKeepOutId = null;
  selectedPointIndex = null;
}

function selectKeepOutState(id) {
  selectedKeepOutId = id;
  selectedPointIndex = null;
  if (id != null) {
    selectedSurfaceId = null;
    activeCornerIndex = null;
  }
}

function selectKeepOut(id) {
  selectKeepOutState(id);
  renderControl(); // selection is local UI state, no save/broadcast needed
}

function addKeepOut() {
  const keepOut = defaultKeepOut(project.keepOuts.length + 1);
  project.keepOuts.push(keepOut);
  selectKeepOutState(keepOut.id);
  commitProjectChange();
}

function removeKeepOut(id) {
  project.keepOuts = project.keepOuts.filter((k) => k.id !== id);
  if (selectedKeepOutId === id) clearKeepOutSelection();
  commitProjectChange();
}

function renameKeepOut(id, name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  const keepOut = project.keepOuts.find((k) => k.id === id);
  if (!keepOut) return;
  keepOut.name = trimmed;
  commitProjectChange();
}

function toggleKeepOutVisible(id) {
  const keepOut = project.keepOuts.find((k) => k.id === id);
  if (!keepOut) return;
  keepOut.visible = !keepOut.visible;
  commitProjectChange();
}

function setKeepOutMargin(id, margin) {
  const keepOut = project.keepOuts.find((k) => k.id === id);
  if (!keepOut) return;
  keepOut.margin = clampMargin(margin);
  commitProjectChange();
}

// Replaces a keep-out's whole ring at once. Used by "Suggest from my
// shadow", which hands back a traced contour rather than editing points one
// at a time. Rejects anything that isn't a usable ring rather than leaving
// the keep-out half-replaced.
function setKeepOutPoints(id, points) {
  const keepOut = project.keepOuts.find((k) => k.id === id);
  if (!keepOut || !isValidPointRing(points)) return false;
  keepOut.points = points.map(([x, y]) => [clampCoord(x), clampCoord(y)]);
  selectedPointIndex = null; // an index into the old ring means nothing now
  commitProjectChange();
  return true;
}

// Insert a point INTO the ring at `index` - i.e. between points index-1 and
// index - which is what clicking an edge does. Inserting at the end of the
// array instead would connect the new point to whichever points happen to
// bookend the array, folding the polygon over itself.
function insertKeepOutPoint(id, index, point) {
  const keepOut = project.keepOuts.find((k) => k.id === id);
  if (!keepOut) return;
  keepOut.points.splice(index, 0, [clampCoord(point[0]), clampCoord(point[1])]);
  selectedPointIndex = index;
  commitProjectChange();
}

// The 3-point floor is a real constraint, not a UI nicety: fewer than three
// points is not a polygon, and a two-point "ring" would paint nothing while
// still sitting in the list looking like a live keep-out. The panel button
// is disabled at the floor too, but this stays defensive - the Delete key
// reaches here by another route.
function deleteKeepOutPoint(id, index) {
  const keepOut = project.keepOuts.find((k) => k.id === id);
  if (!keepOut) return;
  if (keepOut.points.length <= KEEPOUT_MIN_POINTS) return;
  if (index == null || index < 0 || index >= keepOut.points.length) return;
  keepOut.points.splice(index, 1);
  selectedPointIndex = null;
  commitProjectChange();
}

// --- Layer mutators (slice 3). All route through commitProjectChange() like
// every other control-side mutation. ---

function setLayerType(id, type) {
  const surface = project.surfaces.find((s) => s.id === id);
  if (!surface) return;
  surface.layer = surface.layer || { type: "pattern", src: null, opacity: 1 };
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
  clearKeepOutSelection();
  renderControl(); // selection is local UI state, no save/broadcast needed
}

function replaceProject(newProject) {
  project = newProject;
  selectedSurfaceId = null;
  activeCornerIndex = null;
  clearKeepOutSelection();
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

// Wired to the header Play/Pause/Restart buttons.
function handleTransportButton(action) {
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

// Control -> output: raise or drop a full-frame white plate on the output
// window. This exists for the camera backdrop's calibration step - the edge
// of the projector's lit rectangle can only be marked if the projector is
// actually lighting something, and "no signal" screens and desktop wallpaper
// are not a rectangle of known shape. Nonce per project convention.
let whiteFieldOn = false;

function broadcastWhiteField() {
  channel.postMessage({ kind: "whiteField", on: whiteFieldOn, nonce: Date.now() });
}

function toggleWhiteField() {
  whiteFieldOn = !whiteFieldOn;
  broadcastWhiteField();
  renderControl();
}

// Control -> output: a big number on the wall itself, so the countdown for
// "Suggest from my shadow" can be read from where the performer is standing
// rather than from the laptop they just walked away from. `value` is the
// seconds remaining, or null to clear it. Nonce per project convention.
function broadcastCountdown(value) {
  channel.postMessage({ kind: "countdown", value, nonce: Date.now() });
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
    broadcastWhiteField(); // a reopened output must not come back with a stale plate
    broadcastCountdown(suggestionCountdownValue); // nor with a stale countdown
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
  } else if (msg.kind === "whiteField" && typeof msg.on === "boolean") {
    setOutputWhiteField(msg.on);
  } else if (msg.kind === "countdown") {
    setOutputCountdown(typeof msg.value === "number" ? msg.value : null);
  } else if (msg.kind === "transport" && typeof msg.action === "string") {
    applyTransportAction(msg.action);
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

// Applies a homography to a single point, doing by hand the perspective
// divide the GPU does for us in homographyToMatrix3dString(). Needed because
// the shadow suggestion maps traced CONTOUR POINTS from camera space into
// output space - there is no element to hang a CSS transform on, only
// numbers. Returns null where the point lands on the horizon (w ~ 0), which
// a sane calibration never produces but a degenerate one can.
function applyHomography(h, [x, y]) {
  const w = h.h6 * x + h.h7 * y + 1;
  if (!isFinite(w) || Math.abs(w) < 1e-12) return null;
  const px = (h.h0 * x + h.h1 * y + h.h2) / w;
  const py = (h.h3 * x + h.h4 * y + h.h5) / w;
  return isFinite(px) && isFinite(py) ? [px, py] : null;
}

// The normalized output frame, as a quad in surface.corners order. The
// camera calibration maps project.cameraQuad onto exactly this.
const UNIT_SQUARE_CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

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
  renderKeepOutList();
  renderPreview();
  renderBackdrop();
  renderCamera();
  renderBackdropControls();
  renderLayerPanel();
  renderKeepOutPanel();
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

// Keep-outs get their own list, below the surfaces and separate from them.
// They are a different primitive - no layer, no z-order, no four-corner
// constraint - and folding them into one list would invite exactly the
// "a keep-out is a kind of surface" reading the design rejects. The row
// chrome is deliberately the same (.surface-row): it is the sidebar's row
// idiom, and a second one would be noise.
function renderKeepOutList() {
  const list = document.getElementById("keepout-list");
  list.innerHTML = "";

  if (project.keepOuts.length === 0) {
    const empty = document.createElement("li");
    empty.className = "surface-list-empty";
    empty.textContent = "No keep-outs. Add one to hold part of the wall dark.";
    list.appendChild(empty);
    return;
  }

  project.keepOuts.forEach((keepOut) => {
    const row = document.createElement("li");
    row.className = "surface-row";
    if (keepOut.id === selectedKeepOutId) row.classList.add("selected");
    if (!keepOut.visible) row.classList.add("hidden-surface");

    row.addEventListener("click", () => selectKeepOut(keepOut.id));

    const nameSpan = document.createElement("span");
    nameSpan.className = "surface-name";
    // The point count rides in the row: it is the one number that says
    // whether a keep-out has been traced or is still the starting hexagon.
    nameSpan.textContent = `${keepOut.name} \u00b7 ${keepOut.points.length}`;
    row.appendChild(nameSpan);

    const actions = document.createElement("div");
    actions.className = "surface-actions";

    const visBtn = document.createElement("button");
    visBtn.type = "button";
    visBtn.className = "icon-btn";
    visBtn.title = keepOut.visible ? "Hide keep-out" : "Show keep-out";
    visBtn.textContent = keepOut.visible ? "\u{1F441}" : "\u{1F648}";
    visBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleKeepOutVisible(keepOut.id);
    });
    actions.appendChild(visBtn);

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "icon-btn";
    renameBtn.title = "Rename keep-out";
    renameBtn.textContent = "\u270F\uFE0F"; // pencil
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = window.prompt("Rename keep-out", keepOut.name);
      if (next !== null) renameKeepOut(keepOut.id, next);
    });
    actions.appendChild(renameBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn danger";
    deleteBtn.title = "Delete keep-out";
    deleteBtn.textContent = "\u{1F5D1}\uFE0F"; // trash
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.confirm(`Delete "${keepOut.name}"?`)) removeKeepOut(keepOut.id);
    });
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    list.appendChild(row);
  });
}

function renderPreview() {
  const svg = document.getElementById("preview-svg");
  svg.innerHTML = "";

  // While the camera's calibration corners are being placed, the preview has
  // exactly one job: the surface outlines would sit on top of the very edge
  // being looked for.
  if (calibratingCamera) {
    renderCameraCalibrationHandles(svg);
    return;
  }

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

  // Keep-outs go last, so they sit above every surface outline in the
  // preview exactly as they sit above every surface wrapper on the output.
  renderKeepOutsPreview(svg);
}

function surfaceCentroidNormalized(surface) {
  const xs = surface.corners.map((c) => c[0]);
  const ys = surface.corners.map((c) => c[1]);
  return [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length];
}

function renderBackdrop() {
  const img = document.getElementById("preview-backdrop");
  if (project.photo && !isCameraMode()) {
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

// Pointer-drag plumbing shared by every preview gesture: whole-surface
// drag, single-corner drag, and camera-calibration corner drag. The caller
// supplies only applyMove(evt), which writes the new geometry into `project`.
//
// THE DETAIL THAT MATTERS, and the v2.1 bug (found by hand 2026-08-22): the
// move/up listeners must live on an element that OUTLIVES the gesture.
// Every move calls renderPreview(), which does svg.innerHTML = "" and
// rebuilds every polygon and handle from scratch - so the element that
// received pointerdown is destroyed by the first move it handles. v2.1
// listened on that element. The consequences, all confirmed in Chrome with a
// real mouse:
//
//   - exactly one move-event's worth of travel happened, then the quad froze
//     (later moves land on a freshly built element that has no listeners);
//   - removing the element implicitly released its pointer capture too, so
//     capture could not save it either;
//   - pointerup never reached onUp: no final commit, and the listeners
//     leaked on a detached node;
//   - pressing an UNSELECTED surface was worse still - startSurfaceDrag
//     called renderControl() to move the selection BEFORE attaching its
//     listeners, so they went onto an already-detached node and the surface
//     did not move at all. That is the "dragging does not work" report.
//
// #preview-svg is emptied but never replaced, so it is the one safe host for
// both the capture and the listeners. It is also why this now works under
// synthetic events: even when setPointerCapture refuses an untrusted
// pointerId, moves over the rebuilt children still bubble up to the svg.
//
// This is also why v2.1's headless check passed while nothing moved on
// screen: it dispatched a single synthetic pointermove and asserted on the
// corner numbers, and one move is precisely the amount that did work.
function beginPreviewDrag(e, svg, applyMove) {
  e.preventDefault();
  e.stopPropagation();

  capturePointerSafely(svg, e.pointerId);

  const THROTTLE_MS = 80;
  let lastCommitAt = 0;

  function onMove(evt) {
    if (evt.pointerId !== e.pointerId) return;
    applyMove(evt);
    renderPreview(); // local-only, fast
    const now = Date.now();
    if (now - lastCommitAt >= THROTTLE_MS) {
      lastCommitAt = now;
      saveProject(project);
      broadcastState();
    }
  }

  function onUp(evt) {
    if (evt.pointerId !== e.pointerId) return;
    releasePointerSafely(svg, e.pointerId);
    svg.removeEventListener("pointermove", onMove);
    svg.removeEventListener("pointerup", onUp);
    svg.removeEventListener("pointercancel", onUp);
    commitProjectChange(); // final save+broadcast+render, guarantees no drift
  }

  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onUp);
  svg.addEventListener("pointercancel", onUp);
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

// Drag a single corner handle. Renders locally every pointermove for
// immediate visual feedback (both in the preview and, throttled, on the
// live output), but only saves+broadcasts at most every ~80ms plus once on
// release - the same "render fast, commit throttled" split slice 1's
// commitProjectChange() choke point was designed for.
function startCornerDrag(e, svg, surface, cornerIndex) {
  activeCornerIndex = cornerIndex;

  beginPreviewDrag(e, svg, (evt) => {
    const [nx, ny] = svgPointerToNormalized(evt, svg);
    surface.corners[cornerIndex] = [clampCoord(nx), clampCoord(ny)];
  });
}

// Drag a whole surface (pointerdown inside its polygon, not on a corner
// handle): translate all 4 corners by the same delta, so the quad keeps its
// shape. Also handles click-to-select - if the surface wasn't already
// selected, selecting it and starting the drag happen in this one gesture
// (matches sidebar-click selection: updates selectedSurfaceId, resets to
// whole-surface nudge mode, re-renders sidebar/preview/layer panel). The
// re-render that selection triggers is precisely what used to detach the
// listeners; beginPreviewDrag puts them somewhere a re-render cannot reach.
function startSurfaceDrag(e, svg, surface) {
  if (selectedSurfaceId !== surface.id) {
    selectedSurfaceId = surface.id;
    activeCornerIndex = null;
    renderControl(); // full re-render (sidebar highlight, layer panel, handles)
  }

  const originalCorners = surface.corners.map(([x, y]) => [x, y]);
  const start = svgPointerToNormalized(e, svg);

  beginPreviewDrag(e, svg, (evt) => {
    const p = svgPointerToNormalized(evt, svg);
    const rawDelta = [p[0] - start[0], p[1] - start[1]];
    const [dx, dy] = clampTranslateDelta(originalCorners, rawDelta);
    surface.corners = originalCorners.map(([x, y]) => [x + dx, y + dy]);
  });
}

// =========================================================================
// SUGGEST FROM MY SHADOW
// =========================================================================
// Raise a white plate, photograph the empty wall, count the performer into
// place on the wall itself, photograph it again, and keep the region that
// got DARKER. That region is the shadow, by construction - it is precisely
// the set of projector pixels the body blocks - and the shadow, not the
// body, is what a keep-out must be traced around. The camera and the lens do
// not stand in the same place, so they disagree about where a body is; they
// cannot disagree about where its shadow falls, because the shadow lands on
// the wall plane, which is exactly where the existing calibration is exact.
//
// ACCURACY IS EXPLICITLY NOT THE GOAL. A coarse blob roughly the right shape
// is the CORRECT output here: the margin slider has to inflate it anyway (a
// performer sways), and a few points get pushed by hand afterwards. So there
// is no smoothing pass, no morphological cleanup and no adaptive
// thresholding - just enough to get one blob instead of noise, with a single
// threshold slider where a guess would otherwise go.
//
// Out of scope, deliberately: following the performer live. A mask that
// flickers on a dark stage is worse than no mask.

// ~320px wide is plenty for a shape that is about to be inflated by a margin
// and tidied by hand, and it keeps the whole pass well inside one frame.
const SHADOW_CAPTURE_WIDTH = 320;

// Long enough for the plate to reach the wall AND for the camera's auto
// exposure to finish stopping down for it. Both frames are then taken under
// the same exposure, which matters more than either being taken quickly.
const SHADOW_PLATE_SETTLE_MS = 900;

// After the countdown comes off the output, before frame B. Frame A never
// contained the countdown and frame B must not either - a number still on
// its way off the wall would difference straight into the traced shape.
const SHADOW_CLEAR_SETTLE_MS = 300;

// Anything smaller than this fraction of the frame is noise, not a person.
const SHADOW_MIN_BLOB_FRACTION = 0.002;

const SHADOW_TARGET_MIN_POINTS = 20;
const SHADOW_TARGET_MAX_POINTS = 40;

// Control-local, never persisted and never broadcast. These are capture
// settings for one gesture against one room's light, not geometry: putting
// them in the venue file would ship a transient camera parameter inside the
// artifact this tool exists to produce.
let shadowThreshold = 22; // 0-255 luminance drop
let shadowCountdownSeconds = 10;
let suggestionRunning = false;
let suggestionCountdownValue = null;

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// Why the button is disabled, or null if it is not. Said out loud in the
// panel rather than left as a dead control.
function shadowSuggestionBlocker() {
  if (!isCameraMode()) return "Set Backdrop \u2192 Source to Live camera first.";
  if (!isCameraEnabled()) return "Enable the camera first.";
  if (!isValidQuad(project.cameraQuad)) {
    return "Calibrate the camera first. The suggestion maps your shadow into output space through that calibration, so without it there is nothing to map through.";
  }
  return null;
}

// One frame of the RAW camera feed as luminance, downscaled. Raw is the
// right space: project.cameraQuad's points were placed on the untransformed
// feed, so normalized raw-frame coordinates and normalized camera-space
// coordinates are the same thing. drawImage reads the video's own frame and
// ignores the CSS rectification transform, which is what we want.
function grabCameraFrameLuma(video) {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const w = SHADOW_CAPTURE_WIDTH;
  const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const luma = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    // Rec.601 luma in integer arithmetic.
    luma[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }
  return { w, h, luma };
}

// Keeps only the largest 8-connected component. 8-connectivity rather than
// 4 because a silhouette pinched to a diagonal thread at a wrist or an ankle
// should stay ONE blob - splitting a person into a body and a detached hand
// is the failure this is guarding against, and it costs nothing.
function largestBlob(mask, w, h) {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let next = 0, best = 0, bestSize = 0;

  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || label[seed]) continue;
    next++;
    let top = 0, size = 0;
    stack[top++] = seed;
    label[seed] = next;
    while (top > 0) {
      const i = stack[--top];
      size++;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !label[j]) {
            label[j] = next;
            stack[top++] = j;
          }
        }
      }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }

  if (bestSize < w * h * SHADOW_MIN_BLOB_FRACTION) return null;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = label[i] === best ? 1 : 0;
  return out;
}

// Moore-neighbour boundary tracing: walk the outside of the blob, always
// resuming the clockwise search from where we came in, so the walk hugs the
// border rather than cutting across the shape.
function traceBoundary(mask, w, h) {
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;

  let sx = -1, sy = -1;
  for (let i = 0; i < mask.length && sx < 0; i++) {
    if (mask[i]) { sx = i % w; sy = (i / w) | 0; }
  }
  if (sx < 0) return null;

  // Clockwise 8-neighbourhood.
  const D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  const contour = [];
  let px = sx, py = sy;
  // Enter from the west: (sx,sy) is the first set pixel in row-major order,
  // so the pixel to its left is guaranteed background.
  let backtrack = 4;
  const maxSteps = 8 * w * h;

  for (let step = 0; step < maxSteps; step++) {
    contour.push([px, py]);
    let moved = false;
    for (let k = 1; k <= 8; k++) {
      const d = (backtrack + k) % 8;
      const nx = px + D[d][0], ny = py + D[d][1];
      if (at(nx, ny)) {
        backtrack = (d + 4) % 8; // now pointing back at the pixel we left
        px = nx;
        py = ny;
        moved = true;
        break;
      }
    }
    if (!moved) break; // a single isolated pixel
    if (px === sx && py === sy) break;
  }
  return contour;
}

// Ramer-Douglas-Peucker on an open polyline. The contour is a closed ring
// walked from one point back to it, so running it open keeps that point
// pinned, which is harmless for a shape about to be edited by hand.
function rdp(points, eps) {
  if (points.length < 3) return points.slice();
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);

  let maxD = -1, idx = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const d = len < 1e-9
      ? Math.hypot(x - ax, y - ay)
      : Math.abs(dy * x - dx * y + bx * ay - by * ax) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }

  if (maxD > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

// Binary-searches RDP's tolerance for a ring in the 20-40 point range. A
// fixed epsilon cannot do this: the right tolerance depends on how big the
// person came out in frame, which is a property of the room. If the contour
// is too short to reach the minimum, the tightest result is the honest
// answer - there was simply not that much shape there.
function simplifyRingToRange(contour, minPts, maxPts) {
  let lo = 0.05, hi = Math.max(contour.length, 64);
  const finest = rdp(contour, lo);
  if (finest.length <= maxPts) return finest;

  let best = finest;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const out = rdp(contour, mid);
    if (out.length > maxPts) {
      lo = mid;
    } else if (out.length < minPts) {
      hi = mid;
      best = out;
    } else {
      return out;
    }
  }
  return best;
}

// A -> B, in normalized OUTPUT space. Everything above, wired together.
function shadowRingFromFrames(frameA, frameB, threshold, H) {
  if (!frameA || !frameB || frameA.w !== frameB.w || frameA.h !== frameB.h) return null;
  const { w, h } = frameA;

  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    // SIGNED, on purpose: a shadow is a DROP in light, so only pixels that
    // got darker count. Taking the signed difference discards everything
    // that got brighter for free - which is most of what the camera's auto
    // exposure does when a body walks into a bright frame.
    mask[i] = frameA.luma[i] - frameB.luma[i] > threshold ? 1 : 0;
  }

  const blob = largestBlob(mask, w, h);
  if (!blob) return null;

  const contour = traceBoundary(blob, w, h);
  if (!contour || contour.length < KEEPOUT_MIN_POINTS) return null;

  const simplified = simplifyRingToRange(contour, SHADOW_TARGET_MIN_POINTS, SHADOW_TARGET_MAX_POINTS);

  // Camera space -> output space, through the EXISTING calibration. The
  // stored points must be in output space, so the keep-out stays valid long
  // after the camera is unplugged.
  const ring = [];
  for (const [x, y] of simplified) {
    const p = applyHomography(H, [(x + 0.5) / w, (y + 0.5) / h]);
    if (p) ring.push(p);
  }
  return ring.length >= KEEPOUT_MIN_POINTS ? ring : null;
}

function setSuggestStatus(text) {
  const el = document.getElementById("keepout-suggest-status");
  if (el) el.textContent = text || "";
}

// The big number in the control window, so the countdown is readable from
// the desk as well as from the wall.
function setPreviewCountdown(value) {
  const el = document.getElementById("preview-countdown");
  if (!el) return;
  if (value == null) {
    el.hidden = true;
    el.textContent = "";
  } else {
    el.textContent = String(value);
    el.hidden = false;
  }
}

function showCountdown(value) {
  suggestionCountdownValue = value;
  broadcastCountdown(value);
  setPreviewCountdown(value);
}

// The sequence, and its order is the whole design. See the section comment.
async function suggestKeepOutFromShadow(keepOutId) {
  if (suggestionRunning) return;
  const keepOut = project.keepOuts.find((k) => k.id === keepOutId);
  if (!keepOut) return;
  if (shadowSuggestionBlocker()) return;

  const H = computeHomography(project.cameraQuad, UNIT_SQUARE_CORNERS);
  if (!H) {
    setSuggestStatus("The camera calibration is degenerate - recalibrate before suggesting.");
    return;
  }

  const video = document.getElementById("preview-camera");
  // If the plate was already up, leave it up afterwards: this gesture should
  // give the output back exactly as it found it.
  const plateWasUp = whiteFieldOn;
  suggestionRunning = true;
  renderControl();

  try {
    // 1. Raise the white plate, and let the room settle under it.
    if (!whiteFieldOn) {
      whiteFieldOn = true;
      broadcastWhiteField();
    }
    setSuggestStatus("Lighting the wall\u2026");
    await delay(SHADOW_PLATE_SETTLE_MS);

    // 2. Frame A: the empty wall. Taken BEFORE the countdown exists, so it
    //    cannot contain one.
    const frameA = grabCameraFrameLuma(video);
    if (!frameA) {
      setSuggestStatus("No camera frame to capture - is the feed running?");
      return;
    }

    // 3. Count the performer into place, on the wall and at the desk.
    for (let t = shadowCountdownSeconds; t > 0; t--) {
      showCountdown(t);
      setSuggestStatus(`Step into the beam \u2014 ${t}\u2026`);
      await delay(1000);
    }

    // 4. Take the countdown off the output FIRST, then settle, then capture.
    showCountdown(null);
    setSuggestStatus("Capturing\u2026");
    await delay(SHADOW_CLEAR_SETTLE_MS);
    const frameB = grabCameraFrameLuma(video);

    // 5/6. Difference, blob, trace, simplify, and map into output space.
    const ring = shadowRingFromFrames(frameA, frameB, shadowThreshold, H);
    if (!ring) {
      setSuggestStatus(
        "No shadow found. Lower the threshold, or check that you were standing in the beam and inside the camera's view."
      );
      return;
    }

    if (setKeepOutPoints(keepOutId, ring)) {
      setSuggestStatus(
        `Traced ${ring.length} points. Now raise the margin until the shape is comfortably bigger than you, and push any point that reads wrong.`
      );
    } else {
      setSuggestStatus("The traced shape came out unusable - try again with a different threshold.");
    }
  } catch (err) {
    console.warn("Muralista: shadow suggestion failed.", err);
    setSuggestStatus(`The suggestion failed: ${(err && err.message) || err}`);
  } finally {
    // 7. Give the output back as we found it, whatever happened above.
    showCountdown(null);
    if (!plateWasUp && whiteFieldOn) {
      whiteFieldOn = false;
      broadcastWhiteField();
    }
    suggestionRunning = false;
    selectKeepOutState(keepOutId); // leave it selected and editable
    const status = document.getElementById("keepout-suggest-status");
    const carried = status ? status.textContent : "";
    renderControl();
    setSuggestStatus(carried); // renderControl rebuilds the panel; keep the message
  }
}

// =========================================================================
// KEEP-OUT EDITING (preview)
// =========================================================================
// Three layers of hit target per selected keep-out, appended in this order
// so SVG paint order does the disambiguating for free (later = on top):
//
//   1. the filled body     -> select it, and drag the whole polygon
//   2. one line per edge   -> insert a point there, and pull it out in the
//                             same gesture
//   3. one handle per point-> select that point, and drag it
//
// Every one of them goes through beginPreviewDrag(), for the reason spelled
// out in full on that function: renderPreview() does svg.innerHTML = "" on
// every pointermove, so a listener attached to any of these elements is
// destroyed by the first move it handles. #preview-svg is emptied but never
// replaced, so it is the one safe host. This is the v2.1 drag bug and this
// repo has paid for it twice.

// THE MARGIN IS A STROKE, NOT GEOMETRY.
//
// A polygon offset would need a geometry library, and the obvious cheap
// substitute - scaling the ring outward from its centroid - is wrong exactly
// where it matters. A thin spur (an arm, a mic stand, a leg) has its two
// sides close together but both far from the centroid, so a centroid scale
// moves them apart by a fraction of that distance rather than by the margin:
// the limb gets longer instead of thicker.
//
// Stroking the same polygon in the same black, with round joins and caps, is
// a TRUE dilation - every point on the outline grows outward by the same
// amount, corners and thin limbs included - and it is one attribute instead
// of a library.
//
// The rule it exists to implement: draw the shape generously larger than the
// shadow, because a performer sways and an exact mask lets light onto the
// face on every lean.
//
// `scale` is the pixel height of the frame being drawn into, since margin is
// a fraction of FRAME HEIGHT. One consequence worth knowing: SVG centres a
// stroke on its path, so the shape grows outward by HALF the stroke width.
// Set as an inline style rather than a presentation attribute, because a
// stylesheet rule would outrank an attribute and silently win.
function applyKeepOutMarginStroke(polygon, margin, scale) {
  const width = clampMargin(margin) * scale;
  polygon.style.strokeWidth = `${width}px`;
}

function keepOutPointsAttr(keepOut, w, h) {
  return keepOut.points.map(([x, y]) => `${x * w},${y * h}`).join(" ");
}

function renderKeepOutsPreview(svg) {
  project.keepOuts
    .filter((k) => k.visible)
    .forEach((keepOut) => {
      const selected = keepOut.id === selectedKeepOutId;
      const points = keepOutPointsAttr(keepOut, PREVIEW_W, PREVIEW_H);

      // The mask is drawn the same way the output paints it - black fill
      // plus a black round-joined stroke of the margin's width - so what
      // gets tuned on screen is what lands on the wall. The preview viewBox
      // is 1600x900 inside a 16/9 box, so its user units are square and
      // PREVIEW_H is the right scale for a frame-height fraction.
      const mask = document.createElementNS(SVG_NS, "polygon");
      mask.setAttribute("points", points);
      mask.setAttribute("class", "preview-keepout-mask");
      applyKeepOutMarginStroke(mask, keepOut.margin, PREVIEW_H);
      mask.addEventListener("pointerdown", (e) => startKeepOutDrag(e, svg, keepOut));
      svg.appendChild(mask);

      // A separate outline on top carries the selection state. It has to be
      // its own element: the mask's stroke is already spoken for by the
      // margin, and an element has only one of those. Not a hit target -
      // pointer-events:none in CSS - so the mask below keeps the gesture.
      const outline = document.createElementNS(SVG_NS, "polygon");
      outline.setAttribute("points", points);
      outline.setAttribute("class", "preview-keepout-outline" + (selected ? " selected" : ""));
      svg.appendChild(outline);

      if (selected) {
        renderKeepOutEdgeTargets(svg, keepOut);
        renderKeepOutPointHandles(svg, keepOut);
      }
    });
}

// One invisible thick line per edge. pointer-events:all (set in CSS) is
// required for the same reason the corner handles' hit circle needs it: a
// transparent stroke is not "painted", and SVG's default visiblePainted
// hit-testing would skip it.
function renderKeepOutEdgeTargets(svg, keepOut) {
  const n = keepOut.points.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = keepOut.points[i];
    const [x2, y2] = keepOut.points[(i + 1) % n];

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x1 * PREVIEW_W);
    line.setAttribute("y1", y1 * PREVIEW_H);
    line.setAttribute("x2", x2 * PREVIEW_W);
    line.setAttribute("y2", y2 * PREVIEW_H);
    line.setAttribute("class", "keepout-edge-hit");
    // Insert AFTER point i, i.e. at ring index i+1, so the new point lands
    // between the two it was clicked between. The last edge (i = n-1) wraps
    // to point 0, and index n is the correct insert position for it: it
    // still leaves the new point between point n-1 and point 0.
    line.addEventListener("pointerdown", (e) => startKeepOutEdgeInsert(e, svg, keepOut, i + 1));
    svg.appendChild(line);
  }
}

// No number labels here, unlike the surface corner handles: a traced shadow
// carries 20-40 points, and there are no 1-4 keys addressing them.
function renderKeepOutPointHandles(svg, keepOut) {
  keepOut.points.forEach(([nx, ny], i) => {
    const cx = nx * PREVIEW_W;
    const cy = ny * PREVIEW_H;

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "corner-handle keepout" + (i === selectedPointIndex ? " active" : ""));

    const hitTarget = document.createElementNS(SVG_NS, "circle");
    hitTarget.setAttribute("cx", cx);
    hitTarget.setAttribute("cy", cy);
    hitTarget.setAttribute("r", 15);
    hitTarget.setAttribute("class", "corner-handle-hit");
    group.appendChild(hitTarget);

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", 8);
    group.appendChild(circle);

    group.addEventListener("pointerdown", (e) => startKeepOutPointDrag(e, svg, keepOut, i));
    svg.appendChild(group);
  });
}

// Drag a whole keep-out: translate every point by the same delta, through
// the same clampTranslateDelta the surfaces use, so the ring keeps its shape
// at the overshoot boundary instead of collapsing point by point. Also
// handles click-to-select in the same gesture, exactly like startSurfaceDrag
// - and the re-render that selection triggers is precisely what used to
// detach the listeners, which is why they go on the svg.
function startKeepOutDrag(e, svg, keepOut) {
  if (selectedKeepOutId !== keepOut.id) {
    selectKeepOutState(keepOut.id);
    renderControl(); // full re-render (sidebar highlight, panel, handles)
  }

  const originalPoints = keepOut.points.map(([x, y]) => [x, y]);
  const start = svgPointerToNormalized(e, svg);

  beginPreviewDrag(e, svg, (evt) => {
    const p = svgPointerToNormalized(evt, svg);
    const rawDelta = [p[0] - start[0], p[1] - start[1]];
    const [dx, dy] = clampTranslateDelta(originalPoints, rawDelta);
    keepOut.points = originalPoints.map(([x, y]) => [x + dx, y + dy]);
  });
}

function startKeepOutPointDrag(e, svg, keepOut, index) {
  if (selectedKeepOutId !== keepOut.id) selectKeepOutState(keepOut.id);
  selectedPointIndex = index;
  renderControl(); // the panel's delete button and the handle's highlight

  beginPreviewDrag(e, svg, (evt) => {
    const [nx, ny] = svgPointerToNormalized(evt, svg);
    keepOut.points[index] = [clampCoord(nx), clampCoord(ny)];
  });
}

// Clicking an edge inserts a point there and immediately begins dragging it,
// so "add a point and pull it out" is one gesture rather than three. The
// insert commits first, and commitProjectChange() -> renderPreview() rebuilds
// every child of #preview-svg - which is exactly why the drag listeners must
// live on the svg and not on the line that was clicked. The closure below
// holds the keepOut OBJECT, which the rebuild does not replace (the mutators
// edit project.keepOuts in place), so the index stays valid across it.
function startKeepOutEdgeInsert(e, svg, keepOut, index) {
  const point = svgPointerToNormalized(e, svg);
  if (selectedKeepOutId !== keepOut.id) selectKeepOutState(keepOut.id);
  insertKeepOutPoint(keepOut.id, index, point);

  beginPreviewDrag(e, svg, (evt) => {
    const [nx, ny] = svgPointerToNormalized(evt, svg);
    keepOut.points[index] = [clampCoord(nx), clampCoord(ny)];
  });
}

// =========================================================================
// CAMERA BACKDROP (control-only)
// =========================================================================
// An optional live webcam feed, from a camera mounted beside the projector
// lens, shown under the surface outlines in place of the static photo.
// Dragging a quad then shows the real wall updating underneath it, instead
// of a photo that went stale the moment anything in the room moved.
//
// Same rule as project.photo, and for the same reason: this is an authoring
// aid and never reaches the output window. The <video> lives inside
// control-root only and the MediaStream is never serialized.
// project.cameraDeviceId and project.cameraQuad do ride along in the
// broadcast state (project.photo already does), but nothing on the output
// side reads them - see handleOutputMessage / renderOutput.
//
// Rectification is the surface warp run backwards, which is why it needs no
// new rendering machinery. A surface maps a square of content ONTO a quad in
// output space; here we map a quad in CAMERA space - the projector's lit
// rectangle, marked by hand during calibration - onto the whole stage. Same
// computeHomography, same matrix3d. Once cameraQuad is placed, a mark on the
// wall sits at the same spot in the preview as it does in the projected
// frame.
//
// ACCURACY, and its one honest limit. After calibration the mapping is exact
// for anything on the wall plane - a plane-to-plane map is what a homography
// IS. Anything standing OUT from the wall (a performer, a speaker stack, a
// pillar) appears displaced, by an amount that grows with its distance from
// the wall, and no fixed correction removes this: the camera and the
// projector do not stand in the same place, so they genuinely disagree about
// where such a thing is. For a performer keep-out the reliable method is to
// trace the performer's projected SHADOW rather than the performer. The
// shadow is by definition the exact set of blocked projector pixels - the
// projector drew it - and it lands on the wall plane, so it maps exactly and
// no camera-to-lens offset needs measuring. Also documented in README
// ("Limits") and project-context.md.

let cameraStream = null;

// Calibration mode: the feed is shown RAW (untransformed, full strength)
// with four draggable handles over it, to be placed on the corners of the
// projector's lit rectangle. Control-local UI state, never persisted.
let calibratingCamera = false;

// A generous starting rectangle when calibration begins with nothing stored -
// visibly not the frame edge, so it reads as "drag me" rather than "already
// correct".
const DEFAULT_CAMERA_QUAD = [
  [0.2, 0.2],
  [0.8, 0.2],
  [0.8, 0.8],
  [0.2, 0.8],
];

function isCameraMode() {
  return project.backdropMode === "camera";
}

function isCameraEnabled() {
  return cameraStream != null;
}

function setBackdropMode(mode) {
  project.backdropMode = mode === "camera" ? "camera" : "photo";
  if (!isCameraMode()) {
    // Leaving camera mode gives the webcam back: the recording light going
    // out is the only honest signal that nothing is watching the room.
    calibratingCamera = false;
    disableCamera();
  }
  commitProjectChange();
}

function setCameraDeviceId(deviceId) {
  project.cameraDeviceId = deviceId || null;
  commitProjectChange();
  if (isCameraEnabled()) enableCamera(); // re-open on the newly chosen input
}

function setCameraQuad(quad) {
  project.cameraQuad = quad;
  commitProjectChange();
}

function toggleCamera() {
  if (isCameraEnabled()) {
    calibratingCamera = false; // nothing left to calibrate against
    disableCamera();
    renderControl();
  } else {
    enableCamera();
  }
}

async function enableCamera() {
  const statusEl = document.getElementById("camera-status");
  statusEl.textContent = "";
  try {
    // Stop any existing stream first - switching device while the old one is
    // still open can leave two tracks live on the same camera.
    stopCameraTracks();
    const wanted = project.cameraDeviceId;
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: wanted ? { deviceId: { exact: wanted } } : true,
      audio: false, // a backdrop is picture only; nothing here listens to the room
    });
    document.getElementById("preview-camera").srcObject = cameraStream;

    // Device LABELS are blank until a camera permission has been granted, so
    // the list is only worth populating after getUserMedia has resolved -
    // before that it would be a menu of anonymous ids.
    await populateCameraDeviceList();
    renderControl();
  } catch (err) {
    cameraStream = null;
    statusEl.textContent = `Camera unavailable: ${(err && err.message) || err}`;
    console.warn("Muralista: camera getUserMedia failed.", err);
    renderControl();
  }
}

function stopCameraTracks() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
}

function disableCamera() {
  stopCameraTracks();
  const video = document.getElementById("preview-camera");
  if (video) video.srcObject = null;
  const statusEl = document.getElementById("camera-status");
  if (statusEl) statusEl.textContent = "";
}

async function populateCameraDeviceList() {
  const select = document.getElementById("select-camera-device");
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter((d) => d.kind === "videoinput");

  select.innerHTML = "";
  if (cams.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No cameras found";
    select.appendChild(opt);
    return;
  }

  cams.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || `Camera ${i + 1}`;
    select.appendChild(opt);
  });

  // Reflect what is actually open. If the stored deviceId is gone (the
  // webcam was unplugged, or this is another machine), fall back to whatever
  // getUserMedia handed us rather than showing a stale selection.
  const live = cameraStream && cameraStream.getVideoTracks()[0];
  const liveId = live && live.getSettings().deviceId;
  const wanted = cams.some((d) => d.deviceId === project.cameraDeviceId) ? project.cameraDeviceId : liveId;
  if (wanted) select.value = wanted;
  if (wanted && wanted !== project.cameraDeviceId) {
    project.cameraDeviceId = wanted;
    commitProjectChange();
  }
}

// Applies project.cameraQuad to the <video> as a matrix3d, so the marked
// rectangle fills the stage. Recomputed whenever the stage's pixel size
// changes (see the ResizeObserver in initControl): the homography is built
// in real pixels, so it does not survive a resize on its own.
function applyCameraTransform(video) {
  const box = video.parentElement;
  const w = box.clientWidth;
  const h = box.clientHeight;

  if (calibratingCamera || !isValidQuad(project.cameraQuad) || w === 0 || h === 0) {
    video.style.transform = ""; // raw feed: what the camera sees, unmodified
    return;
  }

  // object-fit:fill makes the camera frame cover the element box exactly, so
  // normalized camera space scales straight into element pixels.
  const srcCorners = project.cameraQuad.map(([nx, ny]) => [nx * w, ny * h]);
  const dstCorners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const H = computeHomography(srcCorners, dstCorners);
  video.style.transform = H ? homographyToMatrix3dString(H) : ""; // null = degenerate quad
}

function renderCamera() {
  const video = document.getElementById("preview-camera");
  const show = isCameraMode() && isCameraEnabled();
  video.hidden = !show;
  video.classList.toggle("calibrating", calibratingCamera);
  if (show) applyCameraTransform(video);
}

// Sidebar backdrop controls, rebuilt from state on every render so the
// buttons can never disagree with what the preview is actually doing.
function renderBackdropControls() {
  const camera = isCameraMode();
  document.getElementById("select-backdrop-mode").value = project.backdropMode;
  document.getElementById("backdrop-photo-controls").hidden = camera;
  document.getElementById("backdrop-camera-controls").hidden = !camera;

  document.getElementById("btn-camera-toggle").textContent = isCameraEnabled() ? "Disable camera" : "Enable camera";
  document.getElementById("select-camera-device").disabled = !isCameraEnabled();

  const calBtn = document.getElementById("btn-camera-calibrate");
  calBtn.textContent = calibratingCamera ? "Done" : isValidQuad(project.cameraQuad) ? "Recalibrate\u2026" : "Calibrate\u2026";
  calBtn.disabled = !isCameraEnabled();
  document.getElementById("btn-camera-calibrate-clear").disabled = !isValidQuad(project.cameraQuad) || calibratingCamera;

  const whiteBtn = document.getElementById("btn-white-field");
  whiteBtn.textContent = whiteFieldOn ? "Hide white" : "Show white";
  whiteBtn.classList.toggle("active", whiteFieldOn);
}

function toggleCameraCalibration() {
  if (!calibratingCamera && !isValidQuad(project.cameraQuad)) {
    project.cameraQuad = DEFAULT_CAMERA_QUAD.map(([x, y]) => [x, y]);
    saveProject(project);
  }
  calibratingCamera = !calibratingCamera;
  renderControl();
}

function clearCameraQuad() {
  calibratingCamera = false;
  setCameraQuad(null);
}

// Calibration handles, drawn instead of the surface outlines while
// calibrating. They live in normalized camera space, and the feed is
// untransformed while placing them, so preview space and camera space are
// the same space here - no conversion needed beyond the viewBox scale.
function renderCameraCalibrationHandles(svg) {
  const quad = project.cameraQuad;
  if (!isValidQuad(quad)) return;

  const outline = document.createElementNS(SVG_NS, "polygon");
  outline.setAttribute("points", quad.map(([x, y]) => `${x * PREVIEW_W},${y * PREVIEW_H}`).join(" "));
  outline.setAttribute("class", "camera-quad-outline");
  svg.appendChild(outline);

  quad.forEach(([nx, ny], i) => {
    const cx = nx * PREVIEW_W;
    const cy = ny * PREVIEW_H;

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "corner-handle camera");

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

    group.addEventListener("pointerdown", (e) =>
      beginPreviewDrag(e, svg, (evt) => {
        const [x, y] = svgPointerToNormalized(evt, svg);
        project.cameraQuad[i] = [clampCoord(x), clampCoord(y)];
      })
    );
    svg.appendChild(group);
  });
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

  surface.layer = surface.layer || { type: "pattern", src: null, opacity: 1 };
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
  ["pattern", "video", "image"].forEach((t) => {
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
      webmHint.textContent = "A .webm source (alpha transparency, Chrome-only) is a transport-synced overlay: it joins Play/Pause/Restart like a video layer instead of autoplaying on its own, so it starts with everything else.";
      container.appendChild(webmHint);
    }

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

  const opacityInput = container.querySelector("#layer-opacity-input");
  if (opacityInput && active !== opacityInput) opacityInput.value = String(layer.opacity ?? 1);
  const opacityValue = container.querySelector("#layer-opacity-value");
  if (opacityValue) opacityValue.textContent = Number(layer.opacity ?? 1).toFixed(2);
}

// =========================================================================
// KEEP-OUT PANEL (sidebar, selected keep-out)
// =========================================================================
// Same rebuild-by-key discipline as the layer panel above, and for the same
// reason: the margin slider fires commitProjectChange() on every input
// event, and rebuilding the DOM under a slider mid-drag takes the focus off
// it and strands the gesture halfway.

let keepOutPanelKey = null;

function renderKeepOutPanel() {
  const container = document.getElementById("keepout-panel");
  const keepOut = getSelectedKeepOut();

  if (!keepOut) {
    keepOutPanelKey = null;
    container.innerHTML = '<p class="layer-panel-empty">Select a keep-out to edit it.</p>';
    return;
  }

  if (keepOut.id !== keepOutPanelKey) {
    keepOutPanelKey = keepOut.id;
    buildKeepOutPanel(container, keepOut);
  } else {
    updateKeepOutPanelValues(container, keepOut);
  }
}

function buildKeepOutPanel(container, keepOut) {
  container.innerHTML = "";

  const marginRow = document.createElement("div");
  marginRow.className = "layer-field";
  const marginLabel = document.createElement("label");
  marginLabel.textContent = "Margin";
  marginLabel.setAttribute("for", "keepout-margin-input");
  const marginInput = document.createElement("input");
  marginInput.type = "range";
  marginInput.id = "keepout-margin-input";
  marginInput.min = "0";
  marginInput.max = String(KEEPOUT_MARGIN_MAX);
  marginInput.step = "0.005";
  marginInput.value = String(keepOut.margin ?? 0);
  const marginValue = document.createElement("span");
  marginValue.id = "keepout-margin-value";
  marginValue.className = "layer-opacity-value";
  marginValue.textContent = Number(keepOut.margin ?? 0).toFixed(3);
  marginInput.addEventListener("input", () => {
    marginValue.textContent = Number(marginInput.value).toFixed(3);
    setKeepOutMargin(keepOut.id, Number(marginInput.value));
  });
  marginRow.append(marginLabel, marginInput, marginValue);
  container.appendChild(marginRow);

  const marginHint = document.createElement("p");
  marginHint.className = "layer-hint";
  marginHint.textContent =
    "Fraction of frame height, painted as a round-joined stroke on the same shape - a true dilation, thin limbs included. Draw generously larger than the shadow: a performer sways, and an exact mask lets light onto the face on every lean.";
  container.appendChild(marginHint);

  const pointRow = document.createElement("div");
  pointRow.className = "layer-field";
  const deletePointBtn = document.createElement("button");
  deletePointBtn.type = "button";
  deletePointBtn.id = "keepout-delete-point";
  deletePointBtn.textContent = "Delete point";
  deletePointBtn.addEventListener("click", () => deleteKeepOutPoint(keepOut.id, selectedPointIndex));
  const pointCount = document.createElement("span");
  pointCount.id = "keepout-point-count";
  pointCount.className = "layer-opacity-value";
  pointRow.append(deletePointBtn, pointCount);
  container.appendChild(pointRow);

  const pointHint = document.createElement("p");
  pointHint.className = "layer-hint";
  pointHint.textContent =
    "Click an edge in the preview to insert a point and pull it out. Click a point to select it, then Delete (or the button) to remove it. Three points is the floor.";
  container.appendChild(pointHint);

  buildShadowSuggestControls(container, keepOut);
  updateKeepOutPanelValues(container, keepOut);
}

// "Suggest from my shadow" and the two knobs it needs. Both knobs are
// control-local (see shadowThreshold): they describe this room's light and
// how long it takes to walk to the wall, not the venue's geometry.
function buildShadowSuggestControls(container, keepOut) {
  const rule = document.createElement("div");
  rule.className = "keepout-suggest-divider";
  container.appendChild(rule);

  const row = document.createElement("div");
  row.className = "layer-field";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "keepout-suggest";
  btn.textContent = "Suggest from my shadow";
  btn.addEventListener("click", () => suggestKeepOutFromShadow(keepOut.id));
  row.appendChild(btn);
  container.appendChild(row);

  const status = document.createElement("p");
  status.id = "keepout-suggest-status";
  status.className = "keepout-suggest-status";
  container.appendChild(status);

  const hint = document.createElement("p");
  hint.id = "keepout-suggest-hint";
  hint.className = "layer-hint";
  container.appendChild(hint);

  const secsRow = document.createElement("div");
  secsRow.className = "layer-field";
  const secsLabel = document.createElement("label");
  secsLabel.textContent = "Countdown (s)";
  secsLabel.setAttribute("for", "keepout-countdown-input");
  const secsInput = document.createElement("input");
  secsInput.type = "number";
  secsInput.id = "keepout-countdown-input";
  secsInput.min = "3";
  secsInput.max = "60";
  secsInput.step = "1";
  secsInput.value = String(shadowCountdownSeconds);
  secsInput.addEventListener("change", () => {
    const n = Math.round(Number(secsInput.value));
    shadowCountdownSeconds = isFinite(n) ? Math.max(3, Math.min(60, n)) : 10;
    secsInput.value = String(shadowCountdownSeconds);
  });
  secsRow.append(secsLabel, secsInput);
  container.appendChild(secsRow);

  const thrRow = document.createElement("div");
  thrRow.className = "layer-field";
  const thrLabel = document.createElement("label");
  thrLabel.textContent = "Threshold";
  thrLabel.setAttribute("for", "keepout-threshold-input");
  const thrInput = document.createElement("input");
  thrInput.type = "range";
  thrInput.id = "keepout-threshold-input";
  thrInput.min = "4";
  thrInput.max = "120";
  thrInput.step = "1";
  thrInput.value = String(shadowThreshold);
  const thrValue = document.createElement("span");
  thrValue.id = "keepout-threshold-value";
  thrValue.className = "layer-opacity-value";
  thrValue.textContent = String(shadowThreshold);
  thrInput.addEventListener("input", () => {
    shadowThreshold = Number(thrInput.value);
    thrValue.textContent = String(shadowThreshold);
  });
  thrRow.append(thrLabel, thrInput, thrValue);
  container.appendChild(thrRow);

  const thrHint = document.createElement("p");
  thrHint.className = "layer-hint";
  thrHint.textContent =
    "How much darker a pixel must get to count as shadow. One knob, not a clever guess: raise it if the trace catches the whole wall, lower it if it finds nothing. A coarse blob is the right answer here - the margin has to inflate it anyway.";
  container.appendChild(thrHint);
}

// Refreshes values without rebuilding, skipping whichever field has focus so
// an in-progress slider drag isn't clobbered by the commit it triggered.
function updateKeepOutPanelValues(container, keepOut) {
  const active = document.activeElement;

  const marginInput = container.querySelector("#keepout-margin-input");
  if (marginInput && active !== marginInput) marginInput.value = String(keepOut.margin ?? 0);
  const marginValue = container.querySelector("#keepout-margin-value");
  if (marginValue) marginValue.textContent = Number(keepOut.margin ?? 0).toFixed(3);

  const count = keepOut.points.length;
  const pointCount = container.querySelector("#keepout-point-count");
  if (pointCount) {
    pointCount.textContent =
      selectedPointIndex == null ? `${count} points` : `point ${selectedPointIndex + 1} of ${count}`;
  }
  const deletePointBtn = container.querySelector("#keepout-delete-point");
  if (deletePointBtn) deletePointBtn.disabled = selectedPointIndex == null || count <= KEEPOUT_MIN_POINTS;

  // The suggestion needs a calibrated, running camera. Disabled with the
  // reason said out loud, rather than left as a dead control.
  const blocker = shadowSuggestionBlocker();
  const suggestBtn = container.querySelector("#keepout-suggest");
  if (suggestBtn) {
    suggestBtn.disabled = !!blocker || suggestionRunning;
    suggestBtn.textContent = suggestionRunning ? "Capturing\u2026" : "Suggest from my shadow";
  }
  const suggestHint = container.querySelector("#keepout-suggest-hint");
  if (suggestHint) {
    suggestHint.textContent = blocker
      ? blocker
      : "Raises the white plate, photographs the empty wall, counts you into the beam, photographs it again, and keeps what got darker. That region IS your shadow - trace the shadow, never the body: the camera and the lens disagree about where you are, and cannot disagree about where your shadow falls.";
    suggestHint.classList.toggle("blocked", !!blocker);
  }
  const thrInput = container.querySelector("#keepout-threshold-input");
  if (thrInput && active !== thrInput) thrInput.value = String(shadowThreshold);
  const thrValue = container.querySelector("#keepout-threshold-value");
  if (thrValue) thrValue.textContent = String(shadowThreshold);
  const secsInput = container.querySelector("#keepout-countdown-input");
  if (secsInput && active !== secsInput) secsInput.value = String(shadowCountdownSeconds);
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
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
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

  // Escape means "get me out of here" first, and only then "back to
  // whole-surface nudging" (below) - during calibration there is no surface
  // selected to nudge anyway.
  if (calibratingCamera) {
    if (e.key === "Escape") toggleCameraCalibration();
    return; // the preview belongs to the camera quad; nudges have nothing to show
  }

  // Keep-out keys. Selection is exclusive with surfaces (see
  // selectedKeepOutId), so this block and the surface block below can never
  // both be live, and the early return here is not stealing keys from a
  // selected surface.
  if (selectedKeepOutId) {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault(); // Backspace still means "back" in some setups
      deleteKeepOutPoint(selectedKeepOutId, selectedPointIndex);
      return;
    }
    if (e.key === "Escape") {
      selectedPointIndex = null; // deselect the point, keep the keep-out
      renderControl();
      return;
    }
    return; // arrows and 1-4 belong to surface calibration
  }

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
      replaceProject(migrateProject(parsed));
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
  document.getElementById("btn-add-keepout").addEventListener("click", addKeepOut);

  document.getElementById("btn-open-output").addEventListener("click", () => {
    // Hand the output window THIS window's build token (see the bootstrap in
    // mapper.html) so the two documents load the same mapper.js and mapper.css
    // by construction. Reloading the control window mints a fresh token, and
    // the next click re-navigates the named output window onto it.
    const url = "mapper.html?output&v=" + encodeURIComponent(window.MURALISTA_BUILD);
    const win = window.open(url, "mapper-output");
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

  document.getElementById("select-backdrop-mode").addEventListener("change", (e) => setBackdropMode(e.target.value));
  document.getElementById("btn-camera-toggle").addEventListener("click", toggleCamera);
  document.getElementById("select-camera-device").addEventListener("change", (e) => setCameraDeviceId(e.target.value));
  document.getElementById("btn-camera-calibrate").addEventListener("click", toggleCameraCalibration);
  document.getElementById("btn-camera-calibrate-clear").addEventListener("click", clearCameraQuad);
  document.getElementById("btn-white-field").addEventListener("click", toggleWhiteField);
}

function initControl() {
  document.getElementById("control-root").hidden = false;
  channel.addEventListener("message", handleControlMessage);
  wireControlEvents();
  // Keydown on the whole document (not a specific element) so nudging works
  // no matter what's focused in the control window, short of a text input.
  document.addEventListener("keydown", handleControlKeydown);

  // The camera backdrop's matrix3d is built in real stage pixels, so it has
  // to be rebuilt whenever the stage changes size. Surfaces need no such
  // thing: they are drawn in the SVG's fixed 1600x900 viewBox and scale for
  // free.
  new ResizeObserver(() => renderCamera()).observe(document.querySelector(".preview-box"));

  renderControl();
}

// =========================================================================
// OUTPUT RENDERING
// =========================================================================
// Per visible surface: a fixed 1000x1000 wrapper div, warped onto the
// surface's corners (in current window pixels) via matrix3d - see the WARP
// section above for the homography math. Re-renders on every received
// state and on window resize (wired in initOutput()).

// Reconciliation map: surfaceId -> { wrapper, layerType, layerSrc, contentEl }.
// renderOutput() runs on every received state AND on every window resize
// (arrow-key nudges commit a state broadcast per keystroke). Without this
// map, the old "container.innerHTML = ''; rebuild everything" approach would
// tear down and recreate every <video> on every single nudge or resize -
// restarting playback constantly, which is exactly wrong for calibrating
// WHILE video plays. Now: the wrapper transform + layer opacity update every
// render: the underlying video/image/canvas element only gets recreated when
// its surface's layer.type or layer.src actually changes.
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
  renderKeepOutsOutput(w, h);
}

// Keep-outs paint ABOVE every surface wrapper, always, regardless of the
// order of either list - black is the decision that wins. #output-keepouts
// is a sibling of #output-surfaces that comes after it in the document, so
// this needs no z-index bookkeeping and never touches the surface
// reconciler. It sits BELOW #output-white on purpose: "Show white" has to
// give a genuinely clean plate, and a keep-out painted on top of it would
// occlude the very shadow the suggestion below is trying to trace.
//
// Drawn in real output pixels rather than in normalized space, because the
// margin stroke has to be ROUND: a viewBox stretched over a non-square frame
// would scale x and y differently and turn every round join into an ellipse.
// Rebuilt wholesale each time (unlike the surfaces, which reconcile to keep
// video playing) - these are a handful of polygons with no media in them and
// nothing to preserve across a render.
function renderKeepOutsOutput(w, h) {
  const svg = document.getElementById("output-keepouts");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.innerHTML = "";

  // Defensive read: the output takes whatever the broadcast handed it, and
  // isValidProject() only checks version + surfaces.
  const keepOuts = Array.isArray(project.keepOuts) ? project.keepOuts : [];

  keepOuts
    .filter((k) => k && k.visible && isValidPointRing(k.points))
    .forEach((keepOut) => {
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute("points", keepOutPointsAttr(keepOut, w, h));
      poly.setAttribute("class", "output-keepout");
      applyKeepOutMarginStroke(poly, keepOut.margin, h);
      svg.appendChild(poly);
    });
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
    };
    outputSurfaceElements.set(surface.id, entry);
  }

  entry.wrapper.style.transform = transform;
  renderLayer(surface, entry);
}

// Renders (or reconciles) the content that lives inside a surface's warped
// wrapper. Only recreates the content element when layer.type or layer.src
// changed since the last render; otherwise just refreshes cheap properties
// (opacity) on the existing element so playback state survives.
function renderLayer(surface, entry) {
  const layer = surface.layer || { type: "pattern", src: null, opacity: 1 };
  const nextSrc = layer.src || null;
  const typeChanged = entry.layerType !== layer.type;
  const srcChanged = entry.layerSrc !== nextSrc;

  if (typeChanged || srcChanged) {
    teardownLayerContent(entry); // pause/stop+detach whatever was there before
    entry.wrapper.innerHTML = "";
    entry.contentEl = createLayerElement(surface, layer);
    entry.wrapper.appendChild(entry.contentEl);
    entry.layerType = layer.type;
    entry.layerSrc = nextSrc;
  }

  if (entry.contentEl) {
    entry.contentEl.style.opacity = String(layer.opacity ?? 1);
  }
}

function createLayerElement(surface, layer) {
  switch (layer.type) {
    case "video":
      return createVideoLayerElement(layer, surface);
    case "image":
      return createImageLayerElement(layer, surface);
    case "pattern":
    default:
      return renderPatternLayer(surface);
  }
}

// Stops/detaches whatever content element (if any) currently lives in an
// entry: pauses+releases a <video>. Safe to call on an entry with no
// content yet.
function teardownLayerContent(entry) {
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
// LAYER ELEMENT FACTORIES (video / image / pattern)
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
    // start at the same instant as everything else, so it joins the shared
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

// The one change to the output render path (v2.4): a plain white plate above
// the surfaces, raised on request from the control window so the projector's
// lit rectangle can be seen and marked while the camera backdrop is being
// calibrated. It covers the surfaces rather than replacing them - dropping
// the plate leaves everything exactly as it was, still playing.
function setOutputWhiteField(on) {
  document.getElementById("output-white").hidden = !on;
}

// The countdown plate, above the white field so it is legible on it. It is
// REMOVED before the second capture, not merely faded: the whole point of
// the settle that follows is that neither captured frame contains it, so a
// countdown still on the wall would difference into the traced shape.
function setOutputCountdown(value) {
  const el = document.getElementById("output-countdown");
  if (value == null) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.textContent = String(value);
  el.hidden = false;
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
