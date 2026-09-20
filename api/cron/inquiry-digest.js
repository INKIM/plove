// 팀 구독 문의 — 하루 1번 쌓인 것을 모아서 한 통으로 보낸다.
// 실시간으로 보내지 않는 이유: 문의가 몰리면 받는 쪽이 메일함에서 길을 잃는다.
import { db, hasDb, sendMail, shell } from "../_lib.js";

const TO = process.env.INQUIRY_TO || process.env.GMAIL_USER;

export default async function handler(req, res) {
  // Vercel Cron 은 Authorization: Bearer <CRON_SECRET> 으로 온다. 손으로 돌릴 때는 ?secret=
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers?.authorization || "";
    const q = req.query?.secret || "";
    if (auth !== `Bearer ${secret}` && q !== secret) return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  if (!hasDb()) return res.status(503).json({ ok: false, error: "db_not_configured" });

  try {
    const rows = await db("inquiries?mailed_at=is.null&select=*&order=created_at.asc&limit=200");
    if (!rows.length) return res.status(200).json({ ok: true, sent: 0 });

    const esc = (s) => String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
    const list = rows.map((r, i) => `
      <div style="padding:14px 0;border-top:1px solid #ece4e2">
        <div style="font-weight:700;color:#2e1211">${i + 1}. ${esc(r.company)}</div>
        <div style="margin-top:6px;color:#3a2624">규모 ${esc(r.headcount)} · 도입 시기 ${esc(r.timing)}</div>
        <div style="margin-top:4px;color:#7a6360">연락처 ${esc(r.contact)}</div>
        <div style="margin-top:4px;font-size:12px;color:#7a6360">${new Date(r.created_at).toLocaleString("ko-KR")}</div>
      </div>`).join("");

    await sendMail({
      to: TO,
      subject: `PLove 팀 구독 문의 ${rows.length}건`,
      html: shell(`어제까지 들어온 문의 ${rows.length}건이에요`, list),
    });

    const ids = rows.map((r) => r.id).join(",");
    await db(`inquiries?id=in.(${ids})`, { method: "PATCH", prefer: "return=minimal", body: { mailed_at: new Date().toISOString() } });
    return res.status(200).json({ ok: true, sent: rows.length });
  } catch (e) {
    console.error("[inquiry-digest]", e.message);
    return res.status(500).json({ ok: false, error: "failed" });
  }
}
