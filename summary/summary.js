"use strict";

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
  const lookups = new Map();
  const NEGATIVE_TAGS_KEY = "postmortem.summary.hideNegativeTags";
  let hideNegative = false;
  try { hideNegative = localStorage.getItem(NEGATIVE_TAGS_KEY) === "1"; } catch (_) { /* storage may be unavailable */ }
  let names = new Map(), art = {}, match, rows, deaths, fights, fightByDeath, activeGraph, shownTip, percentiles;
  let enteredMatch, renderedBackdrop, tipTimer;

  const name = p => names.get(Number(p.raw.account_id)) || p.hero;
  const fullName = p => name(p) === p.hero ? p.hero : `${name(p)} on ${p.hero}`;
  const label = (word, tip) => `<span class="summary-name" title="${esc(tip)}">${esc(word)}</span>`;
  const explain = text => `tabindex="0" data-summary-tip="${esc(text)}"`;
  const portraitOf = (p, cls = "") => `<span class="summary-portrait ${cls}" style="--team-coin:${TEAMS[p.team].coin}"><img src="${p.img}" alt=""></span>`;
  const valveBadge = p => p.mvp ? `<span class="badge${p.mvp > 1 ? " key" : ""}">${p.mvp === 1 ? "MVP" : "KEY"}</span>` : "";
  const lobbyBest = '<span class="summary-best-chip">Lobby best</span>';
  const rowOf = p => rows.find(row => row.p === p);
  const actualAverage = p => window.HERO_TABLE.heroes[p.heroId];

  function selected() {
    return state.players.find(p => p.slot === state.summaryPick) || state.me ||
      state.players.find(p => p.team === state.leftTeam) || state.players[0];
  }

  function select(slot) {
    if (slot !== selected().slot) state.summaryStat = null;
    state.summaryPick = slot;
    renderAll();
  }

  function refresh(current, redrawPortraits = false) {
    if (state.match !== current || state.tab !== "summary" || view.hidden) return;
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
    rows = valveRows();
    deaths = deathEvents();
    fights = SummaryFights.groupFights(deaths);
    fightByDeath = new Map(fights.flatMap(fight => fight.deaths.map(event => [event, fight])));

    names = new Map();
    const current = match;
    const ids = [...new Set(state.players.map(p => Number(p.raw.account_id)).filter(id => Number.isInteger(id) && id > 0))];
    if (ids.length) {
      const key = ids.slice().sort((a, b) => a - b).join(",");
      if (!lookups.has(key)) {
        const request = PlayerAssets.steamProfiles(ids, url => getJson(url).then(result => result.ok ? result.body : null))
          .catch(() => null);
        lookups.set(key, request);
      }
      lookups.get(key).then(profiles => {
        if (!Array.isArray(profiles) || state.match !== current || match !== current) return;
        names = new Map(profiles.filter(profile => ids.includes(Number(profile.account_id)) &&
          typeof profile.personaname === "string" && profile.personaname.trim())
          .map(profile => [Number(profile.account_id), profile.personaname]));
        if (names.size) refresh(current, true);
      });
    }
    percentiles ||= SummaryPercentiles.load();
    percentiles.then(() => refresh(current));
    PlayerAssets.heroArt().then(images => {
      art = images;
      if (Object.keys(art).length) refresh(current);
    });
  }

  function bucket({ better, worse }) {
    if (better >= 99) return ["Top 1%", "up"];
    if (better >= 95) return ["Top 5%", "up"];
    if (better >= 90) return ["Top 10%", "up"];
    if (better > 75) return ["Top 25%", "up"];
    if (worse >= 95) return ["Bottom 5%", "down"];
    if (worse >= 90) return ["Bottom 10%", "down"];
    if (worse > 75) return ["Bottom 25%", "down"];
    return ["Typical", "even"];
  }

  const cue = { up: "▲", down: "▼", even: "≈" };
  const finalValues = p => {
    const raw = p.raw, snap = p.stats[p.stats.length - 1];
    return [raw.kills || 0, raw.deaths || 0, raw.assists || 0, STATS[3].read(snap), snap.boss_damage || 0, p.souls];
  };

  function statsFor(p) {
    const values = finalValues(p), lobby = state.players.map(finalValues), average = actualAverage(p);
    return STATS.map((stat, index) => {
      const value = values[index];
      const bounds = SummaryPercentiles.bounds(p.heroId, stat.key, value);
      const percentile = SummaryPercentiles.pct(p.heroId, stat.key, value);
      const place = 1 + lobby.filter(other => stat.low ? other[index] < value : other[index] > value).length;
      const avg = average?.mean[stat.index], sd = average?.sd[stat.index];
      const z = sd ? (value - avg) / sd * (stat.low ? -1 : 1) : 0;
      return { ...stat, value, bounds, percentile, place, size: lobby.length, avg, z };
    });
  }

  function rankingWhy(stat) {
    const value = stat.bounds ? "" : `${num(stat.value)} ${stat.label.toLowerCase()}. `;
    return `${value}${ordinal(stat.place)} of ${stat.size} in the lobby, ${stat.low ? "fewest first" : "highest first"}. Equal values share a place.`;
  }

  function proof(p, stat) {
    if (!stat.percentile) return "";
    const sample = SummaryPercentiles.sample();
    const dates = `${DAY.format(new Date(sample.window_start_utc))} to ${DAY.format(new Date(sample.window_end_utc))}`;
    const comparison = stat.bounds.better
      ? `Better than ${stat.bounds.better}% of ${num(stat.percentile.n)} ranked ${p.hero} games, ${dates}.`
      : `Below or tied with the lowest measured performance in ${num(stat.percentile.n)} ranked ${p.hero} games, ${dates}.`;
    return `${num(stat.value)} ${stat.label.toLowerCase()}. A typical ${p.hero} gets ${num(stat.percentile.p50)} (p50). ${comparison}`;
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

  function matchTitle() {
    const win = Number(match.winning_team), duration = match.duration_s, winner = TEAMS[win].name;
    const times = state.players[0].stats.map(s => s.time_stamp_s);
    let worst = 0, worstTime = 0, biggest = 0;
    for (const time of times) {
      const snapshots = state.players.map(p => snapAt(p, time));
      if (snapshots.some(s => s?.time_stamp_s !== time || !Number.isFinite(s.net_worth))) continue;
      const lead = snapshots.reduce((total, s, i) => total + (state.players[i].team === win ? s.net_worth : -s.net_worth), 0);
      if (lead < worst) { worst = lead; worstTime = time; }
      biggest = Math.max(biggest, Math.abs(lead));
    }
    const end = state.players.reduce((byTeam, p) => { byTeam[p.team] += p.souls; return byTeam; }, [0, 0]);
    const gap = end[win] - end[1 - win];
    if (worst <= -6000) return ["Comeback", `${winner} won in ${fmtTime(duration)} after trailing by ${fmtStat(-worst)} souls at ${fmtTime(worstTime)}.`, "The winning team trailed by at least 6,000 souls at a recorded snapshot."];
    if (worst === 0 && gap / Math.max(1, end[0] + end[1]) >= 0.12 && duration < 1800) {
      return ["Stomp", `${winner} closed it in ${fmtTime(duration)}, ${fmtStat(gap)} souls ahead.`, "The winners never trailed at a snapshot, finished with at least 12% of the lobby's souls as a lead, and won in under 30 minutes."];
    }
    if (duration >= 2400) return ["Marathon", `${winner} outlasted ${TEAMS[1 - win].name} over ${fmtTime(duration)}.`, "The match lasted at least 40 minutes and did not meet the comeback rule."];
    return ["Coin Flip", `${winner} took it in ${fmtTime(duration)}. The largest recorded lead was ${fmtStat(Math.max(biggest, Math.abs(gap)))} souls.`, "The match met none of the comeback, stomp, or marathon rules."];
  }

  function teamTags() {
    const total = [0, 1].map(team => state.players.filter(p => p.team === team).map(finalValues)
      .reduce(([kills, damage], values) => [kills + values[0], damage + values[4]], [0, 0]));
    const win = Number(match.winning_team);
    return [0, 1].map(index => {
      const a = total[0][index], b = total[1][index], team = a === b ? null : a > b ? 0 : 1;
      const stat = index === 0 ? "kills" : "objective damage";
      const text = team === null ? (index ? "Even objective damage" : "Even kills")
        : index ? "Objective focused" : team === win ? "Out-fought" : "Led in kills, lost the match";
      const why = `${TEAMS[0].name} had ${num(a)} ${stat}, ${TEAMS[1].name} had ${num(b)}.`;
      return `<span class="summary-tag" ${explain(why)}>${team === null ? "≈" : `<i style="--team:${TEAMS[team].c}"></i>`}${text}</span>`;
    }).join("");
  }

  function matchStrip() {
    const [title, subtitle, rule] = matchTitle();
    const viewer = state.me && rowOf(state.me);
    return `<header class="summary-match">
      <div class="summary-match-copy" ${explain(rule)}><h1>${title}</h1><span>${esc(subtitle)}</span></div>
      <div class="summary-team-tags">${teamTags()}</div>
      <div class="summary-leaders"><span class="summary-label">MVP</span>
        ${rows.slice(0, 3).map(r => `<button type="button" class="summary-leader" data-summary-slot="${r.p.slot}" data-summary-score="${r.p.slot}" aria-label="${esc(fullName(r.p))}, ${ordinal(r.place)}, ${r.score.toFixed(1)} points">
          ${portraitOf(r.p)}<span>${label(`${r.place}. ${name(r.p)}`, fullName(r.p))}<small>${r.score.toFixed(1)} pts ${valveBadge(r.p)}</small></span></button>`).join("")}
        ${viewer?.place > 3 ? `<span class="summary-your-place" tabindex="0" data-summary-score="${viewer.p.slot}">You: ${ordinal(viewer.place)}</span>` : ""}
      </div></header>`;
  }

  function gap(r) {
    const other = rows[r.place === 1 ? 1 : r.place - 2];
    if (!other) return "";
    const difference = Math.abs(other.score - r.score).toFixed(1);
    const direction = r.place === 1 ? "ahead of" : "behind";
    const text = `${difference} pts ${direction} ${name(other.p)} (${ordinal(other.place)})`;
    return `<span class="summary-name summary-gap" ${explain(`${text}. Estimated Valve scores before display rounding: ${r.score.toFixed(2)} and ${other.score.toFixed(2)}.`)}>${esc(text)}</span>`;
  }


  function verdict(p, statCards) {
    if (!actualAverage(p)) return ["Hero comparison unavailable.", "There is no hero average for this player."];
    const r = rowOf(p);
    const graded = statCards.slice().sort((a, b) => b.z - a.z);
    const best = graded[0], worst = graded[graded.length - 1];
    const win = Number(match.winning_team) === p.team;
    const teamLead = rows.find(row => row.p.team === p.team) === r;
    const describe = s => `${num(s.value)} ${s.label.toLowerCase()}`;
    const comparison = s => `${describe(s)} vs ${num(s.avg)} for an average ${p.hero}.`;
    if (!win && teamLead && r.score > 1.5) {
      const bestInLobby = best.place === 1 ? ", best in the lobby" : "";
      return [`Led your team in a loss, with ${describe(best)}${bestInLobby}.`,
        `Picked because: top Valve score on the losing team, above 1.5 pts. ${comparison(best)}${best.place === 1 ? " Best in the lobby for that stat." : ""}`];
    }
    if (win && p.mvp === 1) return [`Valve named you MVP. ${comparison(best)}`,
      `Picked because: your team won and Valve awarded you MVP. ${comparison(best)} This was your strongest stat against the hero average.`];
    if (win && r.score < -1.5) return [`Your team won despite a quiet game. ${comparison(worst)}`,
      `Picked because: your team won and your Valve score was below −1.5 pts. ${comparison(worst)}`];
    if (r.score < -2) return [`Rough game. ${comparison(worst)}`,
      `Picked because: your Valve score was below −2 pts. ${comparison(worst)}`];
    return [`${r.score >= 0 ? "Solid" : "Quiet"} game. Strongest in ${best.label.toLowerCase()}, weakest in ${worst.label.toLowerCase()}.`,
      `Picked because: ${comparison(best)} ${comparison(worst)} These were your largest differences from the hero average after accounting for the usual spread of each stat.`];
  }

  function tagsFor(p, stats, lane) {
    if (!actualAverage(p)) return "";
    const [kills, deaths, assists, damage, objective, souls] = stats;
    const tags = [];
    const graded = (s, threshold, word, tone) => {
      if (tone === "down" ? s.z > -threshold : s.z < threshold) return;
      const higher = (tone === "up") !== !!s.low;
      const rule = `${s.label} at least ${threshold} standard deviations ${higher ? "above" : "below"} the hero average.`;
      tags.push({ word, tone, strength: Math.abs(s.z), why: `${rule} ${num(s.value)} in this match vs ${num(s.avg)} average for ${p.hero}.` });
    };
    graded(kills, 1.5, kills.place === 1 ? "Top fragger" : "Killing spree", "up");
    graded(assists, 1.2, "Team player", "up");
    graded(deaths, 1, "Hard to kill", "up");
    graded(deaths, 1.3, "Respawn regular", "down");
    graded(damage, 1.2, "Damage dealer", "up");
    graded(damage, 1.3, "Low damage", "down");
    graded(objective, 1.2, "Tower taker", "up");
    graded(souls, 1.2, "Soul hoarder", "up");
    if (kills.z >= 1 && assists.z <= -0.5) tags.push({ word: "Lone wolf", tone: "even", strength: 1.2,
      why: `Kills at least 1 standard deviation above average and assists at least 0.5 below. ${num(kills.value)} kills and ${num(assists.value)} assists, vs ${num(kills.avg)} and ${num(assists.avg)} for ${p.hero}.` });
    const phase = valveCache().phase.find(entry => entry.slot === p.slot);
    if (phase?.late_valve != null && Math.abs(phase.late_valve - phase.early_valve) >= 3) {
      tags.push({ word: phase.late_valve > phase.early_valve ? "Late bloomer" : "Fast starter", tone: "even", strength: 1,
        why: `The 15:00 grades differ by at least 3 points. Before ${signed(phase.early_valve, 1)}, after ${signed(phase.late_valve, 1)} compared with the hero's norm for each period.` });
    }
    if (lane?.gap >= 0.2) tags.push({ word: "Lane bully", tone: "up", strength: 1.1,
      why: `At least 20% ahead in lane souls at 9:00, measured against the larger total. ${num(lane.friendlySouls)} vs ${num(lane.enemySouls)}.` });
    const opened = fights.filter(fight => fight.deaths[0].killer === p).length;
    if (opened >= 3) tags.push({ word: "Fight starter", tone: "up", strength: 1,
      why: `Got the first kill in at least three fights. Opened ${opened} of ${fights.length} fights. ${SummaryTimeline.fightRule}` });
    const allowSetting = hideNegative || tags.some(tag => tag.tone === "down");
    const visible = tags.filter(tag => !hideNegative || tag.tone !== "down")
      .sort((a, b) => Number(b.tone === "down") - Number(a.tone === "down") || b.strength - a.strength);
    const settings = allowSetting ? `<details class="summary-tag-options"><summary class="summary-tag" title="Tag options" data-summary-focus="tag-options" aria-label="Tag options">⚙</summary>
      <label><input type="checkbox" data-summary-negative${hideNegative ? " checked" : ""}> Hide negative tags</label></details>` : "";
    return visible.length || settings ? `<div class="summary-tags">${visible.slice(0, 4).map(tag =>
      `<span class="summary-tag" ${explain(tag.why)}><b class="summary-${tag.tone}">${cue[tag.tone]}</b>${tag.word}</span>`).join("")}
      ${visible.length > 4 ? `<span class="summary-tag" ${explain(visible.slice(4).map(tag => `${tag.word}. ${tag.why}`).join(" "))}>+${visible.length - 4}</span>` : ""}${settings}</div>` : "";
  }

  function heroArt(r) {
    const p = r.p, fallback = p.card || p.img;
    const mood = r.place <= 3 ? "gloat" : r.place > rows.length - 3 ? "crit" : "card";
    const source = art[p.heroId]?.[mood] || fallback;
    return `<img src="${esc(source)}" data-summary-art-fallback="${esc(fallback)}" alt="">`;
  }

  function itemGrid(p) {
    const order = ["w", "v", "s"];
    const items = GraphMarkers.itemRecords(p).filter(item => !item.sold)
      .sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot) || a.t - b.t).slice(0, 12);
    const slots = items.map(item => `<span class="summary-item" data-category="${esc(item.slot)}" ${explain(`${item.name}. Bought at ${fmtTime(item.t)}.`)}>
      <img src="assets/items/${esc(item.icon)}.webp" alt="${esc(item.name)}"></span>`);
    while (slots.length < 12) slots.push('<span class="summary-item empty-slot" aria-hidden="true"></span>');
    return `<section class="summary-build"><h3>Final build</h3><div class="summary-items">${slots.join("")}</div></section>`;
  }

  function accolades(p) {
    const defs = window.ACCOLADES || {}, best = new Map();
    for (const q of state.players) for (const a of q.raw.accolades || []) {
      best.set(a.accolade_id, Math.max(best.get(a.accolade_id) || 0, Number(a.accolade_stat_value) || 0));
    }
    const awards = (p.raw.accolades || []).filter(a => defs[a.accolade_id] && a.accolade_threshold_achieved === 2)
      .map(a => {
        const value = Number(a.accolade_stat_value) || 0;
        return { def: defs[a.accolade_id], value, best: value === best.get(a.accolade_id) };
      }).sort((x, y) => Number(y.best) - Number(x.best)).slice(0, 4);
    if (!awards.length) return "";
    return `<section class="summary-accolades"><h3>Valve accolades</h3>${awards.map(a => {
      const why = `${a.def[a.value === 1 ? 1 : 2].replace("{v}", num(a.value))}. Valve awarded three stars.${a.best ? " Highest recorded value in this lobby." : ""}`;
      return `<div ${explain(why)}><span class="summary-stars" aria-label="Three stars">◆◆◆</span><b>${esc(a.def[0])}</b>${a.best ? lobbyBest : ""}</div>`;
    }).join("")}</section>`;
  }

  function heroCard(p, stats, lane) {
    const r = rowOf(p), won = Number(match.winning_team) === p.team, team = TEAMS[p.team];
    const [word, why] = verdict(p, stats);
    const username = name(p);
    const showHero = username !== p.hero;
    return `<section class="summary-hero summary-panel" style="--team:${team.c}" aria-label="Player overview">
      <div class="summary-hero-head">
        <div class="summary-art">${heroArt(r)}<span class="summary-result summary-${won ? "up" : "down"}">${won ? "+ Victory" : "− Defeat"}</span></div>
        <div class="summary-who">
          <div class="summary-player">${showHero ? "" : portraitOf(p)}<h2 class="summary-name" title="${esc(username)}">${esc(username)}</h2>${p === state.me ? '<span class="summary-you">You</span>' : ""}</div>
          ${showHero ? `<div class="summary-hero-name">${portraitOf(p)}${esc(p.hero)}</div>` : ""}
          <div class="summary-meta"><span>${team.name}</span> · ${LANES_BY_COLOR[p.lane] ? LANES_BY_COLOR[p.lane] + " lane" : "No lane"} · ${fmtTime(match.duration_s)}</div>
          <div class="summary-hero-rank">${rankHtml(p.badge) || '<span class="rank none">Unranked</span>'}${valveBadge(p)}</div>
          <div class="summary-place" tabindex="0" data-summary-focus="place" data-summary-score="${p.slot}"><b>${ordinal(r.place)}</b><span>of ${rows.length} · ${r.score.toFixed(1)} pts</span></div>
          ${gap(r)}
        </div>
      </div>
      <div class="summary-kda" aria-label="Kills, deaths, assists and souls"><b>${stats[0].value} <i>/</i> ${stats[1].value} <i>/</i> ${stats[2].value}</b><span>${fmtStat(p.souls)} souls</span></div>
      <p class="summary-verdict" ${explain(why)}>${esc(word)}</p>
      ${tagsFor(p, stats, lane)}
      ${itemGrid(p)}
      ${accolades(p)}
      <div class="summary-actions">
        <details class="summary-compare"><summary class="graphOptionButton" data-summary-focus="compare">Compare with…</summary>
          <div class="summary-compare-menu" aria-label="Choose a player to compare on the Graphs tab">${state.players.filter(q => q !== p).map(q =>
            `<button type="button" data-summary-compare="${q.slot}">${portraitOf(q)}${label(name(q), fullName(q))}</button>`).join("")}</div>
        </details>
        <button class="graphOptionButton" type="button" data-summary-copy data-summary-focus="copy">Copy link</button>
        <span class="summary-copy-status" role="status"></span>
      </div></section>`;
  }

  function statCards(p, stats) {
    const cards = stats.map(stat => {
      const [word, tone] = stat.bounds ? bucket(stat.bounds) : [];
      const why = [stat.bounds && proof(p, stat), rankingWhy(stat)].filter(Boolean).join(" ");
      return `<button type="button" class="summary-stat summary-panel${stat.place === 1 ? " is-best" : ""}"
        data-summary-stat="${stat.key}" data-summary-focus="${stat.key}" data-summary-tip="${esc(why)}">
        <span class="summary-label">${stat.label}</span><b>${fmtStat(stat.value)}</b>
        ${word ? `<span class="summary-bucket summary-${tone}">${cue[tone]} ${word}</span>` : ""}
        <span class="summary-stat-place">${stat.place === 1 ? lobbyBest : `${ordinal(stat.place)} of ${stat.size}`}</span></button>`;
    }).join("");
    return `<div class="summary-stat-grid" aria-label="Match stats">${cards}</div>`;
  }

  function laneInfo(p) {
    if (!LANES_BY_COLOR[p.lane]) return null;
    const byLane = state.players.filter(q => q.lane === p.lane);
    const mates = byLane.filter(q => q.team === p.team);
    const opponents = byLane.filter(q => q.team !== p.team);
    if (!opponents.length) return null;
    const snapshots = new Map(byLane.map(q => [q, window.PM_SCORE.snapAt(q.raw, 540)]));
    if ([...snapshots.values()].some(snap => !snap)) return { mates, opponents };
    const soulSum = players => players.reduce((sum, q) => sum + (snapshots.get(q).net_worth || 0), 0);
    const friendlySouls = soulSum(mates), enemySouls = soulSum(opponents);
    const gap = (friendlySouls - enemySouls) / Math.max(1, friendlySouls, enemySouls);
    return { mates, opponents, snapshots, friendlySouls, enemySouls, gap };
  }

  function lanePanel(p, lane) {
    const faces = team => team.map(q => `<button class="summary-lane-face" type="button" data-summary-slot="${q.slot}" title="${esc(fullName(q))}" aria-label="${esc(fullName(q))}">${portraitOf(q)}</button>`).join("");
    const side = (team, souls) => `<div class="summary-lane-squad"><div>${faces(team)}</div>${souls != null ? `<b>${num(souls)}</b>` : ""}</div>`;
    const heading = '<div class="summary-panel-head"><h2>Lane</h2>' +
      (lane ? `<span>${LANES_BY_COLOR[p.lane]} lane · 9:00</span>` : "") + '</div>';
    if (!lane) return `<section class="summary-panel summary-side-panel">${heading}<p>No lane matchup recorded.</p></section>`;
    const lineup = `<div class="summary-lane-lineup">${side(lane.mates, lane.friendlySouls)}<span>vs</span>${side(lane.opponents, lane.enemySouls)}</div>`;
    if (!lane.snapshots) return `<section class="summary-panel summary-side-panel">${heading}${lineup}<p>No lane snapshot at 9:00.</p></section>`;
    const fields = [["Souls", "net_worth"], ["Last hits", "creep_kills"], ["Denies", "denies"], ["Hero damage", "player_damage"], ["Kills", "kills"], ["Objective damage", "boss_damage"]];
    const cells = fields.map(([word, key]) => {
      const own = lane.snapshots.get(p)[key] || 0;
      const average = lane.opponents.reduce((sum, q) => sum + (lane.snapshots.get(q)[key] || 0), 0) / lane.opponents.length;
      const tone = own > average ? "up" : own < average ? "down" : "even";
      const why = `${word} at 9:00. ${num(own)} for ${name(p)}, ${num(average)} on average across ${lane.opponents.length} lane ${lane.opponents.length === 1 ? "opponent" : "opponents"}.`;
      return `<div class="summary-lane-cell" ${explain(why)}><span>${word}</span><b>${num(own)}</b><small class="summary-${tone}">${cue[tone]} vs ${num(average)}</small></div>`;
    }).join("");
    const tone = Math.abs(lane.gap) <= 0.1 ? "even" : lane.gap > 0 ? "up" : "down";
    const result = { even: "Even lane", up: "Ahead in lane", down: "Behind in lane" }[tone];
    const why = `Even lane means team souls differ by at most 10% of the larger total at 9:00. This lane's gap was ${num(Math.abs(lane.gap) * 100)}%.`;
    return `<section class="summary-panel summary-side-panel summary-lane-panel">${heading}${lineup}
      <span class="summary-tag" ${explain(why)}><b class="summary-${tone}">${cue[tone]}</b>${result}</span>
      <h3 class="summary-lane-comparison">You at 9:00 vs your lane opponents' average</h3>
      <div class="summary-lane-grid">${cells}</div></section>`;
  }


  function rivals(p) {
    const byOpponent = new Map();
    for (const event of deaths) {
      const q = event.killer === p ? event.victim : event.victim === p ? event.killer : null;
      if (!q || q.team === p.team) continue;
      const entry = byOpponent.get(q) || { p: q, you: 0, them: 0, fights: new Set() };
      if (event.killer === p) entry.you++;
      else entry.them++;
      const fight = fightByDeath.get(event);
      if (fight) entry.fights.add(fight);
      byOpponent.set(q, entry);
    }
    const entries = [...byOpponent.values()];
    return [
      entries.filter(entry => entry.them).sort((a, b) => b.them - a.them || a.you - b.you || a.p.slot - b.p.slot)[0],
      entries.filter(entry => entry.you).sort((a, b) => b.you - a.you || a.them - b.them || a.p.slot - b.p.slot)[0],
    ];
  }

  function foughtPanel(p) {
    const [nemesis, target] = rivals(p);
    const tile = (label, entry, nemesis) => {
      const rule = nemesis ? "Most kills on you, then fewest kills by you to break ties." : "Most kills by you, then fewest kills on you to break ties.";
      if (!entry) return `<div class="summary-rival" ${explain(rule)}><h3>${label}</h3><p>${nemesis ? "No deaths to enemy heroes" : "No kills on enemy heroes"}</p></div>`;
      const { p: q, you, them, fights } = entry;
      const description = `${name(p)} killed ${name(q)} ${you} times. ${name(q)} killed ${name(p)} ${them} times.`;
      const why = `${rule} ${description} ${fights.size} grouped ${fights.size === 1 ? "fight included" : "fights included"} a kill between you. ${SummaryTimeline.fightRule}`;
      return `<button type="button" class="summary-rival" data-summary-slot="${q.slot}" data-summary-tip="${esc(why)}">
        <span class="summary-label">${label}</span><span class="summary-rival-score">${portraitOf(q)}<b>${you}<i>–</i>${them}</b></span>
        ${labelName(q)}<small>${nemesis ? `They killed you ${them}×` : `You killed them ${you}×`}</small></button>`;
    };
    const labelName = q => label(name(q), fullName(q));
    const mu = muParse(match);
    const damage = (from, to) => Object.values(mu.dmg[from.slot]?.[to.slot] || {})
      .reduce((sum, array) => sum + muAt(array, mu.times.length - 1, mu.times.length), 0);
    const enemies = state.players.filter(q => q.team !== p.team);
    const damageRow = (word, outgoing) => {
      const top = enemies.map(q => ({ q, value: outgoing ? damage(p, q) : damage(q, p) })).sort((a, b) => b.value - a.value)[0];
      if (!top?.value) return `<div class="summary-damage-row"><span>${word}</span><span>None recorded</span></div>`;
      const why = `${num(top.value)} hero damage ${outgoing ? "dealt to" : "received from"} ${name(top.q)}, your highest against any one opponent in the whole match.`;
      return `<div class="summary-damage-row" ${explain(why)}><span>${word}</span><span>${portraitOf(top.q)}${labelName(top.q)}</span><b>${fmtStat(top.value)}</b></div>`;
    };
    return `<section class="summary-panel summary-side-panel summary-fought-panel">
      <div class="summary-panel-head"><h2>Who you fought</h2><span>Kills · you vs them</span></div>
      <div class="summary-rivals">${tile("Nemesis", nemesis, true)}${tile("Favorite target", target, false)}</div>
      ${mu ? damageRow("Hit hardest", true) + damageRow("Hurt most by", false) : "<p>Hero damage by opponent unavailable.</p>"}</section>`;
  }

  function highlightStat(stats) {
    return stats.filter(stat => stat.percentile).sort((a, b) => b.percentile.pct - a.percentile.pct ||
      b.bounds.better - a.bounds.better || a.place - b.place)[0];
  }

  function renderGraph(p, stats) {
    const standout = highlightStat(stats);
    const stat = stats.find(s => s.key === state.summaryStat) || standout || stats[0];
    const [word, tone] = stat.bounds ? bucket(stat.bounds) : [];
    const isStandout = stat === standout;
    const title = `${isStandout ? "Your standout: " : ""}${stat.label}${word ? `. <span class="summary-${tone}">${cue[tone]} ${word}${tone === "even" ? " for" : " of"} ${esc(p.hero)}${tone === "even" ? "" : " games"}</span>` : ""}`;
    const rule = isStandout ? `Highest estimated percentile of the six stats compared with other ${p.hero} games. Ties use the stricter percentile bound, then lobby place.`
      : `${stat.label} at the recorded stats snapshots.`;
    activeGraph = { p, stat, isStandout, rule };
    view.querySelectorAll("[data-summary-stat]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.summaryStat === stat.key));
    });
    view.querySelector(".summary-chart").innerHTML = `
      <div class="summary-chart-head"><h2 tabindex="0" data-summary-focus="graph" data-summary-proof="title">${title}</h2></div>
      ${SummaryTimeline.chart(p, stat, match, deaths, fightByDeath, actualAverage(p))}
      <div class="summary-other"><span class="summary-label">Other stats</span>${stats.filter(s => s !== stat).map(s =>
        `<button class="graphOptionButton" type="button" data-summary-graph-stat="${s.key}">${s.short || s.label}</button>`).join("")}</div>`;
  }

  function accentFor(p) {
    const neutral = "#ac9e8b";
    const color = HeroBackdrop.localAccent(p.heroId);
    if (!/^#[0-9a-f]{6}$/i.test(color)) return neutral;
    const [r, g, b] = color.slice(1).match(/../g).map(hex => parseInt(hex, 16));
    const max = Math.max(r, g, b), delta = max - Math.min(r, g, b);
    if (delta < 8) return neutral;
    const hue = ((max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta) * 60 + 360) % 360;
    // Gold (#FFED79) has a hue of about 52 degrees.
    return Math.abs(hue - 52) <= 20 ? neutral : color;
  }

  function render(preserveFocus = false) {
    prepareMatch();
    const p = selected(), stats = statsFor(p), lane = laneInfo(p);
    const focus = preserveFocus && view.contains(document.activeElement) && document.activeElement.dataset.summaryFocus;
    hideTip();
    const accent = accentFor(p);
    view.style.setProperty("--hero-accent", accent);
    $("stage").style.setProperty("--summary-underline", accent);
    const backdropKey = p.heroId + "/" + (art[p.heroId]?.bg || "");
    if (!EMBED && renderedBackdrop !== backdropKey) {
      HeroBackdrop.apply(p.heroId, art[p.heroId], accent);
      renderedBackdrop = backdropKey;
    }
    if (enteredMatch !== match) {
      enteredMatch = match;
      view.classList.add("summary-enter");
    }
    view.innerHTML = `<div class="summary-layout">
      ${matchStrip()}${heroCard(p, stats, lane)}
      <div class="summary-center">${statCards(p, stats)}<section class="summary-panel summary-chart" aria-label="Standout stat chart"></section></div>
      <aside class="summary-side">
        ${lanePanel(p, lane)}${foughtPanel(p)}
        <section class="summary-panel summary-side-panel summary-phase"><h2>Before and after 15:00</h2>${whenHtml(p, true) || "<p>No phase grade available.</p>"}</section>
      </aside></div>`;
    renderGraph(p, stats);
    if (focus) view.querySelector(`[data-summary-focus="${CSS.escape(focus)}"]`)?.focus({ preventScroll: true });
  }

  const targetFor = target => target.closest?.("[data-summary-tip], [data-summary-score], [data-summary-proof]");
  view.addEventListener("animationend", () => view.classList.remove("summary-enter"));
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
    const { summaryTip, summaryScore, summaryProof } = anchor.dataset;
    if (summaryScore) {
      tooltip.innerHTML = scoreWhy(rows.find(r => r.p.slot === Number(summaryScore)));
    } else if (summaryProof) {
      const { p, stat, isStandout, rule } = activeGraph;
      const detail = proof(p, stat);
      const snapshot = summaryProof === "point" ? anchor.getAttribute("aria-label") : "";
      tooltip.innerHTML = `<b class="summary-tip-heading">${esc(snapshot || (isStandout ? "Why this stat stands out" : stat.label))}</b>
        <p>${esc(rule)}</p>${detail ? SummaryTimeline.distribution(stat) + `<p>${esc(detail)}</p>` : ""}`;
    } else {
      tooltip.textContent = summaryTip;
    }
    tooltip.hidden = false;
    shownTip = anchor;
    anchor.setAttribute("aria-describedby", tooltip.id);
    const stage = $("stage"), box = stage.getBoundingClientRect(), bounds = anchor.getBoundingClientRect();
    const scale = box.width / stage.offsetWidth;
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    const anchorX = anchor.closest(".summary-hero") ? (bounds.right - box.left) / scale - width : (bounds.left - box.left) / scale;
    const x = Math.max(10, Math.min(stage.offsetWidth - width - 10, anchorX));
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
    if (shownTip?.contains(event.target) && !shownTip.contains(event.relatedTarget)) {
      releaseTip();
    }
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
    else if (fallback || image.matches?.(".summary-portrait img")) image.hidden = true;
  }, true);

  async function copyLink() {
    const status = view.querySelector(".summary-copy-status");
    const link = new URL(location.pathname, location.origin);
    link.searchParams.set("match", match.match_id);
    link.searchParams.set("tab", "summary");
    link.searchParams.set("pick", selected().slot);
    const source = params.get("src");
    if (String(match.match_id) === params.get("match") && /^test\/[\w-]+\.json$/.test(source || "")) link.searchParams.set("src", source);
    try {
      await navigator.clipboard.writeText(link.href);
      status.textContent = "Link copied";
    } catch (_) {
      status.innerHTML = '<label>Match link <input readonly></label>';
      const field = status.querySelector("input");
      field.value = link.href;
      field.focus();
      field.select();
    }
  }

  view.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const { summarySlot, summaryStat, summaryGraphStat, summaryCompare } = button.dataset;
    const p = selected();
    if (summarySlot != null) {
      select(Number(summarySlot));
      view.querySelector("[data-summary-focus=place]")?.focus({ preventScroll: true });
    } else if (summaryStat || summaryGraphStat) {
      hideTip();
      state.summaryStat = summaryStat || summaryGraphStat;
      renderGraph(p, statsFor(p));
      if (summaryGraphStat) view.querySelector("[data-summary-focus=graph]").focus({ preventScroll: true });
    } else if (summaryCompare != null) {
      openGraph("souls");
      state.mode = "value";
      setSel(new Set([p.slot, Number(summaryCompare)]));
      state.tab = "graphs";
      renderAll();
      document.querySelector('[data-tab="graphs"]').focus();
    } else if (button.hasAttribute("data-summary-copy")) {
      copyLink();
    }
  });

  view.addEventListener("change", event => {
    if (!event.target.matches("[data-summary-negative]")) return;
    hideNegative = event.target.checked;
    try { localStorage.setItem(NEGATIVE_TAGS_KEY, hideNegative ? "1" : "0"); } catch (_) { /* keep the setting for this visit */ }
    render();
    view.querySelector("[data-summary-focus=tag-options]")?.focus({ preventScroll: true });
  });

  function dismissTip() {
    if (!shownTip) return false;
    hideTip();
    return true;
  }

  return { selected, select, render, name, hideTip, dismissTip };
})();

