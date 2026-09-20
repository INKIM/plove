// 인증 사진이 미션 요구와 맞는지 본다. 없으면 채점이 "파일이 있나"만 보게 된다.
import { blocked } from "./_guard.js";
const MODEL = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || "gemini-3-flash-preview";

export default async function handler(req, res) {
  // 돈이 나가는 자리다 — 남용은 여기서 끊는다
  if (await blocked(req, res, "vision")) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ ok: false, error: "ai_disabled" });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  const items = (b && Array.isArray(b.items) ? b.items : []).filter((x) => x && x.data);
  if (!items.length) return res.status(400).json({ ok: false, error: "no_items" });

  const parts = [{
    text:
      "아래는 사용자가 실천 미션의 인증으로 올린 사진들입니다.\n" +
      "미션: " + String(b.mission || "").slice(0, 200) + "\n" +
      "각 사진이 요구한 내용과 맞는지 판단하세요.\n\n" +
      items.map((it, i) => `${i + 1}. 요구: ${String(it.label || "").slice(0, 120)}`).join("\n") +
      "\n\n판단 기준\n" +
      "· 요구한 대상·장면이 사진에 보이면 맞는 것으로 봅니다\n" +
      "· 완벽하지 않아도, 성실히 수행한 흔적이 보이면 맞는 것으로 봅니다\n" +
      "· 전혀 무관한 사진(스크린샷·빈 화면·아무 사물)만 아닌 것으로 봅니다\n" +
      "· 사람 얼굴을 평가하거나 외모를 언급하지 마세요\n" +
      "why 는 한국어 한 문장으로, 다음에 무엇을 담으면 좋을지 제안하듯 씁니다. 지적하지 마세요.",
  }];
  for (const it of items) {
    parts.push({ inlineData: { mimeType: it.mime || "image/jpeg", data: it.data } });
  }

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 700,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: { index: { type: "integer" }, ok: { type: "boolean" }, why: { type: "string" } },
              required: ["index", "ok", "why"],
            },
          },
        },
        required: ["results"],
      },
    },
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25000);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ac.signal }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("[vision]", r.status, t.slice(0, 200));
      return res.status(502).json({ ok: false, error: "upstream" });
    }
    const data = await r.json();
    const txt = (data?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || "").join("");
    let out = [];
    try { out = JSON.parse(txt).results || []; } catch { return res.status(502).json({ ok: false, error: "parse" }); }
    // 인덱스를 못 믿으므로 순서대로 채우고, 빠진 것은 통과로 둔다 — 반려보다 통과가 낫다
    const results = items.map((_, i) => {
      const f = out.find((x) => Number(x.index) === i + 1) || out[i];
      return { ok: f ? !!f.ok : true, why: (f && String(f.why || "").slice(0, 120)) || "" };
    });
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    console.error("[vision]", e?.name === "AbortError" ? "timeout" : e?.message);
    return res.status(e?.name === "AbortError" ? 504 : 500).json({ ok: false, error: "failed" });
  } finally {
    clearTimeout(timer);
  }
}
