"use strict";

const SummaryTimeline = (() => {
  const fightRule = "A fight is two or more deaths, each within 30 seconds of the previous death and 3,000 map units of any death in the group.";
  const W = 860, H = 284, left = 60, right = W - 18, top = 14, bottom = 215;
  const round = n => Number(n.toFixed(2));

  function snapshots(player, stat) {
    return player.raw.stats.map(s => [s.time_stamp_s, stat.read(s)])
      .filter(([time, value]) => Number.isFinite(time) && Number.isFinite(value))
      .sort((a, b) => a[0] - b[0]);
  }

  function averageAtTimes(player, stat, points, overall) {
    const norms = window.SNAP_NORMS, hero = norms.heroes[player.heroId];
    const times = norms.times;
    const after15 = norms.late_knots_min;
    const index = stat.index;
    const canUseSnapshots = hero && points.every(([t]) => t >= times[0] && (t - 900) / 60 <= after15[after15.length - 1]);
    if (!canUseSnapshots) return { points: [], flat: overall?.mean[index] };
    const early = times.map(t => hero.early[t].mean[index]);
    const increments = hero.late.mean.map(row => row[index]);
    const interp = window.PM_SCORE.interp;
    const averagePoints = points.map(([t]) => [
      t, t <= 900 ? interp(t, times, early) :
        early[early.length - 1] + interp((t - 900) / 60, [0, ...after15], [0, ...increments]),
    ]);
    return { points: averagePoints };
  }

  function chart(player, stat, match, deaths, fightByDeath, overall) {
    const points = snapshots(player, stat);
    if (!points.length) return '<p class="summary-chart-empty">No snapshots recorded for this stat.</p>';
    const average = averageAtTimes(player, stat, points, overall);
    const duration = Math.max(1, match.duration_s, points[points.length - 1][0]);
    const playerEvents = deaths.filter(event => event.t <= duration && (event.killer === player || event.victim === player));
    const eventCounts = { kills: 0, deaths: 0 };
    for (const event of playerEvents) eventCounts[event.victim === player ? "deaths" : "kills"]++;
    const discrepancies = Object.keys(eventCounts).filter(key =>
      Number.isInteger(player.raw[key]) && eventCounts[key] !== player.raw[key]);
    const eventNote = discrepancies.length ? ` Recorded markers differ from the scoreboard (${discrepancies.map(key =>
      `${eventCounts[key]} recorded / ${player.raw[key]} credited ${key}`).join(", ")}).` : "";
    const involved = [...new Set(playerEvents.map(event => fightByDeath.get(event)).filter(Boolean))];
    const x = t => round(left + (t / duration) * (right - left));
    const highest = Math.max(1, average.flat ?? 0, ...points.map(p => p[1]), ...average.points.map(p => p[1]));
    const ticks = niceTicks(0, highest, 4, stat.index <= 2);
    if (ticks[ticks.length - 1] < highest) ticks.push(2 * ticks[ticks.length - 1] - ticks[ticks.length - 2]);
    const y = value => round(bottom - (value / Math.max(highest, ticks[ticks.length - 1])) * (bottom - top));
    const tickLines = ticks.map(value => `<path class="summary-gridline" d="M${left} ${y(value)}H${right}"/><text x="${left - 10}" y="${y(value)}" text-anchor="end" dominant-baseline="middle">${fmtStat(value)}</text>`);
    const steps = duration < 1800 ? 300 : 600;
    const timeTicks = [];
    for (let t = 0; t < duration - steps * 0.35; t += steps) timeTicks.push(t);
    timeTicks.push(duration);
    const tickLabels = timeTicks.map(t => `<text x="${x(t)}" y="${H - 9}" text-anchor="${t === duration ? "end" : t === 0 ? "start" : "middle"}">${fmtTime(t)}</text>`);
    const polyline = data => data.map(([t, value]) => `${x(t)},${y(value)}`).join(" ");
    const benchmark = average.points.length ? `<polyline class="summary-average" points="${polyline(average.points)}"/>` :
      Number.isFinite(average.flat) ? `<path class="summary-average" d="M${x(0)} ${y(average.flat)}H${x(duration)}"/>` : "";
    const mask = playerEvents.filter(event => event.victim === player && event.duration).map(event =>
      `<rect x="${x(event.t)}" y="0" width="${x(Math.min(duration, event.t + event.duration)) - x(event.t)}" height="${H}" fill="#777"/>`).join("");
    const fightBands = involved.map(fight => {
      const from = x(fight.start), to = x(Math.min(fight.end, duration));
      const tip = `Fight at ${fmtTime(fight.start)}–${fmtTime(fight.end)}, ${fight.deaths.length} deaths. ${fightRule}`;
      return `<rect class="summary-fight-band" x="${from}" y="229" width="${Math.max(2, to - from)}" height="28" rx="2" data-summary-tip="${esc(tip)}"/>`;
    });

    const marks = playerEvents.map(event => {
      const px = x(event.t), kill = event.killer === player && event.victim !== player;
      const tip = `${fmtTime(event.t)}. ${kill ? "Killed " + Summary.name(event.victim) : event.killer ? "Killed by " + Summary.name(event.killer) : "Died"}.${fightByDeath.has(event) ? " During a grouped fight." : ""}`;
      const klass = kill ? "summary-kill" : "summary-death";
      return `<g class="summary-event ${klass}" tabindex="0" aria-label="${esc(tip)}" data-summary-tip="${esc(tip)}">
        <circle cx="${px}" cy="${kill ? 236 : 251}" r="7" fill="transparent" stroke="none"/>
        ${kill ? `<path d="M${px} 231 l4.5 8 h-9z"/>` : `<path d="M${px - 3.5} 247.5 l7 7 m0 -7 l-7 7"/>`}</g>`;
    });

    // Ticks touch the drawn line at exact kill times. Only the circles are measured values.
    const lineKills = playerEvents.filter(event => event.killer === player && event.victim !== player).map(event => {
      const next = points.findIndex(([t]) => t >= event.t);
      if (next < 1) return "";
      const [a, av] = points[next - 1], [b, bv] = points[next];
      const value = a === b ? bv : av + (bv - av) * (event.t - a) / (b - a);
      const px = x(event.t), py = y(value);
      return `<path class="summary-kill-tick" d="M${px} ${py}v-4" aria-hidden="true"/>`;
    });
    const measured = points.map(([time, value], index) => {
      const last = index === points.length - 1;
      const tip = `${fmtTime(time)} snapshot · ${value.toLocaleString("en-US")} ${stat.label.toLowerCase()}`;
      return `<circle class="summary-snapshot${last ? " final" : ""}" cx="${x(time)}" cy="${y(value)}" r="${last ? 5 : 3.8}"
        tabindex="0" aria-label="${esc(tip)}" ${last ? 'data-summary-proof="point"' : `data-summary-tip="${esc(tip)}"`}/>`;
    });
    const averageLegend = average.points.length ? "Hero average at snapshots" : "Final hero average";
    const subtitle = average.points.length ? "Dots are recorded snapshots." :
      Number.isFinite(average.flat) ? "Dots are recorded snapshots. The dashed line is the final hero average." : "Dots are recorded snapshots. Hero average unavailable.";
    return `<div class="summary-chart-key" aria-label="Chart key">
      <span><i class="summary-key-line"></i><span class="summary-name" title="${esc(Summary.name(player))}">${esc(Summary.name(player))}</span></span>
      ${benchmark ? `<span><i class="summary-key-average"></i>${averageLegend}</span>` : ""}
      <span><b class="summary-up">▲</b> Kill</span><span><b class="summary-down">×</b> Death</span>
      ${involved.length ? '<span><i class="summary-key-fight"></i> Fight</span>' : ""}</div>
      <svg class="summary-plot" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="group" aria-label="${esc(stat.label)} with exact kill and death markers">
        <defs><mask id="summaryDead" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="white"/>${mask}</mask></defs>
        <g aria-hidden="true">${tickLines.join("")}${tickLabels.join("")}${benchmark}
          <polyline class="summary-player-line" points="${polyline(points)}" ${mask ? 'mask="url(#summaryDead)"' : ""}/>
          ${lineKills.join("")}
        </g>
        ${measured.join("")}${fightBands.join("")}${marks.join("")}
      </svg>
      <p class="summary-chart-caption">${subtitle}${points[points.length - 1][1] !== stat.value ? " The final snapshot differs from the scoreboard." : ""}${eventNote} Player objective hit times are unavailable.</p>`;
  }

  function distribution(stat) {
    // The p1–p99 table approximates the sample with one equally weighted point per rank.
    // A narrow kernel combines nearby points, including ties, into a small density curve.
    const cutoffs = stat.bounds.cutoffs, value = stat.value;
    const min = Math.min(value, cutoffs[0]), max = Math.max(value, cutoffs[cutoffs.length - 1]);
    const span = Math.max(1, max - min), pad = span * 0.06;
    const start = min - pad, end = max + pad, width = 290;
    const bandwidth = span / 15;
    const curve = Array.from({ length: 76 }, (_, i) => {
      const sample = start + (end - start) * i / 75;
      const density = cutoffs.reduce((sum, cutoff) => sum + Math.exp(-0.5 * ((sample - cutoff) / bandwidth) ** 2), 0);
      return [6 + i / 75 * width, density];
    });
    const peak = Math.max(...curve.map(point => point[1]));
    const path = curve.map(([x, y]) => `${round(x)},${round(62 - y / peak * 48)}`).join(" ");
    const marker = round(6 + (value - start) / (end - start) * width);
    const position = marker < 75 ? "start" : marker > 230 ? "end" : "middle";
    return `<svg class="summary-density" viewBox="0 0 302 84" role="img" aria-label="Distribution estimated from the hero percentile table, with this player's final match value marked">
      <path d="M6 62H296" class="summary-gridline"/>
      <polyline points="${path}" class="summary-average"/>
      <path d="M${marker} 10V63" class="summary-player-line"/>
      <text x="${marker}" y="79" text-anchor="${position}">${fmtStat(value)} in this match</text></svg>`;
  }

  return { chart, distribution, fightRule };
})();

