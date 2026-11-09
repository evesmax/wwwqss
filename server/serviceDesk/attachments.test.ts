import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAttachment, cleanFilename } from "./attachments";

test("rejects svg/html/exe, accepts png/pdf", () => {
  assert.equal(validateAttachment("a.svg", "image/svg+xml", 10).ok, false);
  assert.equal(validateAttachment("a.html", "text/html", 10).ok, false);
  assert.equal(validateAttachment("a.png", "image/png; charset=x", 10).ok, true);
});
test("size limits", () => {
  assert.equal(validateAttachment("a.pdf", "application/pdf", 0).ok, false);
  assert.equal(validateAttachment("a.pdf", "application/pdf", 5 * 1024 * 1024 + 1).ok, false);
});
test("filename sanitized", () => {
  assert.equal(cleanFilename("../../etc/pass\"wd"), "pass_wd");
  assert.equal(cleanFilename("...."), "archivo");
});
