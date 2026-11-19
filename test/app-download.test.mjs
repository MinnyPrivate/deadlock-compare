import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

test("the missing-match dialog renders a download link using the configured URL", () => {
  const source = readFileSync(new URL("../profile.js", import.meta.url), "utf8");
  const noop = () => {};
  const control = { addEventListener: noop, querySelector: () => control, querySelectorAll: () => [] };
  const dialog = {
    addEventListener: noop,
    setAttribute: noop,
    querySelector: () => control,
    showModal() { this.open = true; },
  };
  const expectedHref = runInNewContext(source + "\nopenUpload(); esc(COMPANION_APP_DOWNLOAD_URL);", {
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
  const link = /<a class="btn" href="([^"]+)"[^>]*>Download the app<\/a>/.exec(dialog.innerHTML);
  assert.ok(link, "the dialog has a styled Download the app link");
  assert.equal(link[1], expectedHref);
});
