"use strict";

const views = {
  website: { width: 1920, height: 1080 },
  ingame: { width: 1560, height: 912 },
};
const cases = [
  { id: 136941488, slot: 8, type: "Stomp win", file: "test/136941488.json" },
  { id: 138427763, slot: 5, type: "Comeback", file: "test/card-gallery/138427763.json" },
  { id: 137018749, slot: 6, type: "Loss", file: "test/137018749.json" },
  { id: 139859134, slot: 4, type: "Quiet game", file: "test/card-gallery/139859134.json" },
  { id: 139609876, slot: 3, type: "Street Brawl", file: "test/card-gallery/139609876.json" },
];
const catalog = {
  place: "Lobby placement", story: "Match story", sweep: "Stat comparison", rival: "Rival",
  moments: "Big moment", lane: "Lane", bests: "Lobby bests", souls: "Soul sources",
};
const root = document.documentElement;
const matches = document.getElementById("gallery-matches");
const status = document.getElementById("gallery-status");
const url = new URL(location.href);
let revision = 0, activeWidth;

const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};
const count = n => n.toLocaleString("en-US");

function describe(info, facts) {
  const time = `${Math.floor(info.duration_s / 60)}:${String(info.duration_s % 60).padStart(2, "0")}`;
  if (!facts) return `${info.players.length} players · ${time} · game mode ${info.game_mode}`;
  return `${facts.won ? "Victory" : "Defeat"} · ${time} · ${facts.kills} total kills · ${facts.story} · Largest deficit ${count(-facts.min)} · Largest lead ${count(facts.max)}`;
}

