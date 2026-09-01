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
function migrateProject(obj) {
  const proj = Object.assign({}, obj);
  if (proj.backdropMode !== "camera") proj.backdropMode = "photo";
  if (typeof proj.cameraDeviceId !== "string") proj.cameraDeviceId = null;
  if (!isValidQuad(proj.cameraQuad)) proj.cameraQuad = null;

  const shapes = (Array.isArray(proj.surfaces) ? proj.surfaces : [])
    .map((surface) => migrateShape(surface))
    .filter(Boolean);

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

  return {
    id: typeof surface.id === "string" && surface.id ? surface.id : genShapeId(),
    name: typeof surface.name === "string" && surface.name.trim() ? surface.name.trim() : "Shape",
    corners: pinned,
    outline,
    layer,
    visible: surface.visible !== false,
  };
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
  return { defaults: {}, songs: {} };
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

function removeShape(id) {
  project.surfaces = project.surfaces.filter((s) => s.id !== id);
  if (selectedShapeId === id) {
    selectedShapeId = null;
    clearShapeSubselection();
  }
  commitProjectChange();
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
  if (isSongAwareType(type)) adoptGigDefaultIfUnset(type, shape.id);
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

// Called from setLayerType. Does NOT commit - its caller is mid-mutation and
// commits once for the whole change.
function adoptGigDefaultIfUnset(type, shapeId) {
  const sv = ensureSongVisuals();
  const existing = sanitizeShapeIdList(sv.defaults[type]).filter((id) => findShape(id));
  if (existing.length) {
    sv.defaults[type] = existing;
    return;
  }
  sv.defaults[type] = [shapeId];
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
  saveProject(project);
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
  channel.postMessage({
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
  channel.postMessage({ kind: "media", entries, nonce: Date.now() });
}

// Transport message shape (structure only — consumers land in slice 3 when
// video/layers arrive). Always carries a changing nonce so a receiver can
// treat every message as a fresh command rather than deduping by value
// (the lyric-translator's storage-event lesson applies to BroadcastChannel
// too: don't rely on "value changed" semantics for command messages).
function broadcastTransport(action) {
  channel.postMessage({ kind: "transport", action, nonce: Date.now() });
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

// Control -> output: flash each visible surface's name/id on the output
// window for a couple seconds so Jorge can tell which physical surface is
// which while standing at the wall. Always carries a changing nonce (project
// convention) so the output treats every click as a fresh trigger, even if
// somehow the same millisecond repeats.
function broadcastIdentify() {
  channel.postMessage({ kind: "identify", nonce: Date.now() });
}

// Control -> output: raise or drop a full-frame white plate on the output
// window. This exists for the camera backdrop's calibration step - the edge
// of the projector's lit rectangle can only be marked if the projector is
// actually lighting something, and "no signal" screens and desktop wallpaper
// are not a rectangle of known shape. Nonce per project convention.
let whiteFieldOn = false;

function broadcastWhiteField() {
  channel.postMessage({ kind: "whiteField", on: whiteFieldOn, nonce: Date.now() });
}

function toggleWhiteField() {
  whiteFieldOn = !whiteFieldOn;
  broadcastWhiteField();
  renderControl();
}

// Control -> output: a big number on the wall itself, so the countdown for
// "Adopt boundaries" can be read from where the performer is standing rather
// than from the laptop they just walked away from. `value` is the
// seconds remaining, or null to clear it. Nonce per project convention.
function broadcastCountdown(value) {
  channel.postMessage({ kind: "countdown", value, nonce: Date.now() });
}

// Output -> control: report the output window's actual pixel size so arrow-
// key nudges (control-side) can be expressed in real output pixels. Sent on
// load and on every resize; always carries a nonce per project convention,
// though this consumer reads current w/h directly rather than diffing.
function broadcastOutputSize() {
  channel.postMessage({ kind: "outputSize", w: window.innerWidth, h: window.innerHeight, nonce: Date.now() });
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
    broadcastCountdown(adoptCountdownValue); // nor with a stale countdown
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
      channel.postMessage({ kind: "transport", action, nonce: Date.now() });
    }
  } else if (msg.kind === "outputSize" && typeof msg.w === "number" && typeof msg.h === "number") {
    outputSize = { w: msg.w, h: msg.h };
  }
}

function handleOutputMessage(event) {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.kind === "state" && isValidProject(msg.project)) {
    project = msg.project;
    // Null in gig visual setup, which is the state where every shape paints.
    outputPreview = msg.preview && typeof msg.preview === "object" ? msg.preview : null;
    renderOutput();
  } else if (msg.kind === "media" && Array.isArray(msg.entries)) {
    applyMediaMessage(msg.entries);
  } else if (msg.kind === "identify") {
    showIdentifyOverlay();
  } else if (msg.kind === "whiteField" && typeof msg.on === "boolean") {
    setOutputWhiteField(msg.on);
  } else if (msg.kind === "countdown") {
    setOutputCountdown(typeof msg.value === "number" ? msg.value : null);
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

// Re-reads gig.json from the connected folder. Called on connect, on
// reconnect, and from the Reload button - a gig is a file somebody else wrote
// and may have rewritten while this window was open, and re-reading it is one
// click rather than a reload of the whole tool.
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
  // A gig that went away must not leave the tool previewing a song from it.
  if (!gigConnected() || !gigSongById(visualSetupSongId)) {
    visualSetupSongId = null;
    visualSetupMode = "gig";
  }
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

// Disconnects the folder. THE ASSIGNMENTS STAY IN THE PROJECT - they are
// authored work, not a fact about the folder, and a person clearing a folder
// is changing which gig they are looking at, not throwing away an afternoon of
// mapping. Reconnecting the same gig finds them again.
async function clearGigFolder() {
  gigFolderHandle = null;
  gigFolderState = "none";
  visualsWrittenAt = null;
  visualsWriteError = "";
  try {
    await clearStoredGigFolderHandle();
  } catch (err) {
    console.warn("Muralista: could not forget the gig folder.", err);
  }
  await refreshGig();
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

function setVisualSetupMode(mode) {
  visualSetupMode = mode === "song" ? "song" : "gig";
  if (visualSetupMode === "song" && !gigSongById(visualSetupSongId) && gig && gig.songs.length) {
    visualSetupSongId = gig.songs[0].id;
  }
  broadcastState();
  renderControl();
}

function setVisualSetupSong(songId) {
  visualSetupSongId = gigSongById(songId) ? songId : null;
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

// =========================================================================
// CONTROL UI
// =========================================================================

function renderControl() {
  renderShapeList();
  renderPreview();
  renderBackdrop();
  renderCamera();
  renderBackdropControls();
  renderMediaFolderControls();
  renderGigControls();
  renderLayerPanel();
}

// The media folder's whole sidebar section: which buttons are live, what the
// folder is called, and - the part that earns its place - WHICH names failed.
// A name that does not resolve is invisible on the output until the projector
// paints a failure note on the wall, which is the wrong place and the wrong
// moment to learn that a file was renamed. It belongs here, next to the folder
// it did not resolve in, where the person configuring is already looking.
function renderMediaFolderControls() {
  const section = document.getElementById("media-folder-section");
  if (mediaFolderState === "unsupported") {
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
  if (gigFolderState === "unsupported") {
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
  document.getElementById("btn-gig-reload").hidden = gigFolderState !== "granted";
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

  const setup = document.getElementById("gig-setup");
  setup.hidden = !gigConnected();
  if (gigConnected()) renderVisualSetup();

  const written = document.getElementById("visuals-status");
  const where = hosted ? "beside " + GIG_FILE_NAME : "into " + label;
  const message = visualsWriteError
    ? visualsWriteError
    : visualsWrittenAt
      ? `Wrote ${VISUALS_FILE_NAME} ${where} at ${visualsWrittenAt.toLocaleTimeString()}.`
      : "";
  written.hidden = !message;
  written.textContent = message;
}

function renderVisualSetup() {
  const modeSelect = document.getElementById("select-visual-setup-mode");
  modeSelect.value = visualSetupMode;

  const gigBlock = document.getElementById("gig-assignments");
  const songBlock = document.getElementById("song-setup");
  const inSong = visualSetupMode === "song";
  gigBlock.hidden = inSong;
  songBlock.hidden = !inSong;

  const hint = document.getElementById("visual-setup-hint");
  hint.textContent = inSong
    ? "Reassignment only: pick which existing shape of that kind this song uses. A song never holds its own geometry — re-mapping the room would leave it silently on the old position, wrong on stage with nothing reporting it. If no shape fits, go back to gig setup and add one. The wall is previewing this song, so the shapes it does not use are dark."
    : "The room's shapes and their types, serving every song. For a gig where all the songs follow one pattern this is the whole job — song setup exists only for a song that deviates.";

  if (inSong) renderSongSetup(songBlock);
  else renderGigAssignments(gigBlock);
}

function renderGigAssignments(container) {
  container.innerHTML = "";
  SONG_AWARE_TYPES.forEach((type) => {
    container.appendChild(
      buildAssignmentRow(type, "None", resolveShapesForType(project, type, null), (ids) =>
        setGigDefault(type, ids)
      )
    );
  });
}

function renderSongSetup(container) {
  const songSelect = document.getElementById("select-visual-setup-song");
  songSelect.innerHTML = "";
  gig.songs.forEach((song) => {
    const opt = document.createElement("option");
    opt.value = song.id;
    opt.textContent = song.title;
    songSelect.appendChild(opt);
  });
  songSelect.value = visualSetupSongId || "";

  const rows = document.getElementById("song-assignments");
  rows.innerHTML = "";
  const songId = visualSetupSongId;
  if (!songId) return;

  const sv = projectSongVisuals(project);
  // gig-contact is missing from this list and its absence is the rule: the
  // contact panel is a gig-level fact, so there is no per-song row for it.
  SONG_REASSIGNABLE_TYPES.forEach((type) => {
    const deviates = !!(sv.songs[songId] && sv.songs[songId][type]);
    const current = deviates ? resolveShapesForType(project, type, songId) : [];
    const fallback = resolveShapesForType(project, type, null);
    const fallbackLabel = fallback.length ? `Same as the gig (${fallback[0].name})` : "Same as the gig (none)";
    rows.appendChild(
      buildAssignmentRow(type, fallbackLabel, current, (ids) => setSongAssignment(songId, type, ids))
    );
  });
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
function buildAssignmentRow(type, emptyLabel, current, onChange) {
  const row = document.createElement("div");
  row.className = "assignment-row";

  const id = `assign-${type}`;
  const label = document.createElement("label");
  label.setAttribute("for", id);
  label.textContent = type.replace(/^(song|gig)-/, "");

  const select = document.createElement("select");
  select.id = id;

  const none = document.createElement("option");
  none.value = "";
  none.textContent = emptyLabel;
  select.appendChild(none);

  const candidates = shapesOfType(project, type);
  candidates.forEach((shape) => {
    const opt = document.createElement("option");
    opt.value = shape.id;
    opt.textContent = shape.name;
    select.appendChild(opt);
  });

  if (!candidates.length) {
    none.textContent = `No ${type} shape yet`;
    select.disabled = true;
  }

  // A set of two or more can only have come from a hand-edited file, and this
  // one-shape picker cannot express it. Saying so beats silently showing the
  // first of them and then overwriting the rest on the next change.
  if (current.length > 1) {
    const many = document.createElement("option");
    many.value = "__many__";
    many.textContent = `${current.length} shapes (edited by hand)`;
    select.appendChild(many);
    select.value = "__many__";
  } else {
    select.value = current.length ? current[0].id : "";
  }

  select.addEventListener("change", () => {
    if (select.value === "__many__") return;
    onChange(select.value ? [select.value] : []);
  });

  row.append(label, select);
  return row;
}

// ONE LIST, because there is one kind of thing in it. Row order is paint
// order (later = on top), and since v8 that includes fill shapes - the rule
// that used to pin black above everything is gone, and the ▲ / ▼ buttons work
// on every row.
function renderShapeList() {
  const list = document.getElementById("shape-list");
  list.innerHTML = "";

  if (project.surfaces.length === 0) {
    const empty = document.createElement("li");
    empty.className = "surface-list-empty";
    empty.textContent = "No shapes yet. Add one to get started.";
    list.appendChild(empty);
    return;
  }

  project.surfaces.forEach((shape, index) => {
    const row = document.createElement("li");
    row.className = "surface-row";
    if (shape.id === selectedShapeId) row.classList.add("selected");
    if (!shape.visible) row.classList.add("hidden-surface");

    row.addEventListener("click", () => selectShape(shape.id));

    const nameSpan = document.createElement("span");
    nameSpan.className = "surface-name";
    // The outline's point count rides in the row: it is the one number that
    // says whether a shape is still the square it started as or has been
    // traced, and it is the same number on every row now.
    nameSpan.textContent = `${shape.name} \u00b7 ${shape.outline.length}`;
    row.appendChild(nameSpan);

    const actions = document.createElement("div");
    actions.className = "surface-actions";

    // Z-order: moves the shape within project.surfaces, which is the
    // render/stacking order in both preview and output (later = on top).
    // Disabled at the ends of the list rather than hidden, so the row's
    // button layout stays stable as shapes reorder around it.
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "icon-btn";
    upBtn.title = "Move up the list (render earlier / further back)";
    upBtn.textContent = "▲";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveShapeUp(shape.id);
    });
    actions.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "icon-btn";
    downBtn.title = "Move down the list (render later / on top)";
    downBtn.textContent = "▼";
    downBtn.disabled = index === project.surfaces.length - 1;
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveShapeDown(shape.id);
    });
    actions.appendChild(downBtn);

    const visBtn = document.createElement("button");
    visBtn.type = "button";
    visBtn.className = "icon-btn";
    visBtn.title = shape.visible ? "Hide shape" : "Show shape";
    visBtn.textContent = shape.visible ? "\u{1F441}" : "\u{1F648}"; // eye / eye-blocked-ish
    visBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleShapeVisible(shape.id);
    });
    actions.appendChild(visBtn);

    // Duplicate: the one-gesture way to register an overlay exactly onto an
    // existing shape (same geometry, same layer, dropped in right after the
    // original so it renders on top - see duplicateShape()).
    const dupBtn = document.createElement("button");
    dupBtn.type = "button";
    dupBtn.className = "icon-btn";
    dupBtn.title = "Duplicate shape (same outline, frame and layer, for exact registration)";
    dupBtn.textContent = "⧉";
    dupBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      duplicateShape(shape.id);
    });
    actions.appendChild(dupBtn);

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "icon-btn";
    renameBtn.title = "Rename shape";
    renameBtn.textContent = "✏️"; // pencil
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = window.prompt("Rename shape", shape.name);
      if (next !== null) renameShape(shape.id, next);
    });
    actions.appendChild(renameBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn danger";
    deleteBtn.title = "Delete shape";
    deleteBtn.textContent = "\u{1F5D1}\uFE0F"; // trash
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.confirm(`Delete "${shape.name}"?`)) removeShape(shape.id);
    });
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    list.appendChild(row);
  });
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
  project.surfaces.filter((shape) => shape.visible).forEach((shape) => renderShapePreview(svg, shape));

  // Handles for the selected shape go last, so they sit above every shape's
  // body rather than being buried under whatever paints after it.
  const selected = getSelectedShape();
  if (selected) renderShapeHandles(svg, selected);
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

  const body = document.createElementNS(SVG_NS, "polygon");
  body.setAttribute("points", points);
  body.setAttribute("class", "preview-shape-body" + (selected ? " selected" : "") + dark);
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
  // Click-to-select + whole-shape drag in one gesture.
  body.addEventListener("pointerdown", (e) => startShapeDrag(e, svg, shape));
  svg.appendChild(body);

  const edge = document.createElementNS(SVG_NS, "polygon");
  edge.setAttribute("points", points);
  edge.setAttribute("class", "preview-shape-outline" + (selected ? " selected" : "") + dark);
  svg.appendChild(edge);

  if (type !== "pattern" && type !== "fill") {
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
// ADOPT BOUNDARIES
// =========================================================================
// Raise a white plate, photograph the empty wall, count the thing into place
// on the wall itself, photograph it again, and keep the region that got
// DARKER. Then trace that region and make it the shape's OUTLINE.
//
// AVAILABLE ON EVERY SHAPE, and that is v8's doing rather than a new feature:
// on a fill shape this is the performer mask, and on a video shape it clips an
// animation to the silhouette of a real object on the stage. It was only ever
// a keep-out's gesture because a keep-out was the only thing with an outline.
//
// IT WRITES THE OUTLINE, and what the content does about that is the count
// rule's business rather than this function's (see shapeFrame). Which lands in
// the right place on both of the cases that turn up at a wall: a silhouette
// comes back with more than four points, so the content stays warped where it
// was and starts being clipped by the shape; a flat rectangular thing - a
// placed box, a panel - comes back as a quad, and a quad is precisely
// something content can be warped ONTO, so it is. Adopt the boundaries of a
// box on a video shape and the video lands on the box.
//
// IT DETECTS A DIFFERENCE, so the thing must be ABSENT FROM ONE OF THE TWO
// FRAMES. It finds a person who walks into the beam, or an object placed and
// then removed. It cannot find a painting that hung on that wall the whole
// time - there is nothing to difference against, and no threshold setting
// changes that. Said out loud in the panel too, because it is the one thing
// about this gesture that surprises people.
//
// AND THE SHADOW RULE IS UNCHANGED: for anything standing out from the wall,
// trace the SHADOW, not the thing. The camera and the lens do not stand in the
// same place, so they disagree about where a body is; they cannot disagree
// about where its shadow falls, because the shadow lands on the wall plane,
// which is exactly where the existing calibration is exact.
//
// ACCURACY IS EXPLICITLY NOT THE GOAL. A coarse blob roughly the right shape
// is the CORRECT output here: the margin slider has to inflate it anyway (a
// performer sways), and a few points get pushed by hand afterwards. So there
// is no smoothing pass, no morphological cleanup and no adaptive
// thresholding - just enough to get one blob instead of noise, with a single
// threshold slider where a guess would otherwise go.
//
// Out of scope, deliberately: following the performer live. A mask that
// flickers on a dark stage is worse than no mask.

// ~320px wide is plenty for a shape that is about to be inflated by a margin
// and tidied by hand, and it keeps the whole pass well inside one frame.
const SHADOW_CAPTURE_WIDTH = 320;

// Long enough for the plate to reach the wall AND for the camera's auto
// exposure to finish stopping down for it. Both frames are then taken under
// the same exposure, which matters more than either being taken quickly.
const SHADOW_PLATE_SETTLE_MS = 900;

// THE INVARIANT, and everything else in this section serves it:
//
//   FRAMES A AND B MUST BE PHOTOGRAPHS OF THE SAME PLAIN WHITE PLATE AND
//   NOTHING ELSE. The only difference between them is the thing that walked
//   into the room.
//
// It binds at the two CAPTURE INSTANTS and nowhere else. What the wall does in
// between is free, and v1.2.3 spends that freedom: the plate comes DOWN for
// the whole countdown, because a shadow only exists where projected light is
// being blocked, and nothing is being photographed while somebody walks into
// place. Standing in a full white field for ten seconds hurts, and it bought
// nothing.
//
// Anything the TOOL paints - the countdown, a status plate, a focus ring - has
// to be off the output before either shutter, with a settle elapsing
// afterwards. The difference is signed, so anything that darkens the plate
// between the two captures is read as the thing being traced; a countdown
// still on the wall at capture time does not corrupt the shape a little, it
// becomes the shape.
//
// AND A DOM IS NOT A CAMERA, which is what the v1.2.1 build got wrong. Taking
// the countdown off the output and then sleeping 300ms looks like it honours
// the invariant, and in the tool's own timeline it does - measured on
// 2026-08-23, the projector showed a clean plate for 286ms before the shutter.
// But a camera does not report the present. Between the projector painting a
// frame and drawImage(video) yielding it there is the display's own latency,
// the sensor's exposure window, the camera's internal pipeline, USB transport
// and Chrome's decode - 100-200ms on an ordinary webcam and LONGER IN A DIM
// ROOM, because a darker room means a longer exposure. That total is the
// number this settle has to beat, and 300ms sat squarely inside it. So a run
// came back tracing the whole lit rectangle: frame B was a photograph of a
// countdown that had already left the screen.
//
// WHAT THIS SETTLE NOW HAS TO ABSORB, since v1.2.3 leaves the wall DARK for
// the whole countdown (see the sequence in adoptShapeBoundaries), is more than
// the pipeline: the camera has spent ten seconds looking at an unlit wall and
// its auto exposure has opened up to suit. Raising the plate again asks it to
// close back down, and that takes appreciably longer than a frame or two.
// 2000ms buys the pipeline latency AND that recovery, and it costs a person
// two seconds once per capture - against standing in a full white beam for the
// entire countdown, which is what it buys them out of.
//
// IT MUST STAY LONGER THAN SHADOW_PLATE_SETTLE_MS, and that inequality is
// load-bearing rather than incidental: frame A is only clean if the camera's
// latency is under the plate settle, and frame B is only contaminated if that
// latency is over this one. Keeping this the larger of the two makes "frame A
// clean AND frame B dirty" an empty set at every possible camera latency.
//
// It is still a GUESS - the camera's latency cannot be measured from here -
// which is exactly why the failsafe below exists rather than being belt to
// this brace. Under v1.2.3 the failsafe is also what catches a re-light that
// did not finish in time, which is the new way this can go wrong.
const SHADOW_RELIGHT_SETTLE_MS = 2000;

// Anything smaller than this fraction of the frame is noise, not a person.
const SHADOW_MIN_BLOB_FRACTION = 0.002;

// THE FAILSAFE. If more than this fraction of the LIT RECTANGLE got darker
// between the two photographs, the plate was not clean and the difference is
// not a thing standing in front of it. A performer's shadow is a fraction of
// the wall; half of the whole lit area is the plate itself changing.
//
// This exists because the failure it catches produced a plausible-looking
// GARBAGE OUTLINE rather than an error - a shape, with the right number of
// points, that simply was not the performer. This repo's whole discipline is
// that failures are visible, and a wrong shape that looks like a shape is the
// worst thing this gesture can hand back. It also catches the other way the
// plate stops being clean, which no settle can fix: the camera's auto exposure
// drifting between two photographs taken ten seconds apart.
const ADOPT_MAX_DARKENED_FRACTION = 0.5;

// A HANDFUL OF POINTS, NOT A TRACING. Thirty points around a real silhouette
// came back jagged - every wrinkle of a jacket and every gap under an arm
// faithfully recorded - and jagged is the wrong answer here twice over. It is
// not what the shape is FOR: the margin slider has to inflate it anyway, and a
// mask has to be generously bigger than the thing, so detail at the outline is
// detail that gets swallowed. And it is not editable: a dozen points can be
// pushed by hand at a wall, thirty cannot.
//
// Simple and generous is the goal, and the convex hull below is what delivers
// it - see shadowRingFromFrames.
const SHADOW_TARGET_MIN_POINTS = 8;
const SHADOW_TARGET_MAX_POINTS = 14;

// Control-local, never persisted and never broadcast. These are capture
// settings for one gesture against one room's light, not geometry: putting
// them in the venue file would ship a transient camera parameter inside the
// artifact this tool exists to produce.
let adoptThreshold = 22; // 0-255 luminance drop
let adoptCountdownSeconds = 10;
let adoptRunning = false;
let adoptCountdownValue = null;

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// Why the button is disabled, or null if it is not. Said out loud in the
// panel rather than left as a dead control.
function adoptBoundariesBlocker() {
  if (!isCameraMode()) return "Set Backdrop \u2192 Source to Live camera first.";
  if (!isCameraEnabled()) return "Enable the camera first.";
  if (!isValidQuad(project.cameraQuad)) {
    return "Calibrate the camera first. The capture maps what it traces into output space through that calibration, so without it there is nothing to map through.";
  }
  return null;
}

// One frame of the RAW camera feed as luminance, downscaled. Raw is the
// right space: project.cameraQuad's points were placed on the untransformed
// feed, so normalized raw-frame coordinates and normalized camera-space
// coordinates are the same thing. drawImage reads the video's own frame and
// ignores the CSS rectification transform, which is what we want.
function grabCameraFrameLuma(video) {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const w = SHADOW_CAPTURE_WIDTH;
  const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const luma = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    // Rec.601 luma in integer arithmetic.
    luma[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }
  return { w, h, luma };
}

// Keeps only the largest 8-connected component. 8-connectivity rather than
// 4 because a silhouette pinched to a diagonal thread at a wrist or an ankle
// should stay ONE blob - splitting a person into a body and a detached hand
// is the failure this is guarding against, and it costs nothing.
function largestBlob(mask, w, h) {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let next = 0, best = 0, bestSize = 0;

  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || label[seed]) continue;
    next++;
    let top = 0, size = 0;
    stack[top++] = seed;
    label[seed] = next;
    while (top > 0) {
      const i = stack[--top];
      size++;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !label[j]) {
            label[j] = next;
            stack[top++] = j;
          }
        }
      }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }

  if (bestSize < w * h * SHADOW_MIN_BLOB_FRACTION) return null;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = label[i] === best ? 1 : 0;
  return out;
}

