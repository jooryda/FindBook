// Book Summary Finder Pro - full front-end logic
// Features:
// - 고급 UI + 반응형 레이아웃
// - Google Books 기반 검색
// - Naver Books API 병합 (선택; 키 설정 시)
// - (Aladin API는 CORS/JSONP 이슈로 프론트에서 직접 사용 어렵기 때문에, 여기서는 TODO로 남깁니다.)
// - 검색어 정확도/초성 기반 정렬
// - 검색 자동완성
// - 스포일러 없는 긴 요약 + 장르 + 독자층 + 유사 도서 2권 추천
// - 표지 이미지 https 강제 변환

// ==== 1. API 키 설정 ====
const OPENAI_API_KEY = "";

// 선택: 네이버 도서 API (없으면 자동으로 건너뜀)
const NAVER_CLIENT_ID = window.__ENV?.NAVER_CLIENT_ID || "";
const NAVER_CLIENT_SECRET = window.__ENV?.NAVER_CLIENT_SECRET || "";

// Aladin TTB 키는 CORS/JSONP 문제로 여기서는 미구현 상태. (서버 프록시 권장)
// const ALADIN_TTB_KEY = "";

// ==== 2. DOM 참조 ====
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const resultsFrame = document.getElementById("resultsFrame");
const bookDetailsEl = document.getElementById("bookDetails");
const autocompleteList = document.getElementById("autocompleteList");

// 검색 결과 전체를 보관 (상세 API 호출 시 사용)
window.__mergedBooks = {};

// ==== 3. 유틸 함수들 ====
function normalizeBase(str) {
  return (str || "").toLowerCase().trim();
}

const INITIALS = [
  "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ",
  "ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"
];

function getInitials(str) {
  if (!str) return "";
  let result = "";
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = Math.floor((code - 0xac00) / 588); // 21*28=588
      result += INITIALS[idx] || "";
    } else if (INITIALS.includes(ch)) {
      result += ch;
    }
  }
  return result;
}

function isInitialQuery(q) {
  if (!q) return false;
  const trimmed = q.replace(/\s+/g, "");
  if (!trimmed) return false;
  return [...trimmed].every((ch) => INITIALS.includes(ch));
}

// 간단한 debounce
function debounce(fn, delay = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// HTML 태그 제거 (네이버 응답용)
function stripHtml(str) {
  return (str || "").replace(/<[^>]+>/g, "");
}

// 이미지 URL을 https로 강제 변환
function toHttps(url) {
  if (!url) return "";
  return url.replace(/^http:\/\//i, "https://");
}

// ==== 4. 이벤트 바인딩 ====

// 엔터로 검색
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    hideAutocomplete();
    searchBooks();
  }
});

// 입력 시 자동완성
const debouncedAutocomplete = debounce(handleAutocomplete, 260);
searchInput.addEventListener("input", () => {
  debouncedAutocomplete(searchInput.value.trim());
});

// 버튼 클릭
searchButton.addEventListener("click", () => {
  hideAutocomplete();
  searchBooks();
});

// 바깥 클릭 시 자동완성 닫기
document.addEventListener("click", (e) => {
  if (!autocompleteList.contains(e.target) && e.target !== searchInput) {
    hideAutocomplete();
  }
});

// ==== 5. 검색 로직 ====

async function searchBooks() {
  const qRaw = searchInput.value;
  const q = qRaw.trim();
  if (!q) {
    alert("검색어를 입력해주세요. (책 제목 / 저자 / ISBN)");
    return;
  }

  // 1) Google Books
  const googleItems = await fetchGoogleBooks(q, 40);

  // 2) Naver Books (서버 프록시를 통해 항상 시도)
  let naverItems = [];
  try {
    naverItems = await fetchNaverBooks(q, 20);
  } catch (e) {
    console.warn("Naver Books fetch failed:", e);
  }

  // Aladin은 CORS/JSONP 문제로 여기서는 생략 (백엔드 프록시 권장)
  const merged = [...googleItems, ...naverItems];

  const ranked = rankAndFilterResults(merged, q);

  renderResults(ranked, qRaw);
}

