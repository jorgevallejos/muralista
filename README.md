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
- **Keep-outs landed 2026-08-23**, with the shadow suggestion. Verified in real headed Chrome against painted geometry and decoded pixels — but **the suggestion has never been run against a real wall.** Its optical loop (a camera actually seeing the projected plate, the countdown clearing off the wall, a real body's shadow under real auto-exposure) was driven with a synthetic camera feed, because it is the one part that a desk cannot stand in for. Treat the first venue run as the real test of it; the shape it hands back is meant to be coarse either way.
- **The text layer landed 2026-08-23**, replacing the lyric PNGs the studio session had been faking with. Verified in real headed Chrome against painted geometry: the catalogue's longest entry cannot overflow its quad at any slider setting, at every quad shape it was tried on including a deliberately narrow one, and a quad redrawn smaller with a real mouse rescales its text with it to within 0.02%. **Never read off a wall.** Its legibility choices — stroke weight, shadow, how big is big enough — were judged on a monitor, and the room they are for is a dark one seen from the back.
- **The media folder landed 2026-08-23.** Resolution, the Blob hand-off to the projector window, object-URL lifecycle and every fallback are verified in real headed Chrome against decoded pixels. **The picking flow itself is not automatable** — `showDirectoryPicker` opens an OS dialog no browser automation can drive — so it was exercised through a stand-in handle, and the one thing only a person can run is the round trip: pick a folder, quit Chrome, reopen, and see whether it comes back granted or asks to reconnect.
- **Direct manipulation is now verified by hand** (2026-08-22). It landed in July and was only ever checked headlessly, and it did not in fact work: a drag moved a quad by one mouse-move and then froze, and pressing an unselected quad did not move it at all. Fixed, and confirmed in Chrome with a real mouse against painted output. **Transport-synced overlays are still hand-untested.**
- **The desk-tool shape described above is the direction, not the current build.** Today Muralista still renders live: it has a transport, because v1 was designed as a tool that runs during the show. That decision was reversed on 2026-08-20. The sound-reactive half was removed on 2026-08-22 and preserved at the tag `mic-reactivity-archive`: a tool that maps a wall before a show cannot also be the thing listening to the room during it. The beat layer that removal left standing went too (2026-08-23) — with mic mode gone it was a circle pulsing at a fixed BPM, and nothing about drawing shapes on a wall needs one. **What Muralista renders today is video, image and text layers on warped surfaces, plus keep-out polygons it holds dark**, plus the test pattern you align against. The behaviours that left survive as direction — they become properties declared in the venue mapping and executed by [Pregonero](https://github.com/jorgevallejos/pregonero) — but nothing has moved across yet, and Pregonero cannot read a venue mapping today.

No test suite. This is a spike, run with spike discipline, and it graduates to tests and a PR flow when it earns them.

---

## Running it

No build step, no dependencies, no network. Chrome only.

```bash
cd mapper/
python3 -m http.server 8123
```

`python3 -m http.server` sends no cache headers, so a plain reload used to leave you testing the `mapper.js` Chrome already had while reading the new source. That is handled in the code now: `mapper.html` injects its subresources with a per-session `?v=` token, and **Open output window** passes the control window's token through, so both windows always run the same build. A normal reload is enough.

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

### 3. Optional: draw on the wall itself, live

Mapping a room from a photograph means photographing the wall, cropping the photo to the projector's throw, loading it, drawing on it, and then walking to the wall to find out what you got. The photo goes stale the moment anything in the room moves, and any error in the crop becomes a fixed offset in every surface you drew.

If you have a webcam mounted beside the projector lens, use it instead. Under **Backdrop**, switch **Source** to *Live camera*, pick the input, and calibrate once:

1. Press **Show white**. The output window paints a full white frame, so the projector's lit rectangle is visible on the wall.
2. Press **Calibrate…**. The feed comes up raw and at full strength, with four handles on it.
3. Drag each handle onto a corner of that lit rectangle, and press **Done**.

The feed is now warped so the lit rectangle fills the preview: the camera is looking at the wall through the projector's own frame. Drag a quad and you are watching the real wall update underneath it.

It is the same perspective warp the surfaces use, pointed the other way — a quad in camera space mapped onto the whole frame, instead of a frame mapped onto a quad in output space. Calibration is stored with the mapping, so it comes back with the room.

Like the photo, this is **authoring only**. The feed never reaches the output window.

**What it is exact about.** After calibration the mapping is exact for anything *on the wall plane* — that is what a perspective warp between two planes is. Anything standing out from the wall reads displaced, by more the further it stands, because the camera and the projector genuinely do not agree about where such a thing is. No fixed correction removes it. See **Keep-outs and the shadow rule** below.

### 4. Add the crate

Same again for the crate: add a surface, drag it roughly over the crate's front face, nudge the four corners until the grid sits flush on the physical object. Name it `crate`.

Lost track of which quad is which? **Identify** flashes each surface's name onto the output.

### 5. Put the animation on it

Switch `back wall` to the **video** layer and point its source at the animation — `cerdo.mp4` if you have chosen a media folder, `media/cerdo.mp4` if you are working out of the served directory. Press **Play** in the header — all video layers share one transport, so the wall and the crate start together on the same frame.

Nudge a corner while it is playing. The video keeps playing: calibration does not interrupt playback, which matters because the only way to get a surface truly flush is to adjust it against the content you will actually show.

### 6. Register an overlay exactly on top

You have an alpha WebM of a character that should appear over the animation, in exact registration with it. Do not corner-match it by hand — press **⧉** on the `back wall` row.

That copies the surface with identical corners, drops it immediately after the original so it paints on top, and selects it. Change the copy's source to the overlay and you are done. Stacking order is the list order; **▲ / ▼** move a surface back and forward through it.

### 7. Put the lyrics somewhere

Add a surface over the part of the wall that will carry the words, and switch its layer to **text**.

Two fields at the top of the panel, and they are not the same fact:

- **Role** is what the region *is*. `lyrics` means this is a **slot** — the place lyrics go, to be filled from the song file when Pregonero learns to read a venue mapping. `static` means the text below is the content and stays, which is what a title card is.
- **Text** is what is *in* it. Under `lyrics` the panel calls it *preview text*, because that is what it is: a real line, pasted in so the layout is tuned against a real length rather than against "Lorem ipsum".

**Paste the longest line you will actually sing.** A layout tuned against a short line is not tuned. Line breaks you type are line breaks on the wall — several entries in the catalogue carry one and render as two lines, and a region sized against a single line clips them.

Then set the size by eye, with the projector on. Two things about that slider:

- **It is a fraction of the shape, not a font size.** The number stored in the mapping is a percentage of the quad's height, so when you redraw that quad in the next room the text comes with it. An absolute size would quietly break every layout you ever tuned.
- **It is a ceiling, not a size.** Text that would not fit is shrunk below it until it does — wrapping on word boundaries, honouring your line breaks, keeping a margin off the edge. So it cannot overflow the shape at any setting, and short lines still get to be big.

The background stays transparent, so a text surface duplicated onto a video surface's corners (step 6) puts the words over the animation rather than over a black plate. Legibility comes from a dark outline and a slight shadow instead, the way cinema subtitles do it — that is a deliberate exception to how restrained everything else in the suite is, and it is not up for debate at the back of a dark room.

### 8. Hold part of the wall dark

Muralista's design is subtractive. The projector floods the whole background, and the mapping is a layout of that flood — **including which parts stay dark**. Black is a decision, so it is an object: a **keep-out**, listed in its own section of the sidebar, below the surfaces.

A keep-out is not a surface, and it is worth knowing why the tool treats them as different things. Every surface is exactly four corners because four corners is what a perspective warp needs. A keep-out carries no content — it holds black — so it needs no warp and is not bound to four corners. It is an irregular polygon, and that is the *cheap* version here, not the expensive one.

Add one and it arrives as a tall hexagon. Drag the whole shape to move it, drag a point to reshape it, **click an edge to insert a point and pull it out** in one gesture, and select a point and press Delete to remove it. Three points is the floor. Keep-outs paint above every surface, always, whatever order either list is in.

**The margin slider inflates the whole outline outward**, and it is the one control that turns the rule below into a number: its value *is* how much bigger than your shadow the shape gets, as a fraction of frame height. It is drawn as a round-joined stroke on the same shape rather than as a recomputed outline, which makes it a true dilation: a thin limb gets *thicker*, not longer.

#### Suggest from my shadow

With the camera calibrated, press **Suggest from my shadow** and the tool does the tracing:

1. It raises the white plate, and waits for the wall and the camera's exposure to settle.
2. It photographs the empty wall.
3. It counts you into place — **on the wall itself**, in numbers big enough to read from inside the beam, and in the control window too.
4. At zero it takes the countdown *off* the wall, waits for it to clear, and photographs the wall again.
5. Whatever got darker between the two frames is your shadow. It takes the largest such region, traces its outline, simplifies it to twenty-odd points, and maps those through the camera calibration into output space.

Then it hands you the shape and gets out of the way. **It is not trying to be accurate, and you should not want it to be.** A coarse blob roughly the right shape is the right answer: the margin has to inflate it anyway, and a few points get pushed by hand. One threshold slider is there for when the room's light needs it — raise it if the trace grabs the whole wall, lower it if it finds nothing.

The traced points are stored in **output space**, so the keep-out stays valid long after the webcam is unplugged.

Not in this version: the polygon following you live. On a dark stage, mid-song, a mask that flickers is worse than no mask.

### 9. Export the room

**Export** writes the mapping to a JSON file. That file is this room — the surfaces, their corners, their layers, their order, and the keep-outs it holds dark.

Next time you play here, **Import** it and the calibration comes back. **Keep one file per venue.** Getting a room flush from scratch is the expensive part of the evening; getting it back should cost nothing.

---

## The venue mapping

The exported JSON is the artifact Muralista exists to produce, and everything above is in service of it. It holds the geometry of one room: each surface's four corners in output space, its layer and source, the order they paint in, and the keep-out polygons — also in output space — that paint black above all of it.

Two things worth knowing:

**It autosaves continuously.** Every edit is written to `localStorage`, so a reloaded tab does not lose an hour of calibration. The export is for carrying a room between machines and between nights.

**The storage key still carries the tool's old name** — `wallmapper.project.v1`, from the working title this was built under. It is left alone deliberately, with a guard comment on the definition. It is an *address*, not a name: renaming it would not rename anything, it would point the tool at an empty place and silently orphan every mapping you have saved. Same for the `BroadcastChannel` name and the export filename.

**A text layer records two facts, and keeping them apart is the point.** `role` says what the region is for; the string says what is currently previewing in it. A mapping that recorded only "this region shows this string" could not tell the lyric slot from a caption somebody typed, and every venue file would have to be re-authored by hand the day Pregonero learns to read one. There are exactly two roles — `lyrics` and `static` — and there will not be a third until something actually needs one.

**Where this is going:** the mapping grows into a full **venue file** — adding the outer field of usable wall and named regions for lyrics and animation, alongside the keep-outs it already carries — which Pregonero reads and executes on stage. See `project-context.md` in this repo, under "V1 design (2026-08-20)", for the design and its open questions.

### The media folder

A layer's source is a **name** — `cerdo.mp4`, or `clips/pig.mp4`. What the name is resolved *against* is the one thing the mapping does not store.

By default it resolves next to the served page, which means "where my media lives" is really a fact about which directory you started `python3 -m http.server` in. Choose a **Media folder** in the sidebar and the tool knows instead: Chrome hands over a durable handle, and it comes back after a full browser restart without asking again.

Three things follow from a browser only ever being granted a *handle*, never a path:

- **The mapping stores the name, never the folder.** The handle is kept outside the project, in the browser. A venue file exported from a machine with a folder chosen opens on a machine without one, and needed no schema change to do it.
- **The projector window never asks for anything.** It has no handle and touches no files. The control window reads the bytes and hands them over; a permission dialog appearing on the wall halfway through setting up is not something the tool will do.
- **Nothing chosen is still a working tool.** No folder, permission not granted yet, or a name the folder simply does not have — all fall back to the served directory exactly as before. Anything the folder could not produce is named in the sidebar, next to the folder it was not found in.

After a browser restart Chrome may return the folder as *remembered but not yet permitted*. A **Reconnect media folder** button appears; the tool will not raise that dialog on its own, because a dialog nobody asked for on load is the same objection as one on the projector. Until it is clicked, names fall back.

Not Chrome? The control is hidden and every name falls back silently.

### Keep-outs and the shadow rule

The one rule that governs every keep-out you draw around a person. Step 8 above is how; this is why.

A keep-out's first job is the performer: standing in the beam is physically unpleasant, and a keep-out is what you use when the room will not let you put the beam above or beside the person instead.

**Trace the performer's shadow, never the performer.** Whether you are working from a photo or from the live camera, the camera does not stand where the lens stands, so the two disagree about where a body is — in the studio, with the camera as close to the lens as it would physically go, that disagreement was still 12–15cm on the wall. A keep-out drawn around the body paints black onto empty wall and leaves the beam on half the face.

The shadow has no such error and cannot. It is by construction the exact set of projector pixels the body blocks — the projector drew it — and it lands on the wall plane, so it maps exactly. The correction is free, and nothing needs measuring.

One caveat that travels with it: draw the shape **generously larger than the shadow**. A mask that is exactly the outline lets light onto the face on every lean, and a performer sways.

---

## Limits

Deliberate, not defects:

- **Flat facets only.** Every surface is a four-corner plane — one perspective warp per quad. Curved and organic surfaces need a mesh warp, which is out of scope.
- **The camera is a backdrop, not an auto-calibrator.** A webcam beside the lens gives you a live, rectified view of the wall to draw on. It does not find surfaces for you — you still calibrate by dragging while watching the projected result — and it is exact only on the wall plane. A phone photo remains a planning aid at best: a phone does not stand where the projector stands.
- **One projector.** A second one is another separate zone, never a blended overlap. Edge blending is explicitly out.
- **Text is warped with its quad, letterforms included.** A surface's content is drawn into a square and mapped onto four corners, so a quad far from square stretches the type along with everything else. That is what keeps the fit honest — text measured in that square cannot leave the quad — but it means a very narrow region squeezes the letters rather than re-wrapping them into it. Draw the region roughly the shape you want the words to read in.
- **Auto-fit has a floor, and it is loud.** Below 8px it stops shrinking and lets the text overflow rather than clip it silently, because a quad drawn far too small for its content is something you need to see. There is a lot of room before that: the catalogue's longest entry fits at 93px, and an entire song's worth of text still fits at 16px.
- **Chrome only.** Alpha WebM transparency and the autoplay behaviour this leans on are Chrome-specific; Safari drops the alpha channel.
- **Media is referenced, never copied.** Point the tool at the folder your media already lives in (see *The media folder* above) or drop files into `mapper/media/` by hand. Either way Muralista reads the files where they are — the picker fills in a name, it does not copy anything, and media stays out of this repo.
- **`python3 -m http.server` has no Range support**, so seeking within a long video feels sluggish. `npx http-server` is a drop-in replacement that does — and a source resolved through a chosen media folder sidesteps the server entirely, so it does not have this problem in the first place.

## Development

A spike: no test suite, no PR flow, conventional commits on `main`.

There is also a six-step desk pass that exercises sync, warp, calibration, playback and round-tripping the mapping, without a projector — worth running before any trip to a venue. It is written out in `project-context.md`.

The internal `mapper/` folder and the `mapper.*` filenames keep the shape they were built with. They are internal paths, nobody says them out loud, and renaming them would churn the run instructions for nothing.

## License

MIT — see [LICENSE](LICENSE).

---

*Muralista is part of **Tramoya**, the stage machinery behind [Chango Pepper](https://changopepper.com) — the rigging above the lights and the trap doors below the boards, the part of a show that works hardest and is never seen. A muralista is a painter of walls. The repository was called `projection-mapping`, and the tool `Wall Mapper`, until August 2026.*