// THE CONVEX HULL OF THE BLOB, and the hull is the whole of the simplification
// rather than a step in it.
//
// What was here before walked the blob's boundary pixel by pixel (Moore
// neighbours) and then thinned the result. That is a faithful tracing, and
// faithful is exactly wrong for this: it keeps every concavity - the gap
// between an arm and a body, the notch under a chin - and a mask is supposed
// to COVER those, not follow them into their corners. Hulling removes concave
// noise by construction, with no threshold and nothing to tune, and it can
// only ever make the shape bigger, which is the direction a mask is allowed to
// be wrong in.
//
// It also lands close to the coffin-ish shape sketched in the design session,
// which is what a standing person's shadow actually is once you stop
// pretending to trace fingers.
//
// ONE PASS PER ROW is all the input the hull needs. Any pixel strictly between
// the leftmost and rightmost set pixel of its own row lies on the segment
// joining them, so it is inside the hull and cannot be a vertex of it.
// Discarding those turns tens of thousands of candidate points into at most
// two per row, exactly, with no approximation anywhere.
function blobExtremePoints(mask, w, h) {
  const pts = [];
  for (let y = 0; y < h; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (lo < 0) lo = x;
        hi = x;
      }
    }
    if (lo < 0) continue;
    pts.push([lo, y]);
    if (hi !== lo) pts.push([hi, y]);
  }
  return pts;
}

