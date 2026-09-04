"use strict";

/*
 * Muralista — mapper.js
 *
 * Single script serving two roles, chosen by the URL query string:
 *   http://localhost:8123/mapper.html          -> control window
 *   http://localhost:8123/mapper.html?output    -> output window (projector)
 *
 * Both URLs may carry a `v=<build token>` parameter; mapper.html's bootstrap
 * uses it to cache-bust this file, mapper.css and warp.js, and the control
 * window passes its own token to the output window so both always run the same
 * build.
 *
 * Loaded as an ES MODULE since v1.4.0, because the warp moved out into
 * warp.js and this file imports it. Nothing declared here reaches `window`.
 *
 * Sections: STATE, SYNC, WARP, CONTROL UI, OUTPUT RENDERING, ROLE / INIT.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
// DO NOT RENAME (decided 2026-08-20, with the Muralista rename). This key still carries the
// old "Wall Mapper" working title on purpose: every mapping Jorge has autosaved lives under
// it. Renaming it to match the product name orphans all of them, silently — the same failure
// as Pregonero's bundle-ID change, in a different costume. Same for BroadcastChannel("mapper")
// and the export filename below. See context/tramoya/rename-runbook.md.
const STORAGE_KEY = "wallmapper.project.v1";
const PREVIEW_W = 1600; // matches preview-svg viewBox
const PREVIEW_H = 900;

// =========================================================================
// STATE
// =========================================================================
// `project` is the single source of truth on the control side. The output
// side treats whatever it last received over BroadcastChannel as truth and
// never writes to localStorage itself.

// Schema version of the project object. v2 (2026-08-22) added the camera
// backdrop's backdropMode / cameraDeviceId / cameraQuad. v3 (2026-08-22)
// REMOVED the layer field micReactivity and the beat layer's "mic" mode,
// when the sound-reactive layer came out - Muralista is a desk tool and
// never runs during a show, so a field describing how a layer answers a
// live room has no executor here. v4 (2026-08-23) REMOVED the beat layer
// itself, along with beatMode and bpm: with mic mode gone it was a circle
// pulsing at a fixed BPM, and nothing v1 does with a wall needs one. This
// is NOT the "v1" in STORAGE_KEY - that suffix is part of an address and
// never changes (see the guard comment on STORAGE_KEY above). Older
// projects stay readable: migrateProject() fills in what they predate and
// drops what they outlived. v5 (2026-08-23) ADDED the top-level keepOuts
// array: regions the projector holds dark. It is a sibling of surfaces, not
// a member of it - a keep-out carries no content, so it needs no homography
// and is not bound to four corners. See KEEP-OUTS below. v6 (2026-08-23)
// ADDED the "text" layer type and the fields that only it uses (text, role,
// maxSize, align, color, outline, outlineWidth) - see TEXT LAYER below. No
// older project needs anything added for it: a project with no text layer
// carries no text fields, which is exactly true of it. The bump exists
// because a v6 file will NOT open correctly in an older build - it would
// read a layer of an unknown type and paint the test pattern instead.
// v7 (2026-08-23) ADDED the text layer's `aspect` field - the manual half of
// letter proportions, see TEXT ASPECT below. A v6 text layer defaults to 1.0,
// which is "automatic only" and is exactly what a v6 file meant, except that
// v6 had no automatic half either: opening a v6 mapping in this build makes
// its text stop inheriting the quad's stretch, which is the whole point of
// the change and is not something migration should try to preserve.
// v8 (2026-08-23) REMOVED the top-level keepOuts array that v5 added, and gave
// every shape an `outline` of its own: see SHAPES below. A keep-out becomes a
// shape whose layer type is "fill", which is why the separate array has nothing
// left to hold. v5's reasoning is still correct about the machinery and was
// wrong about the model - four corners is what CONTENT needs, not what a shape
// is - so the outline and the content frame are now two fields on one object
// rather than two objects. Migration is written to preserve APPEARANCE, not
// shape: an old keep-out painted above everything, so it arrives at the top of
// the z-order and a v7 mapping opens looking exactly as it did.
// v9 (2026-08-24) ADDED the four SONG-AWARE layer types - song-lyrics,
// song-video, song-intro, gig-contact - REMOVED the text layer's `role`, and
// ADDED the top-level songVisuals table that says which shape of each type a
// deviating song uses. See SONG-AWARE SHAPE TYPES below. The role/type
// migration is a RENAMING, not a redesign: `role: "lyrics"` meant "a slot
// another tool fills", which is exactly what `song-lyrics` says, and
// `role: "static"` meant "the content is this layer's own", which is a plain
// `text` layer. Every field the renderer reads - the string, the size, the
// aspect, the alignment, the colour, the outline - carries across untouched,
// so A v8 MAPPING OPENS UNDER v9 AND PAINTS A BYTE-IDENTICAL FRAME. The bump
// exists because `role` is gone and because a v9 file naming a song-aware type
// would read as an unknown type in a v8 build and paint the test pattern.
const PROJECT_VERSION = 9;

function emptyProject() {
  return {
    version: PROJECT_VERSION,
    photo: null,
    // "photo" (a still loaded by hand) or "camera" (a live webcam feed
    // rectified into output space). Both are authoring aids only; neither
    // ever reaches the output window.
    backdropMode: "photo",
    // Which video input the camera backdrop uses, remembered so a room's
    // mapping comes back pointing at the same webcam.
    cameraDeviceId: null,
    // The projector's lit rectangle as the camera sees it: 4 points in
    // normalized camera space, [TL, TR, BR, BL] like surface.corners.
    // null until calibrated.
    cameraQuad: null,
    // Every shape on the wall, in paint order (later = on top). Including the
    // ones that hold black: black is a fill, not a separate kind of thing.
    // The key is still called `surfaces` because it is an address that older
    // mappings are written against - same argument as STORAGE_KEY above.
    surfaces: [],
    // Per-song reassignment, plus the gig-level default it falls back to. See
    // SONG VISUALS below. Empty is the ordinary state: a gig whose songs all
    // follow one pattern has defaults and no per-song entries at all.
    songVisuals: emptySongVisuals(),
  };
}

function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidProject(parsed)) return migrateProject(parsed);
    }
  } catch (err) {
    console.warn("Muralista: could not read saved project, starting fresh.", err);
  }
  return emptyProject();
}

function saveProject(proj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(proj));
}

function isValidProject(obj) {
  return !!obj && typeof obj === "object" && typeof obj.version === "number" && Array.isArray(obj.surfaces);
}

// 4 points, each a pair of finite numbers - the shape surface.corners uses,
// and the shape project.cameraQuad uses.
function isValidQuad(q) {
  return (
    Array.isArray(q) &&
    q.length === 4 &&
    q.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && isFinite(n)))
  );
}

// Brings a project of any earlier schema version up to PROJECT_VERSION by
// filling in what it predates and dropping what it outlived. Runs on load
// AND on import, so a venue JSON exported before the camera existed opens
// without complaint - it simply carries no camera calibration, which is
// exactly true of it - and one exported while layers were sound-reactive
// opens too, simply without that behavior.
/** The two states a condition can ask about. Declared here because `migrateShape` reads it. */
const CONDITION_STATES = ["filled", "empty"];

function migrateProject(obj) {
  const proj = Object.assign({}, obj);
  if (proj.backdropMode !== "camera") proj.backdropMode = "photo";
  if (typeof proj.cameraDeviceId !== "string") proj.cameraDeviceId = null;
  if (!isValidQuad(proj.cameraQuad)) proj.cameraQuad = null;

  const shapes = (Array.isArray(proj.surfaces) ? proj.surfaces : [])
    .map((surface) => migrateShape(surface))
    .filter(Boolean);

  // **ONE LEVEL, ENFORCED ON THE WAY IN.** A condition may only point at a shape
  // that exists and has no condition of its own — so cycles are impossible by
  // construction and there is nothing to detect at runtime. A file that says
  // otherwise loses the condition rather than the shape: the shape is somebody's
  // afternoon, the condition is one field, and dropping the smaller thing is the
  // repair with the smaller blast radius.
  const conditioned = new Set(shapes.filter((s) => s.visibleWhen).map((s) => s.id));
  const byId = new Map(shapes.map((s) => [s.id, s]));
  shapes.forEach((s) => {
    if (!s.visibleWhen) return;
    const target = s.visibleWhen.shape;
    if (!byId.has(target) || conditioned.has(target) || target === s.id) delete s.visibleWhen;
  });

  // v8: the keep-out array is dissolved into the shape list. Every entry
  // becomes a shape whose layer type is "fill", carrying its ring as the
  // outline and its margin as a fill field. They go on the END of the list,
  // and that placement is the whole of the appearance guarantee: a keep-out
  // used to paint above every surface by a rule of its own, and list order IS
  // paint order here (later = on top), so the end of the list is where "above
  // everything" now lives. A v7 mapping opens looking exactly as it did, and
  // from then on those shapes can be reordered like any other.
  //
  // Rings are sanitized rather than trusted, for the same reason they always
  // were: an import is arbitrary JSON, and a ring under the 3-point floor or
  // carrying a non-finite coordinate would paint as a degenerate polygon with
  // no visible cause at a projector. migrateProject stays the single
  // enforcement point, on load AND on import.
  (Array.isArray(proj.keepOuts) ? proj.keepOuts : [])
    .filter((k) => k && typeof k === "object" && isValidPointRing(k.points))
    .forEach((k, i) => {
      const fill = {
        id: typeof k.id === "string" && k.id ? k.id : genShapeId(),
        // Kept verbatim. Renaming somebody's labels is not migration's job -
        // "Keep-out 1" is what they called it and what they will look for.
        name: typeof k.name === "string" && k.name.trim() ? k.name.trim() : `Fill ${i + 1}`,
        // No content frame, and none invented: a fill shape needs none. A
        // four-point ring gets one anyway, from pinFrame below - not an
        // invention either, since at four points the outline IS the frame
        // (see shapeFrame) and this only writes down what it already reads.
        corners: null,
        outline: k.points.map(([x, y]) => [clampCoord(x), clampCoord(y)]),
        layer: {
          type: "fill",
          src: null,
          opacity: 1,
          color: FILL_LAYER_DEFAULTS.color,
          margin: clampMargin(k.margin),
        },
        visible: k.visible !== false,
      };
      pinFrame(fill); // the same rule migrateShape applies, so both agree
      shapes.push(fill);
    });
  delete proj.keepOuts;

  proj.surfaces = shapes;
  // v9. Arbitrary JSON on import like everything else here, so it is defaulted
  // and shape-checked at the one enforcement point rather than trusted by each
  // of the places that read it.
  proj.songVisuals = sanitizeSongVisuals(proj.songVisuals);
  proj.version = PROJECT_VERSION;
  return proj;
}

// One shape, brought forward. Copies rather than mutating in place - the
// object handed to us may be a parsed import the caller still holds. Returns
// null for a shape with neither a usable outline nor a usable frame, which is
// not a shape at all.
//
// v3: the sound-reactive layer is gone. v4: so is the beat layer. A v2 layer
// that opted into mic reactivity simply loses it; a beat layer from v2/v3
// becomes a test pattern, which is the honest fallback - the shape stays on
// the wall and stays visible, it just stops pulsing.
function migrateShape(surface) {
  if (!surface || typeof surface !== "object") return null;

  const layer = Object.assign({}, surface.layer || {});
  delete layer.micReactivity;
  delete layer.beatMode;
  delete layer.bpm;
  if (layer.type === "beat") layer.type = "pattern";
  if (!SHAPE_TYPES.includes(layer.type)) layer.type = "pattern";
  // v6, and v7's `aspect` with it: a text layer's own fields, defaulted and
  // clamped here and nowhere else. An import is arbitrary JSON - a role of 42,
  // a negative size or an aspect of 0 would otherwise reach the renderer and
  // paint something inexplicable at a projector (an aspect of 0 in particular
  // divides the layout box to nothing). v8 adds the same treatment for a fill
  // layer's colour and margin. A layer of any other type is left exactly as it
  // is: no older project gains a field it never had.
  // v9: TEXT_ROLES retires INTO the type. `role` was already saying which of
  // two things a text layer was, and the type now says it directly, in the
  // field every other part of the tool already switches on.
  //   role "lyrics" -> type "song-lyrics"  (a slot Pregonero fills)
  //   role "static" -> type "text"         (content this layer owns)
  // Nothing else moves, which is what makes this a rename: the string, size,
  // aspect, alignment, colour and outline all carry across, so the shape paints
  // the frame it painted before. `role` is deleted rather than left behind as a
  // dead value - a field two versions disagree about is worse than one a
  // version simply lacks.
  if (layer.type === "text" && layer.role === "lyrics") layer.type = "song-lyrics";
  if (typeTakesTextFormatting(layer.type)) Object.assign(layer, sanitizeTextLayer(layer));
  if (layer.type === "fill") Object.assign(layer, sanitizeFillLayer(layer));
  if (layer.type === "gig-contact") Object.assign(layer, sanitizeContactLayer(layer));
  delete layer.role;

  const corners = isValidQuad(surface.corners)
    ? surface.corners.map(([x, y]) => [clampCoord(x), clampCoord(y)])
    : null;

  // v8: the outline. A shape from v7 or earlier has none, and the only honest
  // default is its own frame - "outline and frame are the same four points" is
  // precisely what a plain quad meant before this existed, so a v7 surface
  // opens behaving identically and clipping nothing.
  const outline = isValidPointRing(surface.outline)
    ? surface.outline.map(([x, y]) => [clampCoord(x), clampCoord(y)])
    : corners
      ? corners.map(([x, y]) => [x, y])
      : null;
  if (!outline) return null;

  // A four-point outline IS the frame (see shapeFrame), so `corners` is
  // brought into line with it here rather than left holding some older quad.
  // No version bump goes with this: nothing gained a field, nothing lost one,
  // and a file written this way opens correctly in a v1.1.0 build, which is
  // the test this repo uses for whether a bump is owed.
  const pinned = outline.length === 4 ? outline.map(([x, y]) => [x, y]) : corners;

  const shape = {
    id: typeof surface.id === "string" && surface.id ? surface.id : genShapeId(),
    name: typeof surface.name === "string" && surface.name.trim() ? surface.name.trim() : "Shape",
    corners: pinned,
    outline,
    layer,
    visible: surface.visible !== false,
  };

  // v10: **conditional visibility.** The shape's own half of it is sanitised here
  // — a target id and one of two states — and the ONE-LEVEL rule is enforced
  // across the list in `migrateProject`, because it is a fact about the list
  // rather than about a shape. **An import is arbitrary JSON**, so a condition
  // pointing at nothing, or at a shape that has one of its own, is dropped
  // rather than carried to a renderer that would then have to refuse it.
  //
  // **Absent stays absent**: an unconditional shape gains no key, so no older
  // project grows a field it never had.
  const raw = surface.visibleWhen;
  if (raw && typeof raw === "object" && typeof raw.shape === "string" && raw.shape) {
    if (CONDITION_STATES.includes(raw.is)) shape.visibleWhen = { shape: raw.shape, is: raw.is };
  }
  return shape;
}

function genShapeId() {
  // Short unique-enough slug: timestamp base36 + a few random base36 chars
  // (guards against two shapes created in the same millisecond). The "s-"
  // prefix is unchanged from when this only ever made surfaces: every id in
  // every saved mapping carries it, and a prefix is part of an address.
  return "s-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// A new shape is a square, and its outline IS its frame - the same four points
// in both fields. That is not a special case to be unpicked later: it is the
// whole starting position of the model, and while it holds the two are edited
// as one thing (see shapeOutlineIsFrame).
function defaultShape(index) {
  const corners = [
    [0.35, 0.35],
    [0.65, 0.35],
    [0.65, 0.65],
    [0.35, 0.65],
  ];
  return {
    id: genShapeId(),
    name: `Shape ${index}`,
    corners,
    outline: corners.map(([x, y]) => [x, y]),
    layer: { type: "pattern", src: null, opacity: 1 },
    visible: true,
  };
}

// =========================================================================
// CONDITIONAL VISIBILITY — a shape may depend on another shape
// =========================================================================
// **COWORK PROPOSED A FLAG SAYING *for songs with video / without*, AND JORGE
// REJECTED IT** (2026-09-04): that is domain knowledge this tool does not have.
// Whether a song has a video lives in the song file, below Muralista's line —
// it reads `gig.json` and nothing else. It was a requirement on one tool that
// the other could not satisfy.
//
// **His replacement asks about ANOTHER SHAPE**, which is entirely this tool's
// own vocabulary. **Muralista declares the relationship; Pregonero evaluates
// it**, because Pregonero is the one that knows what content landed. Each tool
// says only what it can know.
//
// **IT IS ABOUT CONTENT, NEVER EXISTENCE.** Shapes are gig level and always
// exist; what varies per song is whether they got content. *Visible when that
// shape is empty for this song*, never *visible if that shape is not there*.
// Since song visual setup shipped, **filled means an asset is assigned for that
// song** in `songVisuals.assets`.
//
// **ON THE SHAPE, NOT IN A CONNECTORS LIST.** Reading a shape tells you when it
// shows without scanning a table, and deleting the shape takes its condition
// with it, so nothing orphans.
//
// **AN OBJECT, NOT A STRING**, so a `when` or an `after` can join it later
// without a redesign. **BUILD THE CONDITION, NOT THE ANIMATION SYSTEM** — the
// PowerPoint-style future is real and is deliberately not designed here.
//
// **ONE LEVEL, SO CYCLES ARE IMPOSSIBLE**: a condition may only point at a
// shape that has no condition of its own. Nothing to detect at runtime and
// nothing to refuse there.


/** The condition on a shape, or null. The one reader, so there is one answer. */
function shapeCondition(shape) {
  const raw = shape && shape.visibleWhen;
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.shape !== "string" || !raw.shape) return null;
  if (!CONDITION_STATES.includes(raw.is)) return null;
  return { shape: raw.shape, is: raw.is };
}

/**
 * **Which shapes a condition may point at: every OTHER shape that has none.**
 *
 * That is the whole of the one-level rule, enforced where the choice is made
 * rather than checked afterwards — a list that cannot express a cycle needs no
 * cycle detection.
 */
function conditionTargets(shape) {
  return project.surfaces.filter((s) => s.id !== shape.id && shapeCondition(s) === null);
}

/** The shapes whose condition points at this one. Empty for most shapes. */
function dependentsOf(shapeId) {
  return project.surfaces.filter((s) => {
    const cond = shapeCondition(s);
    return cond !== null && cond.shape === shapeId;
  });
}

function setShapeCondition(id, target, state) {
  const shape = findShape(id);
  if (!shape) return;
  if (!target) {
    delete shape.visibleWhen;
  } else {
    const wanted = CONDITION_STATES.includes(state) ? state : "filled";
    // **A shape that something depends on cannot itself depend on something.**
    // The picker never offers such a target; this is the same rule at the
    // model, so a hand-edited file cannot introduce one either.
    if (dependentsOf(id).length > 0) return;
    if (!conditionTargets(shape).some((s) => s.id === target)) return;
    shape.visibleWhen = { shape: target, is: wanted };
  }
  commitProjectChange();
}

// =========================================================================
// TEXT LAYER (schema half; the fit and the painting are further down)
// =========================================================================
// A layer that IS a string. It needs no media folder, no Blob and no name to
// resolve: the content rides the existing state broadcast like any other
// layer field, which is why nothing in the media half of this file mentions
// it (referencedMediaNames() filters to video/image and stays as it is).
//
// WHAT THIS REGION IS FOR versus WHAT IS BEING PREVIEWED IN IT are two facts,
// and conflating them was the mistake the retired `role` field existed to
// prevent. THE TYPE NOW CARRIES THE FIRST ONE (v9): a `song-lyrics` shape is a
// slot Pregonero fills from the song file at runtime and the string here is a
// preview of that slot; a plain `text` shape is content this layer owns. Both
// share every field below, because tuning a preview and tuning a title card
// need exactly the same handles.
//
// The field the type replaced is written up in migrateShape. Nothing here
// branches on which of the two it is - see typeTakesTextFormatting.
const TEXT_ALIGNMENTS = ["left", "center", "right"];

// SIZE IS A FRACTION OF THE SHAPE, NEVER PIXELS. An absolute font size
// silently breaks every tuned layout the moment a quad is redrawn in a new
// room; a fraction travels with the shape, so a remapped room still reads.
// The fraction is OF THE UNIT CONTENT BOX, which is the shape - see the WARP
// section: every surface's content is drawn into a fixed UNIT_SIZE square
// that matrix3d maps onto the four corners, so a fraction of that box is a
// fraction of the quad on the wall, by construction and with no bookkeeping.
//
// This value is the MAXIMUM. Auto-fit (fitTextLayer) only ever goes below
// it, so the longest line in the catalogue cannot overflow at any setting
// while short lines still get to be big.
//
// It stays a fraction of the quad's HEIGHT under the aspect correction below,
// which only ever changes the layout box's width: a font size is a vertical
// measure, and the box the correction leaves behind is still UNIT_SIZE tall.
// So no tuned size shifts because letter proportions were adjusted.
const TEXT_MAX_SIZE_MIN = 0.02;
const TEXT_MAX_SIZE_MAX = 0.6;
// One press of the stepper. Half a percent of the shape's height, which is the
// step the slider this replaced already used - a coarser one skips past the
// setting you were converging on, and a finer one turns tuning into clicking.
const TEXT_MAX_SIZE_STEP = 0.005;
// Outline width as a fraction of the FITTED font size (written out in `em`),
// so the stroke-to-glyph ratio survives auto-fit shrinking the text.
const TEXT_OUTLINE_WIDTH_MAX = 0.25;

// LETTER PROPORTIONS, MANUAL HALF. Multiplies the width of the letters on top
// of whatever the automatic correction worked out: 1.0 is "automatic only",
// 2.0 is letters twice as wide as natural, 0.5 half. Applied as a divisor of
// the layout width factor - see textLayoutWidthFactor() in the painting half.
//
// WHY A HUMAN CONTROL EXISTS AT ALL, given that the automatic half is exact
// arithmetic: no formula knows the surface's true physical shape, because
// this tool only ever sees the QUAD, never the wall it lands on. A quad on an
// angled wall is a trapezoid on purpose - the warp is compensating for where
// the projector happens to stand - so the drawn shape and the physical shape
// are different things, and only one of them is in the file. The person
// authoring can see the other one, through the camera.
//
// That is also this tool's whole thesis, not a concession to it: closing the
// loop against the wall beats computing a correction and applying it blind.
// The number behind that claim - a careful automatic calibration, accurate to
// its own inputs, lost to a hand calibration by three percent on 2026-08-22 -
// is written up in project-context.md. Any future accuracy work here belongs
// in making the loop tighter, not in measuring the quad harder.
const TEXT_ASPECT_MIN = 0.5;
const TEXT_ASPECT_MAX = 2;

const TEXT_LAYER_DEFAULTS = {
  // Empty, for both types that share these fields. A song-lyrics shape is
  // SEEDED with LYRICS_PREVIEW_TEXT when the type is chosen (setLayerType)
  // rather than defaulted to it here: defaulting here would also re-fill a
  // slot somebody deliberately emptied, on every sanitize pass.
  text: "",
  maxSize: 0.2,
  aspect: 1,
  align: "center",
  color: "#ffffff",
  outline: true,
  outlineWidth: 0.08,
};

function isHexColor(value) {
  return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// The single shape authority for a text layer's own fields. Returns a fully
// defaulted, clamped set - never mutates its argument. Called from
// migrateProject (the enforcement point on load AND on import, where the
// JSON is arbitrary and may claim a role of 42 or a size of -8) and from
// setLayerType, so that choosing the type writes the fields into the project
// immediately rather than leaving the renderer to invent them every frame.
function sanitizeTextLayer(layer) {
  const src = layer && typeof layer === "object" ? layer : {};
  return {
    text: typeof src.text === "string" ? src.text : TEXT_LAYER_DEFAULTS.text,
    maxSize: clampNumber(src.maxSize, TEXT_MAX_SIZE_MIN, TEXT_MAX_SIZE_MAX, TEXT_LAYER_DEFAULTS.maxSize),
    aspect: clampNumber(src.aspect, TEXT_ASPECT_MIN, TEXT_ASPECT_MAX, TEXT_LAYER_DEFAULTS.aspect),
    align: TEXT_ALIGNMENTS.includes(src.align) ? src.align : TEXT_LAYER_DEFAULTS.align,
    color: isHexColor(src.color) ? src.color : TEXT_LAYER_DEFAULTS.color,
    outline: src.outline !== false,
    outlineWidth: clampNumber(src.outlineWidth, 0, TEXT_OUTLINE_WIDTH_MAX, TEXT_LAYER_DEFAULTS.outlineWidth),
  };
}

// =========================================================================
// SONG-AWARE SHAPE TYPES (schema half; the painting is further down)
// =========================================================================
// FOUR TYPES THAT KNOW A SONG IS A THING. Until v9 a Muralista shape knew what
// KIND of content it held - a video, a string, a colour - and nothing about
// what that content was FOR. The gig file was going to carry an assignment
// table naming content onto shapes, and that table was deleted (2026-08-24):
// an untyped shape plus an assignment living in another file gives the person
// at the wall nothing to work with, and the wall is the only place these
// decisions can honestly be made. So the shape declares it.
//
//   song-lyrics  - the playing song's lyric lines. FULL text formatting:
//                  tuning legibility at the wall is why the type exists.
//   song-video   - the playing song's media. NO formatting: the quad IS the
//                  framing, and stretch-to-fill is fixed v1 behaviour rather
//                  than an option. A video that wants to sit differently is a
//                  different quad, so a different shape.
//   song-intro   - a locked template: translation, title, tagline. NO
//                  formatting; position and size of the shape are the only
//                  decisions. See SONG INTRO TEMPLATE below.
//   gig-contact  - one line plus an optional QR code. NOT per-song, which is
//                  why it is not called song-contact.
//
// A SHAPE HAS EXACTLY ONE TYPE. There is no shape that is lyrics for one song
// and video for another. Lyrics and video over the same patch of wall are two
// shapes, and the duplicated geometry is accepted: quad-by-reference was
// offered and declined, because an irregular surface does not want that
// precision and duplicateShape() is already right there.
//
// A SHAPE IS A PLACE THAT CAN HOLD CONTENT, NOT A THING THAT IS ON. It is lit
// only when the playing song points something at it, which is what makes
// adding one cheap - an unused shape costs nothing, so the gig's shape set can
// be the union of everything the night needs rather than a compromise that
// half-suits every song. Absence is the empty state; nothing is ever declared
// empty, and the gap between songs falls out for free.
//
// WHY THIS IS NOT MURALISTA DECIDING *WHAT*. The suite's line is "Pregonero
// owns what and when; Muralista owns how", and a shape declaring its content
// looks like a breach of it. It is not: *what* was drawn too broadly. WHERE
// CONTENT SITS IS LAYOUT, AND LAYOUT IS HOW. What is playing now and when the
// next line appears stay entirely Pregonero's, and nothing below knows about
// tempo, timelines, drive modes or order of play.
const SONG_AWARE_TYPES = ["song-lyrics", "song-video", "song-intro", "gig-contact"];

// The three that a deviating song may reassign. gig-contact is missing on
// purpose and its absence is the whole of the rule: it is defined once, at gig
// visual setup, and a per-song contact panel is not a thing.
const SONG_REASSIGNABLE_TYPES = ["song-lyrics", "song-video", "song-intro"];

// Both types that carry the text-layer fields, in one predicate rather than in
// the eight places that used to compare against "text". A plain text layer and
// a lyrics slot are formatted identically - the type says which of the two it
// is, and no formatting code has to care.
function typeTakesTextFormatting(type) {
  return type === "text" || type === "song-lyrics";
}

function isSongAwareType(type) {
  return SONG_AWARE_TYPES.includes(type);
}

// THE DUMMY LYRIC, AND IT IS NOT A PLACEHOLDER TO BE IMPROVED. Muralista reads
// no song content at all - see the GIG section for the boundary it is keeping -
// so a lyrics slot previews with a fixed string. Deliberately nasty: three
// rows, two hard breaks, quote marks, a comma-heavy Dutch sentence with a very
// long compound in it.
//
// IT IS AWKWARD DUTCH ON PURPOSE AND MUST STAY THAT WAY. Nobody would say
// "modderplasherinneringen" out loud. Jorge's rule about writing Dutch he
// would actually say governs drafts in his name; this is a test fixture, and
// its whole job is to be a worse case than anything real. SMOOTHING IT OUT
// BREAKS THE TOOL'S GUARANTEE rather than improving its prose.
//
// The reason it is nasty is the reason it is not a short "Lorem ipsum":
// Muralista tunes against the worst case and emits a BOUNDARY, and Pregonero
// renders the real lyrics inside that boundary (Jorge, 2026-08-27). A stand-in
// that is not actually the worst case produces a boundary that is too
// generous, and every real line harder than it renders smaller than tuned.
//
// WHICH IS WHAT HAPPENED. The previous stand-in - two rows, 91 characters,
// longest unbreakable run 11 - was measured against every lyric string in
// `songs/` on 2026-08-27 and LOST ON 36 OF 1088: none on total length, but 35
// on the longest unbreakable run (`ontdekkingsreiziger` is 19 against its 11)
// and one, `paso`'s English, on hard rows. This string beats the whole
// catalogue on all three axes at once: 120 characters against 91, an
// unbreakable run of 24 against 19, three hard rows against three. Anyone
// changing it should re-run that measurement over `songs/` first.
//
// It is the DEFAULT of a real, editable field rather than a hardcoded render,
// because a v8 mapping arrives carrying a lyric line somebody pasted in on
// purpose and migration has no business throwing that away. The cost is that a
// mapping made before this change still carries the OLD string: re-seed it by
// switching the shape's type away and back, or by emptying the field.
const LYRICS_PREVIEW_TEXT =
  '"Wat een lekkernij zul jij zijn," zucht hij,\nen ik proef al het onvermijdelijke afscheid\nvan mijn modderplasherinneringen.';

// =========================================================================
// SONG INTRO TEMPLATE (numbers; the painting is in the output half)
// =========================================================================
// Decided from a mock, 2026-08-24, variant B1. Ink ground, left-aligned, all
// three parts in the monospace instrument voice, values taken from Pregonero's
// control.css rather than invented. No radii.
//
// Top to bottom: a short clay rule and the TRANSLATION as a small wide-tracked
// uppercase annotation; then the TITLE, uppercase and dominant; then the
// TAGLINE.
//
// THE TITLE IS NOT A FONT SIZE. It is a fraction of the shape with auto-fit
// below it, exactly like a text layer's maxSize, and every other measure here
// is a multiple of it. A hardcoded line count or pixel size breaks on the
// first title of a different length - in the mock, two of the real titles
// break to two lines.
//
// A FRAME-FILLING VARIANT WAS MOCKED AND REJECTED, and the reason matters to
// anyone tempted to enlarge this later: the intro shape on a real wall is
// often small, a panel beside the main area rather than the whole wall. A
// title sized to fill the frame leaves the tagline microscopic once the shape
// shrinks. THESE PROPORTIONS ARE THE ENTIRE DESIGN, since there are no
// formatting controls - if they are wrong for a song the only handle is the
// shape's size and position, which move all three parts together.
//
// THE TAGLINE IS THE FRAGILE PART: smallest on the wall and carrying the
// sentence the room is meant to keep. It is the first thing to test at a wall.
// THE NUMBERS LIVE IN THE STYLESHEET, not here, and this is the only note
// saying so. Every one of them is a multiple of the title size, which is a CSS
// custom property (`--t`) that auto-fit searches over - so they are calc()
// expressions in mapper.css and copying them into JS constants would be
// writing each proportion down twice and waiting for the two to disagree.
//
// These two are the exception because JS is the only thing that reads them:
// the fit needs the ceiling it searches below, and the layout box needs the
// inset it is padded by. Everything else - the annotation and tagline ratios,
// the rule, the leading, the tracking, both gaps, and the four colours - is in
// mapper.css under SONG-AWARE LAYERS, matching the table in project-context.md.
const INTRO_TITLE_MAX_SIZE = 0.16; // of the shape's height; auto-fit only goes below
const INTRO_INSET = 0.07; // of the shape's width, left and right

// WHAT THE INTRO PREVIEWS, AND WHY TWO OF THE THREE PARTS ARE FAKE. The title
// is real when a gig is connected and a song is being previewed, because song
// ids and titles are the one thing Muralista is allowed to read out of
// gig.json. The translation and the tagline live in the SONG FILE, which is
// below the line - so they are stand-ins, and they say so on the wall rather
// than pretending. Saying so is a design property, not filler, so it survives
// everything below: each part still names itself in plain English.
//
// THIS IS THE SECOND OF MURALISTA'S TWO INDEPENDENT STAND-INS, and it is the
// one that carries the whole intro card. LYRICS_PREVIEW_TEXT seeds a
// song-lyrics slot and has exactly one consumer; this one is everything
// applySongIntroLayer() ever paints. v1.5.0 held the lyrics stand-in to the
// real catalogue and it lost. This one was never measured against anything at
// all - its tagline read "The tagline from the song file goes here, and it is
// the smallest thing on the wall", which is a DESCRIPTION, not a worst case.
//
// MEASURED AGAINST songs/ ON 2026-08-27, same difficultyOf() metric as v1.5.0
// (length excluding hard breaks; longest whitespace-free run; hard rows), 13
// song files, _template.json excluded:
//
//   part         population                        corpus max (len/run/rows)
//   title        title                    13 str   23 / 9 / 1
//   annotation   title_translations.*     52 str   32 / 9 / 1
//   tagline      intro.*                  52 str   80 / 14 / 1
//
// `title` equals `title_translations.es` in all 13 files, so the 13 titles are
// a subset of the 52 annotations and the title axis is backed by 52 strings
// too, not 13. THE OLD STAND-IN LOST ON FOUR OF THE NINE COMPARISONS: title on
// length (20 v 23) and run (5 v 9), annotation on length (26 v 32), tagline on
// run (8 v 14). These three beat the corpus on every axis of every part.
//
// HARD ROWS STAY AT 1 ON PURPOSE. The corpus max is 1, and the intro card has
// no `white-space: pre-line` - a \n in any of these three renders as a space,
// so a stand-in carrying one would be claiming a row the template cannot
// paint. Beating the corpus here means matching it.
//
// WHAT IT COSTS THE PREVIEW, tagline in real px at 1920x1080 (shapes recorded
// beside every number this time - the older set was not, and is lost):
//
//   shape                     old      hardest real     new
//   half wall     960x540    24.19        24.19       24.19   (all at ceiling)
//   tall panel    346x864    29.36        16.33       10.50
//   narrow col    192x648    16.29         9.05        5.82
//   small panel   384x194     8.69         8.69        8.69   (all at ceiling)
//
// The middle column is the size of the error: on a side panel the old stand-in
// previewed the tagline at 29.36 px when the hardest thing the catalogue can
// actually put there renders at 16.33 - EIGHTY PER CENT too generous, on the
// part with the least margin on the wall. Same failure as v1.5.0's.
//
// THE TITLE IS WHAT BINDS, and that was not obvious. The tagline is the
// FRAGILE part - smallest on the wall - but it is 0.28 of the title, so an
// unbreakable run costs it 3.6x less. Fitting each part alone on the tall
// panel: title 43.39, tagline 97.31, annotation 128.08, whole block 43.39.
// The title decides the size of all three, every time the fit leaves its
// ceiling. So a nastier tagline alone would have fixed nothing.
//
// NO PROPORTION WAS TOUCHED AND NONE SHOULD BE. 5.82 px on a narrow column is
// a finding for a real wall, and the agreed answer is a minimum floor in
// `.intro-tagline`, never a bigger ratio - a bigger ratio inflates the tagline
// in the large-shape case where it is already fine and costs the title its
// dominance everywhere.
//
// THESE ARE TEST FIXTURES, NOT PROSE IN JORGE'S NAME. `MODDERPLASLIED` and
// `modderplasherinnering` are deliberately awkward Dutch that nobody would say
// out loud, carried over from the lyrics stand-in on purpose; his rule about
// writing Dutch he would actually say governs drafts in his voice, not a
// string whose only job is to be worse than anything real. The failure mode
// here is somebody improving the prose and silently loosening the guarantee.
// Anyone changing these should re-run the measurement over `songs/` first.
const INTRO_PLACEHOLDER = {
  annotation: "TRANSLATED TITLE GOES HERE, MODDERPLASLIED",
  title: "SONG TITLE GOES HERE, MODDERPLASLIED",
  tagline:
    "The tagline from the song file goes here, and it is the smallest modderplasherinnering the room takes home.",
};

// =========================================================================
// GIG CONTACT LAYER (schema half)
// =========================================================================
// One line of text plus an OPTIONAL QR CODE, defined once at gig visual setup.
// It replaces Pregonero's end card and its logo-when-nothing-is-armed
// fallback, both of which existed to put something on the wall when no song
// was presenting - which is what a static-ish shape does properly.
//
// THE QR CODE IS A FILE, NOT A GENERATOR. `qrSrc` is a media name resolved
// through the same folder as every other source, so a QR is a PNG somebody
// generated and dropped in beside the videos. Muralista has no build step, no
// dependencies and no network, and a hand-rolled QR encoder in this file would
// be several hundred lines of error-correction arithmetic whose failure mode
// is a code that scans as the wrong URL. A file that can be checked with a
// phone before the doors open is the honest version.
const CONTACT_LAYER_DEFAULTS = {
  text: "",
  qrSrc: null,
};

// The contact line's maximum size, as a fraction of the shape's height, with
// auto-fit below it - the same contract as a text layer's maxSize, except that
// nobody gets to change it. A contact panel is one short line: bigger than a
// lyric because it is read once and acted on, smaller than an intro title
// because it is not the thing the room came for. The QR is a multiple of it.
const CONTACT_MAX_SIZE = 0.22;
// The QR's size is a multiple of that line and lives in mapper.css with the
// rest of the proportions - same reason as the intro's numbers above.

// Counterpart of sanitizeTextLayer and sanitizeFillLayer: fully defaulted,
// never mutates its argument, and it is the single authority on these two
// fields. The text is collapsed to ONE LINE here rather than in the renderer -
// "one line of text" is the design, and a paste carrying a newline should be
// fixed where the value is written, not painted as two lines on a wall.
function sanitizeContactLayer(layer) {
  const src = layer && typeof layer === "object" ? layer : {};
  // The QR name is TRIMMED, and a name that is only whitespace becomes null.
  // Not cosmetic: a truthy "  " reaches the output as <img src="  ">, which
  // Chrome resolves to the page itself and paints as a broken image on a wall
  // with nothing anywhere saying why. The trim also means the media folder and
  // the renderer key on the same string, since both read it through here.
  const qr = typeof src.qrSrc === "string" ? src.qrSrc.trim() : "";
  return {
    text: typeof src.text === "string" ? src.text.replace(/\s*\n\s*/g, " ") : CONTACT_LAYER_DEFAULTS.text,
    qrSrc: qr || CONTACT_LAYER_DEFAULTS.qrSrc,
  };
}

// =========================================================================
// SONG VISUALS (which shape a song uses, per type)
// =========================================================================
// TWO LEVELS, AND THIS IS THE STRUCTURAL PART.
//
//   defaults - the gig level. The room's shapes and their types serve every
//              song. For a gig where all the songs follow one pattern this is
//              the entire job and `songs` stays empty.
//   songs    - one entry per DEVIATING song, and REASSIGNMENT ONLY: which
//              existing shape of that kind this song uses.
//
// NEVER PER-SONG GEOMETRY, and the reason is a failure that reports nothing:
// deforming a shape for one song means that song holds its own position, and
// re-mapping the room then leaves it silently on the old one - wrong on stage,
// with nothing saying so. Both routes paint the identical picture on the wall,
// so the safe one costs nothing. If no shape fits, the answer is to go back to
// gig visual setup and add one.
//
// RESOLVING A TYPE FOR A SONG RETURNS A *SET*, AND THE RENDERER LIGHTS ALL OF
// IT (decided 2026-08-24). The single-shape rule that was drafted first
// conflated two questions that are not the same - WHICH CONTENT is showing,
// and IN HOW MANY PLACES. There is one answer to the first and no principled
// reason there is one answer to the second, and two real cases already want
// the same lyric twice at once: a corner or a pillar (a homography maps one
// flat plane, so text across two walls is two shapes) and original beside
// translation.
//
// SO THERE IS NO SIZE-ONE CAP ANYWHERE BELOW, and adding one later would be
// adding a rule that has to be written, tested and then removed. The AUTHORING
// UI offers one shape per type for now, so real files contain sets of size one
// naturally; a hand-edited visuals.json listing two already works.
function emptySongVisuals() {
  return { defaults: {}, songs: {}, assets: {} };
}

/**
 * **WHAT A SONG PUTS IN A SHAPE — a new field, and not the map beside it.**
 *
 * `songs[songId]` answers *which shape of this kind does this song use*, which is REASSIGNMENT.
 * `assets[songId]` answers *what does this song put in that shape*, which is CONTENT. They look
 * alike and are not: one moves a song onto a different quad, the other fills a quad it already has.
 *
 * **Keyed by SHAPE ID, never by type.** The resolver returns a SET of shapes per type — two shapes
 * showing one song's video is how a corner gets spanned — and keying by type would cap that at one,
 * which is precisely the rule this repo has written down twice: no code may depend on the authoring
 * UI happening to offer one.
 *
 * **A NAME, NEVER A PATH.** The same rule the media folder has always had: the mapping stores the
 * name and the folder is a fact about the machine. That is what lets a gig folder be handed over on
 * a stick, and it is why the hosted listing was worth building rather than working around.
 *
 * **Empty is the default and means DARK for that song**, which is the sentence this suite already
 * has: a shape is a place that can hold content, not a thing that is on. A song with no animation
 * sets nothing, and setting nothing is free.
 */
function sanitizeSongAssets(value) {
  const src = value && typeof value === "object" ? value : {};
  const out = {};
  Object.keys(src).forEach((songId) => {
    if (!songId) return;
    const entry = src[songId];
    if (!entry || typeof entry !== "object") return;
    const map = {};
    Object.keys(entry).forEach((shapeId) => {
      const name = entry[shapeId];
      // A name, so anything carrying a separator is refused rather than repaired: a path here would
      // be a fact about one machine written into a file built to travel.
      if (!shapeId || typeof name !== "string") return;
      const trimmed = name.trim();
      if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) return;
      map[shapeId] = trimmed;
    });
    if (Object.keys(map).length) out[songId] = map;
  });
  return out;
}

