// =========================================================================
// THE MODE LIST IS HONEST OR IT IS NOT A LIST
// =========================================================================
// **This file is the price of writing `modes` as an array** (Jorge, 2026-09-05).
//
// The authoring surface seeds exactly two modes and offers no way to make a
// third. The FILE FORMAT says list. An array in the file that the renderer
// reads as `[0]` and `[1]` is a format promising what the code does not do -
// the exact shape of the five contract mismatches of 02/09 and of
// `countInBars`, where one side produced a value the other refused.
//
// So the generality is tested or it is not claimed: the third test below
// renders A HAND-WRITTEN THREE-MODE ROOM and asserts which shapes are live in
// each of its branches. If that test is ever deleted rather than fixed, the
// honest build is two modes and no list, and this comment is the instruction
// to go and make it that.
//
// Run it with no dependencies and no build step:
//
//   node --test mapper/modes.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SEEDED_MODES,
  activeModeId,
  dropUnknownMembership,
  sanitizeModeCondition,
  sanitizeModes,
  shapeModeId,
  shapeShowsInMode,
} from "./modes.js";

/** The live room: the winning mode's shapes plus every no-mode shape, in list order. */
function liveShapeNames(shapes, modes, filledIds) {
  const filled = new Set(filledIds);
  const active = activeModeId(modes, (id) => filled.has(id));
  return shapes.filter((s) => shapeShowsInMode(s, active)).map((s) => s.name);
}

// --- The seed, which is the room Jorge actually gets ------------------------

const VIDEO = "s-video";

const seededRoom = () => {
  const modes = SEEDED_MODES.map((seed, i) => ({
    id: `m-${i}`,
    name: seed.name,
    when: { shape: VIDEO, is: seed.is },
  }));
  const shapes = [
    { id: VIDEO, name: "Video frame" },
    { id: "s-foot", name: "Video lyrics", mode: modes[1].id },
    { id: "s-across", name: "Song lyrics", mode: modes[0].id },
  ];
  return { modes, shapes };
};

test("the seeded pair partitions the room, one branch each", () => {
  const { modes, shapes } = seededRoom();

  // A song with no animation: the video shape is empty, so `Song with lyrics` wins.
  assert.deepEqual(liveShapeNames(shapes, modes, []), ["Video frame", "Song lyrics"]);

  // A song with one: `Song with video and lyrics` wins, and the other mode's shape is not drawn.
  assert.deepEqual(liveShapeNames(shapes, modes, [VIDEO]), ["Video frame", "Video lyrics"]);
});

test("the video shape belongs to no mode, so it is live in both", () => {
  const { modes, shapes } = seededRoom();
  assert.equal(shapeModeId(shapes[0]), null);
  for (const filled of [[], [VIDEO]]) {
    assert.ok(liveShapeNames(shapes, modes, filled).includes("Video frame"));
  }
});

test("order decides, and the FIRST matching mode wins", () => {
  // Two modes asking the same question the same way. Nothing about the conditions separates them;
  // the list does. This is where exclusivity comes from now.
  const modes = [
    { id: "m-a", name: "A", when: { shape: VIDEO, is: "empty" } },
    { id: "m-b", name: "B", when: { shape: VIDEO, is: "empty" } },
  ];
  const shapes = [
    { id: "s-a", name: "In A", mode: "m-a" },
    { id: "s-b", name: "In B", mode: "m-b" },
  ];
  assert.deepEqual(liveShapeNames(shapes, modes, []), ["In A"]);
});

test("when no condition matches, NO mode is live and only the always shapes paint", () => {
  const modes = [{ id: "m-a", name: "A", when: { shape: VIDEO, is: "filled" } }];
  const shapes = [
    { id: "s-always", name: "Backdrop" },
    { id: "s-a", name: "In A", mode: "m-a" },
  ];
  assert.equal(activeModeId(modes, () => false), null);
  assert.deepEqual(liveShapeNames(shapes, modes, []), ["Backdrop"]);
});

test("a mode with no condition is never live", () => {
  // What a room looks like after its video shape is deleted: the distinction has nothing left to
  // ask about. Silent would be the failure; never-live is a state the sign-off can count.
  const modes = [{ id: "m-a", name: "A", when: null }];
  assert.equal(activeModeId(modes, () => true), null);
});

