# Muralista v1 — design

*Opened **2026-08-20** in a Cowork design session. Supersedes the "parked until the Q4 animation
project is defined" line on the dashboard: the project now has a goal that does not depend on that
definition.*

*This document answers **Venue Turn open question 2** (who renders on stage, whose clock) and takes a
position on questions 1 and 3. It does not reopen anything in `context/tramoya/KICKOFF.md`.*

---

## 1. The goal, in Jorge's words

> Release a first version of Muralista usable in concerts in little places. Rather than bringing the
> canvas — or in addition to it — the projector points at the *whole* background where he sings,
> including him. Then decide what goes where: animation, lyrics, and black spaces such as his own
> shape.

Two things in that sentence change the project.

## 2. Frame change — from additive to subtractive

Muralista today is **additive**. You add quads; each quad is a corner-pinned surface carrying a
layer; everything outside the quads is black by default. Black is the absence of a decision.

What Jorge describes is the inverse. The projector **floods the whole background**, and the mapping
is a **layout of that flood** — including which parts of it stay dark. Black becomes a decision, and
therefore an object.

**This makes negative space a first-class primitive, which the tool has no concept of today.** Every
consequence below follows from that one sentence.

### 2.1 The keep-out is the new primitive

Named in the Venue Turn as §2.3 and now confirmed as a v1 requirement: a **keep-out region** the
projector paints dark. Its first job is the performer.

**Decided: a static performer box, not tracking.** A polygon in the venue file that the renderer
keeps black, and a rehearsal discipline — Jorge commits to staying roughly inside it. It is
deterministic, rehearsable, needs no camera, and works tonight.

Camera silhouette tracking is the Elgato Facecam's eventual job and it is **out of v1**, for the
reason the room itself supplies: it is a low-light stage, mid-song, with a performer inside the beam.
A mask that flickers is worse than no mask. The static box is not a compromise waiting to be
upgraded; it is the correct answer for a small room, and it stays correct.

Keep-outs generalise past the performer, and cheaply: the doorway, the window, the bright painting
the owner will not let you take down, the mirror behind the bar. In a café that list is most of the
setup work, and no tool in the suite can express it today.

## 3. The architecture — Muralista is a desk tool, not a stage tool

Jorge's answer, and it is a **fourth shape** that neither branch of Venue Turn §2.6 anticipated:

> Muralista does the work *before*, like Bombista, and delivers a configuration file which Pregonero
> reads and executes.

Both shapes on offer in §2.6 assumed one renderer swallowing the other — A had Muralista rendering
with Pregonero as a source, B had Pregonero painting into a surface Muralista warped. Jorge's cut is
along a different axis entirely, and it is the one the suite already uses.

**Take it. It is the better shape, and here is why it is not merely a third option:**

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

### 3.1 What Muralista becomes

An **authoring tool for a room**. Its output window stops being a performance surface and becomes a
**calibration surface** — you drive it at the venue, projector on, to place the field, the regions
and the keep-outs. Then you export. Then you close it, and it takes no part in the evening.

That is precisely Bombista's shape, one level up: run before, produce a file, get out of the way.

### 3.2 What this costs — say it out loud

**The runtime half of v2 is now on the wrong side of the tool boundary.** Muralista's shared
transport, beat layers and the whole 2026-07-03 mic-reactivity slice (`065c03f`) were built for a
Muralista that runs *during* the show. Under this shape, Muralista does not run during the show.

That work is **relocated, not wasted**: "this layer breathes with room loudness" stops being a live
behaviour Muralista performs and becomes a **declared property in the venue file that Pregonero
executes**. The design survives intact. The code is on the wrong side of the line, and porting it is
real work that has not been costed. This is the largest hidden cost of the shape and it should not be
discovered in September.

**Second cost: Pregonero grows.** To execute the file it must learn to render into arbitrary warped
quads and to hold regions dark. Pregonero is `v0.11.0`, feature-complete, 953 tests green — a good
place to be careful. See §5 for how far this actually has to go for v1, which is less far than it
sounds.

## 4. The file

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

The last two rows are **show** data, not venue data, and by §2.1's test they belong in a third file.

**Decision for v1: fuse them anyway, in the venue file, and let a second gig prove it wrong.** Venue
Turn §2.1 explicitly offers this, and §2.7 insists on it — *do not design the format, earn it.* SP
JSON was a name for what already existed; the venue file gets the same treatment. Play two rooms,
write the file by hand both times, and let the fields that need to differ between rooms declare
themselves. Splitting it before that is guessing.

**Do not name the file's format yet.** Venue Turn §7 already parked naming until the artifacts exist,
and it is right. "Venue file" is a description, not a name.

## 5. Staged v1 — the smallest thing that plays a room

The temptation is to build the whole picture at once: field, regions, animation, lyrics, keep-outs,
mic reactivity. That is a Q4 project and it will not see a café this year.

**Recommendation: stage the file, not the tool.** Muralista authors the complete venue file from day
one — field, regions, keep-outs, animation assignments, all of it. **Pregonero implements only three
keys** at first:

