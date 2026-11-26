"use strict";

// Load the public norm index once and only fetch a hero table when viewing that hero.
window.HighlightsHand = (() => {
  const files = new Map();

  function normFile(file) {
    if (!files.has(file)) {
      const request = getJson(`data/deal-norms/${file}.json`).then(result => {
        if (!result.ok || !result.body) throw new Error("Card norms unavailable");
        return result.body;
      }).catch(error => {
        files.delete(file);
        throw error;
      });
      files.set(file, request);
    }
    return files.get(file);
  }

  async function deal(match, player) {
    const index = await normFile("index");
    const id = player.heroId;
    const heroes = index.heroes.includes(id) ? { [id]: await normFile(`hero_${id}`) } : {};
    return window.PM_DEAL.dealMatch(match, player.slot, { index, heroes }, {
      score: { scoreMatch: window.PM_SCORE.scoreMatch, table: window.HERO_TABLE },
      heroName: () => player.hero,
    });
  }

  // Map dealer facts to the card component's inputs in deal order.
  function cardInput(card, player) {
    return {
      id: card.card_id,
      rarity: card.tier,
      suit: card.suit,
      rank: card.corner_rank,
      hero: player.heroId,
      heroName: player.hero,
      title: card.title,
      value: card.value_text,
      stat: card.unit,
      comparison: card.percentile_text,
      description: card.line,
      bad: card.side === "bad",
      newBest: card.marks.includes("new_best"),
    };
  }

  return { deal, cardInput };
})();
