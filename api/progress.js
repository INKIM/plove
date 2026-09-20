// 진행도 — 계정마다 한 줄. 내 것을 올리고, 파트너 것을 내려받는다.
import { db, hasDb, readBody, isEmail } from "./_lib.js";

// 파트너에게 보여줄 것만 추린다. 대화 전문·코멘트는 뺀다(기획서 11장).
function forPartner(data, openCourses) {
  const open = new Set(openCourses || []);
  const recs = {};
  Object.keys(data.records || {}).forEach((ck) => {
    if (!open.has(ck)) return;
    recs[ck] = {};
    Object.keys(data.records[ck] || {}).forEach((mi) => {
      const r = data.records[ck][mi] || {};
      recs[ck][mi] = { num: r.num, title: r.title, stage: r.stage, xp: r.xp, gems: r.gems, photos: r.photos || [], lines: r.lines || [], free: r.free || "" };
    });
  });
  return {
    name: data.name || "", comp: data.completedMap || {}, levels: data.levels || {},
    xp: data.totalXp || 0, gems: data.totalGems || 0, streak: data.streak || 0, records: recs,
  };
}

export default async function handler(req, res) {
  if (!hasDb()) return res.status(503).json({ ok: false, error: "db_not_configured" });
  const b = readBody(req);
  const action = String(b.action || "save");

  try {
    if (action === "save") {
      const email = String(b.email || "").trim();
      if (!isEmail(email)) return res.status(400).json({ ok: false, error: "invalid_email" });
      await db("progress?on_conflict=email", {
        method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
        body: { email, name: b.name || null, photo_url: b.photoUrl || null, data: b.data || {}, updated_at: new Date().toISOString() },
      });
      return res.status(200).json({ ok: true });
    }

    if (action === "mine") {
      const email = String(b.email || "").trim();
      if (!isEmail(email)) return res.status(400).json({ ok: false, error: "invalid_email" });
      const rows = await db(`progress?email=eq.${encodeURIComponent(email)}&select=data,updated_at`);
      return res.status(200).json({ ok: true, data: rows[0]?.data || null, updatedAt: rows[0]?.updated_at || null });
    }

    // 파트너 것 — 연결이 active 이고, 열어둔 코스만
    if (action === "partner") {
      const me = String(b.email || "").trim();
      if (!isEmail(me)) return res.status(400).json({ ok: false, error: "invalid_email" });
      const q = encodeURIComponent(me);
      const links = await db(`partners?or=(a_email.eq.${q},b_email.eq.${q})&status=eq.active&select=*`);
      const p = links[0];
      if (!p) return res.status(200).json({ ok: true, partner: null });
      const other = p.a_email.toLowerCase() === me.toLowerCase() ? p.b_email : p.a_email;
      const rows = await db(`progress?email=eq.${encodeURIComponent(other)}&select=data,name`);
      const d = rows[0]?.data || {};
      const view = forPartner(d, p.open_courses || []);
      if (!view.name) view.name = rows[0]?.name || (other || "").split("@")[0];
      return res.status(200).json({ ok: true, partner: view, email: other, openCourses: p.open_courses || [] });
    }

    return res.status(400).json({ ok: false, error: "unknown_action" });
  } catch (e) {
    console.error("[progress]", action, e.message);
    return res.status(500).json({ ok: false, error: "failed" });
  }
}
