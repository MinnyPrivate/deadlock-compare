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

  // 1. ladder at rest
  let s = section('The ladder, at rest', 'Cream, cream, cream with engraving, coloured, black.'), r = row(s);
  for (const k of PMCard.ORDER) cell(r, card(k), `${PMCard.RARITY[k].rank} · ${PMCard.RARITY[k].name}`, LEGEND[k]);

  // 2. ladder on hover
  s = section('The ladder, on hover (tilted toward the light)'); r = row(s);
  for (const k of PMCard.ORDER) cell(r, hovered(card(k), 6, -9, 22, 18, .85), `${PMCard.RARITY[k].name}, hover`);

  // 3. suits
  s = section('Suits: each has its own ink and pip', 'Combat rust, Survival olive, Souls teal, Objectives purple, Crown brass, Joker misprint.');
  r = row(s);
  for (const k of PMCard.SUITS) cell(r, sized(suitCard(k, 'common'), 205), PMCard.SUIT[k].name, ' · Common');
  r = row(s);
  for (const k of PMCard.SUITS) cell(r, sized(suitCard(k, 'epic'), 205), PMCard.SUIT[k].name, ' · Epic');
  r = row(s);
  for (const k of PMCard.SUITS) cell(r, sized(suitCard(k, 'legendary'), 205), PMCard.SUIT[k].name, ' · Legendary');
  r = row(s);
  for (const k of PMCard.SUITS) cell(r, sized(suitCard(k, 'mythical'), 205), PMCard.SUIT[k].name, ' · Mythical');

  // 4. new best
  s = section('NEW BEST: the only stamp', 'Only when this game beat his own record for the stat.'); r = row(s);
  cell(r, card('rare', { newBest: true }), 'Rare + New Best');
  cell(r, suitCard('souls', 'epic', { newBest: true }), 'Epic + New Best');
  cell(r, card('legendary', { newBest: true }), 'Legendary + New Best');
  cell(r, card('mythical', { newBest: true }), 'Mythical + New Best');

  // 5. layout
  s = section('Hero placement: medallion (default) vs cameo', 'Medallion keeps the suit pip whole. Cameo tucks Haze into the oval in front of a ghost pip.');
  r = row(s);
  cell(r, card('epic'), 'Medallion', ' · Epic');
  cell(r, card('epic', { layout: 'cameo' }), 'Cameo', ' · Epic');
  cell(r, suitCard('souls', 'legendary'), 'Medallion', ' · Legendary');
  cell(r, suitCard('souls', 'legendary', { layout: 'cameo' }), 'Cameo', ' · Legendary');

  // 6. bad cards
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

  // 7. back
  s = section('The back', 'Brass on matte black. The coin is a placeholder: swap card/src/logo.svg.'); r = row(s);
  cell(r, PMCard.renderBack(), 'Back, at rest');
  cell(r, hovered(PMCard.renderBack(), 6, -9, 22, 18, .8), 'Back, hover');

  // 8. a dealt hand
  s = section('A dealt hand (click Deal to replay)'); r = row(s, 'lab-hand'); r.id = 'hand';
  const hand = [
    suitCard('survival', 'common', { stat: 'Deaths', value: '3', no: 344 }),
    suitCard('souls', 'rare', { no: 201 }),
    suitCard('combat', 'common', { stat: 'Accuracy', value: '41%', no: 702, bad: 1 }),
    suitCard('objectives', 'epic', { no: 77 }),
    card('legendary', { newBest: true }),
  ];
  for (const c of hand) r.appendChild(c);

  // 9. small sizes
  s = section('Small: 150 px and 110 px'); r = row(s);
  for (const k of PMCard.SUITS) r.appendChild(sized(suitCard(k, k === 'crown' ? 'legendary' : 'rare'), 150));
  r.appendChild(sized(PMCard.renderBack(), 150));
  r = row(s);
  for (const k of PMCard.ORDER) r.appendChild(sized(card(k), 110));

  // 10. ten on screen
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
