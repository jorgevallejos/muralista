// The stage capture's maths, against `node --test`. No framework, no
// package.json, no build — the same runner and the same reasons as
// `warp.test.mjs`, and the same Node floor (22, for ES-module-by-syntax).
//
// WHAT THIS FILE IS DEFENDING. The capture's whole claim is that it is taken
// THROUGH THE CALIBRATION, into output space. If it were not — if it saved a
// raw camera frame, or ran the homography the wrong way round — the picture
// would still look like the stage, and every shape drawn on it would land in
// the wrong place at the venue. **That failure is invisible at the desk and
// expensive on the night**, which is exactly the shape of thing this repo
// tests rather than trusts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stageSampler } from "./stageCapture.js";

/** The lit rectangle sitting in the middle half of the camera's frame. */
const CENTRED = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.75, 0.75],
  [0.25, 0.75],
];

test("the output frame's corners come from the calibration quad's corners", () => {
  // 4x4 output against a 100x100 camera frame. The output's top-left pixel is
  // the quarter-point of the camera frame, not its own top-left: that
  // difference IS the calibration, and a raw frame would answer [0, 0].
  const sample = stageSampler(CENTRED, 4, 4, 100, 100);
  assert.deepEqual(sample(0, 0), [31, 31]);
  assert.deepEqual(sample(3, 3), [68, 68]);
});

test("the centre of the output is the centre of the lit rectangle", () => {
  const sample = stageSampler(CENTRED, 100, 100, 200, 200);
  const [x, y] = sample(49, 49);
  // 0.25 + 0.5 * 0.495 = 0.4975 of 200 = 99.5 → 99 after the centre offset.
  assert.equal(x, 99);
  assert.equal(y, 99);
});

test("a lit rectangle filling the camera frame is the identity", () => {
  // The one case where the calibration happens to be a no-op. Worth pinning:
  // it is what a wrong-way-round homography would ALSO produce on a centred
  // quad by symmetry, so the asymmetric cases above are the ones that catch it
  // and this one only says the trivial case is not broken.
  const sample = stageSampler(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    10,
    10,
    10,
    10
  );
  for (let i = 0; i < 10; i++) assert.deepEqual(sample(i, i), [i, i]);
});

test("an off-centre quad maps the output asymmetrically, which is the whole point", () => {
  // The projector's rectangle sitting in the camera's top-left. Running the
  // homography the wrong way round gives a DIFFERENT answer here, so this is
  // the test that would go red.
  const sample = stageSampler(
    [
      [0, 0],
      [0.5, 0],
      [0.5, 0.5],
      [0, 0.5],
    ],
    10,
    10,
    100,
    100
  );
  assert.deepEqual(sample(0, 0), [2, 2]);
  assert.deepEqual(sample(9, 9), [47, 47]);
});

test("a keystoned quad keeps its perspective rather than being flattened", () => {
  // A projector off to one side: the top edge shorter than the bottom. The
  // sampler must walk the output's top row across a NARROWER span of camera
  // than its bottom row, which is the perspective divide doing its job.
  const sample = stageSampler(
    [
      [0.3, 0.2],
      [0.7, 0.2],
      [0.9, 0.8],
      [0.1, 0.8],
    ],
    100,
    100,
    1000,
    1000
  );
  const topSpan = sample(99, 0)[0] - sample(0, 0)[0];
  const bottomSpan = sample(99, 99)[0] - sample(0, 99)[0];
  assert.ok(bottomSpan > topSpan, `bottom ${bottomSpan} should be wider than top ${topSpan}`);
});

test("a degenerate calibration yields no sampler at all", () => {
  // NOT a raw frame. A caller that fell back to the unmapped feed would
  // reintroduce exactly the offset this capture exists to remove, so there has
  // to be nothing to fall back to.
  assert.equal(stageSampler([[0, 0], [0, 0], [0, 0], [0, 0]], 4, 4, 10, 10), null);
  // An uncalibrated project carries `cameraQuad: null`, which is the ordinary
  // way to arrive here rather than an edge case.
  assert.equal(stageSampler(null, 4, 4, 10, 10), null);
  assert.equal(stageSampler([[0, 0], [1, 0], [1, NaN], [0, 1]], 4, 4, 10, 10), null);
});

test("a zero-sized frame yields no sampler", () => {
  assert.equal(stageSampler(CENTRED, 0, 4, 10, 10), null);
  assert.equal(stageSampler(CENTRED, 4, 4, 10, 0), null);
});

test("an output pixel the camera cannot see is null, never a wrong pixel", () => {
  // The lit rectangle overshooting the camera's frame, which Muralista allows.
  // The parts of the output that fall outside the photograph have no answer,
  // and saying so is the only honest one.
  const sample = stageSampler(
    [
      [-0.5, -0.5],
      [1.5, -0.5],
      [1.5, 1.5],
      [-0.5, 1.5],
    ],
    10,
    10,
    100,
    100
  );
  assert.equal(sample(0, 0), null);
  assert.deepEqual(sample(5, 5), [60, 60]);
});

test("it reads nothing but the quad it is handed", () => {
  // No DOM and no project. The module loads in a runtime that has neither,
  // which is what lets this file be `node --test` at all.
  assert.equal(typeof document, "undefined");
  const quad = CENTRED.map(([x, y]) => [x, y]);
  stageSampler(quad, 4, 4, 10, 10)(1, 1);
  assert.deepEqual(quad, CENTRED);
});