/** What this song puts in this shape, or null. The one reader, so there is one answer. */
function songAssetFor(proj, songId, shapeId) {
  if (!songId || !shapeId) return null;
  const assets = projectSongVisuals(proj).assets || {};
  const entry = assets[songId];
  return (entry && entry[shapeId]) || null;
}

function setSongAsset(songId, shapeId, name) {
  if (!songId || !shapeId) return;
  const sv = ensureSongVisuals();
  if (!sv.assets || typeof sv.assets !== "object") sv.assets = {};
  const entry = sv.assets[songId] || {};
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed) entry[shapeId] = trimmed;
  else delete entry[shapeId];
  if (Object.keys(entry).length) sv.assets[songId] = entry;
  else delete sv.assets[songId];
  commitProjectChange();
}

// An id list, defaulted and de-duplicated. NO LENGTH CAP - see above.
function sanitizeShapeIdList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  value.forEach((id) => {
    if (typeof id !== "string" || !id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

// One { type: [shapeId] } map, keeping only the types the level allows.
function sanitizeAssignmentMap(value, allowedTypes) {
  const src = value && typeof value === "object" ? value : {};
  const out = {};
  allowedTypes.forEach((type) => {
    const ids = sanitizeShapeIdList(src[type]);
    if (ids.length) out[type] = ids;
  });
  return out;
}

function sanitizeSongVisuals(value) {
  const src = value && typeof value === "object" ? value : {};
  const songsSrc = src.songs && typeof src.songs === "object" ? src.songs : {};
  const songs = {};
  Object.keys(songsSrc).forEach((songId) => {
    if (!songId) return;
    // SONG_REASSIGNABLE_TYPES, not SONG_AWARE_TYPES: a per-song gig-contact
    // entry is dropped rather than honoured, because the contact panel is a
    // gig-level fact and a file claiming otherwise is a file to correct.
    const map = sanitizeAssignmentMap(songsSrc[songId], SONG_REASSIGNABLE_TYPES);
    if (Object.keys(map).length) songs[songId] = map;
  });
  return {
    defaults: sanitizeAssignmentMap(src.defaults, SONG_AWARE_TYPES),
    songs,
    assets: sanitizeSongAssets(src.assets),
  };
}

function projectSongVisuals(proj) {
  const sv = proj && proj.songVisuals;
  return sv && typeof sv === "object" ? sv : emptySongVisuals();
}

// Every shape in `proj` that currently has `type`, in paint order.
function shapesOfType(proj, type) {
  return (proj.surfaces || []).filter((shape) => shapeType(shape) === type);
}

// THE LOOKUP. Resolving a type for a song returns a SET of shapes: the song's
// own reassignment if it has one, otherwise the gig-level default.
//
// Ids are checked against the live shape list and against the type, so a
// deleted shape or one retyped since the assignment was made simply stops
// resolving instead of resolving to something else. That check is here rather
// than in a pruning pass because pruning on every commit would walk the whole
// table on every arrow-key nudge, and a dangling id costs nothing until it is
// read.
function resolveShapesForType(proj, type, songId) {
  const sv = projectSongVisuals(proj);
  const perSong = songId && sv.songs && sv.songs[songId] ? sv.songs[songId][type] : null;
  const ids = sanitizeShapeIdList(
    // An empty per-song list is not a deviation, it is no entry: the entry is
    // only ever written with something in it (see setSongAssignment).
    perSong && perSong.length ? perSong : (sv.defaults || {})[type]
  );
  return ids
    .map((id) => (proj.surfaces || []).find((shape) => shape.id === id))
    .filter((shape) => shape && shapeType(shape) === type);
}

// Which shapes are lit while `songId` is playing, as a set of ids. Null means
// GIG VISUAL SETUP, where every shape paints - you cannot place a shape you
// cannot see, and no song is playing at a desk.
//
// gig-contact is dark while a song plays, and that is the decided rule rather
// than an omission: the wall's attention belongs to the song, and the contact
// panel is lit when nothing is presenting. Muralista shows the same thing
// because a preview that flatters is not a preview.
function litSongAwareShapeIds(proj, songId) {
  if (!songId) return null;
  const ids = new Set();
  SONG_REASSIGNABLE_TYPES.forEach((type) => {
    resolveShapesForType(proj, type, songId).forEach((shape) => ids.add(shape.id));
  });
  return ids;
}

// True when this shape would be dark on the wall for the song being previewed.
// A shape with no song-aware type is never dark for a song: a fill, a logo, a
// plain text card are up from power-up to teardown and Pregonero does not
// coordinate them at all.
function shapeIsDarkForPreview(proj, shape, songId) {
  if (!songId || !isSongAwareType(shapeType(shape))) return false;
  const lit = litSongAwareShapeIds(proj, songId);
  return !lit.has(shape.id);
}

// =========================================================================
// SHAPES
// =========================================================================
// THERE IS NO KEEP-OUT. There are shapes, and the only difference between one
// shape and the next is what is inside it. That is the v8 model, and it came
// from the hand holding the mouse: the tool used to have two primitives, and a
// person at a wall has one.
//
// A SHAPE IS AN OUTLINE, PLUS A FRAME WHEN IT CARRIES CONTENT.
//
//   outline - N points, minimum 3, in normalized output space. Every shape has
//             one, and it is edited identically on every shape.
//   corners - four points, the CONTENT FRAME. Only a shape carrying video,
//             image or text needs one, because four corners is what a
//             homography needs to warp a square of content onto a quad. A
//             seven-point polygon has no homography, and never needed one.
//
// Content is WARPED BY THE FRAME and CLIPPED TO THE OUTLINE. A new shape
// starts as a square whose outline and frame are the same four points, so it
// clips nothing and behaves exactly as a v1.0.0 surface did; adding a point
// moves the outline away from the frame and the clipping starts to bite.
//
// WHY THE SPLIT USED TO BE TWO OBJECTS, and why that was the wrong call. A
// keep-out carries no content, so it needs no frame, so "not a surface" looked
// like the cheap answer - and it was, for the machinery. It was the expensive
// answer for the person: point editing behaved differently in two places, one
// of the two lists sat outside the z-order by a rule, and the polygon nobody
// could put a video in was sitting right there in the sidebar. Two concepts
// went in, one comes out, and the one that survives is the one Jorge already
// had in his head.
//
// BLACK IS A FILL. The performer mask is a shape whose layer type is "fill"
// and whose colour is black. It takes part in the z-order like everything
// else - no rule pins it on top any more - and everything a fill shape can do
// is something every other shape can do too.

// Every layer type a shape can have. "fill" is v8's addition and is the one
// type that needs no content frame at all; the four song-aware types are v9's
// and every one of them warps content, so every one of them needs a frame.
//
// Order is the order the type picker offers, and the song-aware four come last
// because they are the ones that need a gig behind them.
const SHAPE_TYPES = [
  "pattern",
  "video",
  "image",
  "text",
  "fill",
  "song-lyrics",
  "song-video",
  "song-intro",
  "gig-contact",
];

// Fewer than three points is not a polygon. A two-point "ring" would paint
// nothing while still sitting in the list looking like a live shape.
const SHAPE_MIN_POINTS = 3;

// A ring of >= 3 normalized points, the shape shape.outline uses. Unlike the
// content frame there is no upper count and no exact count: nothing about
// bounding a region needs four points.
function isValidPointRing(pts) {
  return (
    Array.isArray(pts) &&
    pts.length >= SHAPE_MIN_POINTS &&
    pts.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && isFinite(n)))
  );
}

// The outline, defensively. The control window only ever holds migrated
// projects, but the output window takes whatever the broadcast handed it and
// isValidProject() checks only version + surfaces. A shape with no usable
// outline but a usable frame falls back to the frame, which is what it meant
// before outlines existed; one with neither is not drawable and returns null.
function shapeOutline(shape) {
  if (shape && isValidPointRing(shape.outline)) return shape.outline;
  if (shape && isValidQuad(shape.corners)) return shape.corners;
  return null;
}

// THE FOUR CORNERS THE WARP USES, or null when there are none to be had.
//
// WHILE THE OUTLINE HAS EXACTLY FOUR POINTS, THE OUTLINE IS THE FRAME. Not a
// copy of it, not synchronised with it - the same four points, returned from
// here. That is what makes one set of handles enough: drag a point and the
// content warps live under your hand, exactly as it did before a shape had an
// outline at all.
//
// Past four points there is no longer a quad to be read off the outline, so
// `corners` is consulted instead: it holds the last four-corner value the
// shape had, pinned at the moment the fifth point arrived (see pinFrame), and
// the extra points only clip. It moves again when somebody asks it to - see
// refitFrameToOutline - and never on its own, because content jumping while a
// person is editing an outline is worse than content sitting still.
function shapeFrame(shape) {
  if (!shape) return null;
  const outline = shape.outline;
  if (Array.isArray(outline) && outline.length === 4 && isValidQuad(outline)) return outline;
  return isValidQuad(shape.corners) ? shape.corners : null;
}

// Writes the frame down from a four-point outline. Called at the two moments
// the outline is about to stop being four points - an insert, and an adopted
// ring - so that what gets pinned is the quad that was on screen a moment ago.
// A no-op at any other count, which is what makes it safe to call defensively.
function pinFrame(shape) {
  if (shape && Array.isArray(shape.outline) && shape.outline.length === 4) {
    shape.corners = shape.outline.map(([x, y]) => [x, y]);
  }
}

function shapeLayer(shape) {
  return (shape && shape.layer) || { type: "pattern", src: null, opacity: 1 };
}

function shapeType(shape) {
  const type = shapeLayer(shape).type;
  return SHAPE_TYPES.includes(type) ? type : "pattern";
}

function shapeCarriesContent(shape) {
  return shapeType(shape) !== "fill";
}

// TRUE WHILE THE OUTLINE IS THE FRAME - which is now simply a question of how
// many points it has. Four, and there is exactly one quad it could mean, so it
// means it; more, and there is no quad there at all.
//
// This used to compare the two rings point by point, which was correct and was
// answering a question nobody had. It let a four-point outline exist that was
// NOT its shape's frame, and the only way to show that state honestly was a
// second set of handles - the numbered quad Jorge asked to have taken away.
// Counting instead makes that state unreachable, which is the whole of the
// simplification: one outline, one set of circles, and the frame is either the
// outline or a value the outline pinned on its way past four.
function shapeOutlineIsFrame(shape) {
  return !!shape && Array.isArray(shape.outline) && shape.outline.length === 4;
}

// The axis-aligned bounding quad of a ring, in surface.corners order
// [TL, TR, BR, BL]. Used when a shape that never had a content frame is given
// a type that needs one, and as refitFrameToOutline's fallback: the box the
// outline already occupies is the only frame the tool can honestly propose
// with no previous frame to learn a perspective from, and it is the one that
// leaves the content covering everything the outline will let through.
function outlineBoundingQuad(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min.apply(null, xs);
  const x1 = Math.max.apply(null, xs);
  const y0 = Math.min.apply(null, ys);
  const y1 = Math.max.apply(null, ys);
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

// RE-FIT: MOVE THE FRAME BACK ONTO THE OUTLINE, ON PURPOSE AND ON REQUEST.
//
// Past four outline points the frame stops following the shape, so an outline
// dragged somewhere new eventually has its content sitting off to one side.
// This is the button that fixes that, and it is a button rather than something
// automatic for one reason: recomputing on every drag would make the content
// jump around under the hand of somebody who is trying to edit an outline,
// which is a worse confusion than the one it solves.
//
// IT KEEPS THE PERSPECTIVE AND CHANGES ONLY THE EXTENT. The naive answer - the
// outline's bounding box - throws away the keystone that was tuned against a
// real wall, and hands back an upright rectangle for a surface that is not
// upright. So instead: pull every outline point back through the CURRENT
// frame's homography into unit-square space, take the bounding box THERE, and
// push that box's four corners back out. The result is the same trapezoid,
// grown or shrunk to sit exactly around the outline. A quad tuned against a
// wall at an angle stays tuned against that wall.
//
// Falls back to the bounding box when there is no usable frame to learn from,
// or when the frame is degenerate enough that a point maps to the horizon.
function refitFrameToOutline(shape) {
  const outline = shapeOutline(shape);
  if (!outline) return null;
  const frame = shapeFrame(shape);

  const box = (pts) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
  };

  const into = frame && computeHomography(frame, UNIT_SQUARE_CORNERS);
  const outOf = frame && computeHomography(UNIT_SQUARE_CORNERS, frame);
  if (into && outOf) {
    const local = [];
    for (const p of outline) {
      const u = applyHomography(into, p);
      if (!u) { local.length = 0; break; }
      local.push(u);
    }
    if (local.length === outline.length) {
      const [x0, y0, x1, y1] = box(local);
      const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map((u) => applyHomography(outOf, u));
      if (corners.every(Boolean)) {
        return corners.map(([x, y]) => [clampCoord(x), clampCoord(y)]);
      }
    }
  }
  return outlineBoundingQuad(outline).map(([x, y]) => [clampCoord(x), clampCoord(y)]);
}

// =========================================================================
// FILL LAYER
// =========================================================================
// A shape that IS its colour. It needs no media folder, no Blob and no frame:
// the outline is the content.
//
// Its first job is the performer, and the driver is eye comfort rather than
// composition: standing in the beam is physically unpleasant and nobody is
// going to do it for a whole set. Muralista's design is subtractive - the
// projector floods the whole background and the mapping is a layout of that
// flood, INCLUDING which parts stay dark - so black has to be an object in the
// mapping, not a black PNG parked on a quad.
//
// THE RULE THAT GOVERNS DRAWING ONE AROUND A PERSON: trace the performer's
// SHADOW, never the performer. The camera and the projector lens do not sit in
// the same place, so they genuinely disagree about where a body is - measured
// in the studio at roughly two thirds of a head width on the wall, with the
// camera as close to the lens as it would physically go. The shadow has no
// such error and cannot: it is by construction the exact set of projector
// pixels the body blocks, because the projector drew it, and it lands on the
// wall plane where the existing homography is exact. Also stated in README
// under "Adopting boundaries, and the shadow rule" and in the CAMERA BACKDROP
// section below.

// How far outward a fill shape is grown, as a fraction of FRAME HEIGHT. Drawn
// as a stroke rather than as a polygon offset, but the number means the growth
// itself - see applyMarginStroke().
const FILL_MARGIN_MAX = 0.15;

const FILL_LAYER_DEFAULTS = {
  color: "#000000",
  margin: 0,
};

function clampMargin(v) {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(FILL_MARGIN_MAX, n));
}

// The single shape authority for a fill layer's own fields, the exact
// counterpart of sanitizeTextLayer: fully defaulted, clamped, never mutates
// its argument. Called from migrateShape (the enforcement point on load AND on
// import, where a colour of `javascript:` or a margin of -8 is possible) and
// from setLayerType, so choosing the type writes the fields into the project
// there and then rather than leaving the renderer to invent them every frame.
function sanitizeFillLayer(layer) {
  const src = layer && typeof layer === "object" ? layer : {};
  return {
    color: isHexColor(src.color) ? src.color : FILL_LAYER_DEFAULTS.color,
    margin: clampMargin(src.margin),
  };
}

// The project state, live in memory. Populated below once the role is known.
let project = emptyProject();

// Control-local UI state — never persisted, never broadcast.
let selectedShapeId = null;

// WHICH OUTLINE POINT IS LIVE, as an index into the selected shape's outline.
// Set by clicking a point handle, or by the 1-4 keys for the first four points
// - which are the four the test pattern numbers on the wall, and on a shape
// still at four points they are its corners. Delete removes it; arrows nudge
// it; 0 or Escape clears it.
//
// There used to be a second one of these for the content frame's corners, and
// removing it is the point of this change: one outline, one index into it, one
// set of circles on screen.
//
// Defaults to null on every fresh selection, so a click-select can be followed
// straight by arrow-key coarse placement of the whole shape with no extra
// keypress - precision is opt-in.
let selectedPointIndex = null;

function clearShapeSubselection() {
  selectedPointIndex = null;
}

function setSelectedPointIndex(index) {
  selectedPointIndex = index;
}

// Latest output-window size in real screen pixels, learned from the
// 'outputSize' broadcast (see WARP/SYNC below) so arrow-key nudges can be
// expressed in output pixels regardless of preview scale. Falls back to a
// common projector resolution until an output window has reported in.
let outputSize = { w: 1920, h: 1080 };

// Corners are normalized 0-1 output-space, but we allow slight overshoot
// beyond the frame since projector framing sometimes needs a surface's
// corner to sit just off-screen. Shared by single-corner clamping
// (clampCoord) and whole-surface translate clamping (clampTranslateDelta)
// so both use the same overshoot range.
const CORNER_OVERSHOOT_MIN = -0.2;
const CORNER_OVERSHOOT_MAX = 1.2;

function clampCoord(v) {
  return Math.max(CORNER_OVERSHOOT_MIN, Math.min(CORNER_OVERSHOOT_MAX, v));
}

// Clamps a proposed [dx, dy] translation so that applying it to EVERY corner
// in `corners` keeps every corner's coordinate inside the overshoot range,
// clamping each axis as a whole rather than per-corner - a per-corner clamp
// would distort the quad (e.g. one corner stops while the others keep
// moving); this instead finds the tightest corner on each axis and freezes
// the whole surface's motion on that axis at the point that corner would
// cross the bound, leaving the other axis free to keep moving.
function clampTranslateDelta(corners, [dx, dy]) {
  let dxMin = -Infinity, dxMax = Infinity, dyMin = -Infinity, dyMax = Infinity;
  corners.forEach(([x, y]) => {
    dxMin = Math.max(dxMin, CORNER_OVERSHOOT_MIN - x);
    dxMax = Math.min(dxMax, CORNER_OVERSHOOT_MAX - x);
    dyMin = Math.max(dyMin, CORNER_OVERSHOOT_MIN - y);
    dyMax = Math.min(dyMax, CORNER_OVERSHOOT_MAX - y);
  });
  return [Math.min(Math.max(dx, dxMin), dxMax), Math.min(Math.max(dy, dyMin), dyMax)];
}

// Shared pointer -> normalized output-space conversion for the preview SVG.
// preview-svg's viewBox (1600x900) matches its rendered aspect ratio exactly
// (.preview-box is 16/9), so no letterboxing - a fraction of the element's
// own bounding box is already the normalized 0-1 coord. Unclamped: callers
// decide whether/how to clamp (a single corner clamps itself directly; a
// whole-surface drag clamps the aggregate delta instead - see
// clampTranslateDelta).
function svgPointerToNormalized(evt, svg) {
  const rect = svg.getBoundingClientRect();
  return [(evt.clientX - rect.left) / rect.width, (evt.clientY - rect.top) / rect.height];
}

function getSelectedShape() {
  return project.surfaces.find((s) => s.id === selectedShapeId) || null;
}

function findShape(id) {
  return project.surfaces.find((s) => s.id === id) || null;
}

// --- Mutators (control-side only). Each one mutates `project` in place,
// then the caller is responsible for persisting/broadcasting/rendering
// via `commitProjectChange()`. ---

function addShape() {
  const shape = defaultShape(project.surfaces.length + 1);
  project.surfaces.push(shape);
  selectedShapeId = shape.id;
  clearShapeSubselection();
  commitProjectChange();
}

/**
 * **DELETING A REFERENCED SHAPE REFUSES AND NAMES ITS DEPENDENTS** (Jorge,
 * 2026-09-04), rather than silently dropping their conditions — the rule this
 * suite already follows for a misplaced `visuals.json`. A condition that
 * vanished with the shape it pointed at would make a dependent unconditionally
 * visible, which is the opposite of what its author asked for and is invisible
 * until a song is on the wall.
 */
function deleteBlocker(id) {
  const dependents = dependentsOf(id);
  if (dependents.length === 0) return null;
  const shape = findShape(id);
  const names = dependents.map((s) => s.name).join(", ");
  return (
    `${shape ? shape.name : "That shape"} cannot be deleted: ${names} ` +
    `${dependents.length === 1 ? "depends" : "depend"} on it. Clear that first.`
  );
}

function removeShape(id) {
  // **The guard is here as well as on the press**, so a hand-called delete cannot
  // orphan a condition either. The press checks first only so nobody is asked to
  // confirm something that is then refused.
  const blocked = deleteBlocker(id);
  if (blocked) {
    setShapeStatus(blocked);
    renderControl();
    return;
  }
  project.surfaces = project.surfaces.filter((s) => s.id !== id);
  if (selectedShapeId === id) {
    selectedShapeId = null;
    clearShapeSubselection();
  }
  commitProjectChange();
}

/** A refusal about a shape, said where the shape list is. Cleared by the next act. */
let shapeStatus = "";

function setShapeStatus(text) {
  shapeStatus = text || "";
}

function renameShape(id, name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  const shape = findShape(id);
  if (!shape) return;
  shape.name = trimmed;
  commitProjectChange();
}

function toggleShapeVisible(id) {
  const shape = findShape(id);
  if (!shape) return;
  shape.visible = !shape.visible;
  commitProjectChange();
}

// --- Z-order (v2.2). project.surfaces array order IS render order IS
// stacking order in both preview and output (later = on top) - these just
// move a shape one slot within that same array. Since v8 that includes fill
// shapes: black used to be pinned above everything by a rule, and now it
// queues like everything else. No-op at either end of the list (buttons are
// also disabled there in the UI, but the mutator stays defensive since it's
// reachable from the smoke-test harness too). ---

function moveShapeUp(id) {
  const idx = project.surfaces.findIndex((s) => s.id === id);
  if (idx <= 0) return;
  const [shape] = project.surfaces.splice(idx, 1);
  project.surfaces.splice(idx - 1, 0, shape);
  commitProjectChange();
}

function moveShapeDown(id) {
  const idx = project.surfaces.findIndex((s) => s.id === id);
  if (idx === -1 || idx >= project.surfaces.length - 1) return;
  const [shape] = project.surfaces.splice(idx, 1);
  project.surfaces.splice(idx + 1, 0, shape);
  commitProjectChange();
}

// --- Duplicate (v2.2): the one-gesture way to register an alpha overlay
// exactly onto an existing (usually video) shape - same geometry, same layer,
// inserted immediately after the original so it renders on top of it per the
// z-order rule above. Outline, frame and layer are all deep-copied, so editing
// the copy never touches the original. ---

function duplicateShape(id) {
  const idx = project.surfaces.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const original = project.surfaces[idx];
  const copy = {
    id: genShapeId(),
    name: `${original.name} copy`,
    corners: isValidQuad(original.corners) ? original.corners.map(([x, y]) => [x, y]) : null,
    outline: original.outline.map(([x, y]) => [x, y]),
    layer: original.layer
      ? JSON.parse(JSON.stringify(original.layer))
      : { type: "pattern", src: null, opacity: 1 },
    visible: original.visible,
  };
  project.surfaces.splice(idx + 1, 0, copy);
  selectedShapeId = copy.id;
  clearShapeSubselection();
  commitProjectChange();
}

// --- Outline mutators. Every shape has an outline and every shape edits it
// the same way, which is the whole point of v8: there is no second code path
// here to behave differently from this one. ---

// Replaces a shape's whole outline at once. Used by "Adopt boundaries", which
// hands back a traced contour rather than editing points one at a time.
// NEVER touches the content frame: adopting the silhouette of a thing on stage
// says where the shape ENDS, not how its content is warped.
function setShapeOutline(id, points) {
  const shape = findShape(id);
  if (!shape || !isValidPointRing(points)) return false;
  pinFrame(shape); // before the outline stops being four points, if it was
  shape.outline = points.map(([x, y]) => [clampCoord(x), clampCoord(y)]);
  selectedPointIndex = null; // an index into the old ring means nothing now
  commitProjectChange();
  return true;
}

// Insert a point INTO the ring at `index` - i.e. between points index-1 and
// index - which is what clicking an edge does. Inserting at the end of the
// array instead would connect the new point to whichever points happen to
// bookend the array, folding the polygon over itself.
//
// This is also the gesture that separates the outline from the frame: a shape
// whose outline WAS its frame has five outline points afterwards and a pinned
// quad behind them, so the content stops following the outline and starts
// being clipped by it. That is the model working, not a side effect of it -
// and "Re-fit content" is how you tell it to catch up.
function insertShapePoint(id, index, point) {
  const shape = findShape(id);
  if (!shape) return;
  // The moment that matters: a four-point outline IS the frame, and one more
  // point ends that. Write the quad down first, so the content goes on being
  // warped onto exactly what it was warped onto a moment ago and only starts
  // being clipped. This is the one call site the rule exists for.
  pinFrame(shape);
  shape.outline.splice(index, 0, [clampCoord(point[0]), clampCoord(point[1])]);
  setSelectedPointIndex(index);
  commitProjectChange();
}

// The 3-point floor is a real constraint, not a UI nicety - see
// SHAPE_MIN_POINTS. The panel button is disabled at the floor too, but this
// stays defensive: the Delete key reaches here by another route.
function deleteShapePoint(id, index) {
  const shape = findShape(id);
  if (!shape) return;
  if (shape.outline.length <= SHAPE_MIN_POINTS) return;
  if (index == null || index < 0 || index >= shape.outline.length) return;
  shape.outline.splice(index, 1);
  selectedPointIndex = null;
  commitProjectChange();
}

// Move the content frame back onto the current outline, deliberately. Only
// ever reached from the panel button - see refitFrameToOutline for why this is
// not something that happens on its own.
function refitShapeContent(id) {
  const shape = findShape(id);
  if (!shape || !shapeCarriesContent(shape)) return;
  const corners = refitFrameToOutline(shape);
  if (!corners) return;
  shape.corners = corners;
  commitProjectChange();
}

// --- Layer mutators (slice 3). All route through commitProjectChange() like
// every other control-side mutation. ---

function setLayerType(id, type) {
  const shape = findShape(id);
  if (!shape || !SHAPE_TYPES.includes(type)) return;
  shape.layer = shape.layer || { type: "pattern", src: null, opacity: 1 };
  shape.layer.type = type;
  // Choosing a type with its own fields writes them into the project there and
  // then, rather than leaving them implicit for the renderer to default on
  // every frame - implicit fields are fields that never reach the exported
  // venue file. Existing values are preserved by the sanitizers, so switching
  // away and back does not lose what was typed or picked.
  //
  // The seed is the one exception, and only when there is nothing to preserve:
  // a lyrics slot with no preview in it gets the dummy line, so a shape typed
  // at the wall is immediately carrying the string the tuning is meant to be
  // judged against instead of an empty box. Anything already typed survives.
  if (typeTakesTextFormatting(type)) {
    Object.assign(shape.layer, sanitizeTextLayer(shape.layer));
    if (type === "song-lyrics" && !shape.layer.text) shape.layer.text = LYRICS_PREVIEW_TEXT;
  }
  if (type === "fill") Object.assign(shape.layer, sanitizeFillLayer(shape.layer));
  if (type === "gig-contact") Object.assign(shape.layer, sanitizeContactLayer(shape.layer));
  // A gig needs one shape of each type it uses, and the overwhelmingly common
  // room has exactly one of each. So the first shape given a song-aware type
  // BECOMES the gig's default for it, with no second gesture - which is also
  // what "the authoring UI offers one shape per type for now" looks like from
  // the hand's side. A type that already has a default is left alone: the
  // second lyrics shape is an alternative to pick, not a silent replacement.
  // **Every shape of a song-aware type is that type's default** (item 3): the assignment block is
  // gone, so the defaults are derived from the shapes rather than authored beside them.
  if (isSongAwareType(type)) syncGigDefaultsFromShapes();
  // A type that carries content needs a frame to warp it onto, and a shape
  // that has only ever been a fill has none. The outline's bounding box is the
  // only frame the tool can honestly propose - see outlineBoundingQuad. A
  // shape that already has a frame keeps it untouched, so fill and back is
  // lossless the same way text and back is.
  if (type !== "fill" && !shapeFrame(shape)) {
    shape.corners = outlineBoundingQuad(shape.outline);
  }
  commitProjectChange();
}

function setLayerField(id, field, value) {
  const shape = findShape(id);
  if (!shape || !shape.layer) return;
  shape.layer[field] = value;
  commitProjectChange();
}

// --- Song visuals mutators (v9). Every one writes a SET, never a single id -
// see SONG VISUALS. The authoring UI happens to hand them one-element sets,
// and nothing here would notice if it stopped. ---

function ensureSongVisuals() {
  if (!project.songVisuals || typeof project.songVisuals !== "object") {
    project.songVisuals = emptySongVisuals();
  }
  if (!project.songVisuals.defaults) project.songVisuals.defaults = {};
  if (!project.songVisuals.songs) project.songVisuals.songs = {};
  if (!project.songVisuals.assets) project.songVisuals.assets = {};
  return project.songVisuals;
}

// The gig-level set for a type. An empty list DELETES the key rather than
// storing [], so "no shape of this kind in this room" and "a room that has
// never been asked" are the same state - which they are.
function setGigDefault(type, shapeIds) {
  if (!isSongAwareType(type)) return;
  const sv = ensureSongVisuals();
  const ids = sanitizeShapeIdList(shapeIds);
  if (ids.length) sv.defaults[type] = ids;
  else delete sv.defaults[type];
  commitProjectChange();
}


// A song's deviation for one type. An empty list REMOVES the entry, which is
// how "back to whatever the gig says" is expressed - there is no third state
// meaning "deviates, to nothing". A song whose last deviation is removed
// leaves the table entirely, so the file says what it means: only deviating
// songs appear.
function setSongAssignment(songId, type, shapeIds) {
  if (!songId || !SONG_REASSIGNABLE_TYPES.includes(type)) return;
  const sv = ensureSongVisuals();
  const ids = sanitizeShapeIdList(shapeIds);
  const entry = sv.songs[songId] || {};
  if (ids.length) entry[type] = ids;
  else delete entry[type];
  if (Object.keys(entry).length) sv.songs[songId] = entry;
  else delete sv.songs[songId];
  commitProjectChange();
}

// --- Photo backdrop mutators (slice 3). Authoring aid only - output never
// sees project.photo (renderOutput/renderLayer never read it). ---

function setBackdropPhoto(dataUrl) {
  project.photo = dataUrl;
  commitProjectChange();
}

function clearBackdropPhoto() {
  project.photo = null;
  commitProjectChange();
}

// Phone photos can be huge; downscale to a max width via an offscreen canvas
// before storing as a dataURL so autosave stays well under localStorage's
// ~5-10MB budget.
const BACKDROP_MAX_WIDTH = 1600;

function loadBackdropPhotoFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, BACKDROP_MAX_WIDTH / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      setBackdropPhoto(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => window.alert("Could not read that image.");
    img.src = reader.result;
  };
  reader.onerror = () => window.alert("Could not read that file.");
  reader.readAsDataURL(file);
}

function selectShape(id) {
  selectedShapeId = id;
  clearShapeSubselection();
  renderControl(); // selection is local UI state, no save/broadcast needed
}

function replaceProject(newProject) {
  project = newProject;
  selectedShapeId = null;
  clearShapeSubselection();
  commitProjectChange();
}

// Persist + broadcast + re-render, called after every control-side mutation.
//
// The state broadcast stays SYNCHRONOUS for the overwhelmingly common case - a
// corner drag or an arrow-key nudge commits per mouse-move and per keystroke,
// and the wall has to follow the hand. Only a change to the set of referenced
// media names takes the async path, where the folder is re-read and the media
// message goes out ahead of the state message (see refreshMediaForProjectChange).
// Both paths post the live `project` object, so a nudge that overtakes a
// pending resolve still carries the newer geometry - the two cannot disagree.
function commitProjectChange() {
  // Any act that changes the project answers the last refusal, so it goes.
  shapeStatus = "";
  // **THE LOCAL COPY IS KEPT ONLY WHEN NOTHING WAS HANDED OVER** (Jorge,
  // 2026-09-03). Editing inside a gig writes to the gig folder and nowhere
  // else, so the two cannot drift; the local store is for standalone with no
  // gig, which is the only time this tool has to remember a room by itself.
  if (!gigConnected()) saveProject(project);
  // The shapes just moved past whatever is in the folder, so the "wrote it at
  // 19:42" line stops being true and stops being shown. Not an error state and
  // not a warning - just the tool declining to claim something it no longer
  // knows. An actual write failure survives this, because it stands until the
  // next attempt.
  visualsWrittenAt = null;
  if (mediaNamesChanged()) {
    refreshMediaForProjectChange();
  } else {
    broadcastState();
  }
  renderControl();
}

// =========================================================================
// SYNC (BroadcastChannel)
// =========================================================================

const channel = new BroadcastChannel("mapper");

/**
 * **THE OUTPUT WINDOW IS IN A DIFFERENT STORAGE PARTITION WHEN THIS PAGE IS FRAMED, SO THE
 * BROADCAST CHANNEL CANNOT REACH IT** (found 2026-09-04, walking Pregonero `v0.60.0`).
 *
 * The window opened, took `role-output`, and stayed black: `Play` and `Show white` never arrived.
 * **Measured rather than guessed** — both documents report the SAME ORIGIN, a value written to
 * `localStorage` in this page is `null` in that one, and a `postMessage` on the window handle
 * arrives. **Chromium partitions storage by TOP-LEVEL SITE**: framed inside Pregonero this page's
 * top-level site is the host's `file://` document, while the output window is its own top-level
 * `127.0.0.1`. `BroadcastChannel` is storage. It does not cross.
 *
 * **The camera's family a fourth time: something that worked until the tool moved into a frame.**
 *
 * **So every message goes out on BOTH**, and the window handle is the one that works when framed.
 * The channel stays because standalone it is the only route to a window opened by hand — a second
 * tab on `?output`, which has no opener. **Double delivery is made harmless rather than avoided**:
 * every message carries a `seq`, and the output applies each one once.
 */
let outboundSeq = 0;

function postToOutput(message) {
  const stamped = { ...message, seq: ++outboundSeq };
  channel.postMessage(stamped);
  if (outputWindow && !outputWindow.closed) {
    try {
      outputWindow.postMessage(stamped, "*");
    } catch (err) {
      console.warn("Muralista: could not post to the output window.", err);
    }
  }
}

// `preview` is UI state, not project state, and it rides the state message
// rather than living in the project because it must NEVER be saved: which song
// somebody was looking at on Tuesday is not a fact about the room, and a
// mapping that reopened with one song's shapes dark would look broken.
//
// The title rides with the id for the same reason gig.json is not sent whole:
// the output window needs a title to paint into a song-intro shape and has no
// business being handed the gig to find one in.
function broadcastState() {
  const song = gigSongById(previewSongId());
  postToOutput({
    kind: "state",
    project,
    preview: song ? { songId: song.id, songTitle: song.title } : null,
  });
}

// Control -> output: the bytes behind every layer.src the control window was
// able to resolve, as Blobs keyed by the name that appears in the project.
//
// This is the whole trick behind the media folder. The output window sits on
// the projector and must NEVER touch the file system or ask for a permission
// (a Chrome dialog on the wall mid-setup is unacceptable), and a
// FileSystemDirectoryHandle is useless to it anyway - a handle carries the
// grant of the window it was picked in. The July note in this repo that "blob
// URLs do not survive a BroadcastChannel" is true and is half the picture: an
// object URL is an address scoped to the document that minted it, but a Blob
// is structured-cloneable, and cloning one does NOT copy its bytes - both
// sides end up referring to the same underlying blob data. So the control
// window does the reading and posts Blobs; the output mints its own object
// URLs from them (see applyMediaMessage).
//
// `token` is how the output tells "the same file again" from "a different
// file under the same name": size + mtime, computed on the control side. It
// exists because structured clone gives the output a NEW Blob object every
// time this message is sent, so object identity says nothing. Without the
// token, every re-send would revoke and remint every URL and restart every
// video - which is the exact churn the output's reconciler was built to
// avoid. Nonce per project convention.
function broadcastMedia() {
  const entries = [];
  resolvedMedia.forEach((rec, src) => entries.push({ src, token: rec.token, blob: rec.blob }));
  postToOutput({ kind: "media", entries, nonce: Date.now() });
}

// Transport message shape (structure only — consumers land in slice 3 when
// video/layers arrive). Always carries a changing nonce so a receiver can
// treat every message as a fresh command rather than deduping by value
// (the lyric-translator's storage-event lesson applies to BroadcastChannel
// too: don't rely on "value changed" semantics for command messages).
function broadcastTransport(action) {
  postToOutput({ kind: "transport", action, nonce: Date.now() });
}

// Control-side memory of the last transport command sent, so a late-joining
// output (opened after Play was already pressed) can be brought up to speed
// in response to its 'hello' instead of sitting frozen on its first frame
// until the next transport click. See handleControlMessage.
let lastTransport = null;

// Wired to the header Play/Pause/Restart buttons.
function handleTransportButton(action) {
  lastTransport = action;
  broadcastTransport(action);
}

// Control -> output: raise or drop a full-frame white plate on the output
// window. This exists for the camera backdrop's calibration step - the edge
// of the projector's lit rectangle can only be marked if the projector is
// actually lighting something, and "no signal" screens and desktop wallpaper
// are not a rectangle of known shape. Nonce per project convention.
let whiteFieldOn = false;

