/*
 * Postmortem card, round 2.
 *
 * One card design. The SUIT sets the ink colour and the big pip in the middle, so a
 * hand of different stats reads apart at a glance. The RARITY sets the frame and the
 * paper, never the art. The ladder reads cream, coloured, black:
 *
 *   Common     10  Plain print        cream paper, suit-ink hairline frame
 *   Rare       J   Ink band           a solid band of the suit ink
 *   Epic       Q   Engraved border    lathe-work border, corner rosettes, ringed oval
 *   Legendary  K   Printed in colour  the whole note is printed on suit-tinted paper, engraved
 *                                     edge to edge in bone; the colour bleeds in when dealt
 *   Mythical   A   Black note         black paper, bone ink, everything above
 *
 * Suits: combat (rust), survival (olive), souls (teal), objectives (purple),
 * crown (printed in brass, like the logo), joker (a misprint: off-register inks,
 * one line printed upside down).
 *
 * The only stamp is NEW BEST (a personal record), so it always means something.
 *
 * Bad cards are the same card with damage, scaled to how bad it was:
 *   1 scuffed  2 creased  3 torn corner, taped  4 torn in two, taped  5 torn, taped, stained
 *
 * Usage:
 *   const el = PMCard.render({ rarity:'legendary', suit:'combat', hero:13, heroName:'Haze',
 *     value:'34,210', stat:'Hero Damage', no:14, of:1000, newBest:true });
 *   PMCard.deal(el)                // plays the deal-in (the ink bleed on Legendary)
 *   PMCard.renderBack();
 *   PMCard.enableTilt(container)   // one delegated listener for a whole hand
 *
 * Engraving is generated once per rarity into shared <symbol>s, so ten cards on screen
 * cost ten <use> references, not ten copies of the line work. Suit colour reaches the
 * symbols through inherited custom properties. Tilt only writes to leaf elements.
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
    combat:     { name: 'Combat',     plural: 'Skulls' },
    survival:   { name: 'Survival',   plural: 'Hearts' },
    souls:      { name: 'Souls',      plural: 'Souls' },
    objectives: { name: 'Objectives', plural: 'Keys' },
    crown:      { name: 'Crown',      plural: 'Crowns' },
    joker:      { name: 'Joker',      plural: 'Jokers' },
  };
  const ORDER = ['common', 'rare', 'epic', 'legendary', 'mythical'];
  const SUITS = ['combat', 'survival', 'souls', 'objectives', 'crown', 'joker'];
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

  // A rounded-rect ring between insets o and i (fill-rule evenodd).
  function ringPath(o, i, ro, ri) {
    const rr = (n, r) => `M${n + r} ${n}H${W - n - r}A${r} ${r} 0 0 1 ${W - n} ${n + r}V${H - n - r}A${r} ${r} 0 0 1 ${W - n - r} ${H - n}H${n + r}A${r} ${r} 0 0 1 ${n} ${H - n - r}V${n + r}A${r} ${r} 0 0 1 ${n + r} ${n}Z`;
    return rr(o, ro) + rr(i, ri);
  }

  /* ---------- layout (card units) ---------- */
  const OVAL = { cx: 125, cy: 181, rx: 58, ry: 67 };
  const MED = { cx: 125, cy: 249, r: 24 };

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

    for (const id in A.heroes) {
      const hh = A.heroes[id];
      const s = el('symbol', { id: 'pm-hero-' + id, viewBox: hh.viewBox }, defs);
      el('path', { d: hh.body, class: 'pm-sil', 'fill-rule': 'evenodd' }, s);
      if (hh.eyes) el('path', { d: hh.eyes, class: 'pm-eyes' }, s);
    }
    for (const k in A.suits) {
      const s = el('symbol', { id: 'pm-suit-' + k, viewBox: A.suits[k].viewBox }, defs);
      el('path', { d: A.suits[k].d, fill: 'currentColor', 'fill-rule': 'evenodd' }, s);
    }
    for (const [id, L] of [['pm-logo', A.logo], ['pm-logo-plain', A.logoPlain || A.logo]]) {
      if (!L) continue;
      const s = el('symbol', { id, viewBox: L.viewBox }, defs);
      s.innerHTML = L.inner;
    }

    const cp = el('clipPath', { id: 'pm-oval-clip' }, defs);
    el('ellipse', { cx: OVAL.cx, cy: OVAL.cy, rx: OVAL.rx, ry: OVAL.ry }, cp);
    const cm = el('clipPath', { id: 'pm-med-clip' }, defs);
    el('circle', { cx: MED.cx, cy: MED.cy, r: MED.r }, cm);
    const cpWm = el('clipPath', { id: 'pm-wm-clip' }, defs);
    el('rect', { x: 19, y: 19, width: W - 38, height: 262 }, cpWm);
    const cpIn = el('clipPath', { id: 'pm-inner-clip' }, defs);
    el('rect', { x: 19, y: 19, width: W - 38, height: H - 38, rx: 4 }, cpIn);
    const cpBack = el('clipPath', { id: 'pm-back-field' }, defs);
    el('rect', { x: 23.5, y: 23.5, width: W - 47, height: H - 47, rx: 3 }, cpBack);

    // worn rubber-stamp ink: speckled holes where the stamp missed the paper
    // stamp wear: fine speckle in the stamp's own units (120 x 46), so it never fades a whole word
    const f = el('filter', { id: 'pm-wear-f', filterUnits: 'userSpaceOnUse', x: -10, y: -10, width: 140, height: 66 }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '.42', numOctaves: 2, seed: 7, result: 'n' }, f);
    el('feColorMatrix', { in: 'n', type: 'matrix', values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -3.4 2.55' }, f);
    const m = el('mask', { id: 'pm-wear', maskUnits: 'userSpaceOnUse', x: -10, y: -10, width: 140, height: 66 }, defs);
    el('rect', { x: -10, y: -10, width: 140, height: 66, fill: '#fff', filter: 'url(#pm-wear-f)' }, m);

    for (const r of ORDER) defs.appendChild(buildEngraving(r));
    defs.appendChild(buildBack());
    document.body.prepend(svg);
  }

  function buildEngraving(r) {
    const t = tier(r);
    const g = el('symbol', { id: 'pm-engr-' + r, viewBox: `0 0 ${W} ${H}` });

    // Legendary: engraved edge to edge, two security fields crossing into a moiré.
    // Mythical keeps its single field.
    if (t === 3) {
      el('path', { d: field(W / 2, 96, 6, 260, 3.3) + field(W / 2, 262, 6, 260, 3.3), class: 'e-field', 'clip-path': 'url(#pm-inner-clip)' }, g);
    } else if (t === 4) {
      el('path', { d: field(OVAL.cx, OVAL.cy - 6, 8, 230, 3.1), class: 'e-field', 'clip-path': 'url(#pm-inner-clip)' }, g);
    }

    // Wave band behind the stat number: Rare up.
    if (t >= 1) {
      el('path', { d: waveBand(50, 200, 61, t >= 3 ? 15 : 13, t >= 2 ? 2.5 : 2, t >= 3 ? 9 : 7), class: 'e-band' }, g);
    }

    // Frame.
    if (t === 0) {
      el('rect', { x: 9, y: 9, width: W - 18, height: H - 18, rx: 6, class: 'e-rule e-rule--outer' }, g);
      el('rect', { x: 13, y: 13, width: W - 26, height: H - 26, rx: 3.5, class: 'e-rule e-rule--inner' }, g);
    } else if (t === 1) {
      el('path', { d: ringPath(8.5, 14.5, 6.5, 4), class: 'e-bandfill', 'fill-rule': 'evenodd' }, g);
      el('rect', { x: 17.5, y: 17.5, width: W - 35, height: H - 35, rx: 3, class: 'e-rule e-rule--inner' }, g);
    } else {
      const waves = t >= 3 ? 96 : 72;
      el('path', { d: ringPath(7.5, 19.5, 7, 4), class: t >= 3 ? 'e-bandfill' : 'e-bandtint', 'fill-rule': 'evenodd' }, g);
      el('path', { d: latheBorder(8.5, 10, 6, waves, t >= 3 ? 5 : 4, 1), class: 'e-lathe e-lathe--a' }, g);
      el('path', { d: latheBorder(8.5, 10, 6, waves, t >= 3 ? 5 : 4, -1), class: 'e-lathe e-lathe--b' }, g);
      el('rect', { x: 7.5, y: 7.5, width: W - 15, height: H - 15, rx: 7, class: 'e-rule e-rule--outer' }, g);
      el('rect', { x: 19.5, y: 19.5, width: W - 39, height: H - 39, rx: 4, class: 'e-rule e-rule--inner' }, g);
      el('path', { id: 'pm-micro-' + r, d: `M24 22.6H${W - 24}`, fill: 'none' }, g);
      const tx = el('text', { class: 'e-micro' }, g);
      const tp = el('textPath', { href: '#pm-micro-' + r, textLength: W - 48, lengthAdjust: 'spacingAndGlyphs' }, tx);
      tp.textContent = 'POSTMORTEM · CERTIFIED TRUE RECORD OF THE MATCH · POSTMORTEM · CERTIFIED TRUE RECORD OF THE MATCH';
      el('path', { id: 'pm-micro2-' + r, d: `M${W - 24} ${H - 21}H24`, fill: 'none' }, g);
      const tx2 = el('text', { class: 'e-micro', transform: `rotate(180 ${W / 2} ${H - 21})` }, g);
      const tp2 = el('textPath', { href: '#pm-micro2-' + r, textLength: W - 48, lengthAdjust: 'spacingAndGlyphs' }, tx2);
      tp2.textContent = 'POSTMORTEM · PRINTED AFTER THE MATCH · POSTMORTEM · PRINTED AFTER THE MATCH';
    }

    // The oval: engraved ground, then rings.
    // the oval group can be switched off per card (--e-oval: 0) for the 'watermark' layout
    const og = el('g', { class: 'e-oval' }, g);
    el('ellipse', { cx: OVAL.cx, cy: OVAL.cy, rx: OVAL.rx, ry: OVAL.ry, class: 'e-ground' }, og);
    const hg = el('g', { 'clip-path': 'url(#pm-oval-clip)', class: 'e-hatch' }, og);
    for (const l of hatch(OVAL.cx, OVAL.cy, OVAL.rx, OVAL.ry, t === 4 ? 1.7 : 2.1)) {
      el('path', { d: l.d, 'stroke-width': f1(l.w) }, hg);
    }
    if (t >= 2) {
      el('path', { d: rosette(OVAL.cx, OVAL.cy, OVAL.rx + 4.5, OVAL.ry + 4.5, 1.6, t >= 3 ? 44 : 36, 3, 2, 3.2), class: 'e-ring' }, og);
      el('ellipse', { cx: OVAL.cx, cy: OVAL.cy, rx: OVAL.rx + 12.2, ry: OVAL.ry + 12.2, class: 'e-rule e-rule--ring' }, og);
    }
    el('ellipse', { cx: OVAL.cx, cy: OVAL.cy, rx: OVAL.rx, ry: OVAL.ry, class: 'e-rule e-rule--oval' }, og);
    el('ellipse', { cx: OVAL.cx, cy: OVAL.cy, rx: OVAL.rx + 2.6, ry: OVAL.ry + 2.6, class: 'e-rule e-rule--oval2' }, og);

    if (t >= 2) {
      for (const [x, y] of [[13, 13], [W - 13, 13], [13, H - 13], [W - 13, H - 13]]) {
        el('circle', { cx: x, cy: y, r: 8.2, class: 'e-boss' }, g);
        el('path', { d: rosette(x, y, 3.4, 3.4, 1.6, 9, 3, 2, 2.1), class: 'e-rose' }, g);
      }
    }
    return g;
  }

  /* ---------- the back: brass on matte black, mirrored, the coin locked in the centre ---------- */
  function buildBack() {
    const g = el('symbol', { id: 'pm-back', viewBox: `0 0 ${W} ${H}` });
    const cx = W / 2, cy = H / 2;

    // outer frame and the ornament band that is part of it
    el('rect', { x: 7.5, y: 7.5, width: W - 15, height: H - 15, rx: 7, class: 'k-rule k-rule--heavy' }, g);
    el('rect', { x: 10.5, y: 10.5, width: W - 21, height: H - 21, rx: 5, class: 'k-rule' }, g);
    el('rect', { x: 20.5, y: 20.5, width: W - 41, height: H - 41, rx: 3.5, class: 'k-rule k-rule--mid' }, g);
    el('rect', { x: 23.5, y: 23.5, width: W - 47, height: H - 47, rx: 3, class: 'k-rule' }, g);
    // lozenge chain along the band, dots between
    let chain = '';
    const c = 15.5, step = 7.6;
    const lozH = (x, y) => `M${f1(x - 2.7)} ${y}L${x} ${f1(y - 3.2)}L${f1(x + 2.7)} ${y}L${x} ${f1(y + 3.2)}Z`;
    const lozV = (x, y) => `M${x} ${f1(y - 2.7)}L${f1(x + 3.2)} ${y}L${x} ${f1(y + 2.7)}L${f1(x - 3.2)} ${y}Z`;
    const dot = (x, y, r) => `M${f1(x - r)} ${f1(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    const nx = Math.floor((W - 52) / step), x0 = cx - (nx / 2) * step;
    for (let i = 0; i <= nx; i++) {
      const x = f1(x0 + i * step);
      chain += lozH(+x, c) + lozH(+x, H - c);
      if (i < nx) chain += dot(x0 + (i + 0.5) * step, c, 0.75) + dot(x0 + (i + 0.5) * step, H - c, 0.75);
    }
    const ny = Math.floor((H - 52) / step), y0 = cy - (ny / 2) * step;
    for (let i = 0; i <= ny; i++) {
      const y = f1(y0 + i * step);
      chain += lozV(c, +y) + lozV(W - c, +y);
      if (i < ny) chain += dot(c, y0 + (i + 0.5) * step, 0.75) + dot(W - c, y0 + (i + 0.5) * step, 0.75);
    }
    el('path', { d: chain, class: 'k-fill' }, g);
    // corner blocks: a solid square with a quatrefoil cut in brass
    for (const [x, y] of [[c, c], [W - c, c], [c, H - c], [W - c, H - c]]) {
      el('rect', { x: x - 5, y: y - 5, width: 10, height: 10, class: 'k-block' }, g);
      el('path', { d: dot(x, y - 2, 1.7) + dot(x, y + 2, 1.7) + dot(x - 2, y, 1.7) + dot(x + 2, y, 1.7), class: 'k-cut' }, g);
    }

    // the field
    const fg = el('g', { 'clip-path': 'url(#pm-back-field)' }, g);
    // all-over ground: a fine diamond lattice with a bead in every cell, like the cloth on a card table
    let lat = '', beadsG = '';
    const lx = 7, ly = 9.4;
    for (let k = -40; k <= 40; k++) {
      const o = k * lx * 2;
      lat += `M${f1(cx + o - 220)} ${f1(cy - 220 * ly / lx)}L${f1(cx + o + 220)} ${f1(cy + 220 * ly / lx)}`;
      lat += `M${f1(cx + o + 220)} ${f1(cy - 220 * ly / lx)}L${f1(cx + o - 220)} ${f1(cy + 220 * ly / lx)}`;
    }
    for (let i = -16; i <= 16; i++) for (let j = -18; j <= 18; j++) {
      if ((i + j) % 2) continue;
      const x = cx + i * lx, y = cy + j * ly;
      if (x > 20 && x < W - 20 && y > 20 && y < H - 20) beadsG += dot(x, y, .55);
    }
    el('path', { d: lat, class: 'k-lattice' }, fg);
    el('path', { d: beadsG, class: 'k-fill k-fill--ground' }, fg);

    // inner panel with stepped corners
    const step2 = (o, n) => {
      const x0 = o, y0 = o, x1 = W - o, y1 = H - o;
      return `M${x0 + n} ${y0}H${x1 - n}V${y0 + n}H${x1}V${y1 - n}H${x1 - n}V${y1}H${x0 + n}V${y1 - n}H${x0}V${y0 + n}H${x0 + n}Z`;
    };
    el('path', { d: step2(30.5, 7), class: 'k-rule k-rule--mid' }, fg);
    el('path', { d: step2(33.5, 7), class: 'k-rule k-rule--fine' }, fg);

    // mirror helper: draw once in the top-left quarter, print in all four
    const mir = (fn) => {
      let d = '';
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) d += fn((x, y) => [sx > 0 ? x : W - x, sy > 0 ? y : H - y]);
      return d;
    };
    const P = (T, pts) => poly(pts.map(([x, y]) => T(x, y)));
    // a volute: a logarithmic spiral that leaves point E heading along u and curls toward side n
    const volute = (E, u, n, r0, turns) => {
      const C = [E[0] + n[0] * r0, E[1] + n[1] * r0];
      const a0 = Math.atan2(E[1] - C[1], E[0] - C[0]);
      const tan = [-Math.sin(a0), Math.cos(a0)];
      const sgn = (tan[0] * u[0] + tan[1] * u[1]) >= 0 ? 1 : -1;
      const pts = [], N = Math.ceil(turns * 40), b = 0.16;
      for (let k = 0; k <= N; k++) {
        const th = k / N * turns * TAU, r = r0 * Math.exp(-b * th);
        pts.push([C[0] + r * Math.cos(a0 + sgn * th), C[1] + r * Math.sin(a0 + sgn * th)]);
      }
      return pts;
    };
    const norm = (x, y) => { const l = Math.hypot(x, y); return [x / l, y / l]; };

    // corner fans: concentric arcs in each corner of the panel
    el('path', {
      d: mir(T => {
        let d = '';
        const o = 33.5;
        for (const r of [16, 21, 26, 31, 36]) {
          const pts = [];
          for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI / 2; pts.push([o + r * Math.cos(a), o + r * Math.sin(a)]); }
          d += P(T, pts);
        }
        return d;
      }), class: 'k-line'
    }, fg);
    el('path', {
      d: mir(T => {
        const o = 33.5, pts = [[o, o]];
        for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI / 2; pts.push([o + 10 * Math.cos(a), o + 10 * Math.sin(a)]); }
        return P(T, pts) + 'Z';
      }), class: 'k-fill'
    }, fg);

    // the lozenge and its lathe-work band
    const A = 92, B = 136, IN = 0.9;
    const loz = (a, b) => `M${cx} ${f1(cy - b)}L${f1(cx + a)} ${cy}L${cx} ${f1(cy + b)}L${f1(cx - a)} ${cy}Z`;
    el('path', { d: loz(A + 3, B + 4.4), class: 'k-clear' }, fg);
    const lozPt = t => {
      const q = Math.floor(t * 4) % 4, f = t * 4 - Math.floor(t * 4);
      const V = [[cx, cy - B], [cx + A, cy], [cx, cy + B], [cx - A, cy]];
      const p0 = V[q], p1 = V[(q + 1) % 4];
      return [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f];
    };
    let band = '';
    for (let i = 0; i < 3; i++) {
      const pts = [], N = 720, waves = 64;
      for (let k = 0; k <= N; k++) {
        const t = k / N, O = lozPt(t);
        const m = 1 - (1 - IN) * (0.5 + 0.5 * Math.sin(waves * TAU * t + i * TAU / 3));
        pts.push([cx + (O[0] - cx) * m, cy + (O[1] - cy) * m]);
      }
      band += poly(pts, true);
    }
    el('path', { d: band, class: 'k-line k-line--band' }, fg);
    el('path', { d: loz(A + 3, B + 4.4), class: 'k-rule k-rule--mid' }, fg);
    el('path', { d: loz(A * IN - 2.5, B * IN - 3.7), class: 'k-rule k-rule--mid' }, fg);

    // scrolls outside the lozenge: echo lines along each edge that end in volutes
    el('path', {
      d: mir(T => {
        let d = '';
        const top = [cx, cy - B], left = [cx - A, cy];
        const u = norm(left[0] - top[0], left[1] - top[1]);
        const nOut = [-u[1], u[0]].map(v => -v);         // points away from the lozenge, toward the corner
        const nn = nOut[0] < 0 ? nOut : nOut.map(v => -v);
        for (const [off, r0, t0, t1] of [[10, 9, .17, .8], [17.5, 7, .25, .72], [24, 5, .33, .64]]) {
          const S = [top[0] + u[0] * (t0 * 164) + nn[0] * off, top[1] + u[1] * (t0 * 164) + nn[1] * off];
          const E = [top[0] + u[0] * (t1 * 164) + nn[0] * off, top[1] + u[1] * (t1 * 164) + nn[1] * off];
          d += P(T, [S, E]);
          d += P(T, volute(E, u, nn, r0, 1.8));
          d += P(T, volute(S, [-u[0], -u[1]], nn, r0, 1.8));
        }
        return d;
      }), class: 'k-line k-line--scroll'
    }, fg);
    // a small rosette flower between the scrolls and the corner fan
    el('path', {
      d: mir(T => {
        const fx = 54, fy = 80, pts = [];
        for (let k = 0; k <= 96; k++) {
          const t = k / 96 * TAU, r = 6.2 * (0.62 + 0.38 * Math.abs(Math.cos(3 * t)));
          pts.push([fx + r * Math.cos(t), fy + r * Math.sin(t)]);
        }
        return P(T, pts) + 'Z' + P(T, [[fx, fy - 13], [fx, fy - 8]]) + P(T, [[fx, fy + 8], [fx, fy + 13]]);
      }), class: 'k-line k-line--scroll'
    }, fg);
    el('path', { d: mir(T => { const [x, y] = T(54, 80); return dot(x, y, 1.6); }), class: 'k-fill' }, fg);

    // inside the lozenge: nested lozenges stepping in toward the coin (deco, like ref 4's black back)
    let nest = '';
    for (const k of [0.8, 0.7, 0.6]) nest += loz(A * k, B * k);
    el('path', { d: nest, class: 'k-rule' }, fg);
    let nestF = '';
    for (const k of [0.75, 0.65]) nestF += loz(A * k, B * k);
    el('path', { d: nestF, class: 'k-rule k-rule--fine' }, fg);
    // a small lozenge pip at each inner tip
    let tips = '';
    const lozT = (x, y, a, b) => `M${f1(x - a)} ${f1(y)}L${f1(x)} ${f1(y - b)}L${f1(x + a)} ${f1(y)}L${f1(x)} ${f1(y + b)}Z`;
    for (const k of [0.8, 0.7]) {
      tips += lozT(cx, cy - B * k, 2.2, 3) + lozT(cx, cy + B * k, 2.2, 3) + lozT(cx - A * k, cy, 2.2, 3) + lozT(cx + A * k, cy, 2.2, 3);
    }
    el('path', { d: tips, class: 'k-fill' }, fg);

    // accents at the lozenge tips and sides
    let acc = '';
    const lozS = (x, y, a, b) => `M${f1(x - a)} ${f1(y)}L${f1(x)} ${f1(y - b)}L${f1(x + a)} ${f1(y)}L${f1(x)} ${f1(y + b)}Z`;
    for (const [x, y] of [[cx, cy - B - 4.4], [cx, cy + B + 4.4], [cx - A - 3, cy], [cx + A + 3, cy]]) acc += lozS(x, y, 4.6, 6);
    for (const y of [cy - B - 13, cy + B + 13]) acc += dot(cx, y, 1.7);
    for (const x of [cx - A - 12, cx + A + 12]) acc += dot(x, cy, 1.5);
    el('path', { d: acc, class: 'k-fill k-fill--edge' }, fg);

    // the coin plate: a cleared disc ringed in guilloche, then the bead ring
    el('circle', { cx, cy, r: 66, class: 'k-clear' }, g);
    el('path', { d: rosette(cx, cy, 58.5, 58.5, 1.9, 22, 3, 2, 3.4), class: 'k-line k-line--fine' }, g);
    el('circle', { cx, cy, r: 66, class: 'k-rule k-rule--mid' }, g);
    el('circle', { cx, cy, r: 53, class: 'k-rule' }, g);

    return g;
  }

  /* ---------- NEW BEST: the coroner's wax seal (the only mark) ---------- */
  function waxSealSVG(seed) {
    const s = el('svg', { viewBox: '-55 -55 110 110', class: 'pm-seal', 'aria-hidden': 'true' });
    const R = rng(seed || 11);
    // squeezed wax: a lumpy disc with a few short runs at the edge
    const p1 = R() * TAU, p2 = R() * TAU, p3 = R() * TAU;
    const runs = [0, 1, 2].map(() => [R() * TAU, 2.5 + R() * 3]);
    const pts = [];
    for (let i = 0; i < 180; i++) {
      const a = i / 180 * TAU;
      let r = 45 + 2.2 * Math.sin(5 * a + p1) + 1.3 * Math.sin(9 * a + p2) + .7 * Math.sin(17 * a + p3);
      for (const [ra, rl] of runs) { const d = Math.atan2(Math.sin(a - ra), Math.cos(a - ra)); r += rl * Math.exp(-(d * d) / .012); }
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    el('path', { d: poly(pts, true), class: 'w-wax' }, s);
    // the pressed face, sunk into the wax
    el('circle', { r: 37.5, class: 'w-press' }, s);
    el('circle', { r: 36, class: 'w-ring' }, s);
    el('circle', { r: 24.5, class: 'w-ring' }, s);
    const id = 'pm-seal-arc-' + (seed || 11);
    el('path', { id, d: 'M-30.3 0a30.3 30.3 0 1 1 60.6 0a30.3 30.3 0 1 1 -60.6 0', fill: 'none' }, s);
    const tx = el('text', { class: 'w-text' }, s);
    // textLength pins the words to exactly one lap, so the seam never overlaps
    const tp = el('textPath', { href: '#' + id, startOffset: '0', textLength: '188', lengthAdjust: 'spacing' }, tx);
    tp.textContent = 'PERSONAL RECORD \u00b7 POSTMORTEM \u00b7 ';
    const t1 = el('text', { y: -4.5, class: 'w-small', 'text-anchor': 'middle' }, s);
    t1.textContent = 'NEW';
    const t2 = el('text', { y: 11.5, class: 'w-big', 'text-anchor': 'middle' }, s);
    t2.textContent = 'BEST';
    return s;
  }

  /* ---------- the old NEW BEST rubber stamp (kept for comparison; render uses the seal) ---------- */
  function stampSVG() {
    const s = el('svg', { viewBox: '0 0 120 46', class: 'pm-stamp', 'aria-hidden': 'true' });
    const g = el('g', { mask: 'url(#pm-wear)' }, s);
    el('rect', { x: 2, y: 2, width: 116, height: 42, rx: 4, class: 'st-line st-line--heavy' }, g);
    el('rect', { x: 6, y: 6, width: 108, height: 34, rx: 2, class: 'st-line' }, g);
    const t = el('text', { x: 60, y: 27.5, 'text-anchor': 'middle', class: 'st-word' }, g);
    t.textContent = 'NEW BEST';
    const t2 = el('text', { x: 60, y: 35.6, 'text-anchor': 'middle', class: 'st-small' }, g);
    t2.textContent = 'PERSONAL RECORD';
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
      el('path', { d: `M-2 ${f1(y0 - 3)}L${W + 2} ${f1(y1 - 3)}`, class: 'd-crease-soft' }, s);
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
    const d = poly(line.map(([x, y]) => [Math.min(W - 1.5, Math.max(1.5, x)), Math.min(H - 1.5, Math.max(1.5, y))]));
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
  const num = n => Number(n).toLocaleString('en-US');

  function render(o) {
    ensureDefs();
    const r = o.rarity === 'middle' ? 'common' : o.rarity;
    const t = tier(r), R = RARITY[r], suit = o.suit || 'combat', S = SUIT[suit];
    const rarityName = o.rarity === 'middle' ? 'Middle' : R.name;
    const rank = o.rank || R.rank;
    const heroArt = window.PM_CARD_ART.heroes[o.hero];
    const icon = o.icon || suit;   // e.g. 'joker3' to trial another drawing of the suit
    // where the hero sits: 'pip' (medallion under the suit pip, default), 'portrait' (round 1:
    // the hero fills the oval), 'window' (hero in the oval, pip in the medallion), 'cameo'
    // (hero in front of a ghost pip), 'badge' (hero in the oval wearing the pip on his chest),
    // 'watermark' (no oval: the hero printed large and pale, the pip solid over his chest)
    const LAYOUTS = ['pip', 'portrait', 'window', 'cameo', 'badge', 'watermark'];
    const layout = heroArt && LAYOUTS.includes(o.layout) ? o.layout : 'pip';
    const heroName = o.heroName || 'Haze';
    const of = o.of || 1000;
    const bad = o.bad === true ? t + 1 : o.bad;
    const cls = ['pm-card', 'r-' + r, 's-' + suit, 'lay-' + layout];
    if (bad) cls.push('is-bad', 'bad-' + bad);
    if (o.eyes === false) cls.push('no-eyes');
    if (suit === 'joker') cls.push('is-misprint');
    if (o.ink) cls.push('ink-' + o.ink);
    const card = h('article', cls.join(' '));
    const title = o.title || (suit === 'joker' ? 'The Joker' : `${R.word} of ${S.plural}`);
    const comparison = o.comparison ?? `Number ${num(o.no)} of ${num(of)} ${heroName} games`;
    const description = o.description || [o.value, o.stat].filter(Boolean).join(' ');
    if (o.id) card.dataset.cardId = o.id;
    if (o.description) card.title = o.description;
    card.setAttribute('aria-label', `${title}, ${rarityName}. ${description.replace(/\.$/, '')}. ${comparison}.` + (o.newBest ? ' New personal best.' : ''));
    card.tabIndex = 0;
    const tilt = h('div', 'pm-tilt');
    const face = h('div', 'pm-face');
    tilt.appendChild(face);
    card.appendChild(tilt);

    const engr = el('svg', { class: 'pm-engr', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    el('use', { href: '#pm-engr-' + r }, engr);
    face.appendChild(engr);
    if (suit === 'joker') {
      // misprint: the second ink plate landed off register
      const mis = el('svg', { class: 'pm-engr pm-misreg', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
      el('use', { href: '#pm-engr-' + r }, mis);
      face.appendChild(mis);
    }

    // the oval: the suit pip, big and in the suit's ink
    const por = el('svg', { class: 'pm-portrait', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const pg = el('g', { 'clip-path': 'url(#pm-oval-clip)' }, por);
    let med = null;
    const hv = heroArt?.viewBox || '0 0 280 380';
    const [, , vw, vh] = hv.split(' ').map(Number);
    const hero = (parent, sw, x, y) => {
      const sh = sw * vh / vw;
      el('use', { href: '#pm-hero-' + o.hero, x: f1(x - sw / 2 + 1), y: f1(y === undefined ? 0 : y(sh)), width: f1(sw), height: f1(sh) }, parent);
    };
    const pip = (parent, w, hgt, cx, cy, cls) =>
      el('use', { href: '#pm-suit-' + icon, x: f1(cx - w / 2), y: f1(cy - hgt / 2), width: f1(w), height: f1(hgt), class: cls || 'pm-pip' }, parent);
    // the small medallion on the oval's lower edge; its own layer, so the Legendary ink bleed
    // passes under it. It holds the hero, or (layout 'window') the suit pip.
    const medallion = withHero => {
      med = el('svg', { class: 'pm-portrait pm-medal', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
      el('circle', { cx: MED.cx, cy: MED.cy, r: MED.r + 4.2, class: 'm-plate' }, med);
      el('circle', { cx: MED.cx, cy: MED.cy, r: MED.r, class: 'm-ground' }, med);
      const mg = el('g', { 'clip-path': 'url(#pm-med-clip)' }, med);
      for (let y = MED.cy - MED.r; y <= MED.cy + MED.r; y += 1.8) {
        const v = (y - MED.cy) / MED.r, half = MED.r * Math.sqrt(Math.max(0, 1 - v * v));
        el('path', { d: `M${f1(MED.cx - half)} ${f1(y)}H${f1(MED.cx + half)}`, class: 'm-hatch' }, mg);
      }
      if (withHero) hero(mg, MED.r * 2 * 1.02, MED.cx, () => MED.cy - MED.r + 3);
      else pip(mg, MED.r * 1.5, MED.r * 1.62, MED.cx, MED.cy, 'pm-pip pm-pip--med');
      el('circle', { cx: MED.cx, cy: MED.cy, r: MED.r, class: 'm-rule' }, med);
      el('circle', { cx: MED.cx, cy: MED.cy, r: MED.r + 2.6, class: 'm-rule m-rule--fine' }, med);
    };
    if (layout === 'cameo') {
      pip(pg, 108, 116, OVAL.cx, OVAL.cy - 8, 'pm-pip pm-pip--ghost');
      hero(pg, OVAL.rx * 2 * 0.74, OVAL.cx, sh => OVAL.cy + OVAL.ry - sh * 0.86);
    } else if (layout === 'portrait' || layout === 'window' || layout === 'badge') {
      // round 1: the hero's bust fills the oval
      hero(pg, OVAL.rx * 2 * 0.84, OVAL.cx, sh => OVAL.cy + OVAL.ry - sh * 0.84);
      if (layout === 'window') medallion(false);
      if (layout === 'badge') {
        // the suit worn as a badge on the chest, printed in the paper colour
        el('circle', { cx: OVAL.cx + 1, cy: OVAL.cy + 44, r: 13.5, class: 'm-badge' }, pg);
        pip(pg, 15, 17, OVAL.cx + 1, OVAL.cy + 44, 'pm-pip pm-pip--badge');
      }
    } else if (layout === 'watermark') {
      card.classList.add('no-oval');
      const wm = el('svg', { class: 'pm-portrait pm-watermark', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
      const wg = el('g', { 'clip-path': 'url(#pm-wm-clip)' }, wm);
      hero(wg, 214, W / 2, () => 108);
      face.insertBefore(wm, face.firstChild.nextSibling);
      pip(por, 74, 80, OVAL.cx, OVAL.cy + 34);
    } else {
      pip(pg, 88, 96, OVAL.cx, OVAL.cy - 14);
      if (heroArt) medallion(true);
    }
    face.appendChild(por);

    for (const pos of ['tl', 'br']) {
      const idx = h('div', 'pm-idx pm-idx--' + pos);
      idx.appendChild(h('span', 'pm-rank' + (rank.length > 1 ? ' is-ten' : ''), rank));
      idx.appendChild(suitIcon(icon, 'pm-suit'));
      face.appendChild(idx);
    }

    const head = h('div', 'pm-head');
    head.appendChild(h('span', 'pm-suitname', S.name));
    head.appendChild(h('span', 'pm-rarity', rarityName));
    face.appendChild(head);

    const stat = h('div', 'pm-stat');
    if (suit === 'joker') stat.appendChild(h('div', 'pm-num pm-num--ghost', o.value));
    const numEl = stat.appendChild(h('div', 'pm-num', o.value));
    if (String(o.value).length > 5) numEl.classList.add('is-long');
    stat.appendChild(h('div', 'pm-label', o.stat));
    face.appendChild(stat);

    const foot = h('div', 'pm-foot');
    foot.appendChild(h('div', 'pm-title', title));
    const ser = h('div', 'pm-serial');
    if (o.comparison != null) {
      ser.textContent = o.comparison;
    } else {
      ser.appendChild(h('span', 'pm-serial__no', 'No. ' + num(o.no)));
      ser.appendChild(h('span', 'pm-serial__rest', ` of ${num(of)} ${heroName} games`));
      // Long hero names step the line down so it never meets the corner index.
      const len = ser.textContent.length;
      if (len > 30) ser.style.fontSize = (len > 36 ? .74 : .82) + 'em';
    }
    foot.appendChild(ser);
    face.appendChild(foot);

    if (t === 3) face.appendChild(h('div', 'pm-bleed'));
    if (med) face.appendChild(med);
    if (o.newBest) {
      const st = h('div', o.mark === 'stamp' ? 'pm-stampwrap' : 'pm-sealwrap');
      st.appendChild(o.mark === 'stamp' ? stampSVG() : waxSealSVG(hash(String(o.value) + o.stat)));
      face.appendChild(st);
    }
    face.appendChild(h('div', 'pm-light'));

    if (bad) {
      const seed = hash(o.value + o.stat + r + suit);
      face.appendChild(damage(bad, seed));
      applyTear(card, tilt, face, bad, seed);
    }
    return card;
  }

  // Deal-in. Legendary: the suit ink bleeds through the paper from the centre out.
  function deal(card) {
    card.classList.remove('is-dealing');
    void card.offsetWidth;
    card.classList.add('is-dealing');
    const bleed = card.querySelector('.pm-bleed');
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const done = () => {
      cancelAnimationFrame(raf);
      card.classList.remove('is-dealing');
      card.removeEventListener('animationend', onEnd);
      if (bleed) bleed.style.removeProperty('--bleed');
    };
    const onEnd = e => { if (!bleed && e.target === card.querySelector('.pm-tilt')) done(); };
    card.addEventListener('animationend', onEnd);
    if (bleed) {
      // the suit ink floods out from the centre of the oval
      if (reduced) { done(); return; }
      const t0 = performance.now() + 350, dur = 1600;
      const ease = x => 1 - Math.pow(1 - x, 2.4);
      const step = now => {
        const x = Math.min(1, Math.max(0, (now - t0) / dur));
        bleed.style.setProperty('--bleed', (-8 + 128 * ease(x)).toFixed(1) + '%');
        if (x < 1) raf = requestAnimationFrame(step); else done();
      };
      raf = requestAnimationFrame(step);
    } else setTimeout(done, 1200);
  }

  function applyTear(card, tilt, face, level, seed) {
    const R = rng(seed ^ 0x9e3779b9);
    if (level === 3) {
      // bottom left corner torn off and taped back on, slightly askew; clear of the number, serial and rank
      const line = tearLine(R, -2, H - 82, 70, H + 2, 18, 5);
      face.style.clipPath = `polygon(0% 0%, 100% 0%, 100% 100%, ${pc(line.slice().reverse())})`;
      face.appendChild(tearEdge(line, -1));
      const piece = face.cloneNode(true);
      piece.classList.add('pm-piece');
      piece.style.clipPath = `polygon(0% 100%, ${pc(line)})`;
      piece.style.transform = 'translate(-.9%, .8%) rotate(-1.8deg)';
      piece.style.transformOrigin = '0% 100%';
      piece.appendChild(tearEdge(line, 1));
      tilt.appendChild(piece);
      tilt.appendChild(tape(18, H - 63, 52, 15, -42));
      tilt.appendChild(tape(46, H - 27, 52, 15, -38));
    } else if (level >= 4) {
      // torn across, the halves a little out of line, taped
      const line = tearLine(R, -2, 158 + R() * 20, W + 2, 176 + R() * 20, 34, 8);
      face.style.clipPath = `polygon(0% 0%, 100% 0%, ${pc(line.slice().reverse())})`;
      face.appendChild(tearEdge(line, 1));
      const piece = face.cloneNode(true);
      piece.classList.add('pm-piece');
      piece.style.clipPath = `polygon(${pc(line)}, 100% 100%, 0% 100%)`;
      piece.style.transform = 'translate(-1%, .9%) rotate(-1.3deg)';
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

  function renderBack(o = {}) {
    ensureDefs();
    const card = h('article', 'pm-card pm-back');
    card.setAttribute('aria-label', 'Postmortem card, face down');
    card.tabIndex = 0;
    const tilt = h('div', 'pm-tilt');
    const face = h('div', 'pm-face');
    const engr = el('svg', { class: 'pm-engr', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    el('use', { href: '#pm-back' }, engr);
    face.appendChild(engr);
    // the logo slot: card/src/logo.svg (or logo_plain.svg with { legend: false }), built by
    // tools/build_logo.py and tools/build_card_art.mjs
    const coin = el('svg', { class: 'pm-coin', viewBox: '0 0 200 200', 'aria-hidden': 'true' });
    if (o.legend === false) el('use', { href: '#pm-logo-plain', width: 200, height: 200 }, coin);
    else {
      // the legend turns to mush on small cards, so those show the plain coin (see card.css)
      el('use', { href: '#pm-logo', width: 200, height: 200, class: 'coin-legend' }, coin);
      el('use', { href: '#pm-logo-plain', width: 200, height: 200, class: 'coin-plain' }, coin);
    }
    face.appendChild(coin);
    face.appendChild(h('div', 'pm-light'));
    tilt.appendChild(face);
    card.appendChild(tilt);
    return card;
  }

  /* ---------- tilt: one delegated listener per container ---------- */
  function enableTilt(root) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let active = null, raf = 0, px = 0, py = 0;
    // Live path writes only to leaf elements and to the tilt layer's own transform,
    // so a pointer move never restyles the engraving under the card.
    let parts = null;
    function apply() {
      raf = 0;
      if (!active) return;
      const b = active.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (px - b.left) / b.width));
      const y = Math.min(1, Math.max(0, (py - b.top) / b.height));
      const k = reduce ? 0 : 1;
      parts.tilt.style.transform = `rotateX(${f1((0.5 - y) * 14 * k)}deg) rotateY(${f1((x - 0.5) * 18 * k)}deg) translateZ(1.6em)`;
      const lx = f1(x * 100) + '%', ly = f1(y * 100) + '%', sh = f1(x * 0.6 + y * 0.4);
      for (const l of parts.light) { l.style.setProperty('--lx', lx); l.style.setProperty('--ly', ly); }
      for (const n of parts.ink) n.style.setProperty('--shift', sh);
    }
    root.addEventListener('pointermove', e => {
      const c = e.target.closest && e.target.closest('.pm-card');
      if (c !== active) {
        if (active) leave(active);
        active = c;
        if (c) {
          c.classList.add('is-live');
          parts = { tilt: c.querySelector('.pm-tilt'), light: c.querySelectorAll('.pm-light'), ink: c.querySelectorAll('.pm-num, .pm-rank') };
        }
      }
      px = e.clientX; py = e.clientY;
      if (active && !raf) raf = requestAnimationFrame(apply);
    });
    root.addEventListener('pointerleave', () => { if (active) leave(active); active = null; });
    function leave(c) {
      c.classList.remove('is-live');
      if (parts) {
        parts.tilt.style.removeProperty('transform');
        for (const l of parts.light) { l.style.removeProperty('--lx'); l.style.removeProperty('--ly'); }
        for (const n of parts.ink) n.style.removeProperty('--shift');
      }
      parts = null;
    }
  }

  window.PMCard = { render, renderBack, deal, enableTilt, RARITY, SUIT, ORDER, SUITS };
})();
