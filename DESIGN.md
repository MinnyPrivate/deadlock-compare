# Postmortem design guide

Read this before changing anything visual on the site or the in-game overlay. It is written for people and for AI helpers (Claude threads and Codex).

The short version: **Postmortem should look like Deadlock's own post-match screen.** Do not redesign the look. Make it clearer, more readable and more consistent inside that look.

## 1. The look is locked

Change these only with Zachary's explicit yes.

- **Fonts.** Radiance (body and labels), VALVE Oracle (headings, numbers, scores), VALVE Pulp (the clock and tooltip titles). They are Valve's, loaded from `assets/fonts/`. Do not add other typefaces.
- **Palette.** The tokens at the top of `style.css`: `--offWhite` #FFEFD7, `--offBlack` #10130D, team 1 Amber #D4860B, team 2 Sapphire #4D75C3, plus their Bright and Dark variants. New colors need a reason; reuse these first.
- **Layout units.** The page is a 1920 by 996 stage laid out in Deadlock's 1080p units and scaled to the window (see the README). Sizes copy Valve's `match_details_graphs.css` and `citadel_base_styles.css`. When Valve has a native version of something, copy its measurements, do not invent new ones.
- **Background.** The game's post-match texture with the dark vignette.
- **Components.** The graph type dropdown, the option buttons, the round portraits on team coins, the one-row-per-hero hover readout and the rank badges all imitate the game's own. Keep them looking native.
- **Tone of the text.** Blunt and a little funny is fine for verdicts and tags. Plain and exact everywhere else. No em dashes in anything the user reads.

## 2. What color means

Color carries meaning here, so do not use it for decoration.

| Color | Means |
| --- | --- |
| Team amber or sapphire (`--tc`) | That team or that team's player. Nothing else. |
| Gold #FFED79 | Best in the lobby, top rank, a key badge. |
| Green #58D86A and red #E8604C | Positive and negative against the hero average. |
| Red #ff8a7a | An error message. |
| Yellow #FFD23F | A stale or experimental warning. |
| Mint #70F8C1 | The Mid Boss marker. |

Green and red are never the only cue. Under deuteranopia and protanopia they look alike (both olive), separated only by brightness (about 1.8 to 1). Every green or red value also carries a sign (+ or -), an up or down arrow, or a word. Tooltips always spell out Above average or Below average.

## 2b. Scannable numbers

1. Color goes on the one number that answers "is this good" in a row or panel. Supporting numbers stay `--offWhite` at the contrast floor.
2. Results and rankings use a word plus color (Victory, Defeat, #2 of 12), never color alone.
3. Deltas always show a sign.
4. One big number with a small label above and a smaller subline below.
5. Add a thin bar next to a count or rate when "how much more" matters.
6. Keep stat columns aligned across rows.
7. Tags are short text pills (words, not icons), one colored cue each.

Where the colored number sits today (change a pick only with Zachary's yes):

| Panel | Colored number | Everything else |
| --- | --- | --- |
| MVP list row, Valve score | The score: sign, triangle, green or red | Name, rank and bar plain |
| MVP panel header | None. Big score is white with a sign | |
| MVP stat table | The Points column: sign, triangle, green or red | Value white, hero average dim |
| When they contributed | The Before and After number | Rank text plain. These two grades are on their own scale and do not add up to the total |
| MVP Impact and Raw | Gold on a lobby-best value only | Score white |
| Matchups | None. Team colors say who dealt it, the winner's number is bolder | |
| Lane Stats | The verdict pill: a word plus gold or red | |
| Graphs | None. Line color is the player, not good or bad | |

## 3. Polish rules (borrowed from Anthropic's frontend-design skill, kept inside the look)

These are the parts of that skill that fit. Its advice to pick bold, unusual fonts, palettes and layouts does not apply here.

1. **One main thing per panel.** Each panel has one primary number or name at the largest size, and everything else steps down in size and weight. Do not give three things equal weight.
2. **Contrast floor.** Text that carries information should stay at or above about 0.6 opacity of `--offWhite`. Below that is only for decoration that nobody needs to read. Tiny text (under 14 units) should stay at or above 0.7.
3. **Visible focus.** Everything that can be clicked shows a clear outline on keyboard focus. Buttons keep the browser's own ring, which is big and easy to read (Zachary likes it, so do not replace it). Custom elements that remove it, like the dropdown, get a cream ring drawn outside the element.
4. **Reduced motion.** Respect `prefers-reduced-motion`. Motion is short (about 150 ms or less), reacts to something the user did, and never plays on its own.
5. **Lines and dividers mean something.** Use them to separate groups or show a scale, not as decoration. Numbering only for real sequences.
6. **Small caps labels are fine** (the game uses them for tabs and menu titles). Keep them to short labels, never sentences, and do not stack a label over content that explains itself.
7. **Waits over 10 seconds** show an elapsed timer, the typical range from measured data (currently about 1:20 to 1:50), and a bar that fills against that range and then holds. When the range is exceeded, change the message to "Taking longer than usual" and keep Try Now. No skeleton screens for long waits. Keep the screen short: a title, the range and timer, the bar, and "Checking again in X". Do not explain what deadlock-api or Valve is doing, and show no Try Now button while it is still checking; it appears only after the wait gives up. When the companion app exists, the "Taking longer than usual" line adds a link to it (`COMPANION_APP` in `app.js`). The bar respects `prefers-reduced-motion`. Other empty and error states say what is happening, what the user can do, and offer one clear action.
8. **Copy.** Write from the user's side, in active voice, with one name per thing everywhere (for example "Souls Dropped on Death" is always that).
9. **Readable at the real size.** Text stays sharp (the page scales with CSS `zoom`) and long lines stay under about 80 characters.

## 4. Known gaps

Done in the first polish pass: faint labels raised to the contrast floor, reduced motion, signs and triangles on every green or red value, and the rebuilt waiting screen. Still open:

- Check the hierarchy inside the MVP panel and Matchups side panel (score, name, verdict read in that order) at the phone layout stage.
- Tag chips do not exist yet. When they do, they follow rule 7 of section 2b and the sign and triangle rule.
- A color-blind palette setting (blue for good, orange for bad) is possible later if the signs turn out not to be enough.

## 5. Phone layout (parked)

Not started and not urgent. When it comes: a separate stacked layout below about 900 px wide, with the desktop stage left exactly as it is. Do not try to make the scaled 1920 stage responsive. Needs its own mockups and Zachary's pick first.

## 6. How to make a visual change

1. Compare against Valve's native screen (and the CSS values it uses) before inventing anything.
2. Take before and after screenshots at 1920 by 1080 and put them in the PR.
3. Keep PRs to one visual topic so one can be undone on its own.
4. If a change touches something in section 1, ask first.

## 7. For Codex and Claude threads

Mention this file in any prompt that touches the site's look. If a task seems to need breaking a rule here, stop and ask instead of guessing.
