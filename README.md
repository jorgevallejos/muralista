# Wall Mapper v1

A browser-based projection-mapping spike for Chango Pepper concerts: corner-pin Jorge's animations onto multiple physical surfaces (wall + boxes) with one projector, calibrated live without a camera. Plain HTML/JS/CSS, no framework or build step, Chrome only. The single page (`mapper/mapper.html`) serves two roles — a **control** window (performer UI: surface list, calibration, layers, transport) and an **output** window (`?output`, the projector image) — kept in sync over `BroadcastChannel`.

## Running it

```
cd mapper/
python3 -m http.server 8123
```

Open `http://localhost:8123/mapper.html` — that's the control window. Click "Open output window", drag the new window onto the projector's display, and press `F` (or double-click) to fullscreen it.

## Calibrating

1. **Add a surface** in the sidebar, then **select** it.
2. **Drag** its corner handles in the preview to roughly match the physical surface's shape/position.
3. Switch its layer to **pattern** (the calibration grid) so you have something visible to align on the wall.
4. Press **1–4** to pick which corner is active (matches the numbered markers baked into the pattern), then use the **arrow keys** to nudge it in real output pixels while watching the projected result — Shift = 1px fine nudge, unshifted = 5px. This works even while focus is in the control window, so you don't have to click back into the preview between nudges.
5. Use **Identify** to flash each surface's name/ID on the output when you lose track of which physical surface is which.

## Layers

Each surface has one of four layer types:

- **pattern** — the calibration grid (numbered corners, surface name). Good default while aligning.
- **video** — plays a file from `mapper/media/`; `cerdo.mp4` (the Tragedia de Cerdo Asado master) is already there. Reference video/image files as `media/<name>` in the layer's source field. All video layers share one global transport (Play/Pause/Restart).
- **image** — a still image, or an alpha WebM for transparency (Chrome-only feature). Transparent PNG is the slot for AI-generated plasticine-style assets.
- **beat** — a canvas layer that pulses at a given BPM, phase-locked across surfaces to a shared downbeat.

Video/image files must be dropped into `mapper/media/` by hand first — the file picker in the layer panel only fills in the `media/<name>` path, it doesn't copy anything.

## Desk smoke test (no projector)

One end-to-end pass that exercises sync, warp, calibration, and video — worth running before any projector session:

1. Start the server, open the control window, click **Open output window**. Keep the output windowed next to the control window (no need for a second display).
2. **Add a surface.** It should appear in both windows at once — a quad in the control preview, a colored grid pattern with numbered corners in the output. *(Proves the BroadcastChannel sync.)*
3. **Drag the corner handles** into a trapezoid — narrow top, wide bottom. In the output, the grid must **keystone**: grid lines converge toward the narrow edge, like looking at a floor. If it merely stretches/skews linearly, the warp is broken. *(Proves the homography.)*
4. Press **2** (top-right corner goes active), then tap the **arrow keys** — that corner alone should creep in the output. Hold **Shift** for visibly finer steps. *(Proves the calibration UX.)*
5. Set the surface's layer to **video**, source `media/test.mp4` (or `media/cerdo.mp4`), press **Play** in the header. While it plays, nudge a corner — the video must **keep playing without restarting or flickering**. *(Proves live calibration during playback.)*
6. **Export** the JSON, reload the control page, **Import** it back — same surfaces, same corners, video still configured. *(Proves a venue mapping survives.)*

Pass = all six behave as described. Then repeat step 3–5 thinking of the output window as the wall: that's exactly the M1/M2 projector flow.

## Notes

- Mappings autosave to `localStorage` as you edit, and can be exported/imported as a JSON file — export one per venue so a calibration can be reloaded on the next visit.
- `python3 -m http.server` doesn't support HTTP Range requests, so scrubbing/seeking on the `cerdo.mp4` layer may feel sluggish. If that's a problem, `npx http-server` is a drop-in, Range-aware alternative.
- Chrome is the target browser (alpha WebM transparency and the autoplay behavior this relies on are Chrome-specific).
