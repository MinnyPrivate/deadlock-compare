"use strict";

const PostmortemEmbed = (() => {
  const params = new URLSearchParams(location.search);
  const enabled = params.get("embed") === "1" || params.get("ingame") === "1";
  const hideout = enabled && /^\d{1,10}$/.test(params.get("dlh") || "") ? params.get("dlh") : null;
  let panelMatch = enabled && !hideout && /^\d+$/.test(params.get("panelMatch") || "") ? params.get("panelMatch") : null;
  if (enabled) document.documentElement.classList.add("pmEmbed");

  function preserve(url) {
    if (!enabled) return url;
    url.searchParams.set("embed", "1");
    if (hideout) url.searchParams.set("dlh", hideout);
    if (panelMatch) url.searchParams.set("panelMatch", panelMatch);
    return url;
  }

  function href(page, query) {
    const url = new URL(page, location.href);
    for (const [key, value] of Object.entries(query)) {
      if (value != null) url.searchParams.set(key, value);
    }
    return page + preserve(url).search;
  }

  // Panorama watches the original match ID even when its browser opens a profile or another match.
  function startMatchHeartbeat(match) {
    if (!enabled || hideout) return;
    if (!panelMatch && /^\d+$/.test(match || "")) panelMatch = String(match);
    if (!panelMatch) return;
    let told = false;
    const ready = () => {
      if (told) return;
      told = true;
      document.title = "DLC_READY:" + panelMatch + ":" + Date.now();
    };
    requestAnimationFrame(() => requestAnimationFrame(ready));
    setTimeout(ready, 400);
    setInterval(() => { if (told) document.title = "DLC_ALIVE:" + panelMatch + ":" + Date.now(); }, 2000);
  }

  return { enabled, hideout, get panelMatch() { return panelMatch; }, href, startMatchHeartbeat };
})();
