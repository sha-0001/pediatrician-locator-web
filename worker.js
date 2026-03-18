export default {
  async fetch(request, env) {

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    const jsonResponse = (body, status = 200) => {
      return new Response(JSON.stringify(body), {
        status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    };

    // Handle preflight (CORS)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST
    if (request.method !== "POST") {
      return jsonResponse({ error: "Use POST request" }, 405);
    }

    try {
      if (!env?.GEMINI_API_KEY) {
        return jsonResponse({ error: "Missing GEMINI_API_KEY" }, 500);
      }

      const body = await request.json().catch(() => ({}));
      const message = String(body?.message || "").trim();
      if (!message) {
        return jsonResponse({ error: "Missing message" }, 400);
      }

      const extractReply = (data) => {
        const parts = data?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          const combined = parts.map(p => p?.text).filter(Boolean).join("").trim();
          if (combined) return combined;
        }
        const direct = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof direct === "string" && direct.trim()) return direct.trim();
        if (typeof data?.text === "string" && data.text.trim()) return data.text.trim();
        return "";
      };

      const getBlockReason = (data) => {
        return data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || "";
      };

      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      let lastErrorText = "";
      let lastData = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [
                    { text: message }
                  ]
                }
              ],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 512
              }
            })
          }
        );

        if (!geminiResponse.ok) {
          lastErrorText = await geminiResponse.text();
          if (geminiResponse.status >= 500 || geminiResponse.status === 429) {
            await sleep(350 * (attempt + 1));
            continue;
          }
          return jsonResponse({ error: lastErrorText }, 500);
        }

        const data = await geminiResponse.json();
        lastData = data;
        console.log(JSON.stringify(data, null, 2));

        const reply = extractReply(data);
        if (reply) {
          return jsonResponse({ reply });
        }

        const blockReason = getBlockReason(data);
        if (blockReason) {
          return jsonResponse({
            reply: `Gemini could not return a response (reason: ${blockReason}). Try rephrasing your question.`
          });
        }

        // Retry once if no reply and no block reason.
        await sleep(200 * (attempt + 1));
      }

      return jsonResponse({
        reply: "Gemini returned no text. Please try again or rephrase your question."
      });

    } catch (err) {
      return jsonResponse({ error: err?.message || String(err) }, 500);
    }

  }
};
