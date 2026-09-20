/* PLOVE — 진행 상태를 브라우저에 남긴다.
   프로토타입 화면 코드는 건드리지 않는다. DC 런타임이 마운트한 뒤
   컴포넌트 인스턴스(StreamableComponent.logic)를 찾아 바깥에서 감싼다. */
(function () {
  var KEY = "plove.save.v1";

  /* 남길 것 — 계정·진행·보유. 화면 전환이나 입력 중인 값은 남기지 않는다.
     (screen·runM·chatLog·lineVals·slotFiles 따위는 그 판에만 뜻이 있다) */
  var KEEP = [
    "name", "signedIn", "gEmail", "agreed", "q3", "q5",
    "levels", "completedMap", "totalXp", "totalGems",
    "course", "selected", "records",
    "streak", "lastDay", "doneDays", "frozenDays",
    "freezes", "extraToday", "retryCredits",
    /* 구독 상태 — plus 만 남기면 파트너가 새로고침 뒤 플러스로 내려앉는다 */
    "plus", "couplePaid", "subCancelled", "subEnds",
    "famMembers", "petKinds", "petNames", "avatar", "photo"
  ];

  function findLogic() {
    var els = [document.documentElement, document.body];
    els = els.concat(Array.prototype.slice.call(document.querySelectorAll("body *")));
    for (var i = 0; i < els.length; i++) {
      var el = els[i], ks = Object.keys(el);
      for (var j = 0; j < ks.length; j++) {
        if (ks[j].indexOf("__reactContainer$") !== 0) continue;
        var stack = [el[ks[j]]], seen = 0;
        while (stack.length && seen < 6000) {
          var n = stack.pop(); seen++;
          if (!n) continue;
          if (n.stateNode && n.stateNode.logic && n.stateNode.logic.state &&
              typeof n.stateNode.logic.setState === "function") return n.stateNode.logic;
          if (n.child) stack.push(n.child);
          if (n.sibling) stack.push(n.sibling);
        }
      }
    }
    return null;
  }

  /* 사진은 blob: URL 이라 새로고침하면 죽는다. 남기면 깨진 이미지가 뜨므로 뺀다.
     메모·기록·대화·코멘트는 그대로 남는다. (실제 보존은 스토리지가 붙어야 한다) */
  function clean(v) {
    var out = JSON.parse(JSON.stringify(v));
    Object.keys(out.records || {}).forEach(function (ck) {
      Object.keys(out.records[ck] || {}).forEach(function (mi) {
        var r = out.records[ck][mi];
        if (r && r.photos) r.photos = [];
      });
    });
    if (typeof out.photo === "string" && out.photo.indexOf("blob:") === 0) delete out.photo;
    return out;
  }

  function snap(st) {
    var o = {};
    KEEP.forEach(function (k) { if (st[k] !== undefined) o[k] = st[k]; });
    return clean(o);
  }

  function attach(L) {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}

    if (saved && typeof saved === "object") {
      // 시작한 코스가 있으면 홈으로 되돌린다. 없으면 평소대로 시작 화면.
      var started = saved.levels && Object.keys(saved.levels).length;
      if (started) {
        saved.screen = "home";
        saved.course = saved.course || Object.keys(saved.levels)[0];
        saved.selected = saved.selected || saved.course;
      }
      try { L.setState(saved); } catch (e) { console.warn("[persist] 복원 실패", e); }
    }

    var t = null;
    var orig = L.setState.bind(L);
    L.setState = function (patch, cb) {
      var r = orig(patch, cb);
      clearTimeout(t);
      t = setTimeout(function () {
        try { localStorage.setItem(KEY, JSON.stringify(snap(L.state))); }
        catch (e) { console.warn("[persist] 저장 실패", e && e.name); }
      }, 500);
      return r;
    };
    window.__ploveSave = { key: KEY, logic: L, wipe: function () { localStorage.removeItem(KEY); } };
  }

  window.__ploveFindLogic = findLogic;

  var tries = 0;
  var iv = setInterval(function () {
    var L = findLogic();
    if (L) { clearInterval(iv); attach(L); }
    else if (++tries > 80) clearInterval(iv);   // 약 12초. 못 찾으면 조용히 포기한다
  }, 150);
})();
