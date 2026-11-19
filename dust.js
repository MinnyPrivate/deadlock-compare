// Slow floating dust behind the Profile page. Purely decoration:
// - sits behind every panel (z-index -1), never catches clicks
// - a few dozen specks, drifting up and sideways, fading in and out
// - a few specks take the hero accent colour (--accent, set by HeroBackdrop)
// - stops in background tabs; with "reduce motion" on it draws one still frame
(() => {
  const cv = document.getElementById("dust");
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext("2d");
  const layer = cv.closest("#summaryBackdrop");
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, dpr = 1, specks = [], raf = 0, last = 0, accent = "#FFEFD7";

  const rnd = (a, b) => a + Math.random() * (b - a);
  function make(anywhere) {
    return {
      x: rnd(0, W), y: anywhere ? rnd(0, H) : H + 10,
      r: rnd(0.6, 2.1), vy: rnd(-14, -5), vx: rnd(-4, 4), // px per second
      sway: rnd(4, 14), phase: rnd(0, Math.PI * 2), swaySpeed: rnd(0.15, 0.45),
      a: rnd(0.35, 0.85), tw: rnd(0.3, 0.9), tint: Math.random() < 0.3,
    };
  }
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const want = Math.min(120, Math.round((W * H) / 20000));
    while (specks.length < want) specks.push(make(true));
    specks.length = want;
  }
  function readAccent() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    if (v) accent = v;
  }
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    for (const s of specks) {
      const x = s.x + Math.sin(t * s.swaySpeed + s.phase) * s.sway;
      const alpha = s.a * (0.55 + 0.45 * Math.sin(t * s.tw + s.phase));
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = s.tint ? accent : "#FFEFD7";
      ctx.beginPath(); ctx.arc(x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      if (s.r > 1.3) { // a soft halo on the bigger ones
        ctx.globalAlpha = Math.max(0, alpha * 0.18);
        ctx.beginPath(); ctx.arc(x, s.y, s.r * 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function step(now) {
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    for (let i = 0; i < specks.length; i++) {
      const s = specks[i];
      s.y += s.vy * dt; s.x += s.vx * dt;
      if (s.y < -10 || s.x < -20 || s.x > W + 20) specks[i] = make(false);
    }
    draw(now / 1000);
    raf = requestAnimationFrame(step);
  }
  function start() { if (!raf && !still && !document.hidden && !layer?.hidden) { last = 0; raf = requestAnimationFrame(step); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  size(); readAccent();
  window.addEventListener("resize", () => { size(); if (still) draw(0); });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  if (layer) new MutationObserver(() => {
    if (layer.hidden) stop();
    else if (still) draw(0);
    else start();
  }).observe(layer, { attributes: true, attributeFilter: ["hidden"] });
  // the accent changes when a profile loads; re-read it then
  new MutationObserver(() => { readAccent(); if (still) draw(0); }).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-theme"] });
  if (still) draw(0); else start();
})();
