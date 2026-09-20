// PLOVE — 프로토타입의 window.claude.complete 를 대신하는 단 하나의 LLM 통로.
// 화면 코드는 그대로 두고 이 라우트만 갈아끼운다. 키는 서버에만 있다.

const MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const ENDPOINT = (m) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

function textOf(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => p?.text || "").join("").trim();
}

async function callGemini(body, key, signal) {
  const res = await fetch(`${ENDPOINT(MODEL)}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return res;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // 키가 없으면 화면은 각자의 폴백 문구로 넘어간다. 앱은 멈추지 않는다.
    return res.status(503).json({ error: "ai_disabled" });
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  if (!payload || !Array.isArray(payload.messages)) {
    return res.status(400).json({ error: "bad_request" });
  }

  const contents = payload.messages
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .map((m) => ({
      role: m.role === "assistant" || m.role === "model" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  if (!contents.length) return res.status(400).json({ error: "empty_messages" });

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: Math.min(Math.max(Number(payload.max_tokens) || 400, 64), 2048),
      temperature: typeof payload.temperature === "number" ? payload.temperature : 0.7,
      // 짧은 대화라 사고 토큰을 쓰지 않는다. 안 끄면 maxOutputTokens 를
      // 사고에 다 쓰고 본문이 비어 돌아오는 경우가 있다.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (payload.system && String(payload.system).trim()) {
    body.systemInstruction = { parts: [{ text: String(payload.system) }] };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25000);
  try {
    let r = await callGemini(body, key, ac.signal);

    // 429 는 한 번만 짧게 물러섰다 다시 친다. 더 끌면 화면이 먼저 지친다.
    if (r.status === 429) {
      await new Promise((ok) => setTimeout(ok, 900));
      r = await callGemini(body, key, ac.signal);
    }

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("[llm]", r.status, detail.slice(0, 300));
      return res.status(502).json({ error: "upstream", status: r.status });
    }

    const data = await r.json();
    const text = textOf(data);
    if (!text) {
      console.error("[llm] empty", JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: "empty" });
    }
    return res.status(200).json({ text });
  } catch (e) {
    const aborted = e?.name === "AbortError";
    console.error("[llm]", aborted ? "timeout" : e?.message);
    return res.status(aborted ? 504 : 500).json({ error: aborted ? "timeout" : "failed" });
  } finally {
    clearTimeout(timer);
  }
}
