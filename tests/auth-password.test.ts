import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_PASSWORD_LENGTH,
  validatePassword,
  validatePasswordConfirmation
} from "@/lib/auth/password";

test("password validation requires the minimum length", () => {
  assert.equal(validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1)), `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`);
  assert.equal(validatePassword("a".repeat(MIN_PASSWORD_LENGTH)), undefined);
});

test("password validation does not trim the password", () => {
  assert.equal(validatePassword("       "), "密码至少需要 8 个字符");
  assert.equal(validatePassword(" pass123"), undefined);
});

test("password confirmation must match exactly", () => {
  assert.equal(validatePasswordConfirmation("password", "password"), undefined);
  assert.equal(validatePasswordConfirmation("password", "Password"), "两次输入的密码不一致");
});
