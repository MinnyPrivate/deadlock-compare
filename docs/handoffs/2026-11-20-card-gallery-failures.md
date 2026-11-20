# Highlights card gallery layout check

120 findings across 124 rendered card states in Chromium 158.0.8127.36.

| Width | State | Rendered cards | N/A tiles | Findings |
| --- | --- | --- | --- | --- |
| website | rest | 31 | 9 | 30 |
| website | hover | 31 | 9 | 34 |
| ingame | rest | 31 | 9 | 26 |
| ingame | hover | 31 | 9 | 30 |

The check scrolls each card into the viewport, compares visible text fragments, and checks clipping dimensions. Measurements are in screen pixels with a 1 px tolerance. Report order uses the largest overflow edge or the shorter overlap dimension.

| Match | Card | State | Width | Failure | Elements | Pixels |
| --- | --- | --- | --- | --- | --- | --- |
| 136941488 | bests | rest | ingame | card overflow | div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[3] > small[4] “Next best 12.4k, Ivy” | bottom 36.3 px · text 86.8 × 12 px · card 374.8 × 172.9 px |
| 136941488 | bests | hover | ingame | card overflow | div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[3] > small[4] “Next best 12.4k, Ivy” | bottom 36.3 px · text 86.8 × 12 px · card 374.8 × 172.9 px |
| 136941488 | bests | rest | website | card overflow | div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[3] > small[4] “Next best 12.4k, Ivy” | bottom 33.4 px · text 106.8 × 14 px · card 461.3 × 230.1 px |
| 136941488 | bests | hover | website | card overflow | div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[3] > small[4] “Next best 12.4k, Ivy” | bottom 33.4 px · text 106.8 × 14 px · card 461.3 × 230.1 px |
| 136941488 | bests | rest | website | text overlap | h3.hl-headline[2] > b.hl-big.summary-gold[1] “51.6k” / div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[1] > span[1] “Last hits” | 57.1 × 18 px |
| 136941488 | bests | hover | website | text overlap | h3.hl-headline[2] > b.hl-big.summary-gold[1] “51.6k” / div.hl-visual[3] > ul.hl-best-list.is-single[1] > li.gallery-force-target[1] > span[1] “Last hits” | 57.1 × 18 px |
| 136941488 | bests | rest | ingame | card overflow | div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[3] > b[2] “36.4k” | bottom 14.1 px · text 54.5 × 27 px · card 374.8 × 172.9 px |
| 136941488 | bests | hover | ingame | card overflow | div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[3] > b[2] “36.4k” | bottom 14.1 px · text 54.5 × 27 px · card 374.8 × 172.9 px |
| 136941488 | bests | rest | ingame | text overlap | h3.hl-headline[2] > b.hl-big.summary-gold[1] “51.6k” / div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[1] > span[1] “Last hits” | 46.4 × 14 px |
| 136941488 | bests | hover | ingame | text overlap | h3.hl-headline[2] > b.hl-big.summary-gold[1] “51.6k” / div.hl-visual[3] > ul.hl-best-list.is-single[1] > li.gallery-force-target[1] > span[1] “Last hits” | 46.4 × 14 px |
| 136941488 | bests | rest | ingame | text overlap | h3.hl-headline[2] > b.hl-big.summary-gold[1] “51.6k” / div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[1] > small[4] “Next best 202, Lady Geist” | 111.6 × 12 px |
| 136941488 | bests | hover | ingame | text overlap | h3.hl-headline[2] > b.hl-big.summary-gold[1] “51.6k” / div.hl-visual[3] > ul.hl-best-list.is-single[1] > li.gallery-force-target[1] > small[4] “Next best 202, Lady Geist” | 111.6 × 12 px |
| 136941488 | bests | rest | ingame | card overflow | div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[3] > span[1] “Objective damage” | bottom 11.1 px · text 101.7 × 14 px · card 374.8 × 172.9 px |
| 136941488 | bests | hover | ingame | card overflow | div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[3] > span[1] “Objective damage” | bottom 11.1 px · text 101.7 × 14 px · card 374.8 × 172.9 px |
| 136941488 | bests | rest | website | card overflow | div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[3] > b[2] “36.4k” | bottom 7.4 px · text 67.1 × 34 px · card 461.3 × 230.1 px |
| 136941488 | bests | hover | website | card overflow | div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[3] > b[2] “36.4k” | bottom 7.4 px · text 67.1 × 34 px · card 461.3 × 230.1 px |
| 136941488 | bests | rest | website | text overlap | h3.hl-headline[2] > b.hl-big.summary-gold[1] “51.6k” / div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[1] > small[4] “Next best 202, Lady Geist” | 137.4 × 7.4 px |
| 136941488 | bests | hover | website | text overlap | h3.hl-headline[2] > b.hl-big.summary-gold[1] “51.6k” / div.hl-visual[3] > ul.hl-best-list.is-single[1] > li.gallery-force-target[1] > small[4] “Next best 202, Lady Geist” | 137.4 × 7.4 px |
| 136941488 | place | rest | ingame | text overlap | h3.hl-headline[2] > b.hl-big[1] “1st” / div.hl-body[3] > p.hl-sub[1] “1.4 est. pts ahead of Holliday” | 79.5 × 5.6 px |
| 138427763 | place | rest | ingame | text overlap | h3.hl-headline[2] > b.hl-big[1] “2nd” / div.hl-body[3] > p.hl-sub[1] “4.3 est. pts behind Baba · best on Hidden King” (fragment 1) | 97.8 × 5.6 px |
| 137018749 | place | rest | ingame | text overlap | h3.hl-headline[2] > b.hl-big[1] “5th” / div.hl-body[3] > p.hl-sub[1] “0.1 est. pts behind Paradox · best on Hidden King” (fragment 1) | 96.6 × 5.6 px |
| 139859134 | place | rest | ingame | text overlap | h3.hl-headline[2] > b.hl-big[1] “8th” / div.hl-body[3] > p.hl-sub[1] “0.5 est. pts behind Rat King” | 96.3 × 5.6 px |
| 136941488 | place | hover | ingame | text overlap | h3.hl-headline[2] > b.hl-big[1] “1st” / div.hl-body[3] > p.hl-more[2] > span[1] “Biggest boost” | 74.1 × 5.6 px |
| 138427763 | place | hover | ingame | text overlap | h3.hl-headline[2] > b.hl-big[1] “2nd” / div.hl-body[3] > p.hl-more[2] > span[1] “Biggest boost” | 74.1 × 5.6 px |
| 138427763 | place | hover | ingame | text overlap | h3.hl-headline[2] > b.hl-big[1] “2nd” / div.hl-body[3] > p.hl-more[2] > span[1] > b.summary-up[1] “Hero damage + ally healing +2.0” (fragment 1) | 20.9 × 5.6 px |
| 137018749 | place | hover | ingame | text overlap | h3.hl-headline[2] > b.hl-big[1] “5th” / div.hl-body[3] > p.hl-more[2] > span[1] “Biggest boost” | 74.1 × 5.6 px |
| 137018749 | place | hover | ingame | text overlap | h3.hl-headline[2] > b.hl-big[1] “5th” / div.hl-body[3] > p.hl-more[2] > span[1] > b.summary-up[1] “Kills +1.8” | 19.7 × 5.6 px |
| 139859134 | place | hover | ingame | text overlap | h3.hl-headline[2] > b.hl-big[1] “8th” / div.hl-body[3] > p.hl-more[2] > span[1] “Biggest boost” | 74.1 × 5.6 px |
| 139859134 | place | hover | ingame | text overlap | h3.hl-headline[2] > b.hl-big[1] “8th” / div.hl-body[3] > p.hl-more[2] > span[1] > b.summary-up[1] “Deaths +0.8” | 19.5 × 5.6 px |
| 136941488 | place | rest | website | text overlap | h3.hl-headline[2] > b.hl-big[1] “1st” / div.hl-body[3] > p.hl-sub[1] “1.4 est. pts ahead of Holliday” | 97.8 × 5 px |
| 136941488 | rival | rest | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] “4” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Wraith vs them” | 35.9 × 5 px |
| 136941488 | rival | rest | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] > i[1] “–” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Wraith vs them” | 42.5 × 5 px |
| 136941488 | rival | rest | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] “0” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Wraith vs them” | 35.2 × 5 px |
| 138427763 | place | rest | website | text overlap | h3.hl-headline[2] > b.hl-big[1] “2nd” / div.hl-body[3] > p.hl-sub[1] “4.3 est. pts behind Baba · best on Hidden King” (fragment 1) | 120.3 × 5 px |
| 138427763 | rival | rest | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] “1” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Lash vs them” | 25.6 × 5 px |
| 138427763 | rival | rest | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] > i[1] “–” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Lash vs them” | 42.5 × 5 px |
| 138427763 | rival | rest | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] “2” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Lash vs them” | 31.3 × 5 px |
| 137018749 | place | rest | website | text overlap | h3.hl-headline[2] > b.hl-big[1] “5th” / div.hl-body[3] > p.hl-sub[1] “0.1 est. pts behind Paradox · best on Hidden King” (fragment 1) | 118.9 × 5 px |
| 137018749 | rival | rest | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] “3” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Billy vs them” | 33.9 × 5 px |
| 137018749 | rival | rest | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] > i[1] “–” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Billy vs them” | 42.5 × 5 px |
| 137018749 | rival | rest | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] “2” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Billy vs them” | 31.3 × 5 px |
| 139859134 | place | rest | website | text overlap | h3.hl-headline[2] > b.hl-big[1] “8th” / div.hl-body[3] > p.hl-sub[1] “0.5 est. pts behind Rat King” | 118.6 × 5 px |
| 136941488 | place | hover | website | text overlap | h3.hl-headline[2] > b.hl-big[1] “1st” / div.hl-body[3] > p.hl-more[2] > span[1] “Biggest boost” | 91.3 × 5 px |
| 136941488 | rival | hover | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] “4” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Wraith vs them” | 35.9 × 5 px |
| 136941488 | rival | hover | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] > i[1] “–” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Wraith vs them” | 42.5 × 5 px |
| 136941488 | rival | hover | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] “0” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Wraith vs them” | 35.2 × 5 px |
| 138427763 | place | hover | website | text overlap | h3.hl-headline[2] > b.hl-big[1] “2nd” / div.hl-body[3] > p.hl-more[2] > span[1] “Biggest boost” | 91.3 × 5 px |
| 138427763 | place | hover | website | text overlap | h3.hl-headline[2] > b.hl-big[1] “2nd” / div.hl-body[3] > p.hl-more[2] > span[1] > b.summary-up[1] “Hero damage + ally healing +2.0” (fragment 1) | 25.7 × 5 px |
| 138427763 | rival | hover | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] “1” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Lash vs them” | 25.6 × 5 px |
| 138427763 | rival | hover | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] > i[1] “–” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Lash vs them” | 42.5 × 5 px |
| 138427763 | rival | hover | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] “2” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Lash vs them” | 31.3 × 5 px |
| 137018749 | place | hover | website | text overlap | h3.hl-headline[2] > b.hl-big[1] “5th” / div.hl-body[3] > p.hl-more[2] > span[1] “Biggest boost” | 91.3 × 5 px |
| 137018749 | place | hover | website | text overlap | h3.hl-headline[2] > b.hl-big[1] “5th” / div.hl-body[3] > p.hl-more[2] > span[1] > b.summary-up[1] “Kills +1.8” | 24.2 × 5 px |
| 137018749 | rival | hover | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] “3” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Billy vs them” | 33.9 × 5 px |
| 137018749 | rival | hover | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] > i[1] “–” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Billy vs them” | 42.5 × 5 px |
| 137018749 | rival | hover | website | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] “2” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Billy vs them” | 31.3 × 5 px |
| 139859134 | place | hover | website | text overlap | h3.hl-headline[2] > b.hl-big[1] “8th” / div.hl-body[3] > p.hl-more[2] > span[1] “Biggest boost” | 91.3 × 5 px |
| 139859134 | place | hover | website | text overlap | h3.hl-headline[2] > b.hl-big[1] “8th” / div.hl-body[3] > p.hl-more[2] > span[1] > b.summary-up[1] “Deaths +0.8” | 23.9 × 5 px |
| 136941488 | souls | rest | ingame | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top[1] > small[3] | vertical 4 px · scroll 40.8 × 11.9 px · client 40.8 × 8 px |
| 138427763 | souls | rest | ingame | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top[1] > small[3] | vertical 4 px · scroll 40.8 × 11.9 px · client 40.8 × 8 px |
| 137018749 | souls | rest | ingame | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top[1] > small[3] | vertical 4 px · scroll 40.8 × 11.9 px · client 40.8 × 8 px |
| 139859134 | souls | rest | ingame | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top[1] > small[3] | vertical 4 px · scroll 40.8 × 11.9 px · client 40.8 × 8 px |
| 136941488 | souls | hover | ingame | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top.gallery-force-target[1] > small[3] | vertical 4 px · scroll 40.8 × 11.9 px · client 40.8 × 8 px |
| 138427763 | souls | hover | ingame | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top.gallery-force-target[1] > small[3] | vertical 4 px · scroll 40.8 × 11.9 px · client 40.8 × 8 px |
| 137018749 | souls | hover | ingame | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top.gallery-force-target[1] > small[3] | vertical 4 px · scroll 40.8 × 11.9 px · client 40.8 × 8 px |
| 139859134 | souls | hover | ingame | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top.gallery-force-target[1] > small[3] | vertical 4 px · scroll 40.8 × 11.9 px · client 40.8 × 8 px |
| 136941488 | souls | rest | website | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top[1] > small[3] | vertical 3.9 px · scroll 50.2 × 13.6 px · client 50.2 × 9.7 px |
| 138427763 | souls | rest | website | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top[1] > small[3] | vertical 3.9 px · scroll 50.2 × 13.6 px · client 50.2 × 9.7 px |
| 137018749 | souls | rest | website | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top[1] > small[3] | vertical 3.9 px · scroll 50.2 × 13.6 px · client 50.2 × 9.7 px |
| 139859134 | souls | rest | website | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top[1] > small[3] | vertical 3.9 px · scroll 50.2 × 13.6 px · client 50.2 × 9.7 px |
| 136941488 | souls | hover | website | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top.gallery-force-target[1] > small[3] | vertical 3.9 px · scroll 50.2 × 13.6 px · client 50.2 × 9.7 px |
| 138427763 | souls | hover | website | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top.gallery-force-target[1] > small[3] | vertical 3.9 px · scroll 50.2 × 13.6 px · client 50.2 × 9.7 px |
| 137018749 | souls | hover | website | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top.gallery-force-target[1] > small[3] | vertical 3.9 px · scroll 50.2 × 13.6 px · client 50.2 × 9.7 px |
| 139859134 | souls | hover | website | element clips text | div.hl-visual[4] > div.hl-cols[1] > div.hl-col.is-top.gallery-force-target[1] > small[3] | vertical 3.9 px · scroll 50.2 × 13.6 px · client 50.2 × 9.7 px |
| 136941488 | bests | rest | website | card overflow | div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[3] > span[1] “Objective damage” | bottom 3.4 px · text 125.3 × 18 px · card 461.3 × 230.1 px |
| 136941488 | bests | hover | website | card overflow | div.hl-visual[3] > ul.hl-best-list.is-single[1] > li[3] > span[1] “Objective damage” | bottom 3.4 px · text 125.3 × 18 px · card 461.3 × 230.1 px |
| 136941488 | place | hover | website | text overlap | h3.hl-headline[2] > b.hl-big[1] “1st” / div.hl-body[3] > p.hl-more[2] > span[1] > b.summary-up[1] “Objective damage +1.3” (fragment 1) | 3.2 × 5 px |
| 136941488 | rival | rest | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] “4” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Wraith vs them” | 24.5 × 2.7 px |
| 136941488 | rival | rest | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] > i[1] “–” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Wraith vs them” | 29 × 2.7 px |
| 136941488 | rival | rest | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] “0” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Wraith vs them” | 24 × 2.7 px |
| 138427763 | rival | rest | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] “1” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Lash vs them” | 17.5 × 2.7 px |
| 138427763 | rival | rest | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] > i[1] “–” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Lash vs them” | 29 × 2.7 px |
| 138427763 | rival | rest | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] “2” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Lash vs them” | 21.3 × 2.7 px |
| 137018749 | rival | rest | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] “3” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Billy vs them” | 23.1 × 2.7 px |
| 137018749 | rival | rest | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] > i[1] “–” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Billy vs them” | 29 × 2.7 px |
| 137018749 | rival | rest | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > b[1] “2” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score[2] > small[2] “Kills, Billy vs them” | 21.3 × 2.7 px |
| 136941488 | rival | hover | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] “4” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Wraith vs them” | 24.5 × 2.7 px |
| 136941488 | rival | hover | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] > i[1] “–” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Wraith vs them” | 29 × 2.7 px |
| 136941488 | rival | hover | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] “0” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Wraith vs them” | 24 × 2.7 px |
| 138427763 | rival | hover | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] “1” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Lash vs them” | 17.5 × 2.7 px |
| 138427763 | rival | hover | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] > i[1] “–” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Lash vs them” | 29 × 2.7 px |
| 138427763 | rival | hover | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] “2” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Lash vs them” | 21.3 × 2.7 px |
| 137018749 | rival | hover | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] “3” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Billy vs them” | 23.1 × 2.7 px |
| 137018749 | rival | hover | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] > i[1] “–” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Billy vs them” | 29 × 2.7 px |
| 137018749 | rival | hover | ingame | text overlap | div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > b[1] “2” / div.hl-visual[4] > div.hl-duel[1] > div.hl-duel-score.gallery-force-target[2] > small[2] “Kills, Billy vs them” | 21.3 × 2.7 px |
| 136941488 | place | hover | ingame | text overlap | h3.hl-headline[2] > b.hl-big[1] “1st” / div.hl-body[3] > p.hl-more[2] > span[1] > b.summary-up[1] “Objective damage +1.3” (fragment 1) | 2.6 × 5.6 px |
| 136941488 | rival | rest | website | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 2 px · scroll 86 × 41.9 px · client 86 × 39.9 px |
| 138427763 | rival | rest | website | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 2 px · scroll 86.9 × 41.9 px · client 86.9 × 39.9 px |
| 137018749 | rival | rest | website | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 2 px · scroll 120.6 × 41.9 px · client 120.6 × 39.9 px |
| 139859134 | rival | rest | website | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 2 px · scroll 148.8 × 41.9 px · client 148.8 × 39.9 px |
| 136941488 | rival | hover | website | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 2 px · scroll 86 × 41.9 px · client 86 × 39.9 px |
| 138427763 | rival | hover | website | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 2 px · scroll 86.9 × 41.9 px · client 86.9 × 39.9 px |
| 137018749 | rival | hover | website | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 2 px · scroll 120.6 × 41.9 px · client 120.6 × 39.9 px |
| 139859134 | rival | hover | website | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 2 px · scroll 148.8 × 41.9 px · client 148.8 × 39.9 px |
| 136941488 | rival | rest | ingame | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 1.6 px · scroll 69.9 × 34 px · client 69.9 × 32.4 px |
| 138427763 | rival | rest | ingame | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 1.6 px · scroll 70.6 × 34 px · client 70.6 × 32.4 px |
| 137018749 | rival | rest | ingame | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 1.6 px · scroll 98 × 34 px · client 98 × 32.4 px |
| 139859134 | rival | rest | ingame | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 1.6 px · scroll 120.9 × 34 px · client 120.9 × 32.4 px |
| 136941488 | rival | hover | ingame | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 1.6 px · scroll 69.9 × 34 px · client 69.9 × 32.4 px |
| 138427763 | rival | hover | ingame | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 1.6 px · scroll 70.6 × 34 px · client 70.6 × 32.4 px |
| 137018749 | rival | hover | ingame | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 1.6 px · scroll 98 × 34 px · client 98 × 32.4 px |
| 139859134 | rival | hover | ingame | element clips text | h3.hl-headline[2] > span.hl-rival-name[1] > span.hl-who[1] > b.summary-name[1] | vertical 1.6 px · scroll 120.9 × 34 px · client 120.9 × 32.4 px |
| 136941488 | place | rest | website | text overlap | header.hl-head[1] > span.hl-kicker[1] “Valve MVP” / h3.hl-headline[2] > b.hl-big[1] “1st” | 97.8 × 1.6 px |
| 138427763 | place | rest | website | text overlap | header.hl-head[1] > span.hl-kicker[1] “Valve MVP” / h3.hl-headline[2] > b.hl-big[1] “2nd” | 97.9 × 1.6 px |
| 137018749 | place | rest | website | text overlap | header.hl-head[1] > span.hl-kicker[1] “Valve key player” / h3.hl-headline[2] > b.hl-big[1] “5th” | 118.9 × 1.6 px |
| 139859134 | place | rest | website | text overlap | header.hl-head[1] > span.hl-kicker[1] “Estimated lobby place” / h3.hl-headline[2] > b.hl-big[1] “8th” | 118.6 × 1.6 px |
| 136941488 | place | hover | website | text overlap | header.hl-head[1] > span.hl-kicker[1] “Valve MVP” / h3.hl-headline[2] > b.hl-big[1] “1st” | 97.8 × 1.6 px |
| 138427763 | place | hover | website | text overlap | header.hl-head[1] > span.hl-kicker[1] “Valve MVP” / h3.hl-headline[2] > b.hl-big[1] “2nd” | 97.9 × 1.6 px |
| 137018749 | place | hover | website | text overlap | header.hl-head[1] > span.hl-kicker[1] “Valve key player” / h3.hl-headline[2] > b.hl-big[1] “5th” | 118.9 × 1.6 px |
| 139859134 | place | hover | website | text overlap | header.hl-head[1] > span.hl-kicker[1] “Estimated lobby place” / h3.hl-headline[2] > b.hl-big[1] “8th” | 118.6 × 1.6 px |