// Andrew's monotone chain. Returns the hull in clockwise order for a
// y-downward raster - which is the same winding the rest of this file uses for
// a ring, so the result drops straight into shape.outline.
function convexHull(points) {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const half = (source) => {
    const out = [];
    for (const p of source) {
      // <= 0 drops collinear points too: three points in a line make a vertex
      // that is not a corner, and every one of them costs a handle at the wall.
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop(); // the shared endpoint, contributed by the other half
    return out;
  };

  const hull = half(pts).concat(half(pts.slice().reverse()));
  return hull.length >= 3 ? hull : points.slice();
}

// Ramer-Douglas-Peucker on an open polyline. The contour is a closed ring
// walked from one point back to it, so running it open keeps that point
// pinned, which is harmless for a shape about to be edited by hand.
function rdp(points, eps) {
  if (points.length < 3) return points.slice();
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);

  let maxD = -1, idx = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const d = len < 1e-9
      ? Math.hypot(x - ax, y - ay)
      : Math.abs(dy * x - dx * y + bx * ay - by * ax) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }

  if (maxD > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

// Binary-searches RDP's tolerance for a ring in the target point range. A
// fixed epsilon cannot do this: the right tolerance depends on how big the
// person came out in frame, which is a property of the room. If the contour
// is too short to reach the minimum, the tightest result is the honest
// answer - there was simply not that much shape there.
function simplifyRingToRange(contour, minPts, maxPts) {
  let lo = 0.05, hi = Math.max(contour.length, 64);
  const finest = rdp(contour, lo);
  if (finest.length <= maxPts) return finest;

  let best = finest;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const out = rdp(contour, mid);
    if (out.length > maxPts) {
      lo = mid;
    } else if (out.length < minPts) {
      hi = mid;
      best = out;
    } else {
      return out;
    }
  }
  return best;
}

