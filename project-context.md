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
- **2026-08-23: `v1.2.3` — the wall goes dark while you walk in.** PR #17, `4cf5ecd`, umbrella
  `45bea1a`. Jorge, at the wall: standing in front of a full-white field for the whole countdown
  hurts. It was never needed. **The plate must be lit at exactly two instants — frame A and frame B —
  because a shadow only exists where projected light is blocked and the two photographs must match.
  The countdown between them is not photographed.** So the countdown element *is* the dark plate, one
  opaque element, which also means the wall changes exactly once in each direction and no frame of
  mapped content ever reaches it. The re-light settle went to 2000 ms because auto-exposure opens up
  over ten seconds of darkness; the ordering argument survives (2000 > 900).

- **The finding underneath it, which outlived the release: adopt-boundaries was never
  exposure-invariant.** Frame A is taken 900 ms after the plate rises, frame B 2000 ms after it
  rises again, so on **auto-exposure the camera is in two different adaptation states at the two
  shutters** — measured at gain 1.30 versus 0.59, 53,138 differing pixels outside the performer, and
  the failsafe refuses. Locked exposure: gain 1.00 both times, 0 differing pixels, 10 points traced.
  **This was not created by the dark countdown, only widened by it** — `v1.2.2` had the same
  asymmetry and was reported green because the camera model of the day had no exposure simulation.
  Another passing check that was not looking at the thing, the same family as the synthetic drag and
  the `hidden`-attribute bug.
  **Timing cannot close it**, so the fix is to divide out the global brightness before differencing:
  **a shadow is a local darkening, auto-exposure is a global gain.** **Shipped as `v1.2.4`** (PR #18,
  `5f7edf9`, tag `65c5108`, umbrella `d9f1543`), with the failsafe kept but applied *after*
  normalisation, where it goes back to meaning what it was for — the plate was not clean.

  **The estimator is the 90th percentile, not the median, and the reason is load-bearing.**
  Everything this gesture looks for — a shadow, an object, a countdown that should not be there — is
  *darker* than the plate, so the estimate must come from where the contaminant never is. A median
  survives a silhouette only to half the field; the bright end survives nine tenths. More
  importantly, **a median would have silently defanged the failsafe**: something opaque covering 70%
  of the plate drags a median onto the covered part, normalises it back to "correct", and the tool
  traces nothing instead of refusing. From the bright end that 70% still reads as covered and it
  fires. Everything between the failsafe's 50% and the estimator's 90% gets refused rather than
  explained away. Measured: gain recovered to three decimals across auto-exposure time constants
  from τ=150 to τ=500, ten points traced every time, failsafe silent; opaque covers at 60/70/80%
  still refuse.

  **The limit it could not remove: clipping.** 255 is 255 whether the true value was 260 or 600, so a
  ratio across a clipped percentile is the clamp talking, not the camera — a plate at 220 with the
  camera 1.6× and 2.2× brighter both estimate as 1.159. When either side is clipped the estimator
  **declines to normalise rather than inventing a number**, and the message names the real cause:
  the first photograph was blown out, turn the camera's exposure down or lock it. One sweep row
  (τ=800, frame A at exactly 255 after the 900 ms settle) hits this; lengthening the plate settle
  would fix it and was deliberately not done, because both settles were proven at a real wall.
  **Locking the exposure is now a recommendation in the README and the panel copy, not a
  requirement.** Why it matters beyond tidiness: in the studio the Facecam's exposure can
  be locked, but in a café twenty minutes before doors, a tool that needs a camera setting adjusted
  before it works is a tool that silently does not work.

- **2026-08-23: `v1.2.1` and `v1.2.2` — the two bugs the wall found.** `v1.2.1` (PR #15, `fa0d808`,
  umbrella `37b7403`): **the remembered camera was a dead end.** `enableCamera()` asked for
  `deviceId: { exact: … }`, Chrome's device ids rotate on a replug or restart, and the device
  dropdown only populated *after* a successful `getUserMedia` — so a stale id threw
  `OverconstrainedError` and locked the camera out entirely, recoverable only by editing
  `localStorage` by hand, which Jorge had to do. Now it falls back to any camera, names the
  substitution in the status line, and updates the stored id. It deliberately does **not** fall back
  on a permission error or a busy device: different failures, different remedies.

