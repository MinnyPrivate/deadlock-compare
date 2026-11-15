"use strict";
// DLCOMPARE: adds a Compare screen to Deadlock's post-match / match details page.
// The footer gets a Compare icon after the native screen icons. Clicking it shows the Compare page
// (a CitadelHTMLPanel) above the footer. Clicking it again, any native screen icon, or ESC hides it.
//
// v7:
// - Self-healing page. The page sends a heartbeat title (DLC_ALIVE:<match>:<time>) every 2 seconds. If the heartbeats stop while
//   Compare is open (the browser swapped the page for its error screen, like the blue "-105" one), or a load never says it is
//   ready, the browser is hidden, the "Loading" text shows and the page loads again, waiting longer each time.
// - READY and ALIVE titles carry the match ID, so an older page still on screen while a new match loads is never shown.
//   The old 3 second "show it anyway" fallback is gone once the page has spoken (it is what put the -105 screen in view).
// - A native "Loading Postmortem" text fills the gap until the page has drawn, instead of a black screen.
// - The post-game page stays alive between matches, so the script now watches the match ID and preloads every new match,
//   not only the first one of the session. Opening Compare before the game knows the match ID waits for it instead of
//   loading a page with no match.
// v6: hides the whole native carousel and paints the page root black (v5 left the team background art showing).
// v4:
// - The page loads in the background as soon as the match ID is known, and the browser panel stays invisible
//   until the page says it has drawn ("DLC_READY" title), so opening Compare never shows the gray browser fill.
//   Closing keeps the page loaded, so reopening is instant.
// - While Compare is open it acts as the active screen: the native screen behind it is hidden, the native icon
//   looks unselected, and the arrows count from Compare (it sits after the last native screen).
//
// v5:
// - The native screens keep their backdrop under Compare (only their content is hidden), so the footer strip and
//   edges match the game. The footer icons are hooked again on every open, so clicking the icon of the screen
//   Compare was opened from (for example Graphs) closes Compare.
(function () {
    var PAGE = "https://deadlock-compare.minnymods.workers.dev/";
    var READY_FALLBACK_S = 6.0;  // only before the page has ever spoken: show it anyway if it never says it's ready
    var LOAD_TIMEOUT_MS = 12000; // a load that hasn't said READY by then is tried again
    var BEAT_TIMEOUT_MS = 7000;  // no heartbeat for this long while open = the page is gone
    var RETRY_S = [2, 4, 8, 15, 30];
    var wired = false;
    var titlesSeen = false;      // the page has set a DLC_ title at least once this session
    var beatsSeen = false;       // the page sends heartbeats (older pages don't)
    var lastBeat = 0;
    var loadStarted = 0;
    var retries = 0;
    var retryAt = 0;
    var tries = 0;
    var isOpen = false;
    var openedOn = null;
    var loadedFor = null;   // match ID the browser holds
    var hashNow = "";       // viewer hints last passed in the hash
    var ready = false;

    function root() { return $.GetContextPanel(); }
    function find(id) {
        try { return root().FindChildTraverse(id); } catch (e) { return null; }
    }

    function matchId() {
        var lbl = find("MatchID");
        if (!lbl) return null;
        var m = String(lbl.text || "").match(/\d{6,}/);
        return m ? m[0] : null;
    }

    // Best effort hints from the native graph screen: which team is the viewer's, and which hero they played.
    function hasClassUp(p, cls, stop) {
        for (var i = 0; p && i < 8; i++) {
            if (p.BHasClass && p.BHasClass(cls)) return true;
            if (p === stop) break;
            p = p.GetParent();
        }
        return false;
    }
    function friendlyTeam() {
        var s = find("TeamScoreFriendly");
        if (!s) return null;
        var g = find("Graphs");
        if (hasClassUp(s, "team1", g)) return 0;
        if (hasClassUp(s, "team2", g)) return 1;
        return null;
    }
    function localHero() {
        var ctn = find("TeamCtnLeft");
        if (!ctn) return null;
        var kids = ctn.Children ? ctn.Children() : [];
        for (var i = 0; i < kids.length; i++) {
            var k = kids[i];
            var local = k.BHasClass("LocalPlayer") || (k.FindChildTraverse && (function () {
                var c = k.FindChildrenWithClassTraverse ? k.FindChildrenWithClassTraverse("LocalPlayer") : [];
                return c && c.length > 0;
            })());
            if (!local) continue;
            var img = k.FindChildTraverse("HeroImage");
            var badge = k.FindChildTraverse("HeroBadge");
            var cands = [img, badge];
            for (var j = 0; j < cands.length; j++) {
                var p = cands[j];
                if (!p) continue;
                try { if (p.heroid) return { id: p.heroid }; } catch (e) {}
                try { if (p.heroname) return { name: p.heroname }; } catch (e) {}
                try { var a = p.GetAttributeInt && p.GetAttributeInt("heroid", 0); if (a) return { id: a }; } catch (e) {}
            }
        }
        return null;
    }
    function hintHash() {
        var h = [];
        var ft = friendlyTeam();
        if (ft !== null) h.push("friendly=" + ft);
        var me = localHero();
        if (me && me.id) h.push("me_hero=" + me.id);
        else if (me && me.name) h.push("me_name=" + encodeURIComponent(me.name));
        return h.join("&");
    }

    // ---------- native screens ----------
    function navKids() {
        var items = find("CarouselNavItems");
        return items && items.Children ? items.Children() : [];
    }
    function selectedNavIndex() {
        var kids = navKids();
        for (var i = 0; i < kids.length; i++) {
            try { if (kids[i].IsSelected && kids[i].IsSelected()) return i; } catch (e) {}
            if (kids[i].BHasClass("selected") || kids[i].BHasClass("Selected")) return i;
        }
        return -1;
    }
    // Move the native carousel by one screen, the same thing the native arrows do.
    // If the game ignores the event, click the neighbouring footer icon instead.
    function nativeStep(dir) {
        var from = selectedNavIndex();
        try { $.DispatchEvent("CitadelPostGameIncrementScreen", dir); } catch (e) { $.Msg("[DLCompare] increment failed: " + e); }
        $.Schedule(0.05, function () {
            var kids = navKids();
            if (from === -1 || !kids.length || selectedNavIndex() !== from) return;
            var to = (from + dir + kids.length) % kids.length;
            $.Msg("[DLCompare] increment ignored, clicking icon " + to);
            try { $.DispatchEvent("Activated", kids[to], "mouse"); } catch (e) {}
        });
    }
    // Select native screen i. Clicking its footer icon is the most direct way; stepping is the backup.
    function nativeGoTo(i) {
        var kids = navKids();
        if (i < 0 || i >= kids.length) return;
        var from = selectedNavIndex();
        if (from === i) return;
        try { $.DispatchEvent("Activated", kids[i], "mouse"); } catch (e) {}
        $.Schedule(0.05, function () {
            var now = selectedNavIndex();
            if (now === i || now === -1) return;
            var d = i - now;
            for (var s = 0; s < Math.abs(d); s++) nativeStep(d > 0 ? 1 : -1);
        });
    }

    // ---------- the browser panel ----------
    function setInteractive(on) {
        var overlay = find("DLCompareOverlay");
        var web = find("DLCompareWeb");
        try { if (overlay) overlay.hittest = on; } catch (e) {}
        try { if (web) { web.hittest = on; web.acceptsfocus = on; } } catch (e) {}
    }
    function setWait(title, text) {
        var t = find("DLCompareWaitTitle"), x = find("DLCompareWaitText");
        try { if (t) t.text = title; } catch (e) {}
        try { if (x) x.text = text || ""; } catch (e) {}
    }
    function markReady() {
        if (ready) return;
        ready = true;
        retries = 0;
        retryAt = 0;
        root().AddClass("DLCompareReady");
    }
    function unready() {
        ready = false;
        root().RemoveClass("DLCompareReady");
    }
    function load(id, hash, why) {
        var web = find("DLCompareWeb");
        if (!web || !id) return;
        var url = PAGE + "?embed=1&match=" + id + (hash ? "#" + hash : "");
        unready();
        loadedFor = id;
        hashNow = hash;
        loadStarted = Date.now();
        lastBeat = 0;
        setWait("Loading Postmortem...", retries ? "Try " + (retries + 1) : "");
        $.Msg("[DLCompare] load (" + (why || "open") + ") " + url);
        try { web.SetURL(url); } catch (e) { $.Msg("[DLCompare] SetURL failed: " + e); }
        $.Schedule(READY_FALLBACK_S, function () { if (loadedFor === id && !titlesSeen) markReady(); });
    }
    // Something went wrong with the page: hide the browser, say so, and load it again after a growing wait.
    function fail(reason) {
        if (retryAt) return;
        unready();
        var wait = RETRY_S[Math.min(retries, RETRY_S.length - 1)];
        retries++;
        retryAt = Date.now() + wait * 1000;
        $.Msg("[DLCompare] page lost (" + reason + "), retry " + retries + " in " + wait + "s");
        setWait("Reconnecting to Postmortem...", "The page didn't load (" + reason + "). Trying again in " + wait + "s.");
    }
    // Runs every half second while Compare is open: retries, missed loads and the heartbeat check.
    var wdGen = 0;
    function watchdog(gen) {
        if (!isOpen || gen !== wdGen) return;
        var now = Date.now();
        var id = matchId();
        if (!id) {
            if (ready) unready(); // never show the last match's page while the game is still loading this one
            setWait("Waiting for the game to load this match...", "");
        } else if (id !== loadedFor) {
            load(id, hintHash(), "match");
        } else if (retryAt) {
            if (now >= retryAt) { retryAt = 0; load(loadedFor, hintHash(), "retry"); }
        } else if (!ready && titlesSeen && now - loadStarted > LOAD_TIMEOUT_MS) {
            fail("timed out");
        } else if (ready && beatsSeen && lastBeat && now - lastBeat > BEAT_TIMEOUT_MS) {
            fail("no answer");
        }
        $.Schedule(0.5, function () { watchdog(gen); });
    }
    // The post-game page stays alive between matches, so keep an eye on the match ID and load each new match in the
    // background as soon as it shows up (a second later, so the viewer hints are there too).
    var seenId = null;
    function preload() {
        var id = matchId();
        if (id && id !== seenId) {
            seenId = id;
            $.Schedule(1.0, function () {
                if (matchId() === id && loadedFor !== id && !isOpen) load(id, hintHash(), "preload");
            });
        }
        $.Schedule(1.0, preload);
    }

    function open() {
        var web = find("DLCompareWeb");
        if (!web) return;
        var id = matchId();
        var hash = hintHash();
        if (id && loadedFor !== id) load(id, hash, "open");
        else if (id && hash !== hashNow) {
            // Same page, new hints: only the hash changes, so the page doesn't reload.
            hashNow = hash;
            $.Msg("[DLCompare] hints " + hash);
            try { web.SetURL(PAGE + "?embed=1&match=" + id + "#" + hash); } catch (e) {}
        }
        if (!id) { unready(); setWait("Waiting for the game to load this match...", ""); }
        // Closed for a while: a live page sends a heartbeat within a few seconds of being shown again. Until then keep it
        // hidden behind the Loading text, so a dead page (error screen) is never what you see.
        if (ready && beatsSeen && Date.now() - lastBeat > BEAT_TIMEOUT_MS) { unready(); setWait("Loading Postmortem...", ""); lastBeat = Date.now(); loadStarted = Date.now() - LOAD_TIMEOUT_MS + 4000; }
        hookNative(); // the footer icons may have been created after the timed hooks ran
        openedOn = selectedNavIndex();
        isOpen = true;
        root().AddClass("DLCompareOpen");
        setInteractive(true);
        try { web.SetFocus(); } catch (e) {}
        $.Schedule(0.25, watch);
        var gen = ++wdGen;
        $.Schedule(0.5, function () { watchdog(gen); });
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        root().RemoveClass("DLCompareOpen");
        setInteractive(false);
    }

    function toggle() { if (isOpen) close(); else open(); }

    // Backup for the nav hooks: if the native screen changes while Compare is open, hide Compare.
    function watch() {
        if (!isOpen) return;
        var now = selectedNavIndex();
        if (openedOn !== -1 && now !== -1 && now !== openedOn) { close(); return; }
        $.Schedule(0.25, watch);
    }

    // Arrows: Compare is the screen after the last native one.
    // From Compare, left goes to the last native screen and right goes to the first.
    // From the last native screen, right opens Compare. Everything else is the native step.
    function arrow(dir) {
        var n = navKids().length;
        if (isOpen) {
            close();
            nativeGoTo(dir < 0 ? n - 1 : 0);
            return;
        }
        if (dir > 0 && n > 0 && selectedNavIndex() === n - 1) { open(); return; }
        nativeStep(dir);
    }

    function hookNative() {
        var left = find("CarouselNavLeftArrow");
        var right = find("CarouselNavRightArrow");
        if (left && !left.dlcHooked) { left.SetPanelEvent("onactivate", function () { arrow(-1); }); left.dlcHooked = true; }
        if (right && !right.dlcHooked) { right.SetPanelEvent("onactivate", function () { arrow(1); }); right.dlcHooked = true; }
        var kids = navKids();
        for (var k = 0; k < kids.length; k++) {
            if (kids[k].dlcHooked) continue;
            try { $.RegisterEventHandler("Activated", kids[k], close); kids[k].dlcHooked = true; } catch (e) {}
        }
    }

    // Titles from the page: DLC_READY:<match>:<time> once drawn, DLC_ALIVE:<match>:<time> every 2 seconds, DLC_CLOSE:<time>.
    // Older pages sent DLC_READY:<time> with no match. Anything else (like the browser's error screen) is only logged.
    function onTitle(panel, title) {
        if (typeof title !== "string") return;
        if (title.indexOf("DLC_CLOSE") === 0) { close(); return; }
        var m = title.match(/^DLC_(READY|ALIVE):(\d+)(?::\d+)?$/);
        if (!m) {
            $.Msg("[DLCompare] title: " + title);
            // A strange title on a page that was beating is most likely the browser's error screen: check again in 2 seconds.
            if (ready && beatsSeen && title !== "Postmortem") lastBeat = Math.min(lastBeat, Date.now() - BEAT_TIMEOUT_MS + 2000);
            return;
        }
        titlesSeen = true;
        var forId = title.split(":").length === 3 ? m[2] : null;
        if (forId && loadedFor && forId !== loadedFor) return; // an older page, still on screen while the new one loads
        if (m[1] === "ALIVE") beatsSeen = true;
        lastBeat = Date.now();
        if (retryAt) return; // a retry is already queued; the fresh page will report in
        markReady();
    }

    function wire() {
        var nav = find("DLCompareNav");
        var web = find("DLCompareWeb");
        var overlay = find("DLCompareOverlay");
        if (!nav || !web || !overlay) {
            if (++tries < 50) $.Schedule(0.2, wire);
            else $.Msg("[DLCompare] panels not found");
            return;
        }
        if (wired) return;
        wired = true;
        setInteractive(false);
        nav.SetPanelEvent("onactivate", toggle);
        nav.SetPanelEvent("onmouseover", function () { $.DispatchEvent("UIShowTextTooltip", nav, "Compare"); });
        nav.SetPanelEvent("onmouseout", function () { $.DispatchEvent("UIHideTextTooltip", nav); });
        overlay.SetPanelEvent("oncancel", close);
        web.SetPanelEvent("oncancel", close);
        try { $.RegisterEventHandler("HTMLTitle", web, onTitle); } catch (e) { $.Msg("[DLCompare] HTMLTitle hook failed: " + e); }
        hookNative();
        $.Schedule(2.0, hookNative); // nav items are created after the match data loads
        $.Schedule(6.0, hookNative);
        preload();
        $.Msg("[DLCompare] ready");
    }

    $.Schedule(0.1, wire);
})();
