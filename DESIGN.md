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

## 3. Polish rules (borrowed from Anthropic's frontend-design skill, kept inside the look)

These are the parts of that skill that fit. Its advice to pick bold, unusual fonts, palettes and layouts does not apply here.

1. **One main thing per panel.** Each panel has one primary number or name at the largest size, and everything else steps down in size and weight. Do not give three things equal weight.
2. **Contrast floor.** Text that carries information should stay at or above about 0.6 opacity of `--offWhite`. Below that is only for decoration that nobody needs to read. Tiny text (under 14 units) should stay at or above 0.7.
3. **Visible focus.** Every button, tab, row and portrait that can be clicked shows a clear outline on keyboard focus, like `.player:focus-visible` does now.
4. **Reduced motion.** Respect `prefers-reduced-motion`. Motion is short (about 150 ms or less), reacts to something the user did, and never plays on its own.
5. **Lines and dividers mean something.** Use them to separate groups or show a scale, not as decoration. Numbering only for real sequences.
6. **Small caps labels are fine** (the game uses them for tabs and menu titles). Keep them to short labels, never sentences, and do not stack a label over content that explains itself.
7. **Empty, waiting and error states** say what is happening, what the user can do about it, and offer one clear action. The waiting screen is the model.
8. **Copy.** Write from the user's side, in active voice, with one name per thing everywhere (for example "Souls Dropped on Death" is always that).
9. **Readable at the real size.** Text stays sharp (the page scales with CSS `zoom`) and long lines stay under about 80 characters.

## 4. Known gaps to fix first (found reading `style.css` on main)

This is the to-do list for the first polish pass. Each fix gets a before and after screenshot.

- Faint text: `.optionLabel` and `.lineHint` sit at 0.35 opacity, `.lbl`, `.lvFoot` and some other footnotes at 0.4 to 0.45. Raise the ones that carry information.
- Focus: only `.player` has a visible keyboard focus style. Tabs, option buttons, dropdown rows, MVP rows and matchup cells need one.
- Reduced motion: the dropdown fade (`ddIn`) and the hover transitions ignore `prefers-reduced-motion`.
- Hierarchy inside the MVP panel and Matchups side panel: check that the score, the name and the verdict read in that order.

## 5. Phone layout (parked)

Not started and not urgent. When it comes: a separate stacked layout below about 900 px wide, with the desktop stage left exactly as it is. Do not try to make the scaled 1920 stage responsive. Needs its own mockups and Zachary's pick first.

## 6. How to make a visual change

1. Compare against Valve's native screen (and the CSS values it uses) before inventing anything.
2. Take before and after screenshots at 1920 by 1080 and put them in the PR.
3. Keep PRs to one visual topic so one can be undone on its own.
4. If a change touches something in section 1, ask first.

## 7. For Codex and Claude threads

Mention this file in any prompt that touches the site's look. If a task seems to need breaking a rule here, stop and ask instead of guessing.
