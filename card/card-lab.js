(function () {
  'use strict';
  const lab = document.getElementById('lab');
  const HAZE = 13;
  const LEGEND = {
    common: 'Plain print on cream. One suit-ink hairline frame.',
    rare: 'Ink band. A solid band of the suit ink around the edge.',
    epic: 'Engraved border. Lathe-work frame, corner rosettes, ringed oval. Still cream.',
    legendary: 'Printed in colour. Suit-tinted paper engraved edge to edge in bone. The colour bleeds in when dealt.',
    mythical: 'Black note. Black paper, bone ink, everything above.',
  };
  const DAMAGE = { 1: 'Scuffed', 2: 'Creased', 3: 'Torn corner, taped', 4: 'Torn in two, taped', 5: 'Torn, taped, stained' };
  const BASE = {
    common:    { value: '21,480', no: 412 },
    rare:      { value: '26,950', no: 186 },
    epic:      { value: '30,870', no: 61 },
    legendary: { value: '34,210', no: 9 },
    mythical:  { value: '41,605', no: 1 },
  };
  const STATS = {
    combat:     { stat: 'Hero Damage', value: '34,210' },
    survival:   { stat: 'Healing', value: '9,480' },
    souls:      { stat: 'Souls per Minute', value: '1,042' },
    objectives: { stat: 'Objective Damage', value: '18,300' },
    crown:      { stat: 'Match MVP', value: '1st' },
    joker:      { stat: 'Deaths to Neutrals', value: '7', title: 'The Joker' },
  };
  const INKS = { steel: 'Cool steel blue', orange: 'Orange (the Amber patron)', yellow: 'Yellow', sapphire: 'My pick: deep sapphire (the other patron)' };
  const LAYOUTS = {
    portrait: ['Portrait', ' · round 1: Haze fills the oval'],
    pip: ['Medallion', ' · round 2: big pip, small Haze'],
    window: ['Window', ' · Haze in the oval, pip in the medallion'],
    cameo: ['Cameo', ' · Haze in front of a ghost pip'],
    badge: ['Badge', ' · Haze wears the suit on his chest'],
    watermark: ['Watermark', ' · no oval, Haze printed pale behind the pip'],
  };
  const base = { hero: HAZE, heroName: 'Haze', suit: 'combat', stat: 'Hero Damage' };
  const card = (rarity, extra) => PMCard.render(Object.assign({ rarity }, base, BASE[rarity], extra || {}));
  const suitCard = (suit, rarity, extra) => PMCard.render(Object.assign({ rarity }, base, BASE[rarity], { suit }, STATS[suit], extra || {}));

  function section(title, note) {
    const s = document.createElement('section'); s.className = 'lab-sec';
    const h = document.createElement('h2'); h.textContent = title; s.appendChild(h);
    if (note) { const p = document.createElement('p'); p.className = 'lab-note'; p.textContent = note; s.appendChild(p); }
    lab.appendChild(s); return s;
  }
  function row(parent, cls) { const r = document.createElement('div'); r.className = cls || 'lab-row'; parent.appendChild(r); return r; }
  function cell(parent, el, cap, sub) {
    const c = document.createElement('div'); c.className = 'lab-cell'; c.appendChild(el);
    if (cap) {
      const p = document.createElement('div'); p.className = 'lab-cap';
      const b = document.createElement('b'); b.textContent = cap; p.appendChild(b);
      p.appendChild(document.createTextNode(sub || '')); c.appendChild(p);
    }
    parent.appendChild(c); return c;
  }
  function hovered(el, rx, ry, lx, ly, shift) {
    el.classList.add('is-hover');
    el.style.setProperty('--rx', rx + 'deg'); el.style.setProperty('--ry', ry + 'deg');
    el.style.setProperty('--lx', lx + '%'); el.style.setProperty('--ly', ly + '%');
    el.style.setProperty('--shift', shift);
    return el;
  }
  const sized = (el, w) => { el.style.setProperty('--w', w + 'px'); return el; };
  function coin(file, size, label) {
    const c = document.createElement('div'); c.className = 'lab-coin';
    const img = document.createElement('img'); img.src = file; img.width = size; img.height = size; img.alt = label;
    c.appendChild(img);
    const p = document.createElement('div'); p.className = 'lab-cap'; p.textContent = label; c.appendChild(p);
    return c;
  }

  // 1. ladder at rest
  let s = section('The ladder, at rest', 'Cream, cream, cream with engraving, coloured, black.'), r = row(s);
  for (const k of PMCard.ORDER) cell(r, card(k), `${PMCard.RARITY[k].rank} · ${PMCard.RARITY[k].name}`, LEGEND[k]);

  // 2. suits
  s = section('Suits: each has its own ink and pip', 'Combat now takes the red, Joker the purple, Souls your icon. Objectives shows steel blue here; the trial inks are in the next section.');
  for (const k of ['common', 'epic', 'legendary', 'mythical']) {
    r = row(s);
    for (const su of PMCard.SUITS) cell(r, sized(suitCard(su, k), 205), PMCard.SUIT[su].name, ' · ' + PMCard.RARITY[k].name);
  }

  // 3. objectives trial inks, each in a hand next to the brass crown
  s = section('Objectives: four trial inks, each dealt in a hand with the Crown', 'Look for which one still reads apart from the Crown brass and from Combat red.');
  for (const [ink, label] of Object.entries(INKS)) {
    r = row(s, 'lab-row lab-row--hand');
    const cap = document.createElement('div'); cap.className = 'lab-rowcap'; cap.textContent = label; r.appendChild(cap);
    const hand = [
      suitCard('combat', 'rare'), suitCard('objectives', 'epic', { ink }), suitCard('crown', 'legendary'),
      suitCard('objectives', 'legendary', { ink }), suitCard('survival', 'common'), suitCard('objectives', 'mythical', { ink }),
    ];
    for (const c of hand) r.appendChild(sized(c, 170));
  }

  // 4. joker: his pick, the two-pip jester
  s = section('Joker: the two-pip jester (your pick)', 'Purple ink, misprinted: the second plate lands off register and the stat line is upside down.');
  r = row(s);
  for (const k of ['common', 'epic', 'legendary', 'mythical']) cell(r, sized(suitCard('joker', k), 205), 'Joker', ' · ' + PMCard.RARITY[k].name);

  // 5. new best
  s = section("NEW BEST: the coroner's wax seal", 'Red wax, black wax on the red Combat suit so it never blends in. Round 2 stamp at the end for comparison.'); r = row(s);
  cell(r, card('rare', { newBest: true }), 'Rare + seal', ' · Combat, black wax');
  cell(r, suitCard('souls', 'epic', { newBest: true }), 'Epic + seal');
  cell(r, suitCard('survival', 'legendary', { newBest: true }), 'Legendary + seal');
  cell(r, suitCard('joker', 'mythical', { newBest: true }), 'Mythical + seal');
  cell(r, suitCard('souls', 'epic', { newBest: true, mark: 'stamp' }), 'Round 2 stamp', ' · for comparison');

  // 6. hero placement
  s = section('Where Haze sits: six ways', 'Same card each time. Top row Epic Souls, bottom row Legendary Combat.');
  for (const [k, su] of [['epic', 'souls'], ['legendary', 'combat']]) {
    r = row(s);
    for (const [L, [name, sub]] of Object.entries(LAYOUTS)) cell(r, sized(suitCard(su, k, { layout: L }), 205), name, sub);
  }

  // 7. bad cards
  s = section('Bad cards: the same card, damaged by how bad it was'); r = row(s);
  const badLadder = [
    ['common', 'survival', 1, '1,120', 'Healing', 806],
    ['rare', 'souls', 2, '412', 'Souls per Minute', 912],
    ['epic', 'combat', 3, '9,870', 'Hero Damage', 968],
    ['legendary', 'objectives', 4, '310', 'Objective Damage', 994],
    ['mythical', 'combat', 5, '2,140', 'Hero Damage', 1000],
  ];
  for (const [k, suit, lv, v, stat, no] of badLadder) {
    cell(r, PMCard.render(Object.assign({}, base, { rarity: k, suit, bad: lv, value: v, stat, no })), `Bad ${PMCard.RARITY[k].name}`, ' · ' + DAMAGE[lv]);
  }

  // 8. back and coin
  s = section('The back and the coin', 'Your pick from the Gemini sheet (#2), redrawn as clean vector: reeded edge, legend ring "POSTMORTEM · EVERY MATCH HAS A STORY". Also without words.');
  r = row(s);
  cell(r, PMCard.renderBack(), 'Back, with the legend');
  cell(r, PMCard.renderBack({ legend: false }), 'Back, no words', ' · bead ring instead');
  cell(r, hovered(PMCard.renderBack(), 6, -9, 22, 18, .8), 'Back, hover');
  r = row(s, 'lab-row lab-coins');
  r.appendChild(coin('assets/logo/postmortem-coin.svg', 220, 'Coin, legend'));
  r.appendChild(coin('assets/logo/postmortem-coin-plain.svg', 220, 'Coin, no words'));
  r.appendChild(coin('assets/logo/postmortem-coin.svg', 32, '32 px'));
  r.appendChild(coin('assets/logo/postmortem-coin-16.svg', 32, '32 px, small cut'));
  r.appendChild(coin('assets/logo/postmortem-coin-16.svg', 16, '16 px, small cut'));

  // 9. a dealt hand
  s = section('A dealt hand (click Deal to replay)'); r = row(s, 'lab-hand'); r.id = 'hand';
  const hand = [
    suitCard('survival', 'common', { stat: 'Deaths', value: '3', no: 344 }),
    suitCard('souls', 'rare', { no: 201 }),
    suitCard('objectives', 'common', { no: 702, bad: 1 }),
    suitCard('joker', 'epic', { no: 77 }),
    card('legendary', { newBest: true }),
  ];
  for (const c of hand) r.appendChild(c);

  // 10. small sizes
  s = section('Small: 150 px and 110 px'); r = row(s);
  for (const k of PMCard.SUITS) r.appendChild(sized(suitCard(k, k === 'crown' ? 'legendary' : 'rare'), 150));
  r.appendChild(sized(PMCard.renderBack(), 150));
  r = row(s);
  for (const k of PMCard.ORDER) r.appendChild(sized(card(k), 110));

  // 11. ten on screen
  s = section('Ten on screen (hover across them)'); r = row(s, 'lab-ten'); r.id = 'ten';
  const tenSet = [['common', 'combat'], ['common', 'survival'], ['rare', 'souls'], ['common', 'objectives'], ['epic', 'combat'],
    ['rare', 'survival'], ['legendary', 'souls'], ['common', 'joker'], ['rare', 'objectives'], ['mythical', 'crown']];
  tenSet.forEach(([k, suit], i) => r.appendChild(sized(suitCard(suit, k, i === 3 ? { bad: 2 } : {}), 170)));

  PMCard.enableTilt(lab);

  const dealAll = () => document.querySelectorAll('#hand .pm-card').forEach((c, i) => setTimeout(() => PMCard.deal(c), i * 140));
  for (const b of document.querySelectorAll('[data-toggle]')) {
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      if (b.dataset.toggle === 'gray') document.body.classList.toggle('gray', on);
      if (b.dataset.toggle === 'hover') for (const c of document.querySelectorAll('.pm-card')) {
        if (on) hovered(c, 6, -9, 22, 18, .85); else c.classList.remove('is-hover');
      }
    });
  }
  const dealBtn = document.querySelector('[data-deal]');
  if (dealBtn) dealBtn.addEventListener('click', dealAll);
})();