function broadcastWhiteField() {
  postToOutput({ kind: "whiteField", on: whiteFieldOn, nonce: Date.now() });
}

function toggleWhiteField() {
  whiteFieldOn = !whiteFieldOn;
  broadcastWhiteField();
  renderControl();
}



// Output -> control: report the output window's actual pixel size so arrow-
// key nudges (control-side) can be expressed in real output pixels. Sent on
// load and on every resize; always carries a nonce per project convention,
// though this consumer reads current w/h directly rather than diffing.
function broadcastOutputSize() {
  postToOutput({ kind: "outputSize", w: window.innerWidth, h: window.innerHeight, nonce: Date.now() });
}

function handleControlMessage(event) {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.kind === "hello") {
    // A fresh output window just opened and wants the current state.
    // Media FIRST, then state: the output paints in response to the state
    // message, and a state that names a source the media message has not
    // arrived with yet paints one frame of the served-path fallback (and,
    // for a name the served directory does not have, one flash of the
    // failure note) before correcting itself. Ordering the two messages
    // costs nothing and removes that flash entirely.
    broadcastMedia();
    broadcastState();
    broadcastWhiteField(); // a reopened output must not come back with a stale plate
    if (lastTransport) {
      // Bring a late joiner up to speed on playback too - without this, an
      // output opened after Play was already pressed sits frozen on its
      // first frame until the next transport click. Always re-send with a
      // FRESH nonce (project convention: never re-send a stale nonce, so
      // the receiver's "treat every message as a fresh command" logic still
      // holds). A late joiner should join playback, not seek everyone back
      // to 0, so a last action of 'restart' is re-sent as 'play' - this is
      // the only place 'restart' semantics are altered for a joiner.
      const action = lastTransport === "restart" ? "play" : lastTransport;
      postToOutput({ kind: "transport", action, nonce: Date.now() });
    }
  } else if (msg.kind === "outputSize" && typeof msg.w === "number" && typeof msg.h === "number") {
    outputSize = { w: msg.w, h: msg.h };
  }
}

/** Every `seq` is applied once. Both routes carry the same message, and both may arrive. */
let lastAppliedSeq = 0;

function handleOutputMessage(event) {
  const stamp = event && event.data && event.data.seq;
  if (typeof stamp === "number") {
    if (stamp <= lastAppliedSeq) return;
    lastAppliedSeq = stamp;
  }
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.kind === "state" && isValidProject(msg.project)) {
    project = msg.project;
    // Null in gig visual setup, which is the state where every shape paints.
    outputPreview = msg.preview && typeof msg.preview === "object" ? msg.preview : null;
    renderOutput();
  } else if (msg.kind === "media" && Array.isArray(msg.entries)) {
    applyMediaMessage(msg.entries);
  } else if (msg.kind === "whiteField" && typeof msg.on === "boolean") {
    setOutputWhiteField(msg.on);
  } else if (msg.kind === "transport" && typeof msg.action === "string") {
    applyTransportAction(msg.action);
  }
}

// =========================================================================
// MEDIA FOLDER (control-side only)
// =========================================================================
// Where the media actually lives. No media is part of this app, at build time
// or at runtime: a layer's `src` is a NAME ("cerdo.mp4", "clips/pig.mp4"), and
// this section is what turns that name into bytes.
//
// Until now a name was resolved by the browser, relative to whatever directory
// the local server happened to be serving - which works, but makes "where my
// media lives" a fact about how the server was launched rather than something
// the tool knows. With a directory handle, the tool knows.
//
// Three things this section is careful about, all consequences of the fact
// that a page cannot read a path, only a granted handle:
//
//   1. THE VENUE FILE STORES NAMES, NEVER HANDLES. A directory handle is a
//      browser object; it cannot live in a JSON that gets read, diffed, and
//      eventually handed to Pregonero. So the handle lives in IndexedDB, keyed
//      to this origin, and the project keeps saying "cerdo.mp4". This is why
//      the media folder needed NO schema change: PROJECT_VERSION stays 5, and
//      a mapping exported from a machine with a folder chosen opens on a
//      machine without one.
//   2. THE SERVED-DIRECTORY PATH STAYS AS A FALLBACK. No folder chosen,
//      permission not granted, or the name simply not in the folder - the name
//      goes to the output unresolved and the browser does what it does today.
//      A denied permission is a degraded mode, never a dead tool.
//   3. NONE OF THIS RUNS IN THE OUTPUT ROLE. Every function below is reached
//      only from initControl() and from control-window clicks.

const MEDIA_DB_NAME = "muralista";
const MEDIA_DB_STORE = "handles";
const MEDIA_FOLDER_KEY = "mediaFolder";

// The chosen folder, if any, and what we are allowed to do with it:
//   "unsupported" - not Chrome (no showDirectoryPicker); the control is hidden
//                   and every name falls back, silently.
//   "none"        - no folder chosen.
//   "granted"     - handle in hand, read permission live. Names resolve.
//   "reconnect"   - handle in hand, permission is "prompt" or "denied". We do
//                   NOT ask: requestPermission needs a user gesture, and an
//                   unprompted dialog on load is precisely the behaviour this
//                   feature exists to avoid. The sidebar offers a button and
//                   lets the click carry the gesture.
let mediaFolderHandle = null;
let mediaFolderState = "none";

// src name -> { token, blob }. Only names actually referenced by a layer, and
// only the ones that resolved. Everything absent from this map falls back.
let resolvedMedia = new Map();
// [{ src, reason }] for names a chosen folder could not produce - surfaced in
// the sidebar, because a person configuring the wall should not have to read
// the output window (or the console) to learn that they typed "cerdo.mp4"
// into a folder that spells it "Cerdo.mp4".
let mediaResolveFailures = [];

// The name set the current resolvedMedia was built from, as a stable key.
// commitProjectChange() fires on every arrow-key nudge and every opacity tick;
// re-walking the file system on each of those would be absurd. Only a change
// to the set of referenced names triggers a re-resolve.
let resolvedNamesKey = null;

function mediaFolderSupported() {
  return typeof window.showDirectoryPicker === "function";
}

function mediaFolderLabel() {
  return mediaFolderHandle ? mediaFolderHandle.name : null;
}

// --- IndexedDB: one store, one key, holding one handle. localStorage would be
// the obvious neighbour of STORAGE_KEY, but it stores strings and a directory
// handle is not one - IndexedDB is the only web storage that structured-clones
// a FileSystemDirectoryHandle, so this is a constraint, not a preference.

function openMediaDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MEDIA_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(MEDIA_DB_STORE)) {
        req.result.createObjectStore(MEDIA_DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function mediaDbRequest(mode, run) {
  return openMediaDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(MEDIA_DB_STORE, mode);
        const req = run(tx.objectStore(MEDIA_DB_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      })
  );
}

function readStoredFolderHandle() {
  return mediaDbRequest("readonly", (store) => store.get(MEDIA_FOLDER_KEY));
}

function writeStoredFolderHandle(handle) {
  return mediaDbRequest("readwrite", (store) => store.put(handle, MEDIA_FOLDER_KEY));
}

function clearStoredFolderHandle() {
  return mediaDbRequest("readwrite", (store) => store.delete(MEDIA_FOLDER_KEY));
}

// --- Resolution.

// Every name any visible-or-not surface currently points at. Read verbatim,
// with no trimming or normalising: this key must match what the output reads
// out of layer.src, and a name that differs by a space is a different name on
// both sides or on neither.
function referencedMediaNames() {
  const names = new Set();
  (project.surfaces || []).forEach((shape) => {
    const layer = shape && shape.layer;
    if (!layer) return;
    if (layer.type === "video" || layer.type === "image") {
      if (typeof layer.src === "string" && layer.src) names.add(layer.src);
      return;
    }
    // A contact panel's QR code is a file like any other, and it resolves
    // through this same folder - see CONTACT_LAYER_DEFAULTS for why a QR is a
    // file rather than something this tool generates.
    if (layer.type === "gig-contact") {
      // Through the sanitizer, so this key is the same string applyGigContactLayer
      // asks resolveMediaUrl for. Reading the raw field would let a stray space
      // put a name in the map that the renderer then never looks up.
      const qr = sanitizeContactLayer(layer).qrSrc;
      if (qr) names.add(qr);
    }
  });
  return names;
}

function mediaNamesKey(names) {
  return Array.from(names).sort().join("\u0000");
}

// "clips/pig.mp4" -> walk getDirectoryHandle for every segment but the last.
// A nested name is worth supporting because a media folder for a show is a
// folder of folders, not a flat pile. Anything unwalkable (a missing segment,
// a "..", a file where a directory was expected) throws, and the caller turns
// that into a fallback plus a visible note.
async function resolveNameInFolder(handle, name) {
  const parts = name.split("/").filter((p) => p && p !== ".");
  if (!parts.length) throw new Error("empty name");
  let dir = handle;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]);
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
  return fileHandle.getFile();
}

// Size + mtime. Enough to notice a re-export of the same clip under the same
// name, cheap enough to compute on every resolve. See broadcastMedia for why
// the output cannot just compare Blob identity.
function mediaToken(file) {
  return `${file.size}|${file.lastModified}`;
}

// Guards against an out-of-order finish: two resolves can be in flight (type a
// name, then immediately type another) and the slower one must not overwrite
// the newer result.
let mediaResolveSeq = 0;

// Rebuilds resolvedMedia from the current folder + the current name set.
// Deliberately does NOT broadcast - callers decide the message order, which
// matters (see the hello handler and commitProjectChange).
async function syncResolvedMedia() {
  const seq = ++mediaResolveSeq;
  const names = referencedMediaNames();
  const next = new Map();
  const failures = [];

  if (mediaFolderHandle && mediaFolderState === "granted") {
    for (const name of names) {
      try {
        const file = await resolveNameInFolder(mediaFolderHandle, name);
        next.set(name, { token: mediaToken(file), blob: file });
      } catch (err) {
        failures.push({
          src: name,
          reason: err && err.name === "NotFoundError" ? "not in this folder" : (err && err.message) || "could not be read",
        });
      }
    }
  }

  if (seq !== mediaResolveSeq) return; // a newer resolve superseded this one

  resolvedMedia = next;
  mediaResolveFailures = failures;
  resolvedNamesKey = mediaNamesKey(names);
  renderMediaFolderControls();
}

// Re-resolve and re-broadcast because the FOLDER changed (picked, reconnected,
// cleared). The project did not change, so no state message: the output
// re-renders off the media message alone.
async function refreshMediaForFolderChange() {
  void refreshVisualsFolderNames();
  await syncResolvedMedia();
  broadcastMedia();
  renderControl();
}

// Re-resolve and re-broadcast because the PROJECT changed in a way that
// touched the set of names. Media before state, for the reason spelled out in
// the hello handler: the output should never paint a fallback frame for a name
// the folder can resolve.
async function refreshMediaForProjectChange() {
  await syncResolvedMedia();
  broadcastMedia();
  broadcastState();
}

// True when the set of referenced names has drifted from what resolvedMedia
// was built from - the cheap test that keeps nudges and opacity drags on the
// synchronous path.
function mediaNamesChanged() {
  return mediaNamesKey(referencedMediaNames()) !== resolvedNamesKey;
}

// --- Sidebar actions. Each is a click handler, so each carries a user gesture.

async function chooseMediaFolder() {
  let handle;
  try {
    handle = await window.showDirectoryPicker({ id: "muralista-media", mode: "read" });
  } catch (err) {
    // AbortError is the person closing the dialog - not a failure worth saying
    // anything about.
    if (!err || err.name !== "AbortError") console.warn("Muralista: choosing a media folder failed.", err);
    return;
  }
  mediaFolderHandle = handle;
  mediaFolderState = "granted"; // the pick itself grants read for this session
  try {
    await writeStoredFolderHandle(handle);
  } catch (err) {
    // The folder still works for this session; only the round trip across a
    // browser restart is lost. Say so rather than pretending it persisted.
    console.warn("Muralista: could not remember the media folder.", err);
  }
  await refreshMediaForFolderChange();
}

// The "prompt" branch, run from a click so the gesture is real. Chrome answers
// "denied" immediately for a folder the person has blocked; that stays a
// reconnect state rather than becoming an error, because choosing the folder
// again is the way out and the button is right there.
async function reconnectMediaFolder() {
  if (!mediaFolderHandle) return;
  try {
    const perm = await mediaFolderHandle.requestPermission({ mode: "read" });
    mediaFolderState = perm === "granted" ? "granted" : "reconnect";
  } catch (err) {
    console.warn("Muralista: reconnecting the media folder failed.", err);
    mediaFolderState = "reconnect";
  }
  await refreshMediaForFolderChange();
}

async function clearMediaFolder() {
  mediaFolderHandle = null;
  mediaFolderState = "none";
  try {
    await clearStoredFolderHandle();
  } catch (err) {
    console.warn("Muralista: could not forget the media folder.", err);
  }
  await refreshMediaForFolderChange();
}

// Boot. Reads the handle back and ASKS what we are allowed to do with it -
// query, never request. This is the round trip the whole feature is for: close
// Chrome entirely, reopen, and a folder that is still granted just works with
// no dialog anywhere.
async function initMediaFolder() {
  if (mediaFolderSupported()) {
    try {
      const handle = await readStoredFolderHandle();
      if (handle) {
        mediaFolderHandle = handle;
        const perm = await handle.queryPermission({ mode: "read" });
        mediaFolderState = perm === "granted" ? "granted" : "reconnect";
      }
    } catch (err) {
      console.warn("Muralista: could not read the saved media folder.", err);
      mediaFolderHandle = null;
      mediaFolderState = "none";
    }
    if (mediaFolderState === "granted") {
      await syncResolvedMedia();
      broadcastMedia();
    }
  } else {
    mediaFolderState = "unsupported";
  }
  // One exit, and it re-renders the whole control: the folder decides the
  // media section's contents AND the layer panel's src label, so a branch that
  // refreshed only the former would leave the latter describing a folder that
  // is not connected.
  renderControl();
}

// =========================================================================
// GIG (control-side only)
// =========================================================================
// MURALISTA WORKS WITH AND WITHOUT A GIG, and the gig-less half is the one to
// protect. Mapping a wall with nothing selected, unpersisted, exactly as it
// has always worked, stays possible - a gig is ADDITIVE. What it adds is the
// four song-aware types, which appear in the type picker only while one is
// connected, because a lyrics slot in a project with no songs is a shape
// nobody can resolve.
//
// MURALISTA NEVER CREATES A GIG. It is handed a folder that already holds a
// gig.json Pregonero wrote, with songs in it. If the folder has none, or the
// gig has no songs, this section SAYS SO rather than inventing one.
//
// THE BOUNDARY, AND IT IS THE POINT OF THE WHOLE SECTION. Muralista reads
// `songs` and `venue` out of gig.json AND NOTHING ELSE, EVER. Not setlist, not
// tempo, not translations, not count-ins, not lyrics. It needs song ids and
// titles so a deviating song can be picked BY NAME, and the room's identity.
// Lyrics preview with a dummy string (LYRICS_PREVIEW_TEXT), and that dummy is
// exactly what keeps this line where it is: the moment a real lyric is wanted
// on screen, the line moves. A redraw to "content yes, performance data no"
// was proposed on 2026-08-24 and withdrawn for this reason.
//
// readGigFile() below is the ONE place the parsed JSON is touched, and it
// projects it down to {id, venue, songs:[{id,title}]} immediately. Everything
// downstream sees only that, so the boundary is a thing you can read in one
// function rather than a rule to keep.
//
// MURALISTA IS THE SOLE WRITER OF visuals.json, and it never writes gig.json.
// The two files sit side by side in the gig folder; one writer each is the
// whole ownership rule, and it is what lets the visual work happen on another
// machine and come back as one file.

const GIG_FOLDER_KEY = "gigFolder";
const GIG_FILE_NAME = "gig.json";
const VISUALS_FILE_NAME = "visuals.json";
const VISUALS_VERSION = 1;

// --- HOSTED: the gig arrives as an endpoint instead of as a folder. ---
//
// ONE CONDITION AT THE TOP, exactly the way ?output already is. With no `gig`
// parameter, nothing below this comment runs and the tool behaves EXACTLY as
// it does today: the picker, a directory handle, and a direct write. Muralista
// staying fully usable on its own is a requirement about this repo and this is
// what keeps it true.
//
// WHY IT EXISTS. A host that has already created the gig's folder cannot hand
// it over: a FileSystemDirectoryHandle can only be minted by showDirectoryPicker
// under a user gesture, Chromium admits no path-to-handle route by design, and
// Electron exposes no hook to pre-seed the picker. So a hosted Muralista asks
// for a folder its host created and already knows the path of - a question with
// one knowable answer, whose failure is silent: pick one level too high and
// visuals.json lands somewhere the host will never look.
//
// WHAT MURALISTA LEARNS, AND IT IS ONLY THIS: that something served this page
// and accepts a write at a place relative to it. THE ENDPOINT IS A RELATIVE URL
// AND AN ABSOLUTE ONE IS REFUSED - not a formality: refusing it is what stops a
// host's name, port or scheme ever reaching this file. Muralista does not know
// what is on the other end, and must not.
//
// The boundary above is untouched. gig.json is still read and never written,
// still projected down to {id, venue, songs} in readGigFile, and visuals.json
// still carries only what visualsDocument() puts in it.
const hostedGigBase = readHostedGigBase();

function readHostedGigBase() {
  const raw = new URLSearchParams(window.location.search).get("gig");
  if (!raw) return null;
  // RELATIVE ONLY. A scheme ("http:", "file:") or a protocol-relative "//host"
  // would carry the host's identity into this tool. Both are refused rather
  // than sanitized: there is one right shape and anything else is a mistake
  // worth failing on.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) {
    console.warn("Muralista: the gig endpoint must be a relative URL. Ignoring:", raw);
    return null;
  }
  try {
    return new URL(raw.endsWith("/") ? raw : raw + "/", window.location.href);
  } catch (err) {
    console.warn("Muralista: could not read the gig endpoint.", err);
    return null;
  }
}

function isHostedGig() {
  return hostedGigBase !== null;
}

/**
 * **WHERE THE HOST KEEPS THE VISUALS, WHEN THERE IS A HOST.**
 *
 * **A cross-origin frame cannot open a directory picker.** Chromium refuses outright —
 * *Cross origin sub frames aren't allowed to show a file picker* — and unlike the camera there is
 * no permissions-policy token that opens it. So hosted, this tool cannot go and get the folder; the
 * host hands it over as a mount, and a `GET` on that mount's root answers with the names in it.
 *
 * **Same shape and same refusal as `?gig=`**: a RELATIVE url naming a mount. A scheme or a
 * protocol-relative host would carry the host's identity into this file, and there is one right
 * shape here — anything else is a mistake worth failing on rather than sanitising.
 *
 * **Standalone this is null and nothing changes**: the directory handle and `showDirectoryPicker`
 * work at top level, and they are the mechanism this mirrors rather than replaces. **Either way the
 * mapping stores a NAME**, which is the whole reason the two can be one mechanism at all.
 */
const hostedMediaBase = readHostedMediaBase();

function readHostedMediaBase() {
  const raw = new URLSearchParams(window.location.search).get("media");
  if (!raw) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) {
    console.warn("Muralista: the visuals endpoint must be a relative URL. Ignoring:", raw);
    return null;
  }
  try {
    return new URL(raw.endsWith("/") ? raw : raw + "/", window.location.href);
  } catch (err) {
    console.warn("Muralista: could not read the visuals endpoint.", err);
    return null;
  }
}

function isHostedMedia() {
  return hostedMediaBase !== null;
}

/**
 * **A name may be a RELATIVE PATH now** (Jorge, 2026-09-04): the listing recurses, because a real
 * visuals folder keeps its animations one level down in a per-song directory and a root-only
 * listing offered a README.
 *
 * **Each segment is encoded on its own, and the separators are left alone.** `encodeURIComponent`
 * on the whole string turns `/` into `%2F`, which asks the mount for one file with a slash in its
 * name — a 404 that looks exactly like a missing file.
 */
function hostedMediaUrl(fileName) {
  const encoded = String(fileName)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(encoded, hostedMediaBase).href;
}

/**
 * The names the visuals folder holds — the host's listing, or the directory handle's own entries.
 * **One list, two sources**, so the picker below has one shape to render.
 */
let visualsFolderNames = [];

async function refreshVisualsFolderNames() {
  const before = visualsFolderNames.join("\u0000");
  visualsFolderNames = await readVisualsFolderNames();
  if (visualsFolderNames.join("\u0000") !== before) renderControl();
}

async function readVisualsFolderNames() {
  if (isHostedMedia()) {
    try {
      const res = await fetch(hostedMediaBase.href, { cache: "no-store" });
      if (!res.ok) return [];
      const body = await res.json();
      return Array.isArray(body && body.names) ? body.names.filter((n) => typeof n === "string") : [];
    } catch (err) {
      console.warn("Muralista: could not read the visuals folder.", err);
      return [];
    }
  }
  if (!mediaFolderHandle || mediaFolderState !== "granted") return [];
  try {
    // **Standalone walks the same way the host's listing does**, with the same filter and the same
    // caps — the whole argument for the listing existing is that the two cases work by ONE
    // mechanism, and a hosted picker richer than the standalone one would break exactly that.
    return (await walkFolderForAssets(mediaFolderHandle, "", 0)).sort();
  } catch (err) {
    console.warn("Muralista: could not list the visuals folder.", err);
    return [];
  }
}

/** What a shape can hold. The same families the host's listing offers, kept in step by hand. */
const ASSET_EXTENSIONS = [
  ".mp4", ".mov", ".webm", ".m4v", ".mkv",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif",
];

const ASSET_MAX_DEPTH = 4;

function isAssetName(name) {
  const dot = name.lastIndexOf(".");
  return dot !== -1 && ASSET_EXTENSIONS.includes(name.slice(dot).toLowerCase());
}

async function walkFolderForAssets(handle, prefix, depth) {
  if (depth >= ASSET_MAX_DEPTH) return [];
  const found = [];
  for await (const [name, entry] of handle.entries()) {
    if (name.startsWith(".")) continue;
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    if (entry.kind === "directory") {
      found.push(...(await walkFolderForAssets(entry, rel, depth + 1)));
    } else if (isAssetName(name)) {
      found.push(rel);
    }
  }
  return found;
}

function hostedGigUrl(fileName) {
  return new URL(fileName, hostedGigBase).href;
}

// Same four states as the media folder, and the same reasons - see there.
// "readwrite" rather than "read" is the one difference: visuals.json is
// written back into this folder, and asking for the weaker mode would mean a
// second permission prompt at the moment of saving.
let gigFolderHandle = null;
let gigFolderState = "none";
// The projection of gig.json, never the parse of it. Null until a folder with
// a readable gig is connected.
let gig = null;
// What to tell the person when there is a folder but no usable gig in it.
let gigError = null;
// What to say about visuals.json. A file written into a folder is invisible
// from inside the browser, so the tool has to say it happened - and has to
// stop saying it the moment the shapes on screen have moved past what was
// written, or the line becomes a claim that the folder is up to date when it
// is not. `visualsWrittenAt` is cleared by the next commit for exactly that
// reason; an error is not, because an error stands until it is retried.
let visualsWrittenAt = null;
let visualsWriteError = "";

function gigFolderSupported() {
  // Hosted needs no picker, so the section is offered even where there is none.
  return isHostedGig() || typeof window.showDirectoryPicker === "function";
}

function gigFolderLabel() {
  if (isHostedGig()) return "the gig this window was opened on";
  return gigFolderHandle ? gigFolderHandle.name : null;
}

// The gate the song-aware types are behind. A folder that is connected but
// holds no usable gig does NOT open them: the types would be unresolvable.
function gigConnected() {
  return gigFolderState === "granted" && !!gig && gig.songs.length > 0;
}

function readStoredGigFolderHandle() {
  return mediaDbRequest("readonly", (store) => store.get(GIG_FOLDER_KEY));
}

function writeStoredGigFolderHandle(handle) {
  return mediaDbRequest("readwrite", (store) => store.put(handle, GIG_FOLDER_KEY));
}

function clearStoredGigFolderHandle() {
  return mediaDbRequest("readwrite", (store) => store.delete(GIG_FOLDER_KEY));
}

// THE BOUNDARY, IN ONE FUNCTION. Reads gig.json and returns {id, venue, songs}
// or throws. `songs` entries keep an id and a title and nothing else - not the
// `file` path, which is Pregonero's business, and not a single field from the
// song file it points at.
//
// A song with no title falls back to its id, because the example gig file in
// docs/gig-file.md carries ids without titles while the prose that governs it
// says titles are what Muralista reads. Showing the id is the honest reading of
// a file that has no title in it, and it still picks the right song by name.
async function readGigFile(handle) {
  const text = isHostedGig() ? await fetchHostedGigText() : await readGigFileText(handle);
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") throw new Error("gig.json is not an object");
  const songs = (Array.isArray(parsed.songs) ? parsed.songs : [])
    .filter((entry) => entry && typeof entry === "object" && typeof entry.id === "string" && entry.id)
    .map((entry) => ({
      id: entry.id,
      title: typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : entry.id,
    }));
  const venue = parsed.venue && typeof parsed.venue === "object" ? parsed.venue : null;
  return {
    id: typeof parsed.id === "string" ? parsed.id : null,
    venue: venue
      ? {
          name: typeof venue.name === "string" ? venue.name : "",
          city: typeof venue.city === "string" ? venue.city : "",
        }
      : null,
    songs,
  };
}

async function readGigFileText(handle) {
  const fileHandle = await handle.getFileHandle(GIG_FILE_NAME);
  return (await fileHandle.getFile()).text();
}