1. **The field** — letterbox the output to the usable background quad.
2. **One lyric region** — render the existing surtitles into an arbitrary warped quad instead of a
   centered rectangle.
3. **The keep-outs** — hold those polygons black.

That is not a compositing engine. It is a projection transform on a renderer that already works, plus
a mask. Animation regions are **declared in the file and ignored by the reader** until v2 — which is
the cheapest possible way to keep the format honest while shipping something.

**What this buys:** the thing Jorge asked for, minus animation, in a small room, this autumn. Lyrics
land where he chooses instead of where the projector happens to point, and they never land on his
face. In a café with a short throw and a performer inside the beam, that second point is not a
refinement — it is the difference between readable and not.

**What it defers:** animation in the mapped field. For the first rooms, animation either sits out, or
runs from Muralista as it does today in a separate moment of the set. Worth deciding deliberately
rather than by omission — see §7.

### 5.1 The legibility constraint carries over unchanged

Pregonero's projection window is audience-facing, read from the back of a dark room. The suite's
standing note holds: this is the **one surface where "contrast is a budget" is the wrong logic**
(`context/tramoya/README.md`). Warping lyrics into a quad must not cost legibility — a keystoned
quad resamples the text, and small type resampled at an angle is exactly where surtitles fail.
**Acceptance for the lyric-region work is visual, at a wall, in low light** — the same standard P5
was held to.

## 6. What this unlocks that is not obvious

**It is the path onto the website.** The suite's published rule is that everything on the page has
done real work, and Muralista is the one piece the rule excludes — it has never played a room. This
v1 exists to play a room.

**The rename and the promotion were bundled. They are now unbundled — decided 2026-08-20 by Jorge.**

- **Promotion still waits on the room.** Unchanged, and non-negotiable: the published rule is the
  published rule, and Muralista stays off `changopepper.com/tramoya` until it has done real work.
- **The rename does not wait.** `projects/projection-mapping/` → `projects/muralista/`, and the
  GitHub repo with it, executed now.

**Visibility and licence, decided 2026-08-20.** The repo **stays private** — unlike Bombista and
Pregonero, which are both public MIT. It carries an **MIT `LICENSE`** anyway, matching its siblings:
a licence in a private repo costs nothing, states the intent that binds if the repo is ever shared,
and takes a decision off a later day's plate. Nothing tracked is sensitive — `mapper/media/` and
`*.mp4` are gitignored, so the cerdo master is not in the repo — which means visibility can be
reopened on any day, cheaply, with no disclosure to untangle first.

The runbook's argument for waiting was *"no urgency in renaming something that isn't being
promoted."* That was correct **while the project was parked**. It stops being correct the moment the
project is active: this design doc is the first of what will be several documents, and every one
written in the old vocabulary is another line for a future sweep to catch — plus the permanent
friction the runbook itself warns about, where every document forever reads "Muralista
(projection-mapping)". Bundling was right for a parked project and wrong for a live one. The trigger
that changed is not the room; it is the project waking up.

**It also satisfies the Venue Turn's own next step**, which was to play one house concert with the
rig as it stands and bring back a hand-written notes file. Same room, one trip.

## 7. Open questions

1. **Animation in v1 or not?** §5 defers it to keep the first room reachable. If animation in the
   mapped field is non-negotiable for the first concert, v1 gets materially bigger and Pregonero
   needs a real compositing layer — say so now, not in October.
2. **Does the venue file own audio** (volume, speaker position, room baseline)? Venue Turn question 3,
   still open. The prior: leave it on paper for v1.
3. **How is the field measured** without a camera? Live corner-dragging works for a region; the outer
   field is bigger than the eye can judge from behind the projector. May need a two-person setup pass
   or a phone photo as a rough guide. Untested.
4. **Does this redraw Apuntador's scope** before 7 September? Venue Turn question 4, unchanged and
   still worth looking at first.
5. **Where does the ported mic/beat behaviour land** in Pregonero, and when? §3.2's hidden cost.

## 8. Next step

**Do not build yet.** Two things first, in this order:

1. **A projector session with the rig as it stands** — which also clears the seven-week-old untested
   v2 (direct manipulation, alpha overlays, mic reactivity: `976dd84`, `0d633cb`, `065c03f`, verified
   only headless). Point the projector at a whole wall, stand in the beam, and *fake the layout by
   hand*: place a region where lyrics would go, place a black quad where the body is, look at it.
2. **Bring back a hand-written notes file** of everything that had to be decided at the wall. That
   file is the venue file's first draft, and per §2.7 it should be written twice, in two rooms,
   before anything is specified.

Nothing in §7 should be answered from the desk.

---

## Pointers

- `context/tramoya/venue-turn.md` — the parent thread; §2.1, §2.3, §2.5, §2.6, §2.7 all load-bearing here.
- `context/tramoya/README.md` — the suite, the "real work" rule, the legibility constraint.
- `project-context.md` (this folder) — the build history and the v2 state.
- `README.md` (this folder) — what Muralista actually does today.
- `context/tramoya/rename-runbook.md` — the rename, **executed 2026-08-20** per §6 below.
