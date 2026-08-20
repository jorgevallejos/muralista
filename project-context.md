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
document across the vault. Step 3 of `context/tramoya/history/rename-runbook.md`.

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

Mac mini + 1 projector (translator live rig) + iPad. Second projector: used business projector (Epson/Optoma, 3000+ lumens, €100–250) when step 4 arrives; check Mac mini chip for external-display count.

**Calibration camera — chosen 2026-08-11: Elgato Facecam 4K** (~€200). Rationale: a camera only earns its place for Tier 2 (curved/3D) or the structured-light auto-calibration stretch; the M1–M3 field test passed and surfaced *software UX* (coarse placement/dragging, fixed in v2.1) as the bottleneck, not calibration accuracy. A premium webcam beats a compact camera here — clean UVC feed, lockable manual exposure/focus (stable frame for OpenCV), native monitor-clip + tripod thread — at a quarter of the price, and doubles as a content/Instagram cam. Rejected: Facecam Pro (pay for streamer DSP we'd bypass), Insta360 Link 2 (gimbal tracking counterproductive for a fixed calibration frame), compact cameras (ZV-1 II / PowerShot V1 — better image but €850+ and need a monitor clamp). **Gate still stands:** for real curved/3D work, prototype with iPhone/iPad **LiDAR** first before relying on the camera; on flat (Tier 1) surfaces no camera is needed at all (live corner-dragging).

## Ways of working

Same loop as the translator waves: Cowork (this file) holds PM state; **Claude Code on the Mac runs the build** — Fable as coordinator, Sonnet subagents as crew, Jorge tests at the projector between milestones. v1 is a **spike**: light process, no test suite required; graduate to TDD + PR flow only if it becomes a real app. Code lives in this folder. *(2026-08-20: it earned the repo — `github.com/jorgevallejos/muralista`, private remote in active use.)*

## v2 direction (decided with Jorge, 2026-07-02)

The AI-asset idea sharpened: not a static picture *beside* the video, but **AI animation that enriches the video** — overlaying the video surface (same corners = registered), spilling beyond it, or both. Jorge wants it *context-aware* (room sound/noise). Agreed decomposition (Fable's take, Jorge approved):

1. **Alpha-animation overlays (small):** alpha-WebM layers join the shared transport (today they autoplay independently); z-order via surface list order; copy-corners/duplicate-surface convenience for exact registration over a video surface.
2. **Context awareness = control logic, not generation (a weekend):** mic → Web Audio (level/onset/tempo) → parameters modulating layers live. The beat layer graduates from fixed BPM to sound-reactive. No AI at runtime. *(2026-08-20: the design survives, its home moved — this becomes a property declared in the venue file and executed by Pregonero, not live control logic running inside Muralista, which never runs during a show. Port uncosted. See "V1 design → Architecture" below.)*
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

1. **Animation in v1 or not?** Under the parallel track, Muralista renders its own animation in the
   studio, so this is no longer a question about Pregonero gaining a compositing layer. What
   survives: does the **first concert** use Muralista at all, or is v1 studio-only?
2. **Does the venue file own audio** (volume, speaker position, room baseline)? Venue Turn question 3,
   still open. The prior: leave it on paper for v1.
3. **How is the field measured** without a camera? Live corner-dragging works for a region; the outer
   field is bigger than the eye can judge from behind the projector. May need a two-person setup pass
   or a phone photo as a rough guide. Untested. Sharpened by "the room" item 5 below — the keep-out
   has to be judged from inside the beam, not from behind the projector.
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
2. **Canvas in or out?** *"Rather than my canvas, or in addition to it"* left this open, and the two
   are different projects. The canvas is white, flat, known geometry and bright; a café wall is none
   of those. If the canvas stays, the field has two quality zones and the layout falls out of the
   physics — lyrics on the canvas where the pixels and contrast are, animation spilling onto the wall
   where atmosphere is enough. That is the more robust design.
3. **How long does mapping an unfamiliar room take?** A café gives 30–45 minutes with the lights up
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
- `context/tramoya/history/rename-runbook.md` — the rename, executed 2026-08-20.
- `derivative.ca` — TouchDesigner, the incumbent. See "Prior art" above before adding any feature
  that sounds like something TD already does.
