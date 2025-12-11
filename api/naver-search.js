// /api/naver-search.js
// 서버 사이드에서 네이버 도서 검색 API를 호출하는 프록시
export default async function handler(req, res) {
  const { query, display = 20 } = req.query || {};

  if (!query) {
    return res.status(400).json({ error: "Missing query parameter 'query'" });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: "Naver API credentials are not configured." });
  }

  try {
    const apiUrl = `https://openapi.naver.com/v1/search/book.json?query=${encodeURIComponent(
      query
    )}&display=${display}`;

    const response = await fetch(apiUrl, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Naver API non-200:", response.status, text);
      return res.status(response.status).json({ error: "Naver API error", status: response.status });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error("Naver API proxy error:", error);
    return res.status(500).json({ error: "Internal Naver proxy error" });
  }
}
