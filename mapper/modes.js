/**
 * NAMED MODES — a set of shapes that appear together, under a name and a condition.
 *
 * **The concept the tool was missing** (Jorge, 2026-09-05). The idea used to be smeared across
 * three surfaces: a per-shape condition editor, a preview chip that spoke in mechanism
 * (`Video frame empty` / `Video frame filled`), and an unwritten assumption that the two conditions
 * partitioned the room. **A name with nowhere to live was the symptom** — Jorge named the two modes
 * out loud before the tool had an object to hang the names on.
 *
 * A mode is **a condition plus a set**. Naming which shapes go together does not say *when* that
 * group is the live one, and a set of one — `{Song lyrics}` alone — is ordinary, which a pairwise
 * `visible only together with` relation could never express.
 *
 * ## Three invariants, and the third is the one with teeth
 *
 * **1. Resolution is first-match-wins, in list order, with a stated fallback.** Exclusivity comes
 * from the rule now, *not* from two conditions happening to be complements. Two hand-written
 * branches have no answer when both are true or both are false, and that is the double-paint
 * failure this project keeps meeting. **When no mode's condition matches, no mode is live** — only
 * the no-mode shapes paint. That case is stated rather than left to fall out: two complementary
 * conditions never reach it, and a list has to answer it anyway.
 *
 * **2. A shape belongs to exactly one mode, or to none. No mode means always displayed.** The live
 * room is the winning mode's shapes plus every no-mode shape, which is what the wall does.
 * **Membership lives on the shape**, not as a list of ids on the mode: a field holds one value, so
 * *exactly one* is structural rather than a rule to enforce, and deleting a shape takes its
 * membership with it so nothing orphans. That is the same argument that put `visibleWhen` on the
 * shape before modes existed.
 *
 * **3. The list is honest or it is not a list.** An array in the file that the renderer reads as
 * `[0]` and `[1]` is a format promising what the code does not do — the exact shape of the five
 * contract mismatches of 02/09 and of `countInBars`. **So this module resolves any number of
 * modes, and `modes.test.mjs` renders a hand-written three-mode room to prove it.** The authoring
 * surface still seeds exactly two and offers no way to add a third; the door is real and is not
 * opened until a second kind of condition exists.
 *
 * ## Why this module exists at all
 *
 * `mapper.js` is one 7,000-line document-bound script and nothing in it can be tested by `node`.
 * The resolution rule is the half of modes that has to be *proved* rather than looked at, so it
 * lives here with `warp.js` and `stageCapture.js` — dependency-free, no DOM, and imported by the
 * page rather than copied into it.
 */

/** The two states a condition can ask about. Content, never existence — see `shapeCondition`. */
export const CONDITION_STATES = ["filled", "empty"];

/**
 * **The two modes a new room is seeded with, in resolution order, in Jorge's own words.**
 *
 * `Song with lyrics` is first because it is the condition on *no video*, and a room whose video
 * shape is missing entirely then resolves to it rather than to nothing. Order is the rule, so the
 * order is the decision.
 *
 * `is` is the state of the video shape the seeded condition points at. The shape itself is not
 * named here: `seedDefaultLayout` supplies it, because which shape is the video shape is a fact
 * about a room and not about the seed.
 */
export const SEEDED_MODES = [
  { name: "Song with lyrics", is: "empty" },
  { name: "Song with video and lyrics", is: "filled" },
];

let modeIdCounter = 0;

/** Short unique-enough slug, shaped like `genShapeId`'s so an id reads as an address. */
export function genModeId() {
  modeIdCounter += 1;
  return "m-" + Date.now().toString(36) + modeIdCounter.toString(36) + Math.random().toString(36).slice(2, 4);
}

/**
 * A mode's condition, or null.
 *
 * **A null condition is never true**, so a mode carrying one is never live. That is the honest
 * reading of a room whose video shape was deleted: the distinction it drew no longer has anything
 * to ask about. It is visible rather than silent — the mode's row says so, and Pregonero's
 * sign-off counts what is live per mode.
 */
export function sanitizeModeCondition(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.shape !== "string" || !raw.shape) return null;
  if (!CONDITION_STATES.includes(raw.is)) return null;
  return { shape: raw.shape, is: raw.is };
}

/**
 * **An import is arbitrary JSON**, so every mode is rebuilt from it rather than trusted. A mode
 * with no usable id is dropped: an id is how a shape points at it, and one that cannot be pointed
 * at is not a mode. A missing name becomes `Mode`, because a name is renameable and a dropped mode
 * takes its shapes' grouping with it.
 */
export function sanitizeModes(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  raw.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const id = typeof entry.id === "string" && entry.id ? entry.id : null;
    if (id === null || seen.has(id)) return;
    seen.add(id);
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : "Mode";
    out.push({ id, name, when: sanitizeModeCondition(entry.when) });
  });
  return out;
}

/** The mode a shape belongs to, or null for a no-mode shape. */
export function shapeModeId(shape) {
  const raw = shape && shape.mode;
  return typeof raw === "string" && raw ? raw : null;
}

/**
 * **The mode that is live, or null when none is.**
 *
 * `readsFilled(shapeId)` answers *does that shape have content right now* — the previewed song's
 * assignment on one side of the seam, the answer that rode with the state message on the other.
 * **The rule itself is written once**, here, for both windows and both tools.
 */
export function activeModeId(modes, readsFilled) {
  for (const mode of modes) {
    if (mode.when === null) continue;
    const filled = readsFilled(mode.when.shape) === true;
    if (mode.when.is === "filled" ? filled : !filled) return mode.id;
  }
  return null;
}

/** Whether this shape is in the live room: its mode won, or it belongs to no mode. */
export function shapeShowsInMode(shape, activeId) {
  const mine = shapeModeId(shape);
  return mine === null || mine === activeId;
}

/**
 * **Membership dropped when it points nowhere.** A shape naming a mode the file does not hold
 * would be invisible in every mode and unreachable from every group — worse than always-on, which
 * is at least a state somebody can see and drag out of.
 */
export function dropUnknownMembership(shapes, modes) {
  const known = new Set(modes.map((m) => m.id));
  shapes.forEach((shape) => {
    if (shape && typeof shape.mode === "string" && !known.has(shape.mode)) delete shape.mode;
    else if (shape && shape.mode !== undefined && typeof shape.mode !== "string") delete shape.mode;
  });
}
