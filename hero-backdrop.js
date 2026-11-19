"use strict";

const HeroBackdrop = (() => {
  const localAccent = id => window.HERO_ACCENTS?.[id] || "";

  function apply(heroId, art = {}, accent = localAccent(heroId) || art.ui || "") {
    const id = Number(heroId) || 0;
    const root = document.documentElement;
    const backdrop = document.getElementById("backdrop");
    const local = (window.HERO_BACKDROPS || []).includes(id);
    const background = local ? `assets/backdrops/${id}.webp` : art.bg || "assets/backdrops/generic.webp";
    if (accent) root.style.setProperty("--accent", accent);
    else root.style.removeProperty("--accent");
    root.dataset.theme = id ? String(id) : "";
    if (backdrop) {
      backdrop.style.setProperty("--bd", `url("${background}")`);
      backdrop.classList.add("on");
    }
  }

  return { apply, localAccent };
})();
