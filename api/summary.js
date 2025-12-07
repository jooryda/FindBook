export const config = {
  runtime: "nodejs"
};

import OpenAI from "openai";

export default async function handler(req, res) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const { text } = req.body;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
당신은 전문 도서 요약 시스템입니다.

요구 사항:
1. 스포일러 없이 5~10줄의 풍부한 요약 작성
2. 동일한 저자의 다른 추천 도서 3권 제공
3. 비슷한 주제/분위기/카테고리의 유사 도서 3권 추천
4. 출력은 반드시 JSON 형식으로 아래 구조만 만족해야 함:

{
  "summary": "5~10줄 요약",
  "authorRecommendations": {
      "intro": "저자 설명 문구",
      "books": ["책 제목1", "책 제목2", "책 제목3"]
  },
  "similarBookRecommendations": {
      "intro": "유사 도서 설명 문구",
      "books": ["책 제목1", "책 제목2", "책 제목3"]
  }
}

강조 사항:
- 마크다운 금지
- 불필요한 텍스트 금지
- JSON 외 텍스트 절대 출력하지 말 것
`
        },
        { role: "user", content: text }
      ]
    });

    let result = null;
    try {
      result = JSON.parse(completion.choices[0].message.content);
    } catch (parseError) {
      console.error("JSON 파싱 실패:", parseError);
      return res.status(500).json({
        error: "모델 응답이 JSON 형식이 아닙니다."
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("요약 생성 오류:", error);
    res.status(500).json({ error: error.message });
  }
}
