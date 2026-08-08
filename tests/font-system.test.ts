import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("font system is fully local and exposes stable semantic variables", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const tokens = readFileSync(new URL("../app/commercial-ui.css", import.meta.url), "utf8");
  assert.doesNotMatch(layout, /cdn\.jsdelivr\.net|lxgw-wenkai-gb-web/);
  assert.match(layout, /LXGWNeoXiHei-v1\.304\.woff/);
  assert.match(layout, /LXGWWenKaiGBLite-Regular-v1\.522\.woff2/);
  assert.match(tokens, /--font-display:\s*var\(--font-display-local\)/);
  assert.match(tokens, /--font-body:\s*var\(--font-body-local\)/);
});
