import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

test("the missing-match dialog links to the Windows pilot ZIP", () => {
  const source = readFileSync(new URL("../profile.js", import.meta.url), "utf8");
  const noop = () => {};
  const control = { addEventListener: noop, querySelector: () => control, querySelectorAll: () => [] };
  const dialog = {
    addEventListener: noop,
    setAttribute: noop,
    querySelector: () => control,
    showModal() { this.open = true; },
  };
  runInNewContext(source + "\nopenUpload();", {
    URL,
    setInterval: noop,
    location: { href: "http://localhost/profile.html" },
    localStorage: { getItem: () => null },
    navigator: { userAgent: "Windows" },
    document: {
      addEventListener: noop,
      getElementById: () => control,
      createElement(tag) {
        assert.equal(tag, "dialog");
        return dialog;
      },
      body: { appendChild: noop },
    },
    window: { addEventListener: noop },
    PlayerAssets: {},
    HeroBackdrop: { apply: noop },
  });
  assert.equal(dialog.open, true);
  const link = /<a class="btn" href="([^"]+)" download>Download the app<\/a>/.exec(dialog.innerHTML);
  assert.ok(link, "the dialog has a styled Download the app link");
  assert.equal(link[1], "/download/postmortem-companion.zip");
});