// =========================================================================
// TAKING THE CAMERA'S OWN BRIGHTNESS OUT OF THE COMPARISON
// =========================================================================
// A SHADOW IS A LOCAL DARKENING; AUTO EXPOSURE IS A GLOBAL GAIN. Two
// photographs of the same wall taken ten seconds apart are almost never at the
// same brightness - the camera opens up while the plate is down for the
// countdown and has not finished closing again when the second one is taken -
// and until v1.2.4 that difference went straight into the signed difference
// and darkened every pixel at once. Measured with a simulated auto exposure:
// gain 1.30 at frame A against 0.59 at frame B, the whole field reading as
// changed, and the failsafe refusing every time. Locking the camera's exposure
// made it work at any latency, which made a camera setting a PRECONDITION for
// the feature. This is that precondition removed.
//
// Estimate what the camera did, divide it out, then difference as before.
//
// FROM THE BRIGHT END, NOT THE MIDDLE. The obvious robust statistic is the
// median, and a median breaks down once the darkened part covers half the lit
// rectangle. But the thing being estimated is the brightness of the PLATE, and
// everything this gesture is looking for is DARKER than the plate - a shadow,
// an object, a countdown that should not be there. So the estimate should come
// from as far up the bright side as noise allows, where the contaminant never
// is. The 90th percentile holds while nine tenths of the wall is covered,
// where the median gives up at half.
//
// That margin is what keeps the failsafe's teeth, which a median would have
// pulled. With a median, something opaque covering 70% of the field drags the
// estimate onto the covered part, normalises it back to "correct", and the
// tool traces nothing instead of refusing. Taken from the bright end the
// estimate stays on the uncovered plate, the 70% still reads as darkened, and
// the failsafe fires - which is the answer that sends somebody to go and look
// at their projector. Everything between the failsafe's 50% and this
// estimator's 90% is refused rather than quietly explained away.
//
// The one thing no percentile can see through is a plate that went dark
// EVERYWHERE by the same factor: that is arithmetically indistinguishable from
// the camera stopping down, in two frames that carry nothing else. It comes
// back as "nothing traced" rather than a wrong shape, which is the safe way to
// be unable to tell.
const ADOPT_GAIN_PERCENTILE = 0.9;

// A gain this far from 1 is not an exposure adjustment, it is a broken frame,
// and dividing by it would turn noise into a silhouette.
const ADOPT_GAIN_MIN = 0.125;
const ADOPT_GAIN_MAX = 8;

// A frame whose plate has clipped carries no information about how much
// brighter it "really" is - 255 is 255 whether the true value was 260 or 600 -
// so a ratio taken across a clipped percentile is a number made up out of the
// clamp. Measured: a plate at 220 with the camera 1.6x and 2.2x brighter both
// estimate as 1.159, which is the clamp talking. When either side is clipped
// the honest answer is to not normalise at all.
const ADOPT_CLIPPED = 255;

