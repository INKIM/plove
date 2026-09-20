// 회고 공유 — 그 시점의 회고를 스냅샷으로 떠서 slug 로 연다.
// 나중에 미션을 더 해도 공유한 링크의 내용은 바뀌지 않는다(공유한 것과 보이는 것이 갈리지 않게).
import { db, hasDb, readBody, token, isEmail } from "./_lib.js";

const DAYS = { "7일": 7, "30일": 30, "만료 없음": null };

export default async function handler(req, res) {
  if (!hasDb()) return res.status(503).json({ ok: false, error: "db_not_configured" });
  const b = readBody(req);
  const action = String(b.action || req.query?.action || "get");

  try {
    if (action === "create") {
      const email = String(b.email || "").trim();
      if (!isEmail(email)) return res.status(400).json({ ok: false, error: "invalid_email" });
      const scope = ["all", "link", "private"].includes(b.scope) ? b.scope : "link";
      if (scope === "private") return res.status(400).json({ ok: false, error: "private" });

      const days = DAYS[b.expiry] === undefined ? 30 : DAYS[b.expiry];
      const slug = token(8).toLowerCase();
      const payload = b.payload || {};
      if (b.hidePhotos) {
        (payload.entries || []).forEach((e) => { e.photos = []; });
      }
      await db("shares", { method: "POST", prefer: "return=minimal", body: {
        slug, owner_email: email, course_key: String(b.courseKey || "self"),
        scope, hide_photos: !!b.hidePhotos, payload,
        expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null,
      }});
      return res.status(200).json({ ok: true, slug });
    }

    if (action === "get") {
      const slug = String(b.slug || req.query?.slug || "").trim().toLowerCase();
      if (!slug) return res.status(400).json({ ok: false, error: "no_slug" });
      const rows = await db(`shares?slug=eq.${encodeURIComponent(slug)}&select=*`);
      const s = rows[0];
      if (!s) return res.status(404).json({ ok: false, error: "not_found" });
      if (s.scope === "private") return res.status(403).json({ ok: false, error: "private" });
      if (s.expires_at && new Date(s.expires_at) < new Date())
        return res.status(410).json({ ok: false, error: "expired" });
      return res.status(200).json({ ok: true, share: { courseKey: s.course_key, createdAt: s.created_at, payload: s.payload } });
    }

    return res.status(400).json({ ok: false, error: "unknown_action" });
  } catch (e) {
    console.error("[share]", action, e.message);
    return res.status(500).json({ ok: false, error: "failed" });
  }
}
