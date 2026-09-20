// 인증물 업로드 — 서버가 서명된 주소를 내주고 브라우저가 거기로 직접 올린다.
// 파일을 서버로 통과시키지 않는 이유: 영상은 수십 MB라 서버리스 본문 한도를 넘는다.
import { readBody, isEmail, token } from "./_lib.js";

const SB_URL = process.env.SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE || "";
const BUCKET = "proofs";
const MAX = 50 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  if (!SB_URL || !SB_KEY) return res.status(503).json({ ok: false, error: "storage_not_configured" });

  const b = readBody(req);
  const email = String(b.email || "").trim();
  if (!isEmail(email)) return res.status(400).json({ ok: false, error: "invalid_email" });
  const mime = String(b.mime || "");
  if (!/^(image|video|audio)\//.test(mime)) return res.status(400).json({ ok: false, error: "bad_type" });
  if (Number(b.size) > MAX) return res.status(413).json({ ok: false, error: "too_large", max: MAX });

  // 경로에 계정을 섞어 남의 파일을 덮어쓸 수 없게 한다
  const who = email.replace(/[^a-z0-9]/gi, "").slice(0, 24).toLowerCase();
  const ext = (String(b.name || "").match(/\.([a-z0-9]{1,5})$/i) || [, mime.split("/")[1] || "bin"])[1].toLowerCase();
  const path = `${who}/${Date.now()}-${token(8)}.${ext}`;

  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
      method: "POST",
      headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: 600 }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("[upload]", r.status, t.slice(0, 200));
      return res.status(502).json({ ok: false, error: "sign_failed" });
    }
    const d = await r.json();
    return res.status(200).json({
      ok: true,
      uploadUrl: `${SB_URL}/storage/v1${d.url}`,          // d.url 은 /object/upload/sign/... 형태
      publicUrl: `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`,
      path,
    });
  } catch (e) {
    console.error("[upload]", e.message);
    return res.status(500).json({ ok: false, error: "failed" });
  }
}
