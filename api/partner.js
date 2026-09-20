// 파트너 — 초대·수락·조회·해제를 한 라우트에서 action 으로 가른다.
import { db, hasDb, readBody, token, sendMail, shell, url, isEmail } from "./_lib.js";

const pair = (a, b) => [a.toLowerCase(), b.toLowerCase()].sort();

async function blocked(a, b) {
  const [lo, hi] = pair(a, b);
  const rows = await db(`partner_blocks?low_email=eq.${encodeURIComponent(lo)}&high_email=eq.${encodeURIComponent(hi)}&select=low_email`);
  return rows.length > 0;
}

export default async function handler(req, res) {
  const b = readBody(req);
  const action = String(b.action || req.query?.action || "").trim();
  if (!hasDb()) return res.status(503).json({ ok: false, error: "db_not_configured" });

  try {
    // 초대 보내기
    if (action === "invite") {
      const me = String(b.myEmail || "").trim();
      const to = String(b.email || "").trim();
      if (!isEmail(me) || !isEmail(to)) return res.status(400).json({ ok: false, error: "invalid_email" });
      if (me.toLowerCase() === to.toLowerCase()) return res.status(400).json({ ok: false, error: "self_invite" });
      if (await blocked(me, to)) return res.status(403).json({ ok: false, error: "blocked" });

      const live = await db(`partners?or=(a_email.eq.${encodeURIComponent(me)},b_email.eq.${encodeURIComponent(me)})&status=eq.active&select=id`);
      if (live.length) return res.status(409).json({ ok: false, error: "already_linked" });

      // 같은 상대에게 보낸 기존 초대는 무효로 — 먼저 받은 링크가 수락되면 안 된다
      await db(`partners?a_email=eq.${encodeURIComponent(me)}&status=eq.pending`, {
        method: "PATCH", prefer: "return=minimal", body: { status: "severed", severed_at: new Date().toISOString() },
      });

      const tk = token();
      const courses = Array.isArray(b.openCourses) ? b.openCourses.slice(0, 6) : [];
      await db("partners", { method: "POST", prefer: "return=minimal", body: {
        a_email: me, a_name: String(b.myName || "").trim() || null,
        target_email: to, token: tk, open_courses: courses,
      }});

      const names = { self: "마음학", lover: "연애학", family: "가족학", friend: "우정학", coworker: "협업학", pet: "교감학" };
      const list = courses.length
        ? `<ul style="margin:12px 0 0;padding-left:18px">${courses.map((c) => `<li>${names[c] || c}</li>`).join("")}</ul>`
        : "";
      await sendMail({
        to,
        subject: `${b.myName || me}님이 파트너 구독권을 선물했어요`,
        html: shell(
          `${b.myName || me}님이 파트너 구독권을 선물했어요`,
          `사랑에도 기술이 있습니다. PLove는 Practice Love의 합성어로, 알고 있지만 표현하지 못했던 마음을 AI와 함께 매일 하나씩 실천하는 서비스입니다. 지금 구독권 선물을 수락하고, 서비스를 시작해보세요!` +
          `${list ? `<div style="margin-top:16px">파트너 클래스는 서로의 학습 기록을 볼 수 있어요.${list}</div>` : ""}`,
          { href: url(`/?invite=${tk}`), label: "초대 수락하기" }
        ),
      });
      return res.status(200).json({ ok: true, status: "pending" });
    }

    // 초대장 열어보기
    if (action === "peek") {
      const tk = String(b.token || req.query?.token || "").trim();
      const rows = await db(`partners?token=eq.${encodeURIComponent(tk)}&select=a_email,a_name,target_email,status,open_courses,expires_at`);
      const p = rows[0];
      if (!p) return res.status(404).json({ ok: false, error: "not_found" });
      if (p.status !== "pending") return res.status(410).json({ ok: false, error: p.status === "active" ? "already_accepted" : "revoked" });
      if (new Date(p.expires_at) < new Date()) return res.status(410).json({ ok: false, error: "expired" });
      // 주소는 가려서 보여준다 — 누가 초대받았는지만 알 수 있으면 된다
      const m = p.target_email.replace(/^(.{2}).*(@.*)$/, "$1***$2");
      return res.status(200).json({ ok: true, fromName: p.a_name || p.a_email, courses: p.open_courses, maskedTarget: m });
    }

    // 수락
    if (action === "accept") {
      const tk = String(b.token || "").trim();
      const me = String(b.myEmail || "").trim();
      if (!isEmail(me)) return res.status(400).json({ ok: false, error: "invalid_email" });
      const rows = await db(`partners?token=eq.${encodeURIComponent(tk)}&select=*`);
      const p = rows[0];
      if (!p || p.status !== "pending") return res.status(410).json({ ok: false, error: "invalid_invite" });
      if (new Date(p.expires_at) < new Date()) return res.status(410).json({ ok: false, error: "expired" });
      // 링크를 아는 사람이 아니라, 초대받은 주소로 로그인한 사람만 수락한다
      if (me.toLowerCase() !== p.target_email.toLowerCase())
        return res.status(403).json({ ok: false, error: "wrong_account", maskedTarget: p.target_email.replace(/^(.{2}).*(@.*)$/, "$1***$2") });
      if (await blocked(p.a_email, me)) return res.status(403).json({ ok: false, error: "blocked" });

      // 공개 범위는 대칭이다 — 양쪽이 고른 것을 합친다
      const mine = Array.isArray(b.openCourses) ? b.openCourses : [];
      const open = [...new Set([...(p.open_courses || []), ...mine])].slice(0, 6);
      await db(`partners?id=eq.${p.id}`, { method: "PATCH", prefer: "return=minimal", body: {
        b_email: me, status: "active", accepted_at: new Date().toISOString(), open_courses: open,
      }});
      try {
        await sendMail({ to: p.a_email, subject: `${me}님이 초대를 수락했어요`,
          html: shell("이제 함께 기록을 볼 수 있어요", `${me}님이 PLove 초대를 수락했어요.`, { href: url("/"), label: "PLove 열기" }) });
      } catch (e) { console.warn("[partner] 수락 알림 실패", e.message); }
      return res.status(200).json({ ok: true, status: "active", openCourses: open, partnerEmail: p.a_email });
    }

    // 내 연결 상태
    if (action === "status") {
      const me = String(b.myEmail || req.query?.myEmail || "").trim();
      if (!isEmail(me)) return res.status(400).json({ ok: false, error: "invalid_email" });
      const q = encodeURIComponent(me);
      const rows = await db(`partners?or=(a_email.eq.${q},b_email.eq.${q})&status=in.(pending,active)&select=*&order=invited_at.desc`);
      const p = rows[0] || null;
      if (!p) return res.status(200).json({ ok: true, partner: null });
      const other = p.a_email.toLowerCase() === me.toLowerCase() ? (p.b_email || p.target_email) : p.a_email;
      return res.status(200).json({ ok: true, partner: { status: p.status, email: other, openCourses: p.open_courses } });
    }

    // 해제 — 영구다
    if (action === "sever") {
      const me = String(b.myEmail || "").trim();
      const q = encodeURIComponent(me);
      const rows = await db(`partners?or=(a_email.eq.${q},b_email.eq.${q})&status=eq.active&select=*`);
      const p = rows[0];
      if (!p) return res.status(404).json({ ok: false, error: "no_partner" });
      const other = p.a_email.toLowerCase() === me.toLowerCase() ? p.b_email : p.a_email;
      await db(`partners?id=eq.${p.id}`, { method: "PATCH", prefer: "return=minimal", body: { status: "severed", severed_at: new Date().toISOString() } });
      const [lo, hi] = pair(me, other);
      await db("partner_blocks", { method: "POST", prefer: "return=minimal,resolution=ignore-duplicates", body: { low_email: lo, high_email: hi } });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: "unknown_action" });
  } catch (e) {
    console.error("[partner]", action, e.message);
    return res.status(500).json({ ok: false, error: "failed" });
  }
}
