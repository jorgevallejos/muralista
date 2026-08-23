# Project Context — Muralista

Project-specific Cowork context. Read **after** `~/Chango Pepper/personal-context.md`. Started 2026-07-02 as a fast prototype sprint during Jorge's Fable access window (until 7 July). Ladders directly to **Thread 1 (art × technique synthesis)** — physical stagecraft + self-built software + Jorge's plasticine animations in one artifact.

---

## What this project is

Projection mapping for Chango Pepper concerts: projecting animations onto **non-planar, multi-surface stage setups** (boxes/objects + wall), eventually with **2+ projectors**, driven by **Jorge's own software** so the projection surfaces become named slots in his animation compositions (e.g. a character walks off the wall onto a cube). AI-generated elements (plasticine-style characters/backgrounds with alpha) are composited onto surfaces as a layer type.

Long-term this converges with the **Live Lyric Translator** (shared beat clock / timeline / transport), and echoes the clay-cube identity of the website. *(This "shared transport" framing predates the desk-tool architecture — see "V1 design (2026-08-20) → Architecture" below, which dissolves rather than solves it: Muralista writes a file, it does not share a runtime clock with Pregonero.)*

## Core technical framing (decided 2026-07-02)

- **Two difficulty tiers.** Tier 1 = faceted surfaces (flat planes at angles): each facet is a 4-point corner-pin = one 3×3 homography, native in WebGL/CSS `matrix3d`. Tier 2 = curved surfaces: mesh warp / camera calibration. **Start and stay in Tier 1 for v1.**
- **No-camera calibration workflow:** a phone photo of the wall is a **planning canvas only** (phone ≠ projector perspective). Actual calibration is **live corner-dragging** while watching the projected result. Automatic structured-light calibration (webcam + gray codes, OpenCV) is a later stretch.
- **Multi-projector, simplest form:** two projectors covering **separate zones** (each just another display output). Edge-blending into one seamless image is deliberately out of scope.
- **AI elements are a production pipeline, not a runtime:** assets generated offline (transparent PNG / alpha WebM), sequenced live by the software. Live generative = code-driven beat-reactive layers (particles/shader), not runtime AI.
- **Window sync, decided when specifying the v1 build:** two-role page via query param (`?output` = the projector window; plain URL = control), synced over `BroadcastChannel('mapper')`. **Only paths and transport commands (play/pause/seek/restart) cross the channel — each window loads its own media from `media/` by relative path.** Blob URLs do not survive posting across a `BroadcastChannel`; this reuses the pattern proven in the Live Lyric Translator's PR #20 rather than re-discovering it. Warp is CSS `matrix3d` from a 4-point homography (standard 8-unknown linear system, unit square → 4 corners) — no WebGL in v1.

## The rename (2026-08-20) — and what deliberately did NOT get renamed

`projection-mapping` → **Muralista**: the GitHub repo (`github.com/jorgevallejos/muralista`, old URL
redirects), the vault folder (`projects/muralista/`), `.gitmodules`, the product name, and every
document across the vault. Executed 2026-08-20; the runbook it came from is deleted and its lesson
lives in `context/WAYS-OF-WORKING.md`, "Renaming: the dangerous hits are the invisible ones".

**Rename and website promotion were unbundled.** They used to wait on the same trigger. They no
longer do: the rename is **done**, and **promotion still waits on the room** — Muralista stays off
`changopepper.com/tramoya` until it has played an actual show, on the suite's published "real work"
rule, which is unchanged.

**Why the rename didn't wait for promotion.** It is also the path onto the website: the suite's rule
is that everything on that page has done real work, and Muralista is the one piece the rule excludes
— it has never played a room. The v1 design opened 2026-08-20 (see below) exists to play a room, and
that is what makes the project **active** rather than parked. The runbook's original argument for
waiting — *"no urgency in renaming something that isn't being promoted"* — was correct **while the
project was parked**. It stops being correct the moment the project is active: the v1 design doc
folded into this file is the first of what will be several documents, and every one written in the
old vocabulary is another line for a future sweep to catch, plus the permanent friction the runbook
itself warns about, where every document forever reads "Muralista (projection-mapping)." Bundling was
right for a parked project and wrong for a live one. **The trigger that changed is not the room; it
is the project waking up.**

**Visibility and licence, decided 2026-08-20.** The repo **stays private** — unlike Bombista and
Pregonero, which are both public MIT. It carries an **MIT `LICENSE`** anyway, matching its siblings:
a licence in a private repo costs nothing, states the intent that binds if the repo is ever shared,
and takes a decision off a later day's plate. Nothing tracked is sensitive — `mapper/media/` and
`*.mp4` are gitignored, so the cerdo master is not in the repo — which means visibility can be
reopened on any day, cheaply, with no disclosure to untangle first.

**Working title retired.** The tool was built as **Wall Mapper**. It is Muralista now — `<title>`,
the control-window heading, this file, and the README all say so.

### Do NOT rename these — decided 2026-08-20, do not re-open

| stays | why |
|---|---|
| the `mapper/` directory, and `mapper.html` / `mapper.js` / `mapper.css` | internal paths. Nobody says them out loud, and renaming them churns the README's run instructions and 83 KB of file for zero benefit |
| `STORAGE_KEY = "wallmapper.project.v1"` (`mapper.js`) | **this one can lose real work.** Every mapping Jorge has autosaved lives under this key. Renaming it to match the product name orphans all of them, silently — the same failure as Pregonero's bundle-ID change, wearing a different costume. There is a guard comment at the definition |
| `BroadcastChannel("mapper")` | pairs the control and output windows. Renaming it breaks the pairing for any window still open on the old name, for no gain |
| the export filename `wallmapper-project.json` | cosmetic, and import validates on `version`/`surfaces` rather than the name — safe either way, so not worth the churn |

The general lesson, now also in the runbook: **in any rename, grep the old name inside storage keys,
channel names and format identifiers *before* sweeping product names, and treat every hit as an
identifier to preserve rather than a string to update.**

## Staged plan

1. ✅ Ideation + framing (this doc).
2. **v1 prototype — "Wall Mapper", the retired working title (built):** standalone browser app, single-file-ish, control window + output window (BroadcastChannel), corner-pin quads, layers: cerdo video / AI-asset (alpha) / generative beat / test patterns, photo overlay for authoring, mapping saved as per-venue JSON. Built via Claude Code on the Mac (Fable coordinator + Sonnet crew) as four sequential slices: skeleton + sync, warp + calibration, layers, polish for the projector session. The commissioning spec is spent — see "Build spec, for the record" below.
3. Projector session: calibrate on real wall + boxes, deconstruct the cerdo animation across surfaces, drop in first AI asset. Debrief → decide v2.
4. Second projector as a separate zone.
5. ~~Integration with the lyric translator's clock/timeline (shared transport)~~ — **superseded
   2026-08-20:** the shared-transport problem is dissolved, not solved. Muralista emits a venue file;
   Pregonero reads and executes it; Pregonero owns the only clock on stage. Full reasoning: "V1 design
   (2026-08-20) → Architecture" below.
6. Stretch: mesh warp for curved forms; webcam auto-calibration.

### Build spec, for the record (2026-07-02, historical)

The commissioning kickoff for the v1 build (`claude-code-kickoff.md`) is spent — it was executed and
its content is folded in here rather than kept as a live document. What it recorded that isn't
captured elsewhere:

- **The mapping's data model as originally specified** (see "V1 design → The venue file" below for
  the shape it saved as, once built, and the room/night fields it needs to grow into).
- **Test gates, as literal questions asked at the projector** (results are in the Status log below;
  these are the criteria that were used):
  - **M1** (after warp + calibration): *does the pattern sit flush on the box?*
  - **M2** (after layers): *does the animation feel like it lives on the objects?*
  - **M3** (first AI asset + beat layer): *is the AI-asset pipeline worth developing?*
- **Guardrails**, now moot but recorded: spike discipline (plain JS, no framework, no npm, no tests,
  readable over clever since it might graduate); local git only, no pushes/PRs for v1 (later
  reversed — there is now a GitHub remote, `github.com/jorgevallejos/muralista`, which is **private**;
  see "Visibility and licence" above); don't touch the lyric-translator repo (superseded by the
  desk-tool architecture, which formalises the same boundary); Chrome as the target browser (alpha
  WebM, autoplay policies — still true).

## Assets

- Cerdo master (clean, no subtitles): `~/Chango Pepper/animations/tragedia-de-cerdo-asado/Tragedia de Cerdo Asado.mp4`
- Other cuts (big/small screen + subtitled) in the same folder; brand media in `~/Chango Pepper/assets/`.
- AI assets for the alpha layer: Jorge generates externally (no image-gen in Cowork); pipeline expects transparent PNG or alpha WebM (VP9 — use Chrome, Safari drops alpha).

## Hardware

Mac mini + 1 projector (translator live rig) + iPad. Second projector: used business projector (Epson/Optoma, 3000+ lumens, €100–250) when step 4 arrives.

**Two displays, settled 2026-08-22.** The Mac mini has **one HDMI port**, and Muralista needs two
outputs: the control window on the Samsung, the output window alone on the projector. The fix is a
second *output*, not a split of one. A **USB-C to HDMI adapter** (~€20, HDMI 2.0 / 4K60) carries the
Samsung; the projector takes the native HDMI port, because that is the cable that gets plugged and
unplugged at venues and it negotiates projector timings more predictably. Displays must be set to
**extended, not mirrored**, Samsung as main. **Never an HDMI splitter** — it mirrors, so the audience
sees the control panel — and never a switcher, which gives one display at a time. This closes the old
"check Mac mini chip for external-display count" note: every Mac mini supports at least two external
displays, so the chip does not matter for this.

**Projector mount: a mid-term purchase (Jorge, 2026-08-22).** Getting the beam above head height is
the primary fix for glare in the performer's eyes (see the studio session below). The studio has no
high fixing point, so until a mount exists, studio work runs with the projector low and Jorge out of
the beam, and venues are chosen for high shelves where possible.

