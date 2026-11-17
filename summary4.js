// Summary tab, round 4 mockup (?tab=summary&sum=4[&pick=slot][&early=1]). Not for merge.
// Round 1 layout A as the base (packed hero card, match strip with MVP top 3, stat cards, a graph, side column),
// plus the later ideas: percentiles vs the hero, in-game item grid, "Your game" chart, nemesis / favourite target,
// and the Profile page's hero theme (colour wash + ritual circles + dust + grain, accent = decoration only).
(() => {
  if (params.get("sum") !== "4") return;
  const EARLY = params.get("early") === "1";

  // ---------- hero theme: same layers as profile.html (PR 27) ----------
  function applyTheme(p) {
    const id = Number(p.raw.hero_id), has = (window.HERO_BACKDROPS || []).includes(id);
    const acc = (window.HERO_ACCENTS || {})[id] || "#FFEFD7";
    document.documentElement.style.setProperty("--accent", acc);
    let bd = document.getElementById("backdrop");
    if (!bd) {
      document.body.insertAdjacentHTML("afterbegin", `<div class="backdrop" id="backdrop" aria-hidden="true"><i></i><b></b></div><canvas class="dust" id="dust" aria-hidden="true"></canvas><div class="grain" aria-hidden="true"></div>`);
      bd = document.getElementById("backdrop");
      const s = document.createElement("script"); s.src = "dust.js"; document.body.appendChild(s);
    }
    bd.style.setProperty("--bd", `url("assets/backdrops/${has ? id : "generic"}.webp")`);
    bd.classList.add("on");
    document.body.classList.add("sum4");
  }

  // ---------- pieces ----------
  function heroCard(p) {
    const T = TEAMS[p.team], won = state.match.winning_team === p.team, k = p.raw, g = mvpGap(p);
    return `<div class="s4card s4panel" style="--tc:${T.c}">
      <div class="s4head">
        <div class="s4art">${cardImg(p)}<span class="s2artTag sm ${won ? "won" : "lost"}">${won ? "VICTORY" : "DEFEAT"}</span></div>
        <div class="s4who">
          <div class="s4name">${esc(heroName(p))}</div>
          <div class="s4meta"><span style="color:${T.c}">${T.color}</span> · ${p.lane && LANES_BY_COLOR[p.lane] ? LANES_BY_COLOR[p.lane] + " lane" : "No lane"} · ${fmtTime(state.match.duration_s)}</div>
          <div class="s4rank">${rankHtml(p.badge) || `<span class="rank none">Unranked</span>`}${p.mvp === 1 ? `<span class="badge">MVP</span>` : p.mvp > 1 ? `<span class="badge key">KEY PLAYER</span>` : ""}</div>
          <div class="s4place"><b>${ordinal(g.r.place)}</b><span>of 12${EARLY ? "" : ` · ${g.r.score.toFixed(1)} pts`}</span></div>
          <div class="s4gap">${EARLY ? "Early estimate" : esc(g.txt)}</div>
        </div>
      </div>
      <div class="s4kda"><b>${k.kills}</b><i>/</i><b class="d">${k.deaths}</b><i>/</i><b>${k.assists}</b><span>${fmtStat(p.souls)} souls</span></div>
      <p class="s4verdict">${esc(verdict(p))}</p>
      ${tagsRowHtml(p, 4, EARLY)}
      ${itemGrid(p).replace('class="s2build"', 'class="s2build s4build"')}
      ${EARLY ? "" : accHtml(p).replace(/top \d+, hover for the stat/, "hover for the stat")}
      <div class="s4actions"><button class="graphOptionButton">Compare with…</button><button class="graphOptionButton">Whole lobby</button><button class="graphOptionButton">Copy link</button></div>
    </div>`;
  }
  // Round 1 card size, round 2 wording: percentile against this hero's games, lobby place underneath.
  function statCard(s, hero) {
    const w = pctWord(s, hero);
    return `<div class="sumStat s4stat${s.place === 1 ? " best" : ""}" title="${esc(s.label)}: ${esc(fmtV(s, s.val))}. Average ${esc(hero)}: ${esc(fmtAvg(s, s.avg))}. ${ordinal(s.place)} of ${s.n} in this match. Click for how it happened.">
      <span class="sl">${esc(s.label)}</span>
      <span class="sv">${esc(fmtV(s, s.val))}</span>
      <span class="sd ${w.cls}">${arrowOf(w.cls)} ${esc(w.long)}</span>
      <span class="sp">${s.place === 1 ? `<span class="topTag">Lobby best</span>` : `${ordinal(s.place)} of ${s.n}`}</span>
    </div>`;
  }
  function chartBox(p) {
    if (EARLY) return `<div class="s4panel s4chart wait"><div class="dHead"><span class="dTitle">Your game</span></div><div class="waitBig">Damage over time, kills, deaths and fights fill in here in about a minute.</div></div>`;
    const html = gameChart(p, 872, 392);
    return html.replace('class="s2gameBox"', 'class="s2gameBox s4panel s4chart"')
      .replace('<span class="dTitle">Your game</span>', `<span class="dTitle">Your game</span><span class="s4seg"><button class="on">Your damage</button><button>Team souls</button></span>`)
      .replace(/<span class="dSub">[^<]*<\/span>/, "");
  }
  function rivals(p) {
    const nm = nemesis(p), big = (lbl, q, a, b, sub) => `<div class="rv"><span class="rvL">${lbl}</span><div class="rvM">${faceHtml(q)}<span class="rvS">${a}<i>–</i>${b}</span></div><span class="rvN">${esc(q.hero)}</span><span class="rvSub">${sub}</span></div>`;
    const fought = foughtHtml(p).replace(/^<div class="sumBlock"><div class="accHead">.*?<\/div>/, "").replace(/<\/div>$/, "");
    return `<div class="s4panel s4rivals"><div class="accHead"><span>Who you fought</span><span class="accSub">kills between you, whole match</span></div>
      <div class="rvRow">${big("Nemesis", nm.nem.q, nm.nem.them, nm.nem.you, `killed you ${nm.nem.them}, you got them ${nm.nem.you}`)}${big("Favorite target", nm.prey.q, nm.prey.you, nm.prey.them, `you got them ${nm.prey.you}, they got you ${nm.prey.them}`)}</div>
      <div class="rvDmg">${fought}</div></div>`;
  }
  // Lane at 9:00: you against the average of your lane opponents, six numbers (the round 2 "lane grid" idea).
  function laneGrid(p) {
    const ln = laneInfo(p); if (!ln) return "";
    const at = q => snapAt(q, 540) || {}, me = at(p), op = ln.opp.map(at);
    const avg = k => op.reduce((a, s) => a + (s[k] || 0), 0) / Math.max(1, op.length);
    const rows = [["Souls", "net_worth"], ["Last hits", "creep_kills"], ["Denies", "denies"], ["Hero damage", "player_damage"], ["Kills", "kills"], ["Objective dmg", "boss_damage"]];
    return `<div class="lgGrid">${rows.map(([l, k]) => { const a = me[k] || 0, b = avg(k), c = a > b * 1.1 ? "pos" : a < b * 0.9 ? "neg" : "";
      return `<div class="lgC ${c}" title="${l} at 9:00: you ${fmtStat(a)}, your lane opponents average ${fmtStat(b)}"><span class="lgL">${l}</span><b>${fmtStat(a)}</b><em>${c === "pos" ? UP : c === "neg" ? DOWN : "≈"} vs ${fmtStat(b)}</em></div>`; }).join("")}</div>`;
  }
  function side(p) {
    if (EARLY) return ["Lane", "Who you fought", "Before and after 15:00"].map(l => `<div class="s4panel s4wait"><div class="accHead"><span>${l}</span></div><span class="waitTxt">With full stats, in about a minute</span></div>`).join("");
    return laneHtml(p).replace('class="sumBlock sumLane"', 'class="sumBlock sumLane s4panel"').replace(/<\/div>$/, `<div class="lgHead">You at 9:00 vs your lane opponents' average</div>${laneGrid(p)}</div>`) + rivals(p) + earlyLateHtml(p).replace('class="sumBlock"', 'class="sumBlock s4panel"');
  }

  function view(p) {
    const g = gradedStats(p);
    return `<div class="sum4grid">
      ${matchStripHtml()}
      ${heroCard(p)}
      <div class="s4mid">
        <div class="accHead"><span>Against every ${esc(p.hero)} game</span><span class="accSub">${UP} better, ${DOWN} worse, last two weeks. Gold = best in the lobby. Click any number for how it happened.</span></div>
        <div class="statGrid">${g.map(s => statCard(s, p.hero)).join("")}</div>
        ${chartBox(p)}
      </div>
      <div class="s4side">${side(p)}</div>
    </div>`;
  }

  const prev = window.renderSummary;
  window.renderSummary = function () {
    const v = document.getElementById("sumView");
    if (!state.match) return prev && prev();
    const p = sumPick();
    applyTheme(p);
    v.innerHTML = view(p);
    if (EARLY) document.querySelectorAll("#tabs .tab").forEach(b => b.classList.toggle("wait", ["mvp", "matchups"].includes(b.dataset.tab)));
  };
})();
