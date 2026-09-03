// =========================================================================
// THE STAGE CAPTURE'S MATHS
// =========================================================================
// ITS OWN FILE FOR ONE REASON: it can then be tested with `node --test`, the
// way `warp.js` is, without a DOM. The canvas work stays in mapper.js because
// a canvas needs a browser; what is here is the part that can be wrong in a
// way nobody would see at a projector - which is exactly the part that gets a
// test in this repo.
//
// IT IS THE INVERSE OF WHAT `Adopt boundaries…` DOES. That gesture carries
// TRACED POINTS from camera space to output space:
//
//     computeHomography(project.cameraQuad, UNIT_SQUARE_CORNERS)
//
// An IMAGE has to be carried the other way round. You do not push source
// pixels forward and hope they land on a grid; you stand on each output pixel
// and ask the camera what is there. So the homography is the same calibration,
// built the other way:
//
//     computeHomography(UNIT_SQUARE_CORNERS, project.cameraQuad)
//
// THE SOURCE IS THE RAW FRAME AND MUST STAY RAW. `project.cameraQuad`'s four
// points were placed on the untransformed feed, so normalized raw-frame
// coordinates and normalized camera-space coordinates are the same thing.
// `drawImage(video)` yields the video's own frame and ignores the CSS
// rectification the preview wears, which is what makes that true.
//
// A CAPTURE THAT IS NOT IN OUTPUT SPACE IS WORTH NOTHING. The photo backdrop
// that already exists is cropped to the projector's throw by hand, and any
// error in that crop becomes a fixed offset in every shape drawn on it. There
// is no crop step here, and that is the whole reason the capture exists.

import { applyHomography, computeHomography, UNIT_SQUARE_CORNERS } from "./warp.js";

/**
 * A sampler: given an output pixel, which source pixel it comes from.
 *
 * Returns null when the calibration is degenerate or missing - a caller with no
 * mapping must not fall back to the raw frame, because a raw frame is precisely
 * the offset this exists to remove.
 *
 * The sampler itself returns null for an output pixel the camera cannot see:
 * outside its frame, or behind the horizon of the homography. Both are honest
 * answers about a part of the wall there is no photograph of.
 */
export function stageSampler(cameraQuad, outW, outH, srcW, srcH) {
  if (!(outW > 0 && outH > 0 && srcW > 0 && srcH > 0)) return null;
  // The quad is checked here rather than trusted, because the one thing this
  // must never do is answer at all when it cannot answer correctly. An
  // uncalibrated project carries `cameraQuad: null`, and reaching
  // `computeHomography` with it would throw where returning null is the answer.
  if (!isQuad(cameraQuad)) return null;
  const H = computeHomography(UNIT_SQUARE_CORNERS, cameraQuad);
  if (!H) return null;

  return function sample(x, y) {
    // Pixel CENTRES, not corners. Sampling the corner shifts the whole picture
    // half a pixel, which is invisible on one image and is the kind of thing
    // that compounds the moment somebody builds on it.
    const p = applyHomography(H, [(x + 0.5) / outW, (y + 0.5) / outH]);
    if (!p) return null;
    // Nearest neighbour. This is a backdrop to place quads against, not a
    // photograph to look at closely, and a resample buys nothing a person
    // dragging corners can see.
    const sx = Math.round(p[0] * srcW - 0.5);
    const sy = Math.round(p[1] * srcH - 0.5);
    if (sx < 0 || sy < 0 || sx >= srcW || sy >= srcH) return null;
    return [sx, sy];
  };
}

/** Four points, each a pair of finite numbers. `mapper.js` calls this shape a quad too. */
function isQuad(q) {
  return (
    Array.isArray(q) &&
    q.length === 4 &&
    q.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && isFinite(n)))
  );
}
