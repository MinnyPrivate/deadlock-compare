"use strict";
// DLCOMPARE: adds a Compare screen to Deadlock's post-match / match details page.
// The footer gets a Compare icon next to the native screen icons. Clicking it shows the Compare page
// (a CitadelHTMLPanel) above the footer. Clicking it again, any native screen icon, or ESC hides it.
(function () {
    var PAGE = "https://deadlock-compare.minnymods.workers.dev/";
    var wired = false;
    var tries = 0;
    var isOpen = false;
    var openedOn = null;

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

    function selectedNavIndex() {
        var items = find("CarouselNavItems");
        if (!items || !items.Children) return -1;
        var kids = items.Children();
        for (var i = 0; i < kids.length; i++) {
            try { if (kids[i].IsSelected && kids[i].IsSelected()) return i; } catch (e) {}
            if (kids[i].BHasClass("selected") || kids[i].BHasClass("Selected")) return i;
        }
        return -1;
    }

    function open() {
        var web = find("DLCompareWeb");
        if (!web) return;
        var id = matchId();
        var url = PAGE + "?embed=1" + (id ? "&match=" + id : "");
        var ft = friendlyTeam();
        if (ft !== null) url += "&friendly=" + ft;
        var me = localHero();
        if (me && me.id) url += "&me_hero=" + me.id;
        else if (me && me.name) url += "&me_name=" + encodeURIComponent(me.name);
        $.Msg("[DLCompare] open " + url);
        root().AddClass("DLCompareOpen");
        isOpen = true;
        openedOn = selectedNavIndex();
        try { web.SetURL(url); } catch (e) { $.Msg("[DLCompare] SetURL failed: " + e); }
        try { web.SetFocus(); } catch (e) {}
        $.Schedule(0.25, watch);
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        root().RemoveClass("DLCompareOpen");
        var web = find("DLCompareWeb");
        try { if (web) web.SetURL("about:blank"); } catch (e) {}
    }

    function toggle() { if (isOpen) close(); else open(); }

    // Backup for the nav hooks: if the native screen changes while Compare is open, hide Compare.
    function watch() {
        if (!isOpen) return;
        var now = selectedNavIndex();
        if (openedOn !== -1 && now !== -1 && now !== openedOn) { close(); return; }
        $.Schedule(0.25, watch);
    }

    function hookNative() {
        var ids = ["CarouselNavLeftArrow", "CarouselNavRightArrow"];
        for (var i = 0; i < ids.length; i++) {
            var b = find(ids[i]);
            if (b) { try { $.RegisterEventHandler("Activated", b, close); } catch (e) {} }
        }
        var items = find("CarouselNavItems");
        if (items && items.Children) {
            var kids = items.Children();
            for (var k = 0; k < kids.length; k++) {
                if (kids[k].dlcHooked) continue;
                try { $.RegisterEventHandler("Activated", kids[k], close); kids[k].dlcHooked = true; } catch (e) {}
            }
        }
    }

    function onTitle(panel, title) {
        if (typeof title === "string" && title.indexOf("DLC_CLOSE") === 0) close();
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
        nav.SetPanelEvent("onactivate", toggle);
        nav.SetPanelEvent("onmouseover", function () { $.DispatchEvent("UIShowTextTooltip", nav, "Compare"); });
        nav.SetPanelEvent("onmouseout", function () { $.DispatchEvent("UIHideTextTooltip", nav); });
        overlay.SetPanelEvent("oncancel", close);
        web.SetPanelEvent("oncancel", close);
        try { $.RegisterEventHandler("HTMLTitle", web, onTitle); } catch (e) { $.Msg("[DLCompare] HTMLTitle hook failed: " + e); }
        hookNative();
        $.Schedule(2.0, hookNative); // nav items are created after the match data loads
        $.Schedule(6.0, hookNative);
        $.Msg("[DLCompare] ready");
    }

    $.Schedule(0.1, wire);
})();
