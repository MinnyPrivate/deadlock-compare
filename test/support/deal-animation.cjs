"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { test } = require("node:test");
const { setTimeout: delay } = require("node:timers/promises");

const stage = "document.querySelector('#highlightsHandCards')?.dataset.dealStage";
const slots = "[...document.querySelectorAll('.hl-deal-slot')]";
const highlighted = "#highlightsCardDialog";
const short = { id: 137022293, slot: 4, mainShot: 390, fixture: require("../137022293.json") };
const other = require("../137018749.json");
const full = { id: 143748583, slot: 1, mainShot: 1920 };
const sizes = [[1920, 1080], [2560, 1440], [390, 844]];

function instrument() {
  const query = new URLSearchParams(location.search);
  if (!query.has("dealQa")) return;
  if (query.has("blockedStorage")) {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked by test", "SecurityError"); } });
  }
  const probe = window.dealProbe = { stages: [], reveals: [], slides: [], audio: [], afterSnap: null };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    if (this.classList.contains("hl-deal-slot") && this.parentElement.dataset.dealStage === "fan") {
      probe.slides.push(this.parentElement.getAnimations({ subtree: true }).length);
    }
    return animate.apply(this, args);
  };
  new MutationObserver(records => {
    for (const { attributeName, target } of records) {
      if (attributeName === "data-deal-stage" && target.dataset.dealStage) {
        probe.stages.push(target.dataset.dealStage);
      } else if (target.dataset.face === "front") {
        const rarity = target.querySelector("button").getAttribute("aria-label").split(". ")[1];
        probe.reveals.push([rarity, performance.now()]);
      }
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-deal-stage", "data-face"] });
  const { start, stop } = AudioBufferSourceNode.prototype;
  const sources = new WeakMap();
  AudioBufferSourceNode.prototype.start = function (...args) {
    const result = start.apply(this, args);
    const buffer = this.buffer;
    const peak = buffer.getChannelData(0).reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
    const sound = { match: state.match.match_id, slot: Summary.selected().slot, duration: buffer.duration, peak, stopped: false };
    sources.set(this, sound);
    probe.audio.push(sound);
    if (probe.afterSnap) queueMicrotask(probe.afterSnap);
    return result;
  };
  AudioBufferSourceNode.prototype.stop = function (...args) {
    const sound = sources.get(this);
    if (sound) sound.stopped = true;
    return stop.apply(this, args);
  };
}

function handGeometry() {
  const get = node => {
    const { left, top, right, bottom, width, height } = node.getBoundingClientRect();
    return { left, top, right, bottom, width, height };
  };
  return {
    view: get(document.getElementById("summaryView")),
    heading: get(document.querySelector(".hl-hand-heading")),
    highlights: get(document.querySelector(".hl-layout")),
    cards: Array.from(document.querySelectorAll(".hl-deal-slot"), get),
    viewport: { width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth },
  };
}

async function encodeRecording(frames, file) {
  assert.ok(frames.length > 10, "Chromium supplied video frames");
  const [first] = frames;
  const fps = 24;
  const timeline = [];
  let current = 0;
  for (let time = first.time; time <= frames.at(-1).time + .2; time += 1 / fps) {
    while (frames[current + 1]?.time <= time) current++;
    timeline.push(frames[current].image);
  }
  const encoder = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe",
    "-framerate", String(fps), "-vcodec", "mjpeg", "-i", "pipe:0", "-an", "-c:v", "libx264",
    "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file],
  { stdio: ["pipe", "ignore", "pipe"], windowsHide: true, timeout: 25_000 });
  let errors = "";
  encoder.stderr.setEncoding("utf8").on("data", chunk => { errors += chunk; });
  const exited = once(encoder, "close");
  encoder.stdin.on("error", () => {}); // Report the encoder's exit and stderr below.
  encoder.stdin.end(Buffer.concat(timeline));
  assert.equal((await exited)[0], 0, errors);
}

module.exports = ({ site, routes, json, page, navigate, waitPage, loaded, send, listen }) => {
  const fullPath = process.env.PM_DEAL_FULL_MATCH;
  const evidence = process.env.PM_DEAL_EVIDENCE === "1" ? join(site, "docs", "deal-animation") : null;

  async function prepare(t, fixtures, frames) {
    const added = [
      ["/api/v1/companion/session", res => json(res, { state: "paused" })],
      ["/v1/assets/heroes", res => json(res, [])],
      ["/v1/players/steam", res => json(res, [])],
      ...fixtures.map(fixture => [`/v1/matches/${fixture.match_info.match_id}/metadata`, res => json(res, fixture)]),
    ];
    const previous = added.map(([route]) => [route, routes.get(route)]);
    for (const [route, respond] of added) routes.set(route, respond);
    const script = await send("Page.addScriptToEvaluateOnNewDocument", { source: `(${instrument})();` });
    await send("Log.enable");
    await send("Runtime.enable");
    const failures = [];
    listen((name, item) => {
      if (name === "Page.screencastFrame") {
        frames?.push({ time: item.metadata.timestamp, image: Buffer.from(item.data, "base64") });
        void send("Page.screencastFrameAck", { sessionId: item.sessionId }).catch(() => {});
      } else if (name === "Runtime.exceptionThrown") {
        failures.push(item.exceptionDetails.exception?.description || item.exceptionDetails.text);
      } else if (name === "Runtime.consoleAPICalled" && ["error", "warning"].includes(item.type)) {
        failures.push(item.args.map(arg => arg.description ?? arg.value).join(" "));
      } else if (name === "Log.entryAdded" && ["error", "warning"].includes(item.entry.level)) {
        failures.push(item.entry.url ? `${item.entry.text} (${new URL(item.entry.url).pathname})` : item.entry.text);
      }
    });
    t.after(async () => {
      listen(null);
      await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: script.identifier });
      for (const [route, respond] of previous) {
        if (respond) routes.set(route, respond);
        else routes.delete(route);
      }
    });
    return failures;
  }

  async function reset() {
    const origin = await page("location.origin");
    if (origin !== "null") await send("Storage.clearDataForOrigin", { origin, storageTypes: "local_storage" });
  }

  function entry({ id, slot }, suffix = "") {
    return `/index.html?match=${id}&tab=summary&pick=${slot}&dealQa=1${suffix}`;
  }

  async function click(selector) {
    const point = await page(`(() => {
      const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    })()`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  }

  async function press(key, code, virtualKey) {
    const text = key === "Enter" ? "\r" : key === " " ? " " : undefined;
    await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, text, windowsVirtualKeyCode: virtualKey });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: virtualKey });
  }

  async function capture(fixture, width, height, label) {
    if (!evidence) return;
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(evidence, `${fixture.id}-${width}x${height}-${label}.png`), Buffer.from(data, "base64"));
  }

  async function fit(width, height) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 390 });
  }

  function assertOutsideControls({ cards, heading, highlights, view, viewport }, settled) {
    assert.ok(viewport.scroll <= viewport.width, "the page fits horizontally");
    for (const card of cards) {
      assert.ok(card.left >= view.left && card.right <= view.right + 1, "card fits inside the hand width");
      assert.ok(card.top >= heading.bottom, "card clears the header and buttons");
      assert.ok(card.bottom <= highlights.top, `card bottom ${card.bottom} clears Highlights top ${highlights.top}`);
    }
    if (!settled) return; // The stack and fan intentionally overlap within the hand.
    for (const [i, first] of cards.entries()) {
      for (const second of cards.slice(i + 1)) {
        assert.ok(first.right <= second.left || second.right <= first.left ||
          first.bottom <= second.top || second.bottom <= first.top, "settled cards have separate hit boxes");
      }
    }
  }

  async function verifyLift(activator) {
    const original = await page(`document.querySelector(${JSON.stringify(activator)}).getBoundingClientRect().width`);
    await click(activator);
    await waitPage(`document.querySelector('${highlighted}').open && !document.querySelector('${highlighted}').getAnimations({ subtree: true }).length`);
    const lifted = await page(`(() => {
      const { left, right, top, bottom, width } = document.querySelector('.hl-card-dialog-card').getBoundingClientRect();
      return { left, right, top, bottom, width, windowWidth: innerWidth, windowHeight: innerHeight,
        tilt: new DOMMatrix(getComputedStyle(document.querySelector('.hl-card-dialog-card')).transform).b };
    })()`);
    assert.ok(lifted.width > original * 1.2 && lifted.tilt < -.02, "the open card is larger and tilted");
    assert.ok(Math.abs((lifted.left + lifted.right) / 2 - lifted.windowWidth / 2) < 2);
    assert.ok(Math.abs((lifted.top + lifted.bottom) / 2 - lifted.windowHeight / 2) < 2);
    assert.ok(lifted.left > 10 && lifted.right < lifted.windowWidth - 10 && lifted.top > 10 && lifted.bottom < lifted.windowHeight - 10);
  }

  test("deal stages, rarity timing, and lift fit the full and short matches at all three sizes",
    { timeout: 110_000 }, async t => {
      const fullFixture = fullPath && JSON.parse(await readFile(fullPath, "utf8"));
      const fixtures = fullFixture ? [{ ...full, fixture: fullFixture }, short] : [short];
      if (!fullFixture) t.diagnostic("Set PM_DEAL_FULL_MATCH to include the supplied metadata for match 143748583.");
      if (evidence) await mkdir(evidence, { recursive: true });
      const frames = [];
      const failures = await prepare(t, fixtures.map(fixture => fixture.fixture), frames);
      t.after(() => fit(1440, 900));
      for (const fixture of fixtures) {
        assert.equal(fixture.fixture.match_info.match_id, fixture.id);
        for (const [width, height] of sizes) {
          const stageShots = width === fixture.mainShot;
          const video = evidence && stageShots && fixture.id === full.id;
          await reset();
          await fit(width, height);
          await navigate(entry(fixture));
          await waitPage(`${stage} === 'stack'`);
          if (video) await send("Page.startScreencast", { format: "jpeg", quality: 78, maxWidth: 1280, maxHeight: 720, everyNthFrame: 2 });
          try {
            assert.ok(await page(`${slots}.every(slot => slot.dataset.face === 'back' && slot.querySelector('.hl-deal-back .pm-back'))`));
            assert.equal(await page("document.querySelector('#highlightsDealSound').getAttribute('aria-pressed')"), "false");
            assertOutsideControls(await page(`(${handGeometry})()`), false);
            if (stageShots) await capture(fixture, width, height, "1-stack");

            await waitPage(`${stage} === 'fan' && Number(${slots}.at(-1).style.zIndex) === ${slots}.length * 2 - 1 &&
              !document.querySelector('#highlightsHandCards').getAnimations({ subtree: true }).length`);
            assertOutsideControls(await page(`(${handGeometry})()`), false);
            if (stageShots) await capture(fixture, width, height, "2-fan");

            await waitPage(`${stage} === 'reveal' && ${slots}.some(slot => slot.dataset.face === 'front')`);
            assertOutsideControls(await page(`(${handGeometry})()`), false);
            if (stageShots) await capture(fixture, width, height, "3-reveal");
            await waitPage(`${stage} === 'settling'`);
            assertOutsideControls(await page(`(${handGeometry})()`), false);
            if (stageShots) await capture(fixture, width, height, "4-settling");
            await waitPage(`${stage} === 'settled'`);
            const geometry = await page(`(${handGeometry})()`);
            assertOutsideControls(geometry, true);
            assert.equal(geometry.viewport.width, width);
            assert.equal(geometry.viewport.height, height);
            assert.ok(await page("!document.querySelector('#highlightsDealReplay').hidden"));
            assert.deepEqual(await page("dealProbe.stages"), ["stack", "fan", "reveal", "settling", "settled"]);
            assert.deepEqual(await page("dealProbe.slides"), geometry.cards.map(() => 0));
            assert.deepEqual(await page("dealProbe.audio"), []);
            const reveals = await page("dealProbe.reveals");
            const ladder = ["middle", "common", "rare", "epic", "legendary", "mythical"];
            const ranks = reveals.map(([rarity]) => ladder.indexOf(rarity));
            assert.equal(reveals.length, geometry.cards.length);
            assert.ok(ranks.every((rank, index) => rank >= 0 && (index === 0 || rank >= ranks[index - 1])));
            const pauses = [];
            for (const [index, [tier, time]] of reveals.entries()) {
              if (index && ["legendary", "mythical"].includes(tier)) {
                pauses.push(Math.round(time - reveals[index - 1][1]));
                assert.ok(time - reveals[index - 1][1] >= 520, "there is a distinct pause before each high rarity");
              }
            }
            assert.ok(pauses.length > 0);
            if (fixture === short) assert.ok(ranks.includes(1) && ranks.includes(5));
            if (evidence) await capture(fixture, width, height, "5-settled");
            await verifyLift(".hl-deal-slot:first-child button");
            if (evidence) await capture(fixture, width, height, "6-lifted");
            await click("#highlightsCardClose");
            await waitPage(`!document.querySelector('${highlighted}').open`);
            assert.deepEqual(await page("auditErrors"), []);
            assert.deepEqual(failures.splice(0), []);
            t.diagnostic(`${fixture.id} at ${width}x${height}: ${geometry.cards.length} cards, reveal ${reveals.map(([tier]) => tier).join(", ")}, high rarity gaps ${pauses.join(", ")} ms, zero console errors or warnings`);
            if (video) await delay(300);
          } finally {
            if (video) await send("Page.stopScreencast");
          }
          if (video) await encodeRecording(frames, join(evidence, "143748583-deal.mp4"));
        }
      }
    });

  test("skip consumes real clicks, Replay and sound persist, and player or match changes stop all active snaps",
    { timeout: 35_000 }, async t => {
      const failures = await prepare(t, [short.fixture, other]);
      await reset();
      await navigate(entry(short));
      await waitPage(`${stage} === 'stack'`);
      await click('#tabs [data-tab="graphs"]');
      assert.equal(await page("state.tab"), "summary");
      assert.equal(await page(stage), "settled");
      assert.equal(await page("!document.querySelector('#highlightsCardDialog').open"), true);
      await click("#highlightsDealReplay");
      await waitPage(`${stage} === 'stack'`);
      await click("#matchInput");
      assert.equal(await page(stage), "settled");
      assert.equal(await page("document.activeElement === document.querySelector('#matchInput')"), false);
      await click("#highlightsDealSound");
      assert.equal(await page("localStorage.getItem('pm.deal.sound')"), "on");

      await navigate(entry(short));
      await waitPage(`${stage} === 'settled'`);
      assert.deepEqual(await page("dealProbe.stages"), ["settled"]);
      assert.equal(await page("document.querySelector('#highlightsDealSound').getAttribute('aria-pressed')"), "true");
      await click("#highlightsDealReplay");
      await waitPage(`${stage} === 'settled'`, 9000);
      const sounds = await page("dealProbe.audio");
      assert.equal(sounds.length, await page(`${slots}.length`));
      assert.ok(sounds.every(sound => Math.abs(sound.duration - .075) < .001 && sound.peak > .025 && sound.peak < .25));

      await page("dealProbe.afterSnap = () => { dealProbe.afterSnap = null; Summary.select(5); }; true");
      await click("#highlightsDealReplay");
      await waitPage(`Summary.selected().slot === 5 && ${stage} === 'stack'`);
      assert.equal(await page("dealProbe.audio.at(-1).stopped"), true);
      await page(`dealProbe.afterSnap = () => {
        dealProbe.afterSnap = null;
        document.querySelector('#matchInput').value = '${other.match_info.match_id}';
        document.querySelector('#matchForm').requestSubmit();
      }; true`);
      await loaded(other.match_info.match_id);
      await waitPage(`${stage} === 'stack'`);
      await click("#highlightsDealSkip");
      assert.equal(await page(stage), "settled");
      await delay(500);
      const interrupted = await page(`dealProbe.audio.slice(${sounds.length})`);
      assert.deepEqual(interrupted.map(sound => [sound.match, sound.slot, sound.stopped]), [
        [short.id, short.slot, true], [short.id, 5, true],
      ]);
      assert.equal(await page("document.querySelector('#highlightsHandCards').getAnimations({ subtree: true }).length"), 0);
      await click("#highlightsDealSound");
      assert.equal(await page("localStorage.getItem('pm.deal.sound')"), "off");
      await navigate(entry(short));
      await waitPage(`${stage} === 'settled'`);
      assert.equal(await page("document.querySelector('#highlightsDealSound').getAttribute('aria-pressed')"), "false");
      assert.deepEqual(await page("auditErrors"), []);
      assert.deepEqual(failures, []);
    });

  test("keyboard lift and return, storage denial, reduced motion, embed, and replacement card markup",
    { timeout: 30_000 }, async t => {
      const failures = await prepare(t, [short.fixture]);
      await reset();
      await navigate(entry(short, "&blockedStorage=1"));
      await waitPage(`${stage} === 'stack'`);
      await press("Escape", "Escape", 27);
      await waitPage(`${stage} === 'settled'`);
      await page("document.querySelector('.hl-deal-slot button').focus()");
      await press("Enter", "Enter", 13);
      await waitPage(`document.querySelector('${highlighted}').open`);
      await press("Escape", "Escape", 27);
      await waitPage(`!document.querySelector('${highlighted}').open`);
      assert.equal(await page("document.activeElement === document.querySelector('.hl-deal-slot button')"), true);
      await press(" ", "Space", 32);
      await waitPage(`document.querySelector('${highlighted}').open`);
      await press(" ", "Space", 32);
      await waitPage(`!document.querySelector('${highlighted}').open`);

      await page("Summary.select(5)");
      await waitPage(`${stage} === 'stack'`);
      await page(`Summary.select(${short.slot})`);
      await waitPage(`${stage} === 'settled'`);
      assert.equal(await page("!document.querySelector('#highlightsDealReplay').hidden"), true);

      await page(`(() => {
        function shape(text) {
          const node = document.createElement("div");
          node.style.cssText = "width: 116px; height: 162px; background: #765";
          node.textContent = text;
          return node;
        }
        window.PMCard = { render: input => shape(input.title), renderBack: () => shape("Test back") };
        Summary.hideHand();
        Summary.render();
      })()`);
      await waitPage(`${stage} === 'settled' && !document.querySelector('#highlightsHandCards .pm-card')`);
      await click("#highlightsDealReplay");
      await waitPage(`${stage} === 'stack'`);
      assert.equal(await page("document.querySelector('.hl-deal-back').textContent"), "Test back");
      await click("#highlightsDealSkip");
      await verifyLift(".hl-deal-slot:first-child button");
      await press("Escape", "Escape", 27);
      await waitPage(`!document.querySelector('${highlighted}').open`);
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      t.after(() => send("Emulation.setEmulatedMedia", { features: [] }));
      await navigate(entry(short, "&blockedStorage=1"));
      await waitPage(`${stage} === 'settled'`);
      assert.deepEqual(await page("dealProbe.stages"), ["settled"]);
      assert.equal(await page("document.querySelector('#highlightsDealReplay').hidden"), true);
      await click(".hl-deal-slot:first-child button");
      const reducedLift = await page(`({
        open: document.querySelector('#highlightsCardDialog').open,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        animations: document.querySelector('.hl-card-dialog-card').getAnimations().map(animation =>
          [animation.constructor.name, animation.effect.getTiming().duration, animation.playState]),
      })`);
      assert.deepEqual(reducedLift, { open: true, reduced: true, animations: [] });
      await navigate(entry(short, "&embed=1"));
      await loaded(short.id);
      assert.ok(await page("document.querySelector('#highlightsHand').hidden && !document.querySelector('#highlightsCardDialog').open"));
      assert.deepEqual(await page("dealProbe.stages"), []);
      assert.deepEqual(await page("auditErrors"), []);
      assert.deepEqual(failures, []);
    });
};
