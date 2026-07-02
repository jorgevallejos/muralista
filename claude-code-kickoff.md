# Claude Code Kickoff — Wall Mapper v1 (projection-mapping spike)

_Paste this whole file into a fresh Claude Code session opened at `~/Chango Pepper/projects/projection-mapping/`. Written by Opus-in-Cowork 2026-07-02. You (the session model, Fable) are the **PM/coordinator**: read context, decompose into slices, spawn Sonnet subagents to build, and bring Jorge test gates — same loop as the lyric-translator waves._

## Context to read first

1. `project-context.md` (this folder) — framing, decisions, staged plan.
2. `~/Chango Pepper/projects/live-lyric-translator-dev/CLAUDE.md` — for the proven two-window patterns (transport broadcast, storage-event gotcha). Reuse patterns, not code.

## What we're building

**Wall Mapper v1** — a standalone browser prototype proving that Jorge can corner-pin-map his animations onto multiple physical surfaces (wall + boxes) with one projector, calibrated live without a camera. This is a **spike**: no test suite, no build toolchain, plain HTML/JS/CSS. Local git with small conventional commits; no remote needed.

## Architecture (decided — don't relitigate)

- **Files:** `mapper/` folder → `mapper.html` (single page, both roles), `mapper.js`, `mapper.css`, `media/` (git-ignored). Role chosen by query param: plain URL = **control** window; `?output` = **output** window (opened from control via `window.open`, dragged to the projector display, fullscreened with `F`/double-click).
- **Serving:** `python3 -m http.server 8123` from `mapper/`. Both windows on `http://localhost:8123`. (file:// breaks BroadcastChannel/media — don't support it.)
- **Sync:** `BroadcastChannel('mapper')`. Control broadcasts full project state on change + transport commands. **Each window owns its `<video>` element and loads media itself from `media/` by relative path; only paths + play/pause/seek/restart commands cross the channel** (the translator's PR #20 pattern — no blob URLs across windows).
- **Warp:** CSS `matrix3d` from a 4-point homography (solve the standard 8-unknown linear system mapping unit square → 4 corners). Applied to a wrapper div per surface containing the layer element. No WebGL in v1.
- **Data model** (autosaved to localStorage, export/import as JSON download — this file is the per-venue mapping):

```json
{
  "version": 1,
  "photo": "<dataURL, optional authoring backdrop>",
  "surfaces": [
    {
      "id": "cube-a", "name": "Cube A",
      "corners": [[0.1,0.2],[0.4,0.2],[0.42,0.55],[0.08,0.5]],
      "layer": { "type": "video|image|beat|pattern",
                 "src": "media/....", "opacity": 1, "bpm": 96 },
      "visible": true
    }
  ]
}
```
  Corners are normalized (0–1) **output-space** coordinates.

## Feature scope (v1)

**Control window:** surface list (add / remove / rename / select / show-hide); a scaled preview of output-space with draggable corner handles for the selected surface; optional **photo backdrop** (file input → dataURL) under the preview for authoring placement; layer picker per surface (video from `media/` file list or file input, image w/ alpha PNG, beat layer with BPM field, test pattern); global transport bar (Play / Pause / Restart — broadcast to output); **Identify** button (flashes each surface's name/ID on output); Export / Import JSON.

**Calibration (the critical UX):** dragging handles in the preview is coarse. For live calibration while watching the wall: select surface → select corner (1–4 keys) → **arrow keys nudge in output space** (Shift = fine 1px, default 5px), working even when the control window has focus. This is how Jorge will actually calibrate — make it solid.

**Output window:** renders all visible surfaces warped; per-surface **test pattern** mode = grid + surface name + numbered corner markers; black background; cursor hidden; `F` toggles fullscreen.

**Layer types:**
1. **video** — the cerdo master. Copy `~/Chango Pepper/animations/tragedia-de-cerdo-asado/Tragedia de Cerdo Asado.mp4` into `mapper/media/`. Same video may play on multiple surfaces (independent or shared clock — shared is fine for v1). Muted autoplay-safe.
2. **image** — transparent PNG (the **AI-asset slot**: Jorge generates plasticine-style characters externally and drops them here). Alpha WebM as stretch (Chrome only — note it).
3. **beat** — canvas layer pulsing at `bpm` (radial pulse or simple particles), phase anchored to a broadcast start timestamp so all beat surfaces pulse together.
4. **pattern** — calibration grid.

## Slices (one Sonnet subagent each, sequential)

1. **Skeleton + sync:** two-role page, BroadcastChannel state sync, surface CRUD, localStorage autosave, export/import.
2. **Warp + calibration:** homography → matrix3d, preview handles, arrow-key nudge, test pattern, Identify, fullscreen output.
3. **Layers:** video (+transport), image/alpha, beat layer, photo backdrop.
4. **Polish for the projector session:** copy cerdo into `media/`, a `README.md` with the 5-line run instruction, sanity pass in the browser.

Each slice: agent reports what it built + anything learned; you commit (`feat(mapper): …`); then dispatch the next. If a slice reveals a design fork, stop and put it to Jorge — don't guess on UX.

## Test gates (Jorge at the projector)

- **M1** (after slice 2): one surface, test pattern, calibrated onto a real box face by arrow-key nudging. *Gate: does the pattern sit flush on the box?*
- **M2** (after slice 3): cerdo video on 2–3 surfaces (wall + boxes), transport works, mapping survives export/import. *Gate: does the animation feel like it lives on the objects?*
- **M3:** first AI-generated transparent PNG on a box + beat layer pulsing beside it. *Gate: is the AI-asset pipeline worth developing?*

Debrief notes from the projector session go to Jorge → back into `project-context.md` (propose the edits; Jorge approves).

## Guardrails

- Spike discipline: plain JS, no framework, no npm, no tests. Readable code > clever code — this may graduate into a real app.
- Local git only (`git init` if needed, `.gitignore` → `media/`, `*.mp4`, `*.mov`). No pushes, no PRs for v1.
- Don't touch the lyric-translator repo.
- Chrome is the target browser (alpha WebM, autoplay policies).
