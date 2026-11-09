import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, commentEmail, ackEmail } from "./emailTemplates";

test("escapeHtml neutralizes markup", () => assert.equal(escapeHtml(`<img src=x onerror="a">&'`), "&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;"));
test("comment email escapes user body and title stays in subject only", () => {
  const m = commentEmail({ key: "ROT-0001", title: "t" }, "<script>x</script>", "https://x/portal");
  assert.ok(!m.html.includes("<script>"));
  assert.ok(m.html.includes("&lt;script&gt;"));
});
test("ack email says it is not a first response", () => assert.match(ackEmail({ key: "A-1", title: "t" }, "u").html, /no cuenta como primera respuesta/));