// The value at which `p` of the population sits at or below, straight off a
// 256-bin histogram. Exact, and cheaper than sorting 57,600 samples.
function percentileFromHistogram(hist, count, p) {
  if (count <= 0) return 0;
  const target = count * p;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen >= target) return v;
  }
  return 255;
}

// How much brighter frame B is than frame A, as one number. 1 means the camera
// did not move. Falls back to 1 - no normalisation at all - whenever the
// answer is not usable, which is the conservative direction: it leaves the
// comparison exactly as v1.2.3 did it.
function estimateGlobalGain(histA, histB, litCount) {
  const a = percentileFromHistogram(histA, litCount, ADOPT_GAIN_PERCENTILE);
  const b = percentileFromHistogram(histB, litCount, ADOPT_GAIN_PERCENTILE);
  if (!(a > 0) || !(b > 0)) return 1;
  if (a >= ADOPT_CLIPPED || b >= ADOPT_CLIPPED) return 1; // see ADOPT_CLIPPED
  const gain = b / a;
  if (!isFinite(gain) || gain < ADOPT_GAIN_MIN || gain > ADOPT_GAIN_MAX) return 1;
  return gain;
}

// A -> B, in normalized OUTPUT space. Everything above, wired together.
//
// Returns { ring } on success, or { reason } saying which way it failed -
// "nothing" and "dirty-plate" are different things to tell somebody standing
// at a wall, and collapsing them into a null would put the failure this
// release exists to catch back into the same bucket as "you were not in shot".
function shadowRingFromFrames(frameA, frameB, threshold, H) {
  if (!frameA || !frameB || frameA.w !== frameB.w || frameA.h !== frameB.h) return { reason: "nothing" };
  const { w, h } = frameA;

  // Pass one: which pixels are inside the LIT RECTANGLE, and how bright each
  // photograph is there. Everything downstream is measured over that rectangle
  // rather than the whole camera frame - the camera sees the room as well as
  // the wall, and somebody walking about outside the projector's throw is not
  // what this is measuring. H maps normalized camera space onto the unit
  // output square, so "inside the lit rectangle" is just "lands in [0,1] on
  // both axes" - the same mapping the traced ring goes through further down,
  // asked a cheaper question. The answer is kept rather than recomputed,
  // because pass two needs it again.
  const lit = new Uint8Array(w * h);
  const histA = new Uint32Array(256);
  const histB = new Uint32Array(256);
  let litCount = 0;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const u = applyHomography(H, [(x + 0.5) / w, (y + 0.5) / h]);
      if (!u || u[0] < 0 || u[0] > 1 || u[1] < 0 || u[1] > 1) continue;
      lit[i] = 1;
      litCount++;
      histA[frameA.luma[i]]++;
      histB[frameB.luma[i]]++;
    }
  }

  const gain = estimateGlobalGain(histA, histB, litCount);
  // Whether the estimate had to give up because a plate was blown out. Not a
  // refusal on its own - two frames that clip the SAME way still difference
  // perfectly well - but if the comparison goes on to fail, this is almost
  // always why, and it is the one cause with a remedy on the camera rather
  // than on the wall.
  const clipped =
    percentileFromHistogram(histA, litCount, ADOPT_GAIN_PERCENTILE) >= ADOPT_CLIPPED ||
    percentileFromHistogram(histB, litCount, ADOPT_GAIN_PERCENTILE) >= ADOPT_CLIPPED;

  const mask = new Uint8Array(w * h);
  let darkenedInsideLit = 0;
  for (let i = 0; i < mask.length; i++) {
    // SIGNED, on purpose: a shadow is a DROP in light, so only pixels that got
    // darker count, and everything that got brighter is discarded for free.
    //
    // NORMALISED, since v1.2.4: frame B is divided back onto frame A's scale
    // before the comparison, so what is measured here is how much darker a
    // pixel got THAN THE REST OF THE FRAME. The threshold keeps its meaning -
    // it is still luma units on the plate's own scale - and the slider that
    // sets it still means what it said.
    const darker = frameA.luma[i] - frameB.luma[i] / gain > threshold;
    mask[i] = darker ? 1 : 0;
    if (darker && lit[i]) darkenedInsideLit++;
  }

  // The failsafe, now AFTER normalisation. It has stopped being an
  // auto-exposure detector - that is the one thing it should never have had to
  // be - and is back to what it was for: the plate was not clean. Anything
  // that survives having the global gain divided out of it is a real local
  // change, and half the lit rectangle changing locally is not a person
  // standing in front of a wall.
  const darkenedFraction = litCount > 0 ? darkenedInsideLit / litCount : 0;
  if (darkenedFraction > ADOPT_MAX_DARKENED_FRACTION) {
    return { reason: "dirty-plate", darkenedFraction, gain, clipped };
  }

  const blob = largestBlob(mask, w, h);
  if (!blob) return { reason: "nothing", gain, clipped };

  // Hull first, thin second. RDP only ever removes points, and removing a
  // vertex from a convex polygon leaves a convex polygon, so what comes out of
  // here is still convex and still covers the blob's own extremes.
  const hull = convexHull(blobExtremePoints(blob, w, h));
  if (!hull || hull.length < SHAPE_MIN_POINTS) return { reason: "nothing" };

  const simplified = simplifyRingToRange(hull, SHADOW_TARGET_MIN_POINTS, SHADOW_TARGET_MAX_POINTS);

  // Camera space -> output space, through the EXISTING calibration. The
  // stored points must be in output space, so the outline stays valid long
  // after the camera is unplugged.
  const ring = [];
  for (const [x, y] of simplified) {
    const p = applyHomography(H, [(x + 0.5) / w, (y + 0.5) / h]);
    if (p) ring.push(p);
  }
  return ring.length >= SHAPE_MIN_POINTS ? { ring, gain, clipped } : { reason: "nothing", gain, clipped };
}

function setAdoptStatus(text) {
  const el = document.getElementById("shape-adopt-status");
  if (el) el.textContent = text || "";
}

// The big number in the control window, so the countdown is readable from
// the desk as well as from the wall.
function setPreviewCountdown(value) {
  const el = document.getElementById("preview-countdown");
  if (!el) return;
  if (value == null) {
    el.hidden = true;
    el.textContent = "";
  } else {
    el.textContent = String(value);
    el.hidden = false;
  }
}

function showCountdown(value) {
  adoptCountdownValue = value;
  broadcastCountdown(value);
  setPreviewCountdown(value);
}

