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
      return new Response(
        JSON.stringify({ error: "Use POST request" }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }

    try {

      const { message } = await request.json();

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: message }
                ]
              }
            ]
          })
        }
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        return jsonResponse({ error: errText }, 500);
      }

      const data = await geminiResponse.json();
      console.log(JSON.stringify(data, null, 2));
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!reply) {
        return jsonResponse({ error: "No response received" }, 500);
      }

      return jsonResponse({ reply });

    } catch (error) {

      return new Response(
        JSON.stringify({
          error: "Worker error",
          details: error.toString()
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );

    }

  }
};
