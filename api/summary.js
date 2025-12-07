export const config = {
  runtime: "nodejs"
};

import OpenAI from "openai";

export default async function handler(req, res) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { text } = req.body;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
당신은 전문 도서 요약 및 추천 시스템입니다.

어조 스타일:
- 담백하고 객관적으로 핵심을 전달
- 부드럽고 감성적인 표현을 약하게 섞어 따뜻한 흐름 유지

요약 규칙:
- 스포일러 없이 **6~9줄의 균형 잡힌 요약**
- 작품 분위기, 정서, 갈등, 주제를 부드럽게 전달

추천 규칙 (JSON 보강):
- 동일 저자 3권, 유사 도서 3권 (실존 책 우선)
- books 배열은 반드시 길이 3
- JSON 이외 출력 금지

출력(JSON ONLY):
{
  "summary": "...",
  "authorRecommendations": {
      "intro": "...",
      "books": ["책1", "책2", "책3"]
  },
  "similarBookRecommendations": {
      "intro": "...",
      "books": ["책1", "책2", "책3"]
  }
}`
        },
        { role: "user", content: text }
      ]
    });

    let result = JSON.parse(completion.choices[0].message.content);

    // 강화된 검증
    if (!result.summary) throw new Error("요약 누락");
    if (!result.authorRecommendations?.books || result.authorRecommendations.books.length !== 3)
      throw new Error("저자 추천 누락");
    if (!result.similarBookRecommendations?.books || result.similarBookRecommendations.books.length !== 3)
      throw new Error("유사 도서 추천 누락");

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
