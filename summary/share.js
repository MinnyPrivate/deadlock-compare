"use strict";

// Share card: the Highlights page as one 1200 by 630 image (the size Discord and other link previews use), drawn on a
// canvas from local art so it can be copied or saved. It shows usernames and the match, never an account ID.
window.ShareCard = (() => {
  const W = 1200, H = 630, SCALE = 2;
  const CREAM = "#FFEFD7", DIM = "rgba(255,239,215,.76)", FAINT = "rgba(255,239,215,.7)", DECOR = "rgba(255,239,215,.4)";
  const TONE = { good: "rgba(255,239,215,.76)", bad: "#E0A090", gold: "#FFED79", "": "rgba(255,239,215,.76)" };
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

  // Cuts text to a width with an ellipsis, so a long name or a name without spaces never runs off the card.
  function ellipsize(ctx, text, width) {
    text = String(text);
    if (ctx.measureText(text).width <= width) return text;
    while (text && ctx.measureText(text + "…").width > width) text = text.slice(0, -1);
    return text.trimEnd() + "…";
  }

  // Sets the largest font size from size down to min that fits; ellipsize() handles anything still too wide.
  function setFont(ctx, text, width, font, size, min) {
    for (let s = size; s >= min; s -= 2) {
      ctx.font = font.replace("{s}", s);
      if (ctx.measureText(text).width <= width) return;
    }
  }

  async function draw(d) {
    await Promise.all(["600 40px Oracle", "700 40px Radiance", "600 20px Radiance", "400 13px Radiance", "700 16px Pulp"].map(f => document.fonts.load(f).catch(() => null)));
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
    g.addColorStop(0, d.accent);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.33;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, "rgba(10,10,9,.15)");
    g.addColorStop(0.42, "rgba(10,10,9,.7)");
    g.addColorStop(1, "rgba(10,10,9,.92)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Hero art down the left, fading into the page.
    const ART = 400;
    const art = remoteArt || localArt;
    if (art) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, ART, H);
      ctx.clip();
      cover(ctx, art, 0, 0, ART, H, 0.1);
      ctx.restore();
      g = ctx.createLinearGradient(ART - 150, 0, ART, 0);
      g.addColorStop(0, "rgba(13,12,11,0)");
      g.addColorStop(1, "rgba(13,12,11,1)");
      ctx.fillStyle = g;
      ctx.fillRect(ART - 150, 0, 151, H);
      g = ctx.createLinearGradient(0, H - 260, 0, H);
      g.addColorStop(0, "rgba(13,12,11,0)");
      g.addColorStop(0.55, "rgba(13,12,11,.82)");
      g.addColorStop(1, "rgba(13,12,11,.97)");
      ctx.fillStyle = g;
      ctx.fillRect(0, H - 260, ART + 1, 260);
    }
    // A thin team stripe down the left edge.
    ctx.fillStyle = d.team.c;
    ctx.fillRect(0, 0, 6, H);

    // Who leads: the username at the top of the art, hero and rank under it, the KDA at its foot.
    g = ctx.createLinearGradient(0, 0, 0, 170);
    g.addColorStop(0, "rgba(13,12,11,.92)");
    g.addColorStop(1, "rgba(13,12,11,0)");
    ctx.fillStyle = g;
    ctx.fillRect(6, 0, ART - 6, 170);
    const LX = 34, LW = ART - 60;
    ctx.shadowColor = "rgba(0,0,0,.85)";
    ctx.shadowBlur = 14;
    setFont(ctx, d.username, LW, "700 {s}px Radiance", 44, 24);
    ctx.fillStyle = CREAM;
    ctx.fillText(ellipsize(ctx, d.username, LW), LX, 72);
    ctx.shadowBlur = 0;
    ctx.font = "600 19px Radiance";
    ctx.fillStyle = DIM;
    let x = LX;
    if (d.username !== d.hero) { ctx.fillText(d.hero, x, 104); x += ctx.measureText(d.hero).width + 14; }
    if (rankImage && d.rank) {
      ctx.drawImage(rankImage, x, 82, 28, 28);
      ctx.fillText(ellipsize(ctx, d.rank.name, LX + LW - x - 34), x + 34, 104);
    }
    ctx.font = "600 40px Oracle";
    let kx = LX;
    d.kda.forEach((value, i) => {
      if (i) {
        ctx.fillStyle = DECOR;
        ctx.fillText("/", kx + 8, H - 42);
        kx += ctx.measureText("/").width + 18;
      }
      ctx.fillStyle = CREAM;
      ctx.fillText(String(value), kx, H - 42);
      kx += ctx.measureText(String(value)).width;
    });
    if (Number.isFinite(d.souls)) {
      ctx.font = "600 24px Oracle";
      ctx.fillStyle = DIM;
      const souls = fmtStat(d.souls);
      if (soul) ctx.drawImage(soul, kx + 22, H - 62, 20, 20);
      ctx.fillText(souls, kx + 46, H - 43);
    }

    // Right side: the result, then one headline achievement, the soul lead, and two supporting facts.
    const L = 440, R = W - 56, RW = R - L;
    if (icon) { // the team crest as a cream silhouette, since Hidden King's is near black
      const tint = document.createElement("canvas");
      tint.width = tint.height = 40 * SCALE;
      const t = tint.getContext("2d");
      t.drawImage(icon, 0, 0, tint.width, tint.height);
      t.globalCompositeOperation = "source-in";
      t.fillStyle = CREAM;
      t.fillRect(0, 0, tint.width, tint.height);
      ctx.drawImage(tint, L, 44, 40, 40);
    }
    ctx.save();
    ctx.translate(L + 52, 80);
    ctx.rotate(-3 * Math.PI / 180);
    ctx.font = "600 46px Oracle";
    ctx.fillStyle = d.won ? CREAM : "#E0A090";
    ctx.fillText(d.won ? "VICTORY" : "DEFEAT", 0, 0);
    ctx.restore();
    ctx.font = "600 17px Radiance";
    ctx.fillStyle = DIM;
    ctx.fillText(ellipsize(ctx, [d.team.name, d.lane && d.lane + " lane", d.duration, d.date].filter(Boolean).join("  ·  "), RW), L, 116);

    const lines = d.lines.length ? d.lines : [{ label: "Match", big: d.won ? "Victory" : "Defeat", sub: d.duration, tone: "" }];
    const [hero, ...rest] = lines;
    const color = tone => tone === "gold" ? "#FFED79" : CREAM;
    ctx.font = "700 17px Pulp";
    ctx.fillStyle = TONE[hero.tone] || DIM;
    ctx.fillText(ellipsize(ctx, hero.label.toUpperCase(), RW), L, 180);
    setFont(ctx, hero.big, RW, "600 {s}px Oracle", 88, 40);
    ctx.fillStyle = color(hero.tone);
    if (hero.tone === "gold") { ctx.shadowColor = "rgba(255,237,121,.35)"; ctx.shadowBlur = 24; }
    ctx.fillText(ellipsize(ctx, hero.big, RW), L - 3, 264);
    ctx.shadowBlur = 0;
    ctx.font = "600 21px Radiance";
    ctx.fillStyle = "rgba(255,239,215,.84)";
    ctx.fillText(ellipsize(ctx, hero.sub || "", RW), L, 298);

    // The soul lead over the whole match: the one real chart on the card.
    let y = 346;
    if (d.spark?.length > 2) {
      const sh = 78, mid = y + sh / 2, scale = Math.max(2000, ...d.spark.map(pt => Math.abs(pt.lead)));
      const px = t => L + t / d.dur * RW, py = v => mid - v / scale * (sh / 2 - 4);
      ctx.save();
      ctx.beginPath();
      d.spark.forEach((pt, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, px(pt.t), py(pt.lead)));
      ctx.lineTo(px(d.spark[d.spark.length - 1].t), mid);
      ctx.lineTo(L, mid);
      ctx.closePath();
      ctx.save(); ctx.clip();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = d.team.c; ctx.fillRect(L, y, RW, sh / 2);
      ctx.fillStyle = d.enemy.c; ctx.fillRect(L, mid, RW, sh / 2);
      ctx.restore();
      ctx.beginPath();
      d.spark.forEach((pt, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, px(pt.t), py(pt.lead)));
      ctx.strokeStyle = CREAM; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "rgba(255,239,215,.25)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L, mid); ctx.lineTo(R, mid); ctx.stroke();
      // Annotate the moment that defines the story, such as the low point of a comeback.
      const mark = d.lines.find(line => line.mark)?.mark;
      const point = mark && d.spark.find(pt => pt.t === mark.t);
      if (point) {
        const mx = px(point.t), my = py(point.lead);
        ctx.fillStyle = CREAM;
        ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
        ctx.font = "600 17px Oracle";
        const tw = ctx.measureText(mark.text).width, tx = Math.min(R - tw, Math.max(L, mx - tw / 2));
        const ty = point.lead >= 0 ? my - 12 : my + 26;
        ctx.fillStyle = "rgba(10,10,9,.85)";
        ctx.fillRect(tx - 6, ty - 17, tw + 12, 23);
        ctx.fillStyle = CREAM;
        ctx.fillText(mark.text, tx, ty);
      }
      ctx.font = "700 17px Pulp";
      ctx.fillStyle = FAINT;
      ctx.fillText(`${d.team.name.toUpperCase()} SOUL LEAD`, L, y - 8);
      ctx.font = "600 16px Radiance";
      ctx.fillText("0:00", L, y + sh + 20);
      ctx.fillText(d.duration, R - ctx.measureText(d.duration).width, y + sh + 20);
      y += sh + 54;
    } else y += 20;

    // Two supporting facts, side by side, no boxes.
    const colW = (RW - 40) / 2;
    rest.slice(0, 2).forEach((line, i) => {
      const cx = L + i * (colW + 40);
      if (i) { ctx.fillStyle = "rgba(255,239,215,.14)"; ctx.fillRect(cx - 20, y - 14, 1, 92); }
      if (line.tone === "bad") { ctx.fillStyle = "#B84A3C"; ctx.fillRect(cx - (i ? 12 : 14), y - 12, 3, 88); }
      ctx.font = "700 17px Pulp";
      ctx.fillStyle = TONE[line.tone] || DIM;
      ctx.fillText(ellipsize(ctx, line.label.toUpperCase(), colW), cx, y);
      setFont(ctx, line.big, colW, "600 {s}px Oracle", 38, 22);
      ctx.fillStyle = color(line.tone);
      ctx.fillText(ellipsize(ctx, line.big, colW), cx, y + 42);
      ctx.font = "600 21px Radiance";
      ctx.fillStyle = "rgba(255,239,215,.84)";
      ctx.fillText(ellipsize(ctx, line.sub || "", colW), cx, y + 72);
    });

    // Footer: the site's name and the fan-project notice.
    ctx.font = "700 19px Pulp";
    ctx.fillStyle = CREAM;
    ctx.fillText("POSTMORTEM", L, H - 34);
    const brand = ctx.measureText("POSTMORTEM").width;
    ctx.font = "600 15px Radiance";
    ctx.fillStyle = FAINT;
    ctx.fillText("Deadlock match highlights", L + brand + 12, H - 35);
    ctx.font = "400 13px Radiance";
    const notice = "Unofficial fan project. Not affiliated with Valve.";
    ctx.fillText(notice, R - ctx.measureText(notice).width, H - 35);
    return canvas;
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
    // Every await is a chance for the dialog to close or reopen on another player, so results are kept local
    // and published only if this is still the current request.
    const stale = () => data !== d || dialog.hidden;
    const canvas = await draw(d);
    if (stale()) return;
    let url = null, png = null;
    try {
      url = canvas.toDataURL("image/png");
      png = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    } catch (_) {
      url = null;
    }
    if (stale()) return;
    lastUrl = url;
    blob = png;
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
