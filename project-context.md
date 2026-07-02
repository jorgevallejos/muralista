# Project Context — Projection Mapping

Project-specific Cowork context. Read **after** `~/Chango Pepper/personal-context.md`. Started 2026-07-02 as a fast prototype sprint during Jorge's Fable access window (until 7 July). Ladders directly to **Thread 1 (art × technique synthesis)** — physical stagecraft + self-built software + Jorge's plasticine animations in one artifact.

---

## What this project is

Projection mapping for Chango Pepper concerts: projecting animations onto **non-planar, multi-surface stage setups** (boxes/objects + wall), eventually with **2+ projectors**, driven by **Jorge's own software** so the projection surfaces become named slots in his animation compositions (e.g. a character walks off the wall onto a cube). AI-generated elements (plasticine-style characters/backgrounds with alpha) are composited onto surfaces as a layer type.

Long-term this converges with the **Live Lyric Translator** (shared beat clock / timeline / transport), and echoes the clay-cube identity of the website.

## Core technical framing (decided 2026-07-02)

- **Two difficulty tiers.** Tier 1 = faceted surfaces (flat planes at angles): each facet is a 4-point corner-pin = one 3×3 homography, native in WebGL/CSS `matrix3d`. Tier 2 = curved surfaces: mesh warp / camera calibration. **Start and stay in Tier 1 for v1.**
- **No-camera calibration workflow:** a phone photo of the wall is a **planning canvas only** (phone ≠ projector perspective). Actual calibration is **live corner-dragging** while watching the projected result. Automatic structured-light calibration (webcam + gray codes, OpenCV) is a later stretch.
- **Multi-projector, simplest form:** two projectors covering **separate zones** (each just another display output). Edge-blending into one seamless image is deliberately out of scope.
- **AI elements are a production pipeline, not a runtime:** assets generated offline (transparent PNG / alpha WebM), sequenced live by the software. Live generative = code-driven beat-reactive layers (particles/shader), not runtime AI.

## Staged plan

1. ✅ Ideation + framing (this doc).
2. **v1 prototype — "Wall Mapper" (in flight):** standalone browser app, single-file-ish, control window + output window (BroadcastChannel), corner-pin quads, layers: cerdo video / AI-asset (alpha) / generative beat / test patterns, photo overlay for authoring, mapping saved as per-venue JSON. Spec + kickoff: `claude-code-kickoff.md` (this folder). Built via Claude Code on the Mac (Fable coordinator + Sonnet crew).
3. Projector session: calibrate on real wall + boxes, deconstruct the cerdo animation across surfaces, drop in first AI asset. Debrief → decide v2.
4. Second projector as a separate zone.
5. Integration with the lyric translator's clock/timeline (shared transport).
6. Stretch: mesh warp for curved forms; webcam auto-calibration.

## Assets

- Cerdo master (clean, no subtitles): `~/Chango Pepper/animations/tragedia-de-cerdo-asado/Tragedia de Cerdo Asado.mp4`
- Other cuts (big/small screen + subtitled) in the same folder; brand media in `~/Chango Pepper/assets/`.
- AI assets for the alpha layer: Jorge generates externally (no image-gen in Cowork); pipeline expects transparent PNG or alpha WebM (VP9 — use Chrome, Safari drops alpha).

## Hardware

Mac mini + 1 projector (translator live rig) + iPad. Second projector: used business projector (Epson/Optoma, 3000+ lumens, €100–250) when step 4 arrives; check Mac mini chip for external-display count.

## Ways of working

Same loop as the translator waves: Cowork (this file) holds PM state; **Claude Code on the Mac runs the build** — Fable as coordinator, Sonnet subagents as crew, Jorge tests at the projector between milestones. v1 is a **spike**: light process, no test suite required; graduate to TDD + PR flow only if it becomes a real app. Code lives in this folder (git init locally; GitHub repo optional until it earns one).

## Status / next step

- 2026-07-02: project opened; spec + kickoff prompt written.
- 2026-07-02 (later): **Wall Mapper v1 built** — all 4 slices done via Claude Code (Fable coordinator + Sonnet crew), committed to local git (`a1fc6b7`). App lives in `mapper/`; run instructions in `README.md`. Cerdo master copied to `mapper/media/cerdo.mp4`. Homography math verified numerically; browser sanity pass clean (headless Chrome, no console errors). Known limits noted in README: `python3 -m http.server` lacks Range support (video seek may be sluggish — `npx http-server` as alternative); alpha WebM Chrome-only. **Next:** Jorge does a desk smoke-test in Chrome, then the projector session against gates M1–M3; debrief lands back here.
- Priority note: runs **behind** song registration + venue visits this week; the Fable-window deadline (7 July) is the reason it's active at all.
