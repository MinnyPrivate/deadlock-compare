"use strict";

(function () {
  const GAP_SECONDS = 30;
  const RADIUS = 3000;
  const hasPosition = event => Number.isFinite(event.pos?.[0]) && Number.isFinite(event.pos?.[1]);

  function groupFights(deaths) {
    const open = [], groups = [];
    const sorted = deaths.filter(event => Number.isFinite(event.t) && hasPosition(event)).sort((a, b) => a.t - b.t);
    for (const event of sorted) {
      const fight = open.find(group => event.t - group.end <= GAP_SECONDS &&
        group.deaths.some(other => Math.hypot(event.pos[0] - other.pos[0], event.pos[1] - other.pos[1]) <= RADIUS));
      if (fight) {
        fight.deaths.push(event);
        fight.end = event.t;
      } else {
        const group = { start: event.t, end: event.t, deaths: [event] };
        open.unshift(group);
        groups.push(group);
      }
    }
    return groups.filter(group => group.deaths.length >= 2);
  }

  if (typeof module !== "undefined") module.exports = { groupFights };
  if (typeof window !== "undefined") window.SummaryFights = { groupFights };
})();
