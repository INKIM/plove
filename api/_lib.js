// PLOVE — 서버 라우트들이 같이 쓰는 것들. 파일명이 _ 로 시작하면 라우트가 되지 않는다.
import nodemailer from "nodemailer";

const SB_URL = process.env.SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const hasDb = () => !!(SB_URL && SB_KEY);

/* PostgREST 를 직접 부른다 — 의존성을 하나 덜 들인다.
   service_role 키라 RLS 를 지나간다. 브라우저에는 절대 나가지 않는다. */
export async function db(path, { method = "GET", body, prefer } = {}) {
  if (!hasDb()) throw new Error("db_not_configured");
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SB_KEY,
      authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db_${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/* 추측 불가능해야 한다 — 링크를 아는 사람이 수락할 수 있으므로 */
export function token(n = 24) {
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => abc[x % abc.length]).join("");
}

let tx = null;
export function mailer() {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) return null;
  if (!tx) {
    tx = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user, pass },
    });
  }
  return tx;
}

export async function sendMail({ to, subject, html, text }) {
  const t = mailer();
  if (!t) throw new Error("mail_not_configured");
  return t.sendMail({
    from: `"PLove" <${process.env.GMAIL_USER}>`,
    to, subject, html, text: text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  });
}

const BASE = process.env.PUBLIC_BASE_URL || "https://plove-xi.vercel.app";
export const url = (p) => BASE.replace(/\/$/, "") + p;

/* 메일 겉모양 — 이미지는 절대 URL 이라야 메일에서 뜬다 */
export function shell(title, bodyHtml, cta) {
  return `<div style="margin:0;padding:32px 16px;background:#fffdfb;font-family:'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;color:#3a2624">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #ece4e2;border-radius:20px;overflow:hidden">
    <div style="background:#b62a22;padding:22px 24px">
      <div style="font-weight:800;font-size:20px;color:#fffdfb;letter-spacing:.02em">PLove</div>
      <div style="font-size:12px;color:#ffd9d5;margin-top:2px">사랑에도 연습이 필요한 거 아세요?</div>
    </div>
    <div style="padding:26px 24px 28px">
      <div style="font-weight:800;font-size:17px;color:#2e1211;margin-bottom:12px">${title}</div>
      <div style="font-size:14px;line-height:1.7">${bodyHtml}</div>
      ${cta ? `<div style="margin-top:22px"><a href="${cta.href}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:#b62a22;color:#fffdfb;font-weight:700;font-size:14px;text-decoration:none">${cta.label}</a></div>` : ""}
      <div style="margin-top:22px;font-size:12px;color:#7a6360;line-height:1.6">이 링크는 7일 뒤에 닫혀요.<br>원하지 않으시면 이 메일을 무시하면 됩니다.</div>
    </div>
  </div>
</div>`;
}

export function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  return b || {};
}

export const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