// The sequence, and its order is the whole design. See the section comment.
async function adoptShapeBoundaries(shapeId) {
  if (adoptRunning) return;
  const shape = findShape(shapeId);
  if (!shape) return;
  if (adoptBoundariesBlocker()) return;

  const H = computeHomography(project.cameraQuad, UNIT_SQUARE_CORNERS);
  if (!H) {
    setAdoptStatus("The camera calibration is degenerate - recalibrate before capturing.");
    return;
  }

  const video = document.getElementById("preview-camera");
  // If the plate was already up, leave it up afterwards: this gesture should
  // give the output back exactly as it found it.
  const plateWasUp = whiteFieldOn;
  adoptRunning = true;
  renderControl();

  try {
    // 1. Raise the white plate, and let the room settle under it.
    if (!whiteFieldOn) {
      whiteFieldOn = true;
      broadcastWhiteField();
    }
    setAdoptStatus("Lighting the wall\u2026");
    await delay(SHADOW_PLATE_SETTLE_MS);

    // 2. Frame A: the wall WITHOUT the thing. Taken BEFORE the countdown
    //    exists, so it cannot contain one.
    const frameA = grabCameraFrameLuma(video);
    if (!frameA) {
      setAdoptStatus("No camera frame to capture - is the feed running?");
      return;
    }

    // 3. Count the thing into place, on the wall and at the desk - and take
    //    the light off the wall while it happens. The countdown plate is
    //    opaque and dark (see .output-countdown), so raising it BEFORE
    //    dropping the white one means the mapped content never flashes up in
    //    the gap between two broadcasts.
    showCountdown(adoptCountdownSeconds);
    if (whiteFieldOn) {
      whiteFieldOn = false;
      broadcastWhiteField();
    }
    for (let t = adoptCountdownSeconds; t > 0; t--) {
      showCountdown(t);
      setAdoptStatus(`Get into the beam \u2014 ${t}\u2026`);
      await delay(1000);
    }

    // 4. Light the wall again, THEN take the countdown off it, then settle,
    //    then capture. That order matters for the same reason as step 3's: the
    //    white plate goes up underneath the dark countdown plate, so what the
    //    wall shows changes exactly once, from dark to white, with no frame of
    //    mapped content in between.
    //
    //    The settle has to outlast the camera's end-to-end latency AND the
    //    auto exposure closing back down after ten seconds of darkness - see
    //    SHADOW_RELIGHT_SETTLE_MS for why that is a much bigger number than it
    //    looks like it should be.
    whiteFieldOn = true;
    broadcastWhiteField();
    showCountdown(null);
    setAdoptStatus("Lighting the wall again\u2026");
    await delay(SHADOW_RELIGHT_SETTLE_MS);
    setAdoptStatus("Capturing\u2026");
    const frameB = grabCameraFrameLuma(video);

    // 5/6. Difference, blob, hull, simplify, and map into output space.
    const result = shadowRingFromFrames(frameA, frameB, adoptThreshold, H);
    if (result.reason === "dirty-plate") {
      const pct = Math.round(result.darkenedFraction * 100);
      // The camera's own brightness has already been divided out by the time
      // this fires (see estimateGlobalGain), so it is no longer a suspect and
      // is not offered as one. What is left is the wall.
      setAdoptStatus(
        result.clipped
          ? `The first photograph was blown out - the plate came back pure white, so there is no brightness left in it to compare against and ${pct}% of the field reads as darker. Nothing traced. Turn the camera's exposure down, or lock it, and try again.`
          : `The plate was not clean - ${pct}% of the lit field went darker relative to the rest of it, which is something covering the projection rather than a thing standing in front of it. Nothing traced. Check that nothing else is being projected onto that wall, and try again.`
      );
      return;
    }
    if (!result.ring) {
      setAdoptStatus(
        "Nothing changed between the two frames. Lower the threshold, or check that the thing was in the beam, inside the camera's view, and absent from the first frame."
      );
      return;
    }
    const ring = result.ring;

    // The OUTLINE only. A shape's content frame is not this gesture's to
    // touch: on a video shape the animation goes on being warped exactly as
    // it was, and starts being clipped to what was just traced.
    if (setShapeOutline(shapeId, ring)) {
      setAdoptStatus(
        `Traced ${ring.length} points into the outline. Push any point that reads wrong; on a fill shape, raise the margin until the shape is comfortably bigger than the thing.`
      );
    } else {
      setAdoptStatus("The traced shape came out unusable - try again with a different threshold.");
    }
  } catch (err) {
    console.warn("Muralista: adopting boundaries failed.", err);
    setAdoptStatus(`The capture failed: ${(err && err.message) || err}`);
  } finally {
    // 7. Give the output back as we found it, whatever happened above. Both
    //    directions, now that the sequence lowers the plate as well as raising
    //    it: an abort mid-countdown has to put a plate that was already up
    //    back up, not just take down one we raised.
    showCountdown(null);
    if (whiteFieldOn !== plateWasUp) {
      whiteFieldOn = plateWasUp;
      broadcastWhiteField();
    }
    adoptRunning = false;
    selectedShapeId = shapeId; // leave it selected and editable
    const status = document.getElementById("shape-adopt-status");
    const carried = status ? status.textContent : "";
    renderControl();
    setAdoptStatus(carried); // renderControl rebuilds the panel; keep the message
  }
}

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
  project.backdropMode = mode === "camera" ? "camera" : "photo";
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
  const camera = isCameraMode();
  document.getElementById("select-backdrop-mode").value = project.backdropMode;
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

let layerPanelKey = null;

function renderLayerPanel() {
  const container = document.getElementById("layer-panel");
  const shape = getSelectedShape();

  if (!shape) {
    layerPanelKey = null;
    container.innerHTML = '<p class="layer-panel-empty">Select a shape to edit it.</p>';
    return;
  }

  shape.layer = shape.layer || { type: "pattern", src: null, opacity: 1 };
  const layer = shape.layer;
  // The connected folder is part of the key, not just of the values: it
  // changes the src field's LABEL and what "Pick file…" writes, and both of
  // those are built in buildLayerPanel. Without it, connecting a folder would
  // leave the panel still saying "relative to mapper/media/".
  // The gig is part of the key too: it decides which types the picker offers,
  // and that list is built in buildLayerPanel. Without it, connecting a gig
  // would leave a panel whose Type menu still has no song-aware types in it.
  // The outline flag is in here because the outline-width control is BUILT
  // only when the outline is on, rather than built-and-disabled - so the toggle
  // is a structural change to the panel, not a value change in it.
  const key = `${shape.id}:${layer.type}:${mediaFolderState}:${mediaFolderLabel() || ""}:${gigConnected()}:${
    typeTakesTextFormatting(layer.type) ? sanitizeTextLayer(layer).outline : ""
  }`;

  if (key !== layerPanelKey) {
    layerPanelKey = key;
    buildLayerPanel(container, shape, layer);
  } else {
    updateLayerPanelValues(container, shape, layer);
  }
}

// WHICH TYPES THE PICKER OFFERS. The four song-aware ones appear only while a
// gig is connected: they resolve through a song, and a lyrics slot in a project
// with no songs is a shape nothing can light.
//
// A shape that ALREADY HAS one keeps it in the list even with no gig, and that
// is not a courtesy - a <select> whose value is not among its options shows the
// wrong thing, silently, and this shape's type is a fact whether or not the
// folder is connected right now.
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

function buildLayerPanel(container, shape, layer) {
  container.innerHTML = "";

  // Type selector. "fill" sits in the same list as everything else on purpose:
  // a shape that holds a colour is a shape with a type, not a second kind of
  // object with a section of its own.
  const typeRow = document.createElement("div");
  typeRow.className = "layer-field";
  const typeLabel = document.createElement("label");
  typeLabel.textContent = "Type";
  typeLabel.setAttribute("for", "layer-type-select");
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
  typeRow.append(typeLabel, typeSelect);
  container.appendChild(typeRow);

  // A file is only a file for the two types that read one. Everything below is
  // built INSIDE this branch, so "Pick file…" is not merely disabled on a
  // pattern, a text or a fill layer - it is not there, and cannot be.
  if (layer.type === "video" || layer.type === "image") {
    buildMediaSourceControls(container, shape, layer);
  }

  if (typeTakesTextFormatting(layer.type)) buildTextLayerControls(container, shape, layer);
  if (layer.type === "fill") buildFillLayerControls(container, shape, layer);
  if (layer.type === "gig-contact") buildContactLayerControls(container, shape, layer);
  if (layer.type === "song-intro" || layer.type === "song-video") buildLockedTypeNote(container, layer.type);

  // Opacity (all layer types).
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

  buildOutlineControls(container, shape);
  buildAdoptBoundariesControls(container, shape);
  updateLayerPanelValues(container, shape, layer);
}

