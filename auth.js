/* PLOVE — 구글 로그인. 프로토타입 화면 코드는 건드리지 않는다.
   로그인 자리는 renderVals() 안에서 매번 새로 만들어지므로, 인스턴스의
   renderVals 를 감싸 그 두 개(googleStart·googleSignIn)만 바꿔 끼운다.
   설정이 없으면 아무것도 하지 않는다 — 프로토타입의 가짜 로그인이 그대로 남는다. */
(function () {
  var SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";

  function load(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = no;
      document.head.appendChild(s);
    });
  }
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

  function nameOf(u) {
    var m = u.user_metadata || {};
    return (m.full_name || m.name || (u.email || "").split("@")[0] || "").trim();
  }

  (async function () {
    var cfg = {};
    try { cfg = await (await fetch("/api/config")).json(); } catch (e) {}
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      console.info("[auth] 설정 없음 — 프로토타입 로그인 그대로 둔다");
      // persist 가 화면을 안 정하므로 여기서라도 되돌려 준다(로컬·미설정 환경)
      try {
        var L0 = await waitLogic();
        if (L0 && Object.keys(L0.state.levels || {}).length && L0.state.signedIn) L0.setState({ screen: "home" });
      } catch (e) {}
      return;
    }
    try { await load(SDK); } catch (e) { console.warn("[auth] SDK 로드 실패"); return; }

    var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { detectSessionInUrl: true, persistSession: true, flowType: "pkce" }
    });

    var L = await waitLogic();
    if (!L) { console.warn("[auth] 컴포넌트를 못 찾았다"); return; }

    var advanced = false;
    // 구글에서 돌아오면 첫 화면이 다시 뜬다 — 계정은 붙었는데 로그인 화면이라 고장처럼 보인다.
    // 진행이 있으면 학습으로, 없으면 과목 선택으로 넘긴다.
    function advance() {
      if (advanced) return;
      var sc = L.state.screen;
      if (sc && sc !== "start" && sc !== "signin") return;
      // 메일 링크로 온 사람은 로그인 화면에 둔다 — 토큰을 받는 것이 먼저다
      if (window.__ploveFromLink) return;
      advanced = true;
      // 이 기기에 이미 진행이 있으면 기다릴 이유가 없다
      if (Object.keys(L.state.levels || {}).length) { L.setState({ screen: "home" }); return; }
      // 없으면 서버에서 늦게 올 수 있으니 잠깐 기다렸다 정한다
      setTimeout(function () {
        var sc2 = L.state.screen;
        if (sc2 !== "start" && sc2 !== "signin") return;
        var started = Object.keys(L.state.levels || {}).length > 0;
        L.setState({ screen: started ? "home" : "pick" });
      }, 1200);
    }

    function apply(session) {
      var u = session && session.user;
      if (u) {
        L.setState({
          signedIn: true, agreed: true,
          gEmail: u.email || "",
          name: (L.state.name || "").trim() || nameOf(u),
          photo: (u.user_metadata || {}).avatar_url || L.state.photo
        });
        advance();
      } else {
        // 세션이 없으면 저장본이 로그인 상태였더라도 내린다 — 실제 인증이 정본이다.
        // 게스트 모드가 없으므로 진행이 남아 있어도 시작 화면에서 막는다.
        var inApp = L.state.screen && L.state.screen !== "start" &&
                    L.state.screen !== "signin" && L.state.screen !== "policy" &&
                    L.state.screen !== "terms";
        if (L.state.signedIn || inApp) {
          L.setState({ signedIn: false, gEmail: "", screen: "start" });
        }
      }
    }

    function signIn() {
      sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + location.pathname }
      }).then(function (r) {
        if (r && r.error) { console.warn("[auth]", r.error.message); L.toast && L.toast("로그인을 시작하지 못했어요"); }
      });
    }

    var orig = L.renderVals.bind(L);
    L.renderVals = function () {
      var v = orig();
      v.googleStart = function () {
        L.sfx && L.sfx("start");
        if (L.state.signedIn) { L.setState({ screen: "pick" }); return; }
        signIn();
      };
      v.googleSignIn = function () {
        if (!L.state.agreed) { L.toast && L.toast("약관에 동의해야 시작할 수 있어요"); return; }
        signIn();
      };
      // 로그아웃·계정 삭제는 실제 세션도 끊어야 한다. 안 끊으면 새로고침에 되살아난다.
      var wipe = v.doWipe;
      v.doWipe = function () {
        var kind = L.state.confirmWipe;
        var r = wipe && wipe.apply(this, arguments);
        if (kind === "signout" || kind === "wipe") {
          try { localStorage.removeItem((window.__ploveSave || {}).key || "plove.save.v1"); } catch (e) {}
          sb.auth.signOut();
        }
        return r;
      };
      return v;
    };

    var got = await sb.auth.getSession();
    apply(got && got.data && got.data.session);
    sb.auth.onAuthStateChange(function (_e, s) { apply(s); });

    window.__ploveAuth = { sb: sb, signIn: signIn, signOut: function () { return sb.auth.signOut(); } };
    L.forceUpdate && L.forceUpdate();
  })();
})();
