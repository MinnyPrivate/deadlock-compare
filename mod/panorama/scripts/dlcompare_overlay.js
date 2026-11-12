"use strict";
// DLCOMPARE: opens the Compare graph page inside Deadlock's post-match / match details screen.
(function () {
    var PAGE = "https://minnyprivate.github.io/deadlock-compare/";
    var wired = false;
    var tries = 0;

    function find(id) {
        try { return $.GetContextPanel().FindChildTraverse(id); } catch (e) { return null; }
    }

    function matchId() {
        var lbl = find("MatchID");
        if (!lbl) return null;
        var m = String(lbl.text || "").match(/\d{6,}/);
        return m ? m[0] : null;
    }

    function open() {
        var overlay = find("DLCompareOverlay");
        var web = find("DLCompareWeb");
        if (!overlay || !web) return;
        var id = matchId();
        var url = PAGE + "?embed=1" + (id ? "&match=" + id : "");
        $.Msg("[DLCompare] open " + url);
        overlay.AddClass("Open");
        try { web.SetURL(url); } catch (e) { $.Msg("[DLCompare] SetURL failed: " + e); }
    }

    function close() {
        var overlay = find("DLCompareOverlay");
        var web = find("DLCompareWeb");
        if (overlay) overlay.RemoveClass("Open");
        try { if (web) web.SetURL("about:blank"); } catch (e) {}
    }

    function onTitle(panel, title) {
        if (typeof title === "string" && title.indexOf("DLC_CLOSE") === 0) close();
    }

    function wire() {
        var btn = find("DLCompareButton");
        var closeBtn = find("DLCompareClose");
        var web = find("DLCompareWeb");
        if (!btn || !closeBtn || !web) {
            if (++tries < 50) $.Schedule(0.2, wire);
            else $.Msg("[DLCompare] panels not found");
            return;
        }
        if (wired) return;
        wired = true;
        btn.SetPanelEvent("onactivate", open);
        closeBtn.SetPanelEvent("onactivate", close);
        try { $.RegisterEventHandler("HTMLTitle", web, onTitle); } catch (e) { $.Msg("[DLCompare] HTMLTitle hook failed: " + e); }
        $.Msg("[DLCompare] ready");
    }

    $.Schedule(0.1, wire);
})();
