// 구독권 선물 — 토큰을 만들어 저장하고 받는 사람에게 메일을 보낸다.
import { db, hasDb, readBody, token, sendMail, shell, url, isEmail, FOOT_LINK } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  const b = readBody(req);

  // 선물 받기 — 메일의 링크로 들어온 사람이 로그인한 뒤에 부른다
  if (b.action === "claim") {
    const tk = String(b.token || "").trim();
    const me = String(b.email || "").trim();
    if (!tk || !isEmail(me)) return res.status(400).json({ ok: false, error: "bad_request" });
    if (!hasDb()) return res.status(200).json({ ok: true, granted: true, note: "db_not_configured" });
    try {
      const rows = await db(`gifts?token=eq.${encodeURIComponent(tk)}&select=id,status,expires_at,sender_name`);
      const g = rows[0];
      if (!g) return res.status(404).json({ ok: false, error: "not_found" });
      if (g.status === "claimed") return res.status(409).json({ ok: false, error: "already_claimed" });
      if (new Date(g.expires_at) < new Date()) return res.status(410).json({ ok: false, error: "expired" });
      await db(`gifts?id=eq.${g.id}`, { method: "PATCH", prefer: "return=minimal", body: {
        status: "claimed", claimed_at: new Date().toISOString(), claimed_by: me } });
      return res.status(200).json({ ok: true, granted: true, from: g.sender_name || "" });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  }

  const to = String(b.toEmail || "").trim();
  if (!isEmail(to)) return res.status(400).json({ ok: false, error: "invalid_email" });
  const from = String(b.senderEmail || "").trim();
  if (from && from.toLowerCase() === to.toLowerCase())
    return res.status(400).json({ ok: false, error: "self_gift" });

  const name = String(b.senderName || "").trim() || "친구";
  const tk = token();

  if (hasDb()) {
    try {
      await db("gifts", { method: "POST", prefer: "return=minimal", body: {
        sender_email: from || null, sender_name: name, to_email: to, token: tk,
      }});
    } catch (e) { console.error("[gift] 저장 실패", e.message); }
  }

  try {
    await sendMail({
      to,
      subject: `${name}님이 PLove 구독권을 선물했어요`,
      html: shell(
        `${name}님이 한 달 구독권을 보냈어요`,
        `사랑에도 기술이 있습니다. PLove는 Practice Love의 합성어로, 알고 있지만 표현하지 못했던 마음을 AI와 함께 매일 하나씩 실천하는 서비스입니다. 지금 구독권 선물을 수락하고, 서비스를 시작해보세요!`,
        { href: url(`/?gift=${tk}`), label: "선물 받기" }, FOOT_LINK
      ),
    });
  } catch (e) {
    console.error("[gift] 발송 실패", e.message);
    return res.status(502).json({ ok: false, error: "send_failed" });
  }
  return res.status(200).json({ ok: true, sentAt: new Date().toISOString() });
}
