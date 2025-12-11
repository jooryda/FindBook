// FindBook Apple-style client script

let currentResults = [];
let selectedBook = null;
let debounceTimer = null;

// ===== Util =====

function debounce(fn, delay) {
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn(...args), delay);
  };
}

function normalizeBookFromGoogle(item) {
  const v = item.volumeInfo || {};
  const industryIds = (v.industryIdentifiers || []);
  const isbn =
    industryIds.find((id) => id.type === "ISBN_13")?.identifier ||
    industryIds.find((id) => id.type === "ISBN_10")?.identifier ||
    "";
  return {
    id: item.id,
    source: "google",
    title: v.title || "제목 정보 없음",
    authors: v.authors || [],
    publisher: v.publisher || "출판사 정보 없음",
    publishedDate: v.publishedDate || "",
    description: v.description || "",
    categories: v.categories || [],
    isbn,
    thumbnail:
      (v.imageLinks && (v.imageLinks.large || v.imageLinks.medium || v.imageLinks.thumbnail)) ||
      "",
    price: null,
  };
}

function normalizeBookFromNaver(item, idx) {
  const isbn = item.isbn || "";
  const authors = item.author ? item.author.split(/,\s*/) : [];
  const categories = item.category ? [item.category] : [];
  return {
    id: `naver-${idx}-${isbn}`,
    source: "naver",
    title: item.title?.replace(/<[^>]+>/g, "") || "제목 정보 없음",
    authors,
    publisher: item.publisher || "출판사 정보 없음",
    publishedDate: item.pubdate || "",
    description: item.description?.replace(/<[^>]+>/g, "") || "",
    categories,
    isbn,
    thumbnail: item.image || "",
    price: item.price || null,
  };
}

function mergeAndRankResults(googleItems, naverItems) {
  const map = new Map();

  const keyFn = (b) => (b.isbn && b.isbn.length > 0 ? b.isbn : `${b.title}__${(b.authors || []).join(",")}`);

  for (const g of googleItems) {
    const key = keyFn(g);
    map.set(key, g);
  }

  for (const n of naverItems) {
    const key = keyFn(n);
    if (!map.has(key)) {
      map.set(key, n);
    } else {
      // Prefer naver metadata for Korean books
      const existing = map.get(key);
      if (n.source === "naver") {
        map.set(key, { ...existing, ...n });
      }
    }
  }

  const merged = Array.from(map.values());

  // Simple ranking: prefer items with cover + recent year
  const scored = merged.map((b) => {
    let score = 0;
    if (b.thumbnail) score += 2;
    if (b.source === "naver") score += 1;
    const year = parseInt((b.publishedDate || "").slice(0, 4), 10);
    if (!Number.isNaN(year)) {
      const diff = new Date().getFullYear() - year;
      score += Math.max(0, 6 - diff);
    }
    return { book: b, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.book);
}

// ===== API calls =====

async function fetchGoogleBooks(query, maxResults = 20) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
    query
  )}&maxResults=${maxResults}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const items = data.items || [];
  return items.map(normalizeBookFromGoogle);
}

