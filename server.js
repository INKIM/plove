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
  function post(path, body) {
    return fetch(path, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok && d.ok !== false, status: r.status, d: d }; }); });
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

      return v;
    };

    /* 선물 발송 — confirmGift 는 renderVals 가 아니라 인스턴스 메서드다 */
    var cg = L.confirmGift.bind(L);
    L.confirmGift = function (to) {
      cg(to);   // 화면은 먼저 넘어간다 (결제 흐름 그대로)
      post("/api/gift", {
        toEmail: to, senderEmail: myEmail(L), senderName: (L.state.name || "").trim(),
        message: (L.state.giftMsg || "").trim(),
      }).then(function (r) {
        if (!r.ok) { console.warn("[gift]", r.status, r.d); L.toast && L.toast("선물은 담겼는데 메일이 안 갔어요"); }
      });
    };

    window.__ploveServer = { post: post };
  })();
})();
