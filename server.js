/* PLove — 화면이 부르던 자리를 실제 서버로 돌린다.
   프로토타입 화면 코드는 건드리지 않는다. auth.js 와 같은 방식으로
   renderVals 를 감싸 해당 핸들러만 바꿔 끼운다.
   서버가 실패하면 화면은 원래 동작(목업)으로 되돌아간다 — 데모가 멈추지 않게. */
(function () {
  function waitLogic() {
    return new Promise(function (ok) {
      var n = 0;
      var iv = setInterval(function () {
        var L = (window.__ploveSave && window.__ploveSave.logic) ||
                (window.__ploveFindLogic && window.__ploveFindLogic());
        if (L) { clearInterval(iv); ok(L); }
        else if (++n > 80) { clearInterval(iv); ok(null); }
      }, 150);
    });
  }
  /* 공통 로딩 막 — 버튼을 누르고 서버를 기다리는 동안 화면이 멎어 보이지 않게.
     React 밖의 DOM 이다. 화면 코드를 건드리지 않고 덮는다.
     250ms 안에 끝나는 요청에는 안 띄운다 — 깜빡임이 기다림보다 거슬린다. */
  var busyN = 0, busyT = null, busyEl = null;
  function busyDom() {
    if (busyEl) return busyEl;
    var st = document.createElement("style");
    st.textContent = "@keyframes ploveSpin{to{transform:rotate(360deg)}}";
    document.head.appendChild(st);
    busyEl = document.createElement("div");
    busyEl.setAttribute("aria-live", "polite");
    busyEl.style.cssText = "position:fixed;inset:0;z-index:99999;display:none;" +
      "align-items:center;justify-content:center;background:#fffaf8cc;backdrop-filter:blur(2px)";
    busyEl.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;gap:14px">' +
      '<div style="width:34px;height:34px;border-radius:50%;border:3px solid #f0d8d4;' +
      'border-top-color:#b62a22;animation:ploveSpin .8s linear infinite"></div>' +
      '<div style="font-size:13px;font-weight:700;color:#b62a22">보내는 중이에요</div></div>';
    document.body.appendChild(busyEl);
    return busyEl;
  }
  function busyOn() {
    busyN++;
    if (busyT) return;
    busyT = setTimeout(function () { busyT = null; if (busyN > 0) busyDom().style.display = "flex"; }, 250);
  }
  function busyOff() {
    busyN = Math.max(0, busyN - 1);
    if (busyN) return;
    clearTimeout(busyT); busyT = null;
    if (busyEl) busyEl.style.display = "none";
  }
  /* 막을 띄울 곳 — 사람이 누르고 결과를 기다리는 것만.
     발화·사진 판정·진행도 저장은 뒤에서 도는 일이라 덮으면 안 된다. */
  var BUSY_PATHS = ["/api/partner", "/api/gift", "/api/share", "/api/inquiry"];

  function post(path, body) {
    var show = BUSY_PATHS.indexOf(path) >= 0;
    if (show) busyOn();
    return fetch(path, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok && d.ok !== false, status: r.status, d: d }; }); })
      .then(function (r) { if (show) busyOff(); return r; },
            function (e) { if (show) busyOff(); throw e; });
  }
  function myEmail(L) { return (L.state.gEmail || "").trim(); }

  (async function () {
    var L = await waitLogic();
    if (!L) return;

    var orig = L.renderVals.bind(L);
    L.renderVals = function () {
      var v = orig();

      /* 팀 구독 문의 — 쌓아뒀다 하루 1번 메일로 나간다 */
      var team = v.sendTeam;
      v.sendTeam = function () {
        var before = L.state.teamSent;
        team && team.apply(this, arguments);
        // 검증에 걸려 화면이 안 넘어갔으면 보내지 않는다
        setTimeout(function () {
          if (!L.state.teamSent || before) return;
          post("/api/inquiry", {
            company: L.state.teamName, headcount: L.state.teamSize,
            timing: L.state.teamWhen || "미정", contact: L.state.teamTel,
          }).then(function (r) { if (!r.ok) console.warn("[inquiry]", r.status, r.d); });
        }, 0);
      };

      /* 파트너 초대 — 실제 메일을 보낸다 */
      var mk = v.makeInvite;
      v.makeInvite = function () {
        var to = (L.state.inviteEmail || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { mk && mk.apply(this, arguments); return; }
        var me = myEmail(L);
        if (!me) { L.toast && L.toast("로그인 후에 초대할 수 있어요"); return; }
        L.setState({ inviteErr: "", inviteSending: true });
        post("/api/partner", {
          action: "invite", myEmail: me, myName: (L.state.name || "").trim(),
          email: to, openCourses: (L.state.inviteSel || []).slice(),
        }).then(function (r) {
          L.setState({ inviteSending: false });
          if (r.ok) { mk && mk.call(L); return; }
          var msg = { self_invite: "본인 주소로는 초대할 수 없어요",
                      already_linked: "이미 함께하는 사람이 있어요",
                      blocked: "이 사람과는 다시 연결할 수 없어요",
                      invalid_email: "이메일 주소를 정확히 적어주세요" }[r.d && r.d.error]
                    || "초대를 보내지 못했어요. 잠시 뒤 다시 시도해주세요";
          L.sfx && L.sfx("error");
          L.setState({ inviteErr: msg });
        });
      };

      /* 회고 공유 — 그 시점을 스냅샷으로 떠서 서버에 올리고 링크를 돌려받는다.
         나중에 미션을 더 해도 공유한 링크의 내용은 안 바뀐다. */
      var ds = v.doShare;
      v.doShare = function () {
        var scope = L.state.shareScope || "link";
        if (scope === "private") { ds && ds.apply(this, arguments); return; }
        var me = myEmail(L);
        if (!me) { L.toast && L.toast("로그인 후에 공유할 수 있어요"); return; }
        var k = L.courseKey();
        var ms = L.courseMissions();
        var recs = (L.state.records || {})[k] || {};
        var entries = [], chars = 0, xp = 0, chats = 0;
        Object.keys(recs).sort(function (a, b) { return a - b; }).forEach(function (i) {
          var r = recs[i]; if (!r) return;
          var lines = (r.lines || []).filter(function (l) { return l && l.value; });
          lines.forEach(function (l) { chars += (l.value || "").length; });
          chars += (r.free || "").length;
          xp += r.xp || 0;
          chats += (r.chat || []).filter(function (c) { return c && c.who === "me"; }).length;
          /* 인증물은 blob: URL 이라 남의 화면에서 안 열린다 — 스토리지가 붙으면 여기서 실제 URL 이 실린다.
             kind 는 지금 미리 실어 둔다(공유 페이지가 사진·영상·음성을 가려 그린다). */
          var proofs = (r.photos || []).filter(function (p2) { return p2 && p2.url && p2.url.indexOf("blob:") !== 0; })
            .map(function (p2) { return { url: p2.url, memo: p2.memo || "", label: p2.label || "", kind: p2.kind || "", mime: p2.mime || "" }; });
          entries.push({ num: r.num, title: r.title, stage: r.stage, lines: lines, free: r.free || "",
                         photos: proofs, comment: r.comment || "" });
        });
        var np = L.npc();
        post("/api/share", {
          action: "create", email: me, courseKey: k, scope: scope,
          hidePhotos: !!L.state.hidePhotos, expiry: L.state.shareExpiry || "30일",
          payload: {
            title: (np.subject || "") + " 회고", subject: np.subject || "", npcName: np.name || "",
            npcFile: np.f || "", ownerName: (L.state.name || "").trim(),
            letter: (L.state.letter || "").trim(),
            entries: entries,
            totals: {
              missions: entries.length, xp: xp, chars: chars,
              gems: L.state.totalGems || 0, streak: L.state.streak || 0, chats: chats,
            },
          },
        }).then(function (r) {
          if (!r.ok || !r.d.slug) { L.sfx && L.sfx("error"); L.toast && L.toast("공유 링크를 만들지 못했어요"); return; }
          var link = location.origin + "/s/" + r.d.slug;
          try { navigator.clipboard && navigator.clipboard.writeText(link); } catch (e) {}
          L.setState({ shared: true, shareUrl: link });
          setTimeout(function () { L.setState({ shared: false }); }, 2600);
        });
      };

      return v;
    };

    /* 선물 발송 — confirmGift 는 renderVals 가 아니라 인스턴스 메서드다 */
    var cg = L.confirmGift.bind(L);
    L.confirmGift = function (to) {
      cg(to);   // 화면은 먼저 넘어간다 (결제 흐름 그대로)
      post("/api/gift", {
        toEmail: to, senderEmail: myEmail(L), senderName: (L.state.name || "").trim(),
      }).then(function (r) {
        if (!r.ok) { console.warn("[gift]", r.status, r.d); L.toast && L.toast("선물은 담겼는데 메일이 안 갔어요"); }
      });
    };

    /* 인증 사진 판정 — 원래는 "파일이 있나"만 봤다. 실제 내용을 본다.
       보내기 전에 1024px 로 줄인다: 토큰이 절반 이하로 줄고 판정은 거의 같다. */
    async function shrink(url, mime) {
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob);
      const max = 1024;
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(bmp, 0, 0, w, h);
      const out = cv.toDataURL("image/jpeg", 0.8);
      return { mime: "image/jpeg", data: out.slice(out.indexOf(",") + 1) };
    }

    var rawAnalyze = L.analyzePhotos.bind(L);
    L.analyzePhotos = async function () {
      var base = await rawAnalyze();          // 빠진 슬롯 검사는 그대로 쓴다
      var m = L.courseMissions()[L.state.runM] || {};
      var slots = m.sl || [];
      var sf = L.state.slotFiles || [];
      if (!slots.length) return base;

      var items = [];
      for (var i = 0; i < slots.length; i++) {
        var f = sf[i];
        if (!f || !f.url || !/^image\//.test(f.type || "")) continue;   // 사진만 본다
        try { var im = await shrink(f.url, f.type); items.push({ i: i, label: L.famFill(slots[i], L.state.runM), mime: im.mime, data: im.data }); }
        catch (e) { console.warn("[vision] 사진을 못 읽었다", e && e.message); }
      }
      if (!items.length) return base;

      try {
        var r = await post("/api/vision", {
          mission: L.famFill(m.t, L.state.runM) + " — " + (m.a || ""),
          items: items.map(function (x) { return { label: x.label, mime: x.mime, data: x.data }; }),
        });
        if (!r.ok || !r.d.results) return base;      // 실패하면 기존 판정으로 — 반려하지 않는다
        var okCount = 0, mismatch = [];
        r.d.results.forEach(function (res, n) {
          if (res.ok) { okCount++; return; }
          mismatch.push({ label: items[n].label, why: res.why || "요구한 장면이 잘 안 보여요" });
        });
        var missing = slots.length - items.length;    // 아예 안 올린 슬롯
        return {
          photoScore: Math.round(40 * okCount / slots.length),
          mismatch: base.mismatch.filter(function (x) { return /사진이 없어요/.test(x.why); }).concat(mismatch),
          vision: true,
        };
      } catch (e) {
        console.warn("[vision]", e && e.message);
        return base;
      }
    };

    /* ── 인증물 업로드 ───────────────────────────────────────────
       사용자가 올린 파일은 blob: URL 이라 새로고침하면 죽고 남의 화면에서도 안 열린다.
       고른 즉시 뒤에서 올리고, 끝나면 slotFiles 의 url 을 공개 주소로 바꿔 끼운다.
       미리보기는 그동안 blob: 로 계속 보인다 — 기다리게 하지 않는다. */
    async function uploadProof(file, i) {
      var me = myEmail(L);
      if (!me) return;
      var r = await post("/api/upload", { email: me, mime: file.type, size: file.size, name: file.name });
      if (!r.ok) { console.warn("[upload] 서명 실패", r.d); return; }
      var put = await fetch(r.d.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!put.ok) { console.warn("[upload] 전송 실패", put.status); return; }
      var next = (L.state.slotFiles || []).slice();
      if (next[i]) {
        next[i] = Object.assign({}, next[i], { url: r.d.publicUrl, kind: file.type.split("/")[0], mime: file.type, remote: true });
        L.setState({ slotFiles: next });
      }
    }
    var origPick = L.pickPhoto.bind(L);
    L.pickPhoto = function (e, i) {
      var f = e && e.target && e.target.files && e.target.files[0];
      var r = origPick(e, i);
      // 원본이 거부한 파일(형식·용량·길이)은 slotFiles 에 안 들어간다 — 잠시 뒤 확인하고 올린다
      if (f) setTimeout(function () {
        var s = (L.state.slotFiles || [])[i];
        if (s && s.url && s.url.indexOf("blob:") === 0) uploadProof(f, i).catch(function (err) { console.warn("[upload]", err && err.message); });
      }, 400);
      return r;
    };

    /* ── 진행도 동기화 ───────────────────────────────────────────
       파트너가 내 기록을 보려면 서버에 있어야 한다. 덤으로 기기가 바뀌어도 이어진다.
       localStorage 는 그대로 둔다 — 서버가 죽어도 혼자서는 계속 돈다. */
    var KEEP = ["name","levels","completedMap","totalXp","totalGems","records",
                "streak","lastDay","doneDays","frozenDays","freezes","extraToday",
                "retryCredits","plus","couplePaid","subCancelled","subEnds","subSince","famMembers","petKinds","petNames","myOpen"];
    function snapshot() {
      var o = {};
      KEEP.forEach(function (k) { if (L.state[k] !== undefined) o[k] = L.state[k]; });
      // blob: URL 은 이 브라우저에서만 살아 있다 — 올라간 것(공개 주소)만 남긴다
      var r = JSON.parse(JSON.stringify(o.records || {}));
      Object.keys(r).forEach(function (ck) {
        Object.keys(r[ck] || {}).forEach(function (mi) {
          var rec = r[ck][mi];
          if (rec) rec.photos = (rec.photos || []).filter(function (p2) { return p2 && p2.url && p2.url.indexOf("blob:") !== 0; });
        });
      });
      o.records = r;
      return o;
    }
    var pushT = null;
    function pushProgress() {
      var me = myEmail(L);
      if (!me) return;
      clearTimeout(pushT);
      pushT = setTimeout(function () {
        post("/api/progress", { action: "save", email: me, name: (L.state.name || "").trim(), data: snapshot() })
          .then(function (r) { if (!r.ok && r.d && r.d.error !== "db_not_configured") console.warn("[progress]", r.d); });
      }, 2500);
    }

    /* 파트너 — 연결 상태와 상대 진행도를 받아 드롭다운을 켠다 */
    async function loadPartner() {
      var me = myEmail(L);
      if (!me) return;
      var r = await post("/api/progress", { action: "partner", email: me });
      if (!r.ok || !r.d.partner) return;
      L.setState({ partner: r.d.partner, partnerEmail: r.d.email, myOpen: r.d.openCourses || [] });
    }

    /* 초대 링크로 들어온 경우 — ?invite=토큰 */
    async function handleInvite() {
      var tk = new URLSearchParams(location.search).get("invite");
      if (!tk) return;
      var me = myEmail(L);
      if (!me) { try { sessionStorage.setItem("plove.invite", tk); } catch (e) {} return; }
      var r = await post("/api/partner", { action: "accept", token: tk, myEmail: me, openCourses: L.state.myOpen || [] });
      history.replaceState(null, "", location.pathname);
      if (r.ok) {
        L.sfx && L.sfx("done");
        L.toast && L.toast("이제 서로의 기록을 볼 수 있어요");
        await loadPartner();
      } else {
        var m = { expired: "초대가 만료됐어요", invalid_invite: "이미 처리된 초대예요",
                  wrong_account: "이 초대는 다른 주소로 보내진 초대예요",
                  blocked: "이 사람과는 다시 연결할 수 없어요" }[r.d && r.d.error] || "초대를 수락하지 못했어요";
        L.toast && L.toast(m);
      }
    }

    // 로그인해 있으면 서버 것을 먼저 받아온다 (기기가 바뀌어도 이어지게)
    var booted = false;
    async function boot() {
      var me = myEmail(L);
      if (booted || !me) return;
      booted = true;
      try { var t = sessionStorage.getItem("plove.invite"); if (t) { sessionStorage.removeItem("plove.invite"); history.replaceState(null,"","?invite="+t); } } catch (e) {}
      var r = await post("/api/progress", { action: "mine", email: me });
      if (r.ok && r.d.data && Object.keys(r.d.data.levels || {}).length) {
        L.setState(Object.assign({}, r.d.data, { screen: L.state.screen }));
      }
      await handleInvite();
      await loadPartner();
    }

    var origSet = L.setState.bind(L);
    L.setState = function (patch, cb) {
      var r = origSet(patch, cb);
      if (patch && Object.keys(patch).some(function (k) { return KEEP.indexOf(k) >= 0; })) pushProgress();
      if (patch && patch.gEmail) setTimeout(boot, 300);
      return r;
    };
    setTimeout(boot, 2500);

    window.__ploveServer = { post: post, pushProgress: pushProgress, loadPartner: loadPartner, boot: boot };
  })();
})();
