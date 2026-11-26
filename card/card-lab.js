(function () {
  'use strict';
  const lab = document.getElementById('lab');
  const HAZE = 13;
  const LEGEND = {
    common: 'Plain print. One black ink.',
    rare: 'Second ink. Oxblood joins the frame and the band behind the number.',
    epic: 'Engraved border. Lathe-work frame, corner rosettes, ringed portrait, serial number.',
    legendary: "Coroner's seal. Embossed seal, security field, ink that shifts toward black as you tilt.",
    mythical: 'Black note. Inverted paper, bone ink, everything above.',
  };
  const DAMAGE = { 1: 'Scuffed', 2: 'Creased', 3: 'Torn corner, taped', 4: 'Torn in two, taped', 5: 'Torn, taped, stained' };
  const BASE = {
    common:    { value: '21,480', line: 'Top 38% of Haze games', flavor: 'Steady work. Nobody will write about it.', serial: '' },
    rare:      { value: '26,950', line: 'Top 22% of Haze games', flavor: 'The witnesses agree on most of it.', serial: '' },
    epic:      { value: '30,870', line: 'Top 8% of Haze games', flavor: 'Eleven shell casings. No regrets.', serial: '112 of 1,400' },
    legendary: { value: '34,210', line: 'Top 1% of Haze games', flavor: 'Twelve witnesses. None heard the second shot.', serial: '14 of 1,400' },
    mythical:  { value: '41,605', line: '1 in 1,400 Haze games', flavor: 'Cause of death: everyone, eventually.', serial: '1 of 1,400' },
  };
  const card = (rarity, extra) => PMCard.render(Object.assign({ rarity, hero: HAZE, suit: 'combat', stat: 'Hero Damage' }, BASE[rarity], extra || {}));

  function section(title) {
    const s = document.createElement('section'); s.className = 'lab-sec';
    const h = document.createElement('h2'); h.textContent = title; s.appendChild(h);
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

  // 1. ladder at rest
  let s = section('The ladder, at rest'), r = row(s);
  for (const k of PMCard.ORDER) cell(r, card(k), `${PMCard.RARITY[k].rank} · ${PMCard.RARITY[k].name}`, LEGEND[k]);

  // 2. ladder on hover
  s = section('The ladder, on hover (tilted toward the light)'); r = row(s);
  for (const k of PMCard.ORDER) cell(r, hovered(card(k), 6, -9, 22, 18, .85), `${PMCard.RARITY[k].name}, hover`);

  // 3. bad cards
  s = section('Bad cards: the same card, damaged by how bad it was'); r = row(s);
  const bad = { value: '9,870', line: 'Bottom 10% of Haze games', flavor: 'Cause of death: excessive caution.', serial: '1,262 of 1,400' };
  cell(r, card('epic', Object.assign({ bad: 3 }, bad)), 'Bad Epic (bottom 10%)', DAMAGE[3]);
  cell(r, hovered(card('epic', Object.assign({ bad: 3 }, bad)), 5, 8, 75, 20, .3), 'Bad Epic, hover');
  r = row(s);
  const badLadder = [
    ['common', 1, '15,120', 'Bottom 40% of Haze games', 'Present. Technically.'],
    ['rare', 2, '12,400', 'Bottom 25% of Haze games', 'The bullets were mostly decorative.'],
    ['epic', 3, '9,870', 'Bottom 10% of Haze games', 'Cause of death: excessive caution.'],
    ['legendary', 4, '5,300', 'Bottom 1% of Haze games', 'Remains were found in the fountain.'],
    ['mythical', 5, '2,140', 'Worst of 1,400 Haze games', 'No foul play. No play of any kind.'],
  ];
  for (const [k, lv, v, line, flavor] of badLadder) {
    const el = card(k, { bad: lv, value: v, line, flavor, serial: '1,399 of 1,400' });
    cell(r, el, `Bad ${PMCard.RARITY[k].name}`, DAMAGE[lv]);
  }

  // 4. back
  s = section('The back'); r = row(s);
  cell(r, PMCard.renderBack(), 'Back, at rest', 'The coin is a placeholder: swap card/src/logo.svg.');
  cell(r, hovered(PMCard.renderBack(), 6, -9, 22, 18, .8), 'Back, hover');

  // 5. a dealt hand
  s = section('A dealt hand'); r = row(s, 'lab-hand');
  const hand = [
    PMCard.render({ rarity: 'common', hero: HAZE, suit: 'survival', value: '3', stat: 'Deaths', line: 'Top 35% of Haze games', flavor: 'Died rarely, and on purpose.' }),
    PMCard.render({ rarity: 'rare', hero: HAZE, suit: 'souls', value: '1,042', stat: 'Souls per Minute', line: 'Top 21% of Haze games', flavor: 'Every coin accounted for.' }),
    PMCard.render({ rarity: 'common', hero: HAZE, suit: 'combat', value: '41%', stat: 'Accuracy', line: 'Bottom 30% of Haze games', flavor: 'The walls took a beating.', bad: 1 }),
    PMCard.render({ rarity: 'epic', hero: HAZE, suit: 'combat', value: '17', stat: 'Kills', line: 'Top 7% of Haze games', flavor: 'The morgue asked for a second van.', serial: '98 of 1,400' }),
    card('legendary'),
  ];
  for (const c of hand) r.appendChild(c);

  // 6. small sizes
  s = section('Small: 150 px and 110 px'); r = row(s);
  for (const k of PMCard.ORDER) { const c = card(k); c.style.setProperty('--w', '150px'); r.appendChild(c); }
  const b1 = card('epic', Object.assign({ bad: 3 }, bad)); b1.style.setProperty('--w', '150px'); r.appendChild(b1);
  const bk = PMCard.renderBack(); bk.style.setProperty('--w', '150px'); r.appendChild(bk);
  r = row(s);
  for (const k of PMCard.ORDER) { const c = card(k); c.style.setProperty('--w', '110px'); r.appendChild(c); }

  // 7. ten on screen
  s = section('Ten on screen (hover across them)'); r = row(s, 'lab-ten'); r.id = 'ten';
  const tenSet = ['common', 'common', 'rare', 'common', 'epic', 'rare', 'legendary', 'common', 'rare', 'mythical'];
  tenSet.forEach((k, i) => { const c = card(k, i === 3 ? Object.assign({ bad: 2 }, bad) : {}); c.style.setProperty('--w', '170px'); r.appendChild(c); });

  PMCard.enableTilt(lab);

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
})();
