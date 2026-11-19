"use strict";

const GraphMarkers = (() => {
  const key = "postmortem.markers";
  const defaults = {
    obj: false, deaths: false, items: false, guides: "big", scope: "picked", buys: "all",
    skulls: true, kills: true, assists: false, fadeDead: false, upgradeBadge: true, saleBadge: true,
  };
  const options = { guides: ["big", "all", "none"], scope: ["picked", "everyone"], buys: ["all", "tier3", "final"] };
  const kinds = [
    ["guardian", "Guardians", "objective_t1.svg"],
    ["walker", "Walkers", "objective_t2.svg"],
    ["base", "Base Guardians", "objective_t2.svg"],
    ["shrine", "Shrines", "icon_team1.png"],
    ["patron", "Patron", "patron_logo_team1.svg"],
    ["mid", "Mid Boss", "icon_soul.svg"],
  ];
  const prefs = { ...defaults };
  const hiddenKinds = new Set();
  const slotColors = { w: "#E89A3C", v: "#7FC241", s: "#B77CF0" };
  const purchases = new WeakMap();
  const controls = ["obj", "deaths", "items"];
  let open = null;

  function load() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "{}");
      if (!saved) return;
      for (const [name, value] of Object.entries(defaults)) {
        if (typeof value === "boolean" ? typeof saved[name] === "boolean" : options[name].includes(saved[name])) {
          prefs[name] = saved[name];
        }
      }
      if (Array.isArray(saved.hiddenKinds)) {
        for (const [kind] of kinds) if (saved.hiddenKinds.includes(kind)) hiddenKinds.add(kind);
      }
    } catch (e) { /* Keep defaults if storage is unavailable. */ }
  }

  function save() {
    try { sessionStorage.setItem(key, JSON.stringify({ ...prefs, hiddenKinds: [...hiddenKinds] })); } catch (e) { /* Storage may be unavailable. */ }
  }

  function close(restoreFocus = false) {
    if (!open) return false;
    open.querySelector(".markMenu").hidden = true;
    const arrow = open.querySelector(".markArrow");
    arrow.setAttribute("aria-expanded", "false");
    if (restoreFocus) arrow.focus();
    open = null;
    return true;
  }

  function wireMenus() {
    const bar = $("optMarks");
    $("markTypes").innerHTML = kinds.map(([kind, name, icon]) =>
      `<label class="markCheck"><input type="checkbox" data-kind="${kind}"><i class="markKind" style="--icon:url(assets/ui/${icon})"></i><span>${name}</span><b data-count="${kind}"></b></label>`
    ).join("");
    bar.onclick = ev => {
      const arrow = ev.target.closest(".markArrow");
      const toggle = ev.target.closest(".markToggle");
      if (arrow) {
        const group = arrow.closest(".markControl"), wasOpen = open === group;
        close();
        if (wasOpen) return;
        closeMenu();
        open = group;
        arrow.setAttribute("aria-expanded", "true");
        group.querySelector(".markMenu").hidden = false;
      }
      if (toggle) {
        close();
        const name = toggle.dataset.mark;
        prefs[name] = !prefs[name];
        save();
        renderAll();
      }
    };
    bar.onchange = ev => {
      const input = ev.target;
      if (input.dataset.kind) {
        if (input.checked) hiddenKinds.delete(input.dataset.kind);
        else hiddenKinds.add(input.dataset.kind);
      } else if (input.type === "checkbox") prefs[input.name] = input.checked;
      else if (input.type === "radio" && input.checked) prefs[input.name] = input.value;
      else return;
      save();
      renderAll();
    };
    document.addEventListener("click", ev => { if (open && !open.contains(ev.target)) close(); });
  }

  function renderOptions() {
    const bar = $("optMarks");
    for (const name of controls) {
      const toggle = bar.querySelector(`[data-mark="${name}"]`);
      toggle.closest(".markControl").classList.toggle("on", prefs[name]);
      toggle.setAttribute("aria-pressed", String(prefs[name]));
    }
    for (const input of bar.querySelectorAll("input")) {
      input.checked = input.dataset.kind ? !hiddenKinds.has(input.dataset.kind)
        : input.type === "radio" ? prefs[input.name] === input.value : prefs[input.name];
    }
    for (const count of bar.querySelectorAll("[data-count]")) {
      count.textContent = state.events.filter(e => e.type === count.dataset.count).length;
    }
  }

  function itemRecords(p) {
    if (purchases.has(p)) return purchases.get(p);
    const known = window.ITEMS || {};
    const components = window.ITEM_COMPONENTS || {};
    const items = [];
    for (const record of p.raw.items || []) {
      const id = Number(record.item_id), item = known[id];
      const t = Number(record.game_time_s), sold = Number(record.sold_time_s) || 0;
      if (!item || !Number.isFinite(t)) continue;
      const [name, slot, tier, icon] = item;
      items.push({ id, t, sold, name, slot, tier, icon, upgraded: sold > 0 && (Number(record.flags) & 1) !== 0, previous: [] });
    }
    items.sort((a, b) => a.t - b.t);
    const atTime = new Map();
    for (const item of items) {
      if (!atTime.has(item.t)) atTime.set(item.t, []);
      atTime.get(item.t).push(item);
    }
    for (const [index, item] of items.entries()) {
      if (!item.upgraded) continue;
      const candidates = (atTime.get(item.sold) || []).filter(next => next.id !== item.id && (next.t > item.t || items.indexOf(next) > index));
      const recipes = candidates.filter(next => (components[next.id] || []).includes(item.id));
      if (recipes.length === 1) link(item, recipes[0]);
    }
    // Older patches may have different recipes. Link a flagged component only when one plausible purchase is left.
    const possible = items.filter(item => item.upgraded && !item.next).map(item => ({
      item, matches: (atTime.get(item.sold) || []).filter(next =>
        next.t > item.t && next.slot === item.slot && next.tier > item.tier && !next.previous.length),
    }));
    for (const { item, matches } of possible) {
      const [next] = matches;
      if (matches.length === 1 && !possible.some(other => other.item !== item && other.matches.includes(next))) link(item, next);
    }
    purchases.set(p, items);
    return items;
  }

  function link(component, upgrade) {
    component.next = upgrade;
    upgrade.previous.push(component);
  }

  function visibleItems(p) {
    return itemRecords(p).filter(item =>
      prefs.buys === "tier3" ? item.tier >= 3 : prefs.buys === "final" ? !item.sold : true);
  }

  function fights(events, owns) {
    const out = [];
    for (const e of events) {
      if (prefs.skulls && owns(e.victim)) out.push({ type: "death", t: e.t, e });
      if (prefs.kills && e.killer && e.killer.team !== e.victim.team && owns(e.killer)) {
        out.push({ type: "kill", t: e.t, e });
      } else if (prefs.assists && e.assists.some(owns)) {
        out.push({ type: "assist", t: e.t, e });
      }
    }
    return out;
  }

  const height = rows => rows.reduce((sum, row) => sum + row.h, 0);

  function layout(g, view) {
    const picked = pickedList(g.kind);
    const compact = picked.length > 4 || view === "panels";
    const showFights = prefs.deaths && (prefs.skulls || prefs.kills || prefs.assists);
    const events = showFights || (prefs.deaths && prefs.fadeDead && picked.length) ? deathEvents() : [];
    if (events.length && showFights && prefs.assists) ensureAssists(events);
    const rows = picked.flatMap(p => {
      const item = prefs.items && visibleItems(p);
      const fight = showFights && prefs.scope === "picked" && events.length;
      return [
        ...(item && item.length ? [{ p, items: item, h: compact ? 22 : 34 }] : []),
        ...(fight ? [{ p, fights: fights(events, q => p === q), h: compact ? 23 : 28, paired: item && item.length }] : []),
      ];
    });
    const split = prefs.skulls && (prefs.kills || prefs.assists);
    const teams = showFights && prefs.scope === "everyone" && events.length
      ? [state.leftTeam, 1 - state.leftTeam].map(team => ({ team, fights: fights(events, p => p.team === team), h: split ? 44 : 29, split })) : [];
    const objectives = prefs.obj ? state.events.filter(e => !hiddenKinds.has(e.type)) : [];
    const guides = prefs.guides === "all" ? objectives : prefs.guides === "none" ? [] :
      objectives.filter(e => ["walker", "shrine", "patron", "mid"].includes(e.type));
    return { rows, teams, objectives, guides, visible: rows.length + teams.length + objectives.length > 0 };
  }

  function badge(type) {
    return `<i class="purchaseBadge ${type}" aria-hidden="true"></i>`;
  }

  function itemArt(item) {
    return `<i class="purchaseArt" style="--sc:${slotColors[item.slot]};--art:url(assets/items/${item.icon}.webp)" aria-hidden="true"></i>`;
  }

  function itemTip(item, dur) {
    const who = it => `<b>${esc(it.name)}</b>`;
    const ancestors = it => it.previous.length ? it.previous.flatMap(p => ancestors(p).map(path => [...path, it])) : [[it]];
    const after = [];
    for (let next = item.next; next; next = next.next) after.push(next);
    const chain = ancestors(item).map(path => [...path, ...after]);
    const row = (label, value) => `<dt>${label}</dt><dd>${value}</dd>`;
    const held = Math.max(0, (item.sold || dur) - item.t);
    return `<div class="purchaseTitle">${itemArt(item)}${who(item)}</div><dl class="purchaseFacts">` +
      row("Bought", fmtTime(Math.max(0, item.t)) + (item.previous.length ? " from " + item.previous.map(who).join(" + ") : "")) +
      (item.upgraded ? row("Upgraded", fmtTime(item.sold) + (item.next ? " into " + who(item.next) : ", next item unavailable")) :
        item.sold ? row("Sold", fmtTime(item.sold)) : row("Final build", "Kept through match end")) +
      row("Owned for", fmtTime(held)) + `</dl>` +
      (chain.some(path => path.length > 1) ? `<div class="purchaseChain">${chain.map(path =>
        `<div>${path.map(it => it === item ? who(it) : esc(it.name)).join(" → ")}</div>`).join("")}</div>` : "");
  }

  function fightLabel({ type, e }) {
    if (type === "death") return `${heroName(e.victim)} died`;
    if (type === "assist") return `Assisted against ${heroName(e.victim)} (best guess)`;
    return `${heroName(e.killer)} killed ${heroName(e.victim)}`;
  }

  function deathTip({ e }) {
    const row = p => `<div class="hr" style="--tc:${TEAMS[p.team].c};--pc:${p.color}"><i class="sw"></i><span class="face">${cardImg(p)}</span>` +
      `<span class="v hn">${esc(heroName(p))}</span></div>`;
    let h = `<div class="t">${fmtTime(e.t)}</div><div class="heroRows deathTip"><div class="dh">Died</div>${row(e.victim)}`;
    h += `<div class="dh">Killed by</div>` + (e.killer ? row(e.killer) : '<div class="dn">Trooper, objective or other cause</div>');
    if (prefs.assists) {
      h += '<div class="dh">Assists (best guess)</div>' +
        (e.assists.length ? e.assists.map(row).join("") : `<div class="dn">${state.match.match_paths ? "None estimated" : "No position data"}</div>`);
    }
    return h + `<dl class="deathFacts"><dt>Time dead</dt><dd>${e.duration ? fmtTime(e.duration) : "Unavailable"}</dd><dt>Souls lost</dt><dd>No per-death data</dd></dl></div>`;
  }

  function markerButton(cls, label, hit) {
    const b = el("button", "graphMarker " + cls);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.markerHit = hit;
    return b;
  }

  // Spread nearby icons just enough to keep each hit target accessible. Bars and hover guides use the exact times.
  function markerPositions(entries, P, gap) {
    const step = Math.min(gap, (P.r - P.l) / Math.max(1, entries.length - 1));
    const xs = [];
    for (let i = 0; i < entries.length; i++) {
      const right = P.r - (entries.length - 1 - i) * step;
      xs.push(Math.max(i ? xs[i - 1] + step : P.l, Math.min(P.X(entries[i].t), right)));
    }
    return xs;
  }

  function drawRows(box, rows, P, top, dur, showNames, nodes) {
    for (const row of rows) {
      const track = el("div", "markerTrack" + (row.h <= 23 || row.split ? " compact" : "") + (row.paired ? " paired" : ""));
      track.style.cssText = `left:${P.l}px;top:${top}px;width:${P.r - P.l}px;height:${row.h}px`;
      const p = row.p;
      if (showNames && !row.paired) {
        const team = TEAMS[p ? p.team : row.team];
        const name = el("span", "markerWho");
        name.style.setProperty("--tc", team.c);
        name.innerHTML = p ? portraitImg(p) + `<span>${esc(heroName(p))}</span>` : esc(team.name);
        track.append(name);
      }
      const items = row.items;
      const lanes = row.split ? [row.fights.filter(e => e.type === "death"), row.fights.filter(e => e.type !== "death")] : [items || row.fights];
      const laneH = row.h / lanes.length, gap = laneH <= 23 ? 19 : items ? 30 : 23;
      for (const [lane, entries] of lanes.entries()) {
        const mid = (lane + 0.5) * laneH;
        const xs = markerPositions(entries, P, gap);
        entries.forEach((entry, i) => {
          const x = xs[i], y = top + mid;
          let b;
          if (items) {
            const hit = { type: "item", x, y, P, t: entry.t, end: entry.sold || dur, item: entry,
              barY: top + row.h - 3, tip: () => itemTip(entry, dur) };
            b = markerButton("purchaseMarker", `${heroName(p)}: ${entry.name}, bought ${fmtTime(Math.max(0, entry.t))}`, hit);
            b.innerHTML = `<span class="${entry.sold ? "leftBuild" : ""}">${itemArt(entry)}</span>` +
              (entry.upgraded && prefs.upgradeBadge ? badge("upgrade") : entry.sold && !entry.upgraded && prefs.saleBadge ? badge("sale") : "");
            nodes.set(entry, b);
          } else {
            const label = fightLabel(entry);
            b = markerButton(`fightMarker ${entry.type}`, label + " at " + fmtTime(entry.t),
              { x, y, P, t: entry.t, tip: () => deathTip(entry) });
            b.innerHTML = entry.type === "death" ? '<i class="fightSkull" aria-hidden="true"></i>' : portraitImg(entry.e.victim);
            if (entry.type === "death" && entry.e.duration > 0) {
              const l = P.X(entry.t), r = P.X(Math.min(dur, entry.t + entry.e.duration));
              const bar = el("i", "respawnBar");
              bar.style.cssText = `left:${l - P.l}px;top:${mid - 1}px;width:${Math.max(0, r - l)}px`;
              track.append(bar);
            }
          }
          b.style.cssText = `left:${x - P.l}px;top:${mid}px`;
          const exact = P.X(entry.t);
          if (Math.abs(exact - x) > 3) {
            const anchor = el("i", "markerAnchor");
            anchor.style.cssText = `left:${Math.min(exact, x) - P.l}px;top:${mid + laneH / 2 - 1}px;width:${Math.abs(exact - x)}px`;
            track.append(anchor);
          }
          track.append(b);
        });
      }
      box.append(track);
      top += row.h;
    }
  }

  function drawObjectives(box, events, P, top) {
    const xs = markerPositions(events, P, 24);
    events.forEach((e, i) => {
      const x = xs[i], y = top + 11;
      const mk = markerButton("marker", `${e.text} at ${fmtTime(e.t)}`,
        { x, y, P, t: e.t, tip: () => `<div class="t">${fmtTime(e.t)}</div><div class="objectiveTip">${esc(e.text)}</div>` });
      mk.style.cssText = `left:${x}px;top:${y}px;--mc:${e.color};--icon:url("${e.icon}")`;
      mk.append(el("i", e.mid ? "mid" : ""));
      box.append(mk);
    });
  }

  function deadMasks(P, index) {
    const ids = new Map();
    if (!prefs.deaths || !prefs.fadeDead) return { ids, svg: "" };
    let svg = "";
    for (const p of new Set(P.series.filter(se => se.player && !se.diff).map(se => se.player))) {
      const intervals = deathEvents().filter(e => e.victim === p && e.duration > 0);
      if (!intervals.length) continue;
      const id = `respawns-${index}-${p.slot}`, bounds = `x="${P.l - 5}" y="${P.t - 5}" width="${P.r - P.l + 10}" height="${P.b - P.t + 10}"`;
      ids.set(p, id);
      svg += `<mask id="${id}" maskUnits="userSpaceOnUse" ${bounds}><rect ${bounds} fill="white"/>` +
        intervals.map(e => `<rect x="${P.X(e.t)}" y="${P.t - 5}" width="${P.X(e.t + e.duration) - P.X(e.t)}" height="${P.b - P.t + 10}" fill="black" opacity=".74"/>`).join("") +
        "</mask>";
    }
    return { ids, svg };
  }

  return { load, close, wireMenus, renderOptions, layout, drawRows, drawObjectives, deadMasks, height, itemRecords };
})();
