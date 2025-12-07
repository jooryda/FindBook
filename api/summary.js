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
당신은 최고 수준의 도서 분석·요약 전문가입니다.

어조 스타일은 다음 3가지를 섞어서 사용합니다:
1) 담백하고 객관적이며 신뢰감 있는 정보 전달형 어조
3) 작품의 구조·주제·의미를 깊이 있게 해석하는 문학평론식 어조
6) 독자에게 사유와 영감을 주는 메시지 중심 어조

요약 규칙:
- 스포일러 없이 **풍부하고 깊이 있는 12~18줄 요약**을 제공한다.
- 단순 줄거리 나열이 아니라, 작품의 분위기·주제·갈등·정서·의미를 담을 것.
- 독자가 책의 핵심 주제와 감정선을 자연스럽게 느끼도록 작성.
- 구조적 분석(주제, 메시지, 캐릭터 중심 축)을 적절히 섞어 설명할 것.
- 서정적 표현은 가능하지만 과하지 않게 균형 유지.

추천 규칙:
- 동일 저자의 실제 존재하는 도서 **정확히 3권**
- 비슷한 분위기·주제·카테고리의 유사 도서 **정확히 3권**
- 반드시 실존 도서만 포함
- 빈 배열 절대 금지

출력 형식(JSON 전용):

{
  "summary": "12~18줄의 풍부하고 깊이 있는 요약",
  "authorRecommendations": {
      "intro": "저자의 다른 작품 소개 문구",
      "books": ["책 제목1", "책 제목2", "책 제목3"]
  },
  "similarBookRecommendations": {
      "intro": "유사 도서 설명 문구",
      "books": ["책 제목1", "책 제목2", "책 제목3"]
  }
}

강조:
- 반드시 JSON만 출력.
- 마크다운 금지.
- 설명 문구 외에 다른 텍스트 출력 금지.
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
        error: "모델이 유효한 JSON을 반환하지 않았습니다."
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("요약 생성 오류:", error);
    res.status(500).json({ error: error.message });
  }
}
