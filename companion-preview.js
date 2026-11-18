"use strict";

const CompanionPreview = (() => {
  const prefix = "/api/v1/companion";
  const form = document.querySelector("#companionPair");
  const button = document.querySelector("#companionLink");
  const code = form.elements.code;
  const message = document.querySelector("#companionMessage");
  let paired = false;
  let change = () => {};
  let active = null;

  async function api(path, options) {
    try {
      return await fetch(prefix + path, {
        credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(4000), ...options,
      });
    } catch (_) {
      return null;
    }
  }

  function showPairing() {
    button.textContent = paired ? "Unlink companion" : "Link companion";
    form.hidden = true;
  }

  const ready = (async () => {
    const response = await api("/session");
    if (!response?.ok) return false;
    try {
      paired = (await response.json()).paired === true;
    } catch (_) {
      return false;
    }
    button.hidden = false;
    showPairing();
    return paired;
  })();

  button.onclick = async () => {
    message.textContent = "";
    if (!paired) {
      form.hidden = !form.hidden;
      if (!form.hidden) code.focus();
      return;
    }
    const response = await api("/unlink", { method: "POST" });
    if (!response?.ok) { message.textContent = "Couldn’t unlink. Try again."; return; }
    paired = false;
    showPairing();
    change();
  };

  form.onsubmit = async event => {
    event.preventDefault();
    const value = code.value;
    code.value = "";
    const submit = form.querySelector("button");
    submit.disabled = true;
    const response = await api("/pairing/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: value, remember: form.elements.remember.checked }),
    });
    submit.disabled = false;
    if (!response?.ok) {
      message.textContent = response?.status === 429 ? "Too many attempts. Wait and try again." :
        "Couldn’t link. Request a fresh code from the companion.";
      code.focus();
      return;
    }
    const session = await api("/session");
    paired = !!session?.ok && (await session.json().catch(() => ({}))).paired === true;
    if (!paired) { message.textContent = "This browser couldn’t keep the session."; return; }
    showPairing();
    message.textContent = "";
    change();
  };

  function stop() {
    if (!active) return;
    clearTimeout(active.next);
    clearTimeout(active.expiry);
    active = null;
  }

  function start(id, handlers) {
    stop();
    if (!paired) return;
    const path = "/matches/" + encodeURIComponent(id);
    const wait = { started: Date.now(), next: null, expiry: null, shown: false, busy: false };
    active = wait;
    async function poll() {
      if (active !== wait || wait.busy) return;
      clearTimeout(wait.next);
      const age = Date.now() - wait.started;
      if (age >= 15 * 60_000) return;
      if (!document.hidden) {
        wait.busy = true;
        const response = await api(path + (wait.shown ? "?status=1" : ""));
        const result = response?.ok ? await response.json().catch(() => null) : null;
        wait.busy = false;
        if (active !== wait) return;
        if (result?.state === "official" || result?.state === "mismatch") {
          wait.busy = true;
          const drawn = await handlers.official();
          wait.busy = false;
          if (active === wait && wait.shown && !drawn) handlers.expire();
        } else if (wait.shown && (response?.status === 404 || response?.status === 503)) {
          handlers.expire();
        } else if (!wait.shown && result?.state === "pending" && result.match_info &&
            result.expires_at > Date.now() && handlers.preview(result)) {
          wait.shown = true;
          wait.expiry = setTimeout(() => {
            if (active === wait) handlers.expire();
          }, result.expires_at - Date.now());
        }
      }
      if (active === wait) wait.next = setTimeout(poll, wait.shown || age >= 25_000 ? 30_000 : 5000);
    }
    wait.poll = poll;
    void poll();
  }

  document.addEventListener("visibilitychange", () => { if (!document.hidden) void active?.poll(); });
  return {
    ready, start, stop, isPaired: () => paired,
    onChange(callback) { change = callback; },
  };
})();