// Google Books → 통합 아이템 포맷
async function fetchGoogleBooks(query, maxResults = 40) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
    query
  )}&maxResults=${maxResults}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const items = data.items || [];

    return items.map((b) => {
      const v = b.volumeInfo || {};
      const identifiers = (v.industryIdentifiers || []).map((id) => id.identifier);
      return {
        source: "google",
        id: b.id,
        title: v.title || "",
        authors: v.authors || [],
        publisher: v.publisher || "",
        publishedDate: v.publishedDate || "",
        thumbnail: toHttps(v.imageLinks?.thumbnail || ""),
        isbn: identifiers.join(", "),
        categories: v.categories || [],
        description: v.description || "",
        raw: b,
      };
    });
  } catch (e) {
    console.error("Google Books fetch error:", e);
    return [];
  }
}

// Naver Books → 통합 아이템 포맷
async function fetchNaverBooks(query, display = 20) {
  // 서버 API 프록시를 통해 네이버 도서 검색 호출 (API 키는 서버에서만 사용)
  const url = `/api/naver-search?query=${encodeURIComponent(query)}&display=${display}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("Naver Books non-200:", res.status);
      return [];
    }
    const data = await res.json();
    const items = data.items || [];

    return items.map((item, idx) => {
      const title = stripHtml(item.title);
      const authors = stripHtml(item.author).split("^").filter(Boolean);
      const publisher = stripHtml(item.publisher);
      const description = stripHtml(item.description);
      const isbn = (item.isbn || "").toString();
      const pubdate = item.pubdate || ""; // YYYYMMDD
      const year = pubdate ? pubdate.substring(0, 4) : "";

      return {
        source: "naver",
        id: isbn || `naver-${idx}`,
        title,
        authors,
        publisher,
        publishedDate: year,
        thumbnail: toHttps(item.image || ""),
        isbn,
        categories: [],
        description,
        raw: item,
      };
    });
  } catch (e) {
    console.error("Naver Books fetch error:", e);
    return [];
  }
}

// 검색 결과 점수 계산 + 필터링
function rankAndFilterResults(items, queryRaw) {
  if (!items.length) return [];

  const qNorm = normalizeBase(queryRaw);
  const queryIsInitial = isInitialQuery(queryRaw);
  const qInitials = queryIsInitial ? queryRaw.replace(/\s+/g, "") : getInitials(qNorm);

  function score(item) {
    const title = normalizeBase(item.title);
    const authors = normalizeBase((item.authors || []).join(" "));
    const combined = `${title} ${authors}`;
    const isbn = (item.isbn || "").toLowerCase();

    let s = 0;

    // ISBN 완전일치
    if (isbn && isbn.includes(qNorm)) s += 1600;

    // 제목/저자 완전 일치
    if (title === qNorm) s += 1400;
    if (authors === qNorm) s += 1200;

    // 앞부분 일치
    if (title.startsWith(qNorm)) s += 900;
    if (authors.startsWith(qNorm)) s += 800;

    // 포함
    if (title.includes(qNorm)) s += 600;
    if (authors.includes(qNorm)) s += 500;
    if (combined.includes(qNorm)) s += 300;

    // 초성 매칭
    const tInit = getInitials(title);
    const aInit = getInitials(authors);
    if (qInitials && tInit.includes(qInitials)) s += 700;
    if (qInitials && aInit.includes(qInitials)) s += 650;

    // 길이 차이 패널티
    s -= Math.abs(title.length - qNorm.length) * 3;

    // 출판년도 가점
    const year = parseInt((item.publishedDate || "").substring(0, 4)) || 0;
    s += year / 5;

    // 소스에 따른 미세 가점 (Google을 약간 우선)
    if (item.source === "google") s += 30;

    return s;
  }

  const scored = items.map((it) => ({ it, s: score(it) }));
  const maxScore = Math.max(...scored.map((v) => v.s), 0);

  const filtered = scored
    .filter((v) => {
      if (maxScore <= 0) return true;
      if (v.s <= 0) return false;
      return v.s >= maxScore * 0.4;
    })
    .sort((a, b) => b.s - a.s)
    .map((v) => v.it);

  // 중복 제거 (제목 + 저자 기준)
  const seen = new Set();
  const unique = [];
  for (const it of filtered) {
    const key = `${normalizeBase(it.title)}|${normalizeBase((it.authors || []).join(","))}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(it);
  }

  return unique;
}

