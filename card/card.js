/*
 * Postmortem simple card.
 *
 * One card design, five rarities. Rarity changes ONLY the frame, the inks and the
 * stamp, never the art. Each rung adds one thing you can name:
 *
 *   Common     10  Plain print        one black ink, double rule, engraved portrait oval
 *   Rare       J   Second ink         oxblood joins: red frame, red wave band behind the number
 *   Epic       Q   Engraved border    lathe-work border, corner rosettes, oval ring, serial no.
 *   Legendary  K   Coroner's seal     embossed oxblood seal, security field, colour-shift ink
 *   Mythical   A   Black note         inverted: black paper, bone ink, everything above
 *
 * Bad cards are the same card with damage, scaled to how bad it was:
 *   1 scuffed  2 creased  3 torn corner, taped  4 torn in two, taped  5 torn, taped, stained
 *
 * Usage:
 *   const el = PMCard.render({ rarity:'legendary', hero:13, suit:'combat', value:'34,210',
 *     stat:'Hero Damage', line:'Top 1% of Haze games', flavor:'…', serial:'0014 of 1,400' });
 *   PMCard.renderBack();
 *   PMCard.enableTilt(container)   // one delegated listener for a whole hand
 *
 * Engraving is generated once per rarity into shared <symbol>s, so ten cards on screen
 * cost ten <use> references, not ten copies of the line work. Tilt only touches
 * transform and two custom properties on the card under the pointer.
 */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const W = 250, H = 350;               // card units: 2.5 x 3.5 in at 100 per inch
  const TAU = Math.PI * 2;

  const RARITY = {
    common:    { rank: '10', name: 'Common',    word: 'Ten' },
    rare:      { rank: 'J',  name: 'Rare',      word: 'Jack' },
    epic:      { rank: 'Q',  name: 'Epic',      word: 'Queen' },
    legendary: { rank: 'K',  name: 'Legendary', word: 'King' },
    mythical:  { rank: 'A',  name: 'Mythical',  word: 'Ace' },
  };
  const SUIT = {
    combat:   { name: 'Combat',   plural: 'Skulls' },
    survival: { name: 'Survival', plural: 'Hearts' },
    souls:    { name: 'Souls',    plural: 'Souls' },
    crown:    { name: 'Crown',    plural: 'Crowns' },
  };
  const ORDER = ['common', 'rare', 'epic', 'legendary', 'mythical'];
  const tier = r => ORDER.indexOf(r);

  /* ---------- geometry helpers ---------- */
  const f1 = n => (Math.round(n * 10) / 10).toString();
  function poly(pts, close) {
    let d = 'M' + f1(pts[0][0]) + ' ' + f1(pts[0][1]);
    for (let i = 1; i < pts.length; i++) d += 'L' + f1(pts[i][0]) + ' ' + f1(pts[i][1]);
    return close ? d + 'Z' : d;
  }
  // Seeded random so damage and scuffs are stable per card.
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Point and inward normal on a rounded rectangle, by arc length s.
  function rrect(x0, y0, x1, y1, r) {
    const w = x1 - x0 - 2 * r, h = y1 - y0 - 2 * r, q = Math.PI * r / 2;
    const L = 2 * w + 2 * h + 4 * q;
    function at(s) {
      s = ((s % L) + L) % L;
      if (s < w) return [x0 + r + s, y0, 0, 1];
      s -= w;
      if (s < q) { const a = -Math.PI / 2 + s / r; return [x1 - r + r * Math.cos(a), y0 + r + r * Math.sin(a), -Math.cos(a), -Math.sin(a)]; }
      s -= q;
      if (s < h) return [x1, y0 + r + s, -1, 0];
      s -= h;
      if (s < q) { const a = s / r; return [x1 - r + r * Math.cos(a), y1 - r + r * Math.sin(a), -Math.cos(a), -Math.sin(a)]; }
      s -= q;
      if (s < w) return [x1 - r - s, y1, 0, -1];
      s -= w;
      if (s < q) { const a = Math.PI / 2 + s / r; return [x0 + r + r * Math.cos(a), y1 - r + r * Math.sin(a), -Math.cos(a), -Math.sin(a)]; }
      s -= q;
      if (s < h) return [x0, y1 - r - s, 1, 0];
      s -= h;
      const a = Math.PI + s / r; return [x0 + r + r * Math.cos(a), y0 + r + r * Math.sin(a), -Math.cos(a), -Math.sin(a)];
    }
    return { L, at };
  }

  // Lathe-work ribbon: strands that weave along a rounded rectangle band.
  function latheBorder(inset, width, r, waves, strands, sign) {
    const c = inset + width / 2, hw = width / 2 * 0.92;
    const rr = rrect(c, c, W - c, H - c, r);
    const steps = Math.ceil(rr.L * 1.6);
    let d = '';
    for (let i = 0; i < strands; i++) {
      const ph = i * TAU / strands, pts = [];
      for (let k = 0; k <= steps; k++) {
        const s = k / steps * rr.L, [x, y, nx, ny] = rr.at(s);
        const o = sign * hw * Math.sin(TAU * waves * s / rr.L + ph);
        pts.push([x + nx * o, y + ny * o]);
      }
      d += poly(pts, true);
    }
    return d;
  }

  // Radial wave rings (rosette). Elliptical when ry differs from rx.
  function rosette(cx, cy, rx, ry, amp, lobes, strands, ringCount, ringGap) {
    let d = '';
    for (let j = 0; j < ringCount; j++) {
      const ax = rx + j * ringGap, ay = ry + j * ringGap * (ry / rx);
      for (let i = 0; i < strands; i++) {
        const ph = i * TAU / strands / lobes, pts = [], n = Math.ceil((ax + ay) * 3.2);
        for (let k = 0; k <= n; k++) {
          const t = k / n * TAU, m = 1 + amp / ax * Math.sin(lobes * t + ph * lobes);
          pts.push([cx + ax * m * Math.cos(t), cy + ay * m * Math.sin(t)]);
        }
        d += poly(pts, true);
      }
    }
    return d;
  }

  // Wave band: families of sine strands between x0 and x1, pinched at the ends.
  function waveBand(x0, x1, yc, amp, periods, strands) {
    let d = '';
    const n = Math.ceil((x1 - x0) * 1.5);
    for (let fam = 0; fam < 2; fam++) {
      for (let i = 0; i < strands; i++) {
        const ph = i * TAU / strands + fam * Math.PI / strands, pts = [];
        for (let k = 0; k <= n; k++) {
          const u = k / n, x = x0 + u * (x1 - x0), env = Math.sin(Math.PI * u) ** 0.6;
          const a = amp * env * (fam ? 0.62 : 1);
          pts.push([x, yc + a * Math.sin(TAU * (fam ? periods * 1.5 : periods) * u + ph)]);
        }
        d += poly(pts);
      }
    }
    return d;
  }

  // Security field: concentric wavy ellipses filling the card, faint.
  function field(cx, cy, r0, r1, gap) {
    let d = '';
    for (let r = r0; r < r1; r += gap) {
      const n = Math.ceil(r * 2.4), lobes = Math.round(r / 4.5), pts = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n * TAU, m = r + 1.2 * Math.sin(lobes * t);
        pts.push([cx + m * Math.cos(t), cy + m * 1.12 * Math.sin(t)]);
      }
      d += poly(pts, true);
    }
    return d;
  }

  // Engraved portrait ground: horizontal lines, heavier toward the edge of the oval.
  function hatch(cx, cy, rx, ry, gap) {
    const out = [];
    for (let y = cy - ry; y <= cy + ry; y += gap) {
      const v = (y - cy) / ry, half = rx * Math.sqrt(Math.max(0, 1 - v * v));
      if (half < 1) continue;
      out.push({ d: 'M' + f1(cx - half) + ' ' + f1(y) + 'H' + f1(cx + half), w: 0.32 + 0.5 * Math.abs(v) ** 2.2 });
    }
    return out;
  }

  /* ---------- the portrait and frame layout (card units) ---------- */
  const OVAL = { cx: 125, cy: 186, rx: 62, ry: 74 };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ---------- shared defs: built once per page ---------- */
  let defsBuilt = false;
  function ensureDefs() {
    if (defsBuilt) return;
    defsBuilt = true;
    const svg = el('svg', { width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden' });
    const defs = el('defs', {}, svg);
    const A = window.PM_CARD_ART;

    // hero silhouettes
    for (const id in A.heroes) {
      const h = A.heroes[id];
      const s = el('symbol', { id: 'pm-hero-' + id, viewBox: h.viewBox }, defs);
      el('path', { d: h.body, class: 'pm-sil', 'fill-rule': 'evenodd' }, s);
      if (h.eyes) el('path', { d: h.eyes, class: 'pm-eyes' }, s);
    }
    for (const k in A.suits) {
      const s = el('symbol', { id: 'pm-suit-' + k, viewBox: A.suits[k].viewBox }, defs);
      el('path', { d: A.suits[k].d, fill: 'currentColor' }, s);
    }
    if (A.logo) {
      const s = el('symbol', { id: 'pm-logo', viewBox: A.logo.viewBox }, defs);
      s.innerHTML = A.logo.inner;
    }

    // clip for the portrait oval
    const cp = el('clipPath', { id: 'pm-oval-clip' }, defs);
    el('ellipse', { cx: OVAL.cx, cy: OVAL.cy, rx: OVAL.rx, ry: OVAL.ry }, cp);
    const cpIn = el('clipPath', { id: 'pm-inner-clip' }, defs);
    el('rect', { x: 19, y: 19, width: W - 38, height: H - 38, rx: 4 }, cpIn);

    // engraving per rarity
    for (const r of ORDER) defs.appendChild(buildEngraving(r));
    defs.appendChild(buildBack());
    document.body.prepend(svg);
  }

  function buildEngraving(r) {
    const t = tier(r);
    const g = el('symbol', { id: 'pm-engr-' + r, viewBox: `0 0 ${W} ${H}` });

    // Legendary and Mythical: security field behind everything.
    if (t >= 3) {
      el('path', { d: field(OVAL.cx, OVAL.cy - 6, 8, 230, t === 4 ? 3.1 : 3.6), class: 'e-field', 'clip-path': 'url(#pm-inner-clip)' }, g);
    }

    // Wave band behind the stat number: Rare up.
    if (t >= 1) {
      el('path', { d: waveBand(30, 220, 61, t >= 3 ? 15 : 13, t >= 2 ? 2.5 : 2, t >= 3 ? 9 : 7), class: 'e-band' }, g);
    }

    // Frame.
    if (t === 0) {
      // Common: a plain double rule in black.
      el('rect', { x: 9, y: 9, width: W - 18, height: H - 18, rx: 6, class: 'e-rule e-rule--outer' }, g);
      el('rect', { x: 13, y: 13, width: W - 26, height: H - 26, rx: 3.5, class: 'e-rule e-rule--inner' }, g);
    } else if (t === 1) {
      // Rare: a heavy oxblood rule with a hairline inside it.
      el('rect', { x: 10.5, y: 10.5, width: W - 21, height: H - 21, rx: 5.5, class: 'e-rule e-rule--heavy' }, g);
      el('rect', { x: 16, y: 16, width: W - 32, height: H - 32, rx: 3, class: 'e-rule e-rule--inner' }, g);
    } else {
      // Epic up: lathe-work ribbon between two rules, rosettes on the corners.
      const waves = t >= 3 ? 96 : 72;
      if (t >= 3) {
        // Legendary up: the border band is printed solid in the second ink, engraved through in bone
        const o = 7.5, i = 19.5;
        el('path', { d: `M${o + 7} ${o}H${W - o - 7}A7 7 0 0 1 ${W - o} ${o + 7}V${H - o - 7}A7 7 0 0 1 ${W - o - 7} ${H - o}H${o + 7}A7 7 0 0 1 ${o} ${H - o - 7}V${o + 7}A7 7 0 0 1 ${o + 7} ${o}Z` +
          `M${i + 4} ${i}H${W - i - 4}A4 4 0 0 1 ${W - i} ${i + 4}V${H - i - 4}A4 4 0 0 1 ${W - i - 4} ${H - i}H${i + 4}A4 4 0 0 1 ${i} ${H - i - 4}V${i + 4}A4 4 0 0 1 ${i + 4} ${i}Z`,
          class: 'e-bandfill', 'fill-rule': 'evenodd' }, g);
      }
      el('path', { d: latheBorder(8.5, 10, 6, waves, t >= 3 ? 5 : 4, 1), class: 'e-lathe e-lathe--a' }, g);
      el('path', { d: latheBorder(8.5, 10, 6, waves, t >= 3 ? 5 : 4, -1), class: 'e-lathe e-lathe--b' }, g);
      el('rect', { x: 7.5, y: 7.5, width: W - 15, height: H - 15, rx: 7, class: 'e-rule e-rule--outer' }, g);
      el('rect', { x: 19.5, y: 19.5, width: W - 39, height: H - 39, rx: 4, class: 'e-rule e-rule--inner' }, g);
      // microtext rule just inside the border
      const mp = el('path', { id: 'pm-micro-' + r, d: `M24 23.2H${W - 24}`, fill: 'none' }, g);
      const tx = el('text', { class: 'e-micro' }, g);
      const tp = el('textPath', { href: '#pm-micro-' + r }, tx);
      tp.textContent = 'POSTMORTEM · CERTIFIED TRUE RECORD OF THE MATCH · '.repeat(3);
      const mp2 = el('path', { id: 'pm-micro2-' + r, d: `M${W - 24} ${H - 21}H24`, fill: 'none' }, g);
      void mp; void mp2;
      const tx2 = el('text', { class: 'e-micro' }, g);
      const tp2 = el('textPath', { href: '#pm-micro2-' + r }, tx2);
      tp2.textContent = 'ISSUED BY THE CORONER OF THE CURSED APPLE · '.repeat(3);
      tx2.setAttribute('transform', `rotate(180 ${W / 2} ${H - 21})`);
    }

    // Portrait: engraved ground, then rings.
    el('ellipse', { cx: OVAL.cx, cy: OVAL.cy, rx: OVAL.rx, ry: OVAL.ry, class: 'e-ground' }, g);
    const hg = el('g', { 'clip-path': 'url(#pm-oval-clip)', class: 'e-hatch' }, g);
    for (const l of hatch(OVAL.cx, OVAL.cy, OVAL.rx, OVAL.ry, t === 4 ? 1.7 : 2.1)) {
      el('path', { d: l.d, 'stroke-width': f1(l.w) }, hg);
    }
    if (t >= 2) {
      el('path', { d: rosette(OVAL.cx, OVAL.cy, OVAL.rx + 4.5, OVAL.ry + 4.5, 1.6, t >= 3 ? 44 : 36, 3, 2, 3.2), class: 'e-ring' }, g);
      el('ellipse', { cx: OVAL.cx, cy: OVAL.cy, rx: OVAL.rx + 12.2, ry: OVAL.ry + 12.2, class: 'e-rule e-rule--ring' }, g);
    }
    el('ellipse', { cx: OVAL.cx, cy: OVAL.cy, rx: OVAL.rx, ry: OVAL.ry, class: 'e-rule e-rule--oval' }, g);
    el('ellipse', { cx: OVAL.cx, cy: OVAL.cy, rx: OVAL.rx + 2.6, ry: OVAL.ry + 2.6, class: 'e-rule e-rule--oval2' }, g);

    // Corner rosettes: Epic up.
    if (t >= 2) {
      for (const [x, y] of [[13, 13], [W - 13, 13], [13, H - 13], [W - 13, H - 13]]) {
        el('circle', { cx: x, cy: y, r: 8.2, class: 'e-boss' }, g);
        el('path', { d: rosette(x, y, 3.4, 3.4, 1.6, 9, 3, 2, 2.1), class: 'e-rose' }, g);
      }
    }
    return g;
  }

  function buildBack() {
    const g = el('symbol', { id: 'pm-back', viewBox: `0 0 ${W} ${H}` });
    el('path', { d: field(W / 2, H / 2, 6, 230, 4.2), class: 'b-field', 'clip-path': 'url(#pm-inner-clip)' }, g);
    el('path', { d: latheBorder(8.5, 10, 6, 84, 4, 1), class: 'b-lathe' }, g);
    el('path', { d: latheBorder(8.5, 10, 6, 84, 4, -1), class: 'b-lathe' }, g);
    el('rect', { x: 7.5, y: 7.5, width: W - 15, height: H - 15, rx: 7, class: 'b-rule' }, g);
    el('rect', { x: 19.5, y: 19.5, width: W - 39, height: H - 39, rx: 4, class: 'b-rule' }, g);
    // big rosette that the coin sits on, a ring of microtext, then the well
    el('path', { d: rosette(W / 2, H / 2, 76, 76, 3.4, 30, 4, 3, 6), class: 'b-rose' }, g);
    el('path', { d: rosette(W / 2, H / 2, 70, 70, 2.2, 22, 3, 1, 0), class: 'b-rose2' }, g);
    el('circle', { cx: W / 2, cy: H / 2, r: 66, class: 'b-well' }, g);
    el('path', { id: 'pm-back-arc', d: `M${W / 2 - 61} ${H / 2}a61 61 0 1 1 122 0a61 61 0 1 1 -122 0`, fill: 'none' }, g);
    const tx = el('text', { class: 'b-micro' }, g);
    const tp = el('textPath', { href: '#pm-back-arc' }, tx);
    tp.textContent = 'POSTMORTEM · EVERY MATCH LEAVES A RECORD · '.repeat(2);
    el('circle', { cx: W / 2, cy: H / 2, r: 57, class: 'b-rule' }, g);
    for (const [x, y] of [[13, 13], [W - 13, 13], [13, H - 13], [W - 13, H - 13]]) {
      el('circle', { cx: x, cy: y, r: 8.2, class: 'b-boss' }, g);
      el('path', { d: rosette(x, y, 3.4, 3.4, 1.6, 9, 3, 2, 2.1), class: 'b-roseS' }, g);
    }
    return g;
  }

  /* ---------- seal ---------- */
  function sealSVG(rank, suit) {
    const s = el('svg', { viewBox: '-50 -50 100 100', class: 'pm-seal', 'aria-hidden': 'true' });
    // notary rim: 48 notches
    const pts = [];
    for (let i = 0; i < 96; i++) {
      const a = i / 96 * TAU, r = i % 2 ? 44.5 : 48;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    el('path', { d: poly(pts, true), class: 's-rim' }, s);
    el('circle', { r: 40, class: 's-line' }, s);
    el('circle', { r: 27, class: 's-line' }, s);
    el('path', { id: 'pm-seal-arc', d: 'M-33.5 0a33.5 33.5 0 1 1 67 0a33.5 33.5 0 1 1 -67 0', fill: 'none' }, s);
    const tx = el('text', { class: 's-text' }, s);
    const tp = el('textPath', { href: '#pm-seal-arc', startOffset: '0' }, tx);
    tp.textContent = 'CERTIFIED · POSTMORTEM · CERTIFIED · POSTMORTEM ·';
    el('use', { href: '#pm-suit-' + suit, x: -12, y: -18, width: 24, height: 24, class: 's-suit' }, s);
    const rk = el('text', { y: 19, class: 's-rank', 'text-anchor': 'middle' }, s);
    rk.textContent = rank;
    return s;
  }

  /* ---------- damage overlay for bad cards ---------- */
  function damage(level, seed) {
    const R = rng(seed);
    const s = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pm-dmg', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const gid = 'pm-grime-' + seed;
    const defs = el('defs', {}, s);
    const rg = el('radialGradient', { id: gid }, defs);
    el('stop', { offset: '0', 'stop-color': '#4a3018', 'stop-opacity': '.14' }, rg);
    el('stop', { offset: '.6', 'stop-color': '#4a3018', 'stop-opacity': '.06' }, rg);
    el('stop', { offset: '1', 'stop-color': '#4a3018', 'stop-opacity': '0' }, rg);
    // grime: soft handling marks, more of them the worse it was
    for (let i = 0; i < 2 + level * 2; i++) {
      el('ellipse', { cx: f1(R() * W), cy: f1(R() * H), rx: f1(20 + R() * 45), ry: f1(16 + R() * 34), fill: `url(#${gid})` }, s);
    }
    // scuffs: ink rubbed off along the edges and corners
    let scuff = '';
    for (let i = 0; i < 22 + level * 14; i++) {
      const edge = R() * 4 | 0, u = R(), d = Math.pow(R(), 2) * 15;
      const x = edge % 2 ? (edge === 1 ? W - 3 - d : 3 + d) : 6 + u * (W - 12);
      const y = edge % 2 ? 6 + u * (H - 12) : (edge === 0 ? 3 + d : H - 3 - d);
      const rx = 0.3 + R() * (0.8 + level * 0.35), ry = rx * (0.25 + R() * 0.5), a = edge % 2 ? 80 + R() * 20 : R() * 20 - 10;
      scuff += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" transform="rotate(${f1(a)} ${f1(x)} ${f1(y)})"/>`;
    }
    for (const [cx, cy] of [[5, 5], [W - 5, 5], [5, H - 5], [W - 5, H - 5]]) {
      for (let i = 0; i < 3 + level * 2; i++) {
        const x = cx + (R() - 0.5) * 12, y = cy + (R() - 0.5) * 12, r = 0.4 + R() * 1.8;
        scuff += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}"/>`;
      }
    }
    el('g', { class: 'd-scuff' }, s).innerHTML = scuff;
    // crease: a fold line, light on one side and dark on the other
    if (level >= 2) {
      const y0 = 50 + R() * 50, y1 = y0 + 150 + R() * 60;
      el('path', { d: `M-2 ${f1(y0)}L${W + 2} ${f1(y1)}`, class: 'd-crease-dk' }, s);
      el('path', { d: `M-2 ${f1(y0 + 0.9)}L${W + 2} ${f1(y1 + 0.9)}`, class: 'd-crease-lt' }, s);
    }
    // a ring left by a glass
    if (level >= 5) {
      const cx = 70 + R() * 110, cy = 225 + R() * 50, r = 28 + R() * 6;
      el('circle', { cx: f1(cx), cy: f1(cy), r: f1(r), class: 'd-stain' }, s);
      el('circle', { cx: f1(cx + 1.5), cy: f1(cy - 1), r: f1(r - 2), class: 'd-stain d-stain--2' }, s);
    }
    return s;
  }

  // The torn edge: pale paper fibres showing along the tear.
  function tearEdge(line, side) {
    const s = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pm-dmg', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const d = poly(line);
    el('path', { d, class: 'd-tear-shadow', transform: `translate(${side * 0.5} ${side * 0.7})` }, s);
    el('path', { d, class: 'd-tear-fibre' }, s);
    return s;
  }

  // Jagged tear path for clip-path: polygon points in percent.
  function tearLine(R, x0, y0, x1, y1, n, jag) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, j = (i === 0 || i === n) ? 0 : (R() - 0.5) * jag;
      const nx = -(y1 - y0), ny = (x1 - x0), L = Math.hypot(nx, ny);
      pts.push([x0 + (x1 - x0) * u + nx / L * j, y0 + (y1 - y0) * u + ny / L * j]);
    }
    return pts;
  }
  const pc = pts => pts.map(([x, y]) => `${f1(x / W * 100)}% ${f1(y / H * 100)}%`).join(',');

  /* ---------- render ---------- */
  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function suitIcon(suit, cls) {
    const s = el('svg', { class: cls, viewBox: '0 0 10 10', 'aria-hidden': 'true' });
    el('use', { href: '#pm-suit-' + suit, width: 10, height: 10 }, s);
    return s;
  }

  function render(o) {
    ensureDefs();
    const r = o.rarity, t = tier(r), R = RARITY[r], S = SUIT[o.suit];
    const card = h('article', `pm-card r-${r}` + (o.bad ? ` is-bad bad-${o.bad}` : ''));
    card.setAttribute('aria-label', `${R.word} of ${S.plural}, ${R.name}: ${o.value} ${o.stat}. ${o.line}.`);
    card.tabIndex = 0;
    const tilt = h('div', 'pm-tilt');
    const face = h('div', 'pm-face');
    tilt.appendChild(face);
    card.appendChild(tilt);

    const engr = el('svg', { class: 'pm-engr', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    el('use', { href: '#pm-engr-' + r }, engr);
    face.appendChild(engr);

    // portrait
    const por = el('svg', { class: 'pm-portrait', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const pg = el('g', { 'clip-path': 'url(#pm-oval-clip)' }, por);
    const hv = (window.PM_CARD_ART.heroes[o.hero] || {}).viewBox || '0 0 280 380';
    const [, , vw, vh] = hv.split(' ').map(Number);
    const sw = OVAL.rx * 2 * 0.98, shh = sw * vh / vw;
    el('use', { href: '#pm-hero-' + o.hero, x: f1(OVAL.cx - sw / 2 + 2), y: f1(OVAL.cy - OVAL.ry + 9), width: f1(sw), height: f1(shh) }, pg);
    face.appendChild(por);

    // corner indices
    for (const pos of ['tl', 'br']) {
      const idx = h('div', 'pm-idx pm-idx--' + pos);
      idx.appendChild(h('span', 'pm-rank' + (R.rank.length > 1 ? ' is-ten' : ''), R.rank));
      idx.appendChild(suitIcon(o.suit, 'pm-suit'));
      face.appendChild(idx);
    }

    const head = h('div', 'pm-head');
    head.appendChild(h('span', 'pm-suitname', S.name));
    head.appendChild(h('span', 'pm-rarity', R.name));
    face.appendChild(head);
    // Epic up: a banknote serial in the second ink, which is the real rank of this game
    if (t >= 2 && o.serial) {
      const [no, of] = o.serial.split(/\s+of\s+/);
      for (const pos of ['tr']) {
        const sc = h('div', 'pm-serial pm-serial--' + pos);
        sc.appendChild(h('span', 'pm-serial__no', 'No. ' + no));
        if (of) sc.appendChild(h('span', 'pm-serial__of', 'of ' + of));
        face.appendChild(sc);
      }
    }

    const stat = h('div', 'pm-stat');
    stat.appendChild(h('div', 'pm-num', o.value));
    stat.appendChild(h('div', 'pm-label', o.stat));
    face.appendChild(stat);

    if (t >= 3) {
      const seal = h('div', 'pm-sealwrap');
      seal.appendChild(sealSVG(R.rank, o.suit));
      face.appendChild(seal);
    }

    const foot = h('div', 'pm-foot');
    foot.appendChild(h('div', 'pm-title', `${R.word} of ${S.plural}`));
    foot.appendChild(h('div', 'pm-line', o.line));
    if (o.flavor) foot.appendChild(h('div', 'pm-flavor', o.flavor));
    face.appendChild(foot);

    face.appendChild(h('div', 'pm-light'));

    if (o.bad) {
      const seed = hash(o.value + o.stat + r);
      face.appendChild(damage(o.bad, seed));
      applyTear(card, tilt, face, o.bad, seed);
    }
    return card;
  }

  function applyTear(card, tilt, face, level, seed) {
    const R = rng(seed ^ 0x9e3779b9);
    if (level === 3) {
      // top right corner torn off and taped back on, slightly askew
      const line = tearLine(R, W - 84, -2, W + 2, 94, 22, 6);
      face.style.clipPath = `polygon(0% 0%, ${pc(line)}, 100% 100%, 0% 100%)`;
      face.appendChild(tearEdge(line, 1));
      const piece = face.cloneNode(true);
      piece.classList.add('pm-piece');
      piece.style.clipPath = `polygon(${pc(line)}, 100% 0%)`;
      piece.style.transform = 'translate(.5%, -.3%) rotate(.9deg)';
      piece.style.transformOrigin = '100% 0%';
      piece.appendChild(tearEdge(line, -1));
      tilt.appendChild(piece);
      tilt.appendChild(tape(196, 30, 54, 15, -44));
      tilt.appendChild(tape(232, 72, 44, 15, -38));
    } else if (level >= 4) {
      // torn across, the halves a little out of line, taped
      const line = tearLine(R, -2, 158 + R() * 20, W + 2, 176 + R() * 20, 34, 8);
      face.style.clipPath = `polygon(0% 0%, 100% 0%, ${pc(line.slice().reverse())})`;
      face.appendChild(tearEdge(line, 1));
      const piece = face.cloneNode(true);
      piece.classList.add('pm-piece');
      piece.style.clipPath = `polygon(${pc(line)}, 100% 100%, 0% 100%)`;
      piece.style.transform = 'translate(-.5%, .45%) rotate(-.8deg)';
      piece.appendChild(tearEdge(line, -1));
      tilt.appendChild(piece);
      tilt.appendChild(tape(52, 170, 62, 16, 86));
      tilt.appendChild(tape(196, 182, 62, 16, 95));
      if (level >= 5) tilt.appendChild(tape(128, 176, 46, 14, 79));
    }
  }
  // A strip of tape, in card units.
  function tape(cx, cy, len, wid, rot) {
    const t = h('div', 'pm-tape');
    t.style.left = f1((cx - len / 2) / W * 100) + '%';
    t.style.top = f1((cy - wid / 2) / H * 100) + '%';
    t.style.width = f1(len / W * 100) + '%';
    t.style.height = f1(wid / H * 100) + '%';
    t.style.transform = `rotate(${rot}deg)`;
    return t;
  }

  function renderBack() {
    ensureDefs();
    const card = h('article', 'pm-card pm-back');
    card.setAttribute('aria-label', 'Postmortem card, face down');
    card.tabIndex = 0;
    const tilt = h('div', 'pm-tilt');
    const face = h('div', 'pm-face');
    const engr = el('svg', { class: 'pm-engr', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    el('use', { href: '#pm-back' }, engr);
    face.appendChild(engr);
    const coin = el('svg', { class: 'pm-coin', viewBox: '0 0 200 200', 'aria-hidden': 'true' });
    el('use', { href: '#pm-logo', width: 200, height: 200 }, coin);
    face.appendChild(coin);
    face.appendChild(h('div', 'pm-backword', 'Postmortem'));
    face.appendChild(h('div', 'pm-light'));
    tilt.appendChild(face);
    card.appendChild(tilt);
    return card;
  }

  /* ---------- tilt: one delegated listener per container ---------- */
  function enableTilt(root) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let active = null, raf = 0, px = 0, py = 0;
    function apply() {
      raf = 0;
      if (!active) return;
      const b = active.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (px - b.left) / b.width));
      const y = Math.min(1, Math.max(0, (py - b.top) / b.height));
      const k = reduce ? 0 : 1;
      active.style.setProperty('--rx', f1((0.5 - y) * 14 * k) + 'deg');
      active.style.setProperty('--ry', f1((x - 0.5) * 18 * k) + 'deg');
      active.style.setProperty('--lx', f1(x * 100) + '%');
      active.style.setProperty('--ly', f1(y * 100) + '%');
      active.style.setProperty('--shift', f1(x * 0.6 + y * 0.4));
    }
    root.addEventListener('pointermove', e => {
      const c = e.target.closest && e.target.closest('.pm-card');
      if (c !== active) {
        if (active) leave(active);
        active = c;
        if (c) c.classList.add('is-live');
      }
      px = e.clientX; py = e.clientY;
      if (active && !raf) raf = requestAnimationFrame(apply);
    });
    root.addEventListener('pointerleave', () => { if (active) leave(active); active = null; });
    function leave(c) {
      c.classList.remove('is-live');
      for (const p of ['--rx', '--ry', '--lx', '--ly', '--shift']) c.style.removeProperty(p);
    }
  }

  window.PMCard = { render, renderBack, enableTilt, RARITY, SUIT, ORDER };
})();
