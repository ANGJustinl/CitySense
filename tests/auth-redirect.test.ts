import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthPath,
  parseAuthIntent,
  safeAuthNext
} from "@/lib/auth/redirect";

test("safeAuthNext accepts local paths and preserves query strings", () => {
  assert.equal(safeAuthNext("/submit-place?draft=1"), "/submit-place?draft=1");
});

test("safeAuthNext rejects absolute and protocol-relative URLs", () => {
  assert.equal(safeAuthNext("https://evil.example"), "/submit-place");
  assert.equal(safeAuthNext("//evil.example/path"), "/submit-place");
});

test("safeAuthNext supports a caller-provided fallback", () => {
  assert.equal(safeAuthNext(undefined, "/"), "/");
});

test("auth intent permits register and recovery explicitly", () => {
  assert.equal(parseAuthIntent("register"), "register");
  assert.equal(parseAuthIntent("recovery"), "recovery");
  assert.equal(parseAuthIntent("unknown"), "login");
  assert.equal(parseAuthIntent(null), "login");
});

test("buildAuthPath preserves the next target and stable error code", () => {
  assert.equal(
    buildAuthPath("register", "/submit-place?draft=1", "invalid_callback"),
    "/register?next=%2Fsubmit-place%3Fdraft%3D1&error=invalid_callback"
  );
});