// The hosted read. A 404 is reported the same way a missing file is, so the
// two paths say the same thing about the same condition.
async function fetchHostedGigText() {
  const res = await fetch(hostedGigUrl(GIG_FILE_NAME), { cache: "no-store" });
  if (res.status === 404) {
    const err = new Error("no " + GIG_FILE_NAME);
    err.name = "NotFoundError";
    throw err;
  }
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

function gigVenueLabel() {
  if (!gig || !gig.venue) return gig && gig.id ? gig.id : "this gig";
  const { name, city } = gig.venue;
  return [name, city].filter(Boolean).join(", ") || (gig.id || "this gig");
}

// Re-reads the connected folder - gig.json AND, since 2026-09-03, the room in
// visuals.json. Called on connect, on reconnect, and from the Reload button: a
// gig is a file somebody else wrote and may have rewritten while this window
// was open, and re-reading it is one click rather than a reload of the tool.
//
// **RELOADING DISCARDS UNSAVED EDITS TO THE ROOM, and that is the rule rather
// than a side effect.** The handed-in file is the record for this gig, so
// re-reading the folder means taking what the folder says. The button's label
// says `Reload from the gig folder` for exactly this reason - `Reload gig.json`
// stopped being true the moment the room came back with it.
async function refreshGig() {
  gig = null;
  gigError = null;
  if (gigFolderState !== "granted" || (!gigFolderHandle && !isHostedGig())) {
    renderControl();
    return;
  }
  try {
    const next = await readGigFile(gigFolderHandle);
    if (!next.songs.length) {
      // Deliberately not phrased as a broken file. A gig with no songs is a
      // gig Pregonero has not finished setting up, and this tool does not
      // finish it for them - see the section comment.
      gigError =
        gigFolderLabel() +
        "/gig.json lists no songs. Pregonero writes the gig; Muralista reads it and will not invent one.";
    } else {
      gig = next;
    }
  } catch (err) {
    gigError =
      err && err.name === "NotFoundError"
        ? await missingGigMessage()
        : "Could not read " + GIG_FILE_NAME + ": " + ((err && err.message) || "unreadable");
    console.warn("Muralista: could not read the gig.", err);
  }
  // **THE HANDED-IN FILE WINS.** A connected gig's room comes out of its folder,
  // replacing whatever was in memory - which on a standalone machine is the
  // local store, and it is deliberately ignored here. Re-read on every refresh
  // for the reason gig.json is: it is a file somebody else may have rewritten
  // while this window was open.
  if (gigConnected()) {
    await adoptGigVisuals();
    visualsWrittenAt = null;
    visualsWriteError = "";
  }
  // Whether the gig's folder holds a stage capture to offer as a backdrop. A
  // file somebody else may have written since this window opened, so it is
  // re-read with the gig rather than answered once.
  await refreshStageCapturePresent();
  // A gig that went away must not leave the tool previewing a song from it.
  if (!gigConnected() || !gigSongById(visualSetupSongId)) {
    visualSetupSongId = null;
    visualSetupMode = "gig";
  }
  // The names the picker offers. Un-awaited: it re-renders itself when it lands, and a dropdown is
  // not worth holding a gig load up for.
  void refreshVisualsFolderNames();
  broadcastState(); // the preview song rides the state message
  renderControl();
}

// THE FOLDER WITH NO GIG IN IT, AND THE ONE MISTAKE THAT ACTUALLY HAPPENS.
//
// gig.json lives in <gig>/setup/, so a picked folder with no gig.json in it is
// usually the gig folder itself, one level too high - and picking it is silent:
// visuals.json lands beside the poster, where the thing that reads it never
// looks, with no error anywhere. So when the folder that was picked HAS a
// setup/gig.json, say that, by name, instead of the generic sentence.
//
// IT WARNS, IT DOES NOT REFUSE. Opening Muralista on a folder that is not a
// gig at all is a legitimate thing to do - mapping a wall needs no gig, and
// the song-aware types simply are not offered. Refusing would take that away
// to prevent a mistake that a sentence prevents just as well.
const SETUP_FOLDER_NAME = "setup";

async function missingGigMessage() {
  const generic =
    "No " + GIG_FILE_NAME + " in " + gigFolderLabel() + ". Pick the folder that holds the gig.";
  if (!gigFolderHandle) return generic;
  try {
    const setup = await gigFolderHandle.getDirectoryHandle(SETUP_FOLDER_NAME);
    await setup.getFileHandle(GIG_FILE_NAME);
  } catch {
    return generic;
  }
  return (
    "No " +
    GIG_FILE_NAME +
    " here, but there is one in " +
    gigFolderLabel() +
    "/" +
    SETUP_FOLDER_NAME +
    ". That is the folder to pick: this one is the gig folder, one level up, and " +
    VISUALS_FILE_NAME +
    " written here would be somewhere nothing reads it. Mapping the wall works either way."
  );
}

function gigSongById(songId) {
  if (!gig || !songId) return null;
  return gig.songs.find((song) => song.id === songId) || null;
}

// --- Sidebar actions. Each carries a user gesture, for the same reason the
// media folder's do: showDirectoryPicker and requestPermission require one. ---

async function chooseGigFolder() {
  let handle;
  try {
    handle = await window.showDirectoryPicker({ id: "muralista-gig", mode: "readwrite" });
  } catch (err) {
    if (!err || err.name !== "AbortError") console.warn("Muralista: choosing a gig folder failed.", err);
    return;
  }
  gigFolderHandle = handle;
  gigFolderState = "granted";
  visualsWrittenAt = null;
  visualsWriteError = "";
  try {
    await writeStoredGigFolderHandle(handle);
  } catch (err) {
    console.warn("Muralista: could not remember the gig folder.", err);
  }
  await refreshGig();
}

async function reconnectGigFolder() {
  if (!gigFolderHandle) return;
  try {
    const perm = await gigFolderHandle.requestPermission({ mode: "readwrite" });
    gigFolderState = perm === "granted" ? "granted" : "reconnect";
  } catch (err) {
    console.warn("Muralista: reconnecting the gig folder failed.", err);
    gigFolderState = "reconnect";
  }
  await refreshGig();
}

// Disconnects the folder, and THE STANDALONE ROOM COMES BACK.
//
// **The exact mirror of connecting one** (2026-09-03). Connecting adopts the
// gig's file and ignores the local store; disconnecting hands the local store
// back, because from that moment nobody is handing a file over and the local
// store is what standalone means. Nothing is thrown away either way: the gig's
// afternoon is in the gig's file, and the standalone afternoon is where it
// always was.
//
// **The alternative was keeping the gig's room on screen and persisting it
// locally on the next edit**, which copies a handed file into the store the
// rule says exists only when nothing was handed over. It also silently
// replaced whatever standalone work was there. Rejected on both counts.
async function clearGigFolder() {
  gigFolderHandle = null;
  gigFolderState = "none";
  visualsWrittenAt = null;
  visualsWriteError = "";
  visualsReadError = "";
  project = loadProject();
  selectedShapeId = null;
  clearShapeSubselection();
  try {
    await clearStoredGigFolderHandle();
  } catch (err) {
    console.warn("Muralista: could not forget the gig folder.", err);
  }
  await refreshGig();
}

// --- Reading a gig's visuals.json back. ---
//
// THE HANDED-IN FILE ALWAYS WINS (Jorge, 2026-09-03).
//
//   Muralista keeps a local copy only when it was NOT handed one.
//
// No merge, no conflict resolution, no arbitration between two stores. What
// follows from it, and all of it is intended:
//
//   - IN A GIG CONTEXT THE LOCAL STORE IS NEVER CONSULTED. Work done
//     standalone on the same room is ignored when that room is opened with a
//     gig, because the gig's file is the record for that gig.
//   - EDITING INSIDE A GIG WRITES TO THE GIG FOLDER ONLY. The local copy does
//     not shadow it, so the two cannot drift.
//   - THE LOCAL STORE IS FOR THE CASE NOBODY HANDED A FILE OVER - standalone
//     with no gig, the only time this tool has to remember a room by itself.
//
// WHY IT HAD TO EXIST. Round one shipped write-only: this tool never read a
// visuals.json back, so a machine with no local mapping whose gig folder had
// one skipped the deal and landed on an EMPTY CANVAS - the deal's signal read
// the file and the canvas did not. The app said "you have done this before"
// and showed nothing.
//
// AND IT IS WHAT MAKES THE STAGE CAPTURE WORTH ANYTHING. A file saved into a
// gig folder that nothing reads back serves nobody; with the file as the
// winner, the folder is what a later session loads, and Wednesday-from-home
// works whether or not it is the same machine.
//
// A FILE THAT NAMES ANOTHER GIG IS REFUSED, NOT LOADED. Copying last month's
// gig folder to start the next one and not re-mapping gives a mapping of the
// wrong room that renders perfectly with nothing reporting it. Pregonero
// already refuses exactly this on exactly this field; the two now agree.

// What the last read of visuals.json said, when it said anything. Null while
// there is nothing to report. Shown beside the write status, because they are
// two facts about one file.
let visualsReadError = "";

async function readVisualsText() {
  if (isHostedGig()) {
    const res = await fetch(hostedGigUrl(VISUALS_FILE_NAME), { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.text();
  }
  if (!gigFolderHandle) return null;
  try {
    const fileHandle = await gigFolderHandle.getFileHandle(VISUALS_FILE_NAME);
    return (await fileHandle.getFile()).text();
  } catch (err) {
    // Absent is not an error. A gig whose room has never been mapped is the
    // ordinary starting state, and it is what screen 1 exists for.
    if (err && err.name === "NotFoundError") return null;
    throw err;
  }
}

// The document this tool wrote, turned back into a project.
//
// IT GOES THROUGH migrateProject, which is the single enforcement point for
// arbitrary JSON on load AND on import - a ring under the 3-point floor or a
// non-finite coordinate would otherwise paint as a degenerate polygon with no
// visible cause at a projector. A gig folder is a folder somebody can edit.
//
// WHAT IS NOT IN THE FILE STAYS UNSET. `backdropMode` and the backdrop photo
// are authoring aids and were deliberately never written (see
// visualsDocument), so a loaded room starts on the photo backdrop with none
// chosen, exactly as a fresh project does.
function projectFromVisuals(doc, expectedGigId) {
  if (!doc || typeof doc !== "object") throw new Error("visuals.json is not an object");
  if (typeof doc.visualsVersion !== "number") {
    throw new Error("visuals.json declares no visualsVersion.");
  }
  if (doc.visualsVersion !== VISUALS_VERSION) {
    throw new Error(
      "visuals.json is version " +
        doc.visualsVersion +
        "; this build writes version " +
        VISUALS_VERSION +
        ". It is not loaded."
    );
  }
  if (expectedGigId && doc.gigId && doc.gigId !== expectedGigId) {
    throw new Error(
      'visuals.json belongs to gig "' +
        doc.gigId +
        '", not "' +
        expectedGigId +
        '". That is a mapping of a different room, so it is not loaded.'
    );
  }
  return migrateProject({
    version: PROJECT_VERSION,
    backdropMode: "photo",
    cameraDeviceId: typeof doc.cameraDeviceId === "string" ? doc.cameraDeviceId : null,
    cameraQuad: isValidQuad(doc.cameraQuad) ? doc.cameraQuad : null,
    surfaces: Array.isArray(doc.shapes) ? doc.shapes : [],
    songVisuals: doc.songVisuals,
  });
}

/**
 * Loads the connected gig's room, replacing whatever is in memory.
 *
 * IT WRITES NOTHING, and that is the rule rather than an implementation
 * detail: adopting a handed file must not copy it into the local store, or the
 * two stores exist again and can drift.
 *
 * A gig with no visuals.json yet loads an EMPTY room rather than the local one.
 * That is the ruling applied rather than softened: in a gig context the local
 * store is never consulted, and a gig whose room has not been mapped is a room
 * that has not been mapped.
 */
async function adoptGigVisuals() {
  visualsReadError = "";
  let text = null;
  try {
    text = await readVisualsText();
  } catch (err) {
    console.warn("Muralista: could not read " + VISUALS_FILE_NAME + ".", err);
    visualsReadError =
      "Could not read " + VISUALS_FILE_NAME + ": " + ((err && err.message) || "unreadable");
    return;
  }
  if (text === null) {
    project = emptyProject();
    selectedShapeId = null;
    clearShapeSubselection();
    return;
  }
  try {
    project = projectFromVisuals(JSON.parse(text), gig ? gig.id : null);
  } catch (err) {
    console.warn("Muralista: could not load " + VISUALS_FILE_NAME + ".", err);
    // REFUSED, NOT REPAIRED, and not silently replaced by the local room
    // either - an empty canvas beside a named refusal is a state somebody can
    // act on, and the fix is in the folder rather than here.
    visualsReadError = (err && err.message) || ("Could not load " + VISUALS_FILE_NAME + ".");
    project = emptyProject();
  }
  selectedShapeId = null;
  clearShapeSubselection();
}

// --- Reading the stage capture back. ---
//
// THE CAPTURE BECOMES A BACKDROP, AND IT IS NOT A NEW KIND OF THING (Jorge,
// 2026-09-03). It is an OPTION IN THE BACKDROP DROPDOWN, beside a photo and
// the live camera, and picking it loads the file down the SAME PATH a chosen
// photo takes - including the downscale, because the reason that step exists
// has nothing to do with where the image came from.
//
// WHY IT HAD TO EXIST. v1.8.0 wrote stage.png and NOTHING READ IT. A file
// saved into a gig folder that nothing loads serves nobody, and this one was
// built for one purpose: setting the room up at home, against a photograph of
// the stage taken through the calibrated camera, without going back to the
// venue.
//
// IT IS OFFERED ONLY WHEN THE FILE IS THERE. An option that is always present
// and usually does nothing is a control that has to be tried to be understood.
//
// IT IS NOT PERSISTED, AND IT CANNOT BE. `stage` is reachable only while a gig
// is connected, and since v1.9.0 a connected gig means the project is not
// written to the local store at all - so `migrateProject`'s rule that anything
// but "camera" is "photo" needs no change: a LOADED project can never carry
// this mode. Re-picking it after a reload is one press, and the dropdown says
// it is there.
const STAGE_FILE_NAME = "stage.png";

// Whether the connected gig's folder holds a stage capture. Re-read whenever
// the gig is, because it is a file somebody else may have written since.
let stageCapturePresent = false;

async function readStageBlob() {
  if (isHostedGig()) {
    const res = await fetch(hostedGigUrl(STAGE_FILE_NAME), { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.blob();
  }
  if (!gigFolderHandle) return null;
  try {
    const fileHandle = await gigFolderHandle.getFileHandle(STAGE_FILE_NAME);
    return await fileHandle.getFile();
  } catch (err) {
    if (err && err.name === "NotFoundError") return null;
    throw err;
  }
}

/** Whether to offer the option. A read that fails answers no rather than throwing at a dropdown. */
async function refreshStageCapturePresent() {
  if (!gigConnected()) {
    stageCapturePresent = false;
    return;
  }
  try {
    stageCapturePresent = (await readStageBlob()) !== null;
  } catch (err) {
    console.warn("Muralista: could not look for " + STAGE_FILE_NAME + ".", err);
    stageCapturePresent = false;
  }
}

/**
 * Puts the gig's stage capture behind the shapes.
 *
 * **The same path a chosen photo takes**, `loadBackdropPhotoFile`, which takes
 * a Blob as readily as a File - so the downscale, the dataURL and every
 * failure message are the ones that were already there rather than a second
 * set that can drift from them.
 */
async function loadStageCaptureBackdrop() {
  let blob = null;
  try {
    blob = await readStageBlob();
  } catch (err) {
    console.warn("Muralista: could not read " + STAGE_FILE_NAME + ".", err);
  }
  if (!blob) {
    // It was offered because it was there; if it is gone now, say so and stop
    // offering rather than leaving a dead option in the menu.
    stageCapturePresent = false;
    project.backdropMode = "photo";
    setCameraStatus("The stage capture is no longer in the gig folder.");
    commitProjectChange();
    return;
  }
  loadBackdropPhotoFile(blob);
}

// --- Writing visuals.json. The one file this tool owns. ---

// What goes in it: the room. Shapes with their types and quads, the per-song
// reassignment table, and the camera calibration, which is a fact about this
// room and belongs with it.
//
// What does NOT go in it: the backdrop photo (an authoring aid, and a
// multi-megabyte dataURL), and anything at all out of gig.json. The gig's own
// id is written once, as a label, so a visuals.json found on its own says which
// gig it belongs to.
function visualsDocument() {
  return {
    visualsVersion: VISUALS_VERSION,
    gigId: gig ? gig.id : null,
    cameraDeviceId: project.cameraDeviceId,
    cameraQuad: project.cameraQuad,
    shapes: project.surfaces,
    songVisuals: sanitizeSongVisuals(project.songVisuals),
  };
}

async function writeVisualsFile() {
  if (gigFolderState !== "granted") return;
  if (!gigFolderHandle && !isHostedGig()) return;
  try {
    const body = JSON.stringify(visualsDocument(), null, 2);
    if (isHostedGig()) await putHostedVisuals(body);
    else await writeVisualsToFolder(body);
    visualsWrittenAt = new Date();
    visualsWriteError = "";
  } catch (err) {
    console.warn("Muralista: could not write visuals.json.", err);
    visualsWrittenAt = null;
    visualsWriteError =
      "Could not write " + VISUALS_FILE_NAME + ": " + ((err && err.message) || "write failed");
  }
  renderControl();
}

async function writeVisualsToFolder(body) {
  const fileHandle = await gigFolderHandle.getFileHandle(VISUALS_FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(body);
  await writable.close();
}

// The hosted write. THE SAME BYTES, PUT at the same name beside gig.json
// instead of written through a handle. What is on the other end is not this
// tool's business: it served the page, it accepts a write here, and Muralista
// knows nothing else about it.
async function putHostedVisuals(body) {
  const res = await fetch(hostedGigUrl(VISUALS_FILE_NAME), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
}

// Boot. Query, never request - the same round trip the media folder makes, for
// the same reason: reopen Chrome and a folder that is still granted just works
// with no dialog anywhere.
async function initGigFolder() {
  // HOSTED: there is nothing to pick, nothing to remember and nothing to ask
  // permission for. The endpoint is the connection, and it is granted the
  // moment the page loads with it.
  if (isHostedGig()) {
    gigFolderState = "granted";
    await refreshGig();
    return;
  }
  if (!gigFolderSupported()) {
    gigFolderState = "unsupported";
    renderControl();
    return;
  }
  try {
    const handle = await readStoredGigFolderHandle();
    if (handle) {
      gigFolderHandle = handle;
      const perm = await handle.queryPermission({ mode: "readwrite" });
      gigFolderState = perm === "granted" ? "granted" : "reconnect";
    }
  } catch (err) {
    console.warn("Muralista: could not read the saved gig folder.", err);
    gigFolderHandle = null;
    gigFolderState = "none";
  }
  await refreshGig();
}

// =========================================================================
// VISUAL SETUP MODE (control-side UI state, never persisted)
// =========================================================================
// TWO LEVELS, and which one you are in is a fact about the desk, not about the
// room - so it lives here and not in the project.
//
//   "gig"  - the room's shapes and their types. Every shape paints, because
//            you cannot place a shape you cannot see.
//   "song" - one deviating song. REASSIGNMENT ONLY: pick which existing shape
//            of that kind this song uses. The wall previews that song, so the
//            shapes it does not use go dark, which is what they will do on the
//            night.
//
// THE SONG PICKER LIVES HERE AND NOWHERE ELSE. There is deliberately no song
// selector on a shape's own panel: a shape does not belong to a song, a song
// points at a shape, and a picker per shape would invite the opposite reading.
let visualSetupMode = "gig";
let visualSetupSongId = null;

function previewSongId() {
  return visualSetupMode === "song" && gigConnected() ? visualSetupSongId : null;
}

/**
 * **ONE SELECTOR, AND THE EMPTY VALUE IS `All`** (Jorge, 2026-09-04). It replaced a mode picker
 * beside a song picker — two controls saying one thing, where the first only ever enabled the
 * second.
 *
 * **Picking a song is what makes the canvas assignment-only**, and clearing the shape selection is
 * part of that: a shape panel left open would offer geometry the mode does not have.
 */
function setVisualSetupSong(songId) {
  const found = gigSongById(songId);
  visualSetupSongId = found ? songId : null;
  visualSetupMode = found ? "song" : "gig";
  if (found) {
    selectedShapeId = null;
    clearShapeSubselection();
  }
  broadcastState();
  renderControl();
}

// =========================================================================
// WARP (homography -> CSS matrix3d)
// =========================================================================
// THE MATHS MOVED OUT, and where it went is the point of the move. `warp.js`
// is the one file in this repo that another program runs: Pregonero vendors a
// byte-identical copy of it and executes it on stage, so what you see while
// tuning a shape here is exactly what the room sees on the night. The
// alternative - Pregonero reimplementing the warp - was rejected, because two
// understandings that must agree would not, and the disagreement would show
// up as a few pixels of rotation on a wall in front of people. Read `warp.js`
// itself for the homography, the DLT setup and the matrix3d column order;
// read `warp-contract.md` in the tramoya-integration vault for what a caller
// owes it and why the output size is always a parameter.
//
// NOTHING ELSE FOLLOWED IT OUT. Everything in warp.js is pure - no state held
// between calls, no I/O, no DOM, no globals - and everything in this file
// that touches an element, a document or app state stayed here. That line is
// what stops a shared module becoming a channel for shared state.
//
// The import is static, so its bindings are hoisted and this section reads
// where it always did while UNIT_SIZE and the rest stay available to the code
// above it. The per-session `?v=` token reaches warp.js through the import
// map mapper.html writes before this file loads - see the bootstrap comment
// there, and note that a plain relative specifier would NOT inherit the token
// from this file's own URL.
import {
  computeHomography,
  homographyToMatrix3dString,
  applyHomography,
  UNIT_SQUARE_CORNERS,
  UNIT_SIZE,
  frameMatrix3d,
} from "./warp.js";
// The stage capture's maths, in a file of its own so `node --test` can reach
// it without a DOM - the same reason `warp.js` is a file of its own.
import { stageSampler } from "./stageCapture.js";

// =========================================================================
// THE FLOW
// =========================================================================
// THREE CELLS OVER THE TOOL THAT WAS ALWAYS HERE:
//
//   THE DEAL  ·  1 SHAPES  ·  2 OUTPUT
//
// 1 SHAPES IS the canvas as it exists today, untouched. The flow adds a way in
// and a way out; it does not add a second tool.
//
// `1 LAYOUT` WAS REMOVED ON 2026-09-04, and it is not to be reinstated.
// It offered *keep the default, or customise* — but CUSTOM STARTS FROM THE
// DEFAULT, ALREADY PLACED, so both answers produced the same room and the only
// difference was whether you then edited it. A screen with no real choice on it
// is why it could not explain itself.
//
// AND THE SKIP WAS WRONG. `Keep the default` sent you straight to the output; a
// gig whose songs have video still has to reach the shapes to assign them. The
// skip was designed when the output screen still carried a preview, and it did
// not survive that screen becoming the photograph.
//
// SO THE DEFAULT IS SIMPLY WHAT IS THERE WHEN YOU ARRIVE AT THE SHAPES, and you
// edit it or you do not. Nothing else about the default changed: Muralista still
// writes a real `visuals.json` from `2 OUTPUT`, because nothing is written on
// behalf of a tool that did not run.
//
// THE DEAL IS NOT MERGED WITH SCREEN 1, and that is the whole reason it is a
// separate cell. A deal states cost and gift ONCE; screen 1 asks a question
// that has to be answered every gig. Merging them makes the deal unskippable
// forever, or makes the choice vanish after the first gig.
//
// THE SIGNAL IS WHETHER A MAPPING ALREADY EXISTS, never a "seen it" flag:
// hosted, whether this gig's folder already answers for visuals.json;
// standalone, whether Muralista's own storage holds a room. A flag would be a
// second copy of a fact the world already carries, which is the class of state
// this suite keeps deleting.
//
// THE BAR IS ALWAYS THERE AND THE DEAL STAYS REACHABLE. That is Bombista's
// rule, arrived at the same way: `it stays reachable` reads as unconditional,
// so the cell sits in the bar on every screen rather than only while it is due.
//
// 2 OUTPUT IS NAMED FOR DOING, and it was Jorge's correction. That screen is
// where you take the picture and save the room; `preview` implies looking
// only. It also makes the two flows rhyme, since Bombista's last step is the
// same role under the same name.

const FLOW_DEAL = "deal";
const FLOW_SHAPES = "shapes";
const FLOW_OUTPUT = "output";

// The bar, in order. `THE DEAL` carries no number because it is not one of the
// two - it is the thing you agree to before the two start.
const FLOW_STEPS = [
  { key: FLOW_DEAL, n: null, label: "THE DEAL" },
  { key: FLOW_SHAPES, n: 1, label: "SHAPES" },
  { key: FLOW_OUTPUT, n: 2, label: "OUTPUT" },
];

// THE DEFAULT ROOM, and it is two shapes rather than three.
//
// The designed default - video across the frame, lyrics at the foot while the
// video is filled, lyrics across the frame while it is empty - is written in
// terms of CONDITIONAL VISIBILITY, which is round two and is deliberately not
// here. Round one's default is therefore the layout that needs no condition
// and is the one this suite already played two gigs on: THE FRAME, WITH THE
// LYRICS OVER IT. `default costing nothing and giving a frame that works`,
// which is what the value discussion asked of it.
//
// Round two attaches conditions to shapes that already exist, so this is what
// it attaches to.
const DEFAULT_FRAME = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

// Later in the list is on top, so the lyrics go second.
/**
 * **THE DESIGNED DEFAULT, AND IT IS THREE SHAPES AT LAST** (2026-09-04).
 *
 * `v1.8.0` shipped two, and said why: the third needed conditional visibility,
 * which did not exist. **This is the 02/09 default policy expressed in custom's
 * own vocabulary rather than hardcoded**, which was the point of the field:
 *
 * - a `song-video` shape filling the frame;
 * - a `song-lyrics` shape at its foot, **visible when the video is FILLED**;
 * - a `song-lyrics` shape filling the frame, **visible when the video is EMPTY**.
 *
 * **So a song with an animation gets video with words at its foot, and a song
 * without gets words across the projector's frame — same room, no geometry
 * moved.** One renderer, not two, and the default is a preset rather than a
 * separate world.
 *
 * Later in the list is on top, so the lyrics go after the frame.
 */
const DEFAULT_FOOT = [
  [0, 0.78],
  [1, 0.78],
  [1, 1],
  [0, 1],
];

/**
 * **`song-intro` AND `gig-contact` ARE ORDINARY SHAPES IN THE DEFAULT ROOM** (item 3, Jorge,
 * 2026-09-04). They used to be reachable only through the `LYRICS / VIDEO / INTRO / CONTACT` block,
 * which is what made the type-to-shape concept feel necessary. **Put them in the room and the
 * concept has nothing left to do.**
 *
 * Both are locked templates that read the song file or the gig, so they need no content set here —
 * they need a place on the wall, which is what a shape is. They start in a corner rather than on
 * the frame, because two more frame-filling quads would make the overlap item 12 exists for worse.
 */
const DEFAULT_CORNER = [
  [0.06, 0.06],
  [0.44, 0.06],
  [0.44, 0.3],
  [0.06, 0.3],
];

const DEFAULT_CONTACT = [
  [0.62, 0.7],
  [0.94, 0.7],
  [0.94, 0.94],
  [0.62, 0.94],
];

/**
 * **THE NAMES, AND `Frame` WAS AMBIGUOUS** (Jorge, 2026-09-04): the projector's frame, or the
 * video's? **The pair names itself now** — `Video frame` is the animation and `Video lyrics` are
 * the words at its foot, so reading one tells you what the other is. `Song lyrics` is the words
 * filling the frame when there is no animation. Sentence case, like every other label in the suite.
 */
const DEFAULT_LAYOUT = [
  { type: "song-video", name: "Video frame", key: "video" },
  { type: "song-lyrics", name: "Video lyrics", corners: DEFAULT_FOOT, when: "filled" },
  { type: "song-lyrics", name: "Song lyrics", when: "empty" },
  { type: "song-intro", name: "Intro", corners: DEFAULT_CORNER },
  { type: "gig-contact", name: "Contact", corners: DEFAULT_CONTACT },
];

// Which screen is showing. Never persisted: it is a fact about this sitting,
// not about the room.
let flowStep = FLOW_SHAPES;
// How far the flow has been taken, so the bar can offer what has been reached
// and dim what has not. The canvas is always reachable - it is the tool.
let flowReached = FLOW_SHAPES;
// What the last capture or save said. Cleared by the next attempt.
let flowCaptureStatus = "";
let flowSaveStatus = "";
let flowBusy = false;

/**
 * WHETHER THIS MACHINE HAS DONE THIS BEFORE.
 *
 * **One question and one read, since the handed-in file wins** (2026-09-03).
 * It used to be two: a `GET` of the gig's `visuals.json` when hosted, and the
 * local store standalone. Now the gig's file has already been loaded by the
 * time this is asked, so *are there shapes* answers both - and the two can no
 * longer disagree, which is exactly how round one shipped a deal that said
 * *you have done this before* over an empty canvas.
 *
 * Not a flag, and deliberately not: it reads the room itself.
 *
 * A room with nothing in it answers NO, which is the safe direction. Showing
 * the deal to somebody who has seen it costs one press; skipping it for
 * somebody who has not costs the whole explanation.
 */
function mappingAlreadyExists() {
  return Array.isArray(project.surfaces) && project.surfaces.length > 0;
}

const FLOW_ORDER = [FLOW_DEAL, FLOW_SHAPES, FLOW_OUTPUT];

function flowIndex(step) {
  return FLOW_ORDER.indexOf(step);
}

/**
 * THE ONE WAY BETWEEN SCREENS, and the one place the default is put down.
 *
 * `seedDefaultLayout` only ever seeds an EMPTY room, so this is idempotent: a
 * room somebody has worked on is never replaced, and arriving at the shapes
 * with nothing in them gives you the default already placed — which is the whole
 * of what `1 LAYOUT` used to ask about.
 */
function goToFlowStep(step) {
  if (step === FLOW_SHAPES) seedDefaultLayout();
  const arriving = step === FLOW_OUTPUT && flowStep !== FLOW_OUTPUT;
  flowStep = step;
  if (flowIndex(step) > flowIndex(flowReached)) flowReached = step;
  renderControl();
  // **THE CAPTURE IS TAKEN ON ARRIVAL**, which is the 2026-09-04 ruling made literal: the
  // photograph is always current rather than a stale picture of an earlier mapping. Un-awaited —
  // it renders itself when it lands, and the screen is already correct without it.
  if (arriving) void enterOutput();
}

/**
 * SEEDING THE DEFAULT. Two shapes at the projector's frame, typed, and the gig
 * defaults are derived from the shapes (`syncGigDefaultsFromShapes` runs on typing).
 *
 * IT ONLY EVER SEEDS AN EMPTY ROOM. A room that already has shapes is somebody's
 * afternoon, and replacing it is not what `keep the default` means - so the
 * control is disabled with the reason attached rather than being a press that
 * quietly throws work away.
 */
function seedDefaultLayout() {
  if (project.surfaces.length > 0) return false;
  let videoId = null;
  DEFAULT_LAYOUT.forEach(({ type, name, corners, key, when }) => {
    const shape = defaultShape(project.surfaces.length + 1);
    shape.name = name;
    const quad = corners ?? DEFAULT_FRAME;
    shape.corners = quad.map(([x, y]) => [x, y]);
    shape.outline = quad.map(([x, y]) => [x, y]);
    project.surfaces.push(shape);
    setLayerType(shape.id, type);
    if (key === "video") videoId = shape.id;
    // **The condition is set through the same setter a person uses**, so the
    // one-level rule and the target check apply to the default too. If they
    // ever disagreed, the default would be the thing that could not be authored.
    if (when && videoId) setShapeCondition(shape.id, videoId, when);
  });

  // **EVERY SHAPE OF A SONG-AWARE TYPE IS THAT TYPE'S DEFAULT** (item 3, 2026-09-04). The
  // assignment block that used to author this is gone, and `syncGigDefaultsFromShapes` derives it
  // from the shapes — which also fixes the thing that caught us on 09-04: `adoptGigDefaultIfUnset`
  // took the FIRST shape of a type and stopped, so the second lyrics shape was assigned to nothing
  // and **a song without an animation had no words at all.**
  syncGigDefaultsFromShapes();
  selectedShapeId = null;
  clearShapeSubselection();
  commitProjectChange();
  return true;
}

function canWriteVisuals() {
  return gigFolderState === "granted" && (!!gigFolderHandle || isHostedGig());
}

// -------------------------------------------------------------------------
// THE STAGE CAPTURE
// -------------------------------------------------------------------------
// A PHOTOGRAPH OF THE STAGE, TAKEN THROUGH THE CALIBRATED CAMERA AND SAVED
// WITH THE GIG. It is what makes working from home honest: map at the venue on
// Monday with the projector and camera where they will stand, move things
// around at home on Wednesday against this picture, reconfirm at the venue on
// Friday.
//
// WHY NOT THE PHOTO BACKDROP THAT ALREADY EXISTS. That one is a photo of the
// wall which you CROP TO THE PROJECTOR'S THROW BY HAND, and any error in that
// crop becomes a fixed offset in every shape drawn on it - Muralista's own
// README argues against it for exactly that reason. There is no crop step here,
// so that error cannot happen.
//
// IT IS IN OUTPUT SPACE OR IT IS WORTH NOTHING. The same calibration
// `Adopt boundaries…` maps its traced outline through, run the other way: for
// every pixel of the output frame, ask the camera what is there. A raw camera
// frame would reintroduce precisely the offset this exists to remove.
//
// AUTHORING ONLY, like every other backdrop. It never reaches the output
// window, and nothing in the output role knows the file exists.
//
// AND IT IS READ BACK AS ONE (v1.10.0). `STAGE_FILE_NAME` is declared with the
// reader, in the gig section above, because writing it and loading it are two
// halves of one file and a second constant is how the two halves start
// disagreeing about a name.

// The output frame's own aspect, and the size the preview already draws at.
// Big enough to place a shape against, small enough to be one ordinary PNG.
const STAGE_CAPTURE_WIDTH = 1600;
const STAGE_CAPTURE_HEIGHT = 900;

/** Why the capture is shut, or null. The same three conditions the adopt gesture has. */
function stageCaptureBlocker() {
  // EVERY ONE OF THESE NAMES THE SCREEN THE CONTROL IS ON. The camera lives in
  // 1 SHAPES's sidebar, which is not this screen, and a requirement stated with
  // nowhere to go is the dead end this suite has a rule about. The bar is one
  // press away; the sentence has to say which press.
  if (!isCameraMode()) return "Set Backdrop → Source to Live camera, in 1 SHAPES, first.";
  if (!isCameraEnabled()) return "Enable the camera in 1 SHAPES first.";
  if (!isValidQuad(project.cameraQuad)) {
    return "Calibrate the camera in 1 SHAPES first. The capture is taken through that calibration, into output space - without it there is nothing to map through.";
  }
  return null;
}

/**
 * One frame of the raw camera feed, mapped into OUTPUT SPACE through the
 * calibration, as a canvas.
 *
 * The inverse direction of the one `Adopt boundaries…` uses: it carries traced
 * points from camera space to output space, and an image has to be carried the
 * other way - for each output pixel, where in the camera does it come from.
 * `project.cameraQuad` is in normalized RAW camera coordinates, which is
 * exactly what `drawImage(video)` yields, so no rectification is applied to the
 * source and none should be.
 */
function captureStageIntoOutputSpace(video) {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const sample = stageSampler(
    project.cameraQuad,
    STAGE_CAPTURE_WIDTH,
    STAGE_CAPTURE_HEIGHT,
    video.videoWidth,
    video.videoHeight
  );
  // NO FALLBACK TO THE RAW FRAME, and that is the point of returning null. A
  // raw frame is exactly the offset this capture exists to remove, so a
  // degenerate calibration produces nothing rather than something wrong.
  if (!sample) return null;

  const src = document.createElement("canvas");
  src.width = video.videoWidth;
  src.height = video.videoHeight;
  const srcCtx = src.getContext("2d", { willReadFrequently: true });
  srcCtx.drawImage(video, 0, 0, src.width, src.height);
  const srcData = srcCtx.getImageData(0, 0, src.width, src.height).data;

  const out = document.createElement("canvas");
  out.width = STAGE_CAPTURE_WIDTH;
  out.height = STAGE_CAPTURE_HEIGHT;
  const outCtx = out.getContext("2d");
  const outImage = outCtx.createImageData(out.width, out.height);
  const dst = outImage.data;

  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const d = (y * out.width + x) * 4;
      const p = sample(x, y);
      if (!p) {
        // A part of the output the camera cannot see. BLACK, not transparent:
        // it is an honest answer about the wall, and a hole reads as a
        // rendering fault instead.
        dst[d + 3] = 255;
        continue;
      }
      const sIdx = (p[1] * src.width + p[0]) * 4;
      dst[d] = srcData[sIdx];
      dst[d + 1] = srcData[sIdx + 1];
      dst[d + 2] = srcData[sIdx + 2];
      dst[d + 3] = 255;
    }
  }
  outCtx.putImageData(outImage, 0, 0);
  return out;
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Takes the picture and saves it with the gig.
 *
 * THE GIG FOLDER GAINS A BINARY, and that is named rather than hidden:
 * `setup/<id>/` held two JSON files and now holds an image beside them. It is
 * machine territory, so no boundary moves - the artist's poster and contract
 * are one level up, exactly where they were.
 */
async function captureStage() {
  if (flowBusy) return;
  const blocked = stageCaptureBlocker();
  if (blocked) {
    flowCaptureStatus = blocked;
    renderControl();
    return;
  }
  setStagePhoto(null);
  flowBusy = true;
  flowCaptureStatus = "Capturing…";
  renderControl();
  try {
    const canvas = captureStageIntoOutputSpace(document.getElementById("preview-camera"));
    if (!canvas) throw new Error("the camera gave no frame to capture");
    const blob = await canvasToPngBlob(canvas);
    if (!blob) throw new Error("the frame could not be encoded");
    // **The screen IS the photograph**, so it is painted before anything is said about it.
    setStagePhoto(blob);
    if (canWriteVisuals()) {
      await writeStageFile(blob);
      // **Offerable from this moment**, without a reload: the file this window
      // just wrote is the file the Backdrop dropdown looks for.
      stageCapturePresent = true;
      flowCaptureStatus = "Photographed through the calibration, and saved with the gig.";
    } else {
      downloadBlob(blob, STAGE_FILE_NAME);
      flowCaptureStatus = "Photographed through the calibration, and downloaded — there is no gig to save it into.";
    }
  } catch (err) {
    console.warn("Muralista: the stage capture failed.", err);
    flowCaptureStatus = "Could not capture the stage: " + ((err && err.message) || "capture failed");
  }
  flowBusy = false;
  renderControl();
}

async function writeStageFile(blob) {
  if (isHostedGig()) {
    const res = await fetch(hostedGigUrl(STAGE_FILE_NAME), {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: blob,
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return;
  }
  const fileHandle = await gigFolderHandle.getFileHandle(STAGE_FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `Save to gig` on screen 3. The same write the sidebar has always had. */
async function flowSaveToGig() {
  if (flowBusy || !canWriteVisuals()) return;
  flowBusy = true;
  flowSaveStatus = "";
  renderControl();
  await writeVisualsFile();
  // **The success is said, not left blank.** It used to be, because the panel built its own
  // sentence from `visualsWrittenAt` when it rendered; that panel is gone and this is the only
  // place left that knows a write just happened.
  flowSaveStatus = visualsWriteError
    ? visualsWriteError
    : "Saved " + VISUALS_FILE_NAME + " with the gig at " + new Date().toLocaleTimeString() + ".";
  flowBusy = false;
  renderControl();
}

/** Standalone's way out: the same bytes, into the browser's downloads. */
function flowDownloadVisuals() {
  const body = JSON.stringify(visualsDocument(), null, 2);
  downloadBlob(new Blob([body], { type: "application/json" }), VISUALS_FILE_NAME);
  flowSaveStatus = "Downloaded " + VISUALS_FILE_NAME + ".";
  renderControl();
}

// -------------------------------------------------------------------------
// PAINTING THE FLOW
// -------------------------------------------------------------------------

function renderFlow() {
  renderFlowSteps();

  const onDeal = flowStep === FLOW_DEAL;
  const onShapes = flowStep === FLOW_SHAPES;
  const onOutput = flowStep === FLOW_OUTPUT;

  document.getElementById("flow-deal").hidden = !onDeal;
  // The canvas element itself is NEVER moved or unmounted - the camera's
  // matrix3d is built from its measured size, and a remounted preview is a
  // remounted video. Only the panel beside it changes.
  document.querySelector(".main-layout").hidden = !(onShapes || onOutput);
  document.getElementById("shapes-sidebar").hidden = !onShapes;
  // **`2 OUTPUT` IS THE PHOTOGRAPH AND NOTHING ELSE** (Jorge, 2026-09-04). The canvas, the
  // backdrop and the live camera all belong to the mapping; showing them here made this screen
  // read as SHAPES with a different sidebar, which is why the walk did not notice it had changed.
  document.querySelector(".preview-box").classList.toggle("showing-photo", onOutput);
  document.getElementById("flow-photo").hidden = !onOutput || stagePhotoUrl === null;

  // P6c: the toolbar belongs to `1 SHAPES` only — there is nothing to play or open on the deal or
  // on the output, and the output has just closed the window the toolbar would have opened.
  document.getElementById("header-actions").hidden = !onShapes;
  // A2: **THE NAME BAND IS STANDALONE'S** (Jorge, 2026-09-04). Hosted, this label is the tool
  // introducing itself to somebody who did not choose it — the same argument that took Bombista's
  // header off on 02/09. Decided by who is asking, exactly like `--no-header`, and not by taste.
  document.getElementById("header-bar").hidden = isEmbedded();

  renderFlowFooter();
  renderStandaloneActions();
  announceFlowStep();
}

/**
 * **ONE FOOTER, ONE PLACE, EVERY STEP** (Jorge, 2026-09-04). Outside every panel, bottom-right.
 *
 * **The deal and the shapes each carry the control that leaves them.** `2 OUTPUT` carries one only
 * when nobody else is carrying it: **in a gig the embedder's forward control writes the room on its
 * way out**, so a `Save to gig` beside it would be the two-control trap this round exists to remove.
 * Standalone there is no forward control at all, and this is how a room is saved.
 */
function renderFlowFooter() {
  const inGig = canWriteVisuals();
  const show = (id, on) => {
    const el = document.getElementById(id);
    el.hidden = !on;
    el.disabled = flowBusy;
  };
  show("btn-flow-deal-next", flowStep === FLOW_DEAL);
  show("btn-flow-to-output", flowStep === FLOW_SHAPES);
  show("btn-flow-save-gig", flowStep === FLOW_OUTPUT && inGig && !isEmbedded());
  show("btn-flow-download", flowStep === FLOW_OUTPUT && !inGig);

  // The status of whatever the footer's control last did, beside it — the only place left for it
  // now that `2 OUTPUT` has no panel.
  const status = document.getElementById("flow-footer-status");
  const message =
    flowStep === FLOW_OUTPUT
      ? visualsReadError || flowSaveStatus || flowCaptureStatus || visualsWriteError || ""
      : "";
  status.hidden = !message;
  status.textContent = message;
}

/**
 * EXPORT AND IMPORT ARE STANDALONE'S ONLY PORTABILITY, AND THEY ARE OFF IN A GIG
 * (Jorge, 2026-09-04).
 *
 * **In a gig, an import would silently override the gig's own `visuals.json`**,
 * which contradicts *the handed-in file always wins* — the ruling this tool
 * shipped in `v1.9.0`. So they are not there to be pressed.
 *
 * **Standalone they are load-bearing and were kept for it.** With no gig folder
 * the local store is a browser's, and `visuals.json` is the *emitted room*
 * rather than the project — no camera calibration, no backdrop, no media folder
 * name — so a downloaded one is not a way to move a project to another machine.
 * These two are.
 */
function renderStandaloneActions() {
  const el = document.getElementById("standalone-actions");
  if (el) el.hidden = canWriteVisuals();
}

/** Whether this page is drawn inside somebody else's. Standalone, `window.parent === window`. */
function isEmbedded() {
  return window.parent !== window;
}

/**
 * **The output window this tab opened**, held so it can be closed again.
 *
 * `window.open("", "mapper-output")` would find it by name — and would CREATE a blank one when
 * there is none, which is the opposite of closing it. A reference is the only way to close a
 * window that may not exist.
 */
let outputWindow = null;

/** P6d: entering `2 OUTPUT` closes it. A window nobody is looking at is not a second opinion. */
function closeOutputWindow() {
  if (outputWindow && !outputWindow.closed) {
    try {
      outputWindow.close();
    } catch (err) {
      console.warn("Muralista: could not close the output window.", err);
    }
  }
  outputWindow = null;
}

/**
 * **THE ONE THING THIS TOOL IS TOLD BY ITS EMBEDDER, AND IT IS AN INSTRUCTION, NOT DATA.**
 *
 * `save` — write the room to the gig, and say whether it worked. It exists because **the control
 * that leaves must be the control that writes** (Jorge, 2026-09-04): two controls where one leaves
 * and the other saves is a trap even when both work, and in a gig the leaving control belongs to
 * the embedder. So `Save to gig` comes off that screen and this arrives in its place.
 *
 * **Nothing about the room crosses in either direction.** One word in, one boolean plus this tool's
 * own status sentence out — the same sentence it would have printed beside its own button. No
 * shapes, no geometry, no gig, no song, no file contents. **The line, and it is the line for any
 * future message: this tool may be told what to do with its own state and may report its own
 * outcome; it may never report the work.**
 *
 * **Only the embedder is obeyed**, and only when there is one: `event.source` must be
 * `window.parent`, and standalone that is this window, so nothing can talk to it at all.
 */
function handleEmbedderMessage(event) {
  if (!isEmbedded() || event.source !== window.parent) return;
  const data = event.data;
  if (!data || data.muralista !== "save") return;
  void (async () => {
    // **A refusal is reported, never reported as a success.** `flowSaveToGig` returns early when
    // there is nowhere to write, and an unchanged `visualsWriteError` would read as *saved*.
    if (!canWriteVisuals()) {
      window.parent.postMessage(
        { muralista: "save-result", ok: false, reason: "There is no gig folder to write into." },
        "*"
      );
      return;
    }
    await flowSaveToGig();
    const ok = !visualsWriteError;
    window.parent.postMessage(
      { muralista: "save-result", ok, reason: ok ? null : visualsWriteError },
      "*"
    );
  })();
}

/**
 * WHICH OF MURALISTA'S OWN SCREENS IS SHOWING, SAID OUT LOUD TO WHOEVER IS
 * EMBEDDING IT — and that is the whole of it.
 *
 * **It exists because an outer flow's forward control must not be visible from
 * inside this one** (Jorge, 2026-09-04). Pregonero draws `To the check →` around
 * this page; while you are on THE DEAL or 1 SHAPES that control is a second
 * forward button on a screen that already has one, which is the nesting problem
 * this flow spent a round removing, one layer down.
 *
 * **NOTHING CROSSES THAT IS NOT MURALISTA'S OWN UI STATE.** One string, naming
 * one of this tool's three cells. No gig, no song, no file, no geometry. Nothing
 * is read back and nothing is awaited: this tool does not learn who is listening
 * and does not change behaviour if nobody is. It is the same class of thing as
 * Bombista being told `--no-header` — what to draw, never who is asking — and it
 * goes the other way.
 *
 * Standalone `window.parent === window`, so this is a no-op.
 */
function announceFlowStep() {
  if (window.parent === window) return;
  try {
    window.parent.postMessage({ muralista: "flow-step", step: flowStep }, "*");
  } catch (err) {
    // An embedder that cannot be posted to is not this tool's problem: the flow
    // is unaffected, and a throw here would take the render down with it.
    console.warn("Muralista: could not announce the flow step.", err);
  }
}

function renderFlowSteps() {
  const nav = document.getElementById("flow-steps");
  nav.innerHTML = "";
  FLOW_STEPS.forEach(({ key, n, label }) => {
    const here = key === flowStep;
    const open = flowIndex(key) <= flowIndex(flowReached);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "flow-step" + (here ? " on" : "");
    el.dataset.step = key;
    el.dataset.state = here ? "here" : open ? "open" : "closed";
    el.disabled = !open;
    if (here) el.setAttribute("aria-current", "step");
    el.textContent = n === null ? label : n + " " + label;
    el.addEventListener("click", () => goToFlowStep(key));
    nav.appendChild(el);
  });
}

/**
 * **ARRIVING AT `2 OUTPUT`.** Two rules, both settled 2026-09-04, and both here rather than behind
 * a button — the button is the thing that crept back in.
 *
 * **P6d: the output window closes.** The wall is about to be photographed and the screen is about
 * to show that photograph; a live output window is a second answer to the same question, and one
 * of them is a window nobody is looking at.
 *
 * **Capture only when a calibrated camera is live.** At the venue, arriving takes the picture. At
 * home, against a saved `stage.png` with no camera, there is nothing to take, so the saved one is
 * shown instead — **never overwrite a good venue capture with nothing**, because the home session
 * is precisely the one that would otherwise destroy it silently.
 */
async function enterOutput() {
  closeOutputWindow();
  const blocked = stageCaptureBlocker();
  if (blocked === null) {
    await captureStage();
    return;
  }
  // No camera to take one with. Show what the gig already holds, and say so plainly if it holds
  // nothing — a screen whose whole content is a photograph has to account for an absent one.
  await showSavedStageCapture(blocked);
}

/** The photograph as an object URL, revoked when it is replaced. Never persisted: it is a view. */
let stagePhotoUrl = null;

function setStagePhoto(blob) {
  if (stagePhotoUrl) URL.revokeObjectURL(stagePhotoUrl);
  stagePhotoUrl = blob ? URL.createObjectURL(blob) : null;
  const img = document.getElementById("flow-photo");
  if (!img) return;
  if (stagePhotoUrl) img.src = stagePhotoUrl;
  else img.removeAttribute("src");
}

async function showSavedStageCapture(whyNoCamera) {
  let blob = null;
  try {
    blob = await readStageBlob();
  } catch (err) {
    console.warn("Muralista: could not read " + STAGE_FILE_NAME + ".", err);
  }
  setStagePhoto(blob);
  stageCapturePresent = blob !== null;
  flowCaptureStatus = blob
    ? "The stage capture saved with this gig. " + whyNoCamera
    : "No picture of the stage yet. " + whyNoCamera;
  renderControl();
}

/**
 * WHERE THE FLOW OPENS. Called once, after the gig has had its chance to
 * connect, because whether a mapping already exists is a question about it.
 */
async function initFlow() {
  if (mappingAlreadyExists()) {
    // A room already exists, so the deal is behind this person and the tool is
    // the tool: the canvas, with everything reachable.
    flowStep = FLOW_SHAPES;
    flowReached = FLOW_OUTPUT;
  } else {
    // A FIRST TIME WALKS THE FLOW, and the bar dims what has not been reached.
    // Not for ceremony: `2 OUTPUT` on an empty room offers a save that would
    // write a room with nothing in it.
    flowStep = FLOW_DEAL;
    flowReached = FLOW_DEAL;
  }
  renderControl();
}

// =========================================================================
// CONTROL UI
// =========================================================================

function renderControl() {
  renderFlow();
  // **Scope is rendered by `renderControl`, not by `renderGigControls`.** That function returns
  // early in a gig now (item 4) and took the mode switch with it — the one control the whole screen
  // is governed by, hidden by the removal of a prose block beside it.
  renderScope();
  renderCanvasBand();
  renderPreviewToggles();
  renderShapeList();
  renderPreview();
  renderBackdrop();
  renderCamera();
  renderBackdropControls();
  renderMediaFolderControls();
  renderGigControls();
}

// The media folder's whole sidebar section: which buttons are live, what the
// folder is called, and - the part that earns its place - WHICH names failed.
// A name that does not resolve is invisible on the output until the projector
// paints a failure note on the wall, which is the wrong place and the wrong
// moment to learn that a file was renamed. It belongs here, next to the folder
// it did not resolve in, where the person configuring is already looking.
function renderMediaFolderControls() {
  const section = document.getElementById("media-folder-section");
  // P6b: HOSTED, THE FOLDER WAS ANSWERED AT FIRST RUN (Jorge, 2026-09-04). Pregonero resolves every
  // name through it and this tool never reads one; asking again here is a second answer to a
  // settled question, and a second answer that cannot be right.
  if (mediaFolderState === "unsupported" || isHostedGig()) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  const chooseBtn = document.getElementById("btn-media-folder");
  const reconnectBtn = document.getElementById("btn-media-folder-reconnect");
  const clearBtn = document.getElementById("btn-media-folder-clear");
  const status = document.getElementById("media-folder-status");
  const failures = document.getElementById("media-folder-failures");

  const label = mediaFolderLabel();
  chooseBtn.textContent = label ? "Change folder…" : "Choose folder…";
  reconnectBtn.hidden = mediaFolderState !== "reconnect";
  clearBtn.hidden = !label;

  if (mediaFolderState === "granted" && label) {
    const n = resolvedMedia.size;
    status.textContent = `${label} — connected. ${n} source${n === 1 ? "" : "s"} resolving from it.`;
  } else if (mediaFolderState === "reconnect" && label) {
    // Deliberately not phrased as an error: nothing is broken, the tool is in
    // its degraded mode and one click restores it. Saying what happens
    // meanwhile matters more than saying what went wrong.
    status.textContent = `${label} — remembered, but Chrome needs your permission again before it can be read. Sources fall back to the served directory until you reconnect.`;
  } else {
    status.textContent = "No folder chosen — sources resolve next to the served page, as they always have.";
  }

  if (mediaResolveFailures.length) {
    failures.hidden = false;
    failures.textContent =
      "Not found in this folder, falling back to the served directory:\n" +
      mediaResolveFailures.map((f) => `• ${f.src} (${f.reason})`).join("\n");
  } else {
    failures.hidden = true;
    failures.textContent = "";
  }
}


// The gig's whole sidebar section: the folder, what is in it, which level of
// visual setup is live, and the assignment rows for that level.
//
// Rebuilt from scratch on every render rather than reconciled, unlike the layer
// panel. Nothing in here commits on every keystroke - these are selects and
// buttons - so there is no in-progress edit to clobber, and a rebuild is the
// simpler thing to be correct about.
function renderGigControls() {
  const section = document.getElementById("gig-section");
  // **ITEM 4: THE `Gig` BLOCK GOES IN A GIG** (Jorge, 2026-09-04). **The header already names it** —
  // Pregonero's own chrome, one line above this frame — and every control in here is about
  // CONNECTING a folder, which hosted has already happened and cannot be undone from in here.
  // Standalone it stays: there it is the only way in.
  if (gigFolderState === "unsupported" || isHostedGig()) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  const label = gigFolderLabel();
  const hosted = isHostedGig();
  // HOSTED: no folder question, so no folder controls. Reload stays - gig.json
  // is a file somebody else wrote and may have rewritten while this is open.
  document.getElementById("btn-gig-folder").hidden = hosted;
  document.getElementById("btn-gig-folder").textContent = label ? "Change gig folder…" : "Choose gig folder…";
  document.getElementById("btn-gig-folder-reconnect").hidden = hosted || gigFolderState !== "reconnect";
  // P6b: HOSTED, YOU ARRIVED FROM THE GIG FLOW, which had just read the folder (Jorge,
  // 2026-09-04). Re-reading it by hand is a leftover from the tool being pointed at a folder
  // yourself. Standalone it stays, because there the folder can change under you.
  document.getElementById("btn-gig-reload").hidden = hosted || gigFolderState !== "granted";
  document.getElementById("btn-gig-folder-clear").hidden = hosted || !label;

  const status = document.getElementById("gig-status");
  if (gigConnected() && hosted) {
    const n = gig.songs.length;
    status.textContent = `${gigVenueLabel()} — ${n} song${n === 1 ? "" : "s"}. ${GIG_FILE_NAME} and ${VISUALS_FILE_NAME} are where this window was pointed; you were not asked, because there was nothing to ask.`;
  } else if (gigConnected()) {
    const n = gig.songs.length;
    status.textContent = `${gigVenueLabel()} — ${n} song${n === 1 ? "" : "s"}, read from ${label}/${GIG_FILE_NAME}.`;
  } else if (gigFolderState === "reconnect" && label) {
    // Not phrased as an error, for the same reason the media folder's is not:
    // nothing is broken, and one click is the way out.
    status.textContent = `${label} — remembered, but Chrome needs your permission again before it can be read or written.`;
  } else if (label) {
    status.textContent = `${label} — connected.`;
  } else {
    status.textContent =
      "No gig — map a wall freely. Song-aware shapes need one, so those types are not offered until a gig folder is connected.";
  }

  const error = document.getElementById("gig-error");
  error.hidden = !gigError;
  error.textContent = gigError || "";


  const written = document.getElementById("visuals-status");
  const where = hosted ? "beside " + GIG_FILE_NAME : "into " + label;
  // **A read refusal outranks everything else this line can say.** It means the
  // room on screen is not the room in the folder, which is the one thing about
  // this file worth interrupting for.
  const message = visualsReadError
    ? visualsReadError
    : visualsWriteError
      ? visualsWriteError
      : visualsWrittenAt
        ? `Wrote ${VISUALS_FILE_NAME} ${where} at ${visualsWrittenAt.toLocaleTimeString()}.`
        : "";
  written.hidden = !message;
  written.textContent = message;
  written.classList.toggle("visuals-status-bad", !!(visualsReadError || visualsWriteError));
}

/**
 * **SCOPE: one line, one control, at the top** (item 1, Jorge, 2026-09-04).
 *
 * **It is the mode switch and everything below changes meaning with it**, and it used to sit below
 * the things it governs. `All` is the room — full editing. Picking a song is assignment only.
 */
function renderScope() {
  const row = document.getElementById("scope-row");
  const songSelect = document.getElementById("select-visual-setup-song");
  const songs = gigConnected() ? gig.songs : [];
  row.hidden = songs.length === 0;
  if (songs.length === 0) return;

  const current = previewSongId() || "";
  songSelect.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All — the room";
  songSelect.appendChild(all);
  songs.forEach((song) => {
    const opt = document.createElement("option");
    opt.value = song.id;
    opt.textContent = song.title;
    songSelect.appendChild(opt);
  });
  songSelect.value = current;
}

/**
 * **`renderGigAssignments` AND `buildAssignmentRow` WENT WITH THE BLOCK** (item 3, 2026-09-04).
 *
 * The `LYRICS / VIDEO / INTRO / CONTACT` rows asked *which shape serves this type for the gig* —
 * **a type-to-shape mapping authored separately from the shapes themselves**, which read as a
 * duplicate of the list above it and was one more place a room could disagree with itself.
 *
 * **`songVisuals.defaults` is still written**, and is now derived from the shapes rather than typed
 * in: every shape of a song-aware type is that type's default. **`song-intro` and `gig-contact`
 * become ordinary shapes in the default room instead**, which is what makes the block unnecessary
 * rather than merely hidden.
 */
function syncGigDefaultsFromShapes() {
  const sv = ensureSongVisuals();
  let changed = false;
  SONG_AWARE_TYPES.forEach((type) => {
    const ids = project.surfaces.filter((shape) => shapeType(shape) === type).map((s) => s.id);
    const before = sanitizeShapeIdList(sv.defaults[type]).join(",");
    if (ids.length) {
      if (before !== ids.join(",")) { sv.defaults[type] = ids; changed = true; }
    } else if (sv.defaults[type]) {
      delete sv.defaults[type];
      changed = true;
    }
  });
  return changed;
}

/**
 * **`renderSongSetup` WENT WITH THE PANEL** (items 5, 7 and 11, 2026-09-04).
 *
 * It drew one row per fillable shape in a block of its own, below the Shapes list — **the same
 * shapes, listed twice, on one screen.** What it said is said in two better places now: the
 * **Shapes rows annotate** with what the song puts there and whether it lights, and the **Shape
 * accordion's Content section** is where it is changed. `buildSongAssetRow` survives because that
 * is the control, and it is now built inside the accordion.
 */

function buildSongAssetRow(shape, songId) {
  const row = document.createElement("div");
  row.className = "assignment-row";

  const label = document.createElement("label");
  label.textContent = shape.name;
  row.appendChild(label);

  if (shapeType(shape) === "song-lyrics") {
    // **Nothing to choose, and saying so is the point.** The words arrive from the song file
    // through Pregonero; this tool never sees them and must not look as though it could.
    const said = document.createElement("span");
    said.className = "layer-hint";
    said.textContent = "The song's own words.";
    row.appendChild(said);
    return row;
  }

  const select = document.createElement("select");
  const current = songAssetFor(project, songId, shape.id);
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "Nothing — dark for this song";
  select.appendChild(none);
  const names = [...visualsFolderNames];
  // A name the folder no longer holds is still shown, and marked: dropping it would silently
  // unassign a song's video because a drive was not plugged in.
  if (current && !names.includes(current)) names.unshift(current);
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = visualsFolderNames.includes(name) ? name : `${name} — not in the folder`;
    select.appendChild(opt);
  });
  select.value = current || "";
  select.addEventListener("change", (e) => setSongAsset(songId, shape.id, e.target.value));
  row.appendChild(select);

  if (visualsFolderNames.length === 0) {
    const why = document.createElement("span");
    why.className = "layer-hint";
    why.textContent = isHostedMedia()
      ? "The visuals folder is empty."
      : "Choose a media folder below to pick from it.";
    row.appendChild(why);
  }
  return row;
}

// One row: a type, and which shape of that type serves it. The empty option
// means "fall through to the level above" at song level and "no shape of this
// kind" at gig level - the same absence, read from two places.
//
// THE PICKER OFFERS ONE SHAPE, AND THE MODEL UNDERNEATH IT HOLDS A SET. That
// is deliberate: a size-one cap would be a rule to write, test and later
// remove, so there is none anywhere, and a hand-edited visuals.json naming two
// shapes already works and already lights both. Real files just happen to
// contain sets of size one until the day a corner or a translation needs two.

// ONE LIST, because there is one kind of thing in it. Row order is paint
// order (later = on top), and since v8 that includes fill shapes - the rule
// that used to pin black above everything is gone, and the ▲ / ▼ buttons work
// on every row.
/**
 * **SHAPES: one row per shape, and the row is the whole of the list's chrome.**
 *
 * **Items 15 and 18 (Jorge, 2026-09-04):** drag-to-reorder replaces the up/down arrows, and the
 * duplicate and eye icons come off. What is left on a row is its **handle**, its **name**, what it
 * says in Mode B, a **pencil** that opens the Shape accordion under it, and a **bin**.
 *
 * **No dependency was added for the drag** — see `wireRowDrag`. This tool has none and gains none.
 *
 * **Item 11: the rows annotate in Mode B** with what that song puts there and whether it lights, so
 * the whole song is readable without opening anything.
 */
function renderShapeList() {
  const list = document.getElementById("shape-list");
  list.innerHTML = "";

  const songId = previewSongId();
  const modeB = songId !== null;

  const status = document.getElementById("shape-status");
  status.hidden = !shapeStatus;
  status.textContent = shapeStatus;
  const depsButton = document.getElementById("btn-show-dependencies");
  depsButton.setAttribute("aria-pressed", String(showDependencies));
  depsButton.classList.toggle("on", showDependencies);
  // The whole control is absent when nothing depends on anything: an overlay of
  // an empty set is a button that does nothing, twice.
  depsButton.parentElement.hidden = !project.surfaces.some((s) => shapeCondition(s) !== null);

  // Item 7: `+ Add shape` is Mode A's. A song does not add shapes to the room.
  document.getElementById("btn-add-shape").hidden = modeB;

  if (project.surfaces.length === 0) {
    const empty = document.createElement("li");
    empty.className = "surface-list-empty";
    empty.textContent = "No shapes yet. Add one to get started.";
    list.appendChild(empty);
    return;
  }

  project.surfaces.forEach((shape) => {
    const row = document.createElement("li");
    row.className = "surface-row";
    row.dataset.shapeId = shape.id;
    if (shape.id === selectedShapeId) row.classList.add("selected");
    if (!shape.visible) row.classList.add("hidden-surface");
    row.addEventListener("click", () => selectShape(shape.id));
    // Item 12: hovering a row reads the room the same way selecting does, temporarily.
    row.addEventListener("pointerenter", () => setHoveredShape(shape.id));
    row.addEventListener("pointerleave", () => setHoveredShape(null));

    const head = document.createElement("div");
    head.className = "surface-row-head";

    // **The drag handle, and it is only a handle in Mode A.** Reordering is paint order, which is
    // the room's; a song does not restack the wall.
    if (!modeB) {
      const grip = document.createElement("span");
      grip.className = "surface-grip";
      grip.title = "Drag to reorder (later in the list paints on top)";
      grip.textContent = "⠿";
      grip.draggable = true;
      wireRowDrag(grip, row, shape.id);
      head.appendChild(grip);
    }

    const nameSpan = document.createElement("span");
    nameSpan.className = "surface-name";
    nameSpan.textContent = shape.name;
    head.appendChild(nameSpan);

    if (modeB) {
      const note = document.createElement("span");
      note.className = "surface-note";
      note.textContent = songRowAnnotation(shape, songId);
      if (note.textContent.startsWith("dark")) note.classList.add("is-dark");
      head.appendChild(note);
    }

    const actions = document.createElement("div");
    actions.className = "surface-actions";

    // **The pencil opens the Shape accordion under this row** (item 5). It was a rename prompt; the
    // name is a field inside the accordion now, where the rest of the shape is.
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "icon-btn";
    openBtn.title = openShapeId === shape.id ? "Close" : "Edit this shape";
    openBtn.setAttribute("aria-expanded", String(openShapeId === shape.id));
    openBtn.textContent = "✏️";
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleShapeAccordion(shape.id);
    });
    actions.appendChild(openBtn);

    if (!modeB) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "icon-btn danger";
      deleteBtn.title = "Delete shape";
      deleteBtn.textContent = "\u{1F5D1}\uFE0F"; // trash
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // **Refused before being asked.** Confirming a deletion and then being told
        // it cannot happen is two presses for one refusal.
        const blocked = deleteBlocker(shape.id);
        if (blocked) {
          setShapeStatus(blocked);
          renderControl();
          return;
        }
        if (window.confirm(`Delete "${shape.name}"?`)) removeShape(shape.id);
      });
      actions.appendChild(deleteBtn);
    }

    head.appendChild(actions);
    row.appendChild(head);

    // **THE ACCORDION, UNDER ITS OWN ROW** (item 5). Not a panel further down the sidebar: the
    // thing being edited and the controls that edit it are one block, so there is nothing to
    // scroll between and nothing to lose track of.
    if (openShapeId === shape.id) {
      const panel = document.createElement("div");
      panel.className = "shape-accordion";
      /**
       * **THE ACCORDION SWALLOWS THE ROW'S CLICK, AND THIS IS WHY ITS FIELDS COULD NOT BE TYPED
       * IN** (Jorge, 2026-09-04, walking Pregonero `v0.60.0`).
       *
       * **It was not the drag.** `draggable` is on the grip alone and always was, so a mousedown on
       * a field never reached a drag handler. **It was the row's own `click`**: it calls
       * `selectShape`, which calls `renderControl`, which rebuilds this whole list — **so clicking
       * into a field destroyed the field, mid-click.** Focus had nowhere to land.
       *
       * **Stopped at the accordion, not on each input**, because a per-input fix is a rule nobody
       * will remember for the next control added here: the accordion is the editor and the row is
       * the selector, and the boundary between them is one place. `pointerdown` goes with `click`
       * so a drag-select inside a textarea does not start one either.
       */
      panel.addEventListener("click", (e) => e.stopPropagation());
      panel.addEventListener("pointerdown", (e) => e.stopPropagation());
      buildShapeAccordion(panel, shape, songId);
      row.appendChild(panel);
    }

    list.appendChild(row);
  });
}

/**
 * **Item 11: what this song puts in this shape, and whether it lights.**
 *
 * `Frame · cerdo.mp4` · `Lyrics across · dark — Frame is empty`. **The whole song readable without
 * opening anything**, which is the point: Mode B is a reading screen, not an editing one.
 */
function songRowAnnotation(shape, songId) {
  const asset = songAssetFor(project, songId, shape.id);
  const cond = shapeCondition(shape);
  if (cond) {
    const target = findShape(cond.shape);
    const targetName = target ? target.name : cond.shape;
    const targetFilled = songAssetFor(project, songId, cond.shape) !== null;
    const shows = cond.is === "filled" ? targetFilled : !targetFilled;
    if (!shows) {
      return `dark — ${targetName} is ${targetFilled ? "filled" : "empty"}`;
    }
  }
  if (typeTakesSongAsset(shapeType(shape))) {
    return asset ? asset : "dark — nothing assigned";
  }
  // A lyrics shape needs nothing chosen: the words come from the song file at render time, through
  // Pregonero, and this tool never sees them.
  return shapeType(shape) === "song-lyrics" ? "the song's words" : "";
}

/**
 * **DRAG TO REORDER, ON NATIVE HTML5 DRAG AND DROP. NO DEPENDENCY WAS ADDED** (item 15).
 *
 * @dnd-kit is a React library and could not be used here whatever its state in the sibling repo:
 * **this tool has no framework, no build step and no dependencies at all**, and adding the first
 * one to move a list is a cost with no ceiling — a bundler, a version to track, and a second way
 * this page can fail to load. The platform's own drag events are three handlers and no bytes.
 *
 * The handle is what is draggable, not the row: a row that drags from anywhere fights every other
 * gesture on it, and the grip says where to take hold.
 */
let draggingShapeId = null;

function wireRowDrag(grip, row, shapeId) {
  grip.addEventListener("dragstart", (e) => {
    draggingShapeId = shapeId;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    // Firefox refuses to start a drag without data on the transfer.
    e.dataTransfer.setData("text/plain", shapeId);
  });
  grip.addEventListener("dragend", () => {
    draggingShapeId = null;
    row.classList.remove("dragging");
    renderControl();
  });
  row.addEventListener("dragover", (e) => {
    if (draggingShapeId === null || draggingShapeId === shapeId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    row.classList.add("drop-target");
  });
  row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    row.classList.remove("drop-target");
    if (draggingShapeId === null || draggingShapeId === shapeId) return;
    moveShapeBefore(draggingShapeId, shapeId);
    draggingShapeId = null;
  });
}

/**
 * Moves `id` to sit where `beforeId` is. **Paint order is list order, so this restacks the wall** —
 * which is why it is a real edit and commits.
 *
 * Removed first and re-found second: splicing by an index taken before the removal is off by one
 * whenever the shape moves down the list, and that is a bug that only shows on half the drags.
 */
function moveShapeBefore(id, beforeId) {
  const from = project.surfaces.findIndex((s) => s.id === id);
  if (from === -1 || id === beforeId) return;
  const [moved] = project.surfaces.splice(from, 1);
  const to = project.surfaces.findIndex((s) => s.id === beforeId);
  if (to === -1) project.surfaces.splice(from, 0, moved);
  else project.surfaces.splice(to, 0, moved);
  commitProjectChange();
}

/** Which shape's accordion is open, or null. A view state: never persisted, never in the file. */
let openShapeId = null;

function toggleShapeAccordion(id) {
  openShapeId = openShapeId === id ? null : id;
  if (openShapeId !== null) selectedShapeId = id;
  renderControl();
}

/**
 * **Item 12: the row you are pointing at reads like the one you selected**, briefly. Hover is a
 * question — *which of these overlapping quads is that?* — and the answer is the same drawing the
 * selection gives, so there is one way the canvas answers it.
 */
let hoveredShapeId = null;

function setHoveredShape(id) {
  if (hoveredShapeId === id) return;
  hoveredShapeId = id;
  renderPreview();
}

/** Whether this type takes a per-song file. Only the video shape does; lyrics arrive from the song. */
function typeTakesSongAsset(type) {
  return type === "song-video";
}

/**
 * **ITEM 19: THE PREVIEW TOGGLES — one per condition, derived from what is there.**
 *
 * **The canvas in `All` draws a room that will never exist**: Frame and *Lyrics across* occupy
 * nearly the same rectangle and are mutually exclusive by construction, so both faces are drawn at
 * once. One toggle per condition draws it as it will look in one branch.
 *
 * **Rejected: making the branches Scope entries.** Scope answers *who am I doing this for*, and that
 * governs what may be edited; *with video* is a state of the room, not a who — and they do not
 * scale: two entries for one condition, four for two, eight for three. **One toggle per condition
 * scales linearly.**
 *
 * **A VIEW, NEVER A SETTING.** `previewFilled` is module state, is never persisted and never reaches
 * `visualsDocument()`. The name says so.
 */
const previewFilled = new Map();

function conditionTargetIds() {
  const ids = [];
  project.surfaces.forEach((shape) => {
    const cond = shapeCondition(shape);
    if (cond && !ids.includes(cond.shape)) ids.push(cond.shape);
  });
  return ids;
}

/** Whether a target reads as filled right now — the song's assignment in Mode B, the toggle in A. */
function targetReadsFilled(targetId) {
  const songId = previewSongId();
  if (songId !== null) return songAssetFor(project, songId, targetId) !== null;
  return previewFilled.get(targetId) === true;
}

/** Whether this shape shows on the canvas as drawn. Unconditional shapes always do. */
function shapeShowsInPreview(shape) {
  const cond = shapeCondition(shape);
  if (!cond) return true;
  return cond.is === "filled" ? targetReadsFilled(cond.shape) : !targetReadsFilled(cond.shape);
}

function renderPreviewToggles() {
  const bar = document.getElementById("canvas-preview-toggles");
  const targets = previewSongId() === null ? conditionTargetIds() : [];
  bar.hidden = targets.length === 0;
  bar.innerHTML = "";
  if (targets.length === 0) return;

  const label = document.createElement("span");
  label.className = "preview-toggles-label";
  label.textContent = "Previewing:";
  bar.appendChild(label);

  targets.forEach((id) => {
    const target = findShape(id);
    const filled = targetReadsFilled(id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preview-toggle";
    btn.dataset.target = id;
    btn.setAttribute("aria-pressed", String(filled));
    btn.textContent = `${target ? target.name : id} ${filled ? "filled" : "empty"}`;
    btn.addEventListener("click", () => {
      previewFilled.set(id, !filled);
      renderControl();
    });
    bar.appendChild(btn);
  });
}

/** ITEM 8: the band above the canvas, naming the song and stating the mode. */
function renderCanvasBand() {
  const band = document.getElementById("canvas-band");
  const songId = previewSongId();
  band.hidden = songId === null;
  if (songId === null) return;
  const song = gigSongById(songId);
  document.getElementById("canvas-band-song").textContent = song ? song.title : songId;
  document.getElementById("canvas-band-mode").textContent =
    "Assignment only — what this song puts in each shape. The room is not edited here.";
}

function renderPreview() {
  const svg = document.getElementById("preview-svg");
  svg.innerHTML = "";

  // While the camera's calibration corners are being placed, the preview has
  // exactly one job: the shape outlines would sit on top of the very edge
  // being looked for.
  if (calibratingCamera) {
    renderCameraCalibrationHandles(svg);
    return;
  }

  // One pass over one list, in list order. Polygons are appended in that
  // order, so paint order already makes a later shape sit on top of an
  // earlier one - including a fill shape, which since v8 queues like every
  // other shape instead of being pinned above them. The browser's own
  // hit-testing then picks the topmost polygon under the pointer with no
  // extra bookkeeping.
  // A3: `2 OUTPUT` IS AN ANNOTATED PHOTOGRAPH, not the canvas. Outlines and names, no bodies to
  // click, no handles to drag — there is nothing to edit on a picture of what already happened.
  if (flowStep === FLOW_OUTPUT) {
    renderPhotoOutlines(svg);
    return;
  }

  // **ITEM 19: the canvas draws ONE face of the room, not both.** A conditional shape whose branch
  // is not the one being previewed is not drawn at all — that is the whole of what the toggle buys,
  // and drawing it dimmed instead would be the overlap it exists to remove.
  project.surfaces
    .filter((shape) => shape.visible && shapeShowsInPreview(shape))
    .forEach((shape) => renderShapePreview(svg, shape));

  // **A `show dependencies` TOGGLE, DRAWING EVERY LINK AT ONCE WHEN ASKED.**
  //
  // CAD's constraint-overlay principle. **The anti-pattern is node editors:**
  // permanent wires are right on a dedicated graph surface and wrong on a
  // photograph of a wall with overlapping quads. So the links are on request,
  // and the badge above is what is always there.
  if (showDependencies) renderDependencyLinks(svg);

  // **ASSIGNMENT ONLY WHILE A SONG IS PICKED** (Jorge, 2026-09-04). The handles disappear, because
  // you cannot drag what has no handle — and **never per-song geometry** is the ruling underneath
  // it: a song holding its own coordinates is silently wrong on stage after the room is remapped.
  // The header on the panel says so in words; this is the same statement in the canvas.
  if (previewSongId() !== null) return;

  // Handles for the selected shape go last, so they sit above every shape's
  // body rather than being buried under whatever paints after it.
  const selected = getSelectedShape();
  if (selected) renderShapeHandles(svg, selected);
}

/**
 * **WHERE EACH SHAPE LANDED ON THE ACTUAL WALL.**
 *
 * The capture is taken through the calibration into output space, and shape coordinates are
 * normalised in that same space — so a shape's own outline, drawn at the preview's viewBox scale,
 * sits exactly over its own light in the photograph. **No transform is applied and none is
 * correct**: any correction here would be a second opinion about a calibration that already ran.
 *
 * Outline and name, and nothing else. A fill's margin is not drawn: it is a property of the mask,
 * and this is a picture of what the wall did.
 */
function renderPhotoOutlines(svg) {
  project.surfaces
    .filter((shape) => shape.visible)
    .forEach((shape) => {
      const outline = shapeOutline(shape);
      if (!outline) return;
      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute("points", ringPointsAttr(outline, PREVIEW_W, PREVIEW_H));
      poly.setAttribute("class", "photo-outline");
      svg.appendChild(poly);

      const [nx, ny] = ringCentroidNormalized(outline);
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(nx * PREVIEW_W));
      label.setAttribute("y", String(ny * PREVIEW_H));
      label.setAttribute("class", "photo-outline-name");
      label.textContent = shape.name;
      svg.appendChild(label);
    });
}

/** Whether every dependency link is drawn. A view state, never persisted. */
let showDependencies = false;

function toggleShowDependencies() {
  showDependencies = !showDependencies;
  renderControl();
}

/** One arrow per condition, from the dependent's centroid to the shape it reads. */
function renderDependencyLinks(svg) {
  project.surfaces.forEach((shape) => {
    const cond = shapeCondition(shape);
    if (!cond) return;
    const from = shapeOutline(shape);
    const target = findShape(cond.shape);
    const to = target && shapeOutline(target);
    if (!from || !to) return;
    const [fx, fy] = ringCentroidNormalized(from);
    const [tx, ty] = ringCentroidNormalized(to);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", fx * PREVIEW_W);
    line.setAttribute("y1", fy * PREVIEW_H);
    line.setAttribute("x2", tx * PREVIEW_W);
    line.setAttribute("y2", ty * PREVIEW_H);
    line.setAttribute("class", "preview-dependency-link");
    svg.appendChild(line);
  });
}

function ringPointsAttr(points, w, h) {
  return points.map(([x, y]) => `${x * w},${y * h}`).join(" ");
}

function ringCentroidNormalized(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length];
}

// One shape's body in the preview: the polygon you click to select it and
// drag to move it, plus whatever says at a glance what is inside it.
//
// TWO ELEMENTS, AND THE SAME TWO FOR EVERY SHAPE. There is no fill branch and
// no content branch here any more: a fill shape was drawing itself in its own
// dashed red idiom, left over from when it was a keep-out, and from the hand
// holding the mouse that read as a different kind of object rather than as a
// shape with a colour in it. The only thing allowed to distinguish one shape
// from another is what is INSIDE it, plus the badge that already says so.
//
//   body    - what is inside the shape, and the hit target. A fill paints its
//             own colour here; everything else gets the same faint wash, which
//             is what makes an empty quad clickable over a camera feed.
//   outline - the stroke, and the selected state, and nothing else.
//
// They have to be two elements rather than one: a fill's body already spends
// its single stroke on the margin (see applyMarginStroke), and an element has
// only one stroke to spend.
// Cheap authoring aid: badge each shape with what it is, near its centroid,
// rather than rendering its media in the preview (explicitly out of scope for
// v1 - not worth it). Pattern and fill are missing on purpose: a test pattern
// and a block of colour both already say what they are by being drawn.
const PREVIEW_BADGES = {
  video: "▶ video",
  image: "\u{1F5BC} image",
  text: "T text",
  "song-lyrics": "T lyrics",
  "song-video": "▶ song video",
  "song-intro": "▤ intro",
  "gig-contact": "▣ contact",
};

function renderShapePreview(svg, shape) {
  const outline = shapeOutline(shape);
  if (!outline) return;
  const layer = shapeLayer(shape);
  const type = shapeType(shape);
  const selected = shape.id === selectedShapeId;
  const points = ringPointsAttr(outline, PREVIEW_W, PREVIEW_H);

  // Dark on the wall for the song being previewed, so dark here too - but
  // still drawn, still selectable and still editable. The desk is where you
  // work on the shape this song is not using.
  const dark = shapeIsDarkForPreview(project, shape, previewSongId()) ? " dark-for-song" : "";

  /**
   * **ITEM 12: THE SELECTED SHAPE IS DRAWN CLEARLY AND EVERY OTHER IS DIMMED**, with no labels on
   * the dimmed ones. **This is the fix for overlapping shapes**, which the three-shape default
   * makes unavoidable: Frame and *Lyrics across* share a rectangle by design, and until now the
   * only way to tell which was which was to drag one and see what moved.
   *
   * **Hovering a row does the same, temporarily**, so the list and the canvas answer the same
   * question the same way.
   */
  const focusId = hoveredShapeId ?? selectedShapeId;
  const focused = focusId !== null && shape.id === focusId;
  const muted = focusId !== null && !focused ? " muted" : "";

  const body = document.createElementNS(SVG_NS, "polygon");
  body.setAttribute("points", points);
  body.setAttribute("class", "preview-shape-body" + (selected ? " selected" : "") + dark + muted);
  if (type === "fill") {
    // Painted the way the output paints it - the fill colour, plus a stroke of
    // the same colour carrying the margin - so what gets tuned on screen is
    // what lands on the wall. The preview viewBox is 1600x900 inside a 16/9
    // box, so its user units are square and PREVIEW_H is the right scale for a
    // frame-height fraction.
    const fields = sanitizeFillLayer(layer);
    body.style.fill = fields.color;
    body.style.stroke = fields.color;
    // Held under full strength here and nowhere else: the whole job of the
    // preview is to show the wall you are drawing on, and an opaque black
    // shape over a camera feed hides the thing being traced. `opacity` on the
    // element (rather than fill-opacity) composites fill and stroke as one
    // group, so the margin stroke does not double up over the fill and leave a
    // visible seam at the shape's own outline.
    body.style.opacity = String(0.82 * (layer.opacity ?? 1));
    applyMarginStroke(body, fields.margin, PREVIEW_H);
  }
  // Click-to-select + whole-shape drag in one gesture — and neither in assignment mode, where the
  // canvas is a picture of the room rather than the room being drawn.
  if (previewSongId() === null) {
    body.addEventListener("pointerdown", (e) => startShapeDrag(e, svg, shape));
  }
  svg.appendChild(body);

  /**
   * **ITEM 9: OUTLINES DRAW LOCKED IN MODE B** — thinner and dashed — so a shape you cannot drag
   * does not look identical to one you can. **The handles disappearing then reads as a consequence
   * of something visible** rather than as the app being broken, which is exactly how it read.
   */
  const locked = previewSongId() !== null ? " locked" : "";
  const edge = document.createElementNS(SVG_NS, "polygon");
  edge.setAttribute("points", points);
  edge.setAttribute("class", "preview-shape-outline" + (selected ? " selected" : "") + dark + muted + locked);
  svg.appendChild(edge);

  /**
   * **ITEM 13: THE STAND-IN RENDERS ON THE CANVAS, AND IT WAS NOT RENDERING AT ALL.**
   *
   * Reported before building, as asked: the canvas drew the word `lyrics` on a badge, and the
   * string only ever reached the OUTPUT window. **So `maxSize` and `aspect` — the two controls that
   * exist to be tuned against the worst case — were tuned blind.**
   *
   * **IT IS THE OUTPUT'S OWN RENDERER, NOT A SECOND ONE.** `createTextLayerElement`,
   * `applyTextLayer` and the auto-fit inside it are the same functions the wall runs, mounted in a
   * `foreignObject` over the preview's own viewBox and warped by `frameMatrix3d` exactly as the
   * output warps it. **A second implementation is what this suite has a rule against** — the
   * boundary between the two tools is asserted rather than shared precisely because two
   * implementations drift — and it would drift here in the one place it must not: the size a person
   * tunes against.
   *
   * So the canvas shows the auto-fit shrinking a line that beats the boundary, which is the fact
   * `maxSize` is for.
   */
  const frame = shapeFrame(shape);
  const warp = frame ? frameMatrix3d(frame, PREVIEW_W, PREVIEW_H) : null;
  if (typeTakesTextFormatting(type) && warp) {
    const holder = document.createElementNS(SVG_NS, "foreignObject");
    holder.setAttribute("x", "0");
    holder.setAttribute("y", "0");
    holder.setAttribute("width", String(PREVIEW_W));
    holder.setAttribute("height", String(PREVIEW_H));
    holder.setAttribute("class", "preview-slot-text" + dark + muted);

    const wrapper = document.createElement("div");
    wrapper.className = "surface-wrapper";
    wrapper.style.width = `${UNIT_SIZE}px`;
    wrapper.style.height = `${UNIT_SIZE}px`;
    wrapper.style.transform = warp;

    const box = createTextLayerElement(layer, shape);
    wrapper.appendChild(box);
    holder.appendChild(wrapper);
    svg.appendChild(holder);
    // Applied after mounting: the auto-fit measures, and an unmounted box measures nothing.
    applyTextLayer(box, layer, textLayoutBoxWidth(shape, sanitizeTextLayer(layer), PREVIEW_W, PREVIEW_H));
  }

  /**
   * **ITEM 14: only the focused shape shows its name and its dependency badge**, or every shape
   * when `show dependencies` is on. With the text rendering, permanent labels on every shape are a
   * third layer of overlap on quads that already share a rectangle.
   */
  const labelled = focused || showDependencies;

  if (labelled && type !== "pattern" && type !== "fill") {
    const isAlphaOverlay = type === "image" && /\.webm$/i.test(layer.src || "");
    const [cx, cy] = ringCentroidNormalized(outline);
    const badge = document.createElementNS(SVG_NS, "text");
    badge.setAttribute("x", cx * PREVIEW_W);
    badge.setAttribute("y", cy * PREVIEW_H);
    badge.setAttribute("class", "preview-layer-badge" + dark);
    // The badge says WHAT THIS QUAD IS FOR, which is the useful fact at a
    // glance - and since v9 the type says that directly, so the badge is just
    // the type with a glyph on it. A .webm image layer is still badged as
    // "overlay" rather than "image": it is transport-synced content, not a
    // static picture.
    badge.textContent = isAlphaOverlay ? "▶ overlay" : PREVIEW_BADGES[type] || type;
    svg.appendChild(badge);
  }

  /**
   * **A SMALL PERMANENT BADGE NAMING WHAT THIS SHAPE DEPENDS ON.**
   *
   * Keynote's build-order principle: **an invisible property needs a visible
   * mark, or the failure is *why did that not appear*.** And **a badge naming
   * the dependency beats a mark that only says one exists** — the question at
   * the wall is which shape, not whether.
   *
   * **Unconditional shapes pay nothing**: this branch does not run for them,
   * which is most of them.
   */
  const cond = shapeCondition(shape);
  if (cond && labelled) {
    const target = findShape(cond.shape);
    const [bx, by] = ringCentroidNormalized(outline);
    const mark = document.createElementNS(SVG_NS, "text");
    mark.setAttribute("x", bx * PREVIEW_W);
    mark.setAttribute("y", by * PREVIEW_H + 34);
    mark.setAttribute("class", "preview-condition-badge" + dark);
    mark.textContent = `⇢ ${target ? target.name : cond.shape} ${cond.is}`;
    svg.appendChild(mark);
  }
}

function renderBackdrop() {
  const img = document.getElementById("preview-backdrop");
  if (project.photo && !isCameraMode()) {
    img.src = project.photo;
    img.hidden = false;
  } else {
    img.hidden = true;
    img.removeAttribute("src");
  }
}

// Pointer-drag plumbing shared by every preview gesture: whole-shape drag,
// outline-point drag, edge insert, and camera-calibration corner drag. The
// caller supplies only applyMove(evt), which writes the new geometry into
// `project`.
//
// THE DETAIL THAT MATTERS, and the v2.1 bug (found by hand 2026-08-22): the
// move/up listeners must live on an element that OUTLIVES the gesture.
// Every move calls renderPreview(), which does svg.innerHTML = "" and
// rebuilds every polygon and handle from scratch - so the element that
// received pointerdown is destroyed by the first move it handles. v2.1
// listened on that element. The consequences, all confirmed in Chrome with a
// real mouse:
//
//   - exactly one move-event's worth of travel happened, then the quad froze
//     (later moves land on a freshly built element that has no listeners);
//   - removing the element implicitly released its pointer capture too, so
//     capture could not save it either;
//   - pointerup never reached onUp: no final commit, and the listeners
//     leaked on a detached node;
//   - pressing an UNSELECTED surface was worse still - startSurfaceDrag
//     called renderControl() to move the selection BEFORE attaching its
//     listeners, so they went onto an already-detached node and the surface
//     did not move at all. That is the "dragging does not work" report.
//
// #preview-svg is emptied but never replaced, so it is the one safe host for
// both the capture and the listeners. It is also why this now works under
// synthetic events: even when setPointerCapture refuses an untrusted
// pointerId, moves over the rebuilt children still bubble up to the svg.
//
// This is also why v2.1's headless check passed while nothing moved on
// screen: it dispatched a single synthetic pointermove and asserted on the
// corner numbers, and one move is precisely the amount that did work.
function beginPreviewDrag(e, svg, applyMove) {
  e.preventDefault();
  e.stopPropagation();

  capturePointerSafely(svg, e.pointerId);

  const THROTTLE_MS = 80;
  let lastCommitAt = 0;

  function onMove(evt) {
    if (evt.pointerId !== e.pointerId) return;
    applyMove(evt);
    renderPreview(); // local-only, fast
    const now = Date.now();
    if (now - lastCommitAt >= THROTTLE_MS) {
      lastCommitAt = now;
      saveProject(project);
      broadcastState();
    }
  }

  function onUp(evt) {
    if (evt.pointerId !== e.pointerId) return;
    releasePointerSafely(svg, e.pointerId);
    svg.removeEventListener("pointermove", onMove);
    svg.removeEventListener("pointerup", onUp);
    svg.removeEventListener("pointercancel", onUp);
    commitProjectChange(); // final save+broadcast+render, guarantees no drift
  }

  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onUp);
  svg.addEventListener("pointercancel", onUp);
}

