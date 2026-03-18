export default {
  async fetch(request, env) {

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    const DEFAULT_MODEL = "";

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
      const action = String(body?.action || "").trim().toLowerCase();
      const listModelsRequested = action === "listmodels" || body?.listModels === true;

      const normalizeMethod = (value) => {
        const raw = String(value || "").trim();
        if (!raw) return "";
        const lower = raw.toLowerCase();
        if (lower === "generatecontent" || lower === "generate_content") return "generateContent";
        if (lower === "generatetext" || lower === "generate_text") return "generateText";
        return raw;
      };

      const normalizeModel = (value) => {
        const raw = String(value || "").trim();
        if (!raw) return "";
        return raw.startsWith("models/") ? raw : `models/${raw}`;
      };

      const listModels = async () => {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`,
          { method: "GET" }
        );

        if (!response.ok) {
          const errorText = await response.text();
          return { ok: false, errorText };
        }

        const data = await response.json();
        const models = Array.isArray(data?.models) ? data.models : [];
        const filtered = models.filter(model => {
          const methods = model?.supportedMethods;
          return Array.isArray(methods) && methods.some(m => m === "generateContent" || m === "generateText");
        });

        return { ok: true, models: filtered };
      };

      if (listModelsRequested) {
        const result = await listModels();
        if (!result.ok) {
          return jsonResponse({ error: result.errorText || "Unable to list models." }, 502);
        }
        return jsonResponse({
          models: result.models,
          note: "Use the exact models[].name value in the model field (example: models/text-bison-001)."
        });
      }

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
        const output = data?.candidates?.[0]?.output;
        if (typeof output === "string" && output.trim()) return output.trim();
        if (typeof data?.text === "string" && data.text.trim()) return data.text.trim();
        return "";
      };

      const getBlockReason = (data) => {
        return data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || "";
      };

      const buildRequestBody = (method, text) => {
        if (method === "generateText") {
          return {
            prompt: { text },
            temperature: 0.4,
            maxOutputTokens: 512
          };
        }

        return {
          contents: [
            {
              role: "user",
              parts: [
                { text }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 512
          }
        };
      };

      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      let lastErrorText = "";
      let lastData = null;

      let requestedModel = String(body?.model || env?.GEMINI_MODEL || DEFAULT_MODEL).trim();
      let normalizedModel = normalizeModel(requestedModel);
      let requestedMethod = normalizeMethod(body?.method || env?.GEMINI_METHOD);

      if (!normalizedModel) {
        const result = await listModels();
        if (!result.ok) {
          return jsonResponse({
            error: result.errorText || "Unable to list models for fallback selection.",
            hint: "Provide a model in the request body (model) or set GEMINI_MODEL in the environment."
          }, 502);
        }

        const models = result.models || [];
        if (!models.length) {
          return jsonResponse({
            error: "No models available for generateText or generateContent.",
            hint: "Ensure the Gemini API is enabled and the API key has access."
          }, 502);
        }

        const preferred = models.find(model => Array.isArray(model?.supportedMethods) && model.supportedMethods.includes("generateContent"))
          || models.find(model => Array.isArray(model?.supportedMethods) && model.supportedMethods.includes("generateText"))
          || models[0];

        requestedModel = preferred?.name || "";
        normalizedModel = normalizeModel(requestedModel);

        if (!requestedMethod && Array.isArray(preferred?.supportedMethods)) {
          if (preferred.supportedMethods.includes("generateContent")) {
            requestedMethod = "generateContent";
          } else if (preferred.supportedMethods.includes("generateText")) {
            requestedMethod = "generateText";
          }
        }
      }

      const methodsToTry = requestedMethod ? [requestedMethod] : ["generateContent", "generateText"];

      for (const method of methodsToTry) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:${method}?key=${env.GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(buildRequestBody(method, message))
            }
          );

          if (!geminiResponse.ok) {
            lastErrorText = await geminiResponse.text();
            if (geminiResponse.status >= 500 || geminiResponse.status === 429) {
              await sleep(350 * (attempt + 1));
              continue;
            }
            break;
          }

          const data = await geminiResponse.json();
          lastData = data;
          console.log(JSON.stringify(data, null, 2));

          const reply = extractReply(data);
          if (reply) {
            return jsonResponse({ reply, model: normalizedModel, method });
          }

          const blockReason = getBlockReason(data);
          if (blockReason) {
            return jsonResponse({
              reply: `Gemini could not return a response (reason: ${blockReason}). Try rephrasing your question.`,
              model: normalizedModel,
              method
            });
          }

          // Retry once if no reply and no block reason.
          await sleep(200 * (attempt + 1));
        }
      }

      return jsonResponse({
        error: lastErrorText || "Gemini returned no text. Please try again or rephrase your question.",
        model: normalizedModel,
        methodTried: methodsToTry
      }, 500);

    } catch (err) {
      return jsonResponse({ error: err?.message || String(err) }, 500);
    }

  }
};