// ==== 6. 결과 렌더링 (iframe) ====

function renderResults(items, queryLabel) {
  const doc = resultsFrame.contentDocument;
  doc.open();

  let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
body{
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif;
  margin:0;
  padding:16px;
  background:#f6f7ff;
}
.header{
  font-size:12px;
  color:#70738a;
  margin-bottom:10px;
}
.card{
  display:flex;
  gap:12px;
  padding:12px 12px;
  margin-bottom:10px;
  border-radius:14px;
  border:1px solid #e2e4ff;
  background:#ffffff;
  box-shadow:0 5px 16px rgba(70,80,160,0.12);
  cursor:pointer;
  transition:transform .1s ease, box-shadow .12s ease, background .1s ease;
}
.card:hover{
  transform:translateY(-1px);
  box-shadow:0 9px 22px rgba(70,80,160,0.16);
  background:#fdfdff;
}
.thumb{
  width:64px;
  height:92px;
  border-radius:10px;
  object-fit:cover;
  background:#eceefe;
}
.info{
  flex:1;
  min-width:0;
}
.title{
  font-size:14px;
  font-weight:700;
  margin-bottom:3px;
  color:#23253a;
}
.meta{
  font-size:12px;
  color:#666a80;
  line-height:1.45;
}
.source-tag{
  display:inline-block;
  margin-top:4px;
  font-size:10px;
  padding:2px 6px;
  border-radius:999px;
  background:#f2f3ff;
  color:#555a88;
}
.empty{
  font-size:13px;
  color:#7a7f9a;
  padding:12px 4px;
}
</style>
</head>
<body>
<div class="header">검색어: "${queryLabel}" 에 대한 결과</div>
`;

  window.__mergedBooks = {};

  if (!items.length) {
    html += `<div class="empty">검색 결과가 없습니다. 검색어를 조금 다르게 입력해 보세요.</div>`;
  } else {
    items.forEach((item, idx) => {
      const key = `${item.source}:${item.id || idx}`;
      window.__mergedBooks[key] = item;

      const title = item.title || "제목 없음";
      const authors = (item.authors || ["저자 정보 없음"]).join(", ");
      const publisher = item.publisher || "출판사 정보 없음";
      const date = item.publishedDate || "";
      const thumb = item.thumbnail || "";
      const sourceLabel = item.source === "google" ? "Google" : "Naver";

      html += `
<div class="card" onclick="parent.showBookDetailsMerged('${key}')">
  <img class="thumb" src="${thumb}" alt="표지" />
  <div class="info">
    <div class="title">${title}</div>
    <div class="meta">
      ${authors}<br/>
      ${publisher}${date ? " · " + date : ""}
      <div class="source-tag">${sourceLabel}</div>
    </div>
  </div>
</div>
`;
    });
  }

  html += `
</body>
</html>
`;

  doc.write(html);
  doc.close();
}

// ==== 7. 상세 페이지 렌더링 ====

window.showBookDetailsMerged = async function (key) {
  const item = window.__mergedBooks[key];
  if (!item) return;

  const title = item.title || "";
  const authors = (item.authors || []).join(", ");
  const publisher = item.publisher || "";
  const date = item.publishedDate || "";
  const isbn = item.isbn || "-";
  const categories = (item.categories || []).join(", ");
  const cover = item.thumbnail || "";
  const description = item.description || "";

  bookDetailsEl.classList.remove("empty");
  bookDetailsEl.innerHTML = `
    <div style="display:flex;gap:20px;margin-bottom:20px;align-items:flex-start;flex-wrap:wrap;">
      <div>
        <img src="${cover}" alt="책 표지"
             style="width:170px;height:250px;object-fit:cover;border-radius:16px;
                    box-shadow:0 10px 24px rgba(0,0,0,0.18);background:#eee;" />
      </div>
      <div style="flex:1;min-width:220px;">
        <h2 style="margin:0 0 8px 0;font-size:20px;">${title}</h2>
        <h4 style="margin:0 0 6px 0;font-size:14px;color:#444;">${authors || "저자 정보 없음"}</h4>
        <p style="margin:0 0 10px 0;color:#666;font-size:13px;">
          ${publisher || "출판사 정보 없음"}${date ? " · " + date : ""}
        </p>
        <p style="margin:0 0 4px 0;font-size:12px;color:#555;"><b>ISBN</b> : ${isbn}</p>
        <p style="margin:0;font-size:12px;color:#555;"><b>장르 / 카테고리</b> : ${categories || "정보 없음"}</p>
      </div>
    </div>

    <h3 style="margin-top:8px;margin-bottom:6px;font-size:15px;">📘 상세 요약 & 추천</h3>
    <div id="summary" style="
      margin-top:6px;
      padding:16px 18px;
      border-radius:14px;
      background:#f3f4ff;
      border:1px solid #dde1ff;
      font-size:13px;
      line-height:1.7;
      white-space:pre-wrap;
    ">AI 요약을 생성하고 있습니다...</div>
  `;

  generateSummary({
    title,
    authors,
    categories,
    description,
  });
};

// ==== 8. OpenAI 요약 호출 ====

async function generateSummary(book) {
  const el = document.getElementById("summary");
  if (!el) return;

  if (!book.description) {
    el.textContent = "이 책에 대한 소개 텍스트가 없어 요약을 생성할 수 없습니다.";
    return;
  }

  try {
    const userContent =
      `제목: ${book.title}\n` +
      `저자: ${book.authors}\n` +
      `장르/카테고리: ${book.categories}\n\n` +
      `아래는 이 책의 소개/줄거리 텍스트입니다. 이 내용을 기반으로 요구사항에 맞게 요약해줘.\n\n` +
      book.description;

    const res = await fetch("/api/summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: userContent })
    });

    const data = await res.json();

    if (data.error) {
      el.textContent = "요약 생성 중 오류가 발생했습니다: " + data.error;
      return;
    }

    if (!data.summary) {
      console.error("요약 데이터가 비어 있습니다:", data);
      el.textContent = "요약을 생성하는 데 실패했습니다. 잠시 후 다시 시도해 주세요.";
      return;
    }

    el.innerHTML = data.summary.replace(/\n/g, "<br>");
  } catch (err) {
    console.error(err);
    el.textContent =
      "요약 생성 중 오류가 발생했습니다. (네트워크 상태 또는 API 서버 상태를 확인해 주세요.)";
  }
}

// ==== 9. 자동완성 ====

async function handleAutocomplete(query) {
  if (!query || query.length < 2) {
    hideAutocomplete();
    return;
  }

  // Google + Naver 소량만
  const googleItems = await fetchGoogleBooks(query, 6);
  let naverItems = [];
  if (NAVER_CLIENT_ID && NAVER_CLIENT_SECRET) {
    naverItems = await fetchNaverBooks(query, 6);
  }

  const merged = rankAndFilterResults([...googleItems, ...naverItems], query).slice(0, 8);

  if (!merged.length) {
    hideAutocomplete();
    return;
  }

  autocompleteList.innerHTML = "";
  merged.forEach((item) => {
    const li = document.createElement("li");
    li.className = "autocomplete-item";
    const title = item.title || "제목 없음";
    const authors = (item.authors || []).join(", ") || "저자 정보 없음";
    li.innerHTML = `<strong>${title}</strong><span>${authors}</span>`;
    li.addEventListener("click", () => {
      searchInput.value = title;
      hideAutocomplete();
      searchBooks();
    });
    autocompleteList.appendChild(li);
  });

  autocompleteList.classList.add("visible");
}

function hideAutocomplete() {
  autocompleteList.classList.remove("visible");
  autocompleteList.innerHTML = "";
}