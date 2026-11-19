"use strict";

// Used by both the classic browser scripts and the Worker.
globalThis.PostmortemShare = (() => {
  const asId = (value, max) => {
    const id = String(value);
    return /^[1-9]\d{0,15}$/.test(id) && Number(id) <= max ? id : null;
  };

  function playerPath(match, account) {
    const matchId = asId(match, Number.MAX_SAFE_INTEGER);
    const accountId = asId(account, 0xffffffff);
    return matchId && accountId ? `/m/${matchId}/p/${accountId}` : null;
  }

  function parsePath(pathname) {
    const parts = /^\/m\/([1-9]\d{0,15})\/p\/([1-9]\d{0,9})(\/image\.png)?\/?$/.exec(pathname);
    if (!parts) return null;
    const [, matchId, accountId, image] = parts;
    const path = playerPath(matchId, accountId);
    if (!path || (image && pathname.endsWith("/"))) return null;
    return { matchId, accountId, path, image: Boolean(image) };
  }

  return { playerPath, parsePath };
})();
