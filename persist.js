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
    "plus", "couplePaid", "subCancelled", "subEnds", "subSince", "wipe",
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

  // 메일 링크(초대·선물)로 들어오면 남아 있던 화면을 띄우지 않는다.
  // 받는 사람은 대개 로그인부터 해야 하고, 남의 진행 화면이 먼저 뜨면 안 된다.
  var FROM_LINK = false;
  try {
    var qs = new URLSearchParams(location.search);
    var gk = qs.get("gift"), ik = qs.get("invite");
    if (gk) sessionStorage.setItem("plove.gift", gk);
    if (ik) sessionStorage.setItem("plove.invite", ik);
    FROM_LINK = !!(gk || ik);
    window.__ploveFromLink = FROM_LINK;
  } catch (e) {}

  function attach(L) {
    // ?reset=1 — 이 기기에 남은 진행을 지우고 처음부터 시작한다.
    // 서버를 비워도 이 브라우저 저장본은 안 지워진다(서버가 잠깐 안 될 때
    // 진행이 날아가지 않게 빈 값으로는 덮어쓰지 않기 때문이다).
    try {
      if (new URLSearchParams(location.search).get("reset") === "1") {
        localStorage.removeItem(KEY);
        Object.keys(localStorage).filter(function (x) { return x.indexOf("plove.draft.") === 0; })
          .forEach(function (x) { localStorage.removeItem(x); });
        history.replaceState(null, "", location.pathname);
        L.setState({
          screen: "start", levels: {}, completedMap: {}, records: {},
          totalXp: 0, totalGems: 0, streak: 0, lastDay: "", name: "", photo: "",
          plus: false, couplePaid: false, subCancelled: false, subEnds: "", subSince: 0,
          partner: null, myOpen: [], course: "", selected: "", q3: null, q5: "", step: 1,
          famMembers: [], petKinds: [], petNames: {}, freezes: 0, extraToday: 0, retryCredits: 0,
          doneDays: {}, frozenDays: {}, bestStreak: 0
        });
        L.toast && L.toast("진행을 초기화했어요");
      }
    } catch (e) {}

    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}

    if (saved && typeof saved === "object") {
      // 코스 자리는 되돌리되 화면은 여기서 정하지 않는다.
      // 로그인 확인은 몇 초 걸리는데 그 전에 앱 화면을 띄우면,
      // 처음 온 사람에게 로그인보다 먼저 남의 진행 화면이 스쳐 지나간다.
      // 어느 화면으로 갈지는 세션을 확인한 auth.js 가 정한다.
      var started = saved.levels && Object.keys(saved.levels).length;
      if (started) {
        saved.course = saved.course || Object.keys(saved.levels)[0];
        saved.selected = saved.selected || saved.course;
      }
      delete saved.screen;
      if (FROM_LINK) saved.screen = "start";   // 링크로 왔으면 처음부터
      try { L.setState(saved); } catch (e) { console.warn("[persist] 복원 실패", e); }
    }

    // ?streak=N — 오늘을 포함해 N 일을 연속 참여로 채운다(시연·촬영용).
    // 서버에 직접 넣으면 이 브라우저가 자기 상태를 도로 밀어 덮는다 — 여기서 넣어야 이긴다.
    try {
      var sn = parseInt(new URLSearchParams(location.search).get("streak") || "", 10);
      if (sn > 0 && sn <= 400) {
        var done = {}, t = new Date();
        for (var i2 = 0; i2 < sn; i2++) {
          var d2 = new Date(t.getFullYear(), t.getMonth(), t.getDate() - i2);
          done[d2.getFullYear() + "-" + String(d2.getMonth() + 1).padStart(2, "0") + "-" + String(d2.getDate()).padStart(2, "0")] = 1;
        }
        history.replaceState(null, "", location.pathname);
        var seed = {
          doneDays: done, frozenDays: {}, streak: sn,
          bestStreak: Math.max(sn, L.state.bestStreak || 0),
          lastDay: t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0")
        };
        L.setState(seed);
        // 서버 진행도가 언제 내려올지 모른다(로그인·회선에 따라 다르다).
        // 시간으로 이기려 하지 말고 자리를 남겨, 서버 것을 얹은 쪽이 이 위에 다시 덮게 한다.
        window.__ploveSeed = seed;
        setTimeout(function () {
          L.setState(seed);
          try { window.__ploveServer && window.__ploveServer.pushProgress(); } catch (e) {}
        }, 4000);
        L.toast && L.toast(sn + "일 연속으로 맞췄어요");
      }
    } catch (e) {}


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
    /* 키패드 높이를 따라간다 — 레벨 테스트 화면이 보이는 영역에 붙어 있게.
       iOS 는 키패드가 떠도 innerHeight 를 줄이지 않고 visualViewport 만 줄인다. */
    var vv = window.visualViewport;
    if (vv) {
      var syncVV = function () {
        if (L.state.screen !== "quiz" && !L.state.vvKb) return;
        var h = Math.round(vv.height), top = Math.round(vv.offsetTop);
        var kb = L.state.screen === "quiz" && h < window.innerHeight - 120;
        if (h !== L.state.vvh || top !== L.state.vvTop || kb !== !!L.state.vvKb)
          L.setState({ vvh: h, vvTop: top, vvKb: kb });
      };
      vv.addEventListener("resize", syncVV);
      vv.addEventListener("scroll", syncVV);
    }

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
