"use strict";

const HeroBackdrop = (() => {
  function apply(heroId, art = {}) {
    const id = Number(heroId) || 0;
    const root = document.documentElement;
    const backdrop = document.getElementById("backdrop");
    if (id) root.style.setProperty("--accent", heroColor(id));
    else root.style.removeProperty("--accent");
    root.dataset.theme = id ? String(id) : "";
    if (backdrop) {
      // Profile uses the animated accent for the wash. Summary still uses hero art.
      if (art) {
        const local = (window.HERO_BACKDROPS || []).includes(id);
        const background = local ? `assets/backdrops/${id}.webp` : art.bg || "assets/backdrops/generic.webp";
        backdrop.style.setProperty("--bd", `url("${background}")`);
      }
      backdrop.classList.add("on");
    }
  }

  return { apply };
})();
