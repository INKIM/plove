// 퍼널 조회 — 사람이 보는 화면이 아니라 운영자가 숫자만 받아가는 창구다.
// 열어두면 이용자 수가 그대로 새므로 CRON_SECRET 뒤에 둔다.
import { db, hasDb } from "./_lib.js";

function ok(req) {
  const s = process.env.CRON_SECRET || "";
  if (!s) return false;                      // 비밀이 없으면 아예 닫는다
  const h = String(req.headers.authorization || "");
  const q = String((req.query && req.query.secret) || "");
  return h === "Bearer " + s || q === s;
}
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export default async function handler(req, res) {
  if (!ok(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (!hasDb()) return res.status(200).json({ ok: false, error: "db_not_configured" });

  // 사람 수로 센다 — 같은 사람이 여러 번 해도 한 명이다
  const uniq = (rows, key) => new Set(rows.map(r => r[key]).filter(Boolean)).size;
  const people = rows => new Set(rows.map(r => r.email || r.anon_id).filter(Boolean)).size;

  try {
    let ev = [];
    try { ev = await db("events?step=in.(visit,signin,mission_done)&select=anon_id,email,step&limit=100000"); }
    catch (e) { return res.status(200).json({ ok: false, error: "events_table_missing", hint: "supabase/events.sql 을 SQL Editor 에서 한 번 실행하세요" }); }

    const prog = await db("progress?select=email,data&limit=100000");
    const gifts = await db("gifts?select=sender_email&limit=100000");

    const at = s => ev.filter(e => e.step === s);
    const visit = people(at("visit"));
    const signin = people(at("signin"));
    const mission = people(at("mission_done"));

    // 구독 상태는 이벤트가 아니라 지금 상태(progress)가 정본이다
    const users = prog.length;
    const plus = prog.filter(p => (p.data || {}).plus).length;
    const couple = prog.filter(p => (p.data || {}).couplePaid).length;
    const givers = uniq(gifts, "sender_email");

    return res.status(200).json({ ok: true, at: new Date().toISOString(),
      유입퍼널: {
        방문: visit,
        로그인: signin,          "로그인률": pct(signin, visit),
        미션1개완수: mission,     "완수률": pct(mission, signin),
        구독자: plus,            "구독률": pct(plus, mission),
      },
      구독비율: {
        전체이용자: users,
        무료이용자: users - plus, "무료비율": pct(users - plus, users),
        구독자: plus,             "구독비율": pct(plus, users),
        파트너구독자: couple,      "파트너비율": pct(couple, users),
      },
      선물하기: {
        전체이용자: users,
        선물보낸사람: givers,      "선물비율": pct(givers, users),
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