**Calibration camera — chosen 2026-08-11: Elgato Facecam 4K** (~€200). Rationale: a camera only earns its place for Tier 2 (curved/3D) or the structured-light auto-calibration stretch; the M1–M3 field test passed and surfaced *software UX* (coarse placement/dragging, fixed in v2.1) as the bottleneck, not calibration accuracy. A premium webcam beats a compact camera here — clean UVC feed, lockable manual exposure/focus (stable frame for OpenCV), native monitor-clip + tripod thread — at a quarter of the price, and doubles as a content/Instagram cam. Rejected: Facecam Pro (pay for streamer DSP we'd bypass), Insta360 Link 2 (gimbal tracking counterproductive for a fixed calibration frame), compact cameras (ZV-1 II / PowerShot V1 — better image but €850+ and need a monitor clamp). **Gate still stands:** for real curved/3D work, prototype with iPhone/iPad **LiDAR** first before relying on the camera; on flat (Tier 1) surfaces no camera is needed at all (live corner-dragging).

## Ways of working

Same loop as the translator waves: Cowork (this file) holds PM state; **Claude Code on the Mac runs the build** — Fable as coordinator, Sonnet subagents as crew, Jorge tests at the projector between milestones. v1 is a **spike**: light process, no test suite required; graduate to TDD + PR flow only if it becomes a real app. Code lives in this folder. *(2026-08-20: it earned the repo — `github.com/jorgevallejos/muralista`, private remote in active use.)*

## v2 direction (decided with Jorge, 2026-07-02)

The AI-asset idea sharpened: not a static picture *beside* the video, but **AI animation that enriches the video** — overlaying the video surface (same corners = registered), spilling beyond it, or both. Jorge wants it *context-aware* (room sound/noise). Agreed decomposition (Fable's take, Jorge approved):

1. **Alpha-animation overlays (small):** alpha-WebM layers join the shared transport (today they autoplay independently); z-order via surface list order; copy-corners/duplicate-surface convenience for exact registration over a video surface.
2. **Parked 2026-08-22 — see "Context-awareness: parked" below before acting on this item.**
   **Context awareness = control logic, not generation (a weekend):** mic → Web Audio (level/onset/tempo) → parameters modulating layers live. The beat layer graduates from fixed BPM to sound-reactive. No AI at runtime. *(2026-08-20: the design survives, its home moved — this becomes a property declared in the venue file and executed by Pregonero, not live control logic running inside Muralista, which never runs during a show. Port uncosted. See "V1 design → Architecture" below.)*
3. **Asset banks + live selection (the real v2 design work):** AI generates variety offline (e.g. idle/agitated/dancing loops at 3 intensities), code selects/blends live from room input. Indistinguishable from "the AI hears the room", but deterministic and rehearsable. Needs a design pass with Jorge once 1+2 are demoable; converges with the lyric translator clock later (song/tempo/lyric position are context too).
4. **Live AI frame generation: explicitly out** — parked indefinitely (Mac-mini-unrealistic, uncontrollable on stage); the layer model can absorb it later without redesign.

Process for v2: still spike discipline (no test suite), but the **git repo is in active use** — every slice lands as a conventional commit (v1 history: `daf5583..1f653db`). **The GitHub remote is live: `github.com/jorgevallejos/muralista`** — v2 already shipped through it as PR #1. *(This line used to read "GitHub remote/PR flow deferred until this graduates"; it graduated, corrected 2026-08-20.)*

- 2026-07-02/03: **v2 workstreams 1+2 built** (three Sonnet slices, committed `976dd84`, `0d633cb`, `065c03f`), pending Jorge's test:
  - **v2.1 direct manipulation** — click-to-select in the preview, whole-surface drag, bigger handle hit targets, arrow keys move the whole surface by default (1–4 = corner, 0/Esc = back). Root cause of "dragging doesn't work": polygons were never clickable — an affordance gap, not a regression.
  - **v2.2 overlays** — alpha-WebM layers join the shared transport; list order = stacking order with ▲/▼ (fixed a real bug: reorders never re-sequenced the output DOM); ⧉ duplicate for exact overlay registration; `media/test-alpha.webm` fixture.
  - **v2.3 sound reactivity** — mic capture + 30Hz level/onset envelope in the control window, broadcast ephemerally; beat layer `mic` mode (breathes with level, rings on onsets); `micReactivity` slider fades video/image layers in with room loudness; graceful >1s stale decay; old mappings unaffected. Verified via CDP-driven headless Chrome (15/15 assertions) — note: `--virtual-time-budget` can't drive rAF/canvas checks, CDP real-time can.
  - **Workstream 3 (asset banks) not built** — needs a design pass with Jorge. Groundwork captured by the v2.3 crew: onset stream implicitly carries tempo (inter-onset median); bank state transitions should key off the smoothed level with hysteresis; the "shared output loop + opt-in entry field" pattern and src-swap-through-reconciler are the intended mechanism for a future `bank` layer type.
- **v2's desk/projector testing, folded into the 2026-08-20 projector session:** the desk/projector testing of v2.1–v2.3 that had been owed since July was not done as a standalone step. It runs as half of the 2026-08-20 projector session, alongside hand-faking the new subtractive layout — desk testing first (mic checks per README's Sound-reactivity section), then projector with overlay + mic beside cerdo; the asset-bank design conversation and any GitHub/PR graduation decision wait behind that.
- Priority note (2026-07-02, historical): runs **behind** song registration + venue visits that week; the Fable-window deadline (7 July) was the reason it was active at all. Superseded — see current-priorities.md for the live priority read.

## Build history

- 2026-07-02: project opened; spec + kickoff prompt written.
- 2026-07-02 (later): **v1 built** (then called Wall Mapper) — all 4 slices done via Claude Code (Fable coordinator + Sonnet crew), committed to local git (`a1fc6b7`). App lives in `mapper/`; run instructions in `README.md`. Cerdo master copied to `mapper/media/cerdo.mp4`. Homography math verified numerically; browser sanity pass clean (headless Chrome, no console errors). Known limits noted in README: `python3 -m http.server` lacks Range support (video seek may be sluggish — `npx http-server` as alternative); alpha WebM Chrome-only.
- 2026-07-02 (evening): **desk smoke test passed — all 6 steps** (sync, keystone warp, corner nudge, video transport during calibration, export/import). Two fixes landed on the way: silent output-window failures now alert/focus (`def3b62`), and a real bug — CSS `display` on `.control-root` overrode the `hidden` attribute, so the output window showed the control skeleton and the actual output rendered below the fold (`a3fee99`). Lesson for the crew: headless checks must verify what's *painted* (screenshots/computed style), not DOM attributes. `mapper/_smoke.html` is a committed two-iframe harness that visually regression-checks sync + keystone in one screenshot.
- 2026-07-02 (night): **projector session done — M1, M2, M3 all pass** (gate questions: does the pattern sit flush on the box? does the animation feel like it lives on the objects? is the AI-asset pipeline worth developing?). Pattern sits flush on a real box via arrow-key nudge; cerdo across multiple surfaces with working transport; image-with-alpha compositing works at the wall (tested with a placeholder transparent PNG, `media/test-pig.png`). Fixes from the session: media layers that are missing/broken now show a visible failure note on the output instead of black-on-black (`4bb30fc`); source-field placeholder now reads `e.g. …` so it can't be mistaken for a linked file (`1f653db`).
- **UX finding from live use:** arrow-key nudge is right for precision but too slow for coarse placement; Jorge expects to drag whole surfaces and corners directly in the preview and reports dragging "doesn't work" — v2.1 investigates + adds direct manipulation (click-to-select in preview, whole-surface drag).
- **2026-08-11: calibration camera decided — Elgato Facecam 4K.** Full rationale in the Hardware section above. Not a v1 dependency (Tier 1 needs no camera); it's for the Tier 2 / structured-light auto-cal path and doubles as a content cam.
- **2026-08-20: Muralista v1 design session (Cowork).** New goal, new architecture — no longer gated on the Q4 animation project. Full design and decisions: see **"V1 design (2026-08-20)"** below.
- **2026-08-22: v2.4 — live camera backdrop, and direct manipulation actually fixed.** Two things, one pass. The camera backdrop turns a webcam beside the projector lens into a rectified authoring surface (see "Live camera backdrop" below). The direct-manipulation fix closes the July v2.1 entry above, which had never worked: see "The v2.1 drag bug" below. Project schema bumped to **2**; v1 files still open.
- **2026-08-23: the sound-reactive layer is gone and the stale output window is impossible.** Both
  items queued on 22/08, executed and merged. The mic removal is preserved at the tag
  **`mic-reactivity-archive`** (`ada25da`, the last commit before removal, pushed to origin), landed
  as three commits squashed into one PR: the code removal, a **schema bump to v3** dropping
  `micReactivity` and coercing `beatMode: "mic"` back to `"bpm"`, and the README correction. 429
  deletions, 45 insertions. The cache-bust is **PR #3, `94d975f`** on muralista's main; umbrella
  pointer at **`e40907b`**. Verification for both ran in a real headed Chrome driven over CDP, after
  the in-app browser was found to fire rAF once in 1.5s — the exact trap that produced the v2.1 drag
  bug, caught this time before it certified anything.
- **2026-08-23: v1 scope decided in a Cowork design session.** Studio-only, a strip list, and the
  shape behaviour spec. See **"V1 scope and shape behaviour (2026-08-23)"** below.
- **2026-08-23: the text layer.** PR #8, squash-merged as `7e0d66b`; umbrella `86249d7`. **Schema
  v6.** Size is stored as a fraction of the shape's height, and the architecture did most of the
  work: every surface already draws into a fixed 1000×1000 box that `matrix3d` maps onto four
  corners, so measuring the fit *there* is measuring a fraction of the quad — **containment is
  structural rather than a rule to be kept**, and a quad redrawn in a new room rescales its text with
  no refit at all. Auto-fit binary-searches down from the slider's ceiling; word-boundary wrap,
  embedded newlines, a 6% inset, real DOM text, transparent background, stroke behind fill plus a
  slight shadow. `role` is `"lyrics"` or `"static"` and nothing else. Hostile imports clamp
  (`role:"karaoke"`, `maxSize:-9`, a `javascript:` colour all fall back to defaults). Verified
  against painted pixels: the 81-character Tragedia line fits at five quad shapes, and a quad
  redrawn to 0.4788 of its height painted text at 0.4787 of its height with the stored `maxSize`
  untouched — which is the fraction-not-pixels decision proving itself.
  **Three limits, reported rather than buried:** auto-fit has an **8px floor where text overflows
  visibly rather than clipping silently** (loud over silent, because silent clipping is the exact
  surtitle failure this layer exists to prevent; reached past ~40,000 characters, about 316× the
  catalogue's worst case). **Legibility was judged on a monitor** — stroke weight, shadow and "how
  big is big enough" are what a desk cannot stand in for. And the narrow-quad result is a limit, not
  a pass: see "Text inherits the stretch" below.
- **2026-08-23 (evening): the studio session that proved both unverifiable features.** Eleven hand
  checks, all passed — the four optical checks on the shadow suggestion and the seven on the media
  folder, including the one nothing else could answer: quit Chrome entirely, reopen, and the chosen
  folder comes back. Two features that no harness on the build machine could reach are now known
  good at a real wall with a real projector.
- **2026-08-23: media lives where the user keeps it.** PR #7, squash-merged as `46c0ca3`; umbrella
  `2077bdc`. Also `fd9abcb` (PR #6) earlier the same day, making the keep-out margin mean the growth
  rather than half of it, since SVG centres a stroke on its path. All three media calls hold:
  `PROJECT_VERSION` stays **5** because a folder handle is not a schema fact, the output window opens
  no database and raises no dialog, and the served-path fallback keeps a denied permission a degraded
  mode. Object URLs are revoked in one place, keyed by name, so two surfaces sharing a clip cannot
  pull it from under each other. One change made beyond the brief and approved after the fact: with a
  folder connected, "Pick file…" writes a **bare filename** instead of `media/<name>`, because the
  old prefix would emit a name that cannot resolve from the folder it was just picked from. **Two
  ceilings, stated rather than papered over:** `showDirectoryPicker` opens an OS dialog no harness
  can drive, and autoplay could not be confirmed because the automation pane always reports itself
  hidden, so transport-through-a-blob-URL is hand-untested. Both belong to the studio checklist.
- **2026-08-23: the keep-out polygon shipped, and its suggestion has never seen a wall.** PR #5,
  squash-merged as `e465a7e`. **Schema v5**: `keepOuts` is its own top-level array — no layer, no
  z-order, no four-corner constraint, and no surface machinery reaching it. All three preview hit
  layers (body, edges, points) go through `beginPreviewDrag()`, so the v2.1 drag bug cannot recur
  here. Margin is an SVG stroke rather than computed geometry, and **SVG centres a stroke on its
  path, so the shape grows outward by half the slider's value** (see the follow-up below). The
  shadow suggestion's difference is **signed — only pixels that got darker count** — which discards
  most of what auto-exposure does when a body walks into a bright frame, for free. Countdown seconds
  and threshold are control-local and deliberately **not persisted**: they describe one room's light,
  not the venue's geometry, so they would be wrong inside the file this tool exists to produce.
  Verified at 100 assertions in real headed Chrome, including dilation checked against Chrome's own
  `isPointInStroke` around a deliberately thin spur. **What is not proven: the optical loop.** The
  build machine has no video input device at all, so `getUserMedia` was handed a canvas
  `MediaStream`; everything downstream is the shipping path, and the traced ring landed within 0.003
  of the homography-mapped figure in output space, which proves it stores output coordinates rather
  than raw camera ones. See "The four things only a wall can answer" below. The README says plainly
  that the suggestion has never run against a real wall, so the doc does not out-claim the code.
- **2026-08-23: strip pass done — the beat layer is gone.** Merged as `14ec208` (PR #4,
  `refactor(mapper)!: remove the beat layer`); umbrella pointer `2b766b9`. Out: the beat layer, its
  renderer and canvas, `beatMode`, `bpm` in all four default-layer constructions, the whole
  beat-anchor mechanism, and `mapper/_smoke.html`. **Schema v4**: `migrateProject()` coerces a `beat`
  layer to `pattern` and deletes `bpm`/`beatMode`, so a migrated project announces the change with a
  visible test pattern rather than a blank surface. Net −208 lines in `mapper.js` plus the 33-line
  harness. **The beat anchor turned out to be dead code** — `beatAnchorT0` was read only by
  `beatPhase()`, called only by `drawBeatFrame()` — and the hint text claiming overlays "start on the
  same downbeat" was loose prose, not a dependency: alpha WebMs ride `registeredVideoEls` and
  `transportPlaying` exactly like video layers. Investigated and reported rather than assumed, which
  is the correct handling of an ambiguous deletion.

## V1 design (2026-08-20)

Opened 2026-08-20 in a Cowork design session. Supersedes the "parked until the Q4 animation project
is defined" framing above — that blocker no longer gates the project. This session also **answered
Venue Turn open question 2** (who renders on stage, whose clock — `context/tramoya/venue-turn.md`
§2.6) and took a position on that thread's questions 1 and 3. It does not reopen anything in
`context/tramoya/README.md`.

### The goal, in Jorge's words

> Release a first version of Muralista usable in concerts in little places. Rather than bringing the
> canvas — or in addition to it — the projector points at the *whole* background where he sings,
> including him. Then decide what goes where: animation, lyrics, and black spaces such as his own
> shape.

Two things in that sentence change the project: the frame (below) and the architecture (further
below).

### Frame change: additive → subtractive

Muralista before this session was **additive**. You add quads; each quad is a corner-pinned surface
carrying a layer; everything outside the quads is black by default. Black is the absence of a
decision.

What Jorge describes is the inverse. The projector **floods the whole background**, and the mapping
is a **layout of that flood** — including which parts of it stay dark. Black becomes a decision, and
therefore an object. **This makes negative space a first-class primitive, which the tool had no
concept of before.**

**The keep-out is the new primitive.** Named in the Venue Turn as §2.3 and confirmed as a v1
requirement: a **keep-out region** the projector paints dark. Its first job is the performer.

**However you draw one, trace the performer's *shadow*, never the performer** — see "The shadow is
the keep-out, and it costs nothing to measure" below, and the same rule stated in `README.md` under
"Keep-outs and the shadow rule". This holds for a photo backdrop and for the live camera backdrop
alike, and it is the reason the camera backdrop's accuracy limit costs nothing in practice.

**Decided: a static performer keep-out box for v1, not camera tracking.** A polygon in the venue file
that the renderer keeps black, and a rehearsal discipline — Jorge commits to staying roughly inside
it. It is deterministic, rehearsable, needs no camera, and works tonight. Camera silhouette tracking
(the Facecam's eventual job) is explicitly **out of v1** — it is a low-light stage, mid-song, with a
performer inside the beam, and a mask that flickers is worse than no mask. The static box is not a
compromise waiting to be upgraded; it is the correct answer for a small room, and it stays correct.

Keep-outs generalise past the performer, and cheaply: the doorway, the window, the bright painting the
owner will not let you take down, the mirror behind the bar. In a café that list is most of the setup
work, and no tool in the suite could express it before.

### Architecture: a desk tool, not a stage tool

Jorge's answer, and it is a **fourth shape** that neither branch of Venue Turn §2.6 anticipated:

> Muralista does the work *before*, like Bombista, and delivers a configuration file which Pregonero
> reads and executes.

Both shapes Venue Turn §2.6 offered assumed one renderer swallowing the other — A had Muralista
rendering with Pregonero as a source, B had Pregonero painting into a surface Muralista warped.
Jorge's cut is along a different axis entirely, and it is the one the suite already uses. Why it is
the better shape, not merely a third option:

- **It restates the suite's existing law rather than inventing one.** Bombista prepares a file;
  Pregonero presents what the file says. Muralista prepares a file; Pregonero presents what the file
  says. The rule that already governs the suite now governs the room too — no exception needed.
- **It preserves Pregonero's stated role verbatim** — *"present what the files say"* (Venue Turn §1).
  Under shape A that role would have been demoted to "be a texture."
- **It answers "whose clock" by dissolving the question.** There is one renderer on stage, so there
  is one clock, and it is Pregonero's. Nothing has to be synchronised because nothing else is
  running. Two live renderers sharing a transport was the hardest engineering in either branch of
  §2.6 and this deletes it rather than solving it.
- **It keeps the format-ownership rule intact.** Venue Turn §2.5: *exactly one tool may write each
  file; everyone else proposes.* Muralista writes the venue file. Pregonero reads it and writes
  nothing. No ambiguity to litigate later.
- **It matches when the work actually happens.** Mapping a room is setup work — done once, at the
  venue, before doors, with the projector on and nobody watching. That is a desk tool's shift, not a
  stage tool's. The tool that does it should be allowed to be slow, fiddly and ugly.

**Recorded as the answer to Venue Turn open question 2.** Pregonero renders on stage; Pregonero owns
the clock; Muralista never runs during a show.

**What Muralista becomes:** an **authoring tool for a room**. Its output window stops being a
performance surface and becomes a **calibration surface** — you drive it at the venue, projector on,
to place the field, the regions and the keep-outs. Then you export. Then you close it, and it takes
no part in the evening. That is precisely Bombista's shape, one level up: run before, produce a file,
get out of the way.

**What this costs — said out loud.** The runtime half of v2 is now on the wrong side of the tool
boundary. Muralista's shared transport, beat layers and the whole 2026-07-03 mic-reactivity slice
(`065c03f`) were built for a Muralista that runs *during* the show. Under this shape, Muralista does
not run during the show. That work is **relocated, not wasted**: "this layer breathes with room
loudness" stops being a live behaviour Muralista performs and becomes a **declared property in the
venue file that Pregonero executes**. The design survives intact. The code is on the wrong side of
the line, and porting it is real work that has not been costed — the largest hidden cost of the shape,
and it should not be discovered in September. **Second cost: Pregonero grows.** To execute the file it
must learn to render into arbitrary warped quads and to hold regions dark. Pregonero is
feature-complete and well tested — a good place to be careful about how far this actually has
to go for v1, which is less far than it sounds (see "Staged build" below).

### The venue file

This is the Venue Turn's **venue file**, and it now has an owner and a consumer. It half-exists
already: Muralista saves its mapping as per-venue JSON today.

Applying the Venue Turn's own test — *what invalidates this field: a different song, a different
room, or a different night?*

| holds | lifetime |
|---|---|
| the **field** — the outer quad of usable background in projector space | room |
| **regions** — named quads inside the field, each with corner-pins | room |
| **keep-outs** — the performer box, the doorway, the window | room |
| projector position, throw notes, ambient light | room |
| **which region carries lyrics tonight** | night |
| **which animation on which region for which song** | night |

The last two rows are **show** data, not venue data, and by the Venue Turn's own test they belong in
a third file. **Decision for v1: fuse them anyway, in the venue file, and let a second gig prove it
wrong.** Venue Turn §2.1 explicitly offers this, and §2.7 insists on it — *do not design the format,
earn it.* SP JSON was a name for what already existed; the venue file gets the same treatment. Play
two rooms, write the file by hand both times, and let the fields that need to differ between rooms
declare themselves. Splitting it before that is guessing. **Do not name the file's format yet.**
Venue Turn §7 already parked naming until the artifacts exist, and it is right — "venue file" is a
description, not a name.

**The mapping's shape as built (v1/v2), before it grows the field/regions/keep-outs above:**

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

Corners are normalized (0–1) output-space coordinates. The venue file is this shape extended with a
`field`, named `regions`, and `keepOuts` — not a redesign.

### Staged build: the parallel track

**Decided 2026-08-20 — this is the current plan.** Muralista v1 runs as a **parallel track** and does
**not touch Pregonero at all**. It renders its own sample lyrics and animation in the studio, good
enough to make layout decisions — **decision-grade, not show-grade**. Lyrics come from reading an **SP
JSON timeline** against the transport the app already has, so the layout is tested against real line
lengths and real density rather than flattering fake text. Consolidation back into Pregonero happens
later, on the trigger recorded as the last item under "Open questions — architecture" below (the day
Muralista's output points at an audience).

**What this replaced, and why.** The plan first written down the same session put the first work
*into Pregonero* instead: three keys — a projection transform plus a mask, reading the field, one
lyric region and the keep-outs from the venue file, with animation regions declared in the file but
ignored by the reader until v2. That optimised for the smallest build, while ignoring the smallest
**risk to the tool that already plays rooms**, with gigs coming — touching Pregonero at all before
Muralista's value is proven. Jorge corrected it in the same session. The scoping itself is preserved
below, because it remains the right shape for *when* consolidation happens — it no longer describes
what gets built now.

**The eventual Pregonero reader (deferred until the consolidation trigger fires).** The temptation is
to build the whole picture at once — field, regions, animation, lyrics, keep-outs, mic reactivity —
but that is a Q4 project and would not see a café this year. The recommendation, for when the day
comes: stage the *file*, not the tool. Muralista would already author the complete venue file from
day one; Pregonero would implement only three keys at first — the field (letterbox the output to the
usable background quad), one lyric region (render the existing surtitles into an arbitrary warped
quad instead of a centered rectangle), and the keep-outs (hold those polygons black). That is not a
compositing engine, just a projection transform on a renderer that already works, plus a mask.
Animation regions would be declared in the file and ignored by the reader until v2 — the cheapest way
to keep the format honest while shipping something. What it would buy: the thing Jorge asked for,
minus animation, in a small room. What it would defer: animation in the mapped field, which for the
first rooms either sits out or runs from Muralista as it does today, in a separate moment of the set.

**The legibility constraint carries over unchanged, whenever this reaches Pregonero.** Pregonero's
projection window is audience-facing, read from the back of a dark room. The suite's standing note
holds: this is the **one surface where "contrast is a budget" is the wrong logic**
(`context/tramoya/README.md`). Warping lyrics into a quad must not cost legibility — a keystoned quad
resamples the text, and small type resampled at an angle is exactly where surtitles fail. Acceptance
for the lyric-region work, when it happens, is visual, at a wall, in low light.

### Open questions — architecture

Decided by thinking, not by looking (contrast "Open questions — the room" below).

1. ~~**Animation in v1 or not?**~~ **ANSWERED 2026-08-23: v1 is studio-only.** Jorge: Muralista will
   not be used for the coming concerts. Three consequences, all pointing the same way: the Pregonero
   legibility work loses its deadline and gets to be done properly; the consolidation trigger (the day
   Muralista's output points at an audience) stays far off, so the deliberately-bad borrowed renderer
   is a **stable** state rather than a temporary one; and the two per-room questions below — how long
   a first mapping takes, and what walks through the beam — go dormant for want of a room. Nothing
   external pulls against the shapes-first order.
2. **Does the venue file own audio** (volume, speaker position, room baseline)? Venue Turn question 3,
   still open. The prior: leave it on paper for v1.
3. **How is the field measured** without a camera? **Largely answered 2026-08-22:** with a camera
   mounted beside the projector lens, photographing a plain white field. The lit rectangle's edge is
   the field. See "Studio session (2026-08-22)" below. What remains open is whether this survives a
   venue where the camera cannot be rigged next to the lens. Original framing, kept because it names
   the constraint: live corner-dragging works for a region; the outer field is bigger than the eye
   can judge from behind the projector; the keep-out has to be judged from inside the beam.
4. **Does this redraw the scope of the proposed Bombista-orchestrator direction**
   (`projects/bombista/project-context.md`, "Proposed direction") before 7 September? Venue Turn
   question 4, unchanged and still worth looking at first.
5. **Where does the ported mic/beat behaviour land** in Pregonero, and when? The hidden cost flagged
   under "Architecture" above. Pushed further out by the parallel track — nothing moves into Pregonero
   until Muralista's value is proven.
6. **When does the borrowed execution go back?** The parallel track has Muralista temporarily
   duplicating enough of Pregonero's lyric rendering to make layout decisions. Duplicated execution
   has a way of becoming permanent. **The trigger, written down so the answer arrives as evidence
   rather than as drift: the day Muralista's output points at an audience.** Until then its renderer
   stays deliberately un-invested-in — no cues, no pedal, no timing model, no translations. Its
   inability to run a real song is a feature. And note the honest possibility: if that renderer turns
   out *good*, that is real evidence for the shape Venue Turn §2.6 did not pick — Muralista renders,
   Pregonero becomes a source — not merely a temptation to resist.

### Open questions — the room

Decided by pointing a projector at a wall and looking, not by reasoning. **None of these should be
answered at the desk.** They are what the first studio session and the first café are *for*, ordered
by how much they could change the plan.

1. **The pixel-and-brightness budget.** Flooding the wall is not free: the same projector over twice
   the area is a quarter of the light per square metre and a proportional cut in pixels for any given
   region. If Pregonero today gives lyrics the full width of the throw, a 1.2 m lyric region on a 4 m
   flooded wall gives them roughly a third of that — while also proposing to do this in cafés with the
   lights on. **This one is arithmetic and can be done before any code is written.** It is the finding
   most likely to send the plan back to the canvas or to a second projector.
2. **Canvas in or out? ANSWERED 2026-08-22 — in, and not close.** See "Studio session (2026-08-22)"
   below. The reasoning that follows was written before the wall was looked at, and the wall agreed
   with it. *"Rather than my canvas, or in addition to it"* left this open, and the two
   are different projects. The canvas is white, flat, known geometry and bright; a café wall is none
   of those. If the canvas stays, the field has two quality zones and the layout falls out of the
   physics — lyrics on the canvas where the pixels and contrast are, animation spilling onto the wall
   where atmosphere is enough. That is the more robust design.
3. **How long does mapping an unfamiliar room take?** **First measurement, 2026-08-23: no more than
   five minutes** — against a café budget of 30–45. Read it honestly: that is a *known* room, with
   the camera already mounted above the lens and the projector where it always sits, so it is a
   floor rather than the venue number. What it does settle is that **the software loop is not the
   bottleneck**, which is what this question was really asking. What will dominate an unfamiliar
   room is physical: finding a projector position and rigging the camera beside the lens. That makes
   a bracket holding camera and projector together as one unit the highest-value setup-time purchase
   after the mount itself. A café gives 30–45 minutes with the lights up
   and someone stacking chairs. The venue file solves the *second* visit; nothing solves the first. If
   the first pass takes an hour, Muralista is unusable however good it is. **This is the failure mode
   that most often kills tools like this — not the capability, the clock.** Worth setting as a hard
   budget and designing against, rather than measuring once and being disappointed.
4. **Does multi-region animation content exist?** You cannot decide where animation goes without
   animation that can be in more than one place. Cerdo is one 16:9 video. Deconstructing it across
   surfaces is an *animation production* job, not a tool job, and it is the real long pole. The
   "define the Q4 animation project" gate is superseded as a blocker on **building** the tool; it is
   not superseded as a blocker on **testing** it.
5. **Can Jorge see the lyrics?** They are on the wall behind him, so he is the only person in the room
   who cannot read them. If he relies on them at all — his own cueing, knowing which translation is up
   — the iPad may need to become a confidence monitor. The studio session answers this in the first
   five minutes and it costs nothing to check.
6. **What walks through the beam?** In a café people stand up and move; in a living room the audience
   may be sitting *inside* the throw. A shadow across the lyric region has no software fix — it is a
   "keep this corridor clear" note for the venue file. **Not testable in an empty studio**; this one
   needs a room with people in it.

Two more, noted and not worried about yet: **what colour and texture the wall is** (a per-region
contrast note may become a venue-file field), and **what the fallback is** when the projector does not
reach or the laptop dies mid-set.

**Where the answers go.** Items 1, 2 and 4 above are answered once and belong here. Items 3, 5, 6 and
the wall's colour are *per-room* facts, answered every gig — their home is
`context/concerts/_template/`, whose checklist already collects ambient light. The first café should
answer them by being played, not by being reasoned about.

## Studio session (2026-08-22) — first look at a real wall since the design change

Half a session, run in the garden studio with the Elgato mounted beside the projector lens and
Muralista itself never opened. Nothing was mapped: the Mac mini could not drive the projector (see
Hardware). What it produced is answers to questions the design doc said could only be answered by
pointing a projector at a wall, plus one method that was not anticipated at all.

### The shadow is the keep-out, and it costs nothing to measure

**The finding: draw a keep-out around the performer's *shadow*, never around the performer.**

Jorge's plan was to photograph the wall from beside the projector lens and map on the photo. The
camera and the projector do not sit in the same place, so they disagree about where a person is. In
the studio, with the camera as close to the lens as it would physically go, the gap between Jorge in
the frame and Jorge's shadow on the whiteboard was around two thirds of a head width, call it 12 to
15cm on the wall. A keep-out traced around his body would have painted black onto empty whiteboard
and left the beam on half his face.

The shadow has no such error, and cannot. It is by construction the exact set of projector pixels the
body blocks: the projector drew it. And because the shadow lands on the wall, which is flat, the
camera's view of it maps to the projector's view by the same homography every quad already uses. So
the correction is free and exact, and **no measurement of the camera-to-lens offset is needed** —
which was the thing Jorge offered to go and measure.

Caveat that belongs with it: draw the shape **generously larger than the shadow**. A mask that is
exactly the outline lets light onto the face on every lean, and a performer sways. This is the
rehearsal discipline the static-box decision already assumed, now with a reason attached.

### Eye comfort is the driver, and software cannot finish the job

The design doc frames the performer keep-out as composition, keeping the chorus off Jorge's face.
Jorge corrected that on 2026-08-22: **the primary job is his eyes.** Standing in the beam is
physically unpleasant and he will not do it for a whole set.

That reframing has a consequence the doc did not carry. **A projector showing black is not switched
off; it is showing dim grey light.** A keep-out therefore reduces glare substantially and never
eliminates it, and it does nothing at all about looking toward the lens, which is the brightest
object in any room Muralista will ever run in. So:

- **Geometry is the primary fix, software is secondary.** Getting the beam to pass above or beside
  the performer solves it completely and permanently. A keep-out is what you use when the room will
  not let you do that, which in small venues will be often.
- **This is a better argument for the tool than the artistic one.** Placing a projector high or off
  to one side lands the image crooked, and correcting a crooked image is exactly what Muralista does.
  The warp is what buys the freedom to put the projector where it is comfortable rather than where it
  is convenient. Worth carrying into how the project is described.

Jorge's position, 2026-08-22: a **projector mount is a mid-term purchase**; the studio has no high
fixing point, so studio work continues with the projector low and himself out of the beam.

### Room question 2 answered: the canvas stays in, and it is not close

Projected onto the studio's back wall, the same throw is brilliant on the whiteboard and **almost
invisible on the wooden planks beside it**. Not a marginal difference, an obvious one, visible in a
single photograph. The wall is warm orange-brown with horizontal plank seams that read straight
through the image.

So the layout falls out of the physics exactly as the doc predicted it might: **anything that has to
be read goes on the white surface; the wood carries atmosphere only.** The field has two quality
zones, and pretending otherwise will cost legibility rather than buy coverage.

Not yet answered: room question 1, the pixel-and-brightness budget, still has no arithmetic behind
it. The studio was flooded with daylight through the roof gable throughout, so nothing measured there
today would have been honest anyway. **Blackout is a precondition for that measurement.** *(Jorge,
2026-08-23: blackout comes with the testing in the coming days or weeks; the current focus is
functionality.)*

### Architecture question 3, partly answered: a photo taken beside the lens is worth drawing on

The README's dismissal of photos is right about phones and wrong about this. Bolted next to the
projector lens, a camera gives a planning image close enough to the projector's own view that quads
drawn on it land roughly right. It does not remove live corner-dragging, it removes the coarse half
of it.

**The capture that makes it work: project a plain white field and photograph the room with the
performer in place.** One image then carries both unknowns at once. The edge of the lit rectangle is
the field made visible, which is precisely what cannot be judged from behind the projector, and the
silhouette inside it is the keep-out. Neither requires a measurement.

Reference photo from this session: `room-reference-2026-08-22`, saved to Jorge's `~/Documents`. Its
one flaw is that the projector was showing its "no signal" screen rather than plain white, so the
acer logo sits in the middle of the field.

### A trap for anyone using Photo Booth as the capture tool

**Photo Booth mirrors its live preview on purpose**, the way a mirror does. Text projected on the
wall reads backwards in the window and this means nothing. Half an hour went into chasing it as a
projector fault before the obvious test settled it: *read the wall with your own eyes.* The projector
was fine. `Edit → Auto Flip New Items` also exists and its behaviour was never pinned down, so if a
saved photo ever does come back reversed, that is the switch.

Also set during the session, worth keeping: `Camera → Automatic Camera Selection` **off**, or a
nearby iPhone will take over the feed mid-capture.

### Faked assets, already in place

`mapper/media/` gained three files for the hand-faked subtractive test, since the tool has neither a
dark-region primitive nor a text layer:

- `keepout-black.png` — solid black, the stand-in keep-out, used as an image layer moved to the top
  of the list
- `lyric-01.png`, `lyric-02.png` — real Libertad lines, Spanish over English
- `lyric-worstcase.png` — the longest entry in the whole catalogue, from Tragedia, 81 characters and
  four text lines at once. **Legibility should be judged against this one, not the short ones.**

Worth noting for whenever the lyric region reaches Pregonero: the catalogue's lyric entries are not
all one line. Some carry an embedded newline and render as two. Any region sized against a single
line will clip them.

## Live camera backdrop (built 2026-08-22, v2.4)

The studio session above concluded that a photo taken beside the lens is worth drawing on. This is
that finding built, with the photo taken out of the loop.

**What it does.** `Backdrop → Source → Live camera` shows a webcam feed under the surface outlines,
in place of `project.photo`, at the same reduced opacity. A one-time calibration marks the corners of
the projector's lit rectangle *as the camera sees them*; from then on the feed is warped so that
rectangle fills the preview. Drag a quad and the real wall updates underneath it.

**Why it needed no new machinery.** It is the surface warp pointed the other way. A surface maps a
square of content **onto** a quad in output space; the camera backdrop maps a quad in **camera**
space onto the whole frame. Same `computeHomography`, same `matrix3d`, ~15 lines of new math. The
one thing that differs: the surface warp is built in the SVG's fixed 1600×900 viewBox and scales for
free, while the camera's is built in real stage pixels, so it is rebuilt by a `ResizeObserver`.

**The "show white" helper** exists for step one of calibration: the lit rectangle can only be marked
if the projector is lighting something, and a "no signal" screen is not a rectangle of known shape.
A button on the control window raises a full white plate on the output. It **covers** the surfaces
rather than replacing them, so dropping it leaves everything as it was, still playing. This is the
only change made to the output render path. (The standalone `mapper/white.html` from the studio
session still exists and still works — it is the version you use when Muralista is not open at all.)

**Authoring only, same rule as `project.photo`.** The `<video>` lives inside `control-root`; the
`MediaStream` is never serialized. `cameraDeviceId` and `cameraQuad` do ride along in the broadcast
state exactly as `photo` does, and nothing on the output side reads them. Verified: the output role
has zero video elements.

### The accuracy limit, and why the shadow rule dissolves it

After calibration the mapping is **exact for anything on the wall plane** — a plane-to-plane
projective map is precisely what a homography is. Anything standing **out** from the wall appears
displaced, by an amount that grows with its distance from the wall, because the camera and the lens
do not stand in the same place and genuinely disagree about where such a thing is. **No fixed
correction removes this**, and offering one would be a lie: the error depends on depth, which a
single camera does not know.

This sounds worse than it is, because the one object anybody wants to trace — the performer — has a
shadow, and **the shadow is on the wall plane**. Trace the shadow and the error is not corrected, it
never arises. This is stated in `README.md` under "Keep-outs and the shadow rule", next to the
keep-out primitive above, and in a comment on the camera section in `mapper.js`, because it is the
kind of thing that gets rediscovered expensively.

### Schema v2

`project` gained `backdropMode`, `cameraDeviceId` and `cameraQuad`, and `version` went to 2.
`migrateProject()` runs on load **and** on import, filling the new fields with the values that
describe what a v1 project already was, so every autosave and every exported venue JSON still opens.
**`STORAGE_KEY` is untouched** — its `.v1` suffix is part of an address, not a schema version, and
the "Do NOT rename these" table above still governs it.

### First real use, the same evening — and the number that justifies the feature

Mapped in the studio within minutes of the build landing: calibrate once against a white field, then
drag a quad onto the whiteboard while watching the live feed. **The whole afternoon had been a
workaround for not having this.**

**The measurement worth keeping.** The morning's method was a photograph of the wall, its projected
field found by differencing a white frame against a black one, then perspective-corrected into a
1280×800 backdrop. Careful, automatic, and **three percent out** — enough that the video overhung
the whiteboard's right edge. Jorge's hand calibration, done by eye against the wall, was right.

The lesson is not that the photo method was bad; it was accurate to its own inputs. It is that
**a measurement taken once and applied blind cannot beat a loop that closes against the thing
itself.** Any future accuracy work belongs in making the loop tighter, not in measuring harder.

### The loop is the product (Jorge, 2026-08-23)

**"The killer feature is being able to adjust shapes while looking at them on the wall."** Stated as
the project's thesis, not a feature, because it explains the numbers: the three-percent error above,
and the five-minute mapping below.

And it is sharper than "drag while watching the wall", which any mapping tool allows. **Muralista
puts the wall inside the control window, rectified, as the projector sees it** — so the person
authoring does not need to be able to see the wall from where they are standing, and the shape lands
where it was dragged.

Three consequences that should govern future work:

- **It is the test for every new feature: does this keep the loop closed?** Anything that computes a
  correction and applies it blind is suspect however clever. It is why the shadow suggestion is
  allowed to be crude, and why text size is a live slider rather than a typed number. Modal wizards
  should be viewed with suspicion.
- **It is the honest one-sentence pitch**, alongside the venue file. The venue file is the
  architectural difference from TouchDesigner; the loop is the felt one. *(Jorge, 2026-08-23: the
  TouchDesigner relationship gets its own conversation later — do not resolve it here.)*
- **It promotes the camera from accessory to instrument.** The loop only exists while a camera sits
  beside the lens, so the rig is on the critical path for setup in an unfamiliar room. The Facecam
  was bought as a stretch-goal calibration tool that doubles as a content cam; it is neither now.

### The studio rig, as measured 2026-08-22

Durable because the room is the rehearsal room and none of it moves. Re-measure only if the
projector or the camera is repositioned.

| | |
|---|---|
| projector | Acer, **1280 × 800**, projection mode **Front** (verified by reading the wall, not the camera) |
| camera | Elgato Facecam 4K, mounted directly above the projector lens |
| Mac mini → two displays | projector on the native HDMI port, Samsung on a USB-C adapter, **extended** |
| whiteboard, in projector-frame coordinates | **x 41%–81%, y 15%–71%** — about a fifth of the frame |
| everything outside it | wood, which shows the same light so faintly it reads as unlit |

**About four fifths of the projector's output lands where it does not show.** That is the pixel and
brightness budget from "Open questions — the room" item 1, answered by measurement rather than
arithmetic. It is also the strongest argument for either zooming the throw down onto the board or
accepting that the wood carries atmosphere only.

Not found: an ECO or lamp-power setting. The projector's menu is the simplified one (Installation
holds Projection, Keystone, Digital zoom out, Image shift, Language, Reset) with no Management tab.
**ECO remains unresolved** — the remaining tabs were never checked, and it is worth five low-stakes
minutes: a dimmer lamp means less glare, quieter fan and longer life, affordable on the whiteboard
and not on the wood.

**`Image shift` and `Digital zoom out` were dropped as levers, 2026-08-23.** They are projector menu
knobs, not Muralista features, so nothing is removed from the tool. Both were candidates for
*framing* (getting content onto the board instead of spilling onto wood), and drawing the quad
against the live camera view does that better and without cost — both knobs work by using less of
the chip, so they buy the right shape at lower resolution. **What resizing a quad does not do is
touch brightness or glare**: the lamp keeps pointing where it points at the same intensity, and a
smaller mapped shape simply means more of the wall shows projector black, which is dim grey light
rather than off. The roughly four-fifths waste and the light in the performer's eyes both survive
any amount of reshaping. **Geometry — the mount — stays the only complete fix.** Recorded so nobody
concludes later that shape resizing solved brightness.

### Content shape versus surface shape: the `fit` gap

First real mapping surfaced a gap the tool had no answer for. The studio whiteboard is roughly
**4:3**; `cerdo.mp4` is **16:9**. Muralista stretches content to fill whatever quad is drawn
(`object-fit: fill` throughout), so the animation was squeezed to **74% of its proper width**.

**This is the normal case, not an edge case.** Surfaces are physical objects and content is not, so
their shapes will almost never agree.

**DECIDED 2026-08-23: v1 keeps stretching exactly as it is. A `fit` option comes in the next
version.** Not a deferral of a gap, because **the manual escape already exists and is two corner
drags**: with the live camera backdrop, draw the quad at the content's own 16:9 and let it overhang
the whiteboard onto the wood, where light barely registers. You get a board-height, correctly
proportioned image whose edges dissolve into a surface that shows almost nothing.

The alternative considered and not taken: letterboxing inside the 4:3 board keeps proportions but
**projector black on a white board reads as visible grey bands**, so it paints the mismatch onto the
brightest surface in the room. Cropping to 4:3 is clean but throws away the sides of every frame.

For the next version the shape of the feature is settled even though the build is not: a per-layer
`fit` (`fill` as today, `contain`, `cover`), one CSS property outside the warp, **defaulting to
`contain`** so the accidental 74% squeeze becomes impossible.

### The stale output window, which cost a debugging round

`python3 -m http.server` sends no cache headers, so Chrome will happily keep running an old
`mapper.js`. The control window and the output window are **separate documents with separate
caches**, so refreshing one does nothing for the other.

The failure mode is nasty because it is silent: an outdated output window still understands the
old message kinds, renders surfaces correctly, and simply **ignores any new one**. It presents as
"the new feature does nothing" rather than as an error, which sends you looking in the wrong place.

**Fixed 2026-08-23 (PR #3, `94d975f`), and the fix is stronger than a cache-buster.** The invariant
built is *the control window and the output window always run the same build, by construction*: a
per-session build token is read from `v` in the query string or minted on boot, and "Open output
window" passes the **control window's own** token through. A cache-busted HTML URL does not bust a
plain `<link>`/`<script>` href — which is exactly how the stale `mapper.js` survived the first time —
so `mapper.html` no longer hard-links its subresources; an inline bootstrap in `<head>` injects
`mapper.css?v=` and `mapper.js?v=`. That bootstrap holds the script injection until
`DOMContentLoaded`, because a script element created in JS is async no matter what and `defer` is
honoured only on parser-inserted scripts; holding reproduces the old end-of-body guarantee. The why
is commented next to the line.

**The residual edge, recorded rather than papered over.** The token pins the two windows to the same
URL, not to the same bytes. If the file changes between the control's load and the output's, the
control can briefly be running *older* code than the output. What is dead outright is the failure
that cost the debugging round: **the output can never be older than the control**, and reloading the
control collapses them back together.

## The v2.1 drag bug — found 2026-08-22, four weeks after it was declared fixed

Jorge reported after the July projector session that dragging in the preview "doesn't work". v2.1
added `startSurfaceDrag` and `startCornerDrag` to fix exactly that, verified headlessly, and shipped.
He reported the same thing again. **He was right both times.**

**The bug.** Both handlers attached their `pointermove`/`pointerup` listeners to the element that
received `pointerdown` — the polygon, or the corner-handle group. The first `pointermove` calls
`renderPreview()`, which does `svg.innerHTML = ""` and rebuilds every polygon and handle from
scratch. So the element holding the listeners was destroyed by the first move it handled. What
followed, all confirmed in Chrome with a real mouse:

- the quad moved by exactly **one mouse-move's** worth of travel and then froze;
- removing the element implicitly released its pointer capture, so capture could not save it;
- `pointerup` never reached the handler: no final commit, and the listeners leaked on a detached node;
- pressing an **unselected** surface was worse — `startSurfaceDrag` called `renderControl()` to move
  the selection *before* attaching its listeners, so they went onto an already-detached node and the
  surface **did not move at all**. That is the gesture Jorge was making, and it is why the report was
  "doesn't work" rather than "works badly".

**The fix.** One shared `beginPreviewDrag()` that puts both the pointer capture and the listeners on
`#preview-svg`, which is emptied but never replaced. All three gestures now use it — whole surface,
single corner, and the camera's calibration corners.

**Why the headless check passed while nothing moved on screen.** It dispatched a *single* synthetic
`pointermove` and asserted on the corner numbers — and one move is precisely the amount that did
work. The repo already carried the lesson that headless checks must verify what is **painted**, from
the 2026-07-02 `hidden`-attribute bug (see Build history). It was not enough, because this check did
not look wrong: it asserted on the right values, drove a real gesture, and passed. The sharper
version, now paid for twice:

> **A synthetic gesture is not a gesture.** Dispatching one event and asserting the state changed
> proves one event works, which is the one thing that was never in doubt. A drag is a *sequence*, and
> its failure modes live between the events — in what the first one does to the DOM the second one
> needs. Continuous input gets verified by hand, or it is not verified.

Pointer capture behaves differently for untrusted events too, which is how the harness kept a green
light on a red feature. The v2.4 verification was done with a real mouse in Chrome, measuring the
**painted** geometry (`getBoundingClientRect` on the rendered polygon, plus screenshots) against the
pixel coordinates the mouse was actually dragged between.

**The July v2 round is now fully accounted for.** Mic reactivity was removed rather than tested
(2026-08-23). **Transport-synced overlays are proven** — during the strip pass, a base video and an
alpha WebM were driven through play, pause and restart in lockstep (both at t=1.56 playing, both
paused there, both back to 0 on restart). The honest caveat: that run drove `applyTransportAction`
directly in the output role, because the in-app browser reports a 0×0 viewport for a second tab and
`BroadcastChannel` does not cross tabs there. So *overlay follows transport* is proven directly, and
the *control→output hop* is proven separately by the same day's real-Chrome runs, where play, pause
and restart were all confirmed arriving at the output window. Nothing in that path was changed by
this work.

## V1 scope and shape behaviour (design session 2026-08-23)

The session that turns "richer shape behaviour" from a phrase into a spec, and draws the line around
what v1 is. Jorge's order, unchanged and held to: **shape mapping and shape behaviour first, then
the Pregonero integration, and only then context-awareness.**

### The frame: studio-only, and a release at the end of shapes

**Muralista is not used for the coming concerts** (Jorge, 2026-08-23 — this answers architecture
question 1 above). **A first version is released once shape behaviour is complete.**

Release and promotion are two different things and only one of them is happening. *Releasing* means
tagging **`v1.0.0`** with a README that describes what the tool actually does. *Promotion* means the
`changopepper.com/tramoya` page, which is gated on having played a room and **stays shut**. The tag
costs nothing and gives the strip pass a finish line.

### The strip rule

**Standing rule, applied continuously while testing rather than once:** *does this help draw shapes
on a wall in the studio?* Anything that fails the question leaves before the tag.

| out | stays |
|---|---|
| the **beat layer** — with mic mode gone it is a circle pulsing at a fixed BPM, and nothing in v1 uses it. Takes `beatMode` and the one-option Mode select with it | surfaces, warp, drag, layer ordering, ⧉ duplicate, transport, test patterns, import/export, the camera backdrop, the white plate, `white.html` |
| **`_smoke.html`** — the two-iframe harness that certified the drag bug as working. Not neutral dead weight, a false witness | the **photo backdrop**, kept deliberately as the fallback for a room where a camera cannot be rigged beside the lens |
| the **`field` primitive** — designed on 20/08, never built, and its only consumer is Pregonero letterboxing its output, which is P2. Not added | |

**Transport-synced overlays: nothing to strip.** The sync is not a feature with its own controls, it
is the fact that a layer obeys the play button instead of running off on its own; removing it would
make overlays worse, and the same list-ordering machinery is what text-over-video needs. *(The sync
itself was proven during the strip pass — see "The v2.1 drag bug" section. What defers to the next
version is the **alpha-WebM animation overlay as a use case**, not the mechanism.)*

### Design system: the light brutalist restyle

Muralista's control window adopts **Pregonero's design system**, per the vault-wide rule that
Chango Pepper tool UIs are brutalist too, in a quiet register.

**Scope is the control window only.** The output window is not a UI, it is the projection: it stays
black and unstyled forever. One constraint specific to this tool: the preview sits on top of a live
camera feed of an arbitrary wall, so quad outlines, handles and the selected-surface state must stay
readable against *any* image. "Contrast is a budget" governs the panels and the chrome, **not the
drawing layer**.

**Sequenced last, immediately before the tag**, so it styles the tool that survives the strip pass
rather than the one being cut down.

### Shape behaviour, specified

**Video shape — ready.** Ships stretching exactly as today; see "Content shape versus surface shape"
above for why, and for the two-corner-drag escape that makes it a choice rather than a defect.

**Text shape — a new layer type.** Four requirements from Jorge, and one architectural decision that
carries all of them:

- **Size is stored as a fraction of the shape, never in pixels.** An absolute font size silently
  breaks every tuned layout the moment a quad is redrawn in a new room; a fraction of the shape's
  height travels with the shape, so a remapped room still reads. The live slider adjusts that
  fraction while the projector is on, which is the "change the size while configuring" Jorge asked
  for.
- **"No exceeding limits" is a guarantee, not a discipline.** Auto-fit shrinks the text until it fits
  the quad, wrapping on word boundaries, honouring the embedded newlines some catalogue entries
  carry, with an inset so text never touches the edge. The slider sets the **maximum**; auto-fit only
  ever goes below it. The 81-character Tragedia line therefore cannot overflow at any setting, and
  short lines still get to be big.
- **Real DOM text inside the warped element, never a pre-rendered image.** The browser rasterizes
  after the warp, so it stays crisp in a keystoned quad. Text baked into a PNG and then warped is
  precisely how surtitles fail.
- **Transparent background with a cinema outline** — dark stroke plus a slight shadow, adjustable —
  so it composites over video, which is the overlay case v1 actually needs. Worth restating: the
  suite's "contrast is a budget" rule **does not apply to a lyric surface**; legibility from the back
  of a dark room wins.
- **Content is typed into a field. SP JSON is deferred.** The timeline was in the parallel-track plan
  so layouts would be tested against real line lengths — pasting real lines, including
  `lyric-worstcase.png`'s, buys the same thing. This boundary is what stops Muralista quietly
  becoming a second Pregonero.

**Singer shape — one polygon primitive, with a suggestion inside it.**

**A keep-out is not a surface.** Every shape in the tool today is exactly four corners because four
corners is what a homography needs to warp content. A keep-out carries no content, it holds black. So
it needs no warp, no homography and no four-corner constraint: it is a polygon in output space,
filled black, painted on top of everything. **Irregular is the cheap version, not the hard one** —
this asks for less machinery, not more.

- **The primitive:** add a polygon like any other shape; it arrives with a handful of points; move,
  add and delete points to make it whatever the room needs. Filled black, always on top.
- **The margin slider** inflates the whole outline outward. The rule is to draw generously larger
  than the shadow, because a performer sways and an exact mask lets light onto the face on every
  lean. One knob turns that discipline into a number.
- **"Suggest from my shadow":** raise the white plate, capture, Jorge steps in, capture, difference
  the two frames — the region that got darker *is* the shadow, by construction, being precisely the
  pixels the body blocks — trace it to a contour and replace the polygon's points with it. Same
  differencing trick as the morning-of-22/08 photo workflow, except the loop now closes against the
  wall instead of against a measurement.
- **The suggestion does not need to be accurate**, which takes the risk out of the only novel piece
  of image processing in the plan. A coarse blob roughly the right shape, inflated by the margin
  slider and tidied with a few points, **is the correct output**, because generosity is required
  anyway.
- **Out of this version:** the polygon following the performer live. The 2026-08-20 reasoning stands
  — low light, mid-song, performer inside the beam, and a mask that flickers is worse than no mask.

Because the polygon is a general shape rather than a shadow-only one, keep-outs for things that cast
no shadow — the doorway, the window, the mirror behind the bar — are **in** v1 after all: push the
points onto them by hand. What is next-version is anything smarter than that.

### The build queue this produces

1. ~~**Strip pass**~~ **done 2026-08-23** (`14ec208`) — beat layer, `beatMode`, `bpm`, the beat
   anchor and `_smoke.html`, with a schema bump to v4.
2. ~~**Polygon shape** with the margin slider and the shadow suggestion~~ **done 2026-08-23**
   (`e465a7e`, schema v5). The suggestion still needs its first wall.
3. ~~**Media folder via the File System Access API**~~ **done 2026-08-23** (`46c0ca3`). The
   permission round trip is hand-untested; see the studio checklist.
4. ~~**Text layer.**~~ **done 2026-08-23** (`7e0d66b`, schema v6). Legibility still judged only on a
   monitor.
5. **Text adapts to the shape** — see "Text inherits the stretch" below. Added to v1 on 2026-08-23.
6. **Wall check on lyric legibility**, once the text layer is complete.
7. **Brutalist restyle**, control window only, using Pregonero's stylesheet as the reference (that
   repo is cloned locally).
8. **Tag `v1.0.0`**, repo private, website gate shut.

### Text inherits the stretch, and it is the same decision as the video

Text is laid out in the square 1000×1000 content box and then mapped onto whatever quad is drawn, so
**a quad that is not square distorts the glyphs** — squeezed in a tall thin column, fattened in a
wide strip. The 81-character line technically fits a 4.5%-wide quad, but it fits by being squeezed,
and that is a limit rather than a pass.

This is the **same `fit` question already decided for video** (stretch in v1, a per-layer `fit`
option next version), arriving on the layer where the cost is legibility rather than aesthetics. Two
consequences: the working rule for v1 is *draw the region roughly the shape you want the words to
read in*, which is in the README's Limits; and when `fit` is built, **text is the layer that needs it
most**, because a stretched pig is a style and a stretched lyric is a failure.

**DECIDED 2026-08-23: text stops inheriting the stretch, and it happens before the tag.** The stretch
decision stands for video and images; text is exempt, because a stretched pig is a style and a
stretched lyric is a failure. Two halves:

- **Automatic:** derive the text box's proportions from the quad that was actually drawn, so a wide
  strip lays out wide instead of fattening the glyphs. This handles most cases alone.
- **Manual, and it is the half that fits this tool:** a slider that adjusts letter proportions while
  watching the wall. The honest complication is that a quad on an angled wall is a trapezoid *on
  purpose* — the warp is compensating for the projector's position — so no formula knows the
  surface's true physical shape. Jorge's eye does, through the camera. Same loop that beat a careful
  measurement by three percent.

**Wall check owed, and sequenced after that build** (Jorge, 2026-08-23: test the finished layer, not
a half of it): read a wide lyric strip and a tall column from the back of the room, in low light,
against `lyric-worstcase`'s 81 characters. Acceptance for this layer was always going to be visual,
at a wall.

### The four things only a wall can answer — ALL PASSED 2026-08-23

**Run at the wall the same evening, together with the seven media-folder checks. Everything passed.**
So the shadow suggestion is optically proven, not merely code-complete: the traced shape lands on the
shadow rather than offset toward the body, which is the rule the whole keep-out design rests on, and
the only place it could ever have been confirmed. The media folder's permission round trip and
autoplay through a blob URL are proven too — both were beyond any harness on this machine.

The checks, kept because they are the regression list if the camera, the projector or the room
changes:

1. **Does frame A catch a settled white wall**, or is the camera still stopping down at 900 ms? A
   trace that comes back as noise across the whole frame is this.
2. **Does the countdown clear the wall inside 300 ms?** Projectors add their own latency on top of
   the browser's.
3. **Is the shadow's contrast above threshold 22** at real projector brightness? The slider exists
   precisely because this could not be calibrated at the desk.
4. **Does the traced shape land on the shadow, not offset toward the body?** That is the whole rule,
   and the wall is the only place it can be confirmed.

### The unit is the gig, not the venue (Jorge, 2026-08-23)

**Vocabulary correction, and it governs everything below.** A **gig** is *a concert on a specific
date at a specific venue*. That is the unit that encapsulates song configurations, in Muralista and
in Pregonero alike. **The venue is not a first-class citizen** — it is an attribute of a gig, not the
owner of a file.

This is simpler than the "venue file" framing inherited from the Venue Turn, and it matches how the
work actually happens: you map the room you are standing in, tonight, and what you produce belongs
to tonight. A second gig at the same venue starts from the previous gig's file and gets adjusted;
whether that copying ever becomes painful enough to justify splitting room facts out is a question
for a second gig to answer, not for a design session to guess at.

It also lines the two tools up: Pregonero's setlist is per gig, and Muralista's configuration is per
gig. **Do not reintroduce "venue file" as the name of the artifact.**

**Surface names, adopted 2026-08-23:** name surfaces for what they physically are — `board`, `crate`,
`door-strip` — not `Surface 1`. Renaming already exists in the surface list, so this is a convention
rather than a feature. It costs nothing and it is the hook any future addressing-by-name would hang
on.

### The output model — proposed 2026-08-23, not yet decided

Jorge's framing: *"I expect a configuration per song performance. Muralista doesn't operate in terms
of gigs; each song is its unit of configuration."* Right about the artistic unit, and it is half the
structure.

**There are two lifetimes and only one of them is the song.** Applying the Venue Turn's own test:
quad geometry, camera calibration, the keep-out around Jorge's shadow, where the doorway is — all
invalidated by a different **room**, and unchanged by every song played in it. What goes on which
region, and when, is invalidated by a different **song** and survives every room. If the song file
is the only output, either each one carries a copy of the room's geometry (so remapping a room means
rewriting twelve files) or the geometry lives nowhere. **The first is what actually happens, and it
is how these formats rot.**

**The move that makes the song-as-unit work: regions get names, and song files address names, never
coordinates.** The room mapping says *region `board` is this quad, in this room*. The song
arrangement says *cerdo plays on `board`, lyrics on `strip`, the logo on `cupboard`*. Same song in a
new room: swap the mapping. Same room, new song: swap the arrangement. That is the lighting desk's
patch-versus-cues split, and it is already the suite's shape, since **SP JSON is per song and knows
nothing about rooms.**

So Muralista's eventual output is **two documents linked by names**: a room mapping and a set of
per-song arrangements. Jorge's unit of work stays the song; the geometry stops being copied around
behind it.

**Text and video shapes become placeholders, and that is the same idea arriving.** A region stops
being "a thing with content in it" and becomes a **slot with a role**: this is where lyrics go, that
is where the animation goes. Pregonero fills the slots at runtime from SP JSON. Muralista's own
rendering of sample text and sample video is a *preview of a slot*, not the slot's contents.

**The consequence to hold onto while the text layer is built, because it is free now and expensive
later: a region's role and the sample content previewing it are two different facts.** If the file
records only "this region shows `lyric-01.png`", nothing distinguishes *the lyric slot* from *an
image someone happened to place*, and the day Pregonero reads it, every mapping is re-authored by
hand.

**Closed by Jorge, 2026-08-23: the arrangement is NOT a section of SP JSON.** His reason is the right
one and it is stronger than the ownership argument: **SP JSON is venue-independent, and everything
Muralista writes is venue-dependent.** Fusing them would drag a room into a document that has no
business knowing about rooms. Format ownership (Bombista writes SP JSON) would also have had to
become per-section, which the Venue Turn never contemplated — but it is the venue-independence that
decides it.

**Opened by Jorge, and it is the better question: is Pregonero's gig setlist the same file as
Muralista's gig configuration?** Both are gig-shaped. A setlist is the songs, in order, for one
night; a Muralista gig configuration is what each song puts on which region, that same night. They
are two halves of one document about an evening, and Pregonero has no such file yet, so nothing has
to be unpicked to make it one. **The crux is ownership**: exactly one tool may write each file, and
here two tools each want to author half. Carried to the Pregonero integration session, unresolved.

**On named regions, restated plainly, because the first attempt did not land.** Today a mapping says
*this content goes at these four corner coordinates*. Coordinates only mean something in the room
they were measured in, so a song's arrangement written that way can only ever be used in that room —
which is exactly what Jorge means by "venue-dependent".

Naming is the alternative: **the room mapping labels its surfaces** — `board`, `crate`, `door-strip`
— and the song arrangement then says *cerdo on `board`, lyrics on `door-strip`*, never a coordinate.
Play a different room, map it, and label one of its surfaces `board`: every song arrangement written
for `board` plays there untouched. The room file holds the geometry; the song file holds the
intention; the name is the hinge between them. It is the lighting desk's patch-versus-cues split.

**Not a decision for v1, and possibly never needed.** If arrangements stay venue-dependent, they get
re-authored per venue, which for a handful of gigs is cheap and honest. The cost only bites at many
songs × many rooms. **What is worth doing now, because it is free: give surfaces real names anyway.**
A named surface costs nothing today and is the hook everything above hangs on if the day comes.

**None of this changes v1.** Do not design the format, earn it: v1 keeps emitting one file,
studio-only. What this buys is knowing which seam to cut when a second room or a second song forces
the question, and that the seam is **named regions**, not a bigger file.

### The integration contract (Jorge, 2026-08-23) — settled before the design session

Pregonero is an **Electron app** (Electron 41, Vite, React, TypeScript), which is Chromium with Node
attached. So it *could* host Muralista's page in a `BrowserWindow`, serve it over localhost to get a
secure context for the File System Access API, place the output window on the projector display by
itself, and shell out to Bombista's CLI from the main process. That is packaging, and it removes the
terminal, the `python3 -m http.server` step and the drag-the-window-to-the-second-display dance.

**None of that may change the contract, which Jorge states as: Muralista still writes a file and
Pregonero still reads it.** Four rules keep it honest:

- **The handoff carries no data, only the fact that a file changed.** The moment a signal carries the
  mapping itself, there are two tools sharing state and the file has stopped being the truth.
- **The mechanism is Pregonero watching the file, not a protocol.** Muralista saves; Pregonero
  notices and re-reads. Nothing to keep in sync, and it works whether Muralista runs inside
  Pregonero's window, in a plain Chrome tab, or on another machine with the folder synced. Bombista
  gets the same treatment and never learns Pregonero exists — the right relationship for a CLI.
  Muralista already knows how to write into a folder the user chose, so the plumbing exists.
- **"Pass control back" is courtesy, not architecture.** A *Done* button that closes Muralista and
  brings Pregonero forward is convenience; the reload already happened because the file changed. And
  **Muralista must stay fully usable without it** — if the bridge is absent, the button is absent and
  you export as today. A tool that only works inside another tool is the coupling in a costume.
- **Re-reading on change is right before doors and wrong mid-song** (decided by Jorge). Pregonero
  must not reload the world under itself while performing: either auto-reload only when not in a
  show, or surface "reload available" and let the operator choose.

The slide to watch for is from *Pregonero launches Muralista* to *they share state at runtime*, which
is exactly the shape the desk-tool cut rejected.

### The media model

**Decided 2026-08-23, and shipping in v1.** No media is part of the app, at build time or at
runtime. The user keeps media wherever it lives on their computer and **Muralista becomes aware of
that location** through Chrome's **File System Access API**: pick a folder once, the browser hands
over a durable handle, the app remembers it across sessions in IndexedDB.

The constraint that shapes the design: **a browser page cannot read an arbitrary path.** "Aware of a
location" therefore means a granted handle, never a string like `/Users/jorge/Pictures`.

Three calls made up front:

- **The venue file stores names, never handles.** A directory handle is a browser object and cannot
  live in a JSON that gets read, diffed and handed to Pregonero. The file says `logo.png`; where that
  resolves is the remembered folder. This preserves the property that makes the venue file worth
  having, and that separates it from TouchDesigner: **it names things, it does not contain them.**
- **The output window never asks for permission.** It sits on the projector, and a permission prompt
  on the wall mid-setup is unacceptable. The July note that "blob URLs do not survive a
  BroadcastChannel" is true and was half the picture: **Blobs themselves do survive structured
  clone**, without copying bytes. So the control window owns the folder, reads the file, posts the
  Blob, and the output makes its own object URL. Exactly one window touches the file system.
- **The served-directory path stays as a fallback.** With no folder picked, or permission lapsed,
  media resolves relative to the served directory as it does today. `python3 -m http.server` keeps
  working, existing mappings keep opening, and a denied permission is a degraded mode rather than a
  dead tool.

Sequenced after the polygon and before the text layer: it touches every media path, so doing it
after the restyle would mean restyling twice, and the text layer touches no media at all.

Consequence worth stating: **the Chango Pepper logo needs no special treatment.** It is one more file
in the media location — not committed, not an exception. Projecting it onto a small surface beside
the animation is a real v1 use case that needs nothing built, though it should be given a quad at its
own proportions, since v1 still stretches content to fill.

Deferred by name, so none of it reads as forgotten: the `fit` option, alpha-WebM animation overlays
and the hand-test of transport sync, the `field`, SP JSON as a text source, multi-region animation
content, hand-drawn keep-outs for objects that cast no shadow, live silhouette tracking, the
Pregonero integration (P2), and context-awareness (parked, below).

## Context-awareness: parked 2026-08-22, and what survives the parking

**Decided by Jorge, 2026-08-22.** The sound-reactive half of v2 comes out of the working
version. Ordering, in his words: **mapping shapes and richer shape behaviour first, then the
Pregonero integration, and only then revisiting context-awareness.**

**This is not a new decision, it is the 2026-08-20 one arriving.** The desk-tool cut already put
this code on the wrong side of the tool boundary: Muralista does not run during a show, so a
feature whose entire purpose is to listen to a live room cannot live in it. What 22/08 adds is a
date and an order. The relocation cost flagged under "Architecture" above stops being a hidden
future cost and becomes a scheduled one.

### What goes, what stays

| out | in |
|---|---|
| mic capture, the level/onset envelope, the ephemeral broadcast | the beat layer's **fixed-BPM** mode |
| the `micReactivity` slider on media layers | everything about surfaces, warping, layers, ordering |
| the beat layer's **mic** mode | |

**The `micReactivity` field comes out of the saved project too, not just the UI.** Venue Turn §2.7
says *do not design the format, earn it*: a field no tool executes is speculative format design,
and leaving it in invites exactly the "declared but ignored" ambiguity the format-ownership rule
exists to prevent. It gets re-added the day Pregonero can act on it.

### How it is preserved: a tag, not a branch

**Tag the commit, delete the code from `main`.** This is the house pattern, proven on the website's
3D prototype the same week (removed by PR, recoverable via the `prototype-3d-archive` tag). A
branch would rot: `main` will move under it and it will stop merging, so what looks like a
preserved option is a decaying one. A tag is exact, permanent and costs nothing to maintain.

Suggested name: **`mic-reactivity-archive`**, on the last commit before removal. The v2.3 slice
itself is `065c03f`.

**Executed 2026-08-23.** The tag exists on `ada25da` and is pushed to origin, created and verified
*before* a line was deleted. Removal merged as one squashed PR (code, schema v3, README). Migration
runs on load and on import, so every autosave under the untouched `STORAGE_KEY` and every previously
exported venue JSON still opens; a layer left in mic mode falls back to the fixed BPM it was already
carrying, so it keeps pulsing rather than going dark. Note for anyone reaching for the tag: the
autosave stays v2 on disk until the first edit commits, and after that there is no v2 left in
localStorage. **The tag preserves the code that read the old field, not anyone's data** — judged not
worth a backup step, since the only thing v3 drops is a field nothing executed.

**What the removal deliberately left standing, and why it is not debt for long:** `beatMode` is now
written in three places and read in none on the output side, and the Mode dropdown has a single
option. Both were left untouched rather than half-deleted, because the **whole beat layer is cut in
the strip pass** (see "V1 scope" below) and the two leave together in a commit whose subject says so.

### The part actually worth keeping is the tuning, not the code

Under the desk-tool architecture this behaviour gets re-implemented **inside Pregonero**, a
different codebase. The JavaScript will not be copy-pasted, so it is not the asset. What is
expensive to rediscover is what the numbers should be, and why. Recorded here so the tag never has
to be opened:

- **Sample at 30 Hz, not per frame.** A level-and-onset envelope carries no detail above that, and
  `setInterval` at ~33 ms is far cheaper than rAF. Consumers smooth it back up to frame rate at the
  other end (`AUDIO_SMOOTHING = 0.25` per frame, exponential), which is what stops it stepping
  visibly.
- **Envelope follower: instant attack, ~0.3 s exponential release.** Loudness must arrive on the
  beat and leave gently. A symmetric filter feels late; a fast release flickers.
- **Onset detection is relative, not absolute.** Instantaneous RMS must beat a slow-following room
  average (`smoothing 0.05`) by a factor of **1.8**, with a **150 ms refractory** window and a
  **0.02 RMS floor** so near-silence does not self-trigger on its own noise. The slow average is
  what makes it work in any room without per-venue calibration, which is the whole point for a tool
  that plays rooms it has never seen.
- **Disable Chrome's voice processing on the capture.** Echo cancellation, noise suppression and
  AGC are built to flatten exactly the dynamics being measured. The request asks for the raw room.
- **Absent data must decay to zero, never freeze.** If no envelope has arrived for **1 s** the level
  reads 0 rather than holding its last value. Without this, closing the control window leaves every
  reactive layer frozen at whatever loudness the room happened to have. One function owns that rule.
- **One shared loop, not one per layer.** Every reactive consumer reads the same smoothed value from
  a single rAF loop. This is also the intended mechanism for a future `bank` layer type.
- **Groundwork noted by the v2.3 crew and not yet used:** the onset stream implicitly carries tempo
  (median inter-onset interval), and asset-bank state transitions should key off the *smoothed* level
  with hysteresis rather than raw onsets.

### What has to be true before unparking

Not a date. Both of: **Pregonero reads a venue file**, and **a room has been played with mapped
lyrics in it**. Until then there is no runtime to host the behaviour and no evidence about whether
a room's loudness is a signal worth reacting to on stage at all.

## Prior art — TouchDesigner (noted 2026-08-20)

**TouchDesigner** (Derivative, Toronto — `derivative.ca`) is the incumbent in this space and the tool
behind a large share of the projection-mapping work Jorge sees posted. Recorded here as a **reference
to read against**, not a dependency and not a candidate to adopt. Free non-commercial licence, paid
Pro.

**What it is.** A node-based visual programming environment for real-time interactive multimedia. You
build a signal graph instead of writing a render loop. Operator families are colour-coded in the
graph: TOPs (textures/images), CHOPs (channel and control data — audio, MIDI, sensors), DATs
(text, tables, Python scripting), SOPs (geometry), COMPs (components). Everything runs per-frame on
the GPU. Built-in `Kantan Mapper` does the corner-pin/mesh warping; edge-blending, multi-projector
sync, audio and MIDI input are all first-class.

**Where it overlaps Muralista.** Almost entirely, on capability: corner-pin warp of media onto
non-planar surfaces, named projection regions, keep-outs, audio-reactive layer behaviour,
multi-output. Anything on the v1 or v2 feature list, TouchDesigner already does, better and with a
decade of hardening. **Feature parity is not the axis to compete on and should not be attempted.**

**Where it does not overlap — and why that is the whole point.** TouchDesigner collapses authoring
and performance into **one always-live patch**. The graph you tune at the venue is the graph running
during the show; there is no artifact between them, and no state that survives the app being closed.
That is precisely the fragility the desk-tool cut designs away from (see "Architecture: a desk tool,
not a stage tool" above). Muralista's differentiator is **the venue file** — mapping a room produces
a durable, inspectable, version-controllable document that a separate, feature-complete renderer
executes. Muralista is allowed to be slow, fiddly and ugly because it is never on stage. TouchDesigner
cannot make that trade; its authoring surface *is* its runtime.

Secondary, and real: TouchDesigner's graph is not legible to anyone but its author, which fails the
suite's legibility constraint (`context/tramoya/README.md`). A venue JSON is readable by a human, a
diff and a test.

**Open question to carry — Jorge, 2026-08-20.** *Is there any connection or overlap worth acting on?*
Three angles, none decided:

1. **Vocabulary.** TD's operator taxonomy and the Kantan Mapper's corner-pin UX are battle-tested
   naming and interaction conventions. Borrowing vocabulary costs nothing and buys familiarity.
2. **Interop.** Could Muralista's venue file be *exported to* TouchDesigner, or could TD serve as a
   reference renderer to validate a mapping against? Would test the format's honesty. Unscoped.
3. **Kill-criterion check.** If at any point the honest answer is "Pregonero + Muralista is a worse
   TouchDesigner," that is a signal, and this project is disposable like any other. The answer today
   is no — the file boundary is a genuine architectural difference, not a feature gap — but the
   question should be re-asked, not assumed.

## Where the state actually lives

The working venue mappings are not in git. They live in the browser's `localStorage`, under the key
`wallmapper.project.v1` (deliberately not renamed during the 2026-08-20 rename — see the "Do NOT
rename these" table above). Exported venue JSONs sit in `mapper/media/`, alongside the gitignored
video assets. This file and the repo's committed code describe the tool; the actual state of any
given mapping is on whichever machine last drove the calibration.

## Pointers

- `context/tramoya/venue-turn.md` — the parent thread; §2.1, §2.3, §2.5, §2.6, §2.7 all load-bearing
  for the V1 design above.
- `context/tramoya/README.md` — the suite, the "real work" rule, the legibility constraint.
- `README.md` (this folder) — what Muralista actually does today, for anyone opening the repo.
- `context/WAYS-OF-WORKING.md`, "Renaming: the dangerous hits are the invisible ones" — the rename,
  executed 2026-08-20, and what it taught.
- `derivative.ca` — TouchDesigner, the incumbent. See "Prior art" above before adding any feature
  that sounds like something TD already does.
