"use strict";

// Share card: the Highlights page as one 1200 by 630 image (the size Discord and other link previews use), drawn on a
// canvas from local art so it can be copied or saved. It shows usernames and the match, never an account ID.
window.ShareCard = (() => {
  const W = 1200, H = 630, SCALE = 2;
  const CREAM = "#FFEFD7", DIM = "rgba(255,239,215,.66)", FAINT = "rgba(255,239,215,.42)";
  const TONE = { good: "#58D86A", bad: "#E0A090", gold: "#FFED79", "": "rgba(255,239,215,.66)" };
  let dialog, opener, lastUrl;

  const load = (src, cors) => new Promise(resolve => {
    if (!src) return resolve(null);
    const image = new Image();
    if (cors) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

  function cover(ctx, image, x, y, w, h, focusY = 0.15) {
    const scale = Math.max(w / image.width, h / image.height);
    const sw = w / scale, sh = h / scale;
    ctx.drawImage(image, (image.width - sw) / 2, Math.max(0, (image.height - sh) * focusY), sw, sh, x, y, w, h);
  }

  // Wraps text to a width and returns the lines, cutting the last one with an ellipsis.
  function wrap(ctx, text, width, max) {
    const words = String(text).split(/\s+/), lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (ctx.measureText(next).width <= width || !line) line = next;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (lines.length > max) {
      lines.length = max;
      let last = lines[max - 1];
      while (last && ctx.measureText(last + "…").width > width) last = last.slice(0, -1);
      lines[max - 1] = last.trimEnd() + "…";
    }
    return lines;
  }

  function fit(ctx, text, width, font, size, min) {
    for (let s = size; s >= min; s -= 2) {
      ctx.font = font.replace("{s}", s);
      if (ctx.measureText(text).width <= width) return s;
    }
    return min;
  }

  async function draw(d) {
    await Promise.all(["600 40px Oracle", "700 40px Radiance", "600 20px Radiance", "700 16px Pulp"].map(f => document.fonts.load(f).catch(() => null)));
    const local = (window.HERO_BACKDROPS || []).includes(d.heroId) ? `assets/backdrops/${d.heroId}.webp` : "assets/backdrops/generic.webp";
    const [backdrop, remoteArt, localArt, icon, rankImage, soul] = await Promise.all([
      load(local), load(d.art, true), load(d.card), load(d.team.icon), load(d.rank?.img), load("assets/ui/icon_soul.svg"),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);
    ctx.textBaseline = "alphabetic";

    // Backdrop: the hero's scene, darkened, with the team's color rising from the left.
    ctx.fillStyle = "#0d0c0b";
    ctx.fillRect(0, 0, W, H);
    if (backdrop) {
      ctx.globalAlpha = 0.5;
      cover(ctx, backdrop, 0, 0, W, H, 0.35);
      ctx.globalAlpha = 1;
    }
    let g = ctx.createRadialGradient(240, 300, 40, 240, 300, 620);
    g.addColorStop(0, d.accent + "55");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, "rgba(10,10,9,.15)");
    g.addColorStop(0.42, "rgba(10,10,9,.7)");
    g.addColorStop(1, "rgba(10,10,9,.92)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Hero art down the left, fading into the page.
    const art = remoteArt || localArt;
    if (art) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 470, H);
      ctx.clip();
      cover(ctx, art, 0, 0, 470, H, 0.1);
      ctx.restore();
      g = ctx.createLinearGradient(300, 0, 470, 0);
      g.addColorStop(0, "rgba(13,12,11,0)");
      g.addColorStop(1, "rgba(13,12,11,1)");
      ctx.fillStyle = g;
      ctx.fillRect(300, 0, 171, H);
      g = ctx.createLinearGradient(0, H - 220, 0, H);
      g.addColorStop(0, "rgba(13,12,11,0)");
      g.addColorStop(1, "rgba(13,12,11,.95)");
      ctx.fillStyle = g;
      ctx.fillRect(0, H - 220, 471, 220);
    }
    // A thin team stripe down the left edge.
    ctx.fillStyle = d.team.c;
    ctx.fillRect(0, 0, 6, H);

    // Username and hero over the art's foot.
    ctx.fillStyle = CREAM;
    const nameSize = fit(ctx, d.username, 400, "700 {s}px Radiance", 46, 26);
    ctx.font = `700 ${nameSize}px Radiance`;
    ctx.shadowColor = "rgba(0,0,0,.8)";
    ctx.shadowBlur = 14;
    ctx.fillText(d.username, 36, H - 86);
    ctx.shadowBlur = 0;
    ctx.font = "600 20px Radiance";
    ctx.fillStyle = DIM;
    let x = 36;
    const heroLine = d.username === d.hero ? "" : d.hero;
    if (heroLine) { ctx.fillText(heroLine, x, H - 52); x += ctx.measureText(heroLine).width + 16; }
    if (rankImage && d.rank) {
      ctx.drawImage(rankImage, x, H - 76, 32, 32);
      ctx.fillText(d.rank.name, x + 38, H - 52);
    }

    // Right side: result, KDA, then the three highlights.
    const L = 510, R = W - 56;
    if (icon) { // the team crest as a cream silhouette, since Hidden King's is near black
      const tint = document.createElement("canvas");
      tint.width = tint.height = 46 * SCALE;
      const t = tint.getContext("2d");
      t.drawImage(icon, 0, 0, tint.width, tint.height);
      t.globalCompositeOperation = "source-in";
      t.fillStyle = CREAM;
      t.fillRect(0, 0, tint.width, tint.height);
      ctx.drawImage(tint, L, 52, 46, 46);
    }
    ctx.save();
    ctx.translate(L + 62, 96);
    ctx.rotate(-3 * Math.PI / 180);
    ctx.font = "600 64px Oracle";
    ctx.fillStyle = d.won ? CREAM : "#E0A090";
    ctx.fillText(d.won ? "VICTORY" : "DEFEAT", 0, 0);
    ctx.restore();
    ctx.font = "600 19px Radiance";
    ctx.fillStyle = DIM;
    ctx.fillText([d.team.name, d.lane && d.lane + " lane", d.duration, d.date].filter(Boolean).join("  ·  "), L, 136);

    ctx.font = "600 60px Oracle";
    ctx.fillStyle = CREAM;
    let kx = L;
    d.kda.forEach((value, i) => {
      if (i) {
        ctx.fillStyle = FAINT;
        ctx.fillText("/", kx + 12, 226);
        kx += ctx.measureText("/").width + 26;
        ctx.fillStyle = CREAM;
      }
      ctx.fillText(String(value), kx, 226);
      kx += ctx.measureText(String(value)).width;
    });
    ctx.font = "700 14px Pulp";
    ctx.fillStyle = FAINT;
    ctx.fillText("K  /  D  /  A", L + 2, 250);
    if (Number.isFinite(d.souls)) {
      ctx.font = "600 34px Oracle";
      const souls = fmtStat(d.souls), sw = ctx.measureText(souls).width;
      ctx.fillStyle = DIM;
      ctx.fillText(souls, R - sw, 222);
      if (soul) ctx.drawImage(soul, R - sw - 30, 196, 24, 24);
      ctx.font = "700 14px Pulp";
      ctx.fillStyle = FAINT;
      ctx.fillText("SOULS", R - ctx.measureText("SOULS").width, 250);
    }

    const lines = d.lines.length ? d.lines : [{ label: "Match", big: d.won ? "Victory" : "Defeat", sub: d.duration, tone: "" }];
    const top = 294, gap = 22, colW = (R - L - gap * (lines.length - 1)) / lines.length;
    lines.forEach((line, i) => {
      const cx = L + i * (colW + gap);
      ctx.fillStyle = "rgba(24,23,22,.82)";
      roundRect(ctx, cx, top, colW, 224, 10);
      ctx.fill();
      ctx.strokeStyle = line.tone === "gold" ? "rgba(255,237,121,.35)" : "rgba(255,239,215,.1)";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (line.tone === "bad") { ctx.fillStyle = "#B84A3C"; ctx.fillRect(cx, top + 12, 3, 200); }
      ctx.font = "700 14px Pulp";
      ctx.fillStyle = TONE[line.tone] || DIM;
      ctx.fillText(wrap(ctx, line.label.toUpperCase(), colW - 40, 1)[0], cx + 22, top + 42);
      const size = fit(ctx, line.big, colW - 40, "600 {s}px Oracle", 46, 26);
      ctx.font = `600 ${size}px Oracle`;
      ctx.fillStyle = line.tone === "gold" ? "#FFED79" : line.tone === "good" ? "#7FE38C" : CREAM;
      ctx.fillText(line.big, cx + 22, top + 106);
      ctx.font = "600 18px Radiance";
      ctx.fillStyle = "rgba(255,239,215,.78)";
      wrap(ctx, line.sub || "", colW - 40, 3).forEach((text, j) => ctx.fillText(text, cx + 22, top + 146 + j * 25));
    });

    // Footer: the site's name and the fan-project notice.
    ctx.font = "700 20px Pulp";
    ctx.fillStyle = CREAM;
    ctx.fillText("POSTMORTEM", L, H - 50);
    const brand = ctx.measureText("POSTMORTEM").width;
    ctx.font = "600 16px Radiance";
    ctx.fillStyle = FAINT;
    ctx.fillText("Deadlock match highlights", L + brand + 14, H - 51);
    ctx.font = "400 12px Radiance";
    const notice = "Unofficial fan project. Not affiliated with Valve.";
    ctx.fillText(notice, R - ctx.measureText(notice).width, H - 51);
    return canvas;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function build() {
    dialog = document.createElement("div");
    dialog.id = "shareDialog";
    dialog.hidden = true;
    dialog.innerHTML = `<div class="share-panel" role="dialog" aria-modal="true" aria-labelledby="shareTitle">
      <header><h2 id="shareTitle">Share this match</h2><button type="button" class="share-close" data-share="close" aria-label="Close">×</button></header>
      <div class="share-preview"><img alt="Match share card"><span class="share-loading">Drawing…</span></div>
      <div class="share-actions">
        <button type="button" class="share-main" data-share="copy">Copy image</button>
        <button type="button" data-share="save">Save PNG</button>
        <button type="button" data-share="link">Copy link</button>
        <span class="share-status" role="status"></span>
      </div>
      <p class="share-privacy">Shows usernames and this match. Never an account ID.</p></div>`;
    $("stage").append(dialog);
    dialog.addEventListener("click", event => {
      if (event.target === dialog) return close();
      const action = event.target.closest("[data-share]")?.dataset.share;
      if (action === "close") close();
      else if (action) act(action);
    });
    dialog.addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      const items = [...dialog.querySelectorAll("button:not(:disabled)")];
      const at = items.indexOf(document.activeElement);
      if (event.shiftKey && at <= 0) { items[items.length - 1].focus(); event.preventDefault(); }
      else if (!event.shiftKey && at === items.length - 1) { items[0].focus(); event.preventDefault(); }
    });
  }

  let data, image, blob;
  async function open(d, from) {
    if (!dialog) build();
    data = d;
    opener = from;
    image = blob = null;
    const img = dialog.querySelector(".share-preview img");
    img.removeAttribute("src");
    dialog.querySelector(".share-status").textContent = "";
    dialog.querySelector(".share-loading").hidden = false;
    dialog.querySelectorAll(".share-actions button").forEach(b => { b.disabled = b.dataset.share !== "link"; });
    dialog.hidden = false;
    dialog.querySelector(".share-close").focus();
    const canvas = await draw(d);
    if (data !== d || dialog.hidden) return;
    try {
      lastUrl = canvas.toDataURL("image/png");
      blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    } catch (_) {
      lastUrl = null;
    }
    dialog.querySelector(".share-loading").hidden = true;
    if (!lastUrl) {
      dialog.querySelector(".share-status").textContent = "This browser could not draw the image.";
      return;
    }
    img.src = lastUrl;
    image = lastUrl;
    dialog.querySelectorAll(".share-actions button").forEach(b => {
      b.disabled = b.dataset.share === "copy" && !(navigator.clipboard?.write && window.ClipboardItem && blob);
    });
    dialog.querySelector(".share-main:not(:disabled)")?.focus();
  }

  async function act(action) {
    const status = dialog.querySelector(".share-status");
    const say = text => { status.textContent = text; setTimeout(() => { if (status.textContent === text) status.textContent = ""; }, 2600); };
    if (action === "save" && image) {
      const a = document.createElement("a");
      a.href = image;
      a.download = `postmortem-${data.username.replace(/[^\w-]+/g, "_").slice(0, 32) || "match"}.png`;
      a.click();
      say("Saved");
    } else if (action === "copy" && blob) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        say("Image copied. Paste it anywhere.");
      } catch (_) { say("Copy was blocked. Use Save PNG."); }
    } else if (action === "link") {
      try {
        await navigator.clipboard.writeText(data.link);
        say("Link copied");
      } catch (_) { say(data.link); }
    }
  }

  function close() {
    if (!dialog || dialog.hidden) return false;
    dialog.hidden = true;
    data = null;
    opener?.focus({ preventScroll: true });
    return true;
  }

  return { open, close, draw };
})();
