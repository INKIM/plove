// 돈이 나가는 라우트(LLM·Vision·업로드) 앞에 세우는 문지기.
// 서버리스는 인스턴스마다 메모리가 갈라지므로 세는 것도 막는 것도 DB 에 둔다.
import { db, hasDb, sendMail, shell, url } from "./_lib.js";

const PER_MIN = 20;      // 1분 20회 — 사람이 쓰는 속도로는 절대 안 닿는다
const PER_HOUR = 200;    // 1시간 200회
const BLOCK_HOURS = 24;

export function ipOf(req) {
  const h = req.headers || {};
  const fwd = String(h["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || String(h["x-real-ip"] || "").trim() || "unknown";
}

async function report(ip, route, hits, reason, until) {
  const to = process.env.ADMIN_EMAIL || process.env.GMAIL_USER;
  if (!to) return;
  try {
    await sendMail({ to, subject: `[PLove] API 남용 차단 — ${ip}`,
      html: shell("남용으로 차단했어요",
        `<b>${ip}</b> 를 ${BLOCK_HOURS}시간 막았어요.<br><br>` +
        `호출한 곳: <b>${route}</b><br>` +
        `걸린 이유: ${reason}<br>` +
        `횟수: ${hits}회<br>` +
        `풀리는 때: ${new Date(until).toLocaleString("ko-KR")}<br><br>` +
        `<span style="color:#7a6360">일찍 풀려면 api_blocks 에서 그 줄을 지우면 돼요.</span>`,
        { href: url("/"), label: "PLove 열기" }) });
    await db(`api_blocks?ip=eq.${encodeURIComponent(ip)}`, {
      method: "PATCH", prefer: "return=minimal", body: { notified_at: new Date().toISOString() } });
  } catch (e) { console.warn("[guard] 알림 실패", e.message); }
}

/* 통과하면 null, 막으면 응답을 직접 쓰고 true 를 돌려준다.
   DB 가 없거나 표가 없으면 통과시킨다 — 방어가 없다고 서비스를 멈출 수는 없다. */
export async function blocked(req, res, route) {
  if (!hasDb()) return false;
  const ip = ipOf(req);
  if (ip === "unknown") return false;
  const q = encodeURIComponent(ip);
  const now = Date.now();

  try {
    const b = await db(`api_blocks?ip=eq.${q}&select=until,notified_at,reason`);
    if (b[0] && new Date(b[0].until).getTime() > now) {
      res.status(429).json({ ok: false, error: "rate_limited", until: b[0].until });
      return true;
    }

    await db("api_hits", { method: "POST", prefer: "return=minimal", body: { ip, route } });

    const since = (m) => new Date(now - m * 60000).toISOString();
    const [min, hour] = await Promise.all([
      db(`api_hits?ip=eq.${q}&at=gte.${since(1)}&select=id`),
      db(`api_hits?ip=eq.${q}&at=gte.${since(60)}&select=id`),
    ]);

    let reason = null, hits = 0;
    if (min.length > PER_MIN) { reason = `1분에 ${min.length}회 (상한 ${PER_MIN})`; hits = min.length; }
    else if (hour.length > PER_HOUR) { reason = `1시간에 ${hour.length}회 (상한 ${PER_HOUR})`; hits = hour.length; }
    if (!reason) return false;

    const until = new Date(now + BLOCK_HOURS * 3600000).toISOString();
    await db("api_blocks", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
      body: { ip, reason, hits, route, blocked_at: new Date().toISOString(), until, notified_at: null } });
    await report(ip, route, hits, reason, until);
    res.status(429).json({ ok: false, error: "rate_limited", until });
    return true;
  } catch (e) {
    // 표가 없거나 DB 가 흔들릴 때 — 막지 않고 알리고 넘어간다
    console.warn("[guard] 확인 실패", e.message);
    return false;
  }
}