async function fetchNaverBooksProxy(query, display = 20) {
  const url = `/api/naver-search?query=${encodeURIComponent(query)}&display=${display}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("Naver proxy non-200:", res.status);
      return [];
    }
    const data = await res.json();
    const items = data.items || [];
    return items.map((item, idx) => normalizeBookFromNaver(item, idx));
  } catch (err) {
    console.warn("Naver proxy error", err);
    return [];
  }
}

// ===== Render functions =====

function renderResultsList(books) {
  const resultsEl = document.getElementById("results");
  resultsEl.innerHTML = "";

  if (!books.length) {
    resultsEl.innerHTML =
      '<div class="result-empty">검색 결과가 없습니다. 검색어를 조금 다르게 입력해 보세요.</div>';
    return;
  }

  const frag = document.createDocumentFragment();

  books.forEach((book, index) => {
    const card = document.createElement("div");
    card.className = "book-card";
    card.dataset.index = String(index);

    const thumb = document.createElement("img");
    thumb.className = "book-thumb";
    thumb.src = book.thumbnail || "";
    thumb.alt = book.title;
    if (!book.thumbnail) {
      thumb.style.background =
        "linear-gradient(135deg, #e5e7eb 0%, #cbd5f5 40%, #e5e7eb 100%)";
    }

    const infoWrap = document.createElement("div");
    infoWrap.className = "book-info-main";

    const t = document.createElement("div");
    t.className = "book-title";
    t.textContent = book.title;

    const meta = document.createElement("div");
    meta.className = "book-meta";
    const parts = [];
    if (book.authors && book.authors.length) parts.push(book.authors.join(", "));
    if (book.publisher) parts.push(book.publisher);
    if (book.publishedDate) parts.push(book.publishedDate.slice(0, 10));
    meta.textContent = parts.join(" · ");

    const tag = document.createElement("div");
    tag.className = "book-tag";
    tag.textContent = book.source === "naver" ? "Naver Books" : "Google Books";

    infoWrap.appendChild(t);
    infoWrap.appendChild(meta);
    infoWrap.appendChild(tag);

    card.appendChild(thumb);
    card.appendChild(infoWrap);

    card.addEventListener("click", () => {
      selectBook(index);
    });

    frag.appendChild(card);
  });

  resultsEl.appendChild(frag);
}

function renderEmptyDetails() {
  const panel = document.getElementById("detailsPanel");
  panel.classList.add("empty");
  panel.innerHTML = `
    <div class="empty-state">
      <h2>상세 요약 &amp; 추천</h2>
      <p>왼쪽에서 책을 선택하면 여기에서 상세 정보와 AI 요약, 추천 도서를 확인할 수 있어요.</p>
    </div>
  `;
}

function renderDetails(book) {
  const panel = document.getElementById("detailsPanel");
  panel.classList.remove("empty");

  const authorsLabel = (book.authors && book.authors.length)
    ? book.authors.join(", ")
    : "저자 정보 없음";

  const submetaParts = [];
  if (book.publisher) submetaParts.push(book.publisher);
  if (book.publishedDate) submetaParts.push(book.publishedDate.slice(0, 10));
  if (book.isbn) submetaParts.push(`ISBN ${book.isbn}`);

  const categoryLabel = (book.categories && book.categories.length)
    ? book.categories.join(" / ")
    : "카테고리 정보 없음";

  panel.innerHTML = `
    <div class="book-detail-layout">
      <div class="book-detail-left">
        <img
          class="book-detail-cover"
          src="${book.thumbnail || ""}"
          alt="${book.title}"
          onerror="this.style.background='#e5e7eb'; this.src='';"
        />
        <div class="book-detail-meta">
          <div class="book-detail-title">${book.title}</div>
          <div class="book-detail-author">${authorsLabel}</div>
          <div class="book-detail-submeta">
            ${submetaParts.map((p) => `<span>${p}</span>`).join("")}
          </div>
          <div class="detail-pill-row">
            <div class="detail-pill">${book.source === "naver" ? "Naver Books" : "Google Books"}</div>
            <div class="detail-pill">${categoryLabel}</div>
          </div>
        </div>
      </div>
      <div class="book-detail-right">
        <section id="summaryBox" class="summary-section">
          <h3>상세 요약 &amp; 한줄평</h3>
          <div id="summaryText" class="summary-text">요약을 생성하는 중입니다...</div>
        </section>

        <section class="rec-section" id="authorRecSection">
          <div class="rec-header-row">
            <div class="rec-title">저자의 다른 책</div>
            <div class="rec-intro" id="authorRecIntro"></div>
          </div>
          <div id="authorRecs" class="rec-scroll"></div>
        </section>

        <section class="rec-section" id="similarRecSection">
          <div class="rec-header-row">
            <div class="rec-title">비슷한 분위기의 책</div>
            <div class="rec-intro" id="similarRecIntro"></div>
          </div>
          <div id="similarRecs" class="rec-scroll"></div>
        </section>
      </div>
    </div>
  `;
}

function renderRecommendations(rec, containerId, introId) {
  const container = document.getElementById(containerId);
  const introEl = document.getElementById(introId);

  if (!container || !introEl) return;

  if (!rec || !Array.isArray(rec.books) || rec.books.length === 0) {
    introEl.textContent =
      rec && rec.intro ? rec.intro : "추천 도서를 찾지 못했습니다.";
    container.innerHTML =
      '<div class="rec-empty">추천 도서를 찾지 못했습니다.</div>';
    return;
  }

  introEl.textContent = rec.intro || "";

  const frag = document.createDocumentFragment();
  rec.books.forEach((title) => {
    const card = document.createElement("div");
    card.className = "rec-card";
    const t = document.createElement("div");
    t.className = "rec-book-title";
    t.textContent = title;
    const meta = document.createElement("div");
    meta.className = "rec-book-meta";
    meta.textContent = "이 제목으로 다시 검색";

    card.appendChild(t);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      // clicking a recommendation triggers a new search
      const input = document.getElementById("searchInput");
      input.value = title;
      searchBooks();
    });

    frag.appendChild(card);
  });

  container.innerHTML = "";
  container.appendChild(frag);
}

// ===== Summary API =====

async function generateSummaryForBook(book) {
  const summaryEl = document.getElementById("summaryText");
  if (!summaryEl) return;
  summaryEl.textContent = "요약을 생성하는 중입니다...";

  const payload = {
    title: book.title,
    authors: book.authors || [],
    categories: book.categories || [],
    description: book.description || "",
  };

  try {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn("Summary API non-200:", res.status);
      summaryEl.textContent =
        "요약을 생성하지 못했습니다. 네트워크 상태를 확인해 주세요.";
      return;
    }

    const data = await res.json();

    summaryEl.textContent = data.summary || "요약을 생성하지 못했습니다.";

    renderRecommendations(
      data.authorRecommendations,
      "authorRecs",
      "authorRecIntro"
    );
    renderRecommendations(
      data.similarBookRecommendations,
      "similarRecs",
      "similarRecIntro"
    );
  } catch (err) {
    console.error("Summary error:", err);
    summaryEl.textContent =
      "요약을 생성하지 못했습니다. 네트워크 상태를 확인해 주세요.";
    renderRecommendations(
      null,
      "authorRecs",
      "authorRecIntro"
    );
    renderRecommendations(
      null,
      "similarRecs",
      "similarRecIntro"
    );
  }
}

// ===== Search logic =====

async function searchBooks() {
  const input = document.getElementById("searchInput");
  const q = (input.value || "").trim();
  if (!q) {
    alert("검색어를 입력해 주세요. (책 제목 / 저자 / ISBN)");
    return;
  }

  const resultsEl = document.getElementById("results");
  resultsEl.innerHTML = '<div class="result-empty">검색 중입니다...</div>';
  renderEmptyDetails();

  try {
    const [googleItems, naverItems] = await Promise.all([
      fetchGoogleBooks(q, 20),
      fetchNaverBooksProxy(q, 20),
    ]);

    const merged = mergeAndRankResults(googleItems, naverItems);
    currentResults = merged;
    renderResultsList(merged);
  } catch (err) {
    console.error("Search error:", err);
    resultsEl.innerHTML =
      '<div class="result-empty">검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.</div>';
  }
}

function selectBook(index) {
  const book = currentResults[index];
  if (!book) return;
  selectedBook = book;
  renderDetails(book);
  generateSummaryForBook(book);
}

// ===== Autocomplete (simple; based on last results) =====

function updateAutocomplete() {
  const input = document.getElementById("searchInput");
  const listEl = document.getElementById("autocompleteList");
  const q = (input.value || "").trim();

  if (!q || !currentResults.length) {
    listEl.classList.add("hidden");
    return;
  }

  const lower = q.toLowerCase();
  const matched = currentResults
    .filter((b) => b.title.toLowerCase().includes(lower))
    .slice(0, 8);

  if (!matched.length) {
    listEl.classList.add("hidden");
    return;
  }

  listEl.innerHTML = "";
  matched.forEach((b) => {
    const item = document.createElement("div");
    item.className = "autocomplete-item";
    const label = document.createElement("span");
    label.textContent = b.title;
    const meta = document.createElement("span");
    meta.className = "label";
    meta.textContent =
      b.authors && b.authors.length ? b.authors.join(", ") : "저자 정보 없음";
    item.appendChild(label);
    item.appendChild(meta);

    item.addEventListener("click", () => {
      input.value = b.title;
      listEl.classList.add("hidden");
      searchBooks();
    });

    listEl.appendChild(item);
  });

  listEl.classList.remove("hidden");
}

// ===== Init =====

window.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("searchInput");
  const button = document.getElementById("searchButton");
  const listEl = document.getElementById("autocompleteList");

  renderEmptyDetails();

  button.addEventListener("click", () => {
    listEl.classList.add("hidden");
    searchBooks();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      listEl.classList.add("hidden");
      searchBooks();
    }
  });

  input.addEventListener(
    "input",
    debounce(() => {
      updateAutocomplete();
    }, 180)
  );

  document.addEventListener("click", (e) => {
    if (
      !listEl.classList.contains("hidden") &&
      !listEl.contains(e.target) &&
      e.target !== input
    ) {
      listEl.classList.add("hidden");
    }
  });
});
