const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";


const SYSTEM_PROMPT = `
Return ONLY valid JSON.

User describes customers.

Convert the request into:

{
  "persona":"",
  "recency_min_days":null,
  "recency_max_days":null,
  "frequency_min":null,
  "frequency_max":null,
  "monetary_min":null,
  "monetary_max":null,
  "reasoning":""
}

Example:

Input:
customers who havent bought in 30 days

Output:
{
  "persona":"Inactive Customers",
  "recency_min_days":31,
  "recency_max_days":null,
  "frequency_min":1,
  "frequency_max":null,
  "monetary_min":0,
  "monetary_max":null,
  "reasoning":"Customers inactive for over 30 days."
}
`;

async function extractRFM(userMessage) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    console.log("gemini.js\n")
    console.log(`🤖 Gemini extracting RFM from: "${userMessage}"`);

    const response = await fetch(
      `${API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${SYSTEM_PROMPT} Marketer says: "${userMessage}" Respond with JSON only.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    const data = await response.json();

    console.log("========== FULL API RESPONSE ==========");
    console.log(JSON.stringify(data, null, 2));
    console.log("=======================================");

    if (!response.ok) {
      throw new Error(JSON.stringify(data));
    }

    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log("RAW RESPONSE:");
    console.log(responseText);

    const params = JSON.parse(responseText);

    console.log("PARSED JSON:");
    console.log(params);

    return params;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("GEMINI ERROR:", error);

    return {
      persona: "Test Segment",
      recency_min_days: 30,
      recency_max_days: 90,
      frequency_min: 1,
      frequency_max: 5,
      monetary_min: 0,
      monetary_max: 10000,
      reasoning: "Test response - Gemini had an error or timeout",
    };
  }
}

module.exports = { extractRFM };