// 클라이언트가 알아야 하는 공개 설정만 내려준다. anon 키는 공개 전제(보호는 RLS 가 한다).
// 값이 없으면 빈 객체 — 그때 auth.js 는 아무것도 하지 않고 프로토타입 동작이 그대로 남는다.
export default function handler(req, res) {
  res.setHeader("cache-control", "public, max-age=60");
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  });
}
