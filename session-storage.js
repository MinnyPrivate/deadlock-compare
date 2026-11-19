"use strict";

// Discard legacy browser-wide settings. Once removed, these keys have no persistent writers.
// Keep the saved account and companion cookie outside this migration.
try {
  for (const key of [
    "pm_mode", "pm_with", "pm_recent_profiles", "postmortem.markers",
    "postmortem.summary.hideNegativeTags", "postmortem.perf", "pm_hero_art3", "dlhideout_test",
  ]) localStorage.removeItem(key);
} catch (_) { /* storage may be unavailable */ }
