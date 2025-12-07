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
당신은 전문 도서 요약 및 추천 시스템입니다.

어조 스타일:
- 담백하고 객관적으로 핵심을 전달
- 부드럽고 감성적인 표현을 약하게 섞어 따뜻한 흐름 유지

요약 규칙:
- 스포일러 없이 **6~9줄의 균형 잡힌 요약**
- 작품 분위기, 정서, 갈등, 주제를 부드럽게 담을 것
- 너무 분석적이지 않되 인상 깊은 문장 흐름 유지

추천 규칙 (강화된 형태):
★ 동일 저자의 실제 존재하는 도서 **정확히 3권을 반드시 포함**
★ 비슷한 분위기·주제의 실제 도서 **정확히 3권을 반드시 포함**
★ 존재하지 않는 책 생성 금지
★ 배열이 비거나 누락되면 안 됨
★ JSON 외 다른 출력 절대 금지

출력(JSON ONLY):

{
  "summary": "6~9줄 요약",
  "authorRecommendations": {
      "intro": "저자의 다른 작품 소개 문구",
      "books": ["실존 도서1", "실존 도서2", "실존 도서3"]
  },
  "similarBookRecommendations": {
      "intro": "유사 도서 설명 문구",
      "books": ["실존 도서1", "실존 도서2", "실존 도서3"]
  }
}

주의:
- 마크다운 금지
- JSON 외 텍스트 출력 금지
- books 배열 길이가 3이 아니면 안 됨
- JSON 형식 깨지지 않게 출력
`
        },
        { role: "user", content: text }
      ]
    });

    let result = null;
    try {
      /// GPT가 JSON 문자열만 출력한다고 가정
      result = JSON.parse(completion.choices[0].message.content);

      // 안전장치: 추천 도서가 비어 있으면 오류 반환 (디버깅 목적)
      if (
        !result.authorRecommendations ||
        !Array.isArray(result.authorRecommendations.books) ||
        result.authorRecommendations.books.length !== 3
      ) {
        return res.status(500).json({
          error: "저자 추천 도서가 올바르게 생성되지 않았습니다."
        });
      }

      if (
        !result.similarBookRecommendations ||
        !Array.isArray(result.similarBookRecommendations.books) ||
        result.similarBookRecommendations.books.length !== 3
      ) {
        return res.status(500).json({
          error: "유사 도서 추천이 올바르게 생성되지 않았습니다."
        });
      }

    } catch (parseError) {
      console.error("JSON 파싱 실패:", parseError);
      return res.status(500).json({
        error: "모델이 유효한 JSON을 반환하지 않았습니다."
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("요약 생성 오류:", error);
    res.status(500).json({ error: error.message });
  }
}
