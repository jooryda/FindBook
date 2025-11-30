// api/summary.js
import OpenAI from "openai";

export default async function handler(req, res) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const { text } = req.body;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "요약 시스템" },
        { role: "user", content: text }
      ]
    });

    res.status(200).json({
      summary: completion.choices[0].message.content
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

