"use strict";

// Website presentation only. Card faces and backs are opaque elements supplied by PMCard.
window.DealAnimation = (() => {
  const tierOrder = ["middle", "common", "rare", "epic", "legendary", "mythical"];
  const soundKey = "pm.deal.sound";
  const glide = "cubic-bezier(.2,.75,.25,1)";

  function read(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { /* use this page's state */ }
  }

  function snapSound() {
    let audio, snap;
    const active = new Set();
    return {
      ready() {
        if (!window.AudioContext || (navigator.userActivation && !navigator.userActivation.hasBeenActive)) return;
        try {
          audio ||= new AudioContext();
          if (audio.state === "suspended") audio.resume().catch(() => {});
        } catch (_) { /* audio can be unavailable */ }
      },
      play() {
        if (audio?.state !== "running") return;
        if (!snap) {
          snap = audio.createBuffer(1, Math.ceil(audio.sampleRate * .075), audio.sampleRate);
          const samples = snap.getChannelData(0);
          let noise = 0;
          for (let i = 0; i < samples.length; i++) {
            const t = i / audio.sampleRate;
            noise += .35 * (Math.random() * 2 - 1 - noise);
            const envelope = Math.min(1, t / .002) * Math.exp(-t * 87) * (1 - i / samples.length);
            samples[i] = envelope * (.18 * noise + .07 * Math.sin(2 * Math.PI * 185 * t));
          }
        }
        const source = audio.createBufferSource();
        source.buffer = snap;
        source.connect(audio.destination);
        active.add(source);
        source.addEventListener("ended", () => {
          if (active.delete(source)) source.disconnect();
        }, { once: true });
        source.start();
      },
      stop() {
        for (const source of active) {
          source.stop();
          source.disconnect();
        }
        active.clear();
      },
    };
  }

  function create() {
    const cards = document.getElementById("highlightsHandCards");
    const controls = document.getElementById("highlightsHandControls");
    const skip = document.getElementById("highlightsDealSkip");
    const replay = document.getElementById("highlightsDealReplay");
    const sound = document.getElementById("highlightsDealSound");
    const dialog = document.getElementById("highlightsCardDialog");
    const detail = document.getElementById("highlightsCardDetail");
    const dismiss = document.getElementById("highlightsCardClose");
    const dialogCard = detail.parentElement;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const seen = new Set();
    const audio = snapSound();
    let soundOn = read(soundKey) === "on";
    let entries = [], run, lifted;

    function syncControls() {
      controls.hidden = entries.length === 0;
      skip.hidden = !run;
      replay.hidden = Boolean(run) || reduced.matches || !cards.animate;
      sound.setAttribute("aria-pressed", String(soundOn));
      sound.textContent = soundOn ? "Sound on" : "Sound off";
    }

    function stopDeal() {
      if (!run) return;
      const session = run;
      run = null;
      session.stopWaiting?.();
      for (const animation of session.animations) animation.cancel();
      audio.stop();
    }

    function wait(session, duration) {
      if (run !== session) return Promise.resolve(false);
      return new Promise(resolve => {
        const timer = setTimeout(() => end(true), duration);
        function end(completed) {
          clearTimeout(timer);
          session.stopWaiting = null;
          resolve(completed);
        }
        session.stopWaiting = () => end(false);
      });
    }

    function move(session, element, from, to, duration) {
      const animation = element.animate([{ transform: from }, { transform: to }], { duration, easing: glide });
      element.style.transform = to;
      session.animations.add(animation);
      function complete(done) {
        session.animations.delete(animation);
        return done;
      }
      return animation.finished.then(() => complete(true), () => complete(false));
    }

    function settle() {
      const focusSkip = document.activeElement === skip;
      stopDeal();
      for (const entry of entries) {
        entry.back?.remove();
        entry.back = null;
        delete entry.slot.dataset.face;
        entry.slot.style.removeProperty("transform");
        entry.slot.style.removeProperty("z-index");
        entry.visual.style.removeProperty("transform");
      }
      cards.inert = false;
      cards.dataset.dealStage = "settled";
      syncControls();
      if (focusSkip) (replay.hidden ? entries[0]?.button : replay)?.focus({ preventScroll: true });
    }

    function dealPositions() {
      const bounds = entries.map(entry => entry.slot.getBoundingClientRect());
      const first = bounds[0];
      const lastOnRow = bounds.findLast(rect => Math.abs(rect.top - first.top) < 1);
      const scale = first.width / entries[0].slot.offsetWidth || 1;
      const centerX = (first.left + lastOnRow.right) / 2;
      const centerY = first.top + first.height / 2;
      const count = entries.length;
      const step = Math.min(106, Math.max(0, (lastOnRow.right - first.right) / scale - 36) / Math.max(1, count - 1));
      return bounds.map((rect, index) => {
        const x = (centerX - rect.left - rect.width / 2) / scale;
        const y = (centerY - rect.top - rect.height / 2) / scale;
        const offset = index - (count - 1) / 2;
        const fraction = offset / Math.max(1, (count - 1) / 2);
        const transform = (dx, dy, angle) => `translate(${x + dx}px, ${y + dy}px) rotate(${angle}deg)`;
        return {
          stack: transform(Math.min(index, 5) * 1.8, 6 + Math.min(index, 5) * 1.6, Math.min(index, 5) * 1.1 - 4),
          fan: transform(offset * step, 7 + 26 * fraction ** 2, fraction * 11),
        };
      });
    }

    async function play() {
      if (run || !entries.length || reduced.matches || !cards.animate) return;
      const focusReplay = document.activeElement === replay;
      const session = run = { animations: new Set() };
      if (soundOn) audio.ready();
      cards.inert = true;
      cards.dataset.dealStage = "stack";
      syncControls();
      if (focusReplay) skip.focus({ preventScroll: true });

      for (const entry of entries) {
        entry.back = document.createElement("div");
        entry.back.className = "hl-deal-side hl-deal-back";
        entry.back.append(window.PMCard.renderBack());
        entry.visual.prepend(entry.back);
        entry.slot.dataset.face = "back";
      }
      const positions = dealPositions();
      entries.forEach(({ slot }, index) => {
        slot.style.transform = positions[index].stack;
        slot.style.zIndex = entries.length - index;
      });
      if (!await wait(session, 420)) return;

      cards.dataset.dealStage = "fan";
      for (const [index, { slot }] of entries.entries()) {
        const { stack, fan } = positions[index];
        slot.style.zIndex = entries.length + index;
        const slide = move(session, slot, stack, fan, 185);
        if (soundOn) audio.play();
        if (!await slide || !await wait(session, 15)) return;
      }
      if (!await wait(session, 395)) return;

      const reveal = entries.slice().sort((a, b) => tierOrder.indexOf(a.input.rarity) - tierOrder.indexOf(b.input.rarity));
      cards.dataset.dealStage = "reveal";
      for (const [index, { input, slot, visual }] of reveal.entries()) {
        if ((input.rarity === "legendary" || input.rarity === "mythical") && !await wait(session, 300)) return;
        slot.style.zIndex = entries.length * 2 + index;
        if (!await move(session, visual, "perspective(750px) rotateY(0deg)", "perspective(750px) rotateY(90deg)", 115)) return;
        slot.dataset.face = "front";
        if (!await move(session, visual, "perspective(750px) rotateY(-90deg)", "perspective(750px) rotateY(0deg)", 150) ||
            !await wait(session, 20)) return;
      }

      if (!await wait(session, 180)) return;
      cards.dataset.dealStage = "settling";
      await Promise.all(entries.map(({ slot }, index) => move(session, slot, positions[index].fan, "none", 340)));
      if (run === session) settle();
    }

    function cardLabel({ title, rarity, description, comparison, newBest }) {
      return [title, rarity, description, comparison, newBest ? "New personal best" : ""].filter(Boolean).join(". ");
    }

    function makeEntry(input) {
      const slot = document.createElement("div");
      const visual = document.createElement("div");
      const face = document.createElement("div");
      const button = document.createElement("button");
      slot.className = "hl-deal-slot";
      visual.className = "hl-deal-visual";
      visual.inert = true;
      visual.setAttribute("aria-hidden", "true");
      face.className = "hl-deal-side hl-deal-front";
      face.append(window.PMCard.render(input));
      visual.append(face);
      button.type = "button";
      button.className = "hl-deal-activate";
      button.setAttribute("aria-label", cardLabel(input));
      button.setAttribute("aria-haspopup", "dialog");
      slot.append(visual, button);
      const entry = { input, slot, visual, button, back: null };
      button.addEventListener("click", () => lift(entry));
      return entry;
    }

    function atSlot(slot) {
      const from = slot.getBoundingClientRect(), to = dialog.getBoundingClientRect();
      const x = from.left + (from.width - to.width) / 2 - to.left;
      const y = from.top + (from.height - to.height) / 2 - to.top;
      return `translate(${x}px, ${y}px) scale(${from.width / to.width}, ${from.height / to.height})`;
    }

    function lift(entry) {
      if (run || lifted) return;
      detail.replaceChildren(window.PMCard.render(entry.input));
      dialog.setAttribute("aria-label", cardLabel(entry.input));
      dialog.showModal();
      entry.slot.dataset.lifted = "";
      lifted = { entry, animation: null, closing: false };
      const source = entry.slot.getBoundingClientRect(), size = dialog.getBoundingClientRect();
      const angle = 3 * Math.PI / 180;
      const width = size.width * Math.cos(angle) + size.height * Math.sin(angle);
      const height = size.height * Math.cos(angle) + size.width * Math.sin(angle);
      const scale = Math.min(source.width * 1.8 / size.width, 354 / size.width,
        (innerWidth - 44) / width, (innerHeight - 44) / height);
      const tilted = `rotate(-3deg) scale(${scale})`;
      if (!reduced.matches && dialogCard.animate) {
        lifted.animation = dialogCard.animate([{ transform: atSlot(entry.slot) }, { transform: tilted }],
          { duration: 290, easing: glide });
      }
      dialogCard.style.transform = tilted;
    }

    function closeLift() {
      if (!lifted) return;
      lifted.animation?.cancel();
      delete lifted.entry.slot.dataset.lifted;
      lifted = null;
      dialog.close();
      detail.replaceChildren();
      dialogCard.style.removeProperty("transform");
    }

    function returnCard() {
      if (!lifted || lifted.closing) return;
      const current = lifted;
      if (reduced.matches || !dialogCard.animate) return closeLift();
      const from = getComputedStyle(dialogCard).transform;
      current.closing = true;
      current.animation?.cancel();
      current.animation = dialogCard.animate([{ transform: from }, { transform: atSlot(current.entry.slot) }],
        { duration: 220, easing: glide, fill: "forwards" });
      current.animation.finished.then(() => {
        if (lifted === current) closeLift();
      }, () => {});
    }

    function clear() {
      stopDeal();
      closeLift();
      entries = [];
      cards.replaceChildren();
      cards.inert = false;
      delete cards.dataset.dealStage;
      syncControls();
    }

    function show(key, inputs) {
      entries = inputs.map(makeEntry);
      cards.replaceChildren(...entries.map(entry => entry.slot));
      const storageKey = `pm.deal.seen.${key}`;
      const alreadySeen = seen.has(key) || read(storageKey) === "1";
      seen.add(key);
      if (!alreadySeen) write(storageKey, "1");
      if (!alreadySeen && !reduced.matches && cards.animate && entries.length) void play();
      else settle();
    }

    function consumeSkip(event) {
      if (!run) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      settle();
    }

    window.addEventListener("click", consumeSkip, true);
    window.addEventListener("auxclick", consumeSkip, true);
    window.addEventListener("mousedown", event => {
      if (!run) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    window.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (!lifted) return consumeSkip(event);
      event.preventDefault();
      event.stopImmediatePropagation();
      returnCard();
    }, true);
    window.addEventListener("resize", () => { if (run) settle(); });
    window.addEventListener("pagehide", () => {
      if (run) settle();
      closeLift();
    });
    reduced.addEventListener("change", () => {
      if (reduced.matches && run) settle();
      else syncControls();
      if (reduced.matches && lifted?.closing) closeLift();
    });
    replay.addEventListener("click", () => { void play(); });
    sound.addEventListener("click", () => {
      soundOn = !soundOn;
      write(soundKey, soundOn ? "on" : "off");
      if (soundOn) audio.ready();
      else audio.stop();
      syncControls();
    });
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      returnCard();
    });
    dialog.addEventListener("click", event => {
      if (event.target === dismiss || event.target === dialog) returnCard();
    });
    syncControls();
    return { show, clear };
  }

  return { create };
})();
