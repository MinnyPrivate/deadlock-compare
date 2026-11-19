import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Set PM_DOWNLOAD_TEST_ORIGIN to the local Wrangler URL and run this file with `node --test`.
const origin = process.env.PM_DOWNLOAD_TEST_ORIGIN;
const skip = !origin && "Set PM_DOWNLOAD_TEST_ORIGIN to run against Wrangler";

test("the Worker serves the pilot ZIP as an attachment", { skip }, async () => {
  const file = await readFile(new URL("../download/postmortem-companion.zip", import.meta.url));
  const response = await fetch(new URL("/download/postmortem-companion.zip", origin), {
    redirect: "error", signal: AbortSignal.timeout(10_000),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="postmortem-companion.zip"');
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.length, file.length);
  assert.equal(createHash("sha256").update(body).digest("hex"), createHash("sha256").update(file).digest("hex"));
});

test("the Worker does not serve a companion executable separately", { skip }, async () => {
  const response = await fetch(new URL("/download/postmortem-companion.exe", origin), {
    redirect: "error", signal: AbortSignal.timeout(10_000),
  });

  assert.equal(response.status, 404);
  await response.body?.cancel();
});
