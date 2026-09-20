// 퍼널 이벤트 적재 — 방문·로그인·미션 완수 셋만 받는다.
// 표가 아직 없거나 DB 가 안 붙어 있어도 앱은 멈추지 않는다(조용히 넘어간다).
import { db, hasDb, readBody } from "./_lib.js";

const STEPS = ["visit", "signin", "mission_done"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  const b = readBody(req);
  const step = String(b.step || "").trim();
  const anon = String(b.anonId || "").trim().slice(0, 64);
  if (STEPS.indexOf(step) < 0) return res.status(400).json({ ok: false, error: "bad_step" });
  if (!anon) return res.status(400).json({ ok: false, error: "no_anon" });
  if (!hasDb()) return res.status(200).json({ ok: true, skipped: "db_not_configured" });

  try {
    await db("events", { method: "POST", prefer: "return=minimal", body: {
      anon_id: anon,
      email: String(b.email || "").trim() || null,
      step,
      props: b.props && typeof b.props === "object" ? b.props : null,
    }});
    return res.status(200).json({ ok: true });
  } catch (e) {
    // 표가 없으면 여기서 걸린다 — 계측 때문에 앱이 흔들리면 안 되므로 알리고 넘어간다
    console.warn("[event] 적재 실패", e.message);
    return res.status(200).json({ ok: false, error: "store_failed" });
  }
}
