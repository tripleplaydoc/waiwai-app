import assert from "node:assert/strict";
import { SUGGESTED_TAGS, TAG_COLORS, cleanTagName, isHexColor, normalizeColor, pickKnownIds, tagBg } from "./tags";

assert.equal(cleanTagName("  Fixed   cost "), "Fixed cost");
assert.equal(cleanTagName("   "), null);
assert.equal(cleanTagName("x".repeat(25)), null);
assert.equal(normalizeColor("#abcdef"), "#ABCDEF");
assert.equal(normalizeColor("red"), null);
assert.equal(isHexColor("#12345"), false);
assert.ok(TAG_COLORS.every((c) => isHexColor(c.hex)) && SUGGESTED_TAGS.every((t) => isHexColor(t.color)));
assert.equal(tagBg("#4F46E5"), "#4F46E529");
assert.deepEqual(pickKnownIds(["a", "b", "a", "z"], new Set(["a", "b"])), ["a", "b"]);
console.log("tags ok");