// setPointerCapture/releasePointerCapture require a genuinely "active"
// pointer (per spec) and throw an InvalidPointerId DOMException otherwise -
// which happens for untrusted/synthetic pointerdown events (e.g. the smoke-
// test harness) and, per some browsers, in rarer real-world edge cases too.
// Capture is an optimization (keeps the drag alive if the cursor leaves the
// element mid-gesture) - a failure to acquire/release it must never abort
// the gesture itself (selection, dragging, and the final commit all still
// need to happen via the plain addEventListener fallback).
function capturePointerSafely(el, pointerId) {
  try {
    el.setPointerCapture(pointerId);
  } catch (err) {
    console.warn("Muralista: setPointerCapture failed, continuing without capture.", err);
  }
}

function releasePointerSafely(el, pointerId) {
  try {
    el.releasePointerCapture(pointerId);
  } catch (err) {
    // Already released/never captured - nothing to do.
  }
}

// =========================================================================
// ADOPT BOUNDARIES — REMOVED 2026-09-04
// =========================================================================
// **Jorge: it did not prove its value.** It was never run against a real wall —
// this repo's own notes said so from the day it landed — and the venue session
// that could have proved it did not reach for it.
//
// **WHAT WENT, NAMED RATHER THAN LEFT AS A SILENCE:** the gesture; the
// **two-photograph difference** that kept what got darker between a lit wall and
// a blocked one, with its exposure-gain estimate and its blob finder; the
// **convex hull** and the RDP simplification that turned those pixels into a
// ring of 8-14 points; the threshold knob; and the **countdown** — its value,
// its broadcast, the preview plate and the output plate it raised.
//
// `stageCapture.js` is untouched: the STAGE CAPTURE is a different gesture that
// shares only the calibration, and `2 OUTPUT` is built on it.
//
// **THE WHITE PLATE STAYS, and that is not an oversight.** It belongs to camera
// CALIBRATION — it is raised so the projector's lit rectangle is visible while
// its four corners are placed — and that calibration is what every capture in
// this tool is taken through. Removing it here would have taken the calibration
// with it.