// Add each mirror next to its source rule in this page's CSSOM so specificity and source order match.
// Nested tooltip targets get their own class so only one target per card is active.
function installGalleryRules(sheet) {
  const rules = [...sheet.cssRules];
  for (let i = rules.length - 1; i >= 0; i--) {
    const rule = rules[i];
    if (rule instanceof CSSMediaRule) {
      installGalleryRules(rule);
      continue;
    }
    if (!(rule instanceof CSSStyleRule)) continue;
    const selectors = rule.selectorText.split(",").map(s => s.trim())
      .filter(s => /\.hl-card:(?:hover|focus-within)\b|\.hl-(?:dot|sweep-row):hover\b|#summaryTip\b/.test(s))
      .map(s => s.replace(/\.hl-card:(?:hover|focus-within)\b/, ".hl-card.gallery-force-hover")
        .replace(/(\.hl-(?:dot|sweep-row)):hover\b/, "$1.gallery-force-target")
        .replace("#summaryTip", ":is(#summaryTip, .gallery-tip)"));
    if (selectors.length) sheet.insertRule(`${[...new Set(selectors)].join(", ")} { ${rule.style.cssText} }`, i + 1);
  }
}

installGalleryRules(document.getElementById("card-styles").sheet);

async function loadEngine(width) {
  const engine = make("iframe", "gallery-engine");
  engine.title = "Offscreen Highlights renderer";
  engine.tabIndex = -1;
  engine.setAttribute("aria-hidden", "true");
  const size = views[width];
  engine.style.width = size.width + "px";
  engine.style.height = size.height + "px";
  engine.src = width === "ingame" ? "index.html?embed=1" : "index.html";
  const ready = new Promise(resolve => engine.addEventListener("load", resolve, { once: true }));
  document.body.append(engine);
  await ready;
  return engine;
}

function inspectBento(engine, info, data) {
  if (data.unavailable) {
    const cards = Object.entries(catalog).map(([id, label]) => ({ id, label, interest: null, reason: data.unavailable }));
    return { ...data, cards };
  }
  const { candidates, picked, minInterest, lead, team } = data;
  for (const id of Object.keys(candidates)) {
    if (!Object.hasOwn(catalog, id)) throw new Error("Missing gallery label for Highlights card " + id);
  }
  const template = document.createElement("template");
  template.innerHTML = candidates.story?.big || "";
  const facts = {
    won: Number(info.winning_team) === team,
    min: Math.min(...lead.map(point => point.lead)), max: Math.max(...lead.map(point => point.lead)),
    afterFiveMin: Math.min(...lead.filter(point => point.t > 300).map(point => point.lead)),
    final: lead.at(-1).lead, story: template.content.textContent,
    kills: info.players.reduce((total, player) => total + player.kills, 0),
  };
  const view = engine.contentDocument.getElementById("summaryView");
  view.hidden = false;
  view.innerHTML = `<div class="hl-layout"><div></div>${data.bento}</div>`;
  const grid = view.querySelector(".hl-grid"), styleOf = element => engine.contentWindow.getComputedStyle(element);
  const { gridTemplateColumns, gridTemplateRows, columnGap } = styleOf(grid);
  const tracks = gridTemplateColumns.split(" ").map(parseFloat), heights = gridTemplateRows.split(" ").map(parseFloat);
  const sizes = new Map([...grid.children].map(card => [card.dataset.hlCard, parseFloat(styleOf(card).height)]));
  view.replaceChildren();
  view.hidden = true;

  const selected = new Map(picked.map(card => [card.id, card]));
  if (!candidates.souls.hasSources) candidates.souls = null;
  const missing = {
    story: "Shared team soul snapshots do not cover the match.",
    lane: !data.hasLane ? "The player has no recognized assigned lane."
      : !data.hasLaneOpponent ? "No opponent is assigned to this lane." : "A lane participant lacks a 9:00 snapshot.",
    bests: "The player has no outright lobby best.",
    souls: "No tracked soul income sources.",
  };
  const cards = Object.entries(catalog).map(([id, label]) => {
    const chosen = selected.get(id), candidate = candidates[id];
    const interest = candidate?.interest ?? null;
    if (!candidate) return { id, label, interest, reason: missing[id] || "The builder returned no card." };
    const reason = chosen ? "" : id === "souls" ? "Outside the picker pool."
      : interest < minInterest ? `Below minimum interest (${minInterest}).` : "Ranked outside the available slots.";
    const span = chosen?.span || (id === "story" ? 3 : 2);
    template.innerHTML = data.cardHtml(chosen || { ...candidate, span });
    const tips = [...template.content.querySelectorAll("[data-summary-tip], [data-summary-score]")].map(data.tipHtml);
    return {
      id, label, interest, reason, tips, html: template.innerHTML,
      width: tracks.slice(0, span).reduce((sum, px) => sum + px, 0) + (span - 1) * parseFloat(columnGap),
      height: sizes.get(id) || heights[id === "story" ? Math.min(1, heights.length - 1) : heights.length - 1],
    };
  });
  return { ...data, cards, facts };
}

function scopeClipPaths(card, prefix) {
  for (const clip of card.querySelectorAll("clipPath[id]")) {
    const id = clip.id;
    clip.id = prefix + "-" + id;
    for (const shape of card.querySelectorAll(`[clip-path="url(#${id})"]`)) {
      shape.setAttribute("clip-path", `url(#${clip.id})`);
    }
  }
}

function showHover(sample, card, tips) {
  card.classList.add("gallery-force-hover");
  const anchors = [...card.querySelectorAll("[data-summary-tip], [data-summary-score]")];
  if (!anchors.length) return;
  const tip = make("div", "summary-tip gallery-tip");
  sample.append(tip);
  let active;
  const activate = anchor => {
    active?.classList.remove("gallery-force-target");
    active = anchor;
    anchor.classList.add("gallery-force-target");
    tip.innerHTML = tips[anchors.indexOf(anchor)];
  };
  const representative = card.querySelector(".hl-dot.is-you") || anchors[0];
  activate(representative);
  for (const anchor of anchors) {
    anchor.addEventListener("pointerenter", () => activate(anchor));
    anchor.addEventListener("focus", () => activate(anchor));
  }
  card.addEventListener("pointerleave", () => {
    if (!anchors.includes(document.activeElement)) activate(representative);
  });
}

function sample(entry, match, state, scale) {
  const box = make("div", "gallery-sample hl-grid");
  box.dataset.sampleState = state;
  box.style.setProperty("--native-scale", scale);
  box.style.setProperty("--sample-width", (entry.width || 460) + "px");
  box.style.setProperty("--sample-height", (entry.height || 56) + "px");
  box.append(make("span", "gallery-state", state === "hover" ? "Forced hover" : "Resting"));
  if (!entry.html) {
    box.append(make("div", "gallery-na", "N/A: " + entry.reason));
    return box;
  }
  box.insertAdjacentHTML("beforeend", entry.html);
  const card = box.lastElementChild;
  scopeClipPaths(card, `gallery-${match}-${state}`);
  if (state === "hover") showHover(box, card, entry.tips);
  else card.inert = true;
  return box;
}

function matchSection(review, info, data, scale) {
  const section = make("section", "gallery-match");
  section.dataset.match = review.id;
  section.style.setProperty("--hero-accent", data.accent);
  section.append(make("h2", "", `${review.id} · ${review.type} · ${data.hero}`),
    make("p", "", describe(info, data.facts)));
  for (const entry of data.cards) {
    const pair = make("section", "gallery-pair");
    pair.dataset.card = entry.id;
    const scroll = make("div", "gallery-scroll");
    const samples = make("div", "gallery-samples");
    samples.dataset.pairWidth = 2 * (entry.width || 460) * scale + 18;
    samples.append(sample(entry, review.id, "rest", scale), sample(entry, review.id, "hover", scale));
    scroll.append(samples);
    pair.append(make("h3", "", entry.label), scroll);
    section.append(pair);
  }
  const drops = data.cards.filter(card => card.reason);
  const details = make("details", "gallery-drops");
  const list = make("ul");
  for (const card of drops) {
    const interest = card.interest === null ? "unscored" : `interest ${card.interest}`;
    list.append(make("li", "", `${card.label} · ${interest} · ${card.reason}`));
  }
  details.append(make("summary", "", `Picker omissions (${drops.length})`), list);
  section.append(details);
  return section;
}

function fitPairs() {
  for (const samples of matches.querySelectorAll(".gallery-samples")) {
    const available = samples.parentElement.clientWidth;
    const pairWidth = Number(samples.dataset.pairWidth);
    samples.style.setProperty("--pair-scale", Math.min(1, (available - 18) / (pairWidth - 18)));
  }
}
new ResizeObserver(fitPairs).observe(matches);

const fixtureData = Promise.all(cases.map(async review => {
  const response = await fetch(review.file);
  if (!response.ok) throw new Error(`Could not load ${review.file} (${response.status}).`);
  const json = await response.json();
  const info = json.match_info || json;
  if (info.match_id !== review.id) throw new Error(`Wrong match in ${review.file}.`);
  // Keep an untouched source for each width. The match app caches parsed stats on the match object.
  return info;
}));

async function render(width) {
  const token = ++revision;
  const size = views[width];
  activeWidth = width;
  document.body.classList.toggle("standalone", width === "website");
  root.style.setProperty("--gallery-width", (size.width - 36) + "px");
  root.dataset.ready = "loading";
  matches.replaceChildren();
  status.textContent = "Loading saved matches…";
  let engine;
  try {
    engine = await loadEngine(width);
    const fixtures = await fixtureData;
    const fragment = document.createDocumentFragment();
    const coverage = [];
    for (const [i, review] of cases.entries()) {
      const info = fixtures[i];
      const source = await engine.contentWindow.Summary.inspectCards(structuredClone(info), review.slot);
      const data = inspectBento(engine, info, source);
      fragment.append(matchSection(review, info, data, data.scale));
      coverage.push({ id: review.id, type: review.type, slot: review.slot, hero: data.hero, facts: data.facts, unavailable: data.unavailable,
        mode: info.game_mode, players: info.players.length, seconds: info.duration_s,
        cards: data.cards.map(({ id, label, interest, reason, html }) => ({ id, label, interest, reason, rendered: Boolean(html) })) });
    }
    if (token !== revision) return;
    matches.append(fragment);
    fitPairs();
    window.cardGalleryCoverage = coverage;
    status.textContent = `${cases.length} saved matches · ${size.width} × ${size.height} reference · Hero names from fixtures`;
    root.dataset.ready = "true";
  } catch (error) {
    if (token !== revision) return;
    status.textContent = error.message;
    root.dataset.ready = "error";
  } finally {
    engine?.remove();
  }
}

function setOptions() {
  const width = url.searchParams.get("width") === "ingame" ? "ingame" : "website";
  const state = ["rest", "hover"].find(value => url.searchParams.get("state") === value) || "both";
  root.dataset.state = state;
  for (const button of document.querySelectorAll("nav button")) {
    button.setAttribute("aria-pressed", button.dataset.width === width || button.dataset.state === state);
  }
  if (width !== activeWidth) void render(width);
}

document.querySelector("nav").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const [key, value] = Object.entries(button.dataset)[0];
  url.searchParams.set(key, value);
  history.replaceState(null, "", url);
  setOptions();
});
setOptions();
