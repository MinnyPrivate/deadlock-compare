"use strict";

// Summary tab: the post-match Highlights page. A hero column (who you were, how it went) and a bento of cards,
// each answering one question with one visual. Calm at rest, two or three more facts on hover, a corner link to the tab
// with the full breakdown. ShareCard (summary/share.js) turns the same highlights into an image.
window.Summary = (() => {
  const view = $("summaryView"), tooltip = $("summaryTip");
  const STATS = [
    { key: "kills", index: 0, label: "Kills", read: s => s.kills },
    { key: "deaths", index: 2, label: "Deaths", read: s => s.deaths, low: true },
    { key: "assists", index: 1, label: "Assists", read: s => s.assists },
    { key: "dmg_and_ally_heal", index: 5, label: "Hero damage + ally healing", short: "Damage + healing", read: s => (s.player_damage || 0) + (s.teammate_healing || 0) },
    { key: "objective_damage", index: 4, label: "Objective damage", read: s => s.boss_damage },
    { key: "souls", index: 3, label: "Souls", read: s => s.net_worth },
  ];
  const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const num = n => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const SHORT_GAME_S = 1200; // under 20:00 every percentile uses the per minute table
  const ENTER_MS = 300;
  const lookups = new Map();
  let names = new Map(), art = {}, match, rows, deaths, percentiles, shownTip, tipTimer;
  let enteredMatch, enterStart = 0, renderedBackdrop, current;

  const name = p => names.get(Number(p.raw.account_id)) || p.hero;
  const fullName = p => name(p) === p.hero ? p.hero : `${name(p)} on ${p.hero}`;
  const explain = text => `tabindex="0" data-summary-tip="${esc(text)}"`;
  const rowOf = p => rows.find(row => row.p === p);
  const coin = (p, cls = "") => `<span class="hl-coin ${cls}" style="--coin:${TEAMS[p.team].coin};--tc:${TEAMS[p.team].c}"><img src="${p.img}" alt=""></span>`;
  const who = q => `<span class="hl-who"><b class="summary-name" title="${esc(fullName(q))}">${esc(name(q))}</b>${name(q) !== q.hero ? `<small>${esc(q.hero)}</small>` : ""}</span>`;
  // The text of an HTML snippet (inert: a template never runs or loads anything), for the canvas share card.
  const plain = html => { const t = document.createElement("template"); t.innerHTML = html; return t.content.textContent; };
  const motion = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMe = p => p === state.me;
  // These go into HTML strings, so other players' names are escaped here.
  const You = p => isMe(p) ? "You" : esc(name(p));
  const you = p => isMe(p) ? "you" : esc(name(p));
  const your = p => isMe(p) ? "your" : `${esc(name(p))}'s`;
  const short = () => match.duration_s < SHORT_GAME_S;
  const link = (go, text) => `<button type="button" class="hl-link" data-hl-go="${go}">${text}<i aria-hidden="true">›</i></button>`;

  function selected() {
    return state.players.find(p => p.slot === state.summaryPick) || state.me ||
      state.players.find(p => p.team === state.leftTeam) || state.players[0];
  }

  function select(slot) {
    state.summaryPick = slot;
    renderAll();
  }

  function refresh(currentMatch, redrawPortraits = false) {
    if (state.match !== currentMatch || state.tab !== "summary" || view.hidden) return;
    const focused = document.activeElement?.dataset.summaryPortrait;
    if (redrawPortraits) {
      renderTop("summary");
      if (focused !== undefined) document.querySelector(`[data-summary-portrait="${Number(focused)}"]`)?.focus({ preventScroll: true });
    }
    render(true);
  }

  function prepareMatch() {
    if (match === state.match) return;
    match = state.match;
    rows = canGrade() ? valveRows() : [];
    deaths = deathEvents();
    names = new Map();
    const currentMatch = match;
    const ids = [...new Set(state.players.map(p => Number(p.raw.account_id)).filter(id => Number.isInteger(id) && id > 0))];
    if (ids.length) {
      const key = ids.slice().sort((a, b) => a - b).join(",");
      if (!lookups.has(key)) {
        const request = PlayerAssets.steamProfiles(ids, url => getJson(url).then(result => result.ok ? result.body : null))
          .catch(() => null);
        lookups.set(key, request);
      }
      lookups.get(key).then(profiles => {
        if (!Array.isArray(profiles) || state.match !== currentMatch || match !== currentMatch) return;
        names = new Map(profiles.filter(profile => ids.includes(Number(profile.account_id)) &&
          typeof profile.personaname === "string" && profile.personaname.trim())
          .map(profile => [Number(profile.account_id), profile.personaname]));
        if (names.size) refresh(currentMatch, true);
      });
    }
    percentiles ||= SummaryPercentiles.load();
    percentiles.then(() => refresh(currentMatch));
    PlayerAssets.heroArt().then(images => {
      art = images;
      if (Object.keys(art).length) refresh(currentMatch);
    });
  }

  // ---------- numbers ----------
  function bucket({ better, worse }) {
    if (better >= 99) return ["Top 1%", "up"];
    if (better >= 95) return ["Top 5%", "up"];
    if (better >= 90) return ["Top 10%", "up"];
    if (better > 75) return ["Top 25%", "up"];
    if (worse >= 99) return ["Bottom 1%", "down"];
    if (worse >= 95) return ["Bottom 5%", "down"];
    if (worse >= 90) return ["Bottom 10%", "down"];
    if (worse > 75) return ["Bottom 25%", "down"];
    return ["Typical", "even"];
  }

  function availableValues(p) {
    const raw = p.raw, snap = p.stats[p.stats.length - 1];
    const damage = Number.isFinite(snap?.player_damage) && Number.isFinite(snap?.teammate_healing) ? STATS[3].read(snap) : null;
    return [raw.kills, raw.deaths, raw.assists, damage, snap?.boss_damage, raw.net_worth];
  }

  function canGrade() {
    return hasSummaryStats() && (!state.awaitingValve || state.players.every(p => availableValues(p).every(Number.isFinite)));
  }

  const finalValues = p => {
    const raw = p.raw, snap = p.stats[p.stats.length - 1];
    return [raw.kills || 0, raw.deaths || 0, raw.assists || 0, STATS[3].read(snap), snap.boss_damage || 0, p.souls];
  };

  function statsFor(p) {
    if (!rows.length) {
      const values = availableValues(p);
      return STATS.map((stat, index) => ({ ...stat, value: values[index] }));
    }
    const values = finalValues(p), lobby = state.players.map(finalValues), minutes = match.duration_s / 60;
    return STATS.map((stat, index) => {
      const value = values[index];
      const key = short() ? stat.key + "_per_min" : stat.key, graded = short() ? value / minutes : value;
      const bounds = SummaryPercentiles.bounds(p.heroId, key, graded);
      const percentile = SummaryPercentiles.pct(p.heroId, key, graded);
      const place = 1 + lobby.filter(other => stat.low ? other[index] < value : other[index] > value).length;
      return { ...stat, value, graded, bounds, percentile, place, size: lobby.length };
    });
  }

  function proof(p, stat) {
    const rank = `${ordinal(stat.place)} of ${stat.size} in the lobby.`;
    if (!stat.percentile) return `${num(stat.value)} ${stat.label.toLowerCase()}. ${rank}`;
    const sample = SummaryPercentiles.sample();
    const dates = `${DAY.format(new Date(sample.window_start_utc))} to ${DAY.format(new Date(sample.window_end_utc))}`;
    const per = short() ? " per minute" : "";
    const show = v => short() ? v.toFixed(2) : num(v);
    const comparison = stat.bounds.better
      ? `Better than ${stat.bounds.better}% of ${num(stat.percentile.n)} ranked ${p.hero} games, ${dates}.`
      : `At or below the lowest measured value in ${num(stat.percentile.n)} ranked ${p.hero} games, ${dates}.`;
    return `${show(stat.graded)} ${stat.label.toLowerCase()}${per}. A typical ${p.hero} gets ${show(stat.percentile.p50)}. ${comparison} ${rank}${short() ? " Games under 20 minutes are compared per minute." : ""}`;
  }

  function scoreWhy(r) {
    const { p, v } = r;
    const baseline = v.inTable ? (window.HERO_NAMES[v.graded_hero] || p.hero) + "'s average" : "the all-hero average";
    const parts = VALVE_ROWS.slice().sort(([, a], [, b]) => Math.abs(v.points[b]) - Math.abs(v.points[a]));
    return `<b class="summary-tip-heading">${esc(name(p))} · ${ordinal(r.place)} of ${rows.length} · ${r.score.toFixed(1)} pts</b>
      <p>Estimated Valve score. Each stat is compared with ${esc(baseline)} and weighted.</p>
      <dl>${parts.map(([part, i]) => `<dt>${part} <small>×${window.PM_SCORE.W_VALVE[i]}</small></dt><dd>${signed(v.points[i], 2)}</dd>`).join("")}
        ${Math.abs(v.offset) >= 0.005 ? `<dt>Hero adjustment</dt><dd>${signed(v.offset, 2)}</dd>` : ""}</dl>`;
  }

  // Team soul lead over time, from one team's side.
  function leadSeries(team) {
    const out = [{ t: 0, lead: 0 }];
    for (const time of state.players[0].stats.map(s => s.time_stamp_s)) {
      const snaps = state.players.map(p => snapAt(p, time));
      if (snaps.some(s => s?.time_stamp_s !== time || !Number.isFinite(s.net_worth))) continue;
      out.push({ t: time, lead: snaps.reduce((sum, s, i) => sum + (state.players[i].team === team ? s.net_worth : -s.net_worth), 0) });
    }
    return out;
  }

  function laneInfo(p) {
    if (!LANES_BY_COLOR[p.lane]) return null;
    const byLane = state.players.filter(q => q.lane === p.lane);
    const mates = byLane.filter(q => q.team === p.team), opponents = byLane.filter(q => q.team !== p.team);
    if (!opponents.length) return null;
    const snapshots = new Map(byLane.map(q => [q, window.PM_SCORE.snapAt(q.raw, 540)]));
    if ([...snapshots.values()].some(snap => !snap)) return null;
    const sum = players => players.reduce((total, q) => total + (snapshots.get(q).net_worth || 0), 0);
    const friendlySouls = sum(mates), enemySouls = sum(opponents);
    return { mates, opponents, snapshots, friendlySouls, enemySouls, gap: (friendlySouls - enemySouls) / Math.max(1, friendlySouls, enemySouls) };
  }

  function rivals(p) {
    const byOpponent = new Map();
    for (const event of deaths) {
      const q = event.killer === p ? event.victim : event.victim === p ? event.killer : null;
      if (!q || q.team === p.team) continue;
      const entry = byOpponent.get(q) || { p: q, you: [], them: [] };
      (event.killer === p ? entry.you : entry.them).push(event);
      byOpponent.set(q, entry);
    }
    const entries = [...byOpponent.values()];
    return {
      nemesis: entries.filter(e => e.them.length).sort((a, b) => b.them.length - a.them.length || a.you.length - b.you.length || a.them[0].t - b.them[0].t)[0],
      victim: entries.filter(e => e.you.length).sort((a, b) => b.you.length - a.you.length || a.them.length - b.them.length || a.you[0].t - b.you[0].t)[0],
      killers: entries.filter(e => e.them.length).length,
    };
  }

  function damageTo(p) {
    const mu = muParse(match);
    if (!mu) return null;
    const total = (from, to) => Object.values(mu.dmg[from.slot]?.[to.slot] || {})
      .reduce((sum, array) => sum + muAt(array, mu.times.length - 1, mu.times.length), 0);
    return state.players.filter(q => q.team !== p.team).map(q => ({ q, out: total(p, q), in: total(q, p) }))
      .sort((a, b) => b.out - a.out);
  }

  // A small column chart: one bar per item, tallest first, its value on top and a coin or label under it.
  function columns(items) {
    const max = Math.max(1, ...items.map(item => item.value));
    return `<div class="hl-cols">${items.map(item => `<div class="hl-col${item.top ? " is-top" : ""}" ${explain(item.tip)}>
      <b>${fmtStat(item.value)}</b><i style="--h:${Math.max(3, item.value / max * 100).toFixed(1)}%;--c:${item.color}"></i>${item.foot}</div>`).join("")}</div>`;
  }

  // ---------- cards ----------
  // Each builder returns { id, area, kicker, big, sub, visual, more, go, tone, interest, share }, or null when it has nothing to say.
  function placeCard(p) {
    const r = rowOf(p), n = rows.length;
    const scores = rows.map(x => x.score), min = Math.min(...scores), max = Math.max(...scores);
    // Lay the coins on three rows so close scores never overlap. The selected player always sits on the axis.
    const span = Math.max(0.5, max - min), placed = [[], [], []];
    const other = rows[r.place === 1 ? 1 : r.place - 2];
    const room = (a, b) => Math.abs(a.pos - b.pos) >= (a.x === r || b.x === r ? 0.1 : 0.068);
    const order = [r, ...rows.filter(x => x !== r)], youPos = (r.score - min) / span;
    const dots = order.map(x => {
      const dot = { x, pos: (x.score - min) / span };
      const gapIn = row => Math.min(1, ...placed[row].map(o => Math.abs(o.pos - dot.pos)));
      dot.row = x === r ? 0 : [0, 1, 2].find(row => placed[row].every(o => room(o, dot)) && !(row === 1 && Math.abs(dot.pos - youPos) < 0.09)) ?? [0, 1, 2].sort((a, b) => gapIn(b) - gapIn(a))[0];
      for (let tries = 0; tries < 6 && placed[dot.row].some(o => !room(o, dot)); tries++) dot.pos = Math.min(1, dot.pos + 0.03);
      placed[dot.row].push(dot);
      return dot;
    }).reverse();
    const strip = `<div class="hl-strip" role="img" aria-label="Estimated Valve score for all ${n} players, lowest on the left">
      <span class="hl-strip-axis"></span>
      <div class="hl-strip-lane">${dots.map(({ x, pos, row }) => `<button type="button" class="hl-dot${x.p === p ? " is-you" : ""}${x.place <= 3 ? " is-top" : ""}"
        style="--x:${(pos * 100).toFixed(2)}%;--dy:${[0, -50, 50][row]}px" data-summary-slot="${x.p.slot}" data-summary-score="${x.p.slot}"
        aria-label="${esc(fullName(x.p))}, ${ordinal(x.place)}, ${x.score.toFixed(1)} points">
        ${coin(x.p)}${x.place <= 3 ? `<b class="hl-rank">${x.place}</b>` : ""}${x.p === p ? `<span class="hl-you-pin">${isMe(p) ? "You" : esc(name(p))}</span>` : ""}${x === other ? `<span class="hl-dot-name${row === 1 ? " up" : ""}">${esc(name(x.p))}</span>` : ""}</button>`).join("")}</div></div>`;
    const gapText = other ? `${Math.abs(other.score - r.score).toFixed(1)} est. pts ${r.place === 1 ? "ahead of" : "behind"} ${name(other.p)}` : "";
    // Valve's own award is a fact; the place is our estimate of Valve's score, so it says so.
    const kicker = p.mvp === 1 ? "Valve MVP" : p.mvp > 1 ? "Valve key player" : "Estimated lobby place";
    const teamBest = rows.find(x => x.p.team === p.team) === r;
    const parts = VALVE_ROWS.map(([label, i]) => ({ label, v: r.v.points[i] })).sort((a, b) => b.v - a.v);
    const boost = parts[0], drag = parts[parts.length - 1];
    const bottom = r.place > n - 3;
    return {
      id: "place", go: link("mvp", "MVP"), tone: r.place === 1 ? "gold" : bottom ? "bad" : "",
      kicker,
      big: `<b class="hl-big">${ordinal(r.place)}</b><span class="hl-of">of ${n}${p.mvp ? ", estimated" : ""}</span>`,
      sub: `${esc(gapText)}${teamBest && r.place > 1 ? ` · best on ${TEAMS[p.team].name}` : ""}`,
      visual: strip,
      more: `<span>Biggest boost <b class="summary-up">${esc(boost.label)} ${signed(boost.v, 1)}</b></span><span>Biggest drag <b class="${drag.v < 0 ? "summary-down" : ""}">${esc(drag.label)} ${signed(drag.v, 1)}</b></span>`,
      interest: r.place === 1 ? 100 : r.place <= 3 ? 60 : bottom ? 45 : 20,
      share: { label: p.mvp ? `${kicker} · estimated place` : kicker, big: `${ordinal(r.place)} of ${n}`, sub: gapText, tone: r.place === 1 ? "gold" : bottom ? "bad" : "" },
    };
  }

  function sweepCard(p, stats) {
    const vsHero = stats.filter(s => s.percentile).length >= 3;
    const pos = s => vsHero ? (s.percentile ? s.percentile.pct / 100 : null) : 1 - (s.place - 1) / Math.max(1, s.size - 1);
    // Green and red mean "against the hero average" (DESIGN.md). Against the lobby only a first place gets gold.
    const word = s => vsHero ? (s.bounds ? bucket(s.bounds) : ["No data", "even"]) : [ordinal(s.place), s.place === 1 ? "gold" : "even"];
    // Rank by how unusual each stat is, either direction, so a Bottom 1% outranks a Top 10%.
    const strength = s => pos(s) == null ? -1 : Math.abs(pos(s) - 0.5) - (word(s)[1] === "even" ? 1 : 0);
    const ranked = stats.filter(s => pos(s) != null).sort((a, b) => strength(b) - strength(a) || STATS.indexOf(a) - STATS.indexOf(b));
    const lead = ranked[0], [leadWord, leadTone] = word(lead);
    const flat = leadTone === "even", low = leadTone === "down";
    const per = short() ? " per minute" : "";
    const exceptional = ranked.filter(s => word(s)[1] !== "even");
    const shown = (exceptional.length ? exceptional : ranked).slice(0, 3), hidden = stats.filter(s => !shown.includes(s));
    const lines = shown.map(s => {
      const at = pos(s), [w, tone] = word(s);
      return `<div class="hl-sweep-row" ${explain(proof(p, s))}><span class="hl-sweep-label">${esc(s.short || s.label)}</span>
        <span class="hl-sweep-track">${at == null ? "" : `<i class="hl-sweep-dot summary-${tone}" style="--x:${(at * 100).toFixed(1)}%"></i>`}</span>
        <span class="hl-sweep-word summary-${tone}">${tone === "up" ? "▲ " : tone === "down" ? "▼ " : ""}${esc(w)}</span></div>`;
    }).join("");
    const leadName = (lead.short || lead.label).toLowerCase();
    return {
      id: "sweep", go: link("mvp", "MVP"), tone: low ? "bad" : "",
      kicker: vsHero ? `Vs other ${esc(p.hero)} games` : "Vs the lobby",
      big: flat ? `<b class="hl-big hl-word">Typical</b><span class="hl-of">on every stat${per}</span>`
        : `<b class="hl-big summary-${leadTone}">${esc(leadWord)}</b><span class="hl-of">${esc(leadName)}${per} · ${short() ? lead.graded.toFixed(lead.graded < 10 ? 2 : 0) : fmtStat(lead.value)}</span>`,
      sub: "",
      visual: `<div class="hl-sweep${vsHero ? "" : " is-lobby"}">${lines}
        ${hidden.length ? `<span class="hl-sweep-rest" ${explain(hidden.map(s => `${s.short || s.label}: ${word(s)[0]}.`).join(" "))}>+${hidden.length} other stats${hidden.every(s => word(s)[1] === "even") ? ", all typical" : ""}</span>` : ""}</div>`,
      more: "",
      interest: flat ? 0 : 20 + (lead.percentile ? Math.abs(lead.percentile.pct - 50) : 25), // the honest overall read, so it ranks high
      share: flat ? null : { label: vsHero ? `Vs ${p.hero} games` : "Vs the lobby", big: leadWord, sub: `in ${leadName}${per}`, tone: low ? "bad" : leadTone === "gold" ? "gold" : "good" },
      leadLabel: lead.label,
    };
  }

  function storyCard(p) {
    const series = leadSeries(p.team);
    // Only tell the story when the shared snapshots cover the match: start, end and no long gaps.
    const covered = series.length >= 4 && series[1].t <= 420 && series[series.length - 1].t >= match.duration_s - 420 &&
      series.every((pt, i) => !i || pt.t - series[i - 1].t <= 420);
    if (!covered) return null;
    const won = Number(match.winning_team) === p.team, dur = match.duration_s;
    let low = series[0], high = series[0], changes = 0, sign = 0;
    for (const pt of series) {
      if (pt.lead < low.lead) low = pt;
      if (pt.lead > high.lead) high = pt;
      const s = Math.sign(pt.lead);
      if (s && sign && s !== sign) changes++;
      if (s) sign = s;
    }
    // Share of the match this team spent ahead, weighted by the time between snapshots.
    let aheadTime = 0, behindTime = 0;
    for (let i = 1; i < series.length; i++) {
      const span = series[i].t - series[i - 1].t;
      if (series[i].lead > 0) aheadTime += span;
      else if (series[i].lead < 0) behindTime += span;
    }
    const total = Math.max(1, series[series.length - 1].t), ahead = aheadTime / total, behind = behindTime / total;
    const trailedLate = series.some(pt => pt.t > 300 && (won ? pt.lead < 0 : pt.lead > 0));
    const final = series[series.length - 1].lead;
    let word, sub, shareSub, tone = "", mark;
    if (won && low.lead <= -5000) { word = "Comeback"; sub = `Won after trailing by ${fmtStat(-low.lead)} at ${fmtTime(low.t)}.`; shareSub = `From −${fmtStat(-low.lead)} to victory`; mark = low; tone = "good"; }
    else if (!won && high.lead >= 5000) { word = "Thrown"; sub = `Led by ${fmtStat(high.lead)} at ${fmtTime(high.t)}, then lost.`; shareSub = `From +${fmtStat(high.lead)} to defeat`; mark = high; tone = "bad"; }
    else if (won && !trailedLate && high.lead >= 15000) { word = "Stomp"; sub = `Never trailed after 5:00. Up ${fmtStat(high.lead)} at the peak.`; mark = high; tone = "good"; }
    else if (!won && !trailedLate && low.lead <= -15000) { word = "Steamrolled"; sub = `Never led after 5:00. Down ${fmtStat(-low.lead)} at the worst.`; mark = low; tone = "bad"; }
    else if (changes >= 3) { word = "Back and forth"; sub = `The soul lead changed hands ${changes} times. ${won ? "Won" : "Lost"} in ${fmtTime(dur)}.`; mark = won ? high : low; }
    else if (won && ahead >= 0.6) { word = "Held the lead"; sub = `Ahead for about ${Math.round(ahead * 100)}% of the game. Won in ${fmtTime(dur)}.`; mark = high; }
    else if (!won && behind >= 0.6) { word = "Chased all game"; sub = `Behind for about ${Math.round(behind * 100)}% of the game. Lost in ${fmtTime(dur)}.`; mark = low; tone = "bad"; }
    else if (Math.max(high.lead, -low.lead) < 6000) { word = "Close one"; sub = `Neither team got 6k ahead. ${won ? "Won" : "Lost"} in ${fmtTime(dur)}.`; mark = won ? high : low; }
    else if (won) { word = "Took control"; sub = `Biggest lead ${fmtStat(high.lead)} at ${fmtTime(high.t)}.`; mark = high; }
    else { word = "Fell behind"; sub = `Biggest deficit ${fmtStat(-low.lead)} at ${fmtTime(low.t)}.`; mark = low; tone = "bad"; }
    const W = 440, H = 120, mid = H / 2;
    const scale = Math.max(2000, ...series.map(pt => Math.abs(pt.lead)));
    const x = t => (t / dur * W).toFixed(1), y = v => (mid - v / scale * (mid - 8)).toFixed(1);
    const line = series.map((pt, i) => `${i ? "L" : "M"}${x(pt.t)},${y(pt.lead)}`).join("");
    const area = `${line}L${x(series[series.length - 1].t)},${mid}L0,${mid}Z`;
    const id = `hl${match.match_id}`;
    const mine = TEAMS[p.team].c, theirs = TEAMS[1 - p.team].c;
    const svg = `<svg class="hl-story-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Team soul lead over the match. Above the line ${esc(TEAMS[p.team].name)} was ahead.">
      <defs><clipPath id="${id}u"><rect width="${W}" height="${mid}"/></clipPath><clipPath id="${id}d"><rect y="${mid}" width="${W}" height="${mid}"/></clipPath></defs>
      <g class="hl-area"><path d="${area}" fill="${mine}" fill-opacity=".42" clip-path="url(#${id}u)"/><path d="${area}" fill="${theirs}" fill-opacity=".42" clip-path="url(#${id}d)"/></g>
      <line class="hl-zero" x1="0" x2="${W}" y1="${mid}" y2="${mid}"/>
      <path class="hl-story-line" d="${line}" pathLength="1"/></svg>`;
    const markX = mark.t / dur * 100, markY = y(mark.lead) / H * 100;
    const markText = `${mark.lead >= 0 ? "+" : "−"}${fmtStat(Math.abs(mark.lead))} at ${fmtTime(mark.t)}`;
    const dot = `<i class="hl-mark" style="left:${markX.toFixed(2)}%;top:${markY.toFixed(2)}%"></i>
      <span class="hl-mark-label${markY < 40 ? " below" : ""}${markX > 78 ? " left" : ""}" style="left:${markX.toFixed(2)}%;top:${markY.toFixed(2)}%">${markText}</span>`;
    const ends = `<span class="hl-story-time">0:00</span><span class="hl-story-time end">${fmtTime(dur)}</span>`;
    const labels = ends + `<span class="hl-story-team up" style="--tc:${mine}">${esc(TEAMS[p.team].name)} ahead</span><span class="hl-story-team down" style="--tc:${theirs}">${esc(TEAMS[1 - p.team].name)} ahead</span>`;
    return {
      id: "story", go: link("souls_lead", "Graphs"), tone: tone === "bad" ? "bad" : "",
      kicker: "Match story",
      big: `<b class="hl-big hl-word">${word}</b>`,
      sub: esc(sub),
      visual: `<div class="hl-story">${svg}${dot}${labels}</div>`,
      more: `<span>Biggest lead <b>${fmtStat(Math.max(0, high.lead))}</b></span><span>Biggest deficit <b>${fmtStat(Math.max(0, -low.lead))}</b></span><span>Final gap <b>${fmtStat(Math.abs(final))}</b></span>`,
      interest: tone ? 70 : 15,
      share: tone || changes >= 3 ? { label: "Match story", big: word, sub: shareSub || sub, tone, mark: { t: mark.t, text: markText } } : null,
    };
  }

  function rivalCard(p) {
    const { nemesis, victim, killers } = rivals(p), damage = damageTo(p);
    const deathsTotal = p.raw.deaths || 0;
    const stamp = events => events.slice(0, 5).map(e => fmtTime(e.t)).join(", ");
    const duel = (q, label, tone, score, sub, more, interest) => {
      const d = damage?.find(e => e.q === q);
      const max = Math.max(1, d?.out || 0, d?.in || 0);
      const bars = d ? `<div class="hl-duel-bars" role="img" aria-label="Hero damage to each other"><small class="hl-duel-head">Hero damage</small>
          <span>${isMe(p) ? "You" : esc(name(p))}</span><span class="hl-duel-track"><i style="--w:${(d.out / max * 100).toFixed(1)}%;--tc:${TEAMS[p.team].c}"></i></span><b>${fmtStat(d.out)}</b>
          <span>${esc(name(q))}</span><span class="hl-duel-track"><i style="--w:${(d.in / max * 100).toFixed(1)}%;--tc:${TEAMS[q.team].c}"></i></span><b>${fmtStat(d.in)}</b></div>` : "";
      return {
        id: "rival", go: link("matchups", "Matchups"), tone, rival: q,
        kicker: label, big: `<span class="hl-rival-name">${who(q)}</span>`, sub,
        visual: `<div class="hl-duel">${coin(q, "big")}<div class="hl-duel-score" ${more ? explain(plain(more)) : ""}><b>${score}</b><small>Kills, ${isMe(p) ? "you" : esc(name(p))} vs them</small></div>${bars}</div>`,
        more: "", interest,
        share: { label, big: name(q), sub: plain(sub), tone },
      };
    };
    if (nemesis && nemesis.them.length >= 2) {
      const n = nemesis.them.length;
      const ttk = nemesis.them.map(e => e.victim.raw.death_details?.find(d => d.game_time_s === e.t)?.time_to_kill_s).filter(Number.isFinite);
      return duel(nemesis.p, "Nemesis", "bad", `${nemesis.you.length}<i>–</i>${n}`,
        `Killed ${you(p)} ${n} of ${deathsTotal} times.`,
        `<span>Deaths at ${stamp(nemesis.them)}</span>${ttk.length ? `<span>Fastest <b>${Math.min(...ttk).toFixed(1)} s</b></span>` : ""}`, 40 + n * 5);
    }
    if (victim && victim.you.length >= 2) {
      const n = victim.you.length;
      return duel(victim.p, "Favorite target", "good", `${n}<i>–</i>${victim.them.length}`,
        victim.them.length ? `${You(p)} killed them ${n} times.` : `${n} kills. Never got ${you(p)} back.`,
        `<span>Kills at ${stamp(victim.you)}</span>`, 30 + n * 5);
    }
    if (deathsTotal === 0) {
      return {
        id: "rival", go: link("matchups", "Matchups"), tone: "good", kicker: "Untouchable",
        big: `<b class="hl-big">0</b><span class="hl-of">deaths</span>`, sub: `Not one death in ${fmtTime(match.duration_s)}.`,
        visual: lobbyDeaths(p), more: `<span>Nobody on ${esc(TEAMS[1 - p.team].name)} found the kill</span>`, interest: 90,
        share: { label: "Untouchable", big: "0 deaths", sub: `in ${fmtTime(match.duration_s)}`, tone: "good" },
      };
    }
    if (damage?.[0]?.out) {
      const all = damage.reduce((sum, e) => sum + e.out, 0), top = damage[0];
      const share = Math.round(top.out / Math.max(1, all) * 100);
      return {
        id: "rival", go: link("matchups", "Matchups"), tone: "", rival: top.q, kicker: "Focus target",
        big: `<span class="hl-rival-name">${who(top.q)}</span>`, sub: `Took ${share}% of ${your(p)} hero damage.`,
        visual: columns(damage.map((e, i) => ({ value: e.out, color: TEAMS[e.q.team].c, top: i === 0, foot: coin(e.q), tip: `${fmtStat(e.out)} hero damage to ${name(e.q)}.` }))),
        more: `<span>No one killed ${you(p)} twice. ${killers} different killers.</span>`, interest: share >= 40 ? 20 : 8, share: null,
      };
    }
    return {
      id: "rival", go: link("matchups", "Matchups"), tone: "", kicker: "No repeat killer",
      big: `<b class="hl-big">${killers}</b><span class="hl-of">different killers</span>`, sub: `Nobody got ${you(p)} twice.`,
      visual: lobbyDeaths(p), more: "", interest: 10, share: null,
    };
  }

  // Every player's deaths as columns, fewest first, so a clean game stands out against the lobby.
  function lobbyDeaths(p) {
    const list = state.players.slice().sort((a, b) => (a.raw.deaths || 0) - (b.raw.deaths || 0));
    const most = Math.max(1, ...list.map(q => q.raw.deaths || 0));
    return `<div class="hl-cols is-deaths">${list.map(q => `<div class="hl-col${q === p ? " is-top" : ""}" ${explain(`${name(q)}: ${q.raw.deaths || 0} deaths.`)}>
      <b>${q.raw.deaths || 0}</b><i style="--h:${Math.max(3, (q.raw.deaths || 0) / most * 100).toFixed(1)}%;--c:${TEAMS[q.team].c}"></i>${coin(q)}</div>`).join("")}</div>`;
  }

  function laneCard(p) {
    const lane = laneInfo(p);
    if (!lane) return null;
    const gap = lane.gap;
    // Shown against the other side's total: "28% behind" means 28% fewer souls than them.
    const pctGap = Math.round(Math.abs(lane.friendlySouls - lane.enemySouls) / Math.max(1, lane.enemySouls) * 100);
    // Over 15% apart is a won or lost lane; never "Even" past that.
    const [word, tone] = gap > 0.15 ? ["Won lane", "good"] : gap < -0.15 ? ["Lost lane", "bad"]
      : gap > 0.05 ? ["Edged lane", ""] : gap < -0.05 ? ["Behind in lane", ""] : ["Even lane", ""];
    const color = LANES_BY_COLOR[p.lane];
    const share = lane.friendlySouls / Math.max(1, lane.friendlySouls + lane.enemySouls);
    const side = (team, souls, right) => `<div class="hl-tug-side${right ? " right" : ""}"><span class="hl-tug-coins">${team.map(q => coin(q)).join("")}</span><b>${fmtStat(souls)}</b></div>`;
    const row = (label, key) => {
      const own = lane.snapshots.get(p)[key] || 0;
      const avg = lane.opponents.reduce((s, q) => s + (lane.snapshots.get(q)[key] || 0), 0) / lane.opponents.length;
      const t = own > avg ? "up" : own < avg ? "down" : "even";
      return `<span>${label} <b>${t === "up" ? "▲" : t === "down" ? "▼" : "≈"} ${num(own)}</b> vs ${num(Math.round(avg))}</span>`;
    };
    return {
      id: "lane", go: link("lanes", "Lanes"), tone: tone === "bad" ? "bad" : "",
      kicker: `<span class="hl-lane-word" data-lane="${color.toLowerCase()}">${color} lane</span> · 9:00`,
      big: `<b class="hl-big hl-word${tone ? "" : " is-quiet"}">${word}</b>`,
      sub: `${pctGap ? `${pctGap}% ${gap > 0 ? "ahead" : "behind"} on team souls.` : "Dead even on team souls."}`,
      visual: `<div class="hl-tug" style="--mine:${TEAMS[p.team].c};--theirs:${TEAMS[1 - p.team].c};--share:${(share * 100).toFixed(1)}%">
        ${side(lane.mates, lane.friendlySouls)}<div class="hl-tug-bar"><i></i><span class="hl-tug-mid"></span></div>${side(lane.opponents, lane.enemySouls, true)}</div>`,
      more: row("Last hits", "creep_kills") + row("Denies", "denies") + row("Hero dmg", "player_damage"),
      interest: tone ? 35 + pctGap : 12,
      share: tone ? { label: `${color} lane`, big: word, sub: `${fmtStat(lane.friendlySouls)} vs ${fmtStat(lane.enemySouls)} souls at 9:00`, tone } : null,
    };
  }

  function momentsCard(p, wide) {
    const dur = match.duration_s;
    const kills = deaths.filter(e => e.killer === p && e.victim.team !== p.team);
    const died = deaths.filter(e => e.victim === p);
    // Kill chains: this player's kills no more than 10 seconds apart.
    let chain = [], best = [];
    for (const e of kills) {
      chain = chain.length && e.t - chain[chain.length - 1].t <= 10 ? [...chain, e] : [e];
      if (chain.length > best.length) best = chain;
    }
    const first = deaths.find(e => e.killer && e.victim.team !== e.killer.team);
    const starts = [0, ...died.map(e => e.t + e.duration)];
    let longest = { from: 0, to: 0 };
    starts.forEach((from, i) => {
      const to = i < died.length ? died[i].t : dur;
      if (to - from > longest.to - longest.from) longest = { from, to };
    });
    const chainWord = ["", "", "Double kill", "Triple kill", "Quad kill", "Penta kill", "Hexa kill"];
    let word, sub, tone = "", focus = [], interest = 10;
    if (best.length >= 2) {
      word = chainWord[Math.min(6, best.length)];
      sub = `${best.length} kills in ${Math.round(best[best.length - 1].t - best[0].t)} s at ${fmtTime(best[0].t)}.`;
      focus = best; tone = "good"; interest = 30 + best.length * 15;
    } else if (first?.killer === p) {
      word = "First blood"; sub = `Opened the game on ${name(first.victim)} at ${fmtTime(first.t)}.`; focus = [first]; tone = "good"; interest = 40;
    } else if (first?.victim === p) {
      word = "First to fall"; sub = `${name(first.killer)} got ${isMe(p) ? "you" : name(p)} at ${fmtTime(first.t)}.`; focus = [first]; tone = "bad"; interest = 30;
    } else {
      word = "Longest life"; sub = `${fmtTime(longest.to - longest.from)} without dying${died.length !== (p.raw.deaths || 0) ? " (recorded deaths)" : ""}, from ${fmtTime(longest.from)} to ${fmtTime(longest.to)}.`; interest = 15;
    }
    const W = wide ? 660 : 440, H = wide ? 112 : 122, mid = wide ? 52 : 57, x = t => (t / dur * W).toFixed(1);
    const tick = (e, up) => `<g class="hl-tick ${up ? "kill" : "death"}${focus.includes(e) ? " is-focus" : ""}" transform="translate(${x(e.t)},${mid})"><line y1="${up ? -4 : 4}" y2="${up ? -32 : 32}"/><circle cy="${up ? -37 : 37}" r="${focus.includes(e) ? 7 : 5}"/></g>`;
    const focusLabel = "";
    const life = word === "Longest life" ? `<rect class="hl-life" x="${x(longest.from)}" y="${mid - 3}" width="${((longest.to - longest.from) / dur * W).toFixed(1)}" height="6" rx="3"/>` : "";
    const bosses = (match.mid_boss || []).filter(b => b.destroyed_time_s).map(b => `<path class="hl-boss" d="M${x(b.destroyed_time_s)},${mid - 7}l7,7l-7,7l-7,-7Z"/>`).join("");
    const marks = Array.from({ length: Math.floor((dur - 60) / 600) }, (_, i) => `<text x="${x((i + 1) * 600)}" y="${H - 2}">${(i + 1) * 10}:00</text>`).join("");
    const svg = `<svg class="hl-moments-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${kills.length} kills above the line and ${died.length} deaths below it, across the match">
      <line class="hl-zero" x1="0" x2="${W}" y1="${mid}" y2="${mid}"/>${life}${died.map(e => tick(e, false)).join("")}${kills.map(e => tick(e, true)).join("")}${bosses}${focusLabel}${marks}</svg>`;
    const mismatch = kills.length !== (p.raw.kills || 0) || died.length !== (p.raw.deaths || 0);
    // The faces in the moment, pinned over the time line, so the headline has proof.
    const faces = focus.map(e => e.victim === p ? e.killer : e.victim).filter(Boolean);
    const at = focus.length ? Math.min(86, Math.max(14, focus[0].t / dur * 100)) : 0;
    const callout = faces.length ? `<div class="hl-callout${focus[0].victim === p ? " is-death" : ""}" style="--at:${at.toFixed(1)}%">${faces.map(q => coin(q)).join("")}
      <span>${focus.length > 1 ? `${focus.length} kills in ${Math.round(focus[focus.length - 1].t - focus[0].t)} s · ${fmtTime(focus[0].t)}` : `${esc(name(faces[0]))} · ${fmtTime(focus[0].t)}`}</span></div>` : "";
    return {
      id: "moments", go: link("kills", "Graphs"), tone: tone === "bad" ? "bad" : "",
      kicker: "Big moment",
      big: `<b class="hl-big hl-word">${word}</b>`, sub: callout ? "" : esc(sub),
      visual: `<div class="hl-moments${callout ? " has-callout" : ""}">${callout}${svg}<span class="hl-moments-key"><i class="kill"></i>Kills<i class="death"></i>Deaths${bosses ? '<i class="boss"></i>Mid Boss' : ""}</span>
        ${mismatch ? `<span class="hl-note summary-chart-caption" ${explain("Valve's per-death records and the end screen scoreboard disagree for this player. The headline numbers use the scoreboard.")}>Recorded markers differ from the scoreboard.</span>` : ""}</div>`,
      more: callout ? "" : `<span>Longest life <b>${fmtTime(longest.to - longest.from)}</b></span><span>Time dead <b>${fmtTime(died.reduce((s, e) => s + e.duration, 0))}</b></span>`,
      interest, share: tone ? { label: "Big moment", big: word, sub, tone } : null,
    };
  }

  function bestsCard(p, sweep) {
    const snap = q => q.stats[q.stats.length - 1] || {};
    const LIST = [
      ["Kills", q => q.raw.kills || 0], ["Assists", q => q.raw.assists || 0], ["Fewest deaths", q => -(q.raw.deaths || 0)],
      ["Hero damage", q => snap(q).player_damage || 0], ["Objective damage", q => snap(q).boss_damage || 0],
      ["Souls", q => q.souls || 0], ["Ally heal + barrier", q => (snap(q).teammate_healing || 0) + (snap(q).teammate_barriering || 0)],
      ["Last hits", q => q.raw.last_hits || 0], ["Denies", q => q.raw.denies || 0],
      ["Damage taken", q => (snap(q).player_damage_taken || 0) + (snap(q).damage_mitigated || 0)],
    ];
    const led = LIST.map(([label, read]) => {
      const mine = read(p), rest = state.players.filter(q => q !== p);
      const next = rest.reduce((best, q) => read(q) > read(best) ? q : best, rest[0]);
      // Margin over the runner-up, the size of the lead, so the rows can be ranked and drawn.
      const margin = label === "Fewest deaths" ? read(next) - mine : mine / Math.max(1, read(next));
      return { label, mine, next, nextValue: read(next), margin, led: (mine > 0 || label === "Fewest deaths") && rest.every(q => read(q) < mine) };
    }).filter(x => x.led).sort((a, b) => (b.label !== "Fewest deaths") - (a.label !== "Fewest deaths") ||
      // The stat the sweep card already headlines goes last, so the two cards do not repeat each other.
      (a.label === sweep?.leadLabel) - (b.label === sweep?.leadLabel) || b.margin - a.margin);
    if (!led.length) return null;
    const [top, ...others] = led, shown = others.slice(0, 3);
    const topValue = top.label === "Fewest deaths" ? -top.mine : fmtStat(top.mine);
    const times = top.label === "Fewest deaths" ? "" : `, ${(top.margin).toFixed(1)}× the next best`;
    return {
      id: "bests", go: link("mvp", "MVP"), tone: "gold",
      kicker: led.length > 1 ? `Lobby bests · ${led.length}` : "Lobby best",
      big: `<b class="hl-big summary-gold">${topValue}</b><span class="hl-of">${esc(top.label.toLowerCase())}${times}</span>`,
      sub: "",
      visual: `<ul class="hl-best-list is-single">${shown.map(x => `<li ${explain(`Next best: ${name(x.next)} with ${x.label === "Fewest deaths" ? -x.nextValue : fmtStat(x.nextValue)}.`)}><span>${esc(x.label)}</span><b>${x.label === "Fewest deaths" ? -x.mine : fmtStat(x.mine)}</b>
        ${x.label === "Fewest deaths" ? "" : `<i class="hl-best-bar"><i style="--w:${(x.nextValue / Math.max(1, x.mine) * 100).toFixed(1)}%"></i></i><small>Next best ${fmtStat(x.nextValue)}, ${esc(name(x.next))}</small>`}</li>`).join("")}${others.length > shown.length ? `<li class="hl-best-more" ${explain(others.slice(shown.length).map(x => x.label).join(", ") + ".")}>+${others.length - shown.length} more</li>` : ""}</ul>`,
      more: "",
      interest: led.length >= 2 ? 20 + led.length * 12 : 12, // one lobby best is a footnote, not a card
      share: led.length >= 2 ? { label: "Lobby best", big: topValue, sub: `${top.label}${times}`, tone: "gold" } : null,
    };
  }

  function soulsCard(p) {
    const s = p.stats[p.stats.length - 1] || {};
    const sources = [["Troopers", (s.gold_lane_creep || 0) + (s.gold_lane_creep_orbs || 0)], ["Jungle", (s.gold_neutral_creep || 0) + (s.gold_neutral_creep_orbs || 0)],
      ["Heroes", (s.gold_player || 0) + (s.gold_player_orbs || 0)], ["Objectives", (s.gold_boss || 0) + (s.gold_boss_orb || 0)], ["Urn and crates", s.gold_treasure || 0]]
      .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const total = sources.reduce((sum, [, v]) => sum + v, 0) || 1;
    const place = 1 + state.players.filter(q => q.souls > p.souls).length;
    return {
      id: "souls", go: link("souls_source", "Graphs"), tone: "",
      kicker: "Where the souls came from",
      big: `<b class="hl-big hl-word">${esc(sources[0]?.[0] || "Souls")}</b>`,
      sub: `${Math.round((sources[0]?.[1] || 0) / total * 100)}% of tracked income. ${ordinal(place)} richest in the lobby.`,
      visual: columns(sources.map(([label, v], i) => ({ value: v, color: "var(--hero-accent)", top: i === 0, foot: `<small>${esc(label)}</small>`, tip: `${label}: ${fmtStat(v)} souls.` }))),
      more: `<span>Dropped on death <b>${fmtStat(s.gold_death_loss || 0)}</b></span>`, interest: 5, share: null,
    };
  }

  // Cards are candidates, ranked by how interesting they are. Fillers drop out, at most two bad-news cards stay,
  // and the grid reflows: row one is placement plus the top pick, row two the story plus the next, row three the rest.
  const MIN_INTEREST = 18;
  function buildCards(p, stats) {
    const place = placeCard(p), story = storyCard(p);
    const sweep = sweepCard(p, stats), bests = bestsCard(p, sweep);
    const picks = [sweep, rivalCard(p), momentsCard(p, false), laneCard(p), bests]
      .filter(card => card && card.interest >= MIN_INTEREST).sort((a, b) => b.interest - a.interest);
    // The slot beside the placement is short, so it goes to the strongest compact card; the rest keep their ranking.
    const compactIndex = picks.findIndex(card => ["sweep", "bests", "lane"].includes(card.id));
    const beside = compactIndex >= 0 ? picks.splice(compactIndex, 1)[0] : picks.shift();
    // Row two holds the story plus one or two cards; a third row only when it can hold two or three.
    const second = picks.length === 2 ? picks.splice(0, 2) : picks.splice(0, 1);
    const rows = [[place, beside], [story, ...second], picks.slice(0, 3)].map(row => row.filter(Boolean)).filter(row => row.length);
    const spans = row => row.length === 1 ? [6] : row.length === 3 ? [2, 2, 2] : row[0] === place ? [4, 2] : [3, 3];
    let cards = [];
    rows.forEach(row => row.forEach((card, i) => {
      const span = spans(row)[i];
      // The time line is drawn to its card's width.
      const sized = card.id === "moments" && span >= 3 ? momentsCard(p, true) : card;
      cards.push({ ...sized, span });
    }));
    // A loss is told with its bad moments, so they all stay; only the two strongest keep the rust edge,
    // so the page reads as a story rather than a wall of warnings.
    cards.filter(card => card.tone === "bad").sort((a, b) => b.interest - a.interest).slice(2).forEach(card => { card.tone = ""; });
    return { cards, rows: rows.length };
  }

  // The three strongest highlights for the share image, strongest first.
  function shareLines(cards) {
    return cards.filter(card => card.share).sort((a, b) => b.interest - a.interest)
      .slice(0, 3).map(card => card.share);
  }

  // ---------- page ----------
  function heroArt(p, won) {
    const fallback = p.card || p.img;
    const source = art[p.heroId]?.[won ? "gloat" : "crit"] || fallback;
    return `<img src="${esc(source)}" data-summary-art-fallback="${esc(fallback)}" alt="">`;
  }

  function itemGrid(p) {
    const order = ["w", "v", "s"];
    const items = GraphMarkers.itemRecords(p).filter(item => !item.sold)
      .sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot) || a.t - b.t).slice(0, 12);
    const slots = items.map(item => `<span class="summary-item" data-category="${esc(item.slot)}" ${explain(`${item.name}. Bought at ${fmtTime(item.t)}.`)}>
      <img src="assets/items/${esc(item.icon)}.webp" alt="${esc(item.name)}"></span>`);
    while (slots.length < 12) slots.push('<span class="summary-item empty-slot" aria-hidden="true"></span>');
    return `<section class="summary-build"><div class="summary-items">${slots.join("")}</div></section>`;
  }

  function heroColumn(p, stats) {
    const won = Number(match.winning_team) === p.team, team = TEAMS[p.team], username = name(p);
    const kda = stats.slice(0, 3).map(stat => stat.value ?? "–").join(" <i>/</i> ");
    const souls = stats[5].value;
    const lane = LANES_BY_COLOR[p.lane];
    const date = match.start_time ? DAY.format(new Date(match.start_time * 1000)) : "";
    const rank = rankHtml(p.badge) || (state.awaitingValve ? "" : '<span class="rank none">Unranked</span>');
    return `<section class="hl-hero" style="--tc:${team.c}" aria-label="Player overview">
      <div class="hl-result ${won ? "win" : "loss"}"><img src="${team.icon}" alt=""><b>${won ? "Victory" : "Defeat"}</b>
        <span>${esc(team.name)}${lane ? ` · ${lane} lane` : ""} · ${fmtTime(match.duration_s)}${date ? ` · ${date}` : ""}</span></div>
      <div class="hl-art">${heroArt(p, won)}
        <div class="hl-id">
          <div class="hl-id-name"><h2 class="summary-name" title="${esc(username)}">${esc(username)}</h2>${isMe(p) ? '<span class="summary-you">You</span>' : ""}</div>
          <div class="hl-id-meta">${username !== p.hero ? `<span>${esc(p.hero)}</span>` : ""}${rank}</div>
        </div></div>
      <div class="summary-kda" aria-label="Kills, deaths, assists and souls"><b>${kda}</b>${Number.isFinite(souls) ? `<span><img src="assets/ui/icon_soul.svg" alt="">${fmtStat(souls)}</span>` : ""}</div>
      ${!state.awaitingValve || Array.isArray(p.raw.items) ? itemGrid(p) : ""}
      <div class="hl-actions">
        ${rows.length && !EMBED && window.ShareCard ? '<button type="button" class="hl-share" data-hl-share data-summary-focus="share"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>Share</button>' : ""}
        ${state.awaitingValve ? "" : `<details class="summary-compare"><summary class="hl-button" data-summary-focus="compare">Compare with…</summary>
          <div class="summary-compare-menu" aria-label="Choose a player to compare on the Graphs tab">${state.players.filter(q => q !== p).map(q =>
            `<button type="button" data-summary-compare="${q.slot}">${coin(q)}<span class="summary-name" title="${esc(fullName(q))}">${esc(name(q))}</span></button>`).join("")}</div>
        </details>`}
        ${EMBED ? "" : '<button type="button" class="hl-icon" data-summary-copy data-summary-focus="copy" aria-label="Copy link" title="Copy link"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg></button>'}
        <span class="summary-copy-status" role="status"></span>
      </div></section>`;
  }

  function cardHtml(card) {
    return `<article class="hl-card hl-${card.id}${card.tone ? " is-" + card.tone : ""}" style="grid-column:span ${card.span}" tabindex="0" data-hl-card="${card.id}">
      <header class="hl-head"><span class="hl-kicker">${card.kicker}</span>${card.go}</header>
      <h3 class="hl-headline">${card.big}</h3>
      ${card.sub || card.more ? `<div class="hl-body">${card.sub ? `<p class="hl-sub">${card.sub}</p>` : ""}${card.more ? `<p class="hl-more">${card.more}</p>` : ""}</div>` : ""}
      ${card.visual ? `<div class="hl-visual">${card.visual}</div>` : ""}</article>`;
  }

  function basicStats(stats) {
    return `<section class="hl-waiting"><h2>Highlights appear when Valve publishes the full match.</h2>
      <div class="hl-basic">${stats.filter(stat => Number.isFinite(stat.value)).map(stat =>
        `<div><span>${stat.label}</span><b>${fmtStat(stat.value)}</b></div>`).join("")}</div></section>`;
  }

  function render(preserveFocus = false) {
    prepareMatch();
    const p = selected(), stats = statsFor(p);
    const active = preserveFocus && view.contains(document.activeElement) ? document.activeElement.dataset : {};
    hideTip();
    const accent = heroColor(p.heroId);
    view.style.setProperty("--hero-accent", accent);
    $("stage").style.setProperty("--summary-underline", accent);
    const backdropKey = p.heroId + "/" + (art[p.heroId]?.bg || "");
    if (!EMBED && renderedBackdrop !== backdropKey) {
      HeroBackdrop.apply(p.heroId, art[p.heroId]);
      renderedBackdrop = backdropKey;
    }
    const key = match.match_id + "/" + p.slot;
    if (enteredMatch !== key) {
      enteredMatch = key;
      enterStart = performance.now();
    }
    const built = rows.length ? buildCards(p, stats) : { cards: [], rows: 0 }, cards = built.cards;
    current = { p, cards, won: Number(match.winning_team) === p.team, stats };
    view.innerHTML = `<div class="hl-layout">${heroColumn(p, stats)}
      ${cards.length ? `<div class="hl-grid" style="grid-template-rows:${["1fr", ".8fr 1.2fr", ".84fr 1.08fr 1.08fr"][built.rows - 1]}">${cards.map(cardHtml).join("")}</div>` : basicStats(stats)}
      ${EMBED ? "" : '<footer class="hl-footer">Unofficial fan project. Not affiliated with or endorsed by Valve. Deadlock art and fonts belong to Valve.</footer>'}</div>`;
    animateIn();
    if (active.summaryFocus) view.querySelector(`[data-summary-focus="${CSS.escape(active.summaryFocus)}"]`)?.focus({ preventScroll: true });
    else if (active.hlCard) view.querySelector(`[data-hl-card="${CSS.escape(active.hlCard)}"]`)?.focus({ preventScroll: true });
    else if (active.summaryScore) view.querySelector(`.hl-dot[data-summary-score="${CSS.escape(active.summaryScore)}"]`)?.focus({ preventScroll: true });
  }

  // Entrance: the column and cards rise in one after another; on the website numbers count up and lines draw too.
  // A re-render inside the entrance window (names or art arriving) resumes the same animations where they were.
  function animateIn() {
    const elapsed = performance.now() - enterStart;
    if (elapsed > ENTER_MS || !motion() || !view.animate) return;
    const at = delay => ({ delay: delay - elapsed, fill: "backwards" });
    // One short rise for the column and the cards; numbers and charts are final from the first frame.
    const rise = (el, delay) => el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 150, easing: "ease-out", ...at(delay) });
    const hero = view.querySelector(".hl-hero");
    if (hero) rise(hero, 0);
    view.querySelectorAll(".hl-card").forEach(card => rise(card, 0));
  }

  // ---------- tooltips ----------
  const targetFor = target => target.closest?.("[data-summary-tip], [data-summary-score]");
  function hideTip() {
    clearTimeout(tipTimer);
    shownTip?.removeAttribute("aria-describedby");
    shownTip = null;
    tooltip.hidden = true;
  }

  function showTip(anchor) {
    clearTimeout(tipTimer);
    if (!anchor || shownTip === anchor) return;
    hideTip();
    const { summaryTip, summaryScore } = anchor.dataset;
    if (summaryScore) tooltip.innerHTML = scoreWhy(rows.find(r => r.p.slot === Number(summaryScore)));
    else tooltip.textContent = summaryTip;
    tooltip.hidden = false;
    shownTip = anchor;
    anchor.setAttribute("aria-describedby", tooltip.id);
    const stage = $("stage"), box = stage.getBoundingClientRect(), bounds = anchor.getBoundingClientRect();
    const scale = box.width / stage.offsetWidth;
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    const x = Math.max(10, Math.min(stage.offsetWidth - width - 10, (bounds.left - box.left) / scale));
    const bottom = (bounds.bottom - box.top) / scale;
    const y = bottom + height + 10 <= stage.offsetHeight ? bottom + 8 : Math.max(4, (bounds.top - box.top) / scale - height - 8);
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  }

  function releaseTip() {
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      if (shownTip?.matches(":focus")) return;
      if (targetFor(document.activeElement)) showTip(targetFor(document.activeElement));
      else hideTip();
    }, 140);
  }

  view.addEventListener("pointerover", event => {
    const anchor = targetFor(event.target);
    if (anchor) showTip(anchor);
  });
  view.addEventListener("pointerout", event => {
    if (shownTip?.contains(event.target) && !shownTip.contains(event.relatedTarget)) releaseTip();
  });
  view.addEventListener("focusin", event => showTip(targetFor(event.target)));
  view.addEventListener("focusout", event => {
    if (shownTip?.contains(event.target) && !shownTip.matches(":hover") && !tooltip.matches(":hover")) hideTip();
  });
  tooltip.addEventListener("pointerenter", () => clearTimeout(tipTimer));
  tooltip.addEventListener("pointerleave", releaseTip);
  view.addEventListener("error", event => {
    const image = event.target, fallback = image.dataset?.summaryArtFallback;
    if (fallback && image.getAttribute("src") !== fallback) image.src = fallback;
    else if (fallback || image.matches?.(".hl-coin img")) image.hidden = true;
  }, true);

  // ---------- actions ----------
  // The shared link names the match and the picked slot only. No account ID goes into it.
  function matchLink() {
    const href = new URL(location.pathname, location.origin);
    href.searchParams.set("match", match.match_id);
    href.searchParams.set("tab", "summary");
    href.searchParams.set("pick", selected().slot);
    const source = params.get("src");
    if (String(match.match_id) === params.get("match") && /^test\/[\w-]+\.json$/.test(source || "")) href.searchParams.set("src", source);
    return href.href;
  }

  async function copyLink() {
    const status = view.querySelector(".summary-copy-status");
    const href = matchLink();
    try {
      await navigator.clipboard.writeText(href);
      status.textContent = "Link copied";
      setTimeout(() => { if (status.isConnected) status.textContent = ""; }, 2400);
    } catch (_) {
      status.innerHTML = '<label>Match link <input readonly></label>';
      const field = status.querySelector("input");
      field.value = href;
      field.focus();
      field.select();
    }
  }

  function go(where) {
    hideTip();
    const p = selected();
    if (where === "mvp") {
      state.mvpPick = p.slot;
      state.requestedTab = state.tab = "mvp";
    } else if (where === "matchups") {
      const rival = current?.cards.find(card => card.id === "rival")?.rival;
      state.mvpPick = p.slot;
      state.muPair = rival ? [p.slot, rival.slot] : null;
      state.requestedTab = state.tab = "matchups";
    } else {
      openGraph(where);
      state.mode = "value";
      if (where === "lanes") state.laneOf = laneName(p);
      else if (where !== "souls_lead") setSel(new Set([p.slot]));
      state.requestedTab = state.tab = "graphs";
    }
    renderAll();
    document.querySelector(`[data-tab="${state.tab}"]`)?.focus();
  }

  view.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const { summarySlot, summaryCompare, hlGo } = button.dataset;
    const p = selected();
    if (hlGo) go(hlGo);
    else if (summarySlot != null) select(Number(summarySlot));
    else if (summaryCompare != null && !state.awaitingValve) {
      openGraph("souls");
      state.mode = "value";
      setSel(new Set([p.slot, Number(summaryCompare)]));
      state.requestedTab = state.tab = "graphs";
      renderAll();
      document.querySelector('[data-tab="graphs"]').focus();
    } else if (button.hasAttribute("data-summary-copy")) copyLink();
    else if (button.hasAttribute("data-hl-share")) window.ShareCard.open(shareData(), button);
  });

  function shareData() {
    const { p, cards, won, stats } = current;
    const r = rowOf(p);
    return {
      link: matchLink(), won, team: TEAMS[p.team], enemy: TEAMS[1 - p.team], spark: leadSeries(p.team), dur: match.duration_s,
      username: name(p), hero: p.hero, heroId: p.heroId, card: p.card || p.img, art: art[p.heroId]?.[won ? "gloat" : "crit"] || "",
      rank: rankOf(p.badge), kda: stats.slice(0, 3).map(s => s.value ?? 0), souls: stats[5].value,
      duration: fmtTime(match.duration_s), date: match.start_time ? DAY.format(new Date(match.start_time * 1000)) : "",
      lane: LANES_BY_COLOR[p.lane] || "", place: r?.place, players: rows.length, mvp: p.mvp,
      lines: shareLines(cards), accent: heroColor(p.heroId),
    };
  }

  function dismissTip() {
    if (window.ShareCard?.close()) return true;
    if (!shownTip) return false;
    hideTip();
    return true;
  }

  return { selected, select, render, name, hideTip, dismissTip };
})();
