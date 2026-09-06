// =========================================================================
// A SAVE THAT SILENTLY DID NOT HAPPEN
// =========================================================================
// **The worst shape this suite has** (Jorge, 2026-09-06), and this file is the
// price of the listing having learned to recurse without the refusal following.
//
// A video was assigned for `tragedia` in `1 SHAPES`, walked through to
// sign-off, and Pregonero's `video` drive mode was then unavailable BECAUSE THE
// SONG HAD NO VIDEO. Going back showed the selection had never been recorded.
// The gig's `visuals.json` had `songVisuals.assets: {}` with `defaults` beside
// it fully populated - so the file was written, and the assignment was not in
// it. Nothing failed, nothing warned, and the row had shown it as assigned.
//
// The cause: `sanitizeSongAssets` refused any value carrying a separator, on a
// rule that was right when it was written - *a path here would be a fact about
// one machine written into a file built to travel*. On 2026-09-04 the asset
// listing was made to recurse, ON THE ARGUMENT THAT THE CONSTRAINT THAT
// MATTERED WAS `not absolute`, NEVER `one segment`, and because the real
// visuals folder keeps every animation one level down in a per-song directory.
// The picker changed; the refusal did not. From that day every assignment made
// in that folder was dropped on the way to disk.
//
// **Pregonero's `visualsFile.assetNameIsRelative` is the same function**, and
// the cases below are the cases its own test asserts. A value one side writes
// and the other refuses is the contract mismatch both repos keep meeting; the
// two lists are kept identical by hand, which is what this comment is for.
//
//   node --test mapper/assetName.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { ASSET_MAX_DEPTH, assetNameIsRelative } from "./assetName.js";

test("a bare name is kept, which is every name that ever worked", () => {
  assert.equal(assetNameIsRelative("pig.mov"), true);
  assert.equal(assetNameIsRelative("Logo Chango Pepper - black.png"), true);
});

test("A NESTED NAME IS KEPT, WHICH IS THE WHOLE OF THIS FIX", () => {
  // What the recursive listing actually offers, and what the folder actually holds.
  assert.equal(assetNameIsRelative("tragedia/pig.mov"), true);
  assert.equal(assetNameIsRelative("a/b/c/d.mp4"), true);
});

test("what a path here was ever a problem for is still refused", () => {
  for (const name of [
    "/Users/x/a.mp4", // absolute: a fact about one machine
    "../secret.mp4", // escaping the folder
    "a/../../b.mp4",
    "a\\b.mp4", // a Windows separator is a fact about one machine too
    "a//b.mp4", // an empty segment
    "a/b/", // a trailing separator names a directory
    "./a.mp4", // a no-op segment the listing never emits
    "",
  ]) {
    assert.equal(assetNameIsRelative(name), false, `${JSON.stringify(name)} was kept`);
  }
});

test("deeper than the walk goes is refused, because the picker could not have offered it", () => {
  // `walkFolderForAssets` stops at ASSET_MAX_DEPTH, so the deepest name it can
  // emit has exactly that many segments.
  const deepest = Array.from({ length: ASSET_MAX_DEPTH }, (_, i) => `d${i}`).join("/");
  assert.equal(assetNameIsRelative(deepest), true);
  assert.equal(assetNameIsRelative(`${deepest}/one-too-far.mp4`), false);
});

test("anything that is not a string is refused rather than coerced", () => {
  for (const value of [null, undefined, 3, {}, ["a"]]) {
    assert.equal(assetNameIsRelative(value), false);
  }
});
