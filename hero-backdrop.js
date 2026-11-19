"use strict";

const HeroBackdrop = (() => {
  function apply(heroId, art = {}) {
    const id = Number(heroId) || 0;
    const root = document.documentElement;
    const backdrop = document.getElementById("backdrop");
    const local = (window.HERO_BACKDROPS || []).includes(id);
    const background = local ? `assets/backdrops/${id}.webp` : art.bg || "assets/backdrops/generic.webp";
    if (id) root.style.setProperty("--accent", heroColor(id));
    else root.style.removeProperty("--accent");
    root.dataset.theme = id ? String(id) : "";
    if (backdrop) {
      backdrop.style.setProperty("--bd", `url("${background}")`);
      backdrop.classList.add("on");
    }
  }

  return { apply };
})();
