// 돈이 나가는 라우트(LLM·Vision·업로드) 앞에 세우는 문지기.
// 서버리스는 인스턴스마다 메모리가 갈라지므로 세는 것도 막는 것도 DB 에 둔다.
// 표는 새로 만들지 않고 이미 있는 events 를 쓴다 — 퍼널 집계는 step 이름으로
// 갈라 보므로 섞여도 숫자가 흔들리지 않는다.
import { db, hasDb, sendMail, shell, url } from "./_lib.js";

const PER_MIN = 20;      // 1분 20회 — 사람이 쓰는 속도로는 닿지 않는다
const PER_HOUR = 200;    // 1시간 200회
const BLOCK_HOURS = 24;
const HIT = (r) => "api:" + r;
const BLOCK = "api:block";

export function ipOf(req) {
  const h = req.headers || {};
  const fwd = String(h["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || String(h["x-real-ip"] || "").trim() || "unknown";
}

async function report(ip, route, hits, reason, until) {
  const to = process.env.ADMIN_EMAIL || process.env.GMAIL_USER;
  if (!to) return;
  await sendMail({ to, subject: `[PLove] API 남용 차단 — ${ip}`,
    html: shell("남용으로 차단했어요",
      `<b>${ip}</b> 를 ${BLOCK_HOURS}시간 막았어요.<br><br>` +
      `호출한 곳: <b>${route}</b><br>걸린 이유: ${reason}<br>횟수: ${hits}회<br>` +
      `풀리는 때: ${new Date(until).toLocaleString("ko-KR")}<br><br>` +
      `<span style="color:#7a6360">일찍 풀려면 events 에서 step='api:block' 인 그 줄을 지우면 돼요.</span>`,
      { href: url("/"), label: "PLove 열기" }) });
}

/* 통과하면 false, 막으면 응답을 직접 쓰고 true.
   DB 가 없거나 표가 흔들리면 통과시킨다 — 방어가 없다고 서비스를 멈출 수는 없다. */
export async function blocked(req, res, route) {
  if (!hasDb()) return false;
  const ip = ipOf(req);
  if (ip === "unknown") return false;
  const q = encodeURIComponent(ip);
  const now = Date.now();

  try {
    // 이미 막힌 곳인가
    const bs = await db(`events?anon_id=eq.${q}&step=eq.${BLOCK}&select=props,at&order=at.desc&limit=1`);
    const until = bs[0] && bs[0].props && bs[0].props.until;
    if (until && new Date(until).getTime() > now) {
      res.status(429).json({ ok: false, error: "rate_limited", until });
      return true;
    }

    await db("events", { method: "POST", prefer: "return=minimal",
      body: { anon_id: ip, step: HIT(route), props: null } });

    const since = (m) => new Date(now - m * 60000).toISOString();
    const [min, hour] = await Promise.all([
      db(`events?anon_id=eq.${q}&step=like.api:*&at=gte.${since(1)}&select=id`),
      db(`events?anon_id=eq.${q}&step=like.api:*&at=gte.${since(60)}&select=id`),
    ]);

    let reason = null, hits = 0;
    if (min.length > PER_MIN) { reason = `1분에 ${min.length}회 (상한 ${PER_MIN})`; hits = min.length; }
    else if (hour.length > PER_HOUR) { reason = `1시간에 ${hour.length}회 (상한 ${PER_HOUR})`; hits = hour.length; }
    if (!reason) return false;

    const till = new Date(now + BLOCK_HOURS * 3600000).toISOString();
    await db("events", { method: "POST", prefer: "return=minimal",
      body: { anon_id: ip, step: BLOCK, props: { until: till, reason, hits, route } } });
    try { await report(ip, route, hits, reason, till); }
    catch (e) { console.warn("[guard] 알림 실패", e.message); }
    res.status(429).json({ ok: false, error: "rate_limited", until: till });
    return true;
  } catch (e) {
    console.warn("[guard] 확인 실패", e.message);
    return false;
  }
}