// Video / image: src name field + file-pick convenience. Lifted out of
// buildLayerPanel so the one call site above is the only thing that decides
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
  const hint = document.createElement("p");
  hint.className = "layer-hint";
  hint.textContent = folderLabel
    ? `Picking a file only fills in the name above - the file itself must live in ${folderLabel}/.`
    : "Picking a file only fills in the path above - the file itself must already be copied into mapper/media/.";
  fileRow.append(fileBtn, fileInput, hint);
  container.appendChild(fileRow);

  if (layer.type === "image") {
    const webmHint = document.createElement("p");
    webmHint.className = "layer-hint";
    webmHint.textContent = "A .webm source (alpha transparency, Chrome-only) is a transport-synced overlay: it joins Play/Pause/Restart like a video layer instead of autoplaying on its own, so it starts with everything else.";
    container.appendChild(webmHint);
  }
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

  const colorHint = document.createElement("p");
  colorHint.className = "layer-hint";
  colorHint.textContent =
    "Black is the default and the case this exists for: the projector floods the whole background, so holding part of it dark is a decision the mapping has to carry. It paints in list order like every other shape - move it up or down to put it behind or in front of one.";
  container.appendChild(colorHint);

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

  const marginHint = document.createElement("p");
  marginHint.className = "layer-hint";
  marginHint.textContent =
    "How far the shape grows outward, as a fraction of frame height. A true dilation - it thickens thin limbs rather than lengthening them. Draw generously larger than the shadow: a performer sways, and an exact mask lets light onto the face on every lean.";
  container.appendChild(marginHint);
}

// The outline every shape has. Identical controls on every type, which is the
// point of v8 - there is no second panel left to behave differently.
function buildOutlineControls(container, shape) {
  panelDivider(container, "Outline");

  const pointRow = document.createElement("div");
  pointRow.className = "layer-field";
  const deletePointBtn = document.createElement("button");
  deletePointBtn.type = "button";
  deletePointBtn.id = "shape-delete-point";
  deletePointBtn.textContent = "Delete point";
  deletePointBtn.addEventListener("click", () => deleteShapePoint(shape.id, selectedPointIndex));
  const pointCount = document.createElement("span");
  pointCount.id = "shape-point-count";
  pointCount.className = "layer-opacity-value";
  pointRow.append(deletePointBtn, pointCount);
  container.appendChild(pointRow);

  const pointHint = document.createElement("p");
  pointHint.className = "layer-hint";
  pointHint.textContent =
    "Click an edge in the preview to insert a point and pull it out. Click a point to select it, then Delete (or the button) to remove it. Three points is the floor.";
  container.appendChild(pointHint);

  // Said only where it is true - see updateOutlinePanelValues. On a fill shape
  // there is no content to be warped and nothing here to explain.
  const framed = document.createElement("p");
  framed.id = "shape-frame-hint";
  framed.className = "layer-hint";
  container.appendChild(framed);

  const refitRow = document.createElement("div");
  refitRow.className = "layer-field";
  const refitBtn = document.createElement("button");
  refitBtn.type = "button";
  refitBtn.id = "shape-refit";
  refitBtn.textContent = "Re-fit content to this shape";
  refitBtn.addEventListener("click", () => refitShapeContent(shape.id));
  refitRow.appendChild(refitBtn);
  container.appendChild(refitRow);
}

// "Adopt boundaries" and the two knobs it needs. Both knobs are control-local
// (see adoptThreshold): they describe this room's light and how long it takes
// to walk to the wall, not the venue's geometry, and a transient camera
// setting has no business inside the artifact this tool exists to produce.
function buildAdoptBoundariesControls(container, shape) {
  panelDivider(container, "Adopt boundaries");

  const row = document.createElement("div");
  row.className = "layer-field";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "shape-adopt";
  btn.textContent = "Adopt boundaries…";
  btn.addEventListener("click", () => adoptShapeBoundaries(shape.id));
  row.appendChild(btn);
  container.appendChild(row);

  const status = document.createElement("p");
  status.id = "shape-adopt-status";
  status.className = "adopt-status";
  container.appendChild(status);

  const hint = document.createElement("p");
  hint.id = "shape-adopt-hint";
  hint.className = "layer-hint";
  container.appendChild(hint);

  // The two facts that decide whether this gesture can work at all, said
  // before it is pressed rather than after it comes back empty.
  const rules = document.createElement("p");
  rules.className = "layer-hint";
  rules.textContent =
    "It detects a DIFFERENCE between two photographs of the wall, so the thing has to be absent from one of them: it finds a person who walks in, or an object placed and removed, and cannot find a painting that was hanging there the whole time. And for anything standing out from the wall, trace the SHADOW, not the thing — the camera and the lens disagree about where a body is, and never about where its shadow falls.";
  container.appendChild(rules);

  const comfort = document.createElement("p");
  comfort.className = "layer-hint";
  comfort.textContent =
    "The wall goes dark while you walk in and lights again for the second photograph, so you are not standing in a white field for the whole count. The camera's exposure moving between the two photographs is corrected for, so auto exposure is fine; locking it (the Elgato Facecam can) is still the steadier setting if you have a moment.";
  container.appendChild(comfort);

  const secsRow = document.createElement("div");
  secsRow.className = "layer-field";
  const secsLabel = document.createElement("label");
  secsLabel.textContent = "Countdown (s)";
  secsLabel.setAttribute("for", "shape-adopt-countdown-input");
  const secsInput = document.createElement("input");
  secsInput.type = "number";
  secsInput.id = "shape-adopt-countdown-input";
  secsInput.min = "3";
  secsInput.max = "60";
  secsInput.step = "1";
  secsInput.value = String(adoptCountdownSeconds);
  secsInput.addEventListener("change", () => {
    const n = Math.round(Number(secsInput.value));
    adoptCountdownSeconds = isFinite(n) ? Math.max(3, Math.min(60, n)) : 10;
    secsInput.value = String(adoptCountdownSeconds);
  });
  secsRow.append(secsLabel, secsInput);
  container.appendChild(secsRow);

  const thrRow = document.createElement("div");
  thrRow.className = "layer-field";
  const thrLabel = document.createElement("label");
  thrLabel.textContent = "Threshold";
  thrLabel.setAttribute("for", "shape-adopt-threshold-input");
  const thrInput = document.createElement("input");
  thrInput.type = "range";
  thrInput.id = "shape-adopt-threshold-input";
  thrInput.min = "4";
  thrInput.max = "120";
  thrInput.step = "1";
  thrInput.value = String(adoptThreshold);
  const thrValue = document.createElement("span");
  thrValue.id = "shape-adopt-threshold-value";
  thrValue.className = "layer-opacity-value";
  thrValue.textContent = String(adoptThreshold);
  thrInput.addEventListener("input", () => {
    adoptThreshold = Number(thrInput.value);
    thrValue.textContent = String(adoptThreshold);
  });
  thrRow.append(thrLabel, thrInput, thrValue);
  container.appendChild(thrRow);

  const thrHint = document.createElement("p");
  thrHint.className = "layer-hint";
  thrHint.textContent =
    "How much darker a pixel must get to count. One knob, not a clever guess: raise it if the trace catches the whole wall, lower it if it finds nothing. A coarse blob is the right answer here - on a fill shape the margin has to inflate it anyway.";
  container.appendChild(thrHint);
}

// The text layer's own controls. Kept plain on purpose - the brutalist
// restyle is a separate build and will style whatever is here.
//
// Every field commits on 'input' rather than on 'change': tuning by eye at
// the wall, with the projector on, is the actual workflow for this layer, and
// a size that only lands when you let go of the slider cannot be tuned by
// eye. The same-key re-render path (updateTextLayerPanelValues) skips
// whichever control has focus, so committing per keystroke does not clobber
// an edit in progress.
// ICONS. Monochrome line glyphs on a 16x16 grid, stroked in currentColor with
// no fill anywhere - see the FORMAT BAR block in mapper.css for why the house
// style is this strict and where the one exception lives.
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
function buildTextLayerControls(container, shape, layer) {
  const fields = sanitizeTextLayer(layer);
  const isSlot = shape.layer.type === "song-lyrics";

  // Content. A slot's string is a PREVIEW of what Pregonero will put here; a
  // plain text layer's string is the content itself. Two different promises,
  // and the label is where the difference is visible.
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
  textHint.textContent = isSlot
    ? "The dummy line, and it is deliberately nasty: three rows, two hard breaks, quote marks, and a compound nobody would say out loud. It is measured against every line in the catalogue and is harder than all of them. Pregonero fills this slot from the song file on the night — this string is only ever what the layout is tuned against, so softening it makes the tuning feel finished without having tested anything."
    : "Wraps on word boundaries, and a line break here is a line break on the wall. Paste the longest line you will actually use — that is the one the layout has to survive.";
  container.appendChild(textHint);

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
  // see renderLayerPanel's key.
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

  const hint = document.createElement("p");
  hint.className = "layer-hint";
  hint.textContent =
    "A file name, resolved in the media folder like any other source — Muralista does not generate the code. Generate it elsewhere, drop the PNG in beside the videos, and scan it with a phone off the wall before the doors open. One line and one code, for the whole night: this panel is not per-song.";
  container.appendChild(hint);
}

