# Muralista

**You are playing a room you have never played. The projector does not point at a screen — it points at the whole wall behind you, and you are standing inside the beam. Muralista is where you work out, before anyone arrives, which part of that wall carries the lyrics, which part carries the animation, and which part stays dark so the chorus does not land on your face.**

Muralista is not a stage tool. It is a **desk** tool.

It runs at the venue, hours before the show, with the projector on and nobody watching. You map the room, you export the mapping, and then you close it. **Muralista takes no part in the evening.** That is the whole shape of it: mapping a room is setup work, done once, and the tool that does it is allowed to be slow and fiddly because nothing is at stake while it runs.

The counterpart to that: **Muralista maps, but it does not perform.** Working out where a surface is on a wall is geometry — deterministic, checkable, done in advance. Deciding what to show and when is a performance, with a clock and a person on stage attached to it. Those are different jobs with different failure modes, and putting them in one program means the one that can afford to crash lives inside the one that cannot.

---

## Where this actually stands

**A working spike, and honest about it.** Read this before the rest.

- **Built and verified at a real projector** (2026-07-02): corner-pin warp sits flush on a physical box, an animation plays across several surfaces at once, alpha compositing works at the wall.
- **Never played a room.** It has been driven at a wall in a studio, never during a show with an audience in front of it. This is why Muralista is deliberately **not** promoted on [changopepper.com/tramoya](https://changopepper.com/tramoya) — the suite's rule is that everything on that page has done real work, and this has not yet.
- **A v2 round is built but hand-untested** — direct manipulation, transport-synced overlays, and mic reactivity all landed in July and have only been verified headlessly.
- **The desk-tool shape described above is the direction, not the current build.** Today Muralista still renders live: it has a transport, beat layers and mic reactivity, because v1 was designed as a tool that runs during the show. That decision was reversed on 2026-08-20. The behaviours survive — they become properties declared in the venue mapping and executed by [Pregonero](https://github.com/jorgevallejos/pregonero) — but the code has not moved yet, and Pregonero cannot read a venue mapping today.

No test suite. This is a spike, run with spike discipline, and it graduates to tests and a PR flow when it earns them.

---

## Running it

No build step, no dependencies, no network. Chrome only.

```bash
cd mapper/
python3 -m http.server 8123
```

Open `http://localhost:8123/mapper.html`. That is the **control** window — the performer UI, with the surface list, the calibration handles and the layer panel. Click **Open output window**, drag the new window onto the projector's display, and press `F` to fullscreen it. That second window is the projector image and nothing else; the two stay in sync over a `BroadcastChannel`.

---

## A worked example

You are setting up in somebody's living room. There is a wall behind where you will stand, and a wooden crate to one side that you want the animation to climb onto.

The room below is invented, but every gesture in it is real and was exercised at a projector.

### 1. Get something on the wall

Add a surface in the sidebar. It appears at once in both windows — a quad in the control preview, a coloured grid with numbered corners on the wall. Leave its layer on **pattern**: the grid is what you align against, and the numbers on it match the keys you are about to press.

### 2. Place it

Drag from inside the polygon to move the whole surface — that is coarse placement, and it is the gesture you want first. Drag a corner handle to reshape just that corner.

Then get it flush with the arrow keys, watching the wall rather than the screen:

- **`1`–`4`** pick which corner is live. They match the numbers baked into the pattern.
- **arrows** nudge in real output pixels — unshifted 5 px, **Shift** 1 px.
- **`0`** or **Escape** drops back to whole-surface mode, so the arrows move everything at once.

The keys work while focus is in the control window, so you can keep nudging without clicking back and forth. When the grid lines converge toward the narrow edge of the quad instead of merely skewing, the perspective warp is doing its job.

Name it `back wall`.

### 3. Add the crate

Same again for the crate: add a surface, drag it roughly over the crate's front face, nudge the four corners until the grid sits flush on the physical object. Name it `crate`.

Lost track of which quad is which? **Identify** flashes each surface's name onto the output.

### 4. Put the animation on it

Switch `back wall` to the **video** layer and point its source at `media/cerdo.mp4`. Press **Play** in the header — all video layers share one transport, so the wall and the crate start together on the same frame.

Nudge a corner while it is playing. The video keeps playing: calibration does not interrupt playback, which matters because the only way to get a surface truly flush is to adjust it against the content you will actually show.

### 5. Register an overlay exactly on top

You have an alpha WebM of a character that should appear over the animation, in exact registration with it. Do not corner-match it by hand — press **⧉** on the `back wall` row.

That copies the surface with identical corners, drops it immediately after the original so it paints on top, and selects it. Change the copy's source to the overlay and you are done. Stacking order is the list order; **▲ / ▼** move a surface back and forward through it.

### 6. Export the room

**Export** writes the mapping to a JSON file. That file is this room — the surfaces, their corners, their layers, their order.

Next time you play here, **Import** it and the calibration comes back. **Keep one file per venue.** Getting a room flush from scratch is the expensive part of the evening; getting it back should cost nothing.

---

## The venue mapping

The exported JSON is the artifact Muralista exists to produce, and everything above is in service of it. It holds the geometry of one room: each surface's four corners in output space, its layer and source, and the order they paint in.

Two things worth knowing:

**It autosaves continuously.** Every edit is written to `localStorage`, so a reloaded tab does not lose an hour of calibration. The export is for carrying a room between machines and between nights.

**The storage key still carries the tool's old name** — `wallmapper.project.v1`, from the working title this was built under. It is left alone deliberately, with a guard comment on the definition. It is an *address*, not a name: renaming it would not rename anything, it would point the tool at an empty place and silently orphan every mapping you have saved. Same for the `BroadcastChannel` name and the export filename.

**Where this is going:** the mapping grows into a full **venue file** — adding the outer field of usable wall, named regions for lyrics and animation, and keep-out polygons the projector holds dark — which Pregonero reads and executes on stage. See `project-context.md` in this repo, under "V1 design (2026-08-20)", for the design and its open questions.

---

## Limits

Deliberate, not defects:

- **Flat facets only.** Every surface is a four-corner plane — one perspective warp per quad. Curved and organic surfaces need a mesh warp, which is out of scope.
- **No camera calibration.** You calibrate by dragging while watching the projected result. A photo of the wall is a planning aid at best; a phone does not stand where the projector stands.
- **One projector.** A second one is another separate zone, never a blended overlap. Edge blending is explicitly out.
- **Chrome only.** Alpha WebM transparency and the autoplay behaviour this leans on are Chrome-specific; Safari drops the alpha channel.
- **Media is not managed.** Drop files into `mapper/media/` by hand — the picker fills in the path, it does not copy anything. Media is gitignored and stays out of this repo.
- **`python3 -m http.server` has no Range support**, so seeking within a long video feels sluggish. `npx http-server` is a drop-in replacement that does.

## Development

A spike: no test suite, no PR flow, conventional commits on `main`. `mapper/_smoke.html` is a committed two-iframe harness that regression-checks window sync and the perspective warp in a single screenshot.

There is also a six-step desk pass that exercises sync, warp, calibration, playback and round-tripping the mapping, without a projector — worth running before any trip to a venue. It is written out in `project-context.md`.

The internal `mapper/` folder and the `mapper.*` filenames keep the shape they were built with. They are internal paths, nobody says them out loud, and renaming them would churn the run instructions for nothing.

## License

MIT — see [LICENSE](LICENSE).

---

*Muralista is part of **Tramoya**, the stage machinery behind [Chango Pepper](https://changopepper.com) — the rigging above the lights and the trap doors below the boards, the part of a show that works hardest and is never seen. A muralista is a painter of walls. The repository was called `projection-mapping`, and the tool `Wall Mapper`, until August 2026.*
