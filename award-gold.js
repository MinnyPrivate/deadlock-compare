(() => {
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const motion = matchMedia("(prefers-reduced-motion: no-preference) and (forced-colors: none)");
  if (!window.IntersectionObserver || root.classList.contains("profileEmbed") ||
      params.get("embed") === "1" || params.get("ingame") === "1") return;

  const selector = ".goldMark";
  const cap = 8;
  const threshold = 0.1;
  const observed = new Set();
  const visible = new Set();
  const active = new Map();
  const intersections = new IntersectionObserver(entries => {
    for (const { target, intersectionRatio } of entries) {
      if (!observed.has(target)) continue;
      if (intersectionRatio >= threshold) visible.add(target);
      else visible.delete(target);
    }
    updateAnimations();
  }, { threshold });
  const mutations = new MutationObserver(records => {
    for (const { addedNodes, removedNodes } of records) {
      for (const node of removedNodes) visitMarks(node, forget);
      for (const node of addedNodes) visitMarks(node, watch);
    }
    if ([...active.keys()].some(mark => !visible.has(mark))) updateAnimations();
  });

  function visitMarks(node, visit) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches(selector)) visit(node);
    node.querySelectorAll(selector).forEach(visit);
  }

  function watch(mark) {
    if (!root.contains(mark) || observed.has(mark)) return;
    observed.add(mark);
    intersections.observe(mark);
  }

  function forget(mark) {
    observed.delete(mark);
    visible.delete(mark);
    intersections.unobserve(mark);
  }

  function updateAnimations() {
    for (const mark of active.keys()) {
      if (visible.has(mark)) continue;
      mark.classList.remove("is-glinting");
      active.delete(mark);
    }
    const phases = new Set(active.values());
    for (const mark of visible) {
      if (active.size >= cap) break;
      if (active.has(mark)) continue;
      // Keep each slot on a different phase even after scrolling swaps in new marks.
      let slot = 0;
      while (phases.has(slot)) slot += 1;
      phases.add(slot);
      mark.style.setProperty("--gold-phase", `${-slot * 0.75}s`);
      mark.classList.add("is-glinting");
      active.set(mark, slot);
    }
  }

  function syncMotion() {
    if (motion.matches) {
      root.querySelectorAll(selector).forEach(watch);
      mutations.observe(root, { childList: true, subtree: true });
      return;
    }
    mutations.disconnect();
    intersections.disconnect();
    observed.clear();
    visible.clear();
    updateAnimations();
  }

  motion.addEventListener("change", syncMotion);
  syncMotion();
})();
