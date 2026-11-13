"use strict";
// DLCOMPARE: adds a Compare screen to Deadlock's post-match / match details page.
// The footer gets a Compare icon after the native screen icons. Clicking it shows the Compare page
// (a CitadelHTMLPanel) above the footer. Clicking it again, any native screen icon, or ESC hides it.
//
// v4:
// - The page loads in the background as soon as the match ID is known, and the browser panel stays invisible
//   until the page says it has drawn ("DLC_READY" title), so opening Compare never shows the gray browser fill.
//   Closing keeps the page loaded, so reopening is instant.
// - While Compare is open it acts as the active screen: the native screen behind it is hidden, the native icon
//   looks unselected, and the arrows count from Compare (it sits after the last native screen).
(function () {
    var PAGE = "https://deadlock-compare.minnymods.workers.dev/";
    var READY_FALLBACK_S = 3.0; // show the page anyway if it never says it's ready
    var wired = false;
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
    function markReady() {
        if (ready) return;
        ready = true;
        root().AddClass("DLCompareReady");
    }
    function load(id, hash) {
        var web = find("DLCompareWeb");
        if (!web) return;
        var url = PAGE + "?embed=1" + (id ? "&match=" + id : "") + (hash ? "#" + hash : "");
        ready = false;
        root().RemoveClass("DLCompareReady");
        loadedFor = id;
        hashNow = hash;
        $.Msg("[DLCompare] load " + url);
        try { web.SetURL(url); } catch (e) { $.Msg("[DLCompare] SetURL failed: " + e); }
        $.Schedule(READY_FALLBACK_S, function () { if (loadedFor === id) markReady(); });
    }
    // Load the page in the background as soon as the match ID shows up.
    var preloadTries = 0;
    function preload() {
        if (loadedFor) return;
        var id = matchId();
        if (id) { load(id, hintHash()); return; }
        if (++preloadTries < 120) $.Schedule(0.25, preload);
    }

    function open() {
        var web = find("DLCompareWeb");
        if (!web) return;
        var id = matchId();
        var hash = hintHash();
        if (!loadedFor || loadedFor !== id) load(id, hash);
        else if (hash !== hashNow) {
            // Same page, new hints: only the hash changes, so the page doesn't reload.
            hashNow = hash;
            try { web.SetURL(PAGE + "?embed=1&match=" + id + "#" + hash); } catch (e) {}
        }
        openedOn = selectedNavIndex();
        isOpen = true;
        root().AddClass("DLCompareOpen");
        setInteractive(true);
        try { web.SetFocus(); } catch (e) {}
        $.Schedule(0.25, watch);
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

    function onTitle(panel, title) {
        if (typeof title !== "string") return;
        if (title.indexOf("DLC_CLOSE") === 0) close();
        else if (title.indexOf("DLC_READY") === 0) markReady();
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
