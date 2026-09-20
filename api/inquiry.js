// 팀 구독 문의 — 받아서 쌓아둔다. 발송은 하루 1번 배치(api/cron/inquiry-digest)가 한다.
import { db, hasDb, readBody } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  const b = readBody(req);
  const row = {
    company: String(b.company || "").trim(),
    headcount: String(b.headcount || "").trim(),
    timing: String(b.timing || "").trim(),
    contact: String(b.contact || "").trim(),
  };
  if (!row.company || !row.contact) return res.status(400).json({ ok: false, error: "missing" });
  if (!hasDb()) { console.warn("[inquiry] DB 미설정 — 접수만 하고 버린다", row); return res.status(200).json({ ok: true, stored: false }); }
  try {
    await db("inquiries", { method: "POST", body: row, prefer: "return=minimal" });
    return res.status(200).json({ ok: true, stored: true });
  } catch (e) {
    console.error("[inquiry]", e.message);
    return res.status(500).json({ ok: false, error: "store_failed" });
  }
}