// =========================================================================
// SHAPE EDITING (preview)
// =========================================================================
// Three layers of hit target per selected shape, appended in this order so SVG
// paint order does the disambiguating for free (later = on top):
//
//   1. the filled body      -> select it, and drag the whole shape
//   2. one line per edge    -> insert an outline point there, and pull it out
//                              in the same gesture
//   3. one handle per point -> select that point, and drag it
//
// ONE SET OF CIRCLES. There is no second set and no second thing to drag: the
// numbered quad that used to sit alongside these, showing the content frame,
// is gone. It was the warp's own machinery drawn on the wall - four corners
// because a homography needs four - and having it there made a person choose
// between two overlapping handles for every gesture.
//
// What replaces it is a rule about counts, not a second object. At four points
// the outline IS the frame, so dragging one of these circles warps the content
// live, exactly as it did before shapes had outlines. Past four there is no
// quad to read off the outline, so the frame holds still at the value it was
// pinned at and the extra points clip - and the panel says so, with a button
// that moves it when moving it is what you meant.
//
// EVERY point of the selected shape gets a circle, whatever the shape carries.
// A fill shape used to get none at all, because the old test read "outline
// equals frame" as "there is nothing here to edit"; a person who had just
// drawn one was left looking at a shape with no handles on it.
//
// Every one of them goes through beginPreviewDrag(), for the reason spelled
// out in full on that function: renderPreview() does svg.innerHTML = "" on
// every pointermove, so a listener attached to any of these elements is
// destroyed by the first move it handles. #preview-svg is emptied but never
// replaced, so it is the one safe host. This is the v2.1 drag bug and this
// repo has paid for it twice.

// THE MARGIN IS A STROKE, NOT GEOMETRY.
//
// A polygon offset would need a geometry library, and the obvious cheap
// substitute - scaling the ring outward from its centroid - is wrong exactly
// where it matters. A thin spur (an arm, a mic stand, a leg) has its two
// sides close together but both far from the centroid, so a centroid scale
// moves them apart by a fraction of that distance rather than by the margin:
// the limb gets longer instead of thicker.
//
// Stroking the same polygon in the same colour, with round joins and caps, is
// a TRUE dilation - every point on the outline grows outward by the same
// amount, corners and thin limbs included - and it is one attribute instead
// of a library.
//
// The rule it exists to implement: draw the shape generously larger than the
// shadow, because a performer sways and an exact mask lets light onto the
// face on every lean. That is why the control belongs to FILL shapes and is
// offered nowhere else: "cover generously" is the whole point of a fill, and
// on a shape carrying content growing the outline only reveals more of a
// picture the frame already governs.
//
// `scale` is the pixel height of the frame being drawn into, since margin is
// a fraction of FRAME HEIGHT.
//
// THE DOUBLING IS NOT A FUDGE. `margin` means how much bigger than the
// shadow the shape is drawn - that is the question the slider answers, and
// it is the control that keeps light off a performer's face. SVG centres a
// stroke on its path, so a stroke of width w grows a shape outward by w/2;
// doubling here is what makes the stored number mean the growth rather than
// half of it. That centring is an implementation detail of how the dilation
// is drawn, and it has no business leaking into what the number means to
// whoever is tuning it by eye at a wall.
//
// Set as an inline style rather than a presentation attribute, because a
// stylesheet rule would outrank an attribute and silently win.
function applyMarginStroke(polygon, margin, scale) {
  const width = clampMargin(margin) * 2 * scale;
  polygon.style.strokeWidth = `${width}px`;
}

// Everything draggable on the selected shape. Called once, after every shape's
// body has been painted, so no handle can end up buried under a shape that
// paints later.
/**
 * One point, inserted where the boundary was double-clicked, and left selected so the very next
 * arrow key or drag moves the thing that was just made.
 */
function insertOutlinePointAt(shape, index, event, svg) {
  if (selectedShapeId !== shape.id) selectedShapeId = shape.id;
  // The same insert the drag gesture uses, so a point added either way is the same point.
  insertShapePoint(shape.id, index, svgPointerToNormalized(event, svg));
  selectedPointIndex = index;
  renderControl();
}

function renderShapeHandles(svg, shape) {
  if (!isValidPointRing(shape.outline)) return;
  renderShapeEdgeTargets(svg, shape);
  renderOutlinePointHandles(svg, shape);
}

// One invisible thick line per outline edge. pointer-events:all (set in CSS)
// is required for the same reason the corner handles' hit circle needs it: a
// transparent stroke is not "painted", and SVG's default visiblePainted
// hit-testing would skip it.
function renderShapeEdgeTargets(svg, shape) {
  const points = shape.outline;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % n];

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x1 * PREVIEW_W);
    line.setAttribute("y1", y1 * PREVIEW_H);
    line.setAttribute("x2", x2 * PREVIEW_W);
    line.setAttribute("y2", y2 * PREVIEW_H);
    line.setAttribute("class", "shape-edge-hit");
    // Insert AFTER point i, i.e. at ring index i+1, so the new point lands
    // between the two it was clicked between. The last edge (i = n-1) wraps
    // to point 0, and index n is the correct insert position for it: it
    // still leaves the new point between point n-1 and point 0.
    line.addEventListener("pointerdown", (e) => startShapeEdgeInsert(e, svg, shape, i + 1));
    // **ITEM 16: DOUBLE-CLICK A BOUNDARY TO ADD** (Jorge, 2026-09-04). Dragging an edge already
    // inserts and pulls in one gesture, which is better when you know where the point goes; this
    // is the discoverable half, for when you only know that you want one there. **No menu**, and
    // `buildOutlineControls` — the panel that held `Add point` and `Delete point` — went with it.
    line.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      insertOutlinePointAt(shape, i + 1, e, svg);
    });
    svg.appendChild(line);
  }
}

// The selected shape's outline, one circle per point.
//
// The first four carry the numbers 1-4, and the rest do not. That is not an
// inconsistency to be tidied: those four are the ones the 1-4 keys address and
// the ones the test pattern paints numbers on at the wall, so the label is
// telling you which key moves this circle. An adopted outline carries a dozen
// points and numbering all of them would be a ring of unreadable chrome for no
// gain - past the fourth there is no key to name.
function renderOutlinePointHandles(svg, shape) {
  shape.outline.forEach(([nx, ny], i) => {
    const cx = nx * PREVIEW_W;
    const cy = ny * PREVIEW_H;

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "corner-handle" + (i === selectedPointIndex ? " active" : ""));

    // Larger invisible hit target behind the visible dot. Projector-session
    // use is hurried and imprecise - pointer events bubble from either circle
    // up to the group's single listener below, so this just widens what counts
    // as "on the handle" without changing the drag logic. pointer-events:all
    // (set in CSS) is required because the fill is transparent: SVG's default
    // hit-testing (visiblePainted) only counts painted areas, so an unpainted
    // circle would otherwise be a click-through hole even though it is present
    // in the DOM.
    const hitTarget = document.createElementNS(SVG_NS, "circle");
    hitTarget.setAttribute("cx", cx);
    hitTarget.setAttribute("cy", cy);
    hitTarget.setAttribute("r", 18);
    hitTarget.setAttribute("class", "corner-handle-hit");
    group.appendChild(hitTarget);

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", 10);
    group.appendChild(circle);

    if (i < 4) {
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", cx);
      label.setAttribute("y", cy);
      label.textContent = String(i + 1);
      group.appendChild(label);
    }

    group.addEventListener("pointerdown", (e) => startOutlinePointDrag(e, svg, shape, i));
    svg.appendChild(group);
  });
}

// Drag a whole shape: translate the outline AND the content frame by the same
// delta, so the shape keeps its geometry and its content stays registered on
// it. The clamp is taken over both rings at once - clamping them separately
// would let one stop at the overshoot boundary while the other kept going,
// which is exactly how content slides off its own outline.
//
// Also handles click-to-select in the same gesture. The re-render that
// selection triggers is precisely what used to detach the listeners;
// beginPreviewDrag puts them somewhere a re-render cannot reach.
function startShapeDrag(e, svg, shape) {
  if (selectedShapeId !== shape.id) {
    selectedShapeId = shape.id;
    clearShapeSubselection();
    renderControl(); // full re-render (sidebar highlight, layer panel, handles)
  }

  const originalOutline = shape.outline.map(([x, y]) => [x, y]);
  const frame = shapeFrame(shape);
  const originalFrame = frame ? frame.map(([x, y]) => [x, y]) : null;
  const clampAgainst = originalFrame ? originalOutline.concat(originalFrame) : originalOutline;
  const start = svgPointerToNormalized(e, svg);

  beginPreviewDrag(e, svg, (evt) => {
    const p = svgPointerToNormalized(evt, svg);
    const rawDelta = [p[0] - start[0], p[1] - start[1]];
    const [dx, dy] = clampTranslateDelta(clampAgainst, rawDelta);
    // Both rings get the SAME delta applied to the SAME originals, so a shape
    // whose outline was its frame still has one afterwards, to the bit.
    shape.outline = originalOutline.map(([x, y]) => [x + dx, y + dy]);
    if (originalFrame) shape.corners = originalFrame.map(([x, y]) => [x + dx, y + dy]);
  });
}

// Drag one outline point. THE one drag in this tool now: every shape type
// reaches it, and since the frame stopped being a second draggable object it
// is also how a four-point shape is warped. Renders locally every pointermove
// for immediate visual feedback (both in the preview and, throttled, on the
// live output), but only saves+broadcasts at most every ~80ms plus once on
// release - the same "render fast, commit throttled" split
// commitProjectChange() was designed for.
//
// Nothing here writes `corners`, and nothing needs to: at four points
// shapeFrame() reads the outline directly, so the warp follows the hand with
// no second copy to keep in step.
//
// The listeners go on BEFORE the re-render, not after. beginPreviewDrag hosts
// them on #preview-svg, which a re-render empties but never replaces, so
// either order survives - but attaching first means the gesture is live before
// anything can touch the DOM under it, which is the ordering that has never
// gone wrong.
function startOutlinePointDrag(e, svg, shape, index) {
  if (selectedShapeId !== shape.id) selectedShapeId = shape.id;
  setSelectedPointIndex(index);

  beginPreviewDrag(e, svg, (evt) => {
    const [nx, ny] = svgPointerToNormalized(evt, svg);
    shape.outline[index] = [clampCoord(nx), clampCoord(ny)];
  });

  renderControl(); // the panel's point read-out and the handle's highlight
}

// Clicking an edge inserts a point there and immediately begins dragging it,
// so "add a point and pull it out" is one gesture rather than three. The
// insert commits first, and commitProjectChange() -> renderPreview() rebuilds
// every child of #preview-svg - which is exactly why the drag listeners must
// live on the svg and not on the line that was clicked. The closure below
// holds the shape OBJECT, which the rebuild does not replace (the mutators
// edit project.surfaces in place), so the index stays valid across it.
function startShapeEdgeInsert(e, svg, shape, index) {
  const point = svgPointerToNormalized(e, svg);
  if (selectedShapeId !== shape.id) selectedShapeId = shape.id;
  insertShapePoint(shape.id, index, point);

  beginPreviewDrag(e, svg, (evt) => {
    const [nx, ny] = svgPointerToNormalized(evt, svg);
    shape.outline[index] = [clampCoord(nx), clampCoord(ny)];
  });
}

// =========================================================================
// CAMERA BACKDROP (control-only)
// =========================================================================
// An optional live webcam feed, from a camera mounted beside the projector
// lens, shown under the surface outlines in place of the static photo.
// Dragging a quad then shows the real wall updating underneath it, instead
// of a photo that went stale the moment anything in the room moved.
//
// Same rule as project.photo, and for the same reason: this is an authoring
// aid and never reaches the output window. The <video> lives inside
// control-root only and the MediaStream is never serialized.
// project.cameraDeviceId and project.cameraQuad do ride along in the
// broadcast state (project.photo already does), but nothing on the output
// side reads them - see handleOutputMessage / renderOutput.
//
// Rectification is the surface warp run backwards, which is why it needs no
// new rendering machinery. A surface maps a square of content ONTO a quad in
// output space; here we map a quad in CAMERA space - the projector's lit
// rectangle, marked by hand during calibration - onto the whole stage. Same
// computeHomography, same matrix3d. Once cameraQuad is placed, a mark on the
// wall sits at the same spot in the preview as it does in the projected
// frame.
//
// ACCURACY, and its one honest limit. After calibration the mapping is exact
// for anything on the wall plane - a plane-to-plane map is what a homography
// IS. Anything standing OUT from the wall (a performer, a speaker stack, a
// pillar) appears displaced, by an amount that grows with its distance from
// the wall, and no fixed correction removes this: the camera and the
// projector do not stand in the same place, so they genuinely disagree about
// where such a thing is. For a performer keep-out the reliable method is to
// trace the performer's projected SHADOW rather than the performer. The
// shadow is by definition the exact set of blocked projector pixels - the
// projector drew it - and it lands on the wall plane, so it maps exactly and
// no camera-to-lens offset needs measuring. Also documented in README
// ("Limits") and project-context.md.

let cameraStream = null;

// Calibration mode: the feed is shown RAW (untransformed, full strength)
// with four draggable handles over it, to be placed on the corners of the
// projector's lit rectangle. Control-local UI state, never persisted.
let calibratingCamera = false;

// A generous starting rectangle when calibration begins with nothing stored -
// visibly not the frame edge, so it reads as "drag me" rather than "already
// correct".
const DEFAULT_CAMERA_QUAD = [
  [0.2, 0.2],
  [0.8, 0.2],
  [0.8, 0.8],
  [0.2, 0.8],
];

function isCameraMode() {
  return project.backdropMode === "camera";
}

function isCameraEnabled() {
  return cameraStream != null;
}

// =========================================================================
// WHEN THE REMEMBERED CAMERA IS NOT THERE ANY MORE
// =========================================================================
// A DEVICE ID IS NOT A NAME. Chrome mints per-origin device ids and rotates
// them on a replug, a profile change or, in practice, a restart - so
// project.cameraDeviceId, which exists so a room comes back pointing at the
// same webcam, is a promise the browser does not keep.
//
// Asking for a rotated id with `deviceId: { exact: ... }` throws
// OverconstrainedError, and until v1.2.1 that was a DEAD END rather than a
// setback: the device list was only populated AFTER a successful
// getUserMedia, so the dropdown still read "Enable the camera to list inputs"
// and offered nothing. One stale string locked a person out of the camera
// entirely, and the only way back was editing localStorage by hand. Jorge did
// exactly that, at a wall, twice.
//
// Two changes, and the second is the one that makes the first unnecessary:
//
//   1. A request for a specific camera that comes back "no such camera" is
//      retried as "any camera", and the substitution is SAID OUT LOUD.
//   2. The device list is populated whether or not a stream is running, so
//      there is always a way forward from the menu itself.
//
// A WHITELIST, NOT A BLACKLIST. Falling back is only correct when the failure
// means "that particular camera is not there" - a different device is then a
// real remedy. It is wrong for "you may not have the camera" and for "the
// camera is busy", where quietly opening a DIFFERENT one hides a problem that
// has its own fix, and it is wrong for anything unrecognised, because an error
// nobody has thought about is not one to paper over. So the recovery is opted
// into by name, and everything else is reported.
const CAMERA_MISSING_ERRORS = ["OverconstrainedError", "NotFoundError"];

// What each failure actually means to somebody standing at a wall in the dark,
// and what they can do about it. The error NAME is printed alongside, so "not
// found", "denied" and "in use" are three visibly different things rather than
// three sentences that all begin "Camera unavailable".
const CAMERA_ERROR_HELP = {
  NotAllowedError: "Chrome is blocking the camera for this page. Click the camera icon at the right of the address bar, allow it, and try again.",
  NotReadableError: "Another application has the camera open. Chrome cannot share a webcam with a video call - close the other app and try again.",
  NotFoundError: "No camera is attached.",
  OverconstrainedError: "No attached camera matched what was asked for.",
  AbortError: "The camera was taken away while it was opening.",
  SecurityError: "This page is not allowed to use a camera here.",
};

function describeCameraError(err) {
  const name = (err && err.name) || "Error";
  const help = CAMERA_ERROR_HELP[name] || (err && err.message) || String(err);
  return `Camera unavailable — ${name}\n${help}`;
}

function setCameraStatus(text, kind) {
  const el = document.getElementById("camera-status");
  if (!el) return;
  el.textContent = text || "";
  // A substitution is news, not a fault: it says the tool recovered. Only a
  // real failure gets the danger colour, or the colour stops meaning anything.
  el.classList.toggle("note", kind === "note");
}

function setBackdropMode(mode) {
  // **`stage` is a photo whose source is the gig**, and everything downstream
  // treats it as one: `isCameraMode()` is false, `renderBackdrop` draws
  // `project.photo`, and Clear and Choose photo both still work on it.
  const stage = mode === "stage" && stageCapturePresent;
  project.backdropMode = mode === "camera" ? "camera" : stage ? "stage" : "photo";
  // Coming into camera mode, refresh the menu before anybody looks at it.
  // Un-awaited: it re-renders itself when it lands, and a dropdown is not
  // worth holding up a mode switch for.
  if (isCameraMode()) refreshCameraDevices();
  if (!isCameraMode()) {
    // Leaving camera mode gives the webcam back: the recording light going
    // out is the only honest signal that nothing is watching the room.
    calibratingCamera = false;
    disableCamera();
  }
  commitProjectChange();
  // Un-awaited for the same reason the camera menu is: the load re-renders
  // itself when it lands, and it goes through the photo path from there.
  if (stage) void loadStageCaptureBackdrop();
}

function setCameraDeviceId(deviceId) {
  project.cameraDeviceId = deviceId || null;
  commitProjectChange();
  if (isCameraEnabled()) enableCamera(); // re-open on the newly chosen input
}

function setCameraQuad(quad) {
  project.cameraQuad = quad;
  commitProjectChange();
}

function toggleCamera() {
  if (isCameraEnabled()) {
    calibratingCamera = false; // nothing left to calibrate against
    disableCamera();
    renderControl();
  } else {
    enableCamera();
  }
}

// `audio: false` throughout - a backdrop is picture only, and nothing here
// listens to the room.
function openCameraStream(video) {
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

async function enableCamera() {
  setCameraStatus("");
  // Stop any existing stream first - switching device while the old one is
  // still open can leave two tracks live on the same camera.
  stopCameraTracks();

  const wanted = project.cameraDeviceId;
  let substituted = false;

  try {
    if (wanted) {
      try {
        cameraStream = await openCameraStream({ deviceId: { exact: wanted } });
      } catch (err) {
        // The whole point of this release. Anything not on the list is a
        // failure with its own remedy and is reported as itself.
        if (!CAMERA_MISSING_ERRORS.includes(err && err.name)) throw err;
        console.warn("Muralista: the remembered camera is gone; taking any camera.", err);
        cameraStream = await openCameraStream(true);
        substituted = true;
      }
    } else {
      cameraStream = await openCameraStream(true);
    }
  } catch (err) {
    cameraStream = null;
    setCameraStatus(describeCameraError(err), "error");
    console.warn("Muralista: camera getUserMedia failed.", err);
    // Even a refused camera should leave the menu usable: enumerateDevices
    // works without a stream, and a person who cannot open THIS camera may
    // still be able to open another one.
    await populateCameraDeviceList();
    renderControl();
    return;
  }

  document.getElementById("preview-camera").srcObject = cameraStream;

  // Labels are blank until a camera permission has been granted, so this is
  // the moment the list is worth its place - and it is also where
  // project.cameraDeviceId is brought back into line with the camera actually
  // open, which is what stops the stale id being stale a second time.
  await populateCameraDeviceList();

  if (substituted) {
    const live = cameraStream.getVideoTracks()[0];
    const label = (live && live.label) || "the default camera";
    setCameraStatus(`Remembered camera not found, using ${label}. The mapping now remembers this one.`, "note");
  }
  renderControl();
}

// Re-list, then re-render so the menu's enabled state follows. Used from the
// places that change what is plugged in or what is permitted, rather than from
// renderControl - enumerateDevices is async and renderControl runs on every
// arrow-key nudge.
async function refreshCameraDevices() {
  await populateCameraDeviceList();
  renderControl();
}

function stopCameraTracks() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
}

function disableCamera() {
  stopCameraTracks();
  const video = document.getElementById("preview-camera");
  if (video) video.srcObject = null;
  setCameraStatus(""); // clears the note class with it
}

// The cameras this machine last reported, so renderBackdropControls can decide
// whether the menu is worth offering without re-enumerating on every nudge.
let cameraDevices = [];

// RUNS WITHOUT A STREAM, and that is the belt to the fallback's braces.
// enumerateDevices() needs no permission and opens nothing - without one it
// returns entries with blank labels and blank ids, which is a menu that says
// "there is a camera here" and nothing more. That is worth having: it is the
// difference between a dropdown offering a way forward and a dropdown reading
// "Enable the camera to list inputs" beside a camera that will not enable.
async function populateCameraDeviceList() {
  const select = document.getElementById("select-camera-device");
  let cams = [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    cams = devices.filter((d) => d.kind === "videoinput");
  } catch (err) {
    console.warn("Muralista: could not list cameras.", err);
  }
  cameraDevices = cams;

  select.innerHTML = "";
  if (cams.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No cameras found";
    select.appendChild(opt);
    return;
  }

  cams.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    // A blank label means "permission has not been granted yet", not "no
    // camera". Numbering them is the honest thing to show: enough to pick one
    // and find out what it is.
    opt.textContent = d.label || `Camera ${i + 1}`;
    select.appendChild(opt);
  });

  // Reflect what is actually open. If the stored deviceId is gone (the
  // webcam was unplugged, or this is another machine), fall back to whatever
  // getUserMedia handed us rather than showing a stale selection - and write
  // that back, so the next Enable asks for a camera that exists.
  const live = cameraStream && cameraStream.getVideoTracks()[0];
  const liveId = live && live.getSettings().deviceId;
  const wanted = cams.some((d) => d.deviceId === project.cameraDeviceId) ? project.cameraDeviceId : liveId;
  if (wanted) select.value = wanted;
  if (wanted && wanted !== project.cameraDeviceId) {
    project.cameraDeviceId = wanted;
    commitProjectChange();
  }
}

// Applies project.cameraQuad to the <video> as a matrix3d, so the marked
// rectangle fills the stage. Recomputed whenever the stage's pixel size
// changes (see the ResizeObserver in initControl): the homography is built
// in real pixels, so it does not survive a resize on its own.
function applyCameraTransform(video) {
  const box = video.parentElement;
  const w = box.clientWidth;
  const h = box.clientHeight;

  if (calibratingCamera || !isValidQuad(project.cameraQuad) || w === 0 || h === 0) {
    video.style.transform = ""; // raw feed: what the camera sees, unmodified
    return;
  }

  // object-fit:fill makes the camera frame cover the element box exactly, so
  // normalized camera space scales straight into element pixels.
  const srcCorners = project.cameraQuad.map(([nx, ny]) => [nx * w, ny * h]);
  const dstCorners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const H = computeHomography(srcCorners, dstCorners);
  video.style.transform = H ? homographyToMatrix3dString(H) : ""; // null = degenerate quad
}

function renderCamera() {
  const video = document.getElementById("preview-camera");
  const show = isCameraMode() && isCameraEnabled();
  video.hidden = !show;
  video.classList.toggle("calibrating", calibratingCamera);
  if (show) applyCameraTransform(video);
}

// Sidebar backdrop controls, rebuilt from state on every render so the
// buttons can never disagree with what the preview is actually doing.
function renderBackdropControls() {
  // ITEM 7: **Mode B loses Backdrop.** A song does not choose what is behind the room, and the
  // fold is one more thing to read on a screen whose job in Mode B is to be read.
  document.getElementById("backdrop-fold").hidden = previewSongId() !== null;
  const camera = isCameraMode();
  const select = document.getElementById("select-backdrop-mode");
  // **Offered only when the gig's folder holds one.** Hiding the option rather
  // than disabling it: a disabled row in a dropdown you have to open to see is
  // not the same kind of thing as a disabled button on the screen, and there is
  // no action to explain — the capture is either there or it is not.
  const stageOption = select.querySelector('option[value="stage"]');
  if (stageOption) stageOption.hidden = !stageCapturePresent;
  select.value = project.backdropMode;
  document.getElementById("backdrop-photo-controls").hidden = camera;
  document.getElementById("backdrop-camera-controls").hidden = !camera;

  document.getElementById("btn-camera-toggle").textContent = isCameraEnabled() ? "Disable camera" : "Enable camera";
  // Live whenever there is anything to pick, running stream or not. Picking a
  // camera while the feed is off simply remembers it for the next Enable,
  // which is the way out of a remembered id that no longer resolves.
  document.getElementById("select-camera-device").disabled = cameraDevices.length === 0;

  const calBtn = document.getElementById("btn-camera-calibrate");
  calBtn.textContent = calibratingCamera ? "Done" : isValidQuad(project.cameraQuad) ? "Recalibrate\u2026" : "Calibrate\u2026";
  calBtn.disabled = !isCameraEnabled();
  document.getElementById("btn-camera-calibrate-clear").disabled = !isValidQuad(project.cameraQuad) || calibratingCamera;

  const whiteBtn = document.getElementById("btn-white-field");
  whiteBtn.textContent = whiteFieldOn ? "Hide white" : "Show white";
  whiteBtn.classList.toggle("active", whiteFieldOn);
}

function toggleCameraCalibration() {
  if (!calibratingCamera && !isValidQuad(project.cameraQuad)) {
    project.cameraQuad = DEFAULT_CAMERA_QUAD.map(([x, y]) => [x, y]);
    saveProject(project);
  }
  calibratingCamera = !calibratingCamera;
  renderControl();
}

function clearCameraQuad() {
  calibratingCamera = false;
  setCameraQuad(null);
}

// Calibration handles, drawn instead of the surface outlines while
// calibrating. They live in normalized camera space, and the feed is
// untransformed while placing them, so preview space and camera space are
// the same space here - no conversion needed beyond the viewBox scale.
function renderCameraCalibrationHandles(svg) {
  const quad = project.cameraQuad;
  if (!isValidQuad(quad)) return;

  const outline = document.createElementNS(SVG_NS, "polygon");
  outline.setAttribute("points", quad.map(([x, y]) => `${x * PREVIEW_W},${y * PREVIEW_H}`).join(" "));
  outline.setAttribute("class", "camera-quad-outline");
  svg.appendChild(outline);

  quad.forEach(([nx, ny], i) => {
    const cx = nx * PREVIEW_W;
    const cy = ny * PREVIEW_H;

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "corner-handle camera");

    const hitTarget = document.createElementNS(SVG_NS, "circle");
    hitTarget.setAttribute("cx", cx);
    hitTarget.setAttribute("cy", cy);
    hitTarget.setAttribute("r", 18);
    hitTarget.setAttribute("class", "corner-handle-hit");
    group.appendChild(hitTarget);

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", 10);
    group.appendChild(circle);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", cx);
    label.setAttribute("y", cy);
    label.textContent = String(i + 1);
    group.appendChild(label);

    group.addEventListener("pointerdown", (e) =>
      beginPreviewDrag(e, svg, (evt) => {
        const [x, y] = svgPointerToNormalized(evt, svg);
        project.cameraQuad[i] = [clampCoord(x), clampCoord(y)];
      })
    );
    svg.appendChild(group);
  });
}

// =========================================================================
// SHAPE PANEL (sidebar, selected shape)
// =========================================================================
// Everything about the selected shape, in one panel, because there is one kind
// of shape now. Top to bottom: what is inside it (the type and that type's own
// fields), then how strongly it paints, then the outline every shape has, then
// the capture that can replace that outline.
//
// Rebuilds the panel's DOM only when its "key" (shape id + layer type +
// connected folder) changes - typing in the src field or dragging a slider
// fires commitProjectChange() on every keystroke/input, which would otherwise
// recreate the input mid-edit and lose focus/cursor position. Same-key
// re-renders instead just refresh field values, skipping whichever field
// currently has focus.


/**
 * **`renderLayerPanel` WENT WITH THE `Shape` PANEL** (item 5, 2026-09-04). The controls it built
 * are the accordion's now, and the accordion is built by `renderShapeList` under the row it is
 * about — so there is no key to keep in step and no panel to scroll to. `updateLayerPanelValues`
 * survives for the fields that refresh without a rebuild.
 */

/**
 * Which types this shape may become. **Song-aware types need a gig**, because a shape that says it
 * carries a song's words on a tool with no songs is a promise about nothing — except the one the
 * shape already is, which stays offered so a type is never silently unpickable.
 */
function offeredShapeTypes(shape) {
  if (gigConnected()) return SHAPE_TYPES;
  const current = shapeType(shape);
  return SHAPE_TYPES.filter((type) => !isSongAwareType(type) || type === current);
}

function panelDivider(container, title) {
  const rule = document.createElement("div");
  rule.className = "panel-divider";
  rule.textContent = title || "";
  container.appendChild(rule);
}

/**
 * **THE RULE IS AUTHORED ON THE SHAPE IT AFFECTS, AS A SENTENCE.**
 *
 * `Show only when [ Frame ▾ ] is [ empty ▾ ]`. Form builders are the pattern:
 * **sentences read correctly to non-technical authors where field / operator /
 * value grids do not.** Their other lesson is the ceiling — past roughly ten
 * rules a per-element pattern becomes invisible and needs an overview — and at
 * three shapes it does not.
 *
 * **UNCONDITIONAL SHAPES PAY NOTHING**: one closed select reading `Always`, and
 * no second control until there is something to say.
 *
 * **A shape something else depends on cannot take a condition**, and the row
 * says so rather than vanishing: that is the one-level rule, and a control that
 * disappeared would leave the person guessing why.
 */
function buildConditionRow(container, shape) {
  const targets = conditionTargets(shape);
  const dependents = dependentsOf(shape.id);
  const cond = shapeCondition(shape);

  const row = document.createElement("div");
  row.className = "layer-field condition-row";

  const label = document.createElement("label");
  label.textContent = "Show";
  row.appendChild(label);

  const sentence = document.createElement("div");
  sentence.className = "condition-sentence";

  const whichSelect = document.createElement("select");
  whichSelect.id = "condition-shape-select";
  const always = document.createElement("option");
  always.value = "";
  always.textContent = "always";
  whichSelect.appendChild(always);
  targets.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `only when ${s.name}`;
    whichSelect.appendChild(opt);
  });
  whichSelect.value = cond ? cond.shape : "";
  whichSelect.disabled = dependents.length > 0;
  whichSelect.addEventListener("change", () =>
    setShapeCondition(shape.id, whichSelect.value, cond ? cond.is : "filled")
  );
  sentence.appendChild(whichSelect);

  if (cond) {
    const is = document.createElement("span");
    is.className = "condition-word";
    is.textContent = "is";
    sentence.appendChild(is);

    const stateSelect = document.createElement("select");
    stateSelect.id = "condition-state-select";
    CONDITION_STATES.forEach((state) => {
      const opt = document.createElement("option");
      opt.value = state;
      opt.textContent = state;
      stateSelect.appendChild(opt);
    });
    stateSelect.value = cond.is;
    stateSelect.addEventListener("change", () =>
      setShapeCondition(shape.id, cond.shape, stateSelect.value)
    );
    sentence.appendChild(stateSelect);
  }

  row.appendChild(sentence);
  container.appendChild(row);

  if (dependents.length > 0) {
    const why = document.createElement("p");
    why.className = "layer-hint";
    why.id = "condition-blocked";
    why.textContent = `${dependents.map((s) => s.name).join(", ")} ${
      dependents.length === 1 ? "depends" : "depend"
    } on this shape, so it cannot depend on another.`;
    container.appendChild(why);
  }
}

/**
 * **THE SHAPE ACCORDION: Type · Content · Visibility · Format** (item 5, Jorge, 2026-09-04).
 *
 * It opens **under the row it is about**, not in a panel further down the sidebar — so the thing
 * being edited and the controls that edit it are one block, with nothing to scroll between.
 *
 * **MODE B KEEPS TYPE AND CONTENT AND LOSES THE REST** (item 7). Type is shown, not changeable.
 * **Visibility is Mode A only, because a condition belongs to the shape and not to a song** — and
 * that also kills a second mechanism, since assigning nothing is already how a shape goes dark for
 * one song. Format and all outline editing go with it.
 */
function buildShapeAccordion(container, shape, songId) {
  const modeB = songId !== null;
  const layer = shape.layer || {};

  // The name lives here now. The pencil used to open a `window.prompt`, which is a modal for one
  // field on a screen that has a place for fields.
  if (!modeB) {
    const nameRow = document.createElement("div");
    nameRow.className = "layer-field";
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = shape.name;
    nameInput.addEventListener("change", () => renameShape(shape.id, nameInput.value));
    nameRow.append(nameLabel, nameInput);
    container.appendChild(nameRow);
  }

  // ---- TYPE ----
  panelDivider(container, "Type");
  const typeRow = document.createElement("div");
  typeRow.className = "layer-field";
  if (modeB) {
    // **Shown, not changeable.** What a shape is for belongs to the room; a song only fills it.
    const said = document.createElement("span");
    said.className = "layer-static-value";
    said.textContent = shapeType(shape);
    typeRow.appendChild(said);
  } else {
    const typeSelect = document.createElement("select");
    typeSelect.id = "layer-type-select";
    offeredShapeTypes(shape).forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      typeSelect.appendChild(opt);
    });
    typeSelect.value = shapeType(shape);
    typeSelect.addEventListener("change", () => setLayerType(shape.id, typeSelect.value));
    typeRow.appendChild(typeSelect);
  }
  container.appendChild(typeRow);

  // ---- CONTENT ----
  buildContentSection(container, shape, layer, songId);

  if (modeB) return;

  // ---- VISIBILITY ----
  panelDivider(container, "Visibility");
  buildConditionRow(container, shape);
  buildOpacityRow(container, shape, layer);

  // ---- FORMAT ----
  if (typeTakesTextFormatting(layer.type) || layer.type === "fill") {
    panelDivider(container, "Format");
    if (typeTakesTextFormatting(layer.type)) buildTextLayerControls(container, shape, layer);
    if (layer.type === "fill") buildFillLayerControls(container, shape, layer);
  }

  updateLayerPanelValues(container, shape, layer);
}

/**
 * **CONTENT, AND IT IS WHAT MAKES SCOPE MEAN ONE THING THROUGHOUT** (item 6).
 *
 * **In `All` it is the file this shape holds for the whole gig** — a contact QR, a logo, a line of
 * text. **In a song it is what that song puts there.** One section, two scopes, and the difference
 * is the scope rather than a different place to look.
 *
 * **It appears only for types that take content, and says why when it does not** — the rule this
 * repo has for a control with an unmet precondition, applied to a section: a heading with nothing
 * under it reads as something failing to load.
 */
function buildContentSection(container, shape, layer, songId) {
  panelDivider(container, "Content");
  const type = shapeType(shape);
  const modeB = songId !== null;

  const say = (text) => {
    const p = document.createElement("p");
    p.className = "layer-hint";
    p.textContent = text;
    container.appendChild(p);
  };

  if (modeB) {
    if (typeTakesSongAsset(type)) {
      container.appendChild(buildSongAssetRow(shape, songId));
      return;
    }
    if (type === "song-lyrics") return say("The song's own words, at render time. Nothing to choose.");
    if (type === "song-intro") return say("The song's title and tagline, at render time.");
    return say("This shape holds the same thing for every song. Set it in All.");
  }

  if (type === "video" || type === "image") return buildMediaSourceControls(container, shape, layer);
  if (type === "gig-contact") return buildContactLayerControls(container, shape, layer);
  if (type === "text") {
    // The string itself is content; how it is SET is Format.
    return buildTextStringRow(container, shape, layer);
  }
  if (type === "song-lyrics") {
    // **The stand-in is content on this screen even though it never ships**, because tuning is
    // done against it and the field has to be where the tuning is.
    buildTextStringRow(container, shape, layer);
    return
  }
  if (type === "song-video") return say("What plays here is per song. Pick a song in Scope to set it.");
  if (type === "song-intro") return say("The playing song's title and tagline. A locked template.");
  say("This type holds no content of its own.");
}

function buildOpacityRow(container, shape, layer) {
  const opacityRow = document.createElement("div");
  opacityRow.className = "layer-field";
  const opacityLabel = document.createElement("label");
  opacityLabel.textContent = "Opacity";
  opacityLabel.setAttribute("for", "layer-opacity-input");
  const opacityInput = document.createElement("input");
  opacityInput.type = "range";
  opacityInput.id = "layer-opacity-input";
  opacityInput.min = "0";
  opacityInput.max = "1";
  opacityInput.step = "0.01";
  opacityInput.value = String(layer.opacity ?? 1);
  const opacityValue = document.createElement("span");
  opacityValue.id = "layer-opacity-value";
  opacityValue.className = "layer-opacity-value";
  opacityValue.textContent = Number(layer.opacity ?? 1).toFixed(2);
  opacityInput.addEventListener("input", () => {
    opacityValue.textContent = Number(opacityInput.value).toFixed(2);
    setLayerField(shape.id, "opacity", Number(opacityInput.value));
  });
  opacityRow.append(opacityLabel, opacityInput, opacityValue);
  container.appendChild(opacityRow);
}

// Video / image: src name field + file-pick convenience. Lifted out of
// the accordion so the one call site there is the only thing that decides
// whether a file is even a concept for this layer.
function buildMediaSourceControls(container, shape, layer) {
  // With a folder connected, a name is looked up INSIDE it and the old label
  // is simply false. The field itself is unchanged either way - it has always
  // held a name, and that is exactly what still gets saved to the mapping.
  const folderLabel = mediaFolderState === "granted" ? mediaFolderLabel() : null;

  const srcRow = document.createElement("div");
  srcRow.className = "layer-field";
  const srcLabel = document.createElement("label");
  srcLabel.textContent = folderLabel ? `Source (name inside ${folderLabel}/)` : "Source (relative to mapper/media/)";
  srcLabel.setAttribute("for", "layer-src-input");
  const srcInput = document.createElement("input");
  srcInput.type = "text";
  srcInput.id = "layer-src-input";
  // "e.g." prefix matters: a bare filename placeholder reads as an actual
  // prefilled value, and users assume the video is already linked.
  srcInput.placeholder = folderLabel
    ? layer.type === "video"
      ? "e.g. cerdo.mp4"
      : "e.g. character.png"
    : layer.type === "video"
      ? "e.g. media/cerdo.mp4"
      : "e.g. media/character.png";
  srcInput.value = layer.src || "";
  // 'change' (blur/Enter), not 'input': the reconciling output render
  // recreates the video/image element whenever layer.src changes, so
  // committing on every keystroke would churn through a fetch for every
  // partial path typed (e.g. "media/cer...") instead of just the final one.
  srcInput.addEventListener("change", () => setLayerField(shape.id, "src", srcInput.value));
  srcRow.append(srcLabel, srcInput);
  container.appendChild(srcRow);

  const fileRow = document.createElement("div");
  fileRow.className = "layer-field";
  const fileBtn = document.createElement("button");
  fileBtn.type = "button";
  fileBtn.id = "layer-pick-file";
  fileBtn.textContent = "Pick file…";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.hidden = true;
  fileInput.accept = layer.type === "video" ? "video/*" : "image/*,.webm";
  fileBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) {
      // An <input type=file> hands over a name and no path, so this has
      // always been a convenience that fills in a guess. With a folder
      // connected the right guess is the bare name - prefixing "media/"
      // would send the lookup into a subfolder that probably is not there.
      const guess = folderLabel ? file.name : `media/${file.name}`;
      srcInput.value = guess;
      setLayerField(shape.id, "src", guess);
    }
    fileInput.value = "";
  });
  fileRow.append(fileBtn, fileInput);
  container.appendChild(fileRow);
}

