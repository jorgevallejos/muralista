/**
 * **WHAT MAY BE STORED AS A SONG'S ASSET IN `songVisuals.assets`.**
 *
 * **A name used to be one segment**, and any separator was refused — *a path here would be a fact
 * about one machine written into a file built to travel.* **That rule was right and it outlived its
 * listing.**
 *
 * On 2026-09-04 the asset listing was made to recurse, on both sides, on the argument that the
 * constraint that mattered was *not absolute*, never *one segment*: `tragedia/pig.mov` leaks no
 * more about where the folder lives than `pig.mov` does. It was made because **the real visuals
 * folder keeps every animation one level down in a per-song directory**, so a flat listing offered
 * a README and nothing else.
 *
 * **The refusal did not follow, and that is a save that silently did not happen.** From that day
 * the picker offered a nested path, `setSongAsset` stored it, the row showed the song as assigned —
 * and `sanitizeSongAssets`, which runs on the way into `visualsDocument()`, dropped it. Found at a
 * wall on 2026-09-06: a video assigned for `tragedia`, walked through to sign-off, and `video`
 * drive mode then unavailable *because the song had no video*. The gig's `visuals.json` had
 * `songVisuals.assets: {}` with `defaults` beside it populated — the file was written, and the
 * assignment was not in it. **Every video assignment in that folder was being dropped.**
 *
 * **What is refused is what a path here was ever a problem for**: absolute, escaping the folder, or
 * a separator that is a fact about one machine. Deeper than the walk goes is refused too — the
 * picker could not have offered it.
 *
 * **Pregonero's `visualsFile.assetNameIsRelative` is this function, and the two must agree**: a
 * value one side writes and the other refuses is the contract mismatch both repos keep meeting.
 */

/** The listing's own depth, so a name the picker could not have offered is not one this keeps. */
export const ASSET_MAX_DEPTH = 4;

export function assetNameIsRelative(name) {
  if (typeof name !== "string") return false;
  if (name === "" || name.includes("\\")) return false;
  if (name.startsWith("/")) return false;
  const segments = name.split("/");
  if (segments.length > ASSET_MAX_DEPTH) return false;
  return segments.every((s) => s !== "" && s !== "." && s !== "..");
}
