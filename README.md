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
- **Shapes learned that a song is a thing on 2026-08-24** (v1.3.0). Four types — `song-lyrics`, `song-video`, `song-intro`, `gig-contact` — plus a gig folder the tool reads `gig.json` out of and writes `visuals.json` back into, and two levels of visual setup. Verified in real headed Chrome against the rendered output, including the one assertion that matters for a mapping you already have: **a v8 file opens under v9 and paints an identical frame**, compared property by property against the previous build — the pattern canvas as a PNG, every `matrix3d` and `clip-path`, every fitted font size, stroke and colour. **The gig folder's picking flow is not automatable**, exactly like the media folder's, so it was exercised through a stand-in handle; the round trip only a person can run is pick a folder, quit Chrome, reopen, and see whether it comes back granted. **And none of the four types has been seen on a wall**: the intro card's proportions, the contact panel's QR size and the placeholder text were all judged on a monitor. The tagline is the first thing to check from the back of a real room, and whether the QR scans from where people stand is the second.
- **The warp came out into its own file on 2026-08-25** (v1.4.0). `mapper/warp.js` — the homography and the `matrix3d` it becomes — is now the one file in this repo that another program runs: [Pregonero](https://github.com/jorgevallejos/pregonero) vendors a copy and executes it on stage, so what you see while tuning a shape here is exactly what the room sees on the night. It is a pure ES module with no dependencies and no build step: no state between calls, no I/O, no DOM, no globals, and no knowledge that Pregonero exists. **A move, not a rewrite** — the maths is byte-identical to the code that was verified at a real projector, and this build's own verification was that a six-shape mapping paints an identical frame at two different output sizes, compared property by property against the previous build: every `matrix3d`, every fitted font size, stroke and colour, and the pattern canvas as a PNG. The contract that governs it lives outside this repo, in `tramoya-integration/docs/warp-contract.md`, because how two tools agree is a fact about two tools at once.
- **Direct manipulation is now verified by hand** (2026-08-22). It landed in July and was only ever checked headlessly, and it did not in fact work: a drag moved a quad by one mouse-move and then froze, and pressing an unselected quad did not move it at all. Fixed, and confirmed in Chrome with a real mouse against painted output. **Transport-synced overlays are still hand-untested.**
- **The desk-tool shape described above is the direction, not the current build.** Today Muralista still renders live: it has a transport, because v1 was designed as a tool that runs during the show. That decision was reversed on 2026-08-20. The sound-reactive half was removed on 2026-08-22 and preserved at the tag `mic-reactivity-archive`: a tool that maps a wall before a show cannot also be the thing listening to the room during it. The beat layer that removal left standing went too (2026-08-23) — with mic mode gone it was a circle pulsing at a fixed BPM, and nothing about drawing shapes on a wall needs one. **What Muralista renders today is video, image, text and solid-fill layers on shapes**, plus the test pattern you align against. The behaviours that left survive as direction — they become properties declared in the venue mapping and executed by [Pregonero](https://github.com/jorgevallejos/pregonero) — but nothing has moved across yet, and Pregonero cannot read a venue mapping today.

- **The tool became a flow on 2026-09-03** (v1.8.0). `THE DEAL · 1 LAYOUT · 2 SHAPES · 3 OUTPUT`, and **step 2 is the canvas exactly as it was** — the flow adds a way in and a way out, not a second tool. THE DEAL is shown once, on the signal that no mapping exists yet; 1 LAYOUT is *keep the default, or adjust it*, and **adjusting starts from the default already placed** rather than from a blank wall. **3 OUTPUT is named for doing**: it previews with Muralista's own stand-in content, takes the stage capture, and saves. Walked in real headed Chrome, both ways through screen 1, hosted and standalone.
- **The stage capture landed with it, and it is what makes working from home honest.** A photograph of the stage taken **through the calibrated camera**, into output space, saved as `stage.png` beside the gig's two JSON files. The photo backdrop that already exists is cropped to the projector's throw by hand, and **any error in that crop becomes a fixed offset in every shape drawn on it** — the *Limits* section below has said so since this tool had a backdrop. There is no crop step here, which is the whole reason it exists. Map at the venue on Monday, move things around at home on Wednesday, reconfirm at the venue on Friday. **Authoring only**: it never reaches the output window. Its maths is `mapper/stageCapture.js` with its own `node --test` suite, and the transform was checked end to end in headed Chrome against a synthetic camera frame — a lit rectangle occupying the middle half of the camera's view came back filling the output frame, which is the calibration doing its job and is what a raw frame would have failed.

- **The handed-in `visuals.json` wins, since 2026-09-03** (v1.9.0). Round one shipped write-only: this tool never read a room back, so a machine with no local mapping whose gig folder had one **skipped the deal and landed on an empty canvas**. Now **Muralista keeps a local copy only when it was not handed one**. In a gig context the local store is never consulted, editing inside a gig writes to the gig folder only, and the local store is for standalone with no gig — the one time this tool has to remember a room by itself. Disconnecting a gig hands the local room back, so nothing is lost either way. A `visuals.json` naming another gig is **refused by name**, not loaded, which is the refusal Pregonero already makes on the same field. Walked in real headed Chrome against a served gig folder; the `Clear` half needs a folder picker no automation can drive, so it is code-verified only.

- **The stage capture is a backdrop source, since 2026-09-03** (v1.10.0). `v1.8.0` wrote `stage.png` and nothing read it, which made it a file that served nobody. It is now **an option in the Backdrop dropdown**, beside a photo and the live camera, offered only when the connected gig's folder holds one — and it loads down the **same path a chosen photo takes**, downscale included. That is what the capture was for: setting the room up at home, against a photograph of the stage taken through the calibrated camera, without going back to the venue.

- **`1 LAYOUT` was removed on 2026-09-04** (v1.11.0), after Jorge walked it. The flow is **`THE DEAL · 1 SHAPES · 2 OUTPUT`**. That screen offered *keep the default, or customise* — but **custom started from the default, already placed**, so both answers produced the same room and the only difference was whether you then edited it. A screen with no real choice on it is why it could not explain itself. **And its skip was wrong**: keeping the default sent you straight to the output, and a gig whose songs have video still has to reach the shapes to assign them — the skip was designed when the output screen still carried a preview, and did not survive that screen becoming the photograph. **The default is now simply what is there when you arrive at the shapes**, and nothing else about it changed: Muralista still writes a real `visuals.json`, from `2 OUTPUT`, because nothing is written on behalf of a tool that did not run. Removing it exposed a dead end that had been there since `v1.8.0` — **`Adjust it` never advanced the flow, so the output cell stayed dimmed with no way to it** — so `1 SHAPES` gained the forward control it should always have had.
- **The toolbar lost three buttons and the left-hand side lost its prose** (v1.11.0, 2026-09-04). `Export` and `Import` are **hidden the moment a gig folder is connected**: in a gig an import would silently override the gig's own `visuals.json`, which contradicts *the handed-in file always wins*. **They stay standalone**, where they are the only portability there is — the local store is a browser's, and `visuals.json` is the emitted room rather than the project, carrying no camera calibration and no backdrop. `Identify` came off outright. `Play`, `Pause`, `Restart` and `Open output window` stay, because they are how the room is actually seen. The explanatory paragraphs went with them, on the rule that **a sentence reporting a fact about right now stays — a status, or the reason a control is shut — and a sentence that teaches goes.** Add back only what proves necessary.
- **Muralista says which of its own screens is showing, to whoever is embedding it** (v1.11.0). One string, one of three cells, over `postMessage` to `window.parent`, and nothing is read back. It exists so an embedder's forward control need not sit on a screen that already has one. **No gig, no song, no file and no geometry cross** — it is the same class of thing as being told `--no-header`, going the other way, and standalone it is a no-op.

- **`2 OUTPUT` lost its panel, and the forward control moved to a page footer** (v1.12.0, 2026-09-04), both after Jorge walked Pregonero's `v0.54.0`. **The stage picture IS the result** — that was ruled on 2026-09-04 and a panel had crept back in carrying a capture button and a save, which is also why the walk did not notice the screen had changed: OUTPUT looked like SHAPES with a different sidebar. **The capture is taken on arrival** now, so the photograph is always current, and **a home session with no camera shows the saved `stage.png` rather than overwriting a good venue capture with nothing.** Entering the screen closes the output window if one is open.
- **The forward control lives on the page's own footer, outside every panel, bottom-right** (v1.12.0). **The problem was never *left*** — Bombista's `Process song →` is bottom-left and has never been missed. It was that `To the output →` sat at the foot of a tall column of controls and read as one more panel item. One place, on every step of this flow and of Pregonero's.
- **Moving forward saves, so `Save to gig` is standalone's control now** (v1.12.0). **Two controls where one leaves and the other writes is a trap even when both work.** In a gig the embedder asks for the save and this tool answers whether it worked — one word in, one boolean out, and **the line for any future message: this tool may be told what to do with its own state and may report its own outcome; it may never report the work.** Standalone there is no forward control, so `Save to gig` is how a room is saved at all.
- **The toolbar belongs to `1 SHAPES`, and two standalone leftovers are hidden in a gig** (v1.12.0): the media-folder picker, because the folder was answered at first run and the host resolves every name through it, and `Reload from the gig folder`, because you arrived from a flow that had just read it. Both stay standalone.

- **The name band is standalone's, and the stage photograph is annotated** (v1.13.0, 2026-09-04). **Hosted, `MURALISTA` is the tool introducing itself to somebody who did not choose it** — the same argument that removed Bombista's header — so the band goes in a gig and the toolbar rides on the step row instead, right-aligned; **standalone the name stays**, because there the tool was chosen. Same rule as `--no-header`, decided by who is asking. And `2 OUTPUT` **draws each shape's outline and name on the photograph**: naming them in a list would say they exist, which the person already knows; drawing them says **where they landed on the actual wall**. It is geometrically honest — the capture is taken through the same calibration the coordinates live in — and it does not break *nothing is simulated here*: an outline over a photograph is annotation, and the light in the picture is still real light. The picture is smaller than the canvas, because it is a low-resolution capture and the detail was never the point.
- **The forward control went back to bottom-left** (v1.13.0). `v1.12.0` moved it right on a correct diagnosis and the wrong fix: **the problem was never *left*** — Bombista's `Process song →` is bottom-left and has never been missed — it was that the control sat inside a panel. **The divider is what fixes that**, and it was already there.

- **Song visual setup landed on `1 SHAPES`** (v1.14.0, 2026-09-04), and with it the field *the song holds no media* needed a home for. **One selector starting at `All`** — `All` is the room, full editing, unchanged — and **picking a song switches the canvas to assignment only**: the handles disappear, because you cannot drag what has no handle, and the header says so. **Never per-song geometry**: a song holding its own coordinates is silently wrong on stage after the room is remapped. What a song sets is **what it puts in a shape** — a `song-video` shape offers a picker onto the visuals folder, a `song-lyrics` shape needs nothing chosen because the words arrive from the song file through Pregonero. **Empty means dark for that song, and empty is the default**: a song with no animation sets nothing.
- **`songVisuals.assets` is a NEW field, not the map beside it.** `songs` says *which shape does this song use*; `assets` says *what does it put in it*. Keyed by shape id, never by type, because two shapes spanning a corner each carry their own — and it stores **a name, never a path**, which is what lets a gig folder travel.
- **How the picker learns the folder, in a gig**: the host mounts it and answers a `GET` on the mount root with the names. **A cross-origin frame cannot open a directory picker** — Chromium refuses outright, and there is no permissions-policy token for it — so the host browses on the page's behalf. **Standalone is unchanged**: `showDirectoryPicker` and the handle, which is the mechanism this mirrors rather than replaces.

- **Conditional visibility, and the designed default at last** (v1.15.0, 2026-09-04). A shape may carry `visibleWhen: { shape, is }` — **it shows only when another shape is `filled` or `empty` for the song being played.** Cowork proposed a flag saying *for songs with video / without* and **Jorge rejected it as domain knowledge this tool does not have**; asking about another shape is entirely its own vocabulary. **Muralista declares the relationship, Pregonero evaluates it**, because Pregonero is the one that knows what content landed. **On the shape, never in a connectors list** — deleting a shape takes its condition with it, so nothing orphans — and **an object rather than a string**, so a `when` or an `after` can join later. **This is the condition, not an animation system.** **One level, so cycles are impossible**: a condition may only point at a shape that has none of its own, enforced where the target is picked and again on load. **Deleting a referenced shape refuses and names its dependents** rather than silently dropping their conditions.
- **So the default is three shapes now**, which is what `v1.8.0` said it was waiting for: a frame-filling `song-video` shape, a `song-lyrics` shape at its foot when the video is **filled**, and a `song-lyrics` shape across the frame when it is **empty**. **A song with an animation gets video with words at the foot; a song without gets words across the projector's frame — same room, no geometry moved.** The 02/09 default policy expressed in custom's own vocabulary rather than hardcoded, which was the point.
- **Three levels of visibility at three costs**: the rule is authored **as a sentence** on the shape it affects (`Show only when [ Frame ] is [ empty ]`), because sentences read correctly to non-technical authors where field/operator/value grids do not; a **small permanent badge** on the canvas names what a shape depends on, because an invisible property needs a visible mark; and a **`show dependencies` toggle** draws every link at once when asked, because permanent wires belong on a graph surface and not on a photograph of a wall. **Unconditional shapes, which are most of them, pay nothing.**

- **`1 SHAPES` redesigned** (v1.16.0, 2026-09-04), after Jorge picked a song, could not move any shape, added a new one and could not move that either, and concluded the app was broken. **It was not** — a selected song is assignment-only and the handles go on purpose. **The sentence that was meant to prevent exactly that sat mid-panel, in the fail colour, in a sidebar he was not looking at.** *A panel that changes is not a mode you notice.* So **the mode is on the canvas now**: a band above it naming the song and stating the mode, and **outlines that draw locked** — thinner and dashed — so a shape you cannot drag does not look like one you can, and the missing handles read as a consequence of something visible.
- **The screen's areas are Backdrop · Scope · Shapes · Shape.** Backdrop and **Scope** move to the top, one line each, because Scope is the mode switch and everything below changes meaning with it. **Shape opens as an accordion under its own row** — Type, Content, Visibility, Format — so the thing being edited and the controls that edit it are one block. **Content is new**: in `All` it is what this shape holds for the whole gig, in a song it is what that song puts there, and it says why when a type takes none.
- **Reading a room whose shapes overlap**, which the three-shape default makes unavoidable: **selecting a shape draws it clearly and dims every other**, hovering a row does the same temporarily, and **only the focused shape carries its name and dependency badge**. **The stand-in text renders on the canvas at last** — through the *output's own renderer*, not a second one — so `maxSize` and `aspect` are tuned against the thing rather than against the word `lyrics`.
- **`Previewing: Frame filled / empty`** — one toggle per condition, derived from the conditions present. **A view, never a setting**: it writes nothing and never reaches `visuals.json`, the same relationship the dummy text has to real lyrics. Absent in a song, where the assignment already decides which face is drawn.
- **The list gained drag-to-reorder and lost the arrows, the duplicate and the eye**; outline points are edited **on the shape** — double-click a boundary to add, drag to move, Delete to remove — and the menu that held those went with them. **`Adopt boundaries` is removed**, and with it the two-photograph difference, the convex hull, the threshold and the countdown. The white plate stays: camera calibration raises it.

Two test suites, covering two files. `mapper/warp.test.mjs` pins the warp, because that file is shared with another repo and drift between the two would show up as a few pixels of rotation on a wall in front of people. `mapper/stageCapture.test.mjs` pins the stage capture's transform, because a capture taken the wrong way through the calibration **still looks like the stage** and puts every shape drawn on it in the wrong place at the venue. The rest is still a spike, run with spike discipline, and verified the way the notes above describe: in real headed Chrome, against what is painted.

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

Add a shape over the part of the wall that will carry the words, and pick its type.

**Two types, and the difference is what the region is *for*:**

- **`song-lyrics`** is a **slot** — the place the playing song's lines go, filled from the song file by Pregonero on the night. The string you type here is a *preview* of that slot. It only appears in the menu once a gig is connected (step 9).
- **`text`** is content this shape owns. What you type is what stays there, which is what a title card is.

Up to v8 that distinction was a separate `Role` field on one `text` type. It is the type now: the type is the field everything else already switches on, so saying it there says it once.

**Paste the longest line you will actually sing.** A layout tuned against a short line is not tuned. Line breaks you type are line breaks on the wall — several entries in the catalogue carry one and render as two lines, and a region sized against a single line clips them.

If you want the worst case, this is it — the longest entry in the whole catalogue, from *Tragedia de Cerdo Asado*, 81 characters over two lines, or 152 over four with the translation stacked under it:

```
Respiro libre, siento la brisa,
me fui del infierno, dejé las cenizas.
I breathe out free, I feel the breeze,
I fled from hell, I left the ashes behind.
```

**Judge legibility against that one, not against a short line.** A region that reads with three words in it tells you nothing.

Everything you tune while watching the wall is in **one row** under the text: alignment, colour, size, outline. Hover any of them for what it does.

Two things about the size stepper:

- **It is a fraction of the shape, not a font size.** The number stored in the mapping is a percentage of the quad's height, so when you redraw that quad in the next room the text comes with it. An absolute size would quietly break every layout you ever tuned. That is why the stepper carries no unit.
- **It is a ceiling, not a size.** Text that would not fit is shrunk below it until it does — wrapping on word boundaries, honouring your line breaks, keeping a margin off the edge. So it cannot overflow the shape at any setting, and short lines still get to be big.

**Letter width** is behind **More**, and most of the time you will not touch it. A shape's content is drawn into a square and mapped onto four corners, so a quad far from square would ordinarily stretch whatever is in it — and for video and images it still does, deliberately. Text is the exception: the shape corrects itself, so a wide strip lays the words out wide instead of fattening them, and ×1.00 is normal letters in a quad of any shape.

It is there for the part no formula can reach. **Muralista only ever sees the quad you drew, never the wall it lands on** — a quad on an angled wall is a trapezoid *on purpose*, because the warp is compensating for where the projector happens to stand, so the drawn shape and the physical shape are different things and only one of them is in the file. You can see the other one, through the camera. Nudge it until the letters look right on the wall, not until the number looks right on the screen.

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

**The camera's own brightness is taken out of the comparison.** A camera left on auto opens up during the dark count and has not finished closing again when the second photograph is taken, so the two frames differ in overall *brightness* as well as in what is standing in front of the wall. That used to defeat the whole gesture. It no longer does: a shadow is a **local** darkening and auto-exposure is a **global** gain, so the gain is estimated from the two frames and divided out before anything is compared. The estimate is taken from the bright end of the picture — the 90th percentile of the lit rectangle — because everything this is looking for is *darker* than the plate, so the plate's own brightness is the one thing a silhouette cannot drag around.

**Locking the exposure is a recommendation, not a requirement.** The Elgato Facecam has it and it is the steadier setting, but auto works. The one case arithmetic cannot rescue is a *blown-out* first photograph: if the plate comes back pure white there is no brightness left in it to compare against, and the tool says so and points you at the camera rather than at the wall.

**If the plate was not clean, you get told, not a shape.** Before anything is traced, the tool checks how much of the *lit rectangle* went darker once the global gain is out of the way. Past half of it, that is the plate itself changing rather than something standing in front of it, and it refuses: *"the plate was not clean — 87% of the lit field went darker relative to the rest of it… check that nothing else is being projected onto that wall."* Because the global gain has already been divided out by then, this now means what it says: something really did cover the projection. A wrong shape that looks like a shape is the worst thing this gesture could hand back, and it used to hand back exactly that.

**It writes the outline.** What the content does about that is the counting rule above: a silhouette comes back with more than four points, so the content stays where it was warped and starts being clipped by the shape. A flat rectangular thing — a placed box, a panel — comes back as four points, and four points *are* a frame, so the content lands on it. Adopt the boundaries of a box on a video shape and the video is on the box.

**It detects a difference, so the thing must be absent from one of the two frames.** It finds a person who walks into the beam, or an object placed and then removed. It cannot find a painting that hung on that wall the whole time: there is nothing to difference against, and no threshold setting changes that.

**It is not trying to be accurate, and you should not want it to be.** A coarse blob roughly the right shape is the right answer: on a fill shape the margin has to inflate it anyway, and a few points get pushed by hand. One threshold slider is there for when the room's light needs it — raise it if the trace grabs the whole wall, lower it if it finds nothing.

The traced points are stored in **output space**, so the shape stays valid long after the webcam is unplugged.

Not in this version: the polygon following you live. On a dark stage, mid-song, a mask that flickers is worse than no mask.

### 9. Bring in the gig

Everything so far works with no gig at all, and that stays true — mapping a wall unpersisted is a thing you can do at any time, and nothing below is required.

But four of the shape types need to know a song is a thing, and they only appear once a gig is connected. Under **Gig**, press **Choose gig folder…** and pick the folder holding the gig's `gig.json`. Pregonero writes that file; Muralista only ever reads it, and only ever reads **song ids, song titles and the venue** out of it. It will not make one for you: a folder with no `gig.json`, or a gig with no songs in it, gets told so rather than invented around.

Four types come with it:

| Type | What it holds | What you can set |
|---|---|---|
| `song-lyrics` | The playing song's lines | Everything a `text` shape has. Tuning legibility at the wall is why the type exists. |
| `song-video` | The playing song's video | Nothing. **The quad is the framing** — the video stretches to fill it, so a video that wants to sit differently is a different shape. The wall shows you the extent it will fill. |
| `song-intro` | The song's translation, title and tagline | Nothing. A locked template in fixed proportions; the shape's position and size are the only decisions, and they move all three parts together. |
| `gig-contact` | One line, plus an optional QR code | The line, and the file name of a QR image. Once, for the whole night — this one is not per-song. |

**A shape has exactly one type.** Lyrics and video over the same patch of wall are two shapes; **⧉** duplicates the geometry for you.

**Lyrics preview with a fixed dummy line**, and it is deliberately nasty — three rows, two hard breaks, quote marks, and awkward Dutch built around a 23-letter compound. Muralista never reads a real lyric: it tunes against the worst case and writes down a boundary, and Pregonero renders the real lyrics inside it. So the stand-in has to genuinely *be* the worst case, and this one is — measured against all 1088 lyric strings in the song catalogue on 2026-08-27, it is at least as hard as every one of them on length, on hard rows and on longest unbreakable run. Softening it is making the tool easier to be wrong with.

**The QR code is a file you supply**, resolved through the media folder like any other source. Muralista does not encode one. Generate it elsewhere, drop the PNG in beside the videos, and scan it off the wall with a phone before the doors open — which is the only test that counts.

Then there are **two levels of setup**, and the second one is usually empty:

- **Gig — the room.** Which shape of each kind serves every song. For a gig where all the songs follow one pattern, this is the whole job, and the first shape you give a type is picked up as the default automatically.
- **Song — a deviation.** Pick a song, then pick which existing shape of that kind it uses instead. **Reassignment only.** A song never holds its own geometry: if it did, re-mapping the room would leave that song silently on the old position — wrong on stage, with nothing reporting it. If no shape fits, go back to gig setup and add one.

While a song is selected the wall **previews that song**: the shapes it does not point at go dark, and so does the contact panel, because a song is playing. That is not a display mode, it is what those shapes will do on the night. A shape is a place that *can* hold content, not a thing that is on — which is what makes adding one cheap, and why the gap between songs falls out for free with no blackout state anywhere.

Finally, **Save visuals.json**. That writes the room into the gig's folder, beside `gig.json`. **Muralista is the sole writer of that file and never touches `gig.json`** — one writer per file is the whole ownership rule, and it is what lets you take a gig to another machine, do the visual work, and hand back one file. Nothing autosaves it: the line saying when it was last written disappears the moment you edit anything, because from then on the folder is behind what is on your screen.

### 10. Export the room

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

**A text layer records two facts, and keeping them apart is the point.** What the region is *for* is the layer's **type** — `song-lyrics` for a slot Pregonero fills, `text` for content the shape owns. The string is what is currently in it. A mapping that recorded only "this region shows this string" could not tell the lyric slot from a caption somebody typed, and every venue file would have to be re-authored by hand the day Pregonero reads one. Up to v8 that fact lived in a separate `role` field; v9 retired it into the type, which is the field everything else already switches on.

**Since v9 the file also carries `songVisuals`**, which is the two levels of setup written down: `defaults` says which shape of each kind serves the gig, and `songs` holds one entry per *deviating* song. A song that follows the pattern is simply absent. **Resolving a type for a song returns a set, and the renderer lights all of it** — there is no one-shape cap anywhere in the file or the code, because a lyric spanning a corner or a pillar is two shapes (a homography maps one flat plane) and so is original beside translation. The authoring UI offers one shape per type for now, so real files hold sets of one; a hand-edited file naming two already works.

### What version the file is, and what each bump did

The mapping carries a `version`, and the current one is **9**. Every bump is enforced in one place — `migrateProject()`, which runs on load **and** on import — so an older file always opens, gaining what it predates and losing what it outlived. There is no separate upgrade step and no file you have to convert by hand.

| Version | What changed |
|---|---|
| 1–2 | The original mapping: surfaces, corners, layers, order. |
| 3 | The sound-reactive layer was removed. A layer that opted into mic reactivity simply loses it. |
| 4 | The beat layer went too. One from an older file becomes a test pattern — the honest fallback, since the shape stays on the wall and stays visible, it just stops pulsing. |
| 5 | **Keep-outs.** A top-level list, a sibling of `surfaces` rather than a member of it. A file that predates them carries none, which is exactly true of it. |
| 6 | **The text layer**, and the fields only it uses — `text`, `role`, `maxSize`, `align`, `color`, `outline`, `outlineWidth`. |
| 7 | **`aspect`** on a text layer: the manual half of letter width. Existing text layers default to `1.0`, which is "automatic only". |
| 8 | **Keep-outs become shapes.** The top-level `keepOuts` array is dissolved: every entry becomes a shape with `"type": "fill"`, its ring as the `outline` and its margin as a fill field. Every surface gains an `outline` of its own, defaulted to its four corners. |
| 9 | **Song-aware types**, and `role` retires into the type: a text layer with `"role": "lyrics"` becomes `"type": "song-lyrics"`, one with `"role": "static"` becomes a plain `"text"`, and the field goes. Adds the top-level `songVisuals` table. |

Bumps 3 through 9 are marked **breaking**, and they mean it in one direction only: a v9 file will not open correctly in an older build, because that build would read something it has no code for and paint a test pattern instead. Going forward is always safe, and each bump says so in the strongest form the tool can. **A v7 mapping with keep-outs in it opens under v8 and paints a byte-identical frame**, checked in real Chrome against the projector window's own pixels rather than against the data; the migrated fills land at the top of the paint order, which is where the old rule used to put them, and from then on they reorder like anything else. **A v8 mapping opens under v9 and paints an identical frame** too, checked the same way — the role/type change is a rename and nothing the renderer reads moves with it, so your pasted lyric line, its size, its letter width, its alignment, its colour and its outline all arrive exactly as they were.

Hostile values do not reach the renderer. An import is arbitrary JSON, and a type of `42`, a negative size, an `aspect` of `0`, a margin of `99` or a `javascript:` colour all fall back or clamp at the same single enforcement point — because the alternative is something inexplicable appearing on a wall with no visible cause. A shape with neither a usable outline nor a usable frame is dropped there too, rather than half-repaired downstream.

**Where this is going:** the mapping grows into a full **venue file** — adding the outer field of usable wall and named regions for lyrics and animation, alongside the shapes it already carries — which Pregonero reads and executes on stage. See `project-context.md` in this repo, under "V1 design (2026-08-20)", for the design and its open questions.

### The gig folder

A second folder, picked the same way and remembered the same way, holding one gig. **Muralista reads `gig.json` out of it and writes `visuals.json` back into it, and that is the entire traffic.**

**What it reads: `songs` and `venue`. Nothing else, ever.** Not the setlist, not tempo, not translations, not count-ins, not lyrics. It needs song ids and titles so a deviating song can be picked by name, and the room's identity. That line is exactly why lyrics preview with a dummy string — the day the tool needs a field below it is the day it has been made to understand Pregonero, which is the thing this suite is arranged to avoid.

**It never writes `gig.json`.** Pregonero owns that file. Muralista owns `visuals.json`. One writer per file is the whole ownership rule.

Like the media folder, the handle lives in IndexedDB and the mapping never mentions it, so a mapping made with one gig connected opens fine with none — the song-aware types simply stop being offered, and any shape that already has one keeps it.

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
- **Hosted, the gig arrives as an endpoint and there is no picker.** `mapper.html?gig=<relative URL>` makes the tool read `gig.json` and write `visuals.json` over HTTP instead of through a directory handle, so a host that already made the gig's folder stops asking you for it. **The URL must be relative**; an absolute one is refused, which is what keeps the host's identity out of this tool. With no parameter nothing changes: the picker, the handle and the direct write, exactly as below. Standalone is a requirement, not a fallback.
- **Nothing has moved to Pregonero yet.** The mapping is designed to grow into a venue file that [Pregonero](https://github.com/jorgevallejos/pregonero) reads and executes on stage, and a `song-lyrics` shape already says "this region is a slot to be filled". But Pregonero cannot read `visuals.json` today, so a lyric region is a preview of a promise, not a live surtitle feed — which is also why the preview line is a fixed dummy rather than anything out of a song file.
- **Chrome only.** Alpha WebM transparency and the autoplay behaviour this leans on are Chrome-specific; Safari drops the alpha channel.
- **Media is referenced, never copied, and there is one folder.** Point the tool at the folder your media already lives in (see *The media folder* above) or drop files into `mapper/media/` by hand. Either way Muralista reads the files where they are — the picker fills in a name, it does not copy anything, and media stays out of this repo. One folder at a time is the design and not a gap: see *One folder at a time* above.
- **`python3 -m http.server` has no Range support**, so seeking within a long video feels sluggish. `npx http-server` is a drop-in replacement that does — and a source resolved through a chosen media folder sidesteps the server entirely, so it does not have this problem in the first place.

## Development

A spike with two exceptions, both earned rather than adopted wholesale: changes go through a PR, and the two files whose failures are invisible have tests.

```bash
node --test mapper/warp.test.mjs mapper/stageCapture.test.mjs
```

No dependencies, no package.json, no runner to install — Node 22.7 or newer reads both as ES modules on its own. `warp.test.mjs` holds known corner sets and the exact `matrix3d` strings they must produce. **Those strings are golden values from the build that was verified at a real projector**, so a failure is not a stale expectation to be refreshed: it means every room ever mapped now renders somewhere else. Pregonero runs this same file against its vendored copy, which is the whole point of it.

`stageCapture.test.mjs` pins the stage capture's transform. Nothing outside this repo runs it — it is not a contract — but it is here for the same reason: **a capture taken the wrong way through the calibration still looks like the stage**, and every shape drawn on that picture then lands somewhere else at the venue. The asymmetric and keystoned cases are the ones that would catch it; the centred one would pass either way and says so.

There is also a six-step desk pass that exercises sync, warp, calibration, playback and round-tripping the mapping, without a projector — worth running before any trip to a venue. It is written out in `project-context.md`.

The internal `mapper/` folder and the `mapper.*` filenames keep the shape they were built with. They are internal paths, nobody says them out loud, and renaming them would churn the run instructions for nothing.

**The control window uses [Pregonero](https://github.com/jorgevallejos/pregonero)'s design system**, taken from its `src/control.css` rather than approximated: the ink ground, the clay accent, hairline rules, no radii, and a monospace voice for anything you operate or read as data. Two deliberate departures. It does not load Pregonero's webfont — that belongs to Pregonero's *projection* screen, and neither control window phones a font CDN. And the drawing layer is exempt from the suite's contrast discipline: shape outlines, corner handles and fills sit on top of a live camera feed of an arbitrary wall, so they keep their own high-contrast colours on their own `--draw-*` tokens. They are not chrome; they are the instrument, and a hairline in clay over whitewash is invisible.

**The output window has no styling to speak of and that is on purpose.** It is not a UI, it is the projection: black, no cursor, and nothing on it that the mapping did not put there.

## License

MIT — see [LICENSE](LICENSE).

---

*Muralista is part of **Tramoya**, the stage machinery behind [Chango Pepper](https://changopepper.com) — the rigging above the lights and the trap doors below the boards, the part of a show that works hardest and is never seen. A muralista is a painter of walls. The repository was called `projection-mapping`, and the tool `Wall Mapper`, until August 2026.*
