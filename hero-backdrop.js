"use strict";

const HeroBackdrop = (() => {
  const generic = "assets/backdrops/generic.webp";
  let requestedBackground, requestedImage;

  async function showArt(layer, background) {
    if (requestedBackground === background) return;
    requestedBackground = background;
    const image = requestedImage = new Image();
    image.alt = "";
    image.src = background;
    try {
      await image.decode();
    } catch (_) {
      if (image !== requestedImage || background === generic) return;
      image.src = generic;
      try { await image.decode(); } catch (_) { return; }
    }
    if (image !== requestedImage || layer.lastElementChild?.src === image.src) return;

    if (!layer.childElementCount || layer.closest(".profileEmbed") || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      layer.replaceChildren(image);
      return;
    }

    // Keep the current art underneath, including any fade still in flight.
    const previous = Array.from(layer.children);
    layer.append(image);
    image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "ease" }).onfinish = () => {
      for (const oldImage of previous) oldImage.remove();
    };
  }

  function apply(heroId, art = {}) {
    const id = Number(heroId) || 0;
    const root = document.documentElement;
    const backdrop = document.getElementById("backdrop");
    if (id) root.style.setProperty("--accent", heroColor(id));
    else root.style.removeProperty("--accent");
    root.dataset.theme = id ? String(id) : "";
    if (backdrop) {
      if (art) {
        const local = (window.HERO_BACKDROPS || []).includes(id);
        const background = local ? `assets/backdrops/${id}.webp` : art.bg || generic;
        const layer = backdrop.querySelector(".profileBackdropArt");
        if (layer) showArt(layer, background);
        else backdrop.style.setProperty("--bd", `url("${background}")`);
      }
      backdrop.classList.add("on");
    }
  }

  return { apply };
})();
