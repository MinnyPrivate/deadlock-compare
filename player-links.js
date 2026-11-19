"use strict";

const PlayerLinks = (() => {
  const hint = "Click to open their profile. Ctrl+click or Cmd+click to filter games with them.";

  function accountId(value) {
    if (!value || /\D/.test(value)) return null;
    const id = Number(value);
    return id >= 1 && id <= 0xffffffff ? id : null;
  }

  function profileHref(id, { fromMatch, search } = {}) {
    const params = new URLSearchParams(location.search);
    const match = fromMatch ?? (params.get("from") === "match" ? params.get("match") : null);
    const hasMatch = /^\d+$/.test(match || "");
    return PostmortemEmbed.href("profile.html", {
      id: accountId(id), q: search, from: hasMatch ? "match" : null, match: hasMatch ? match : null,
    });
  }

  function bind({ applyFilter, filterProfileId } = {}) {
    function activate(event) {
      const keyboard = event.type === "keydown";
      const filter = event.ctrlKey || event.metaKey;
      if (event.defaultPrevented || (keyboard ? event.key !== "Enter" || !filter : event.button !== 0)) return;
      const link = event.target.closest?.("a[data-player-id]");
      const id = accountId(link?.dataset.playerId);
      if (id === null) return;
      // Plain click and Enter follow the anchor. Suppress Shift/Alt browser actions on player links only.
      if (!filter && !event.shiftKey && !event.altKey) return;
      event.preventDefault();
      if (keyboard && event.repeat) return;
      if (filter && applyFilter?.(id, link, keyboard)) return;
      const url = new URL(link.href);
      if (filter) {
        const viewer = accountId(filterProfileId?.());
        if (viewer === null) url.searchParams.delete("id"); else url.searchParams.set("id", viewer);
        url.searchParams.set("with", id);
        url.searchParams.set("withKind", link.dataset.kind === "party" ? "party" : "team");
      }
      location.assign(url);
    }
    document.addEventListener("click", activate);
    document.addEventListener("keydown", activate);
    if (PostmortemEmbed.enabled) {
      document.addEventListener("auxclick", event => {
        if (event.button === 1 && event.target.closest?.("a[data-player-id]")) event.preventDefault();
      });
    }
  }

  return { accountId, profileHref, hint, bind };
})();
