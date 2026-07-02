"use strict";

/*
 * Wall Mapper — mapper.js
 *
 * Single script serving two roles, chosen by the URL query string:
 *   http://localhost:8123/mapper.html          -> control window
 *   http://localhost:8123/mapper.html?output    -> output window (projector)
 *
 * Sections: STATE, SYNC, CONTROL UI, OUTPUT RENDERING, ROLE / INIT.
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

// --- Mutators (control-side only). Each one mutates `project` in place,
// then the caller is responsible for persisting/broadcasting/rendering
// via `commitProjectChange()`. ---

function addSurface() {
  const surface = defaultSurface(project.surfaces.length + 1);
  project.surfaces.push(surface);
  selectedSurfaceId = surface.id;
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
  renderControl(); // selection is local UI state, no save/broadcast needed
}

function replaceProject(newProject) {
  project = newProject;
  selectedSurfaceId = null;
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

function handleControlMessage(event) {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.kind === "hello") {
    // A fresh output window just opened and wants the current state.
    broadcastState();
  }
}

function handleOutputMessage(event) {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.kind === "state" && isValidProject(msg.project)) {
    project = msg.project;
    renderOutput();
  }
  // 'transport' messages have no consumer yet in this slice.
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
  renderControl();
}

// =========================================================================
// OUTPUT RENDERING
// =========================================================================
// Placeholder rendering for this slice: an outlined SVG polygon + centered
// label per visible surface. Slice 2 swaps the per-surface render step for
// matrix3d-warped divs — keep that swap localized to renderOutputSurface().

function renderOutput() {
  const svg = document.getElementById("output-svg");
  svg.innerHTML = "";

  const w = window.innerWidth;
  const h = window.innerHeight;
  svg.setAttribute("width", w);
  svg.setAttribute("height", h);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  project.surfaces
    .filter((s) => s.visible)
    .forEach((surface) => renderOutputSurface(svg, surface, w, h));
}

function renderOutputSurface(svg, surface, w, h) {
  const points = surface.corners.map(([x, y]) => [x * w, y * h]);

  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points", points.map((p) => p.join(",")).join(" "));
  poly.setAttribute("class", "output-surface-outline");
  svg.appendChild(poly);

  const centroidX = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const centroidY = points.reduce((sum, p) => sum + p[1], 0) / points.length;

  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("x", centroidX);
  label.setAttribute("y", centroidY);
  label.setAttribute("class", "output-surface-label");
  label.textContent = surface.name;
  svg.appendChild(label);
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
  window.addEventListener("resize", renderOutput);
  window.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") toggleFullscreen();
  });
  window.addEventListener("dblclick", toggleFullscreen);

  renderOutput();
  channel.postMessage({ kind: "hello" });
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
