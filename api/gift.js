// 구독권 선물 — 토큰을 만들어 저장하고 받는 사람에게 메일을 보낸다.
import { db, hasDb, readBody, token, sendMail, shell, url, isEmail } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  const b = readBody(req);
  const to = String(b.toEmail || "").trim();
  if (!isEmail(to)) return res.status(400).json({ ok: false, error: "invalid_email" });
  const from = String(b.senderEmail || "").trim();
  if (from && from.toLowerCase() === to.toLowerCase())
    return res.status(400).json({ ok: false, error: "self_gift" });

  const name = String(b.senderName || "").trim() || "친구";
  const msg = String(b.message || "").trim().slice(0, 300);
  const tk = token();

  if (hasDb()) {
    try {
      await db("gifts", { method: "POST", prefer: "return=minimal", body: {
        sender_email: from || null, sender_name: name, to_email: to, message: msg || null, token: tk,
      }});
    } catch (e) { console.error("[gift] 저장 실패", e.message); }
  }

  try {
    await sendMail({
      to,
      subject: `${name}님이 PLove 구독권을 선물했어요`,
      html: shell(
        `${name}님이 한 달 구독권을 보냈어요`,
        `사랑을 연습하는 30일, 같이 해보자는 마음이에요.` +
        (msg ? `<div style="margin-top:14px;padding:14px 16px;background:#fdf2f0;border-radius:14px;color:#2e1211">“${msg}”</div>` : ""),
        { href: url(`/?gift=${tk}`), label: "선물 받기" }
      ),
    });
  } catch (e) {
    console.error("[gift] 발송 실패", e.message);
    return res.status(502).json({ ok: false, error: "send_failed" });
  }
  return res.status(200).json({ ok: true, sentAt: new Date().toISOString() });
}