- **`v1.2.2` (PR #16, `7c8b247`, umbrella `1bdb582`) — and the diagnosis is the keeper.** Symptom:
  adopt boundaries traced the whole lit rectangle instead of Jorge's silhouette. The obvious suspects
  were all innocent — instrumenting the output's paint loop at 60 Hz showed the countdown cleared at
  +3972 ms, frame B taken at +4258 ms, 286 ms later, and the countdown paints glyphs on a fully
  transparent background with no scrim. The DOM sequencing was correct.

  > **A DOM is the present and a camera is the recent past.** Between the projector painting and
  > `drawImage(video)` handing over that picture there is display lag, the exposure window, the
  > camera pipeline, USB and decode — 100–200 ms on an ordinary webcam and **longer in a dim room,
  > because darker means a longer exposure.** The 300 ms settle sat inside that band, so frame B was
  > a photograph of a countdown that had already left the screen.

  The settle is now **1200 ms**, and *being longer than the 900 ms plate settle is the load-bearing
  part*: a camera slow enough to still see the countdown in frame B is too slow to have seen a clean
  plate in frame A. Swept 0–3000 ms in 10 ms steps, no latency reproduces it. The **failsafe** now
  refuses to trace when more than half the lit rectangle darkened, with the percentage in the
  message — which also catches the cause no timer can fix, **auto-exposure stopping down over the
  ten seconds between the photos**. Normalising out a global brightness shift was deliberately *not*
  added: it could mask real cases, and the failsafe now fails loudly instead.

  **Unresolved:** Jorge remembers the countdown appearing only in the control window on earlier runs,
  and the code says it has been projected since the feature landed. Something else about that run
  differed. Auto-exposure is the standing suspect if it recurs.

- **2026-08-23: `v1.2.0` — one shape, one set of circles.** Merged `63d2dd2`, tag `v1.2.0`, umbrella
  `a752361`. From Jorge's second session at the wall. **Fill shapes stopped looking different** — one
  idiom, a body carrying what is inside and an outline carrying stroke and selection; the dashed red
  is gone. **The numbered cyan frame handles are gone**, and the frame became *a rule about counts*:
  at four outline points the outline **is** the frame, so dragging a circle warps content live; past
  four it holds the value pinned when the fifth point arrived, and the extras clip. *Re-fit content
  to this shape* moves it deliberately, through the current frame's homography, so a quad tuned
  against an angled wall stays tuned rather than being boxed upright. **Adopt boundaries now returns
  a convex hull thinned to 8–14 points** instead of a 30-point contour: on a person-shaped silhouette
  it gave 10 points with the gaps under the arms swallowed. Accuracy was never the goal — the margin
  has to inflate the result anyway.
  **A deliberate collision, resolved in favour of the count rule:** v1.1.0 said adopt never touches
  the frame; the count rule says four points *are* a frame. Four-point adopt results therefore move
  the content — adopt the boundaries of a placed box on a video shape and **the video lands on the
  box**, which is a feature rather than a side effect, while a silhouette comes back with more than
  four points and only clips. **Confirmed as correct by Jorge.**
  **A migration bug the round-trip check caught:** migrating a v7 keep-out wrote `corners: null`
  while `migrateShape` pinned a four-point outline's frame, so export-then-import changed the file
  underneath you. Both paths go through `pinFrame` now. No schema bump — nothing gained or lost a
  field, and a v1.2.0 file still opens in v1.1.0.
  **Recorded as a limit rather than built: nothing spans a corner.** A homography maps one rectangle
  onto one flat plane, so a single shape cannot bend across two walls. One shape per facet — two text
  shapes, one per wall. Mesh warping stays Tier 2.
- **2026-08-23: `v1.1.0` — one shape, many fills.** The unification, built the same day it was
  designed. **There is no keep-out**: there are shapes, `fill` is one of the layer types, and the
  performer mask is a black-filled shape that queues in the z-order like everything else. A shape is
  an **outline** (N points, min 3, edited identically everywhere) plus a **content frame** (four
  corners, what the warp needs) when it carries something. Two details worth keeping:
  **the outline/frame linkage is read off the geometry rather than remembered**, so a plain quad
  behaves exactly as v1.0.0 did — one drag moves one point, one set of handles — and adding a point
  then deleting it puts them back together on its own. And **the clip lives on an untransformed
  full-frame parent**, so the outline goes on as output pixels exactly as stored, with no inverse
  homography to keep in step with the forward one. **Schema v8**: old `keepOuts` migrate to fill
  shapes at the *end* of `surfaces`, because list order is paint order and the end is where "above
  everything" now lives — which is what makes the migration byte-identical. **Adopt boundaries is now
  available on every shape**, not only fills: on a video shape it clips an animation to a real
  object's silhouette. Verified against painted pixels with v1.0.0 served side by side: a v7 mapping
  paints a **byte-identical frame, 0 differing pixels**; adding an outline point removes content and
  changes nothing else, on a pattern, a real `<img>` and a real `<video>`; margin growth exact
  (0.05 → 40px, 0.15 → 120px); text containment holds across **420** quad/size/aspect/content
  combinations. **Open, and not reproduced:** the "Pick file…" appearing on layer types that cannot
  use it. Measured against v1.0.0 the panel already restricted it correctly. It was made *structural*
  anyway — built inside the video/image branch so it cannot appear elsewhere — but if Jorge can
  place where he actually saw it, that is a different bug and still open.
  **The fourth commit was a one-character fix with a disproportionate lesson:** `mediaNamesKey()`
  joined media names on a NUL separator written as a raw byte rather than ` `. Functionally
  identical, but one NUL makes `file(1)` report `data` and makes grep treat the whole file as binary
  — printing *nothing*, not "no matches". Both Cowork and Claude Code hit it on `mapper.js` the same
  day, on a term with 104 occurrences, and both suspected the vocabulary before the bytes. Merged
  commits: muralista `86388f1`, umbrella `2ca09ed`. The general lesson lives in
  `context/WAYS-OF-WORKING.md`, "A single NUL byte makes grep lie by saying nothing".
- **2026-08-23: `v1.0.0` tagged.** Four PRs, all squash-merged; umbrella pointer `7bc46f7` at the
  tag; repo stays private and the website gate stays shut. **#9 — text stops inheriting the quad's
  stretch (schema v7).** Containment stayed structural: the layout box is widened by the quad's
  stretch and counter-scaled back onto the unit square, a bijection, so "fits the box" still means
  "fits the quad" with nothing to maintain. Measured at 1280×800, glyph proportions in a 9.6:1 strip,
  a 0.26:1 column and a square all came out **1.1187 against the font's natural 1.1187** — before,
  those spanned 65.86 to 1.83, a 36× spread. **The frame-aspect trap was real and was measured**:
  naive normalized coordinates give a consistent 60%-too-wide result that *looks almost right*. Also
  found in its own first cut: `scrollWidth` is an integer while the inset was fractional, so the
  width test failed by a fraction of a pixel at every size and wide keystoned quads painted 8px text
  with 862px going spare — silent and plausible, the family of bug this repo keeps meeting. **#10 —
  the restyle**, taken from `pregonero/src/control.css` by value rather than from memory. Two
  deliberate departures: no EB Garamond (that is Pregonero's *projection* screen; neither control
  window loads a webfont), and **the drawing layer is exempt from the contrast budget** — quad
  outlines, handles and keep-outs sit over a live camera feed of an arbitrary wall, so they keep
  high-contrast values on separate `--draw-*` tokens outside the ramp. The projector is *provably*
  untouched: a computed-style fingerprint of `html`, `body` and the whole `#output-root` subtree
  hashes identically before and after, and the first attempt failed that check because inherited
  `color`/`font-family` leaked through `body`. **#11 — full README pass**, with the worst-case lyric
  rescued as text before its PNG was deleted; two of its four lines were pure white on transparent
  and invisible on render, recovered via the alpha channel and verified at 81/152 characters against
  this file's own figures. **#12 — hint token fix and stretch-versus-shear honesty.** The four
  faked stand-ins (`keepout-black.png`, `lyric-01`, `lyric-02`, `lyric-worstcase`) are deleted.
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
- **2026-08-24: `v1.3.0` — shapes learn that a song is a thing.** Round B3 of the integration queue.
  Four song-aware types (`song-lyrics`, `song-video`, `song-intro`, `gig-contact`), a gig folder the
  tool reads `gig.json` out of and writes `visuals.json` back into, two levels of visual setup, and
  the text panel collapsed into a format bar. **Schema v9**: `TEXT_ROLES` retires into the type and
  the top-level `songVisuals` table arrives. A v8 mapping opens and paints an identical frame,
  verified property by property against the `main` build. Design decisions belong to
  `projects/tramoya-integration/project-context.md`; the implementation decisions are in
  **"Song-aware shape types (v1.3.0)"** below.
- **2026-08-25: `v1.4.0` — the warp becomes shared code.** Round B2 of the integration queue, the
  one B3 was written to unblock. The `WARP` section came out of `mapper.js` into `mapper/warp.js`, a
  pure ES module Pregonero will vendor and execute on stage. A **minor and not a patch** despite
  being a pure refactor for this repo: nothing about Muralista changed, but the file became a
  surface another repo depends on, and that is a new thing in the world. See **"The warp as shared
  code (v1.4.0)"** below.
- **2026-08-26: `v1.4.1` — the contract test runs itself.** Repo infrastructure only, and recorded
  here because a release list that skips a release misleads. `mapper/warp.js` and
  `mapper/warp.test.mjs` are byte-identical to `v1.4.0`; what changed is that
  `.github/workflows/ci.yml` runs `node --test mapper/warp.test.mjs` on every push and PR against
  `main`, on Node 22 and 24, 16/16 on both. Before this the contract test shipped here but was
  enforced by hand. PR #21.
- **2026-08-27: `v1.5.0` — the dummy string becomes the real worst case.** A **minor and not a
  patch**, because both what the tool previews and the boundary it emits change. The stand-in a
  `song-lyrics` slot is seeded with was measured against the whole song catalogue and lost: **36 of
  1088 lyric strings were harder than it**, 35 on the longest unbreakable run and one on hard rows.
  Muralista tunes against the worst case and emits a boundary Pregonero renders inside, so a
  stand-in that is not the worst case emits a boundary that is too generous — nothing spills on a
  wall, because Pregonero shrinks a line rather than spilling it, but those lines render smaller
  than tuned. The replacement beats the entire catalogue on all three axes at once. **No proportion
  moved and no schema moved**: it is a seed value. See **"The dummy string is the worst case, and it
  was measured (v1.5.0)"** below.

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
5. ~~**Text adapts to the shape**~~ **done** (PR #9, schema v7).
6. **Wall check on lyric legibility** — still owed, and the one acceptance criterion this layer has
   never had.
7. ~~**Brutalist restyle**~~ **done** (PR #10).
8. ~~**Tag `v1.0.0`**~~ **done 2026-08-23.** Repo private, website gate shut.

**The acceptance run is closed, 2026-08-23.** Lyric legibility at the wall **passed** — the
81-character Tragedia line reads. The media folder **passed**, including the full Chrome-restart
round trip. Adopt boundaries **passed** optically after `v1.2.2`. The alpha-WebM overlay **passed** —
base video and overlay start, stop and restart together. **The letter-width test was dropped by
Jorge**, correctly: its only purpose was to decide whether a control recommended by Cowork should
exist, and that is answered by whether he ever reaches for it, not by an exercise. If it stays
untouched over the next sessions, remove it. `v1-acceptance-run.md` is deleted.

<details><summary>Superseded: what was owed before the run</summary>

**Owed by Jorge, by hand, now that v1 is out:** lyric legibility at a wall (the 81-character worst
case, a wide strip and a tall column, low light, from the back — proportions are now arithmetically
right, whether it *reads* is unanswered); setting **Letter width** by eye at a real angled wall,
since the slider exists precisely for what no formula reaches and has only met synthetic quads; the
media-folder round trip once more; and authoring something for the alpha-WebM overlay, whose layer
type works and has no content.

</details>

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

### The integration contract — moved

Lives in **`projects/tramoya-integration/project-context.md`**, which owns it: the contract is a fact
about three tools and would go stale inside any one of them. Short form: the preparing tools write
files, Pregonero reads them, the handoff carries no data, Pregonero watches files rather than
speaking a protocol, and re-reading on change is right before doors and wrong mid-song.

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

## v2 backlog — from Jorge's first real use of v1.0.0 (2026-08-23)

Written after an extended hands-on session at the wall. Jorge's verdict on the release: *"this
rocks."* Everything below is a finding from use, not a design guess.

### The big one: one shape, many fills — MOVED INTO v1 by Jorge, 2026-08-23

**Jorge's cut, after testing:** there is no keep-out shape. You start a shape and choose its type,
and one of the types is **a colour-filled shape**. Separately, **every** shape gains an option to
**adopt the boundaries of a thing on stage**, captured as one frame with the thing and one without.
The performer mask is then just a black-filled shape that adopted a silhouette — a use of two
general features rather than a primitive of its own.

Consequence worth naming, because it is what makes the feature honest: **the capture detects a
difference, so the thing must be absent from one of the two frames.** It finds a person who walks
in, or an object placed and removed. It cannot find a painting that was on the wall the whole time.
And the shadow rule is unchanged for anything standing out from the wall: trace the shadow, not the
body, because the camera and the lens disagree about where a body is and never about where its
shadow is.

**Jorge, after testing: "I see little value in treating the keep-out as something other than a shape
filled with black."** He is right about the model, and the technical objection that produced the
split survives inside his version rather than against it.

The split existed because **content warping needs exactly four corners** — a homography maps a
square onto a quad, and a seven-point polygon has no homography. A keep-out carries no content, so
it needed none, which made "not a surface" the cheap answer. That was correct engineering and the
wrong user model: from the hand holding the mouse, everything on that wall is a shape, and the only
difference is what is inside it.

**The unification that works: a shape is an outline plus, when it carries content, a frame.**

- Every shape has an **outline**: N points, minimum 3, editable everywhere the same way.
- A shape carrying video, image or text also has a **content frame**: four corners, which is what
  the warp uses.
- A new shape starts as a square where outline and frame are the same four points. Adding points
  moves the outline away from the frame, and the content is warped by the frame and **clipped** to
  the outline.
- **Black is just another fill.** The keep-out stops being a separate primitive and becomes a shape
  whose fill is black — which also means it takes part in z-order like everything else, instead of
  being pinned above everything by a rule.

What this dissolves, all reported as separate complaints in the same session: the polygon missing
from the shape toolbox; point editing behaving differently in two places; black shapes being outside
the ordering model; and "can I have a polygon text shape" (yes, with the caveat that clipping cuts
words, so a lyric still wants a frame-shaped region).

Not free — it is a real refactor of the shape model — but it replaces two concepts with one, and the
concept it keeps is the one Jorge already has in his head.

**Everything in this backlog that Jorge hit again at the wall was built the same day, in `v1.1.0`
and `v1.2.0`.** What remains below is what he has not asked for twice.

### Fix before v2, small

- **Points that overlap can be dragged apart on a surface but not on a keep-out.** Same gesture,
  two behaviours, and the keep-out is the one that gets fiddly outlines.
- **"Pick file…" is offered on layer types that cannot use it.** It should be unavailable unless the
  layer is video or image.

### UX, deliberately deferred to v2

- ~~**Right angles want help.**~~ **Dropped by Jorge, 2026-08-23**, and correctly: "square in the
  projector's image" is not square on the wall, so a magnet toward 90° would fight a good mapping
  exactly when the projector sits off to one side and the correct shape is a trapezoid. Revisit only
  if the gap between what the camera sees and what the projector paints is ever properly corrected.
- **Simplify the sidebar**: group functions, use icons. The text layer's options in particular eat
  the panel.
- **Less explanatory prose.** The hints were written for a tool nobody had used. Somebody has used
  it now.
- **Drag to reorder z-order**, instead of the ▲/▼ arrows. Pregonero already uses `@dnd-kit`, so
  there is a house precedent.

### One media folder: keep it, and say so

The constraint is correct and the copying it forces is the point: **a gig has one bag of stuff.**
Everything for tonight in one folder means the folder plus the configuration is portable to any
machine. Several folders would force the configuration to record *where* each file lives, which
turns a list of names into a list of locations and breaks the property that makes it portable.

The real cost is duplication, irrelevant for logos and not irrelevant for animation masters, given
`animations/` is 66 GB. **Untested and worth five minutes: whether a symlink inside the chosen
folder resolves through the File System Access API.** If it does, a gig folder can be a folder of
pointers and the cost disappears. **Make the one-folder rule explicit in the README** either way.

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

## Song-aware shape types (v1.3.0, 2026-08-24)

> **TWO OF THESE FOUR TYPES NO LONGER EXIST** (v1.18.0, 2026-09-04). `song-intro` and `gig-contact`
> were retired; see *Two types left, and the vocabulary shrank back toward shapes on a wall* below.
> Everything in this section about the intro template, its stand-ins, its proportions and the QR
> file is **history of a thing that was here**, kept because the reasoning still explains why the
> template looks the way it does — Pregonero draws it now, unchanged.

**The design is not this file's.** It was decided in the integration design sessions and lives in
`projects/tramoya-integration/project-context.md` — "Song-aware shape types, and two levels of visual
setup", "The `song-intro` template", "The lookup returns a set", and "Muralista's boundary does not
move, and dummy text is why" — with the file shapes in
`projects/tramoya-integration/docs/gig-file.md`. What follows is only what building it decided, which
is the part those documents left open.

### `TEXT_ROLES` retires into the type, and the migration is a rename

`role: "lyrics"` becomes type `song-lyrics`; `role: "static"` becomes a plain `text` layer. Nothing
else moves — string, size, aspect, alignment, colour and outline all carry across — so **a v8 mapping
opens under v9 and paints an identical frame**, verified (see below). The alternative considered and
rejected was migrating a lyrics layer onto the fixed dummy string: it would have thrown away a line
Jorge pasted in on purpose, to gain nothing the next click could not.

**The dummy is a default, not a hardcoded render.** A `song-lyrics` shape carries an editable preview
string, seeded with `LYRICS_PREVIEW_TEXT` the moment the type is chosen. Making it uneditable would
have made the migration lossy and would have removed the only handle for tuning against a line whose
length actually matters; making it default to empty would have let a shape look finished while
carrying nothing. The string itself is Jorge's and is not the implementer's to pick.

### Two of the intro's three parts are stand-ins, and they say so on the wall

The title is real when a gig is connected and a song is being previewed, because song ids and titles
are exactly what `gig.json` gives up. **The translation and the tagline live in the song file, which
is below Muralista's line**, so they are placeholders that read as placeholders. The tagline
placeholder is deliberately long: it is the fragile part of the template and the proportions are most
likely to be wrong about it.

`gig.json`'s example in `gig-file.md` carries song ids with no titles while the prose governing it
says titles are what Muralista reads. `readGigFile` takes a title if there is one and falls back to
the id, which is the honest reading of a file that has neither.

### The QR code is a file, not a generator

`gig-contact` names a media file for its QR and resolves it through the media folder like any other
source. **Muralista does not encode one.** It has no build step, no dependencies and no network, and
a hand-rolled QR encoder here would be several hundred lines of error-correction arithmetic whose
failure mode is a code that scans as the wrong URL. A PNG generated elsewhere can be checked with a
phone off the wall before the doors open, which is the only test that counts.

The contact line is forced onto one line (`white-space: nowrap`, plus a sanitizer that collapses a
pasted newline). "One line of text plus an optional QR code" is the design; without the rule it is a
description that a long line quietly breaks.

### The proportions live in the stylesheet, and only there

Every measure in the intro card is a multiple of `--t`, the title size, which auto-fit binary-searches
over — so the whole block shrinks as one thing and the mock's proportions survive at any size. They
are `calc()` expressions in `mapper.css`. `mapper.js` keeps exactly two of them, the ceiling the fit
searches below and the inset the layout box is padded by, because JS is the only thing that reads
those. An earlier draft had all ten as JS constants that nothing read: two copies of one fact,
waiting to disagree.

### The gig-level default is adopted, not configured

The first shape given a song-aware type becomes the gig's default for it, with no second gesture. The
overwhelmingly common room has one of each, and this is what "the authoring UI offers one shape per
type for now" looks like from the hand's side. A type that already has a default is left alone: the
second lyrics shape is an alternative to pick, not a silent replacement. **A migrated `song-lyrics`
shape gets no default**, because migration happens with no gig in sight; the gig assignment row shows
"None" and one click fixes it.

**No size-one cap exists anywhere.** The picker offers one shape and the model holds a set; a
hand-edited `visuals.json` naming two already resolves to two and lights both, and the picker says
"2 shapes (edited by hand)" rather than silently truncating it.

### Song visual setup is a mode, and the wall shows it

While a song is selected, the output previews that song: shapes it does not point at are **not
rendered**, and the contact panel is dark because a song is playing. In gig visual setup nothing is
dark — no song is playing at a desk, and you cannot place a shape you cannot see. The control preview
dims and dashes the same shapes, so the desk and the wall agree.

### Ungating the types from the gig: declined, with a trigger (Jorge, 2026-08-25)

**The type gate B3 shipped stays exactly as it is**, and a gig-less mapping stays unpersisted. Full
reasoning and the analysis behind the alternative live in
`projects/tramoya-integration/project-context.md`, "A gig as a source of input: considered and
declined", which owns the decision.

The short of it: needing a gig was proposed as a cost worth removing, and **creating a gig is
something Jorge does before visiting a venue anyway**, so the cost is not real. **Revisit once
Muralista is being used several times** — the argument is entirely about repetition and earns its
keep only when the repetition is.

**Worth keeping from the analysis, because it is a true fact about this tool's boundary:** the gig
supplies only the room's identity and a list of named subjects, and **only `bySong` consumes the
second**. None of the four types needs song content. Whoever revisits this starts there.

### What is verified, and what is not

**Verified in real headed Chrome against the rendered output**, with the output role driven in a
1280×800 iframe so both builds could be measured at identical dimensions:

- **The migration.** A v8 mapping carrying both text roles, a six-point clipped outline, a fill with a
  margin and a test pattern was rendered under the `main` build and under this one, and every property
  that determines the painted frame was compared: the pattern layer's canvas as a PNG data URL, every
  `matrix3d`, every `clip-path`, the fitted font sizes, the counter-scale, the strokes, the shadows,
  the colours and the text. **86,076 characters, identical.**
- The boundary: a stand-in gig folder handed the tool a full `gig.json`, and `gig` came back holding
  `id`, `venue` and `songs` (id and title) — no `setlist`, no `date`, no `file` paths.
- Per-song reassignment, the set of two, the type-picker gate with and without a gig, the empty-gig
  message, `visuals.json`'s contents, and the four new types painting at the projector size.

**Not verified, and it is the same gap the media folder has:** `showDirectoryPicker` opens an OS
dialog no browser automation can drive, so the gig folder was exercised through a stand-in handle.
**The round trip only a person can run is: pick a gig folder, quit Chrome, reopen, and see whether it
comes back granted or asks to reconnect** — and, once, that `visuals.json` really appears on disk
beside `gig.json`.

**Never read off a wall.** The intro template's proportions, the contact panel's QR size and the
placeholder text were all judged on a monitor. **The tagline is the first thing to check from the back
of a real room**, and the QR is the second: it has to scan from where people actually stand.

## The warp as shared code (v1.4.0, 2026-08-25)

**The contract is not in this repo, and that is deliberate.** `projects/tramoya-integration/docs/warp-contract.md`
owns it, on the same principle as `gig-file.md`: how two tools agree is a fact about two tools at
once, and it belongs where both are in view. This repo owns the **code**, because ownership of the
warp belongs where it can be proved right — Muralista has the camera and closes the loop against a
real wall; Pregonero cannot tell you whether a warp is correct, because it cannot see the wall.

**What moved:** `solveLinearSystem`, `computeHomography`, `homographyToMatrix3dString`,
`applyHomography`, `UNIT_SQUARE_CORNERS`, `UNIT_SIZE`, `UNIT_SRC_CORNERS` and `frameMatrix3d` — the
whole `WARP` section, byte for byte. Six of those are exported; the Gaussian elimination and the
unit-box source corners stay private, because no caller needs them and a smaller surface is a
smaller promise. Nothing that touches an element, a document or app state went with them.

**mapper.js became a module, and one consequence is worth knowing rather than rediscovering.**
Strict mode is not it: mapper.js has declared `"use strict"` since it was written, so the module's
strictness changes nothing. What does change is that nothing mapper.js declares at top level lands
on `window` any more, so the DevTools console can no longer poke at the app's internals. That costs
nothing for how this repo actually verifies itself — "check what is *painted*, not what is
reachable", since the 2026-07-02 desk pass — but it does change the debugging reflex.

**The cache-busting token had to be extended to reach it.** A relative specifier inside a module
does NOT inherit the query string of the importing file: `"./warp.js"` seen from `mapper.js?v=123`
resolves with no token at all, which is the stale-subresource bug again and this time on the file
whose numbers decide where every shape lands. `mapper.html` now writes an **import map** before the
module graph is fetched, so mapper.js keeps a plain `"./warp.js"` and still gets the busted URL. An
import map is the browser's own answer and needs no build step, which is the constraint the whole
module is built under.

**Why `frameMatrix3d` takes the output size and always will.** The corners are normalised and
resolution-independent; the matrix is built in real stage pixels. The projector at a venue is not
the display the room was mapped on, so a matrix frozen into `visuals.json` — or cached across a
resize — renders perfectly and lands in the wrong place, with nothing crashing and nothing warning.
Save the recipe, not the cake.

**No package registry, no submodule, no build pipeline, and the trigger for revisiting that is
named in the contract:** a *third* consumer, or the day Pregonero needs the warp changed for a
reason Muralista does not share. Until then, ceremony for 157 lines.

**How this build was verified.** The contract test (`node --test mapper/warp.test.mjs`, 16
assertions) pins the maths against golden `matrix3d` strings. Muralista's own behaviour was checked
the way this repo always checks: a six-shape mapping — pattern, text, fill with a five-point
outline, `song-lyrics`, `song-intro`, `gig-contact`, including quads that overshoot the frame — was
loaded into both the `main` build and this one, and the output window's painted result compared
node by node at two output sizes, 1280x720 and 1024x768. Every `matrix3d`, `clip-path`, computed
font size, stroke, colour and bounding rect matched, and so did the pattern canvas hashed as a PNG.
The same real-mouse click and arrow-key nudge on both builds persisted identical geometry.

## The dummy string is the worst case, and it was measured (v1.5.0, 2026-08-27)

**Why this mattered enough to be a release.** Since 2026-08-27 the stand-in is load-bearing:
*Muralista tunes against the worst case and emits a boundary; Pregonero renders the real lyrics
inside that boundary* (Jorge — the decision lives in
`projects/tramoya-integration/project-context.md`, "Muralista sets the boundary, Pregonero renders
inside it"). That only holds if the stand-in genuinely is the worst case. It was not.

**The measurement, re-run rather than taken on trust.** The metric is Pregonero's
`src/worstCase.ts` `difficultyOf()`, used verbatim so the two repos are talking about the same three
numbers: **length** (characters, hard breaks themselves excluded), **longest unbreakable run** (the
longest whitespace-free token, punctuation included) and **hard rows** (rows the string arrives
already committed to). A string is harder on **any** axis, not all three. The corpus is every
`lyrics[].{es,en,fr,nl}` value in `songs/` — 13 song files, `_template.json` excluded — which is
**1088 strings**, the same population round G reported.

| | length | longest run | hard rows | beaten by |
|---|---|---|---|---|
| old stand-in | 91 | 11 | 2 | **36 of 1088** |
| catalogue worst | 91 | 19 | 3 | — |
| new stand-in | 120 | 24 | 3 | **0 of 1088** |

The 36 split 35 on the longest unbreakable run and 1 on hard rows (`paso`'s English, three rows);
**none on total length**. The run offenders are the Dutch compounds — `ontdekkingsreiziger` at 19,
then `zonnestraaltje`, `triomfantelijk`, `dichterswonden` — plus French hyphenates like
`recommence-t-il`, which the metric correctly refuses to treat as breakable.

**The old stand-in was a real catalogue line, which is why it lost.** It is
`tragedia-de-cerdo-asado.json` line 6 in Dutch, verbatim. That made it the longest string in the
catalogue and nothing harder — a good worst case on the axis it was picked for and an average one
everywhere else. The new string keeps its opening clause and rewrites the rest to beat the catalogue
on all three axes at once.

**Two numbers in the vault were wrong and are corrected here.** The old stand-in is **91**
characters, not the 89 recorded in `tramoya-integration/project-context.md` and in the docstring of
Pregonero's `worstCase.ts` — the code was always measuring 91, so only the prose was wrong. And the
new string's longest run is **24**, not 23: `modderplasherinneringen` is 23 letters, but the token
`difficultyOf()` sees carries the closing period, exactly as the old stand-in's 11 was `modderplas.`
and not `modderplas`.

**IT IS DELIBERATELY AWKWARD DUTCH.** Nobody would say `modderplasherinneringen` out loud, and that
is the point: it is a test fixture whose job is to be worse than anything real, not a draft in
Jorge's voice. The comment beside it in `mapper.js` says so, because the failure mode here is
somebody improving the prose and silently loosening the guarantee.

**What it costs on screen, measured in the real output window at 1920x1080** (four axis-aligned
shapes, `maxSize` at its 0.2 default, auto-fit doing the rest):

| shape | old stand-in | new stand-in |
|---|---|---|
| half wall, 960x540 | 82.4 px | 67.3 px |
| tall side panel, 346x864 | 51.1 px | 24.2 px |
| narrow column, 192x648 | 28.4 px | 13.5 px |
| small panel, 384x194 | 29.7 px | 24.8 px |

**On the narrow shapes the preview halves.** That is the size of the error being corrected: tuning
against the old string on a side panel was tuning against a line rendering at twice what the
catalogue's worst case will render at.

**The `song-intro` template is untouched by this, and that is a fact worth writing down** because it
is easy to assume otherwise. There are **two independent stand-ins** in this file.
`LYRICS_PREVIEW_TEXT` seeds a `song-lyrics` slot and has exactly one consumer, `setLayerType()`.
`INTRO_PLACEHOLDER.tagline` — *"The tagline from the song file goes here, and it is the smallest
thing on the wall."* — is what `applySongIntroLayer()` paints, and it never reads the lyric string.
Verified twice: by the call graph, and by measuring the intro tagline in the output window with each
string in place, which gives **the same four numbers to three decimals**. The half-wall case
reproduces the recorded **24.2 px** exactly (24.189 on a 960x540 shape), which also confirms the
recorded ceiling of 4.48% of shape height — `INTRO_TITLE_MAX_SIZE` 0.16 times the tagline's 0.28.

**No proportion was touched and none should be.** If the wall says the tagline is too small the fix
is a minimum floor in `.intro-tagline`, not a bigger ratio, for the reason already recorded in the
integration file: a bigger ratio inflates the tagline in the large-shape case where it is fine, and
costs the title its dominance everywhere.

**One thing this change cannot reach.** The dummy is the *default of an editable field*, not a
hardcoded render — deliberately, so a pasted line survives migration. So a mapping made before
v1.5.0 still carries the old string in its lyrics slots and still previews too generously. There is
no migration and none was added: telling a hand-typed line from an untouched default is a schema
decision, not an implementation one. **Re-seed by switching the shape's type away and back, or by
emptying the field.**

## The intro placeholder is the worst case too (v1.6.0, 2026-08-27)

**Muralista has two independent stand-ins, and only one of them had ever been measured.** v1.5.0
held `LYRICS_PREVIEW_TEXT` to the real catalogue and replaced it. `INTRO_PLACEHOLDER` — the three
strings `applySongIntroLayer()` paints — had never been measured against anything at all. Its
tagline read *"The tagline from the song file goes here, and it is the smallest thing on the wall."*,
which is a **description**, not a worst case.

**It mattered more than the lyrics one did.** The tagline is the fragile part of the whole design:
smallest thing on the wall, carrying the sentence the room is meant to leave with, and named as the
first thing to check at a real wall. Tuning it against a stand-in gentler than reality is exactly
the v1.5.0 error, on the part with the least margin.

**The corpus.** Same `difficultyOf()` metric as v1.5.0 — Pregonero's `src/worstCase.ts`, used
verbatim so the two repos report the same three numbers — over `songs/`, 13 song files with
`_template.json` excluded. The intro template has three parts and each has its own population:

| part | population | strings | max length | max run | max hard rows |
|---|---|---|---|---|---|
| title | `title` | 13 | 23 | 9 | 1 |
| annotation | `title_translations.{es,en,fr,nl}` | 52 | 32 | 9 | 1 |
| tagline | `intro.{es,en,fr,nl}` | 52 | 80 | 14 | 1 |

`title` equals `title_translations.es` in **all 13 files**, so the 13 titles are a subset of the 52
annotations: the title axis is backed by 52 strings, not 13, and the annotation's `(32, 9)` bounds
it. That is what makes a 13-string population usable — it is not a sample, it is the whole
catalogue, and it is contained in a larger one.

**The old stand-in lost on four of the nine comparisons**: title on length (20 v 23) and longest run
(5 v 9), annotation on length (26 v 32), tagline on longest run (8 v 14). Only the tagline's length
was already safe.

**THE TITLE IS WHAT BINDS, and that was the surprise.** Everything in the card is a multiple of
`--t`, the title size, which auto-fit searches over; the tagline is 0.28 of it and the annotation
0.20. So an unbreakable run costs the tagline 3.6 times less than it costs the title. Fitting each
part alone on a 346x864 shape: **title 43.39, tagline 97.31, annotation 128.08, whole block 43.39.**
The title decides the size of all three every time the fit leaves its ceiling — **a nastier tagline
alone would have fixed nothing**, which is what makes measuring all three parts the point rather
than a formality.

**The replacement**, in `mapper.js` beside a comment saying it is a fixture:

```
annotation: "TRANSLATED TITLE GOES HERE, MODDERPLASLIED"
title:      "SONG TITLE GOES HERE, MODDERPLASLIED"
tagline:    "The tagline from the song file goes here, and it is the smallest
             modderplasherinnering the room takes home."
```

| part | length | longest run | hard rows | corpus max |
|---|---|---|---|---|
| title | 36 | 14 | 1 | 23 / 9 / 1 |
| annotation | 42 | 14 | 1 | 32 / 9 / 1 |
| tagline | 107 | 21 | 1 | 80 / 14 / 1 |

**Each part still names itself in plain English**, because saying so on the wall rather than
pretending is a design property of these two fake parts, not filler. The awkward Dutch carries the
unbreakable run and nothing else. **`MODDERPLASLIED` and `modderplasherinnering` are fixtures**, not
prose in Jorge's name — his rule about writing Dutch he would actually say governs drafts in his
voice, not a string whose only job is to be worse than anything real.

**Hard rows stay at 1 deliberately.** The corpus max is 1, and `.intro-tagline` has no
`white-space: pre-line`, so a `\n` in any of the three renders as a space. A stand-in carrying one
would be claiming a row the template cannot paint. Beating the corpus on this axis means matching it.

**The four tagline sizes, re-measured — with the shapes written down this time.** Painted at
1920x1080, axis-aligned quads, tagline in real wall pixels:

| shape | quad | old stand-in | hardest real content | new stand-in |
|---|---|---|---|---|
| half wall | 960x540 | 24.19 px | 24.19 px | 24.19 px |
| tall side panel | 346x864 | 29.36 px | 16.33 px | 10.50 px |
| narrow column | 192x648 | 16.29 px | 9.05 px | 5.82 px |
| small panel | 384x194 | 8.69 px | 8.69 px | 8.69 px |

**The half wall and the small panel sit at the auto-fit ceiling in all three columns**, so nothing
moves there: the ceiling is `INTRO_TITLE_MAX_SIZE` 0.16 times the tagline's 0.28 = **4.48% of the
shape's height**, which is 24.19 px on 540 and 8.69 px on 194. Every number that is not at the
ceiling changed.

**The middle column is the size of the error being corrected.** On a side panel the old stand-in
previewed the tagline at 29.36 px when the hardest thing the catalogue can actually put there
renders at 16.33 — **eighty per cent too generous**, on the part with the least margin. Same shape
of failure as v1.5.0's, and worse in consequence.

**These four shapes are not the four the 2026-08-24 numbers were taken on.** Those were 24.2, 19.0,
11.4 and 9.2 px, and only the half-wall case could be reproduced, because the quads were never
recorded — 19.0, 11.4 and 9.2 are **unreproducible and are now history, not a baseline**. The four
above are the four already written down in the v1.5.0 lyrics table, reused so the intro and lyrics
measurements are directly comparable, and **every number here carries its quad**. Anyone
re-measuring records the quad or the number is worthless.

**No proportion was touched and none should be.** 5.82 px on a narrow column is a finding for a real
wall, and the agreed answer is a **minimum floor in `.intro-tagline`**, never a bigger ratio: a
bigger ratio inflates the tagline in the large-shape case where it is already fine and costs the
title its dominance everywhere.

**How it was measured.** `mapper.css` verbatim, the intro card's DOM built exactly as
`createSongIntroLayerElement()` builds it, and `layOutScaledBox()` and `fitScaledBlock()` copied
from `mapper.js` with only whitespace differing — driven in real headed Chrome. Wall pixels are the
fitted `--t` times the part's ratio times the quad's height over `UNIT_SIZE`, which is what
`matrix3d` does to the unit box. The one number the vault had pinned, the 4.48% ceiling, reproduces
exactly.

## The gig can arrive as an endpoint, not only as a folder (v1.7.0, 2026-09-01)

**One condition at the top, exactly the way `?output` already is.** With no `gig` parameter in the
URL, nothing in this section runs and the tool behaves as it always has: `showDirectoryPicker`, a
directory handle in IndexedDB, and a direct write through it. **Muralista staying fully usable on
its own is a requirement about this repo**, and this is what keeps it true rather than claimed.

**Why it exists, and it was forced rather than chosen.** A host that has already created a gig's
folder cannot hand it over. A `FileSystemDirectoryHandle` can only be minted by `showDirectoryPicker`
under a user gesture — Chromium admits no path-to-handle route, by design, and Electron exposes no
hook to answer or pre-seed the picker. So a hosted Muralista was asking for a folder its host created
and already knows the path of. **A question with one knowable answer is not a question**, and this
one fails silently: pick one level too high and `visuals.json` lands beside the poster, where nothing
looks for it, with no error anywhere.

**What Muralista learns, and it is only this:** that something served this page and accepts a write
at a place relative to it. `?gig=<relative URL>` is the whole interface. **An absolute URL is
refused** — a scheme or a protocol-relative `//host` is ignored and the tool falls back to the
picker. That is not a formality: refusing it is what stops a host's name, port or scheme ever
reaching this file. Muralista does not know what is on the other end, and must not.

- **Read**: `GET <base>gig.json`. A 404 is reported as a missing file, the same sentence the folder
  path produces for the same condition.
- **Write**: `PUT <base>visuals.json`, **the same bytes** `visualsDocument()` produces for the
  folder path. What happens to them is not this tool's business.

**The boundary is untouched.** `readGigFile` is still the one place the parsed gig is touched and
still projects it down to `{id, venue, songs}`; `visuals.json` still carries only what
`visualsDocument()` puts in it; `gig.json` is still never written.

**The sidebar loses its folder controls when hosted and keeps `Reload gig.json`.** There is nothing
to pick, nothing to remember and nothing to reconnect — but the gig is still a file somebody else
wrote and may have rewritten while this window was open.

## A folder with no gig in it names the mistake that actually happens (v1.7.0, 2026-09-01)

**Standalone only, because hosted never picks.** `gig.json` lives in `<gig>/setup/`, so a picked
folder with no `gig.json` in it is usually the gig folder itself, one level too high. When the
picked folder *has* a `setup/gig.json`, the tool says that, by name, instead of the generic
sentence.

**It warns, it does not refuse.** Opening Muralista on a folder that is not a gig at all is a
legitimate thing to do — mapping a wall needs no gig, and the song-aware types are simply not
offered. Refusing would take that away to prevent a mistake a sentence prevents just as well.

## The tool becomes a flow, and the flow takes the picture (v1.8.0, 2026-09-03)

**Ruling: `tramoya-integration/project-context.md`, "Step 9.3 — Muralista's flow, designed
2026-09-03".** Round one of two. Round two is conditional visibility, alone, and nothing here
depends on it.

    THE DEAL  ·  1 LAYOUT  ·  2 SHAPES  ·  3 OUTPUT

**Step 2 is the canvas exactly as it was.** The flow is a shell around the tool, not a second tool,
and that is the whole reason it could be one round: the expensive screen already existed.

### THE DEAL is its own cell, and the signal is the world

**Not merged with screen 1**, because a deal states cost and gift *once* and screen 1 asks a question
that has to be answered every gig. Merging them makes the deal unskippable forever, or makes the
choice vanish after the first gig.

**The signal is whether a mapping already exists, and it is never a flag.** Hosted, whether this
gig's endpoint answers for `visuals.json`; standalone, whether Muralista's own storage holds a room.
A "seen it" flag would be a second copy of a fact the world already carries, which is the class of
state this suite keeps deleting.

**A read that fails answers *no*.** Showing the deal to somebody who has seen it costs one press;
skipping it for somebody who has not costs the whole explanation.

**The copy is verbatim from the ruling** and every clause in it was argued. It is not to be
paraphrased, tightened or re-voiced.

### 1 LAYOUT, and what the default actually is in round one

**Keep the default, or adjust it — never *default, or a blank wall*.** Custom starts as the default,
already placed.

**Keeping the default makes MURALISTA write the `visuals.json`**, which is the 02/09 ruling made
literal: the default belongs to this tool, so this tool is what puts it on disk, and nothing is
written on behalf of a tool that did not run. Then straight to 3 OUTPUT.

**Standalone with no gig has no screen 1 at all** — no gig means no songs, and the default has
nothing to act on. That is the question *not arising*; the screen has not moved to Pregonero. The
cell is absent rather than dimmed, because dimmed says *later* and this is not later.

**THE DEFAULT IS TWO SHAPES HERE, AND THE DESIGN DESCRIBES THREE. Named because it is a difference,
not an oversight.** The designed default — video across the frame, lyrics at the foot while the
video is filled, lyrics across the frame while it is empty — is written in terms of **conditional
visibility**, which is round two and is deliberately held. The ruling also says *nothing in round one
depends on it*. So round one's default is the layout that needs no condition and is the one this
suite has already played two gigs on: **the frame, with the lyrics over it** — a frame-filling
`song-video` and a frame-filling `song-lyrics` above it. It satisfies *default costing nothing and
giving a frame that works*, and it is what round two attaches its conditions to.

**Seeding only ever fills an empty room.** A room that already has shapes is somebody's afternoon,
and `keep the default` is disabled with the reason attached rather than being a press that quietly
throws it away.

### 2 SHAPES is gig level only

The room's shapes and each one's type. **No song selector and no per-song anything**: song visual
setup is deferred entirely. The mode picker and the song half are **shut, not torn out** —
`visualSetupMode` is still a real variable and the reassignment model is still correct. This defers a
screen; it does not delete a model.

### 3 OUTPUT is named for doing

**`OUTPUT` rather than `PREVIEW`, and it was Jorge's correction**: that screen is where you take the
picture and save the room, and *preview* implies looking only. It also makes the two flows rhyme,
since Bombista's step 3 is the same role under the same name.

**The preview uses Muralista's own stand-in content and never reaches for the setlist.** It already
did — `LYRICS_PREVIEW_TEXT` is the whole boundary — and nothing here changed that.

**`Save visuals.json` came off the sidebar.** With the save on 3 OUTPUT, keeping it in both places
would be two controls with the same name doing the same thing. The *status* line stays, because it is
a fact about the folder rather than a second way to act on it.

### The stage capture, and it is in output space or it is worth nothing

**A photograph of the stage taken through the calibrated camera, saved as `stage.png` with the gig.**
It is what makes Jorge's actual workflow honest: Monday at the venue with the projector and camera
where they will stand, Wednesday at home moving things around, Friday at the venue reconfirming.

**Why not the photo backdrop that already exists.** You photograph the wall, **crop the photo to the
projector's throw by hand**, load it, draw on it, then walk to the wall to find out what you got —
and any error in that crop becomes a **fixed offset in every shape you drew**. This repo's own
*Limits* section has said so since it had a backdrop. There is no crop step here.

**The transform is the calibration run backwards, and that is the part that gets a test.** `Adopt
boundaries…` carries traced *points* from camera space to output space with
`computeHomography(project.cameraQuad, UNIT_SQUARE_CORNERS)`. An *image* has to be carried the other
way: stand on each output pixel and ask the camera what is there, which is
`computeHomography(UNIT_SQUARE_CORNERS, project.cameraQuad)`. The source is the **raw** frame,
because `project.cameraQuad`'s points were placed on the untransformed feed and `drawImage(video)`
yields exactly that.

**It has its own file and its own `node --test` suite**, `mapper/stageCapture.js` and
`mapper/stageCapture.test.mjs`, for the reason `warp.js` has one: **a capture taken the wrong way
through the calibration still looks like the stage**, and the shapes drawn on it then land somewhere
else at the venue, in front of people. The asymmetric and keystoned cases are what would catch it;
the centred one passes either way and the test says so out loud.

**A degenerate or missing calibration produces nothing, and there is deliberately nothing to fall
back to.** A raw camera frame is exactly the offset this exists to remove.

**Verified end to end in headed Chrome against a synthetic camera frame** (2026-09-03): a lit
rectangle occupying the middle half of the camera's view, painted in four quadrant colours, came back
filling the 1600×900 output with each colour in its own corner. A raw frame would have carried the
grey surround with it.

**Three consequences, named rather than hidden.**

- **The gig folder gains a binary.** `setup/<id>/` held two JSON files and now holds an image beside
  them. Machine territory, so no boundary moves — the poster and the contract are one level up.
- **Authoring only.** It never reaches the output window, and nothing in the output role knows the
  file exists.
- **The camera lives in 2 SHAPES's sidebar, not on 3 OUTPUT**, so every blocker sentence on the
  capture **names the screen to go to**. A requirement stated with nowhere to go is the dead end this
  suite has a rule about, and the bar is one press away — the sentence has to say which press.

### What this round found and did not close

**Muralista still never reads `visuals.json` back.** It writes it and forgets it. With the deal's
signal now reading that file, a machine that has *not* mapped this room but whose gig folder *has*
one skips the deal and lands on an empty canvas. That is the pre-existing write-only asymmetry
surfacing somewhere new, not something this round introduced — and reading the file back is a design
question nobody has answered, so it is named here and left. **It bites the design's own Wednesday if
Wednesday is a different machine from Monday.**

## The handed-in visuals.json always wins (v1.9.0, 2026-09-03)

**Ruling: `tramoya-integration/project-context.md`, "The handed-in `visuals.json` always wins".**
This closes the gap `v1.8.0` left open and reported.

**The rule, in one line: Muralista keeps a local copy only when it was NOT handed one.** No merge,
no conflict resolution, no arbitration between two stores.

**What round one shipped, and why it had to be fixed.** `v1.8.0` was write-only: this tool never
read a `visuals.json` back, so a machine with no local mapping whose gig folder had one **skipped
the deal and landed on an empty canvas** — the deal's signal read the file and the canvas did not.
The app said *you have done this before* and showed nothing.

### The three consequences, and all of them are intended

| | |
|---|---|
| **In a gig context the local store is never consulted** | Work done standalone on the same room is ignored when that room is opened with a gig. The gig's file is the record for that gig. |
| **Editing inside a gig writes to the gig folder only** | `commitProjectChange` skips `saveProject` while a gig is connected, so the local copy cannot shadow the file and the two cannot drift. |
| **The local store is for the case nobody handed a file over** | Standalone with no gig — the only time this tool has to remember a room by itself. Unchanged. |

**Hosted never reads the local store at all**, because `isHostedGig()` is known synchronously: the
gig's file arrives a moment later and would replace it, and a local room painted in between is a
room somebody sees and reaches for. **A remembered gig *folder* is discovered asynchronously**, so
that one case paints the local room for a tick and then adopts the gig's — never persisted over,
never written back.

### Disconnecting is the exact mirror, and that is the one thing the ruling did not spell out

**Clearing the gig hands the local store back.** Connecting adopts the gig's file and ignores the
local room; disconnecting restores it, because from that moment nobody is handing a file over and
the local store is what standalone means. **Nothing is thrown away either way**: the gig's afternoon
is in the gig's file and the standalone afternoon is where it always was.

**The alternative was keeping the gig's room on screen and persisting it locally on the next edit.**
Rejected twice over: it copies a handed file into the store the rule says exists only when nothing
was handed over, and it silently replaces whatever standalone work was there. **This supersedes the
old comment on `clearGigFolder`** — *the assignments stay in the project, they are authored work* —
whose intent is served better by the mirror, since both afternoons survive rather than one.

### A file naming another gig is refused, not loaded

Copying last month's gig folder to start the next one and not re-mapping gives **a mapping of the
wrong room that renders perfectly with nothing reporting it**. Pregonero already refuses exactly
this on exactly this field; the two now agree. The refusal is named in the status line, in the fail
colour, and the canvas is **empty rather than falling back to the local room** — an empty canvas
beside a named refusal is a state somebody can act on, and the fix is in the folder.

A `visualsVersion` this build does not write is refused the same way.

**Everything read goes through `migrateProject`**, which is already the single enforcement point for
arbitrary JSON on load and on import. A gig folder is a folder somebody can edit, and a ring under
the three-point floor would otherwise paint as a degenerate polygon with no visible cause at a
projector.

### Two smaller consequences

- **The deal's signal is one read now, not two.** It used to `GET` the gig's `visuals.json` when
  hosted and check the local store standalone. The gig's file is loaded by the time the question is
  asked, so *are there shapes* answers both — **and the two can no longer disagree**, which is
  exactly how round one shipped a deal that said *you have done this before* over an empty canvas.
- **Reloading discards unsaved edits to the room, and the button says so.** `Reload gig.json`
  stopped being true the moment the room came back with it; it reads **`Reload from the gig
  folder`**. Re-reading the folder means taking what the folder says, which is the rule rather than
  a side effect.

### What is verified, and what is not

Walked in real headed Chrome against a served gig folder: a gig with a room and no local mapping
loads the room; a gig with a room and a *different* local mapping loads the gig's and leaves the
local store untouched; an edit inside a gig writes nothing to `localStorage`; a `visuals.json`
naming another gig is refused by name with an empty canvas; standalone with no gig reads and writes
the local store exactly as before.

**`clearGigFolder`'s restore is code-verified only.** Reaching it needs `showDirectoryPicker`, which
no browser automation can drive — the same limit this repo already records for the media and gig
folders. The round trip only a person can run is: pick a gig folder, look at its room, press
`Clear`, and see the standalone room come back.

## The stage capture becomes a backdrop (v1.10.0, 2026-09-03)

**Ruling: Jorge, 2026-09-03.** `v1.8.0` wrote `stage.png` and **nothing read it**. Code asked
whether the capture should become `project.photo` or a new authoring-only field; **it is neither new
thing — it is an option in the Backdrop dropdown**, beside a photo and the live camera.

**This is what makes the capture worth having.** A file saved into a gig folder that nothing loads
serves nobody, and this one was built for one purpose: **setting the room up at home, against a
photograph of the stage taken through the calibrated camera, without going back to the venue.**

**It loads down the same path a chosen photo takes.** `loadBackdropPhotoFile` takes a Blob as
readily as a `File`, so the downscale, the dataURL and every failure message are the ones that were
already there rather than a second set that can drift from them. **The broadcast cost is accepted**:
it already exists for any chosen photo, and it is the same cost.

**Offered only when the gig's folder holds one.** An option that is always present and usually does
nothing is a control you have to try in order to understand. The option is *hidden*, not disabled —
a disabled row inside a dropdown you must open to see it is not the same kind of thing as a disabled
button on the screen, and there is no action here to explain: the capture is either there or it is
not. A capture that has gone since the option was offered says so and stops being offered.

**Taking one offers it immediately**, without a reload: the file screen 3 just wrote is the file the
dropdown looks for, so `captureStage` sets the flag it would otherwise learn on the next gig read.

**`stage` is a photo whose source is the gig**, and everything downstream treats it as one:
`isCameraMode()` is false, `renderBackdrop` draws `project.photo`, and both `Clear` and
`Choose photo…` still work on it.

**It is not persisted, and it cannot be** — which is why `migrateProject`'s rule that anything but
`camera` is `photo` needed no change. `stage` is reachable only while a gig is connected, and since
`v1.9.0` a connected gig means the project is not written to the local store at all. **So a loaded
project can never carry this mode**, and re-picking it after a reload is one press with the dropdown
saying it is there.

**Walked in real headed Chrome** against a served gig folder: with a `stage.png` present the option
appears and picking it puts the capture behind the shapes as a downscaled JPEG dataURL — the photo
path's own output, which is the evidence it went down that path and not a second one. With the file
removed the option is hidden.

## Two types left, and the vocabulary shrank back toward shapes on a wall (v1.18.0, 2026-09-04)

`song-intro` and `gig-contact` stopped being shape types. **Pregonero renders the intro card and the
contact panel into a shape that already exists — the video frame or the song lyrics shape — and
decides which.** The ruling is Jorge's, from his walk of Pregonero `v0.61.0`; the full text is in
`projects/tramoya-integration/project-context.md`, *The intro and the contact leave Muralista*.

**THE LINE: Muralista owns where things are, Pregonero owns what is showing when.** An intro is a
*when* — before the cue — and a contact panel is a *when* — after the last song. Neither needs a
place of its own.

**The photographs settled it.** On the canvas both looked like neat rectangles of equal standing. On
the wall the intro landed on the whiteboard and the contact on bare planks, dim and low-contrast, on
a surface that is not the surface — because a shape that is up only when nothing else is still had
to claim its own territory. Under this ruling it needs none.

**This reversed two decisions and both were named.** 24/08 gave the intro its own shape precisely so
its text could size independently: **the template's auto-fit answers that**, since it sizes itself
inside whatever shape it lands in. And an earlier round on 04/09 made both ordinary shapes in the
default room — **that lasted one walk.**

### What left this repo

The two entries in `SHAPE_TYPES`, `SONG_AWARE_TYPES` and `SONG_REASSIGNABLE_TYPES`; the intro
card's builder, painter, proportions (`INTRO_TITLE_MAX_SIZE`, `INTRO_INSET`) and its three stand-in
strings (`INTRO_PLACEHOLDER`); the contact layer's schema, its sanitizer, its panel controls and its
QR field; and their rules in `mapper.css`. **The vocabulary itself did not move to Pregonero** —
Pregonero already had it in `control.css`, and this stylesheet was always the copy.

`SONG_REASSIGNABLE_TYPES` now equals `SONG_AWARE_TYPES`, and is kept as a separate name because the
questions differ: what a song may point somewhere else is not what a shape may be.

### What Pregonero was left to decide, and deliberately did not

**Which of the two shapes hosts them** is performance design and was explicitly out of scope for this
round. It has one address — `introContactHostShapes` in Pregonero's `App.tsx` — which returns
nothing, so neither card paints until the rule is written. Everything that decides *when* they show
is untouched on that side.

**And the contact panel's content has no home at all.** Its line of text and its QR file name were
fields on the Muralista layer, and they went with the type. The intro has no such gap: all three of
its parts come from the song file. So the contact needs somewhere for a gig to write its line before
it needs a host, and that is a decision about what a gig owns rather than about layout.

## Named modes replace conditional visibility (v1.19.0, 2026-09-05)

**The giveaway was that Jorge named them.** He proposed dependencies as first-class, defined at
`All — the room`, in the form `[Shape 1] [visible only together with] [Shape 2]` — and the names he
gave them were `Song with lyrics` and `Song with video and lyrics`. **A name with nowhere to live is
the symptom of a missing concept**, and what he had described is a **named mode**: a set of shapes
that appear together.

**Two gaps in the pairwise form, both structural.** A pairwise relation **cannot express a one-shape
mode** — `Song with lyrics` is `{Song lyrics}` alone — and it only implies groups transitively,
which is weaker than what he asked for. And **membership is not a trigger**: naming which shapes go
together does not say *when* that group is live. **So a mode is a condition plus a set**, or the
room has no way to choose one on the night.

### The decisions, and the arguments that produced them

**An ordered list, seeded with two, with no way to add a third** (Jorge: *just the two for now*).
The list is not built for a future need — **it is the cheapest correct way to build two**:

- **The resolution rule fixes a real case at N=2.** Ordered, first true condition wins, explicit
  fallback when none match. Two hand-written branches have no answer when both conditions are true
  or both false, **which is the double-paint failure this project keeps meeting**, and nothing ever
  enforced that the two conditions were complements.
- **Under *nothing is migrated*, a later change from two named fields to a list discards rooms
  rather than carrying them forward.** Today Jorge owns one room. Later he owns several.

**What is explicitly NOT the answer: an array the renderer reads as `[0]` and `[1]`.** That is a
format promising what the code does not do — the shape of the five contract mismatches of 02/09 and
of `countInBars`. **The list is honest or it is not a list**, so `mapper/modes.js` resolves any
number of modes and `mapper/modes.test.mjs` renders a hand-written three-mode room, including the
case where two conditions are true at once and order decides. **If that test is ever deleted rather
than fixed, the honest build is two modes and no list.**

**A shape belongs to one mode or to none, and no mode means always displayed.** Membership is a
field on the shape rather than a list of ids on the mode: a field holds one value, so *exactly one*
is structural rather than enforced, and deleting a shape takes its membership with it so nothing
orphans. That is the same argument that put `visibleWhen` on the shape before modes existed.

**What happens when no condition matches is STATED, not left to fall out: no mode is live, and only
the no-mode shapes paint.** Two complementary conditions never reach that case; a list has to answer
it anyway. A mode whose condition points at a deleted shape reads `null` and is never live, which
is why deleting the shape a mode asks about is refused and names the modes.

### What the surface does with it

**The shape list at `All — the room` is grouped, and the grouping IS the assignment surface**
(Jorge: *dependencies are never set up from inside a shape*). A shape joins a mode by being dragged
into its group — reorder and reassign in one gesture, because they are one list underneath and paint
order is list order.

**Modes are renamed in place and emptied, never deleted**, because deleting one orphans its shapes
and a shape reachable from no group is a shape nobody can find again. **The condition renders
read-only**: the concept is visible without shipping an authoring surface for a language that
contains exactly one sentence.

**The mode names are the preview selector**, on `1 SHAPES` and on `2 OUTPUT`, one active at a time.
**The mode being previewed is the one whose rows are listed**; the others keep their header and lose
their rows — *he does not want to see the shapes of the mode he is not looking at*, asked twice.
**The header stays because it is still the drop target**: a group that vanished would take with it
the only way to put a shape into it, and it says how many shapes are in there, which is what a
collapsed list owes.

**Retired with the relation they drew:** the per-shape condition editor (`buildConditionRow`), the
`show dependencies` overlay and its arrows, the `⇢ Frame filled` badge, and the one-level rule with
its cycle argument — a mode points at a shape and a shape points at a mode, so no edge can close on
itself.

**This is a two-repo change.** Pregonero's `resolveShapesForType` and `songIsCarried` ask whether a
shape carries a song; under modes they ask whether **the mode that will be live for this song**
carries it. Muralista's model and Pregonero's readiness move together, as at step 6.

## The shapes round: scope, editing, and media that draws itself (v1.20.0, 2026-09-05)

**Modes were accepted on the walk and everything here is refinement on a surface that works.**

### `2 OUTPUT` has no song scope, and the fix was one level up from where it looked

**Jorge expected the mode selector on `2 OUTPUT` and it was absent. The code was right.**
`renderPreviewToggles` hides the selector whenever a song is scoped, on a stated argument: in a song
scope the song's own assignments decide which mode is live, so **a selector the song then overrules
is a control that lies.**

**Jorge's ruling found the real level: *in the output there is no song scope, only all scope.*** The
defect was that a song scope was live on OUTPUT at all, persisting in from `1 SHAPES` on a screen
that 04/09 already made the photograph of the room. **Drop the scope on entry and the selector needs
no special case anywhere.**

**Cowork proposed a read-only line naming the resolved mode, and Jorge rejected it as unnecessary** —
which it is, once the scope cannot arrive. **Nothing was added to that screen.** The lesson recorded
with it: the same build showed two different OUTPUT screens depending on what was left selected next
door, and the cure was to remove the inheritance, not to describe it.

**It subsumes the transport finding.** `Play / Pause / Restart` hangs off the song context bar, which
is hidden with no song — so 04/09's *the toolbar belongs to `1 SHAPES` only* is satisfied by removing
the cause rather than the symptom.

### Editing works in any scope, and the copy had to move with the rule

**Jorge wanted to reshape the video frame while previewing a song and had to go to `All`.** Ruling:
**editing a shape works in any scope, and it edits the shape in the room, not for that song.**

**This reverses *assignment only while a song is picked* (04/09) and only that.** The ruling
underneath it is untouched and is what makes the reversal safe: **there is still no per-song
geometry**, because dragging a corner in a song scope moves the room's shape for every song, exactly
as it would in `All`. A song holding its own coordinates would be silently wrong on stage after a
remap, and nothing here creates one.

**The line is: geometry belongs to the room, assignment belongs to the song.** `Content` is the one
section that reads the scope. Everything else — name, type, opacity, format, the bin, `+ Add shape`
— edits the room from wherever you are standing. **`Set it in All` went with it**: it was the same
wall Jorge hit, one section over.

**The one control a song scope still does not get is the drag grip**, and that is a consequence of
the list's shape rather than the old rule surviving. Dragging a row carries membership as well as
paint order, because in `All` the row lands inside a mode's group. **A song's list is flat** — it
mixes shapes from every mode so the annotations read down one column — so a drop there has no group
to land in and would have to guess. **A gesture that silently reassigns is worse than one that is
absent.**

**The band's copy was the old rule written down**, and a sentence describing behaviour is a claim
that does not survive a rewrite — the same failure as *coming back here re-checks the files* on
04/09. It now states the boundary rather than the behaviour on one side of it.

### Media renders as media, and a logo that would not load had three causes

**The rule (Jorge): media content renders as media wherever a shape is shown — preview and wall
alike, always-on shapes included. A text stand-in is never a substitute for media that exists.** The
canvas drew `🖼 image` over a resolved logo file. That badge was written when rendering media in the
preview was *explicitly out of scope for v1 — not worth it*; **the room now has always-on shapes
with real content in them, and a badge where a logo goes says nothing about whether the logo is in
the right place**, which is the only question that screen answers.

**It is the output's own element factory in a `foreignObject`**, warped by the same matrix — the
rule the stand-in text already followed, because a second implementation drifts in the one place a
person positions against.

**The load failure was separate, and it was three things. Measured before anything was built,
because Cowork's first suspect had been wrong three times this week.**

- **Disproved: spaces and the hyphen.** `hostedMediaUrl` encodes each segment on its own; the fetch
  of `media/Logo Chango Pepper - black.png` against a mount that holds it returns **200** and the
  image paints.
- **True: the label lied under a mount.** `folderLabel` was gated on a granted directory handle, and
  **hosted there is no handle** — the host mounts the folder instead. So the field fell back to
  `Source (relative to mapper/media/)` with a placeholder of `e.g. media/character.png`, both
  standalone-era strings, on a screen where a name is looked up in the visuals folder's own root.
- **True, and worse: hosted, a failure was reported nowhere.** P6b hid the whole media section
  hosted, on the right argument — *the folder was answered at first run and asking again is a second
  answer to a settled question* — **but the section held two different things**, the folder question
  and the list of names that did not resolve. Hiding the question hid the report, so **the one place
  a failure was visible was the wall**, painted at a projector.

**The fix is a picker, not better prose.** The mount already lists what it holds, and a name chosen
from a list cannot carry a prefix nobody asked for. The free-text field survives for a name the
listing does not offer, and says where names are looked for **in words that are true in whichever
case is live**.

**And resolution now triggers a full render.** It used to redraw the folder's status line only,
which was right while the canvas drew a badge — the bytes changed nothing anybody could see. With
the canvas painting media, the render that follows the edit runs before the fetch lands, so the
picture was always one edit behind. **Measured: the first build of the preview rendering showed no
image at all for exactly this reason.**

### The selection on the wall, and an SVG that would not show

**Jorge: the selected shape's border is not visible on the wall, only in the preview, so resizing is
done half blind.** The selection now rides the state message — **received, never computed**, the same
rule `mode` follows — and is drawn as an overlay in real output pixels, dark stroke under bright so
it survives a logo on white.

**Editor chrome on the output does not touch *nothing is simulated here*.** That rule is about the
output being real light rather than a drawing of it; a mark saying *this is the one you are
dragging* is setup, on a wall nobody is watching but the person dragging, and it is gone the moment
nothing is selected.

**One thing worth keeping: `element.hidden` does nothing on an SVG element.** `hidden` is an IDL
attribute of `HTMLElement`, so `svg.hidden = false` sets a plain JavaScript property and leaves the
HTML attribute in place — and this stylesheet's `[hidden] { display: none !important }` then wins
forever. **Measured**: correct points, correct viewBox, `hidden` reading `false`, computed style
`display: none`. `toggleAttribute` is the fix.

### What the walk reported that the repo disproved

**`Video lyrics` does not arrive in `ALWAYS`.** Seeding was measured three ways — a fresh seed, the
bytes written to the gig folder, and the round trip back through `projectFromVisuals` — and in all
three it lands in `Song with video and lyrics`, with only `Video frame` under `ALWAYS`.

**What IS reproducible is its neighbour: a shape added with `+ Add shape` while a mode is previewed
lands in `ALWAYS`.** It is left alone deliberately and is a question for Jorge rather than a silent
change, because the argument runs both ways: the shapes he adds by hand — a logo, a contact panel, a
mask — are exactly the always-on ones, so `ALWAYS` may be the right default and joining the previewed
mode may be the surprise.

**What was fixed instead is what made a correct list read wrong: the group header painted the same
`--bg-row` as the rows inside it**, so a group's title and its shapes were the same shade and only a
1px border answered *which group is this row in*. The header recedes to the sidebar's own ground now
and the rows keep the lighter one.

## The v0.65.0 walk round (v1.21.0, 2026-09-05)

### The seeding defect was real, and the round before named the wrong shape

**`Video frame` was seeded into `ALWAYS` and belongs in `Song with video and lyrics`.** That is why
`SONG VIDEO / Video frame` ghosted onto the wall while `Song with lyrics` was previewed: **an
always-on shape is always on, and the room was right.**

**The process lesson outlives the fix.** The previous round's kickoff recorded the report as
*`Video lyrics` arrives in `ALWAYS`*. That claim was **disproved three ways — a fresh seed, the bytes
written to the gig folder, the round trip back on reload — and the work stopped there**, correctly,
because `Video lyrics` does land in the video mode. **The symptom Jorge actually saw was one row away
and survived the disproof.** He was right that a shape was wrongly in `ALWAYS`; only the name was
wrong, and the name is what got tested.

**Disproving a literal claim is not the same as explaining a symptom, and a report names a symptom.
Check the whole seeded set, not the shape the report happened to name.**

**`ALWAYS` is empty in the seeded room now**, which is right rather than an omission: nothing in the
designed default is meant to be up in both branches. A backdrop or a logo is a shape somebody adds,
and **a shape somebody adds lands in `ALWAYS` by rule** (Jorge, 2026-09-05) — `previewModeId` is a
view, never a setting, and **a view must not silently decide where a new shape is filed.**

**The mode's condition still reads the video shape, which is now inside that mode**, and that needs
no guard: a condition asks about a shape's **content**, never its visibility, and content is there
to be read whether or not the shape is drawn.

### Media stays inside the visuals folder, and the boundary rule was restated rather than excepted

**Jorge had to copy his logo into the visuals folder to use it, and his logo does not live there:**
*this is pushing me to a direction I didn't have in my folder structure.*

**Both alternatives were put to him and both rejected** — *copy with consent into a folder the tools
own inside the visuals folder*, which was Cowork's recommendation since it is the shape settled twice
elsewhere; and *reference by absolute path anywhere*, no reorganisation at the price of media that
can vanish between setup and the night. **Ruling: no copy, no reference. A file outside the visuals
folder is refused, and moving it in is his to do.**

**And it is not an exception at all — his reason is better than the framing it replaces.** *Visuals
is used to read, not to write.* **The tools own a room where they write** — `song-performance/`,
`setup/` — **and own nothing where they only read.** Cowork called the missing subfolder a hole in
the boundary rule; **it is the rule stated properly**, and the three folders now follow one principle
instead of two and an exception. **A later round reasoning toward a governed subfolder here has
misread which side of the rule this folder is on.**

**One consequence, ruled the same day: after a refusal the shape stays empty, with no file selected.**
A refused pick leaves nothing behind, so **a shape pointing outside the visuals folder never exists
at all** — the invalid state is unreachable rather than merely reported, which is the difference
between a guard and a warning.

**Why the host picks, hosted.** A cross-origin frame cannot open a file picker at all, and an
`<input type=file>` hands over a bare name with no path — so this page could not tell a `logo.png`
in the visuals folder from one on the Desktop. **That is a false ACCEPT, which is worse than a false
reject.** So `pick-visual` crosses and a **name** comes back, which is the currency `?media=` already
deals in; **no path crosses in either direction**, which is also why the refusal is shown on the
host's side — naming the folder means naming a path. Standalone, `showOpenFilePicker` opens in the
folder and `resolve()` answers containment directly.

### A live output window stopped following, and it was the deduplication

**Re-entering the gig showed the logo in the preview and not on the wall.** The window was painting
the room as it was when the gig was created and responding to nothing; closing and reopening it
fixed it.

**Reproduced before it was fixed.** `seq` deduplicates double delivery — every message goes out on
the channel and on the window handle — but **`outboundSeq` starts at 0 on every page load and the
output window's high-water mark does not.** Leaving the visuals step destroys the frame; re-entering
builds a new one numbering from 1 again, and **a window that had already seen `seq 40` discards every
message the new page will ever send.** Reopening fixed it because a fresh window has no high-water
mark, which is exactly the shape of the report.

**So the stream is identified, not just the message.** A `seq` means *the Nth thing I said* and was
being read as *the Nth thing anyone said*.

**Jorge's own ask is built too — the output window closes when the visuals step is left** — because
closing it is the workaround and the staleness was the defect. **It does not reverse *the window
stays open when entering `2 OUTPUT`***: that is inside the flow, this is leaving it.

### The rest

- **`SCOPE` and `PREVIEWING` moved above the canvas and `PREVIEWING` became a dropdown.** They are
  the two controls that decide what you are looking at. **This supersedes the two side-by-side
  green/grey buttons** asked for the day before — **a reversal, not a misreading**, and the buttons
  are not to be reinstated.
- **A file copied into the visuals folder by hand was still reported missing.** The listing and the
  resolved bytes were recomputed only when this tool did something, and **copying a file in is not
  something this tool does.** `Look again` sits on the complaint, and the folder is re-read when the
  window comes back.
- **`BACKDROP` never collapsed, because the previous fix overshot.** Closing it only when another
  fold opened was too little — the sidebar has one other fold and it is usually hidden. It closes
  when a pointer lands in the side menu outside it, and survives a canvas click.

## Where the state actually lives

The working venue mappings are not in git. **Since 2026-09-03 there are two homes, and which one is
in use is decided by whether a gig was handed over** — see the section above. With no gig they live
in the browser's `localStorage`, under the key
`wallmapper.project.v1` (deliberately not renamed during the 2026-08-20 rename — see the "Do NOT
rename these" table above). Exported venue JSONs sit in `mapper/media/`, alongside the gitignored
video assets. This file and the repo's committed code describe the tool; the actual state of any
given mapping is on whichever machine last drove the calibration.

Since v1.3.0 there are two more places, and neither is in git either. **Hosted (v1.7.0), the second
one does not exist at all**: there is no handle, because there was no picker — the endpoint in the
URL is the whole connection, and it is gone when the window is.

- **`<gig>/visuals.json`**, in whichever folder holds that gig's `gig.json`. Muralista is its sole
  writer and writes it only when **Save to gig** is pressed on 3 OUTPUT, or when **Keep the default**
  is pressed on 1 LAYOUT; nothing autosaves it. The line saying when it was last written
  **disappears on the next edit**, because from that moment the folder is behind the screen.
- **`<gig>/stage.png`** (v1.8.0), beside it, and **read back as a Backdrop source since v1.10.0**.
  The stage capture, in output space, written on the same two paths as the visuals file — a `PUT` when hosted, a handle write when a folder is connected, and
  a download when there is neither. **The gig folder stops being text**, which is machine territory
  and moves no boundary.
- **The gig folder's directory handle**, in IndexedDB under `muralista`/`handles`/`gigFolder`,
  beside the media folder's. A handle is a browser object and cannot live in a JSON, which is why the
  mapping never mentions the folder and why a mapping made on one machine opens on another.

## Pointers

- `context/tramoya/venue-turn.md` — the parent thread; §2.1, §2.3, §2.5, §2.6, §2.7 all load-bearing
  for the V1 design above.
- `context/tramoya/README.md` — the suite, the "real work" rule, the legibility constraint.
- `README.md` (this folder) — what Muralista actually does today, for anyone opening the repo.
- `context/WAYS-OF-WORKING.md`, "Renaming: the dangerous hits are the invisible ones" — the rename,
  executed 2026-08-20, and what it taught.
- `derivative.ca` — TouchDesigner, the incumbent. See "Prior art" above before adding any feature
  that sounds like something TD already does.