// --- The door, and whether it is real --------------------------------------

test("A HAND-WRITTEN THREE-MODE ROOM RENDERS CORRECTLY", () => {
  // Nothing in the authoring surface can produce this file. It is written here by hand precisely
  // because the format claims it can be read, and a claim nobody exercises is the one that turns
  // out to be false at a wall.
  const modes = [
    { id: "m-both", name: "Video and translation", when: { shape: "s-trans", is: "filled" } },
    { id: "m-video", name: "Video and lyrics", when: { shape: "s-video", is: "filled" } },
    { id: "m-plain", name: "Lyrics only", when: { shape: "s-video", is: "empty" } },
  ];
  const shapes = [
    { id: "s-video", name: "Video frame" },
    { id: "s-trans", name: "Translation source" },
    { id: "s-wide", name: "Lyrics across the frame", mode: "m-plain" },
    { id: "s-foot", name: "Lyrics at the foot", mode: "m-video" },
    { id: "s-split-a", name: "Original, left", mode: "m-both" },
    { id: "s-split-b", name: "Translation, right", mode: "m-both" },
    { id: "s-logo", name: "Logo" },
  ];

  const always = ["Video frame", "Translation source", "Logo"];

  // Third mode: nothing assigned at all.
  assert.deepEqual(liveShapeNames(shapes, modes, []), [
    "Video frame",
    "Translation source",
    "Lyrics across the frame",
    "Logo",
  ]);

  // Second mode: a video, no translation.
  assert.deepEqual(liveShapeNames(shapes, modes, ["s-video"]), [
    "Video frame",
    "Translation source",
    "Lyrics at the foot",
    "Logo",
  ]);

  // First mode, and it wins over the second even though BOTH conditions are true. This is the
  // case two hand-written branches have no answer for, and it is the whole argument for the rule.
  assert.deepEqual(liveShapeNames(shapes, modes, ["s-video", "s-trans"]), [
    "Video frame",
    "Translation source",
    "Original, left",
    "Translation, right",
    "Logo",
  ]);

  // And the always shapes are in every one of the three.
  for (const filled of [[], ["s-video"], ["s-video", "s-trans"]]) {
    const live = liveShapeNames(shapes, modes, filled);
    for (const name of always) assert.ok(live.includes(name), `${name} missing from ${filled}`);
  }
});

// --- An import is arbitrary JSON -------------------------------------------

test("sanitizeModes rebuilds the list rather than trusting it", () => {
  const out = sanitizeModes([
    { id: "m-a", name: "  Kept  ", when: { shape: "s-1", is: "filled" } },
    { id: "m-a", name: "Duplicate id" },
    { name: "No id" },
    { id: "m-b" },
    { id: "m-c", name: "Bad state", when: { shape: "s-1", is: "sideways" } },
    "not an object",
    null,
  ]);
  assert.deepEqual(out, [
    { id: "m-a", name: "Kept", when: { shape: "s-1", is: "filled" } },
    { id: "m-b", name: "Mode", when: null },
    { id: "m-c", name: "Bad state", when: null },
  ]);
  assert.deepEqual(sanitizeModes("modes"), []);
});

test("sanitizeModeCondition refuses everything that is not the one sentence", () => {
  assert.deepEqual(sanitizeModeCondition({ shape: "s-1", is: "empty" }), {
    shape: "s-1",
    is: "empty",
  });
  assert.equal(sanitizeModeCondition({ shape: "", is: "empty" }), null);
  assert.equal(sanitizeModeCondition({ shape: "s-1" }), null);
  assert.equal(sanitizeModeCondition(null), null);
});

test("membership pointing at a mode the file does not hold is dropped", () => {
  // Always-on is a state somebody can see and drag out of. Invisible in every mode is not.
  const shapes = [
    { id: "s-1", mode: "m-gone" },
    { id: "s-2", mode: "m-a" },
    { id: "s-3", mode: 7 },
  ];
  dropUnknownMembership(shapes, [{ id: "m-a", name: "A", when: null }]);
  assert.deepEqual(shapes, [{ id: "s-1" }, { id: "s-2", mode: "m-a" }, { id: "s-3" }]);
});
