// Guards the "what the site publishes" rules in .assetsignore and _headers.
// Wrangler uploads everything in the repo root that .assetsignore does not hide, so the file is an allowlist:
// "/*" hides everything and each "!" line publishes one thing on purpose.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rules = readFileSync(join(root, ".assetsignore"), "utf8").split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
const headers = readFileSync(join(root, "_headers"), "utf8");
const pages = ["index.html", "profile.html", "reveal-probe.html", "hideout-test.html"];

test("the root is hidden by default", () => {
  assert.equal(rules[0], "/*", "the first rule must hide the whole root so new files stay private");
});

test("only listed root files are published", () => {
  const published = rules.filter(r => r.startsWith("!/") && !r.slice(2).includes("/")).map(r => r.slice(2));
  const rootFiles = readdirSync(root, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name);
  for (const name of published) assert.ok(rootFiles.includes(name) || name.endsWith("/"), `${name} is published but missing from the repo`);
  for (const bad of ["README.md", "DESIGN.md", "AGENTS.md", "GEMINI.md", "wrangler.jsonc", ".assetsignore", "_headers", "dev-cards.html", "dev-cards.js", "dev-cards.css"]) {
    assert.ok(!published.includes(bad), `${bad} must not be published`);
  }
  assert.ok(!rules.includes("!/*") && !rules.includes("!*"), "no blanket re-include");
});

test("every file the pages load is published", () => {
  const published = new Set(rules.filter(r => r.startsWith("!/")).map(r => r.slice(2)));
  const isPublished = ref => {
    const path = ref.replace(/[?#].*$/, "");
    if (published.has(path)) return true;
    const dir = path.split("/")[0];
    return path.includes("/") && published.has(dir + "/");
  };
  for (const page of pages) {
    const html = readFileSync(join(root, page), "utf8");
    for (const m of html.matchAll(/(?:src|href)="([^"#?:]+\.(?:js|css|woff2|webp|png|svg|jpg))"/g)) {
      assert.ok(isPublished(m[1]), `${page} loads ${m[1]} but .assetsignore does not publish it`);
    }
  }
});

test("every page gets a Content-Security-Policy and the shared security headers", () => {
  const block = path => {
    const start = headers.split(/\r?\n/).findIndex(l => l === path);
    assert.ok(start >= 0, `_headers has no rule for ${path}`);
    return headers.split(/\r?\n/).slice(start + 1).join("\n").split(/\n(?=\S)/)[0];
  };
  for (const path of ["/", "/index.html", "/profile.html", "/reveal-probe.html", "/hideout-test.html"]) {
    const rule = block(path);
    assert.match(rule, /Content-Security-Policy: default-src 'self'/, path);
    assert.match(rule, /object-src 'none'/, path);
    assert.match(rule, /frame-ancestors 'self'/, path);
  }
  const all = block("/*");
  for (const h of ["X-Content-Type-Options: nosniff", "Referrer-Policy: no-referrer", "Permissions-Policy:"]) assert.ok(all.includes(h), h);
});
