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
- **Keep-outs became shapes on 2026-08-23** (v1.1.0), after Jorge's first extended session at a wall. There is no keep-out any more: there are shapes, and one of the types a shape can be is a **fill** — a solid colour, black by default. The performer mask is a black-filled shape, so it takes part in the z-order like everything else and edits exactly like everything else. Verified in real headed Chrome against painted pixels, including the one assertion that matters for a mapping you already have: **a v7 file with keep-outs opens under v8 and paints a byte-identical frame.**
- **One shape, one set of circles, since 2026-08-23** (v1.2.0), after a second session at the wall. Every shape is drawn in the same ink whatever is inside it, every point of the selected shape gets a handle, and the numbered quad that used to show the content frame is gone — it was the warp's own machinery drawn on screen, and it made you pick between two overlapping handles for every gesture. Verified in real headed Chrome against painted pixels: dragging a four-point shape's own handle warps the wall to a **byte-identical frame** with what v1.1.0's numbered handle produced.
- **Adopting boundaries has never been run against a real wall.** The capture (raise a white plate, photograph the wall, count the thing into the beam, photograph it again, keep what got darker) is verified against a synthetic camera feed, because its optical loop — a camera actually seeing the projected plate, a real body's shadow under real auto-exposure — is the one part a desk cannot stand in for. Treat the first venue run as the real test of it; the shape it hands back is meant to be coarse either way.
- **The text layer landed 2026-08-23**, replacing the lyric PNGs the studio session had been faking with, and **stopped inheriting the quad's stretch** the same day. Verified in real headed Chrome against painted pixels: the catalogue's 81-character worst case cannot overflow its quad at any combination of maximum size and letter width, across eight quad shapes including keystones and a deliberately narrow column; a quad redrawn smaller with a real mouse rescales its text with it and does not refit at all; and glyph proportions measured in a 9.6:1 strip, a 0.26:1 column and a square all come out identical to the font's natural proportions to four decimal places. **Never read off a wall.** Its legibility choices — stroke weight, shadow, how big is big enough, and now whether the corrected letters actually read better — were judged on a monitor, and the room they are for is a dark one seen from the back. **This is the one acceptance criterion the layer has never had.**
- **The media folder landed 2026-08-23.** Resolution, the Blob hand-off to the projector window, object-URL lifecycle and every fallback are verified in real headed Chrome against decoded pixels. **The picking flow itself is not automatable** — `showDirectoryPicker` opens an OS dialog no browser automation can drive — so it was exercised through a stand-in handle, and the one thing only a person can run is the round trip: pick a folder, quit Chrome, reopen, and see whether it comes back granted or asks to reconnect.
- **Direct manipulation is now verified by hand** (2026-08-22). It landed in July and was only ever checked headlessly, and it did not in fact work: a drag moved a quad by one mouse-move and then froze, and pressing an unselected quad did not move it at all. Fixed, and confirmed in Chrome with a real mouse against painted output. **Transport-synced overlays are still hand-untested.**
- **The desk-tool shape described above is the direction, not the current build.** Today Muralista still renders live: it has a transport, because v1 was designed as a tool that runs during the show. That decision was reversed on 2026-08-20. The sound-reactive half was removed on 2026-08-22 and preserved at the tag `mic-reactivity-archive`: a tool that maps a wall before a show cannot also be the thing listening to the room during it. The beat layer that removal left standing went too (2026-08-23) — with mic mode gone it was a circle pulsing at a fixed BPM, and nothing about drawing shapes on a wall needs one. **What Muralista renders today is video, image, text and solid-fill layers on shapes**, plus the test pattern you align against. The behaviours that left survive as direction — they become properties declared in the venue mapping and executed by [Pregonero](https://github.com/jorgevallejos/pregonero) — but nothing has moved across yet, and Pregonero cannot read a venue mapping today.

No test suite. This is a spike, run with spike discipline, and it graduates to tests and a PR flow when it earns them.

---

## Running it

No build step, no dependencies, no network. Chrome only.

```bash
cd mapper/
python3 -m http.server 8123
```

`python3 -m http.server` sends no cache headers, so a plain reload used to leave you testing the `mapper.js` Chrome already had while reading the new source. That is handled in the code now: `mapper.html` injects its subresources with a per-session `?v=` token, and **Open output window** passes the control window's token through, so both windows always run the same build. A normal reload is enough.

Open `http://localhost:8123/mapper.html`. That is the **control** window — the performer UI, with the shape list, the calibration handles and the shape panel. Click **Open output window**, drag the new window onto the projector's display, and press `F` to fullscreen it. That second window is the projector image and nothing else; the two stay in sync over a `BroadcastChannel`.

---

## A worked example

You are setting up in somebody's living room. There is a wall behind where you will stand, and a wooden crate to one side that you want the animation to climb onto.

The room below is invented, but every gesture in it is real and was exercised at a projector.

### 1. Get something on the wall

Add a shape in the sidebar. It appears at once in both windows — a quad in the control preview, a coloured grid with numbered corners on the wall. Leave its layer on **pattern**: the grid is what you align against, and the numbers on it match the keys you are about to press.

### 2. Place it

Drag from inside the polygon to move the whole shape — that is coarse placement, and it is the gesture you want first. Drag a corner handle to reshape just that corner.

Then get it flush with the arrow keys, watching the wall rather than the screen:

- **`1`–`4`** pick which point is live. On a four-point shape those are its corners, in the order the test pattern numbers them, so the numbers on the wall are the keys on the keyboard. A shape with more points than four still answers to these for its first four; the rest you click.
- **arrows** nudge in real output pixels — unshifted 5 px, **Shift** 1 px.
- **`0`** or **Escape** drops back to whole-shape mode, so the arrows move everything at once.

The keys work while focus is in the control window, so you can keep nudging without clicking back and forth. When the grid lines converge toward the narrow edge of the quad instead of merely skewing, the perspective warp is doing its job.

Four points is what you get here, and while a shape has four points they are also what the perspective warp maps the content onto — so dragging one reshapes the content with it, and there is nothing else on screen to drag. A shape can have more than four points, and that is where the two come apart; it matters from step 8 onwards, and until then you can forget the distinction entirely.

Name it `back wall`.

### 3. Optional: draw on the wall itself, live

Mapping a room from a photograph means photographing the wall, cropping the photo to the projector's throw, loading it, drawing on it, and then walking to the wall to find out what you got. The photo goes stale the moment anything in the room moves, and any error in the crop becomes a fixed offset in every shape you drew.

If you have a webcam mounted beside the projector lens, use it instead. Under **Backdrop**, switch **Source** to *Live camera*, pick the input, and calibrate once:

1. Press **Show white**. The output window paints a full white frame, so the projector's lit rectangle is visible on the wall.
2. Press **Calibrate…**. The feed comes up raw and at full strength, with four handles on it.
3. Drag each handle onto a corner of that lit rectangle, and press **Done**.

The feed is now warped so the lit rectangle fills the preview: the camera is looking at the wall through the projector's own frame. Drag a quad and you are watching the real wall update underneath it.

It is the same perspective warp the shapes use, pointed the other way — a quad in camera space mapped onto the whole frame, instead of a frame mapped onto a quad in output space. Calibration is stored with the mapping, so it comes back with the room.

Like the photo, this is **authoring only**. The feed never reaches the output window.

**What it is exact about.** After calibration the mapping is exact for anything *on the wall plane* — that is what a perspective warp between two planes is. Anything standing out from the wall reads displaced, by more the further it stands, because the camera and the projector genuinely do not agree about where such a thing is. No fixed correction removes it. See **Adopting boundaries, and the shadow rule** below.

### 4. Add the crate

Same again for the crate: add a shape, drag it roughly over the crate's front face, nudge the four corners until the grid sits flush on the physical object. Name it `crate`.

Lost track of which quad is which? **Identify** flashes each shape's name onto the output.

### 5. Put the animation on it

Switch `back wall` to the **video** type and point its source at the animation — `cerdo.mp4` if you have chosen a media folder, `media/cerdo.mp4` if you are working out of the served directory. Press **Play** in the header — all video layers share one transport, so the wall and the crate start together on the same frame.

Nudge a corner while it is playing. The video keeps playing: calibration does not interrupt playback, which matters because the only way to get a shape truly flush is to adjust it against the content you will actually show.

### 6. Register an overlay exactly on top

You have an alpha WebM of a character that should appear over the animation, in exact registration with it. Do not corner-match it by hand — press **⧉** on the `back wall` row.

That copies the shape with an identical outline and frame, drops it immediately after the original so it paints on top, and selects it. Change the copy's source to the overlay and you are done. Stacking order is the list order; **▲ / ▼** move a shape back and forward through it.

### 7. Put the lyrics somewhere

Add a shape over the part of the wall that will carry the words, and switch its type to **text**.

Two fields at the top of the panel, and they are not the same fact:

- **Role** is what the region *is*. `lyrics` means this is a **slot** — the place lyrics go, to be filled from the song file when Pregonero learns to read a venue mapping. `static` means the text below is the content and stays, which is what a title card is.
- **Text** is what is *in* it. Under `lyrics` the panel calls it *preview text*, because that is what it is: a real line, pasted in so the layout is tuned against a real length rather than against "Lorem ipsum".

**Paste the longest line you will actually sing.** A layout tuned against a short line is not tuned. Line breaks you type are line breaks on the wall — several entries in the catalogue carry one and render as two lines, and a region sized against a single line clips them.

If you want the worst case, this is it — the longest entry in the whole catalogue, from *Tragedia de Cerdo Asado*, 81 characters over two lines, or 152 over four with the translation stacked under it:

```
Respiro libre, siento la brisa,
me fui del infierno, dejé las cenizas.
I breathe out free, I feel the breeze,
I fled from hell, I left the ashes behind.
```

**Judge legibility against that one, not against a short line.** A region that reads with three words in it tells you nothing.

Then set the size by eye, with the projector on. Two things about that slider:

- **It is a fraction of the shape, not a font size.** The number stored in the mapping is a percentage of the quad's height, so when you redraw that quad in the next room the text comes with it. An absolute size would quietly break every layout you ever tuned.
- **It is a ceiling, not a size.** Text that would not fit is shrunk below it until it does — wrapping on word boundaries, honouring your line breaks, keeping a margin off the edge. So it cannot overflow the shape at any setting, and short lines still get to be big.

**Letter width** is the second slider, and most of the time you will not touch it. A shape's content is drawn into a square and mapped onto four corners, so a quad far from square would ordinarily stretch whatever is in it — and for video and images it still does, deliberately. Text is the exception: the shape corrects itself, so a wide strip lays the words out wide instead of fattening them, and ×1.00 is normal letters in a quad of any shape.

The slider is there for the part no formula can reach. **Muralista only ever sees the quad you drew, never the wall it lands on** — a quad on an angled wall is a trapezoid *on purpose*, because the warp is compensating for where the projector happens to stand, so the drawn shape and the physical shape are different things and only one of them is in the file. You can see the other one, through the camera. Nudge it until the letters look right on the wall, not until the number looks right on the screen.

The background stays transparent, so a text shape duplicated onto a video shape's frame (step 6) puts the words over the animation rather than over a black plate. Legibility comes from a dark outline and a slight shadow instead, the way cinema subtitles do it — that is a deliberate exception to how restrained everything else in the suite is, and it is not up for debate at the back of a dark room.

### 8. Hold part of the wall dark

Muralista's design is subtractive. The projector floods the whole background, and the mapping is a layout of that flood — **including which parts stay dark**. So black is a decision the mapping has to carry, and it carries it the same way it carries everything else: as a shape.

Add a shape, set its **Type** to **fill**, and leave the colour black. That is the whole of it. It is in the same list as the animation and the lyrics, it moves the same way, it edits the same way, and **▲ / ▼** put it in front of or behind anything else — there is no rule pinning black on top of the world any more.

#### The outline, and the frame

This is where the two halves of a shape come apart, so it is worth saying once, properly.

Every shape has an **outline**: three points or more, one circle each, and you can push them anywhere. That is the only thing you ever drag. Content, though, is warped by a **perspective transform**, and a perspective transform maps a square onto exactly four corners — a seven-point polygon has no such thing. So there is a four-corner **content frame** underneath, and the rule that governs it is a rule about counting:

- **At four points, the outline is the frame.** Drag a circle and the content warps with it, live. Nothing is clipped, and nothing else is on screen.
- **Past four points, the frame holds still** at the four corners the shape had when the fifth point arrived, and the extra points **clip** what it paints. The panel says so, under the point count.

**Click an edge to insert a point and pull it out** in one gesture — that is the moment the two come apart. Click a point and press **Delete** to remove it; drop back to four and the outline is the frame again. Three points is the floor.

The frame does not chase the outline around, and that is deliberate: recomputing it on every drag would make the content jump about under the hand of somebody who is trying to edit an outline. When you *do* want it to catch up, press **Re-fit content to this shape**. It keeps the perspective you tuned and changes only the extent — so a quad squared up against a wall the projector is hitting from one side stays squared up against that wall, just bigger or smaller.

A fill shape needs no frame at all, because the outline *is* the content.

Which means a polygon is not a special kind of object you reach for when you want black — it is available on everything. A video clipped to a seven-sided outline is the same feature as a performer mask, used differently. (Lyrics are the one thing to be careful with: clipping cuts words rather than re-wrapping them, so a text shape usually wants to stay at four points.)

#### The margin, and where it lives

**The margin slider inflates the whole outline outward**, and it is the one control that turns the rule below into a number: its value *is* how much bigger than your shadow the shape gets, as a fraction of frame height. It is drawn as a round-joined stroke on the same shape rather than as a recomputed outline, which makes it a true dilation: a thin limb gets *thicker*, not longer.

It is offered on **fill shapes only**. "Cover generously" is the whole point of a fill; on a shape carrying content, growing the outline would only let more of a picture through that the frame already governs, which is a control that would explain nothing.

#### Adopt boundaries

With the camera calibrated, press **Adopt boundaries…** and the tool traces the shape for you:

1. It raises the white plate, and waits for the wall and the camera's exposure to settle.
2. It photographs the wall.
3. **The wall goes dark**, and it counts you into place on it — light numbers on black, big enough to read from inside the beam, and in the control window too.
4. At zero it lights the wall again, takes the countdown off it, waits **two seconds**, and photographs the wall again.
5. Whatever got darker between the two frames is the thing. It takes the largest such region, wraps it in its **convex hull**, thins that to eight or so points, and maps them through the camera calibration into output space.

Then it hands you the shape and gets out of the way.

**Why the wall goes dark in step 3.** The plate has to be lit and identical at the two *capture instants*, because a shadow is only a shadow where projected light is being blocked — and those are the only two moments anything is photographed. Nothing requires the wall to be lit while you walk into place, and standing in a full white field for ten seconds is unpleasant. So it comes down, and the count is light-on-black instead.

**Why step 4 waits so long.** Both photographs have to be of the *same plain white plate*, with the only difference between them being the thing that walked into the room. The difference is signed — only what got *darker* counts — so anything the tool itself is still painting when the shutter fires does not corrupt the shape a little, it *becomes* the shape. A countdown still on the wall darkens the whole lit rectangle, and that is exactly what you get back.

Taking it off the output and waiting a few frames looks like enough, and it is not: **a camera is not a screen.** Between the projector painting something and the browser being handed that picture there is the display's own lag, the sensor's exposure window, the camera's internal pipeline, USB, and decoding — a fifth of a second on an ordinary webcam and *longer in a dim room*, because darker means a longer exposure. The wait has to outlast all of that. It is set longer than the wait before the *first* photograph, which is what makes it impossible for a camera slow enough to still see the countdown to have been fast enough to see a clean plate the first time. Since the wall now spends the whole count dark, this wait also has to cover the camera's auto-exposure opening up in the dark and closing back down again — which is the slower of the two things it is waiting for.

**Simple and generous, not faithful.** An earlier version traced the blob's actual contour and handed back thirty points — every wrinkle of a jacket and every gap under an arm, recorded exactly. That is the wrong answer twice over: the margin has to inflate the shape anyway, so detail at the outline is detail that gets swallowed, and a dozen points can be pushed by hand at a wall where thirty cannot. The hull removes every concavity by construction, with nothing to tune, and it can only ever make the shape *bigger* — which is the one direction a mask is allowed to be wrong in. A standing person comes back looking roughly like a coffin, which is what a standing person's shadow is once you stop pretending to trace fingers.

**Lock the camera's exposure.** This is the one setting worth changing on the camera itself, and the Elgato Facecam has it. A camera left on auto opens up during the dark count and has not finished closing again when the second photograph is taken, so the two frames differ in *brightness* rather than in *what is standing in front of the wall* — and the check below will refuse the trace rather than hand you a wrong one. With the exposure locked, the two frames match exactly and the trace lands whatever the camera's lag is.

**If the plate was not clean, you get told, not a shape.** No timer can rule out every way the wall changes between two photographs taken ten seconds apart — a camera's auto-exposure quietly stopping down does it too, and no amount of waiting fixes that one. So before anything is traced, the tool checks how much of the *lit rectangle* went darker. Past half of it, that is the plate itself changing rather than something standing in front of it, and it refuses: *"the two photographs do not match — 87% of the lit field went darker… lock the camera's exposure and try again."* A wrong shape that looks like a shape is the worst thing this gesture could hand back, and it used to hand back exactly that.

**It writes the outline.** What the content does about that is the counting rule above: a silhouette comes back with more than four points, so the content stays where it was warped and starts being clipped by the shape. A flat rectangular thing — a placed box, a panel — comes back as four points, and four points *are* a frame, so the content lands on it. Adopt the boundaries of a box on a video shape and the video is on the box.

**It detects a difference, so the thing must be absent from one of the two frames.** It finds a person who walks into the beam, or an object placed and then removed. It cannot find a painting that hung on that wall the whole time: there is nothing to difference against, and no threshold setting changes that.

**It is not trying to be accurate, and you should not want it to be.** A coarse blob roughly the right shape is the right answer: on a fill shape the margin has to inflate it anyway, and a few points get pushed by hand. One threshold slider is there for when the room's light needs it — raise it if the trace grabs the whole wall, lower it if it finds nothing.

The traced points are stored in **output space**, so the shape stays valid long after the webcam is unplugged.

Not in this version: the polygon following you live. On a dark stage, mid-song, a mask that flickers is worse than no mask.

### 9. Export the room

**Export** writes the mapping to a JSON file. That file is this room — the shapes, their outlines and frames, their layers, and the order they paint in.

Next time you play here, **Import** it and the calibration comes back. **Keep one file per venue.** Getting a room flush from scratch is the expensive part of the evening; getting it back should cost nothing.

---

## The venue mapping

The exported JSON is the artifact Muralista exists to produce, and everything above is in service of it. It holds the geometry of one room: one flat list of shapes, in paint order, each with an outline in output space, a content frame where it carries content, and a layer saying what is inside it.

**One list, one kind of thing.** Up to v7 the file had a second top-level array, `keepOuts`, holding the regions the projector was to hold dark. It is gone. Black is a layer type, so a keep-out is a shape whose layer is `{ "type": "fill", "color": "#000000" }` and it sits in `surfaces` with everything else. The split was correct about the machinery and wrong about the model: four corners is what *content* needs, not what a shape is.

Three things worth knowing:

**It autosaves continuously.** Every edit is written to `localStorage`, so a reloaded tab does not lose an hour of calibration. The export is for carrying a room between machines and between nights.

**The storage key still carries the tool's old name** — `wallmapper.project.v1`, from the working title this was built under. It is left alone deliberately, with a guard comment on the definition. It is an *address*, not a name: renaming it would not rename anything, it would point the tool at an empty place and silently orphan every mapping you have saved. Same for the `BroadcastChannel` name and the export filename.

**A shape records an outline and, when it needs one, a frame.** `outline` is a ring of three or more normalized points and is the whole of what you edit. `corners` is the four the warp uses; it is consulted **only when the outline has more than four points**, and holds the value pinned at the moment the fifth arrived. At four points the outline *is* the frame and `corners` is simply kept in step with it. Nothing has to be recorded about which state a shape is in — it is a count, so a point added and then removed puts the two back together on its own.

**A text layer records two facts, and keeping them apart is the point.** `role` says what the region is for; the string says what is currently previewing in it. A mapping that recorded only "this region shows this string" could not tell the lyric slot from a caption somebody typed, and every venue file would have to be re-authored by hand the day Pregonero learns to read one. There are exactly two roles — `lyrics` and `static` — and there will not be a third until something actually needs one.

### What version the file is, and what each bump did

The mapping carries a `version`, and the current one is **8**. Every bump is enforced in one place — `migrateProject()`, which runs on load **and** on import — so an older file always opens, gaining what it predates and losing what it outlived. There is no separate upgrade step and no file you have to convert by hand.

| Version | What changed |
|---|---|
| 1–2 | The original mapping: surfaces, corners, layers, order. |
| 3 | The sound-reactive layer was removed. A layer that opted into mic reactivity simply loses it. |
| 4 | The beat layer went too. One from an older file becomes a test pattern — the honest fallback, since the shape stays on the wall and stays visible, it just stops pulsing. |
| 5 | **Keep-outs.** A top-level list, a sibling of `surfaces` rather than a member of it. A file that predates them carries none, which is exactly true of it. |
| 6 | **The text layer**, and the fields only it uses — `text`, `role`, `maxSize`, `align`, `color`, `outline`, `outlineWidth`. |
| 7 | **`aspect`** on a text layer: the manual half of letter width. Existing text layers default to `1.0`, which is "automatic only". |
| 8 | **Keep-outs become shapes.** The top-level `keepOuts` array is dissolved: every entry becomes a shape with `"type": "fill"`, its ring as the `outline` and its margin as a fill field. Every surface gains an `outline` of its own, defaulted to its four corners. |

Bumps 3 through 8 are marked **breaking**, and they mean it in one direction only: a v8 file will not open correctly in an older build, because that build would read something it has no code for and paint a test pattern instead. Going forward is always safe, and v8 says so in the strongest form the tool can: **a v7 mapping with keep-outs in it opens under v8 and paints a byte-identical frame**, checked in real Chrome against the projector window's own pixels rather than against the data. The migrated fills land at the top of the paint order, which is where the old rule used to put them; from then on they can be reordered like anything else.

Hostile values do not reach the renderer. An import is arbitrary JSON, and a `role` of `42`, a negative size, an `aspect` of `0`, a margin of `99` or a `javascript:` colour all fall back or clamp at the same single enforcement point — because the alternative is something inexplicable appearing on a wall with no visible cause. A shape with neither a usable outline nor a usable frame is dropped there too, rather than half-repaired downstream.

**Where this is going:** the mapping grows into a full **venue file** — adding the outer field of usable wall and named regions for lyrics and animation, alongside the shapes it already carries — which Pregonero reads and executes on stage. See `project-context.md` in this repo, under "V1 design (2026-08-20)", for the design and its open questions.

### The media folder

A layer's source is a **name** — `cerdo.mp4`, or `clips/pig.mp4`. What the name is resolved *against* is the one thing the mapping does not store.

By default it resolves next to the served page, which means "where my media lives" is really a fact about which directory you started `python3 -m http.server` in. Choose a **Media folder** in the sidebar and the tool knows instead: Chrome hands over a durable handle, and it comes back after a full browser restart without asking again.

Three things follow from a browser only ever being granted a *handle*, never a path:

- **The mapping stores the name, never the folder.** The handle is kept outside the project, in the browser. A venue file exported from a machine with a folder chosen opens on a machine without one, and needed no schema change to do it.
- **The projector window never asks for anything.** It has no handle and touches no files. The control window reads the bytes and hands them over; a permission dialog appearing on the wall halfway through setting up is not something the tool will do.
- **Nothing chosen is still a working tool.** No folder, permission not granted yet, or a name the folder simply does not have — all fall back to the served directory exactly as before. Anything the folder could not produce is named in the sidebar, next to the folder it was not found in.

After a browser restart Chrome may return the folder as *remembered but not yet permitted*. A **Reconnect media folder** button appears; the tool will not raise that dialog on its own, because a dialog nobody asked for on load is the same objection as one on the projector. Until it is clicked, names fall back.

Not Chrome? The control is hidden and every name falls back silently.

#### One folder at a time, and that is the design

There is exactly one connected media folder, and it is not a limitation waiting to be lifted. **A gig has one bag of stuff.** Everything tonight needs lives in that folder or in `mapper/media/`, which means the folder plus the venue file is the whole show and both travel to any machine together.

Several folders would break precisely that. The mapping would have to record *where* each file lives as well as what it is called, and a list of names — portable, readable, diffable — would become a list of locations, true only on the machine that wrote it. The copying the single folder forces on you is the price of the property that makes the artifact worth having.

The real cost is duplication, which is nothing for a logo and not nothing for an animation master. Untested and worth five minutes at the next opportunity: whether a **symlink inside the chosen folder** resolves through the File System Access API. If it does, a gig folder can be a folder of pointers and the cost disappears.

### Adopting boundaries, and the shadow rule

The one rule that governs every shape you draw around a person. Step 8 above is how; this is why.

A fill shape's first job is the performer: standing in the beam is physically unpleasant, and holding part of the wall dark is what you do when the room will not let you put the beam above or beside the person instead.

**Trace the performer's shadow, never the performer.** Whether you are working from a photo or from the live camera, the camera does not stand where the lens stands, so the two disagree about where a body is — in the studio, with the camera as close to the lens as it would physically go, that disagreement was still 12–15cm on the wall. A shape drawn around the body paints black onto empty wall and leaves the beam on half the face.

The shadow has no such error and cannot. It is by construction the exact set of projector pixels the body blocks — the projector drew it — and it lands on the wall plane, so it maps exactly. The correction is free, and nothing needs measuring.

This is why **Adopt boundaries** raises a white plate first. The plate is what makes a shadow exist to be photographed; the two frames it takes differ by exactly the light the body stopped.

Two caveats travel with it:

- **Draw the shape generously larger than the shadow.** A mask that is exactly the outline lets light onto the face on every lean, and a performer sways. That is what the margin slider is for.
- **The capture only finds what was not there in the first frame.** It is a difference between two photographs, so a thing that never moved cannot be found by it, however hard you push the threshold. Those you draw by hand, point by point — which works, and is untested as a workflow.

---

## Limits

Deliberate, not defects:

- **Flat facets only.** Content is warped by a four-corner frame — one perspective warp per quad. An outline of any shape can then clip it, but clipping is not bending: curved and organic surfaces need a mesh warp, which is out of scope.
- **Nothing spans a corner.** A perspective transform maps one rectangle onto one *flat plane*, so a single shape cannot bend across the join between two walls — text least of all, since it would break mid-letter at the fold. The answer is one shape per facet: two text shapes, one on each wall, each mapped to its own plane. This is the same limit as the one above wearing a different hat, and lifting it means mesh warping, which is parked in Tier 2 and not coming soon.
- **The camera is a backdrop, not an auto-calibrator.** A webcam beside the lens gives you a live, rectified view of the wall to draw on. It does not find shapes for you — you still calibrate by dragging while watching the projected result — and it is exact only on the wall plane. A phone photo remains a planning aid at best: a phone does not stand where the projector stands.
- **One projector.** A second one is another separate zone, never a blended overlap. Edge blending is explicitly out.
- **Video and images are stretched to their frame; text is not.** A shape's content is drawn into a square and mapped onto four corners, so a frame far from square stretches whatever is in it. For video and images that is deliberate and there is no fit option — a stretched pig is a style, and cropping or letterboxing one is a decision the tool does not make for you. Text is the single exception, because a stretched lyric is not a style: it takes the stretch back out and re-wraps instead, and the **Letter width** slider is there for the part arithmetic cannot know, since the tool sees the quad you drew and never the wall it lands on.
- **Stretch is corrected; shear is not, and must not be.** A quad pulled into a trapezoid still slants the letters, and that is the warp doing its job — the slant is what makes the words land square on a wall the projector is hitting at an angle. What the correction removes is the *stretch*: the fattening and squeezing that come from mapping a square box onto a non-square quad. If the text on the wall looks slanted, look at the wall, not at the tool.
- **Nothing knows the wall's real shape.** The automatic half of that correction is exact about the *quad*, and the quad is not the wall — a trapezoid drawn to compensate for the projector's position is doing its job, and no formula can tell that apart from a genuinely trapezoidal wall. Which is why the last few percent is a slider you set by eye and not a number the tool computes. Muralista is built around closing that loop rather than measuring harder: a careful automatic calibration lost to a hand calibration by three percent on 2026-08-22, and that is the tool's whole thesis rather than an anecdote in it.
- **Auto-fit has a floor, and it is loud.** Below 8px it stops shrinking and lets the text overflow rather than clip it silently, because a quad drawn far too small for its content is something you need to see. There is a lot of room before that: in a quad that reads square on the wall, the catalogue's 81-character worst case fits at 127px, an entire song's worth of text still fits at 17px, and the floor is only reached somewhere past 40,000 characters, which is not a lyric.
- **Adopting boundaries only finds what moved.** It works by differencing two photographs of the wall, so the thing has to be absent from one of them: a person who walks into the beam, or an object placed and removed. A dark alcove, a window, a picture rail, a painting that has hung there for years — anything that was in both frames — is a shape you draw by hand, point by point. That works, and it is untested as a workflow.
- **Nothing has moved to Pregonero yet.** The mapping is designed to grow into a venue file that [Pregonero](https://github.com/jorgevallejos/pregonero) reads and executes on stage, and `role: "lyrics"` already says "this region is a slot to be filled". But Pregonero cannot read a venue mapping today, so a lyric region is a preview of a promise, not a live surtitle feed.
- **Chrome only.** Alpha WebM transparency and the autoplay behaviour this leans on are Chrome-specific; Safari drops the alpha channel.
- **Media is referenced, never copied, and there is one folder.** Point the tool at the folder your media already lives in (see *The media folder* above) or drop files into `mapper/media/` by hand. Either way Muralista reads the files where they are — the picker fills in a name, it does not copy anything, and media stays out of this repo. One folder at a time is the design and not a gap: see *One folder at a time* above.
- **`python3 -m http.server` has no Range support**, so seeking within a long video feels sluggish. `npx http-server` is a drop-in replacement that does — and a source resolved through a chosen media folder sidesteps the server entirely, so it does not have this problem in the first place.

## Development

A spike: no test suite, no PR flow, conventional commits on `main`.

There is also a six-step desk pass that exercises sync, warp, calibration, playback and round-tripping the mapping, without a projector — worth running before any trip to a venue. It is written out in `project-context.md`.

The internal `mapper/` folder and the `mapper.*` filenames keep the shape they were built with. They are internal paths, nobody says them out loud, and renaming them would churn the run instructions for nothing.

**The control window uses [Pregonero](https://github.com/jorgevallejos/pregonero)'s design system**, taken from its `src/control.css` rather than approximated: the ink ground, the clay accent, hairline rules, no radii, and a monospace voice for anything you operate or read as data. Two deliberate departures. It does not load Pregonero's webfont — that belongs to Pregonero's *projection* screen, and neither control window phones a font CDN. And the drawing layer is exempt from the suite's contrast discipline: shape outlines, corner handles and fills sit on top of a live camera feed of an arbitrary wall, so they keep their own high-contrast colours on their own `--draw-*` tokens. They are not chrome; they are the instrument, and a hairline in clay over whitewash is invisible.

**The output window has no styling to speak of and that is on purpose.** It is not a UI, it is the projection: black, no cursor, and nothing on it that the mapping did not put there.

## License

MIT — see [LICENSE](LICENSE).

---

*Muralista is part of **Tramoya**, the stage machinery behind [Chango Pepper](https://changopepper.com) — the rigging above the lights and the trap doors below the boards, the part of a show that works hardest and is never seen. A muralista is a painter of walls. The repository was called `projection-mapping`, and the tool `Wall Mapper`, until August 2026.*