// The fill layer's own controls: a colour, and the margin that grows the shape
// outward. The margin lives HERE and nowhere else - see applyMarginStroke for
// why it belongs to fills and would only confuse on a shape carrying content.
function buildFillLayerControls(container, shape, layer) {
  const fields = sanitizeFillLayer(layer);

  const colorRow = document.createElement("div");
  colorRow.className = "layer-field";
  const colorLabel = document.createElement("label");
  colorLabel.textContent = "Colour";
  colorLabel.setAttribute("for", "layer-fill-color-input");
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.id = "layer-fill-color-input";
  colorInput.value = fields.color;
  colorInput.addEventListener("input", () => setLayerField(shape.id, "color", colorInput.value));
  colorRow.append(colorLabel, colorInput);
  container.appendChild(colorRow);


  const marginRow = document.createElement("div");
  marginRow.className = "layer-field";
  const marginLabel = document.createElement("label");
  marginLabel.textContent = "Margin";
  marginLabel.setAttribute("for", "layer-fill-margin-input");
  const marginInput = document.createElement("input");
  marginInput.type = "range";
  marginInput.id = "layer-fill-margin-input";
  marginInput.min = "0";
  marginInput.max = String(FILL_MARGIN_MAX);
  marginInput.step = "0.005";
  marginInput.value = String(fields.margin);
  const marginValue = document.createElement("span");
  marginValue.id = "layer-fill-margin-value";
  marginValue.className = "layer-opacity-value";
  marginValue.textContent = fields.margin.toFixed(3);
  marginInput.addEventListener("input", () => {
    marginValue.textContent = Number(marginInput.value).toFixed(3);
    setLayerField(shape.id, "margin", Number(marginInput.value));
  });
  marginRow.append(marginLabel, marginInput, marginValue);
  container.appendChild(marginRow);

}

/**
 * **`buildOutlineControls` WENT: OUTLINE POINTS ARE EDITED ON THE SHAPE** (item 16, 2026-09-04).
 *
 * It was a panel row saying `point 3 of 7` with `Add point` and `Delete point` beside it — **a menu
 * for a gesture**, and one that made you look away from the wall to use. Double-click a boundary to
 * add, drag a corner to move, select one and press Delete to remove. All three were already on the
 * canvas or the keyboard except the first.
 */


function formatIcon(paths) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  paths.forEach((d) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  });
  return svg;
}

const FORMAT_ICONS = {
  left: ["M2 4h12", "M2 8h7", "M2 12h10"],
  center: ["M2 4h12", "M4.5 8h7", "M3 12h10"],
  right: ["M2 4h12", "M7 8h7", "M4 12h10"],
  // An "A" with its crossbar. The toggle's own selected state says whether the
  // outline is on; the glyph only has to say WHICH property is being toggled.
  outline: ["M3.5 13 8 3l4.5 10", "M5.4 9.6h5.2"],
  minus: ["M3.5 8h9"],
  plus: ["M3.5 8h9", "M8 3.5v9"],
};

function formatIconButton(iconKey, title, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "format-btn";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.appendChild(formatIcon(FORMAT_ICONS[iconKey]));
  btn.addEventListener("click", onClick);
  return btn;
}

// THE FORMAT BAR. One compact row for the four things tuned while watching a
// wall - alignment, colour, size, outline - and a disclosure for the two that
// are set once and left. Shared by plain `text` and `song-lyrics`, which are
// formatted identically; the type is the only thing that differs, and it
// differs in the content label above.
//
// The panel this replaces was eight labelled rows deep and had four hints
// under it. Everything those hints said now lives in a `title`, on the control
// it was about, where it is read at the moment the hand is on it.
/**
 * **The string itself, which is CONTENT rather than Format** (item 6, 2026-09-04).
 *
 * A slot's string is a PREVIEW of what Pregonero will put here; a plain text layer's string is the
 * content itself. Two different promises, and the label is where the difference is visible.
 */
function buildTextStringRow(container, shape, layer) {
  const fields = sanitizeTextLayer(layer);
  const isSlot = shape.layer.type === "song-lyrics";

  const textRow = document.createElement("div");
  textRow.className = "layer-field";
  const textLabel = document.createElement("label");
  textLabel.textContent = isSlot ? "Preview text" : "Text";
  textLabel.setAttribute("for", "layer-text-input");
  const textInput = document.createElement("textarea");
  textInput.id = "layer-text-input";
  textInput.rows = 3;
  textInput.value = fields.text;
  textInput.addEventListener("input", () => setLayerField(shape.id, "text", textInput.value));
  textRow.append(textLabel, textInput);
  container.appendChild(textRow);

  const textHint = document.createElement("p");
  textHint.className = "layer-hint";
  // A LABEL, NOT A LESSON (Jorge, 2026-09-04). The dummy line's argument — that
  // it is deliberately nastier than every line in the catalogue, and that
  // softening it makes the tuning feel finished without having tested anything
  // — is a fact about this tool and belongs in this comment, not on the screen.
  textHint.textContent = isSlot ? "Stand-in text — Pregonero fills this on the night." : "";
  container.appendChild(textHint);
}

function buildTextLayerControls(container, shape, layer) {
  const fields = sanitizeTextLayer(layer);

  // --- the bar ---
  const bar = document.createElement("div");
  bar.className = "format-bar";

  const alignSeg = document.createElement("div");
  alignSeg.className = "format-seg";
  alignSeg.id = "layer-align-seg";
  TEXT_ALIGNMENTS.forEach((align) => {
    const btn = formatIconButton(align, `Align ${align}`, () => setLayerField(shape.id, "align", align));
    btn.dataset.align = align;
    if (align === fields.align) btn.classList.add("active");
    alignSeg.appendChild(btn);
  });
  bar.appendChild(alignSeg);

  // THE ONE PLACE COLOUR IS SPENT, and it earns it: here the colour IS the
  // data, so a swatch says more than any label could.
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.id = "layer-color-input";
  colorInput.className = "format-swatch";
  colorInput.title = "Text colour";
  colorInput.value = fields.color;
  colorInput.addEventListener("input", () => setLayerField(shape.id, "color", colorInput.value));
  bar.appendChild(colorInput);

  // A BARE STEPPER: no unit, because the value has none. It is a fraction of
  // the shape's height, and a ceiling rather than a size - text that would not
  // fit is shrunk below it until it does.
  const stepper = document.createElement("div");
  stepper.className = "format-stepper";
  stepper.title =
    "Maximum size, as a fraction of the shape's height. A ceiling, not a size: anything that would not fit is shrunk below it, so text cannot overflow the shape at any setting.";
  const stepSize = (delta) =>
    setLayerField(
      shape.id,
      "maxSize",
      clampNumber(
        sanitizeTextLayer(findShape(shape.id).layer).maxSize + delta,
        TEXT_MAX_SIZE_MIN,
        TEXT_MAX_SIZE_MAX,
        TEXT_LAYER_DEFAULTS.maxSize
      )
    );
  stepper.appendChild(formatIconButton("minus", "Smaller", () => stepSize(-TEXT_MAX_SIZE_STEP)));
  const sizeValue = document.createElement("span");
  sizeValue.id = "layer-maxsize-value";
  sizeValue.className = "format-stepper-value";
  sizeValue.textContent = formatTextSize(fields.maxSize);
  stepper.appendChild(sizeValue);
  stepper.appendChild(formatIconButton("plus", "Bigger", () => stepSize(TEXT_MAX_SIZE_STEP)));
  bar.appendChild(stepper);

  // Says the quiet part out loud: a lyric shape is the one place in the suite
  // where legibility outranks restraint.
  const outlineBtn = formatIconButton("outline", "Outline", () =>
    setLayerField(shape.id, "outline", !sanitizeTextLayer(findShape(shape.id).layer).outline)
  );
  outlineBtn.id = "layer-outline-toggle";
  outlineBtn.title =
    "A dark outline plus a slight shadow, the way cinema subtitles do it, so the text reads over video and from the back of a dark room. The background stays transparent either way.";
  if (fields.outline) outlineBtn.classList.add("active");
  bar.appendChild(outlineBtn);

  container.appendChild(bar);

  // --- behind a disclosure, closed. Both of these are set once at a wall. ---
  const more = document.createElement("details");
  more.className = "format-more";
  const summary = document.createElement("summary");
  summary.textContent = "More";
  more.appendChild(summary);

  const aspectRow = document.createElement("div");
  aspectRow.className = "layer-field";
  const aspectLabel = document.createElement("label");
  aspectLabel.textContent = "Letter width";
  aspectLabel.setAttribute("for", "layer-aspect-input");
  const aspectInput = document.createElement("input");
  aspectInput.type = "range";
  aspectInput.id = "layer-aspect-input";
  aspectInput.min = String(TEXT_ASPECT_MIN);
  aspectInput.max = String(TEXT_ASPECT_MAX);
  aspectInput.step = "0.01";
  aspectInput.value = String(fields.aspect);
  // Commits on 'input' like everything else here, because "adjust while
  // watching the wall" is the entire point of it and a value that only lands
  // on mouse-up cannot be tuned by eye.
  aspectInput.title =
    "The shape already corrects itself: a wide strip lays the words out wide instead of fattening them, so ×1.00 is normal letters. This is the last few percent no formula can know — the tool sees the quad you drew, not the wall it lands on. Set it by eye, with the projector on.";
  const aspectValue = document.createElement("span");
  aspectValue.id = "layer-aspect-value";
  aspectValue.className = "layer-opacity-value";
  aspectValue.textContent = formatTextAspect(fields.aspect);
  aspectInput.addEventListener("input", () => {
    aspectValue.textContent = formatTextAspect(Number(aspectInput.value));
    setLayerField(shape.id, "aspect", Number(aspectInput.value));
  });
  aspectRow.append(aspectLabel, aspectInput, aspectValue);
  more.appendChild(aspectRow);

  // Built only when the outline is on. Not disabled-when-off: a control that
  // changes nothing on the wall is a control that lies, and the honest version
  // of "inert" is "absent". The panel rebuilds on the toggle for this reason -
  // see the accordion's Format section.
  if (fields.outline) {
    const outlineWidthRow = document.createElement("div");
    outlineWidthRow.className = "layer-field";
    const outlineWidthLabel = document.createElement("label");
    outlineWidthLabel.textContent = "Outline width";
    outlineWidthLabel.setAttribute("for", "layer-outline-width-input");
    const outlineWidthInput = document.createElement("input");
    outlineWidthInput.type = "range";
    outlineWidthInput.id = "layer-outline-width-input";
    outlineWidthInput.min = "0";
    outlineWidthInput.max = String(TEXT_OUTLINE_WIDTH_MAX);
    outlineWidthInput.step = "0.005";
    outlineWidthInput.value = String(fields.outlineWidth);
    const outlineWidthValue = document.createElement("span");
    outlineWidthValue.id = "layer-outline-width-value";
    outlineWidthValue.className = "layer-opacity-value";
    outlineWidthValue.textContent = fields.outlineWidth.toFixed(3);
    outlineWidthInput.addEventListener("input", () => {
      outlineWidthValue.textContent = Number(outlineWidthInput.value).toFixed(3);
      setLayerField(shape.id, "outlineWidth", Number(outlineWidthInput.value));
    });
    outlineWidthRow.append(outlineWidthLabel, outlineWidthInput, outlineWidthValue);
    more.appendChild(outlineWidthRow);
  }

  container.appendChild(more);
}

// gig-contact: one line, and the name of a QR file if there is one. NOT
// per-song, and there is deliberately no formatting here - it is decided once,
// at gig visual setup, for the whole night.
function buildContactLayerControls(container, shape, layer) {
  const fields = sanitizeContactLayer(layer);

  const lineRow = document.createElement("div");
  lineRow.className = "layer-field";
  const lineLabel = document.createElement("label");
  lineLabel.textContent = "Contact line";
  lineLabel.setAttribute("for", "layer-contact-text-input");
  const lineInput = document.createElement("input");
  lineInput.type = "text";
  lineInput.id = "layer-contact-text-input";
  lineInput.placeholder = "changopepper.com";
  lineInput.value = fields.text;
  lineInput.addEventListener("input", () => setLayerField(shape.id, "text", lineInput.value));
  lineRow.append(lineLabel, lineInput);
  container.appendChild(lineRow);

  const qrRow = document.createElement("div");
  qrRow.className = "layer-field";
  const qrLabel = document.createElement("label");
  qrLabel.textContent = "QR image (optional)";
  qrLabel.setAttribute("for", "layer-contact-qr-input");
  const qrInput = document.createElement("input");
  qrInput.type = "text";
  qrInput.id = "layer-contact-qr-input";
  qrInput.placeholder = "qr-changopepper.png";
  qrInput.value = fields.qrSrc || "";
  qrInput.addEventListener("input", () => setLayerField(shape.id, "qrSrc", qrInput.value.trim() || null));
  qrRow.append(qrLabel, qrInput);
  container.appendChild(qrRow);

}

// song-intro and song-video have NO settings, and saying nothing would read as
// a panel that failed to load. So it says what the type is and where the only
// two handles are.
function buildLockedTypeNote(container, type) {
  const hint = document.createElement("p");
  hint.className = "layer-hint";
  // SHORTENED RATHER THAN DELETED, and it is the one exception on this pass:
  // this note IS the panel for these two types, so taking it out leaves a blank
  // box that reads as a panel that failed to draw rather than as one with
  // nothing in it. One line each, which is a label.
  hint.textContent =
    type === "song-intro"
      ? "Locked template — nothing to format."
      : "The quad is the framing — nothing to set.";
  container.appendChild(hint);
}

function formatTextSize(fraction) {
  return `${(fraction * 100).toFixed(1)}%`;
}

// A multiplier, shown as one. Not a percentage: a percentage invites reading
// it as "how wide the letters are", when what it actually says is "how much
// wider than the shape already worked out".
function formatTextAspect(multiplier) {
  return `\u00d7${multiplier.toFixed(2)}`;
}

// Refreshes field values without rebuilding the DOM (the accordion builds once per open).
// Skips whichever field is currently focused so an in-progress edit isn't
// clobbered by the re-render its own commit triggered.
function updateLayerPanelValues(container, shape, layer) {
  const active = document.activeElement;

  const typeSelect = container.querySelector("#layer-type-select");
  if (typeSelect && active !== typeSelect) typeSelect.value = layer.type;

  const srcInput = container.querySelector("#layer-src-input");
  if (srcInput && active !== srcInput) srcInput.value = layer.src || "";

  const opacityInput = container.querySelector("#layer-opacity-input");
  if (opacityInput && active !== opacityInput) opacityInput.value = String(layer.opacity ?? 1);
  const opacityValue = container.querySelector("#layer-opacity-value");
  if (opacityValue) opacityValue.textContent = Number(layer.opacity ?? 1).toFixed(2);

  if (typeTakesTextFormatting(layer.type)) updateTextLayerPanelValues(container, layer, active);
  if (layer.type === "fill") updateFillLayerPanelValues(container, layer, active);
  if (layer.type === "gig-contact") updateContactLayerPanelValues(container, layer, active);

}

// Same contract as above: refresh, never rebuild, and never touch the control
// that currently has focus. Every one of these commits on 'input', so the
// focused control is by definition the one mid-edit.
function updateTextLayerPanelValues(container, layer, active) {
  const fields = sanitizeTextLayer(layer);

  const textInput = container.querySelector("#layer-text-input");
  if (textInput && active !== textInput) textInput.value = fields.text;

  // The bar's state is a class, not a value, so there is no focused-control
  // exception to make: a button does not hold an edit in progress.
  const alignSeg = container.querySelector("#layer-align-seg");
  if (alignSeg) {
    alignSeg.querySelectorAll(".format-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.align === fields.align);
    });
  }

  const colorInput = container.querySelector("#layer-color-input");
  if (colorInput && active !== colorInput) colorInput.value = fields.color;

  const sizeValue = container.querySelector("#layer-maxsize-value");
  if (sizeValue) sizeValue.textContent = formatTextSize(fields.maxSize);

  const outlineBtn = container.querySelector("#layer-outline-toggle");
  if (outlineBtn) outlineBtn.classList.toggle("active", fields.outline);

  const aspectInput = container.querySelector("#layer-aspect-input");
  if (aspectInput && active !== aspectInput) aspectInput.value = String(fields.aspect);
  const aspectValue = container.querySelector("#layer-aspect-value");
  if (aspectValue) aspectValue.textContent = formatTextAspect(fields.aspect);

  // Absent entirely while the outline is off - see buildTextLayerControls.
  const outlineWidthInput = container.querySelector("#layer-outline-width-input");
  if (outlineWidthInput && active !== outlineWidthInput) {
    outlineWidthInput.value = String(fields.outlineWidth);
  }
  const outlineWidthValue = container.querySelector("#layer-outline-width-value");
  if (outlineWidthValue) outlineWidthValue.textContent = fields.outlineWidth.toFixed(3);
}

function updateContactLayerPanelValues(container, layer, active) {
  const fields = sanitizeContactLayer(layer);

  const lineInput = container.querySelector("#layer-contact-text-input");
  if (lineInput && active !== lineInput) lineInput.value = fields.text;

  const qrInput = container.querySelector("#layer-contact-qr-input");
  if (qrInput && active !== qrInput) qrInput.value = fields.qrSrc || "";
}

function updateFillLayerPanelValues(container, layer, active) {
  const fields = sanitizeFillLayer(layer);

  const colorInput = container.querySelector("#layer-fill-color-input");
  if (colorInput && active !== colorInput) colorInput.value = fields.color;

  const marginInput = container.querySelector("#layer-fill-margin-input");
  if (marginInput && active !== marginInput) marginInput.value = String(fields.margin);
  const marginValue = container.querySelector("#layer-fill-margin-value");
  if (marginValue) marginValue.textContent = fields.margin.toFixed(3);
}


// =========================================================================
// CALIBRATION (arrow-key nudge)
// =========================================================================
// The critical live-calibration UX: select a shape, then arrow-key nudge it in
// real output pixels while watching the projected result. Two levels, general
// first, and the second is opted into rather than defaulted to:
//
//   nothing live  -> arrows move the WHOLE shape, outline and frame together.
//                    Fast coarse placement, and where every fresh selection
//                    starts.
//   a point       -> the outline point last clicked in the preview, or picked
//                    with 1-4. On a shape still at four points those four ARE
//                    its corners and those are the numbers the test pattern
//                    paints on the wall, so the old calibration flow - press
//                    2, nudge, watch the wall - works exactly as it always
//                    has. It just addresses the outline now, because there is
//                    nothing else left to address.
//
// 0 or Escape drops back to whole-shape mode. Nudges are discrete (no throttle
// needed) and route through the normal commitProjectChange() choke point.

function isTextInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const NUDGE_ARROW_DELTAS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

function nudgeOutlinePoint(dxPx, dyPx) {
  const shape = getSelectedShape();
  if (!shape || selectedPointIndex == null || selectedPointIndex >= shape.outline.length) return;
  const [x, y] = shape.outline[selectedPointIndex];
  shape.outline[selectedPointIndex] = [
    clampCoord(x + dxPx / outputSize.w),
    clampCoord(y + dyPx / outputSize.h),
  ];
  commitProjectChange();
}

// Whole-shape counterpart: translates the outline AND the content frame by the
// same output-pixel delta, using the same axis-wise clamp as pointer-drag
// translation (clampTranslateDelta) taken over both rings at once, so an arrow
// nudge cannot distort the shape or slide its content off its own outline at
// the overshoot boundary either.
function nudgeWholeShape(dxPx, dyPx) {
  const shape = getSelectedShape();
  if (!shape) return;
  const frame = shapeFrame(shape);
  const rawDelta = [dxPx / outputSize.w, dyPx / outputSize.h];
  const [dx, dy] = clampTranslateDelta(frame ? shape.outline.concat(frame) : shape.outline, rawDelta);
  shape.outline = shape.outline.map(([x, y]) => [x + dx, y + dy]);
  if (frame) shape.corners = frame.map(([x, y]) => [x + dx, y + dy]);
  commitProjectChange();
}

function handleControlKeydown(e) {
  if (isTextInputFocused()) return;

  // Escape means "get me out of here" first, and only then "back to
  // whole-shape nudging" (below) - during calibration there is no shape
  // selected to nudge anyway.
  if (calibratingCamera) {
    if (e.key === "Escape") toggleCameraCalibration();
    return; // the preview belongs to the camera quad; nudges have nothing to show
  }

  const shape = getSelectedShape();
  if (!shape) return;

  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault(); // Backspace still means "back" in some setups
    deleteShapePoint(shape.id, selectedPointIndex);
    return;
  }

  // 1-4 address the first four OUTLINE points, on every shape type - which on
  // a shape still at four points are its corners, in the order the test
  // pattern numbers them. A shape with fewer points than the key asks for
  // simply does not answer.
  if (e.key >= "1" && e.key <= "4" && Number(e.key) <= shape.outline.length) {
    setSelectedPointIndex(Number(e.key) - 1);
    renderControl(); // the panel's point read-out follows the selection too
    return;
  }

  if (e.key === "0" || e.key === "Escape") {
    clearShapeSubselection(); // back to whole-shape nudge mode
    renderControl();
    return;
  }

  const delta = NUDGE_ARROW_DELTAS[e.key];
  if (delta) {
    e.preventDefault(); // don't let arrows scroll the page
    const step = e.shiftKey ? 1 : 5; // output px; shift = fine
    if (selectedPointIndex != null) {
      nudgeOutlinePoint(delta[0] * step, delta[1] * step);
    } else {
      nudgeWholeShape(delta[0] * step, delta[1] * step);
    }
  }
}

function exportProject() {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wallmapper-project.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importProjectFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!isValidProject(parsed)) {
        window.alert("That file doesn't look like a Muralista project (missing version/surfaces).");
        return;
      }
      replaceProject(migrateProject(parsed));
    } catch (err) {
      window.alert("Could not read that file as JSON.");
      console.error("Muralista import error:", err);
    }
  };
  reader.onerror = () => {
    window.alert("Could not read that file.");
  };
  reader.readAsText(file);
}

function wireControlEvents() {
  document.getElementById("btn-add-shape").addEventListener("click", addShape);
  document
    .getElementById("btn-show-dependencies")
    .addEventListener("click", toggleShowDependencies);

  document.getElementById("btn-open-output").addEventListener("click", () => {
    // Hand the output window THIS window's build token (see the bootstrap in
    // mapper.html) so the two documents load the same mapper.js and mapper.css
    // by construction. Reloading the control window mints a fresh token, and
    // the next click re-navigates the named output window onto it.
    const url = "mapper.html?output&v=" + encodeURIComponent(window.MURALISTA_BUILD);
    const win = window.open(url, "mapper-output");
    outputWindow = win || null;
    if (win) {
      // If the named window already exists (possibly behind other windows or
      // on another display), window.open only re-navigates it - bring it
      // forward so the click never looks like a no-op.
      win.focus();
    } else {
      // **The refusal is not always Chrome's** (2026-09-04). Embedded, the embedder's own
      // window-open handler is what answers first, and Pregonero's denied everything but its
      // projection window until `v0.55.0` — so the address-bar advice was wrong copy in the one
      // place a person could not act on it. Say which it was.
      window.alert(
        isEmbedded()
          ? "The output window was refused by the application this page is running inside."
          : "Chrome blocked the output window popup.\n\n" +
              "Click the blocked-popup icon at the right end of the address bar " +
              "and allow popups for localhost, then try again."
      );
    }
  });

  document.getElementById("btn-export").addEventListener("click", exportProject);

  const fileInput = document.getElementById("file-import");
  document.getElementById("btn-import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) importProjectFromFile(file);
    fileInput.value = ""; // allow re-importing the same filename later
  });

  document.getElementById("btn-play").addEventListener("click", () => handleTransportButton("play"));
  document.getElementById("btn-pause").addEventListener("click", () => handleTransportButton("pause"));
  document.getElementById("btn-restart").addEventListener("click", () => handleTransportButton("restart"));

  const backdropInput = document.getElementById("file-backdrop");
  document.getElementById("btn-backdrop").addEventListener("click", () => backdropInput.click());
  backdropInput.addEventListener("change", () => {
    const file = backdropInput.files && backdropInput.files[0];
    if (file) loadBackdropPhotoFile(file);
    backdropInput.value = "";
  });
  document.getElementById("btn-backdrop-clear").addEventListener("click", clearBackdropPhoto);

  document.getElementById("select-backdrop-mode").addEventListener("change", (e) => setBackdropMode(e.target.value));
  document.getElementById("btn-camera-toggle").addEventListener("click", toggleCamera);
  document.getElementById("select-camera-device").addEventListener("change", (e) => setCameraDeviceId(e.target.value));
  document.getElementById("btn-camera-calibrate").addEventListener("click", toggleCameraCalibration);
  document.getElementById("btn-camera-calibrate-clear").addEventListener("click", clearCameraQuad);
  document.getElementById("btn-white-field").addEventListener("click", toggleWhiteField);

  // Each of these is a real click, which is the point: showDirectoryPicker and
  // requestPermission both require a user gesture, and that requirement is the
  // feature, not an obstacle around it.
  document.getElementById("btn-media-folder").addEventListener("click", chooseMediaFolder);
  document.getElementById("btn-media-folder-reconnect").addEventListener("click", reconnectMediaFolder);
  document.getElementById("btn-media-folder-clear").addEventListener("click", clearMediaFolder);

  // Same gesture requirement, one folder along - and this one is picked in
  // "readwrite" mode, because visuals.json goes back into it.
  document.getElementById("btn-gig-folder").addEventListener("click", chooseGigFolder);
  document.getElementById("btn-gig-folder-reconnect").addEventListener("click", reconnectGigFolder);
  document.getElementById("btn-gig-folder-clear").addEventListener("click", clearGigFolder);
  // A gig is a file somebody else writes, and it can be rewritten while this
  // window is open. Re-reading it is one click rather than a reload.
  document.getElementById("btn-gig-reload").addEventListener("click", refreshGig);

  document
    .getElementById("select-visual-setup-song")
    .addEventListener("change", (e) => setVisualSetupSong(e.target.value));

  // --- The flow. ---
  document.getElementById("btn-flow-deal-next").addEventListener("click", () => goToFlowStep(FLOW_SHAPES));
  document.getElementById("btn-flow-to-output").addEventListener("click", () => goToFlowStep(FLOW_OUTPUT));
  document.getElementById("btn-flow-save-gig").addEventListener("click", () => void flowSaveToGig());
  document.getElementById("btn-flow-download").addEventListener("click", flowDownloadVisuals);
  window.addEventListener("message", handleEmbedderMessage);
}

function initControl() {
  document.getElementById("control-root").hidden = false;
  channel.addEventListener("message", handleControlMessage);
  // The output's `hello` arrives on the handle when this page is framed, for the same partition
  // reason `postToOutput` exists. `handleEmbedderMessage` owns the parent's messages; this owns
  // the output window's, and the two sources cannot be confused because they are different windows.
  window.addEventListener("message", (event) => {
    if (!outputWindow || event.source !== outputWindow) return;
    handleControlMessage(event);
  });
  wireControlEvents();
  // Keydown on the whole document (not a specific element) so nudging works
  // no matter what's focused in the control window, short of a text input.
  document.addEventListener("keydown", handleControlKeydown);

  // The camera backdrop's matrix3d is built in real stage pixels, so it has
  // to be rebuilt whenever the stage changes size. Surfaces need no such
  // thing: they are drawn in the SVG's fixed 1600x900 viewBox and scale for
  // free.
  new ResizeObserver(() => renderCamera()).observe(document.querySelector(".preview-box"));

  // A replug or a profile change rotates Chrome's device ids, which is the
  // whole cause of the dead end this release fixes. Listening for it keeps the
  // menu true instead of true-as-of-load.
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", refreshCameraDevices);
  }

  renderControl();

  // Async and un-awaited, like initMediaFolder below: enumerateDevices needs
  // no permission and opens nothing, so it costs a person nothing to have the
  // menu already populated the first time they look at it.
  refreshCameraDevices();

  // Async and deliberately un-awaited: reading the handle back out of
  // IndexedDB must not hold up the first paint of a mapping that is already in
  // localStorage. Each re-renders itself when it lands.
  initMediaFolder();
  // **The flow opens after the gig has had its chance to connect**, because
  // both questions it asks first - has this machine done this before, and does
  // screen 1 apply at all - are questions about the gig.
  void initGigFolder().then(initFlow);
}

// =========================================================================
// OUTPUT RENDERING
// =========================================================================
// One root div per visible shape, in list order, and what goes inside it
// depends on what the shape carries:
//
//   content -> a fixed 1000x1000 wrapper div, warped onto the shape's CONTENT
//              FRAME (in current window pixels) via matrix3d - see the WARP
//              section above for the homography math. The root carries a
//              clip-path built from the OUTLINE, in output pixels, whenever
//              the outline has left the frame.
//   fill    -> a full-frame SVG holding one polygon: the outline, painted in
//              the layer's colour, with the margin as a round-joined stroke.
//
// Re-renders on every received state and on window resize (wired in
// initOutput()).
//
// WHY THE CLIP LIVES ON AN UNTRANSFORMED PARENT. clip-path resolves in the
// element's own coordinate space, so putting it on the warped wrapper would
// mean mapping every outline point backwards through the inverse homography
// into unit-square space. The root is full-frame and untransformed, so output
// pixels ARE its coordinate space and the outline goes on as it is stored,
// with no second homography to keep in step with the first.
//
// AND WHY IT IS ONLY SET WHEN THE OUTLINE HAS LEFT THE FRAME. A clip laid
// exactly along a quad's own edge would shave its antialiasing; a shape that
// clips nothing must paint exactly the pixels v1.0.0 painted, so it is given
// no clip at all rather than one that ought to be a no-op.

// Reconciliation map: shapeId -> { root, wrapper, layerType, layerSrc,
// textKey, contentEl, clipKey }.
// renderOutput() runs on every received state AND on every window resize
// (arrow-key nudges commit a state broadcast per keystroke). Without this
// map, the old "container.innerHTML = ''; rebuild everything" approach would
// tear down and recreate every <video> on every single nudge or resize -
// restarting playback constantly, which is exactly wrong for calibrating
// WHILE video plays. Now: the wrapper transform, the clip and the layer
// opacity update every render; the underlying video/image/canvas element only
// gets recreated when its shape's layer.type or layer.src actually changes.
const outputShapeElements = new Map();

// { songId, songTitle } while a song is being previewed from song visual
// setup, null the rest of the time. Output-side only, and never persisted -
// see broadcastState.
let outputPreview = null;

function outputPreviewSongId() {
  return outputPreview ? outputPreview.songId : null;
}

// The title the song-intro template paints. The real one while a song is
// previewed, a stand-in otherwise - see INTRO_PLACEHOLDER for why only this
// one part of the three is ever real.
function outputPreviewTitle() {
  return (outputPreview && outputPreview.songTitle) || INTRO_PLACEHOLDER.title;
}

function renderOutput() {
  const container = document.getElementById("output-surfaces");
  const w = window.innerWidth;
  const h = window.innerHeight;

  // ABSENCE IS THE EMPTY STATE. A song-aware shape the previewed song does not
  // point at is simply not rendered - not blacked out, not declared empty. It
  // goes through the same teardown a hidden shape does, so its video stops
  // rather than playing to nobody. In gig visual setup nothing is dark: no song
  // is playing at a desk, and you cannot place a shape you cannot see.
  const songId = outputPreviewSongId();
  const visibleShapes = project.surfaces.filter(
    (s) => s.visible && !shapeIsDarkForPreview(project, s, songId)
  );
  const visibleIds = new Set(visibleShapes.map((s) => s.id));

  // Drop entries for shapes that were removed or hidden since the last
  // render (also stops/pauses their media - see teardownLayerContent).
  for (const [id, entry] of outputShapeElements) {
    if (!visibleIds.has(id)) dropOutputShape(id, entry);
  }

  visibleShapes.forEach((shape) => renderOutputShape(container, shape, w, h));

  reconcileOutputShapeOrder(container, visibleShapes);
}

function dropOutputShape(id, entry) {
  teardownLayerContent(entry);
  entry.root.remove();
  outputShapeElements.delete(id);
}

// Shape list order = render order = stacking order (later = on top), so
// #output-surfaces' DOM child order must track project.surfaces order -
// otherwise a z-order move (moveShapeUp/Down) changes the data but the roots
// stay in their old paint order on the actual output. renderOutputShape()
// only appends a root the FIRST time a shape is seen; on every later render it
// reuses the existing element in place, so without this step a reorder would
// be invisible on the wall.
//
// appendChild on an element already in the document just moves it (cheap,
// idempotent) - but re-parenting a <video> element directly DOES interrupt
// playback in Chrome (moving a media element triggers a load reset). Here we
// only ever move the per-shape ROOT div, never the <video>/<img>/canvas itself
// - the video stays put inside its wrapper inside its root, only the root's
// position among its siblings changes, so this does not reset playback.
// Still: only touch the DOM when the order actually drifted from what's
// wanted (checked below) - calibration nudges and resizes call renderOutput()
// on every commit/frame and must NOT reorder anything when nothing moved.
function reconcileOutputShapeOrder(container, visibleShapes) {
  const wanted = visibleShapes
    .map((s) => outputShapeElements.get(s.id))
    .filter(Boolean)
    .map((entry) => entry.root);

  const current = Array.from(container.children);
  const alreadyInOrder =
    wanted.length === current.length && wanted.every((el, i) => el === current[i]);
  if (alreadyInOrder) return;

  wanted.forEach((root) => container.appendChild(root));
}

function ensureOutputShapeRoot(container, shape) {
  let entry = outputShapeElements.get(shape.id);
  if (!entry) {
    const root = document.createElement("div");
    root.className = "shape-root";
    root.dataset.shapeId = shape.id;
    container.appendChild(root);
    entry = {
      root,
      wrapper: null,
      layerType: null,
      layerSrc: null,
      textKey: null,
      contentEl: null,
      clipKey: null,
    };
    outputShapeElements.set(shape.id, entry);
  }
  return entry;
}

// Empties a root back to nothing, for a shape whose type changed across the
// fill / content divide - the two put fundamentally different elements inside
// it, and nothing in one is reusable by the other.
function resetOutputShapeRoot(entry) {
  teardownLayerContent(entry);
  entry.root.innerHTML = "";
  entry.root.style.clipPath = "";
  entry.wrapper = null;
  entry.contentEl = null;
  entry.layerType = null;
  entry.layerSrc = null;
  entry.textKey = null;
  entry.clipKey = null;
}

function renderOutputShape(container, shape, w, h) {
  if (shapeType(shape) === "fill") renderOutputFill(container, shape, w, h);
  else renderOutputContent(container, shape, w, h);
}

// A fill shape: its outline, in its colour, grown by its margin.
//
// Drawn in real output pixels rather than in normalized space, because the
// margin stroke has to be ROUND: a viewBox stretched over a non-square frame
// would scale x and y differently and turn every round join into an ellipse.
// The polygon is re-dressed rather than rebuilt on each render - it is one
// element with no media in it, and rebuilding would churn for nothing.
function renderOutputFill(container, shape, w, h) {
  const outline = shapeOutline(shape);
  const existing = outputShapeElements.get(shape.id);
  if (!outline) {
    if (existing) dropOutputShape(shape.id, existing);
    return;
  }

  const entry = ensureOutputShapeRoot(container, shape);
  if (entry.layerType !== "fill") {
    resetOutputShapeRoot(entry);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "output-fill-svg");
    svg.setAttribute("preserveAspectRatio", "none");
    const poly = document.createElementNS(SVG_NS, "polygon");
    poly.setAttribute("class", "output-fill");
    svg.appendChild(poly);
    entry.root.appendChild(svg);
    entry.contentEl = svg;
    entry.layerType = "fill";
  }

  const layer = shapeLayer(shape);
  const fields = sanitizeFillLayer(layer);
  const svg = entry.contentEl;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.style.opacity = String(layer.opacity ?? 1);

  const poly = svg.firstElementChild;
  poly.setAttribute("points", ringPointsAttr(outline, w, h));
  // Fill and stroke are the same colour: the stroke IS the dilation, not an
  // edge, so a second colour there would draw a halo nobody asked for.
  poly.style.fill = fields.color;
  poly.style.stroke = fields.color;
  applyMarginStroke(poly, fields.margin, h);
}

function renderOutputContent(container, shape, w, h) {
  const transform = frameMatrix3d(shapeFrame(shape), w, h);
  const existing = outputShapeElements.get(shape.id);

  if (!transform) {
    // No frame, or degenerate corners (e.g. collinear) - skip rather than
    // throw, and tear down any element that existed from before.
    if (existing) dropOutputShape(shape.id, existing);
    return;
  }

  const entry = ensureOutputShapeRoot(container, shape);
  if (!entry.wrapper) {
    resetOutputShapeRoot(entry); // may have been holding a fill's SVG
    const wrapper = document.createElement("div");
    wrapper.className = "surface-wrapper";
    wrapper.style.width = `${UNIT_SIZE}px`;
    wrapper.style.height = `${UNIT_SIZE}px`;
    entry.root.appendChild(wrapper);
    entry.wrapper = wrapper;
  }

  entry.wrapper.style.transform = transform;
  applyOutlineClip(entry, shape, w, h);
  renderLayer(shape, entry, w, h);
}

// The outline, as a clip on the untransformed root - see the section comment
// for why it goes there and not on the warped wrapper. Keyed so the string is
// only rebuilt when the geometry it describes actually moved: renderOutput()
// runs on every nudge, and a clip-path assignment is a style invalidation.
function applyOutlineClip(entry, shape, w, h) {
  const outline = shapeOutline(shape);
  // A shape whose outline is still its frame clips nothing, and is given no
  // clip at all rather than one along its own edge - see the section comment.
  const clipKey = !outline || shapeOutlineIsFrame(shape) ? "" : `${w}x${h}:${JSON.stringify(outline)}`;
  if (entry.clipKey === clipKey) return;
  entry.clipKey = clipKey;
  entry.root.style.clipPath = clipKey
    ? `polygon(${outline.map(([x, y]) => `${x * w}px ${y * h}px`).join(", ")})`
    : "";
}

// Renders (or reconciles) the content that lives inside a shape's warped
// wrapper. Only recreates the content element when layer.type or layer.src
// changed since the last render; otherwise just refreshes cheap properties
// (opacity) on the existing element so playback state survives. Never reached
// for a fill shape - that has no wrapper and no content element; see
// renderOutputFill.
//
// `w`/`h` are the output frame in real pixels, and they are here for exactly
// one reason: the text layer's aspect correction needs real lengths, not
// normalized ones. Video and image layers do not read them and go on filling
// their quads exactly as they always have - the stretch is theirs to keep.
function renderLayer(shape, entry, w, h) {
  const layer = shape.layer || { type: "pattern", src: null, opacity: 1 };
  // Reconcile against the URL actually mounted, not the name in the project.
  // The name can stay put while the URL underneath it changes - a media folder
  // arriving, being reconnected, or being cleared all re-point an unchanged
  // "cerdo.mp4" - and those are exactly the moments the element must be
  // rebuilt. Keying on the name would leave the old source playing.
  const nextUrl = layer.src ? resolveMediaUrl(layer.src) : null;
  const typeChanged = entry.layerType !== layer.type;
  const srcChanged = entry.layerSrc !== nextUrl;

  if (typeChanged || srcChanged) {
    teardownLayerContent(entry); // pause/stop+detach whatever was there before
    entry.wrapper.innerHTML = "";
    entry.contentEl = createLayerElement(shape, layer, nextUrl);
    entry.wrapper.appendChild(entry.contentEl);
    entry.layerType = layer.type;
    entry.layerSrc = nextUrl;
    // Left null on purpose: a freshly mounted text box is undressed, and the
    // block below is what dresses and fits it - now that it is in the
    // document and has a width to measure.
    entry.textKey = null;
  }

  // The DRESSED types have no src to reconcile against, so they get a key of
  // their own. Editing the content, dragging the size slider, reshaping the
  // quad under it, or previewing a different song must re-dress and re-fit the
  // mounted element - but must NOT rebuild it, for the same reason a video is
  // not rebuilt on a nudge: churn at a projector is the thing this reconciler
  // exists to avoid.
  if (typeIsDressed(layer.type) && entry.contentEl) {
    const boxWidth = layoutBoxWidthFor(shape, layer, w, h);
    const nextKey = dressedLayerKey(shape, layer, boxWidth);
    if (entry.textKey !== nextKey) {
      dressLayer(entry.contentEl, shape, layer, boxWidth);
      entry.textKey = nextKey;
    }
  }

  if (entry.contentEl) {
    entry.contentEl.style.opacity = String(layer.opacity ?? 1);
  }
}