// song-intro and song-video have NO settings, and saying nothing would read as
// a panel that failed to load. So it says what the type is and where the only
// two handles are.
function buildLockedTypeNote(container, type) {
  const hint = document.createElement("p");
  hint.className = "layer-hint";
  hint.textContent =
    type === "song-intro"
      ? "A locked template: the song's translation, title and tagline, in fixed proportions. There is nothing to format — the shape's position and size are the only decisions, and they move all three parts together. The tagline is the smallest thing on the wall and the first thing to check from the back of the room."
      : "The playing song's video, stretched to fill the quad. The quad is the framing, so there is nothing to set: a video that needs to sit differently is a different shape. The wall shows the extent it will fill.";
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

// Refreshes field values without rebuilding the DOM (see renderLayerPanel).
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

  updateOutlinePanelValues(container, shape);
  updateAdoptPanelValues(container, active);
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

function updateOutlinePanelValues(container, shape) {
  const count = shape.outline.length;

  const pointCount = container.querySelector("#shape-point-count");
  if (pointCount) {
    pointCount.textContent =
      selectedPointIndex == null ? `${count} points` : `point ${selectedPointIndex + 1} of ${count}`;
  }

  const deletePointBtn = container.querySelector("#shape-delete-point");
  if (deletePointBtn) deletePointBtn.disabled = selectedPointIndex == null || count <= SHAPE_MIN_POINTS;

  const frameHint = container.querySelector("#shape-frame-hint");
  if (frameHint) {
    frameHint.textContent = !shapeCarriesContent(shape)
      ? ""
      : shapeOutlineIsFrame(shape)
        ? "At four points the outline is what the content is warped onto, so dragging a point reshapes the content with it."
        : "Past four points the content stays warped onto the four corners this shape had at four, and the outline only clips it. Re-fit moves it onto the shape as it is now.";
  }

  // Nothing to re-fit onto a shape that is still its own frame, and nothing to
  // re-fit at all on a fill. Disabled rather than hidden, so the row does not
  // appear and disappear under the pointer as points are added and removed.
  const refitBtn = container.querySelector("#shape-refit");
  if (refitBtn) refitBtn.disabled = !shapeCarriesContent(shape) || shapeOutlineIsFrame(shape);
}

function updateAdoptPanelValues(container, active) {
  // The capture needs a calibrated, running camera. Disabled with the reason
  // said out loud, rather than left as a dead control.
  const blocker = adoptBoundariesBlocker();
  const adoptBtn = container.querySelector("#shape-adopt");
  if (adoptBtn) {
    adoptBtn.disabled = !!blocker || adoptRunning;
    adoptBtn.textContent = adoptRunning ? "Capturing…" : "Adopt boundaries…";
  }
  const adoptHint = container.querySelector("#shape-adopt-hint");
  if (adoptHint) {
    adoptHint.textContent = blocker
      ? blocker
      : "Raises the white plate, photographs the wall, counts you (or whatever is being traced) into the beam, photographs it again, and makes what got darker this shape's outline.";
    adoptHint.classList.toggle("blocked", !!blocker);
  }
  const thrInput = container.querySelector("#shape-adopt-threshold-input");
  if (thrInput && active !== thrInput) thrInput.value = String(adoptThreshold);
  const thrValue = container.querySelector("#shape-adopt-threshold-value");
  if (thrValue) thrValue.textContent = String(adoptThreshold);
  const secsInput = container.querySelector("#shape-adopt-countdown-input");
  if (secsInput && active !== secsInput) secsInput.value = String(adoptCountdownSeconds);
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

  document.getElementById("btn-open-output").addEventListener("click", () => {
    // Hand the output window THIS window's build token (see the bootstrap in
    // mapper.html) so the two documents load the same mapper.js and mapper.css
    // by construction. Reloading the control window mints a fresh token, and
    // the next click re-navigates the named output window onto it.
    const url = "mapper.html?output&v=" + encodeURIComponent(window.MURALISTA_BUILD);
    const win = window.open(url, "mapper-output");
    if (win) {
      // If the named window already exists (possibly behind other windows or
      // on another display), window.open only re-navigates it - bring it
      // forward so the click never looks like a no-op.
      win.focus();
    } else {
      window.alert(
        "Chrome blocked the output window popup.\n\n" +
          "Click the blocked-popup icon at the right end of the address bar " +
          "and allow popups for localhost, then try again."
      );
    }
  });

  document.getElementById("btn-identify").addEventListener("click", broadcastIdentify);

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
  document.getElementById("btn-write-visuals").addEventListener("click", writeVisualsFile);

  document
    .getElementById("select-visual-setup-mode")
    .addEventListener("change", (e) => setVisualSetupMode(e.target.value));
  document
    .getElementById("select-visual-setup-song")
    .addEventListener("change", (e) => setVisualSetupSong(e.target.value));
}

function initControl() {
  document.getElementById("control-root").hidden = false;
  channel.addEventListener("message", handleControlMessage);
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
  initGigFolder();
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

// =========================================================================
// IDENTIFY (output overlay)
// =========================================================================
// In response to a broadcast 'identify', overlay each visible shape's
// name + id at its centroid in plain screen space (unwarped - this is a
// readability aid, not part of the projected content) for ~2s.

let identifyTimer = null;

function showIdentifyOverlay() {
  const container = document.getElementById("output-identify");
  container.innerHTML = "";

  const w = window.innerWidth;
  const h = window.innerHeight;

  project.surfaces
    .filter((s) => s.visible)
    .forEach((shape) => {
      // The OUTLINE's centroid, so a fill shape gets a label too and a clipped
      // shape gets its label where the shape actually is.
      const outline = shapeOutline(shape);
      if (!outline) return;
      const [nx, ny] = ringCentroidNormalized(outline);
      const cx = nx * w;
      const cy = ny * h;

      const label = document.createElement("div");
      label.className = "identify-label";
      label.style.left = `${cx}px`;
      label.style.top = `${cy}px`;
      label.textContent = `${shape.name}\n${shape.id}`;
      container.appendChild(label);
    });

  window.clearTimeout(identifyTimer);
  identifyTimer = window.setTimeout(() => {
    container.innerHTML = "";
  }, 2000);
}

// The one change to the output render path (v2.4): a plain white plate above
// the surfaces, raised on request from the control window so the projector's
// lit rectangle can be seen and marked while the camera backdrop is being
// calibrated. It covers the surfaces rather than replacing them - dropping
// the plate leaves everything exactly as it was, still playing.
function setOutputWhiteField(on) {
  document.getElementById("output-white").hidden = !on;
}

// The countdown plate, above the white field so it is legible on it. It is
// REMOVED before the second capture, not merely faded: the whole point of
// the settle that follows is that neither captured frame contains it, so a
// countdown still on the wall would difference into the traced shape.
function setOutputCountdown(value) {
  const el = document.getElementById("output-countdown");
  if (value == null) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.textContent = String(value);
  el.hidden = false;
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
  window.addEventListener("resize", () => {
    renderOutput();
    broadcastOutputSize();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") toggleFullscreen();
  });
  window.addEventListener("dblclick", toggleFullscreen);

  renderOutput();
  channel.postMessage({ kind: "hello" });
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
  project = loadProject();
  initControl();
}
