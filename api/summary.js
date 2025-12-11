
// /api/summary.js  -- Server-side Naver+Google Summary & Recommendations
export const config = { runtime: "nodejs" };
import OpenAI from "openai";

/**
 * GPT 요청 수행 함수 (자동 재시도 포함)
 */
async function runSummaryRequest(payload, retries = 2) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `
STRICT JSON ONLY.

출력 형식은 반드시 다음 JSON 구조여야 한다:

{
  "summary": "8~12줄 자연스럽고 부드러운 요약",
  "authorRecommendations": {
    "intro": "동일 저자의 도서 추천 소개 문장",
    "books": ["책A", "책B", "책C", "책D", "책E"]
  },
  "similarBookRecommendations": {
    "intro": "관련 카테고리/주제 기반 추천 소개 문장",
    "books": ["책A", "책B", "책C", "책D", "책E"]
  }
}

규칙:
- JSON 외 텍스트 절대 금지
- books 배열 길이는 반드시 5
- 제목, 저자명 등은 실제 존재하는 책 위주로 선정
- summary는 8~12문장, Apple Books 느낌의 부드러운 톤
- 추천이 비어있으면 모델이 반드시 유추해서 채울 것
`
      },
      {
        role: "user",
        content: JSON.stringify(payload)
      }
    ],
    temperature: 0.7
  });

  const text = response.choices[0].message.content;

  try {
    return JSON.parse(text);
  } catch (err) {
    if (retries > 0) {
      return await runSummaryRequest(payload, retries - 1);
    }
    // 최종 실패 → 오류 노출 금지 & fallback 구조 반환
    return {
      summary: "요약을 생성하지 못했습니다.",
      authorRecommendations: {
        intro: "동일 저자 추천 도서를 찾지 못했습니다.",
        books: []
      },
      similarBookRecommendations: {
        intro: "비슷한 주제의 추천 도서를 찾지 못했습니다.",
        books: []
      }
    };
  }
}

export default async function handler(req, res) {
  try {
    const body = req.body;
    const result = await runSummaryRequest(body);
    res.status(200).json(result);
  } catch (e) {
    res.status(200).json({
      summary: "요약을 생성하지 못했습니다.",
      authorRecommendations: {
        intro: "동일 저자 추천 도서를 찾지 못했습니다.",
        books: []
      },
      similarBookRecommendations: {
        intro: "비슷한 주제의 추천 도서를 찾지 못했습니다.",
        books: []
      }
    });
  }
}