// `url` is what goes on the element: a blob URL when the media folder resolved
// layer.src, otherwise layer.src itself (the served-directory fallback).
// Everything that reasons ABOUT the source - the .webm overlay test, the
// failure note - keeps reading layer.src, because a blob URL has no filename
// and no extension and means nothing to a person reading the wall.
function createLayerElement(shape, layer, url) {
  switch (layer.type) {
    case "video":
      return createVideoLayerElement(layer, shape, url);
    case "image":
      return createImageLayerElement(layer, shape, url);
    case "text":
    case "song-lyrics":
      // ONE ELEMENT FOR BOTH, and that is the retirement of `role` showing up
      // in the renderer: a lyrics slot and a title card are painted by exactly
      // the same code, and the type is the only thing that says which is which.
      return createTextLayerElement(layer, shape);
    case "song-video":
      return createSongVideoLayerElement(shape);
    case "song-intro":
      return createSongIntroLayerElement(shape);
    case "gig-contact":
      return createGigContactLayerElement(shape);
    case "pattern":
    default:
      return renderPatternLayer(shape);
  }
}

// Stops/detaches whatever content element (if any) currently lives in an
// entry: pauses+releases a <video>. Safe to call on an entry with no
// content yet.
function teardownLayerContent(entry) {
  if (entry.contentEl) {
    // Media layers are a .layer-box wrapper with the <video>/<img> inside
    // (so a failure note can overlay them) - release any video found.
    const video =
      entry.contentEl.tagName === "VIDEO"
        ? entry.contentEl
        : entry.contentEl.querySelector && entry.contentEl.querySelector("video");
    if (video) {
      registeredVideoEls.delete(video);
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    entry.contentEl = null;
  }
}

// Wraps a media element in a box with an overlay note that appears when the
// media has no source or fails to load. Black-on-black failures are
// undebuggable mid-calibration at a projector - failures must be VISIBLE on
// the output itself.
function wrapMediaWithFailureNote(mediaEl, shape, layer, kindLabel) {
  const box = document.createElement("div");
  box.className = "layer-box";

  const note = document.createElement("div");
  note.className = "layer-note";
  note.hidden = true;

  if (!layer.src) {
    note.textContent = `${shape.name}\nno ${kindLabel} source set`;
    note.hidden = false;
  } else {
    mediaEl.addEventListener("error", () => {
      note.textContent = `${shape.name}\n${kindLabel} failed to load:\n${layer.src}`;
      note.hidden = false;
    });
  }

  box.append(mediaEl, note);
  return box;
}

// =========================================================================
// TRANSPORT (output-side: play/pause/restart every video layer element)
// =========================================================================
// Shared clock per the kickoff decision: every video layer on the output
// responds to the same global transport command, not an independent one per
// shape. registeredVideoEls tracks every <video> currently mounted for a
// 'video' layer AND for an alpha-webm 'image' layer (v2.2 - see
// createImageLayerElement) so a transport command can apply to all of them
// at once.
const registeredVideoEls = new Set();
let transportPlaying = false;

function playVideoQuietly(video) {
  const p = video.play();
  // Videos are muted so autoplay policy shouldn't block this, but a play()
  // promise can still reject (e.g. interrupted by a near-simultaneous
  // pause()) - don't let that become an unhandled rejection.
  if (p && typeof p.catch === "function") {
    p.catch((err) => console.warn("Muralista: video play() was rejected.", err));
  }
}

function applyTransportAction(action) {
  if (action === "play") {
    transportPlaying = true;
    registeredVideoEls.forEach(playVideoQuietly);
  } else if (action === "pause") {
    transportPlaying = false;
    registeredVideoEls.forEach((v) => v.pause());
  } else if (action === "restart") {
    transportPlaying = true;
    registeredVideoEls.forEach((v) => {
      v.currentTime = 0;
      playVideoQuietly(v);
    });
  }
}

// =========================================================================
// MEDIA URLS (output-side)
// =========================================================================
// The output half of the media folder. This window never opens a picker, never
// asks for a permission and never touches the file system - it receives Blobs
// over the BroadcastChannel and mints its own object URLs from them. That is
// the entire reason the control window does the reading: a permission dialog
// on the projector, mid-setup, in front of a room, is not acceptable.
//
// src name -> { token, url }. Keyed by NAME, not by shape: two surfaces
// pointing at the same clip share one object URL, which is also why revocation
// lives here and not in teardownLayerContent - tearing down one of them must
// not pull the URL out from under the other.
const outputMediaUrls = new Map();

// A tool left open for a whole setup, running video, cannot leak blob URLs:
// each one pins its bytes in memory until revoked. So exactly one rule, in one
// place - a URL is revoked the moment the map stops pointing at it, whether
// because the file behind the name changed (new token) or because the name
// left the set entirely (layer re-pointed, folder disconnected).
function applyMediaMessage(entries) {
  const seen = new Set();
  let changed = false;

  entries.forEach((entry) => {
    if (!entry || typeof entry.src !== "string" || !entry.src) return;
    if (!(entry.blob instanceof Blob)) return;
    seen.add(entry.src);
    const existing = outputMediaUrls.get(entry.src);
    // Same file as last time: keep the live URL. Structured clone hands us a
    // fresh Blob object on every message, so without the token comparison this
    // branch would never be taken and every send would restart every video.
    if (existing && existing.token === entry.token) return;
    if (existing) URL.revokeObjectURL(existing.url);
    outputMediaUrls.set(entry.src, { token: entry.token, url: URL.createObjectURL(entry.blob) });
    changed = true;
  });

  for (const [src, rec] of outputMediaUrls) {
    if (seen.has(src)) continue;
    URL.revokeObjectURL(rec.url);
    outputMediaUrls.delete(src);
    changed = true;
  }

  if (changed) renderOutput();
}

// A name the control window resolved becomes a blob URL; a name it did not
// stays exactly the string it is, and the browser resolves it against the
// served directory the way it always has. Every mapping that opens today still
// opens, with no folder chosen at all.
function resolveMediaUrl(src) {
  const rec = src ? outputMediaUrls.get(src) : null;
  return rec ? rec.url : src;
}

// =========================================================================
// LAYER ELEMENT FACTORIES (video / image / pattern)
// =========================================================================

function createVideoLayerElement(layer, shape, url) {
  const video = document.createElement("video");
  video.className = "layer-video";
  video.src = url || "";
  video.muted = true;
  video.playsInline = true;
  video.loop = true; // sensible live default for a spike (no scripted stop point)
  video.preload = "auto";
  registeredVideoEls.add(video);
  // A shape switched to 'video' (or added) while transport is already
  // playing should join the shared clock rather than sit on its first frame.
  if (transportPlaying) playVideoQuietly(video);
  return wrapMediaWithFailureNote(video, shape, layer, "video");
}

function createImageLayerElement(layer, shape, url) {
  // The overlay test reads the NAME. A blob URL carries no extension, so
  // testing `url` here would silently demote every alpha-webm overlay to a
  // still <img> the moment a media folder was connected.
  const name = layer.src || "";
  const src = url || "";
  if (/\.webm$/i.test(name)) {
    // Alpha WebM (VP9 transparency, Chrome-only): the v2.2 AI-animation
    // overlay slot. An overlay authored against the show timeline needs to
    // start at the same instant as everything else, so it joins the shared
    // transport exactly like a 'video' layer (registeredVideoEls + the
    // transportPlaying join-mid-playback pattern) rather than autoplaying on
    // its own. The type distinction between 'video' and alpha-webm 'image'
    // blurs here - that's fine: an overlay IS content synced to the show
    // clock, same as the base video.
    const video = document.createElement("video");
    video.className = "layer-image-webm";
    video.src = src;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    registeredVideoEls.add(video);
    if (transportPlaying) playVideoQuietly(video);
    return wrapMediaWithFailureNote(video, shape, layer, "video");
  }
  const img = document.createElement("img");
  img.className = "layer-image";
  img.src = src;
  img.alt = "";
  return wrapMediaWithFailureNote(img, shape, layer, "image");
}

// =========================================================================
// TEXT LAYER (painting half; the schema is up in STATE)
// =========================================================================
// REAL DOM TEXT INSIDE THE WARPED ELEMENT, NEVER A PRE-RENDERED IMAGE. The
// browser rasterizes AFTER the transform, so the glyphs stay crisp in a
// keystoned quad however hard the corners are pulled. Text baked into a
// bitmap and then warped is precisely how surtitles fail: you get a sharp
// image of blurry letters.
//
// The structure is .layer-box > .layer-text > .layer-text-inner. The middle
// element carries the inset (so text never touches the quad's edge) and
// centres its child vertically; the inner element is the thing measured and
// the thing sized.
//
// Deliberate, and NOT an oversight: the suite's "contrast is a budget" rule
// does not apply here. A lyric shape is read from the back of a dark room,
// through a projector, over moving video. Legibility wins outright - hence a
// transparent background (so a video layer underneath shows through, which
// is the overlay case v1 actually needs), a dark stroke painted BEHIND the
// fill, and a slight drop shadow. That is how cinema subtitles do it, for
// exactly the same reason.

// The margin between the text and the quad's edge, as a fraction of the unit
// box. It is what makes "no exceeding limits" a guarantee rather than a
// near-miss: the fit targets the inset box, so the outline stroke and the
// shadow (which extend past the glyph box and are not measured by layout)
// still have room, at any font size the slider can ask for.
const TEXT_INSET = 0.06;
// Floor for auto-fit, and the one place the guarantee stops. Below this a
// line on a wall is not "small", it is unreadable. Content that still does
// not fit at the floor is left to overflow VISIBLY rather than be clipped or
// shrunk further: silent clipping is the surtitle failure this whole layer
// exists to avoid, and a quad drawn far too small for its content is
// something the person at the wall needs to SEE, not something to hide.
//
// There is a lot of room before that matters. Measured in the unit box: the
// catalogue's longest entry (81 characters, and 152 with its translation
// stacked under it) fits at 93px; an entire song of ~4,800 characters still
// fits, at 16px. The floor is only reached somewhere past 40,000 characters,
// which is not a lyric.
const TEXT_MIN_PX = 8;
const TEXT_FIT_ITERATIONS = 14; // binary search over the size range; ~0.05px resolution

// =========================================================================
// TEXT ASPECT (why text alone does not inherit the quad's stretch)
// =========================================================================
// Every shape draws into a fixed UNIT_SIZE square that matrix3d maps onto
// four corners, so a quad wider than it is tall fattens whatever is in it.
// For video and images that stretch is deliberate and stays - a stretched pig
// is a style. For text it is a defect: a wide strip fattens the glyphs and a
// tall column squeezes them, and the lyric is the one thing an audience is
// obliged to read. So text, and only text, gets the stretch taken back out.
//
// HOW, AND WHY THIS PARTICULAR HOW. The counter-correction resizes the text's
// LAYOUT BOX rather than scaling the finished text: `.layer-text` is laid out
// W wide by UNIT_SIZE tall, where W is the quad's stretch in whole pixels, and
// carries scaleX(UNIT_SIZE/W) from its own top-left - which maps that box onto
// the unit square exactly. Both approaches paint the same picture on the wall,
// but only this one keeps THE GUARANTEE STRUCTURAL: auto-fit measures
// scrollWidth/scrollHeight inside the layout box, the transform is a bijection
// from that box onto the unit square, and the unit square IS the quad - so "it
// fits here" still means "it fits the quad" at every shape and every slider
// setting, with nothing to remember and no rule to keep. Counter-scaling the
// finished text instead would have left the fit measuring untransformed
// geometry, and the containment argument would then have needed a correction
// factor threaded through it by hand - exactly the kind of invariant that
// survives review and dies six months later.
//
// The inset goes with it: horizontal padding is a fraction of the box rather
// than of the unit square, so after the counter-scale the margin off the
// quad's edge is TEXT_INSET on all four sides, the same 6% it was before any
// of this existed.

// Sanity bounds on k. A real projector never lands a 20:1 quad, and past
// these the layout box stops being a place text could live at all - a k of
// 0.001 is a box a few pixels wide, where nothing fits at any font size and
// the binary search would just report the floor. Clamping keeps a degenerate
// or mistyped quad from painting nothing rather than painting something
// wrong, which is the more debuggable failure at a projector.
const TEXT_WIDTH_FACTOR_MIN = 0.05;
const TEXT_WIDTH_FACTOR_MAX = 20;

// Length of one quad edge IN REAL OUTPUT PIXELS. This conversion is the whole
// trap: shape.corners are normalized 0-1 over an output frame that is NOT
// square (1280x800 on the studio rig), so a ratio taken straight from
// normalized coordinates is wrong by the frame's own aspect - and wrong by a
// factor of 1.6 looks almost right, which is worse than looking broken.
function quadEdgeLength([ax, ay], [bx, by], frameW, frameH) {
  return Math.hypot((bx - ax) * frameW, (by - ay) * frameH);
}

// How much wider than tall the quad is, in real pixels: the factor by which
// mapping the unit square onto it fattens the glyphs.
//
// A quad on an angled wall is a trapezoid ON PURPOSE - the warp is
// compensating for the projector's position - so opposite edges genuinely
// differ and there is no single true width. The mean of the two horizontals
// against the mean of the two verticals is a sane summary and this claims no
// more precision than that; the manual slider is where the rest of the
// judgement lives, because the rest of the judgement is not arithmetic.
// Corner order is [TL, TR, BR, BL], as everywhere else.
function quadStretch(corners, frameW, frameH) {
  const [tl, tr, br, bl] = corners;
  const horizontal =
    (quadEdgeLength(tl, tr, frameW, frameH) + quadEdgeLength(bl, br, frameW, frameH)) / 2;
  const vertical =
    (quadEdgeLength(tl, bl, frameW, frameH) + quadEdgeLength(tr, br, frameW, frameH)) / 2;
  if (!(horizontal > 0) || !(vertical > 0)) return 1;
  return horizontal / vertical;
}

// The width of the text's layout box, IN WHOLE PIXELS: the automatic
// correction divided by the manual one, times UNIT_SIZE. Aspect 1.0 leaves the
// automatic result alone; aspect 2.0 halves the box, which counter-scaled back
// out paints letters twice as wide.
//
// A WHOLE NUMBER, and that is not cosmetic. scrollWidth/clientWidth are
// integers - Chrome rounds them - while the box width and the inset that come
// out of this arithmetic are not. Let the fit compare an integer scrollWidth
// against a fractional available width and the text test fails by a fraction
// of a pixel AT EVERY FONT SIZE, so the binary search finds nothing that fits
// and drops the whole line to the 8px floor in a quad with room to spare. That
// is a silent, plausible-looking failure - the text is simply tiny - and it
// cost a debugging round on 2026-08-23. Rounding here makes every quantity the
// fit compares an integer, the way it was when the box was always 1000 wide.
//
// The counter-scale is then derived from the ROUNDED width (see
// applyTextLayer), so the box still lands exactly on the unit square and the
// containment argument survives the rounding intact.
function textLayoutBoxWidth(shape, fields, frameW, frameH) {
  // The CONTENT FRAME, not the outline: the stretch being corrected is the one
  // the warp introduces, and the warp only ever sees four corners. Clipping the
  // shape to a narrower outline does not stretch a glyph.
  const frame = shapeFrame(shape);
  const raw = (frame ? quadStretch(frame, frameW, frameH) : 1) / fields.aspect;
  const k = !isFinite(raw) || raw <= 0
    ? 1
    : Math.min(TEXT_WIDTH_FACTOR_MAX, Math.max(TEXT_WIDTH_FACTOR_MIN, raw));
  return Math.max(1, Math.round(UNIT_SIZE * k));
}

// The inset, in whole pixels, on a layout box of the given width. Horizontal
// only - the vertical inset is TEXT_INSET * UNIT_SIZE and never moves, because
// the box is always UNIT_SIZE tall.
function textLayoutInsetX(boxWidth) {
  return Math.round(TEXT_INSET * boxWidth);
}

function createTextLayerElement(layer, shape) {
  const box = document.createElement("div");
  box.className = "layer-box";

  const text = document.createElement("div");
  text.className = "layer-text";
  // Size, padding and the counter-scale are all applyTextLayer's - they all
  // depend on the layout width factor, which depends on the quad, which this
  // factory has no business reading. The stylesheet's unstretched defaults
  // stand for the instant between mounting and dressing.

  const inner = document.createElement("div");
  inner.className = "layer-text-inner";
  text.appendChild(inner);

  // Same contract as the media layers: a layer with nothing in it says so ON
  // THE OUTPUT. An empty text layer is otherwise perfectly invisible, and an
  // invisible shape at a projector sends you debugging the warp.
  const note = document.createElement("div");
  note.className = "layer-note";
  note.hidden = true;
  note.textContent = `${shape.name}\nno text set`;

  box.append(text, note);
  // Deliberately NOT dressed or fitted here. The fit measures clientWidth,
  // which is 0 on an element that is not in the document yet, and a fit
  // against a zero-width box collapses straight to the floor. renderLayer
  // runs applyTextLayer once the box is mounted - in the same synchronous
  // task, so nothing is ever painted undressed.
  return box;
}

// Writes every text field onto an already-mounted element and re-runs the
// fit. Called on creation and whenever a text field OR the layout width
// factor changes (see renderLayer) - the element is never rebuilt for a
// colour change or a corner drag, only re-dressed.
//
// `boxWidth` is the layout box's width in whole pixels (see
// textLayoutBoxWidth): the box is that wide, UNIT_SIZE tall, and counter-scaled
// back onto the unit square. Sizing the box and fitting into it happen
// together, here, on purpose - a box resized without a refit is a box the text
// no longer fits.
function applyTextLayer(box, layer, boxWidth) {
  const fields = sanitizeTextLayer(layer);
  const text = box.querySelector(".layer-text");
  const inner = box.querySelector(".layer-text-inner");
  const note = box.querySelector(".layer-note");
  if (!text || !inner) return;

  note.hidden = fields.text.trim() !== "";

  // The stretch, taken back out. The counter-scale is UNIT_SIZE/boxWidth rather
  // than 1/k, so it is computed from the width the box ACTUALLY HAS after
  // rounding: from the box's own top-left it maps [0, boxWidth] onto
  // [0, UNIT_SIZE] exactly, and the layout box covers the unit square - and
  // therefore the quad - with nothing left over and nothing rounded away.
  text.style.width = `${boxWidth}px`;
  text.style.height = `${UNIT_SIZE}px`;
  // The horizontal inset is a fraction of the box, so it lands back at
  // TEXT_INSET of the quad once the counter-scale has been applied. Whole
  // pixels, for the reason given on textLayoutBoxWidth.
  text.style.padding = `${TEXT_INSET * UNIT_SIZE}px ${textLayoutInsetX(boxWidth)}px`;
  text.style.transform = `scaleX(${UNIT_SIZE / boxWidth})`;

  // textContent, not innerHTML: the content is a string typed by a person and
  // is never markup. `white-space: pre-wrap` in the stylesheet is what makes
  // the embedded newlines that some catalogue entries carry render as the two
  // lines they are, instead of collapsing into one.
  inner.textContent = fields.text;
  inner.style.textAlign = fields.align;
  inner.style.color = fields.color;

  if (fields.outline && fields.outlineWidth > 0) {
    // em, so the stroke scales with whatever size the fit lands on.
    // `paint-order: stroke fill` (stylesheet) puts the stroke BEHIND the
    // fill - without it the stroke is centred on the glyph outline and eats
    // half its own width out of every thin stem, which thins a font exactly
    // where it is already weakest.
    inner.style.webkitTextStrokeWidth = `${fields.outlineWidth}em`;
    inner.style.webkitTextStrokeColor = "#000";
    inner.style.textShadow = "0 0.03em 0.06em rgba(0, 0, 0, 0.75)";
  } else {
    inner.style.webkitTextStrokeWidth = "0";
    inner.style.textShadow = "none";
  }

  fitTextLayer(text, inner, fields.maxSize, boxWidth);
}

// AUTO-FIT: shrink until it fits, never grow past the maximum.
//
// Measured in the UNWARPED content box - the space before matrix3d - which is
// the natural place for it and the reason the guarantee holds without any
// geometry bookkeeping. That box is UNIT_SIZE*k by UNIT_SIZE, and scaleX(1/k)
// maps it exactly onto the unit square the homography consumes, so fitting
// here is still fitting the quad however the quad is shaped. A quad redrawn
// at a different SIZE does not change k at all - only its proportions can -
// so the old property survives untouched: rescale the quad and the transform
// rescales the already-fitted text with it, no refit involved. Nothing here
// reads window dimensions; k is handed in already computed.
//
// Fitting is monotonic in font size (a bigger size never needs fewer lines),
// so a binary search over [TEXT_MIN_PX, max] converges on the largest size
// that fits. Both axes are checked: wrapping handles the ordinary case, but
// a single word longer than the box cannot wrap at all - it is scrollWidth
// that catches that one, and the reason word-level wrapping can stay the
// rule instead of breaking words mid-glyph-cluster.
function fitTextLayer(text, inner, maxSize, boxWidth) {
  const maxPx = maxSize * UNIT_SIZE;
  if (!inner.textContent) {
    inner.style.fontSize = `${maxPx}px`;
    return maxPx;
  }

  // The inset box, in real numbers. clientWidth/clientHeight INCLUDE padding,
  // so the inset comes off explicitly - measuring against them raw would fit
  // the text to the full quad and hand back exactly the edge-touching the
  // inset exists to prevent. Both are LAYOUT measurements, read before the
  // counter-scale, which is why the horizontal inset is the box's own and not
  // the unit square's.
  //
  // Every term here is a whole number - clientWidth and clientHeight because
  // Chrome rounds them, the insets because they are rounded at the same place
  // the padding is - so the comparisons below meet the integer scrollWidth on
  // its own terms. See textLayoutBoxWidth for what happens when they do not.
  const insetX = textLayoutInsetX(boxWidth);
  const insetY = TEXT_INSET * UNIT_SIZE;
  const availW = text.clientWidth - 2 * insetX;
  const availH = text.clientHeight - 2 * insetY;

  const fits = (px) => {
    inner.style.fontSize = `${px}px`;
    return inner.scrollWidth <= availW && inner.scrollHeight <= availH;
  };

  if (fits(maxPx)) return maxPx;

  let lo = TEXT_MIN_PX; // may not fit either - see the floor comment above
  let hi = maxPx;
  for (let i = 0; i < TEXT_FIT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  inner.style.fontSize = `${lo}px`;
  return lo;
}

// Everything that, when it changes, means the mounted element has to be
// re-dressed and re-fitted. Deliberately excludes opacity, which renderLayer
// already refreshes on every render and which cannot change the fit.
//
// The layout box's width is in here alongside the fields, and it is the one
// entry that is not a field: it is geometry, so a corner drag that changes the
// quad's PROPORTIONS now re-fits, where before nothing about the quad ever
// could. A drag that only moves or resizes the quad leaves the box width where
// it was and still costs nothing - which is the old no-refit property,
// unchanged. Being a whole number, it also cannot churn on floating-point
// noise in the mean-edge arithmetic.
function textLayerKey(layer, boxWidth) {
  const f = sanitizeTextLayer(layer);
  return JSON.stringify([f.text, f.maxSize, f.align, f.color, f.outline, f.outlineWidth, boxWidth]);
}

// =========================================================================
// SONG-AWARE LAYERS (painting half; the schema is up in STATE)
// =========================================================================
// FOUR TYPES, THREE OF WHICH HAVE NO FORMATTING AT ALL, and that is the design
// rather than a shortcut. song-video's quad IS its framing; song-intro is a
// locked template whose proportions are the whole of its design; gig-contact
// is decided once for the night. The only handles those three have are the
// shape's position and size, which move everything in them together.
//
// WHAT IS PAINTED HERE IS A PREVIEW, NOT THE SHOW. Muralista reads no song
// content - no lyrics, no translations, no taglines, no media - so a lyrics
// slot paints the dummy line, a video slot paints its own extent, and an intro
// paints its real title (the one thing gig.json is allowed to give up) with
// stand-ins for the two parts that live in the song file. Every stand-in SAYS
// it is one on the wall. A preview that flatters is not a preview.

// The types that are dressed after mounting rather than built complete: their
// content depends on the quad's proportions (and, for the intro, on which song
// is being previewed), neither of which a factory can read.
function typeIsDressed(type) {
  return typeTakesTextFormatting(type) || type === "song-intro" || type === "gig-contact" || type === "song-video";
}

// The layout box's width for any dressed type. The three unformatted ones take
// the automatic stretch correction and nothing else: there is no manual aspect
// control on them, so the multiplier is a flat 1. See TEXT ASPECT for why the
// correction exists at all and why it is done by resizing the layout box.
const UNSTRETCHED_FIELDS = { aspect: 1 };

function layoutBoxWidthFor(shape, layer, frameW, frameH) {
  const fields = typeTakesTextFormatting(layer.type) ? sanitizeTextLayer(layer) : UNSTRETCHED_FIELDS;
  return textLayoutBoxWidth(shape, fields, frameW, frameH);
}

// Everything that, when it changes, means the mounted element has to be
// re-dressed and re-fitted. Same contract as textLayerKey, extended to the
// three types that paint something other than a string.
function dressedLayerKey(shape, layer, boxWidth) {
  switch (layer.type) {
    case "text":
    case "song-lyrics":
      return textLayerKey(layer, boxWidth);
    case "song-intro":
      // The previewed title is in here, so switching songs in song visual
      // setup re-fits the card - a longer title breaks to more lines and the
      // whole block resizes with it, which is exactly what the auto-fit is for.
      return JSON.stringify(["intro", outputPreviewTitle(), boxWidth]);
    case "gig-contact": {
      const fields = sanitizeContactLayer(layer);
      return JSON.stringify(["contact", fields.text, resolveMediaUrl(fields.qrSrc) || "", boxWidth]);
    }
    case "song-video":
      return JSON.stringify(["song-video", shape.name, boxWidth]);
    default:
      return "";
  }
}

function dressLayer(box, shape, layer, boxWidth) {
  if (typeTakesTextFormatting(layer.type)) applyTextLayer(box, layer, boxWidth);
  else if (layer.type === "song-intro") applySongIntroLayer(box, boxWidth);
  else if (layer.type === "gig-contact") applyGigContactLayer(box, layer, boxWidth);
  else if (layer.type === "song-video") applySongVideoLayer(box, shape, boxWidth);
}

// Lays the counter-scaled box out and fits a block inside it, which is the
// same two-step every dressed type needs: size the layout box to the quad's
// stretch, scale it back onto the unit square, then binary-search the one
// size everything inside is a multiple of.
//
// `inset` is a fraction of the box, horizontally, and of the unit square,
// vertically - the same asymmetry applyTextLayer uses and for the same reason:
// the box is always UNIT_SIZE tall and only ever varies in width.
function layOutScaledBox(el, boxWidth, inset) {
  const insetX = Math.round(inset * boxWidth);
  const insetY = Math.round(inset * UNIT_SIZE);
  el.style.width = `${boxWidth}px`;
  el.style.height = `${UNIT_SIZE}px`;
  el.style.padding = `${insetY}px ${insetX}px`;
  el.style.transform = `scaleX(${UNIT_SIZE / boxWidth})`;
  return { insetX, insetY };
}

// AUTO-FIT over a CSS custom property, so a block of several parts shrinks as
// ONE THING. Everything inside the intro card is a multiple of `--t`, the
// title size, so searching over that single number keeps every proportion in
// the design exactly where the mock put it at any size the block lands on.
//
// Monotonic, same as fitTextLayer, and the same floor: below TEXT_MIN_PX a
// line on a wall is not small, it is unreadable, and content that still does
// not fit is left to overflow VISIBLY rather than be silently clipped.
function fitScaledBlock(box, block, prop, maxPx, insetX, insetY) {
  const availW = box.clientWidth - 2 * insetX;
  const availH = box.clientHeight - 2 * insetY;

  const fits = (px) => {
    block.style.setProperty(prop, `${px}px`);
    return block.scrollWidth <= availW && block.scrollHeight <= availH;
  };

  if (fits(maxPx)) return maxPx;

  let lo = TEXT_MIN_PX;
  let hi = maxPx;
  for (let i = 0; i < TEXT_FIT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  block.style.setProperty(prop, `${lo}px`);
  return lo;
}

// --- song-video -------------------------------------------------------------
// The playing song's media goes here, and Muralista is never allowed to know
// which file that is. So what it paints is THE EXTENT: the quad filled edge to
// edge in ink, with a hairline inset showing where the frame is and the shape's
// name in it. Filling edge to edge is not decoration - stretch-to-fill is fixed
// v1 behaviour, so the ground IS what the video will do.

function createSongVideoLayerElement(shape) {
  const box = document.createElement("div");
  box.className = "layer-box";

  const panel = document.createElement("div");
  panel.className = "layer-song-video";

  const label = document.createElement("div");
  label.className = "song-video-label";
  panel.appendChild(label);

  box.appendChild(panel);
  return box; // dressed by applySongVideoLayer once mounted - see renderLayer
}

function applySongVideoLayer(box, shape, boxWidth) {
  const panel = box.querySelector(".layer-song-video");
  if (!panel) return;
  layOutScaledBox(panel, boxWidth, 0);
  const label = panel.querySelector(".song-video-label");
  label.textContent = `SONG VIDEO\n${shape.name}`;
  // A fixed fraction rather than a fit: this is a label on a placeholder, and
  // a label that shrinks to fit a small quad tells you less than one that
  // overflows and gets clipped by the quad it is describing.
  label.style.fontSize = `${0.07 * UNIT_SIZE}px`;
}

// --- song-intro -------------------------------------------------------------

function createSongIntroLayerElement(shape) {
  const box = document.createElement("div");
  box.className = "layer-box";

  const panel = document.createElement("div");
  panel.className = "layer-intro";

  const block = document.createElement("div");
  block.className = "intro-block";

  // Rule and annotation share one line - see the SONG INTRO TEMPLATE comment.
  const head = document.createElement("div");
  head.className = "intro-head";
  const rule = document.createElement("span");
  rule.className = "intro-rule";
  const annotation = document.createElement("span");
  annotation.className = "intro-annotation";
  head.append(rule, annotation);

  const title = document.createElement("div");
  title.className = "intro-title";

  const tagline = document.createElement("div");
  tagline.className = "intro-tagline";

  block.append(head, title, tagline);
  panel.appendChild(block);
  box.appendChild(panel);
  return box;
}

function applySongIntroLayer(box, boxWidth) {
  const panel = box.querySelector(".layer-intro");
  const block = box.querySelector(".intro-block");
  if (!panel || !block) return;

  const { insetX, insetY } = layOutScaledBox(panel, boxWidth, INTRO_INSET);

  // TWO OF THE THREE ARE STAND-INS AND SAY SO. The title is the only part
  // gig.json can honestly supply; the translation and the tagline live in the
  // song file, which is below Muralista's line.
  block.querySelector(".intro-annotation").textContent = INTRO_PLACEHOLDER.annotation;
  block.querySelector(".intro-title").textContent = outputPreviewTitle();
  block.querySelector(".intro-tagline").textContent = INTRO_PLACEHOLDER.tagline;

  fitScaledBlock(panel, block, "--t", INTRO_TITLE_MAX_SIZE * UNIT_SIZE, insetX, insetY);
}

// --- gig-contact ------------------------------------------------------------
// One line, plus a QR code if a file was named for one. Laid out in the same
// ink vocabulary as the intro, because they are the two things the wall says in
// its own voice rather than the song's.

function createGigContactLayerElement(shape) {
  const box = document.createElement("div");
  box.className = "layer-box";

  const panel = document.createElement("div");
  panel.className = "layer-contact";

  const block = document.createElement("div");
  block.className = "contact-block";

  const qr = document.createElement("img");
  qr.className = "contact-qr";
  qr.alt = "";
  qr.hidden = true;

  const line = document.createElement("div");
  line.className = "contact-line";

  block.append(qr, line);
  panel.appendChild(block);

  // Same contract as every other layer: a shape with nothing in it says so ON
  // THE OUTPUT, because an invisible shape at a projector sends you debugging
  // the warp instead of the field you left empty.
  const note = document.createElement("div");
  note.className = "layer-note";
  note.hidden = true;
  note.textContent = `${shape.name}\nno contact line set`;

  box.append(panel, note);
  return box;
}

function applyGigContactLayer(box, layer, boxWidth) {
  const fields = sanitizeContactLayer(layer);
  const panel = box.querySelector(".layer-contact");
  const block = box.querySelector(".contact-block");
  const note = box.querySelector(".layer-note");
  if (!panel || !block) return;

  note.hidden = fields.text.trim() !== "" || !!fields.qrSrc;

  const { insetX, insetY } = layOutScaledBox(panel, boxWidth, INTRO_INSET);

  const qr = block.querySelector(".contact-qr");
  const qrUrl = fields.qrSrc ? resolveMediaUrl(fields.qrSrc) : null;
  qr.hidden = !qrUrl;
  if (qrUrl) qr.src = qrUrl;
  else qr.removeAttribute("src");

  block.querySelector(".contact-line").textContent = fields.text;

  // The QR is sized off the same `--t` as the line, so shrinking the block to
  // fit a small panel shrinks both together. A QR that outgrew its text would
  // be the one thing here that stops being scannable.
  fitScaledBlock(panel, block, "--t", CONTACT_MAX_SIZE * UNIT_SIZE, insetX, insetY);
}

// 1000x1000 canvas: numbered grid + brighter center crosshair + the
// shape's name + numbered corner markers 1-4 matching the nudge keys and
// shape.corners order [TL, TR, BR, BL]. Each shape gets a distinct hue
// (derived from its id) so multiple surfaces read as distinguishable
// patches of color/pattern on the wall.
function renderPatternLayer(shape) {
  const canvas = document.createElement("canvas");
  canvas.width = UNIT_SIZE;
  canvas.height = UNIT_SIZE;
  canvas.className = "pattern-canvas";
  const ctx = canvas.getContext("2d");
  const hue = shapeHue(shape);

  ctx.fillStyle = `hsl(${hue}, 55%, 12%)`;
  ctx.fillRect(0, 0, UNIT_SIZE, UNIT_SIZE);

  // 10x10 grid.
  const cell = UNIT_SIZE / 10;
  ctx.strokeStyle = `hsl(${hue}, 70%, 45%)`;
  ctx.lineWidth = 2;
  for (let i = 1; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, UNIT_SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(UNIT_SIZE, i * cell);
    ctx.stroke();
  }

  // Outer border.
  ctx.strokeStyle = `hsl(${hue}, 80%, 65%)`;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, UNIT_SIZE - 4, UNIT_SIZE - 4);

  // Brighter center crosshair.
  const mid = UNIT_SIZE / 2;
  ctx.strokeStyle = `hsl(${hue}, 90%, 80%)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mid - cell, mid);
  ctx.lineTo(mid + cell, mid);
  ctx.moveTo(mid, mid - cell);
  ctx.lineTo(mid, mid + cell);
  ctx.stroke();

  // Surface name, large, centered (offset below the crosshair so it doesn't
  // overlap it).
  ctx.fillStyle = "#fff";
  ctx.font = "bold 64px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(shape.name, mid, mid + cell * 1.6);

  // Numbered corner markers 1-4, matching both the nudge keys and
  // shape.corners order [TL, TR, BR, BL].
  const markerInset = 70;
  const markerPositions = [
    [markerInset, markerInset],
    [UNIT_SIZE - markerInset, markerInset],
    [UNIT_SIZE - markerInset, UNIT_SIZE - markerInset],
    [markerInset, UNIT_SIZE - markerInset],
  ];
  markerPositions.forEach(([mx, my], i) => {
    ctx.beginPath();
    ctx.arc(mx, my, 44, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.85)`;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#111";
    ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
    ctx.fillText(String(i + 1), mx, my + 2);
  });

  return canvas;
}

function shapeHue(shape) {
  // Deterministic hue derived from the shape id (simple string hash) so
  // colors stay stable across re-renders instead of flickering, and
  // distinct surfaces reliably land on distinct hues.
  let hash = 0;
  for (let i = 0; i < shape.id.length; i++) {
    hash = (hash * 31 + shape.id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

// The one change to the output render path (v2.4): a plain white plate above
// the surfaces, raised on request from the control window so the projector's
// lit rectangle can be seen and marked while the camera backdrop is being
// calibrated. It covers the surfaces rather than replacing them - dropping
// the plate leaves everything exactly as it was, still playing.
function setOutputWhiteField(on) {
  document.getElementById("output-white").hidden = !on;
}


function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.warn("Muralista: fullscreen request failed.", err);
    });
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function initOutput() {
  document.getElementById("output-root").hidden = false;
  channel.addEventListener("message", handleOutputMessage);
  // **The window handle is the route that works when the control page is framed** — see
  // `postToOutput`. Only the opener is believed: any page can post to a window, and this one
  // paints a wall.
  window.addEventListener("message", (event) => {
    if (window.opener && event.source !== window.opener) return;
    handleOutputMessage(event);
  });
  window.addEventListener("resize", () => {
    renderOutput();
    broadcastOutputSize();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") toggleFullscreen();
  });
  window.addEventListener("dblclick", toggleFullscreen);

  renderOutput();
  // **`hello` goes back the way it came.** The channel reaches a control page that is not framed;
  // the opener reaches the one that is, and it is the same handshake either way — the control
  // answers with the room, the media and the white plate's state.
  channel.postMessage({ kind: "hello" });
  if (window.opener) {
    try {
      window.opener.postMessage({ kind: "hello" }, "*");
    } catch (err) {
      console.warn("Muralista: could not greet the opener.", err);
    }
  }
  broadcastOutputSize();
}

// =========================================================================
// ROLE DETECTION / INIT
// =========================================================================

// Opening mapper.html straight from Finder (file://) breaks BroadcastChannel
// and media loading - catch it loudly instead of failing silently.
if (window.location.protocol === "file:") {
  window.alert(
    "Muralista must be served over HTTP, not opened as a file.\n\n" +
      "In a terminal:  cd mapper && python3 -m http.server 8123\n" +
      "Then open:  http://localhost:8123/mapper.html"
  );
}

const isOutputRole = new URLSearchParams(window.location.search).has("output");

if (isOutputRole) {
  document.body.classList.add("role-output");
  project = emptyProject(); // output never seeds from localStorage; waits for state broadcast
  initOutput();
} else {
  // **HOSTED IS A GIG CONTEXT AND IS KNOWN SYNCHRONOUSLY**, so the local store
  // is not read at all: the gig's own file arrives a moment later and would
  // replace it, and a local room painted in between is a room somebody sees
  // and reaches for. Standalone still loads it here, because standalone with
  // no gig is exactly what it is for. A remembered gig FOLDER is discovered
  // asynchronously, so that case paints the local room for one tick and then
  // adopts the gig's - it is never persisted over and never written back.
  project = isHostedGig() ? emptyProject() : loadProject();
  initControl();
}
