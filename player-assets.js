"use strict";

const PlayerAssets = (() => {
  const API = "https://api.deadlock-api.com/v1/";
  const steamProfiles = (ids, read) => read(`${API}players/steam?account_ids=${ids.join(",")}`);
  const safeUrl = url => typeof url === "string" && /^https:\/\//.test(url) ? url : "";
  let artRequest;

  async function readHeroArt() {
    const cacheKey = "pm_hero_art3";
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (cached?.t > Date.now() - 86400000 && cached.art) return cached.art;
    } catch (_) { /* storage may be unavailable */ }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(API + "assets/heroes", { signal: controller.signal });
      if (!response.ok) return {};
      const heroes = await response.json();
      const art = {};
      for (const hero of Array.isArray(heroes) ? heroes : []) {
        const images = hero.images || {};
        const pick = (...keys) => keys.map(key => safeUrl(images[key])).find(Boolean) || "";
        art[hero.id] = {
          mini: pick("minimap_image_webp", "minimap_image", "icon_image_small_webp", "icon_image_small"),
          card: pick("icon_hero_card_webp", "icon_hero_card"),
          bg: pick("background_image_webp", "background_image"),
          gloat: pick("hero_card_gloat_webp", "hero_card_gloat"),
          crit: pick("hero_card_critical_webp", "hero_card_critical"),
        };
      }
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), art })); } catch (_) { /* storage may be unavailable */ }
      return art;
    } catch (_) {
      return {};
    } finally {
      clearTimeout(timer);
    }
  }

  return { steamProfiles, safeUrl, heroArt: () => artRequest ||= readHeroArt() };
})();
