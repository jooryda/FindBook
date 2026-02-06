const API = "/api/precheck";

// TODO: 여기에 실제 리스트 데이터로 교체하면 됩니다.
// id는 '레코드 고유값'으로 유지되어야 체크 상태가 안정적으로 유지됩니다.
const rows = [
  {
    id: "row-1",
    no: 1,
    name: "SNTTIG",
    desc: "SNUTTIG 봉제인형 북극곰/화이트",
    article: "502.981.02",
    location: "S09",
    qty: "1",
    date: new Date().toISOString().slice(0, 10)
  }
];

let state = { updatedAt: null, items: {} };

function $(id) { return document.getElementById(id); }

function escapeHtml(s) {
  return String(s).replace(/[&<>\"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function render() {
  $("updatedAt").textContent = state.updatedAt ? `마지막 저장: ${state.updatedAt}` : "저장 기록 없음";
  const tbody = $("tbody");
  tbody.innerHTML = "";

  for (const r of rows) {
    const checked = !!state.items[r.id];
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><input type="checkbox" data-id="${escapeHtml(r.id)}" ${checked ? "checked" : ""}></td>
      <td>${escapeHtml(r.no)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.desc)}</td>
      <td>${escapeHtml(r.article)}</td>
      <td>${escapeHtml(r.location)}</td>
      <td>${escapeHtml(r.qty)}</td>
      <td>${escapeHtml(r.date)}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function loadState() {
  const res = await fetch(API, { method: "GET", cache: "no-store" });
  state = await res.json();
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 250);
}

async function saveState() {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: state.items })
  });
  const data = await res.json();
  if (data?.ok) {
    state.updatedAt = data.updatedAt;
    $("updatedAt").textContent = `마지막 저장: ${state.updatedAt}`;
  }
}

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el?.matches('input[type="checkbox"][data-id]')) {
    const id = el.getAttribute("data-id");
    state.items[id] = el.checked;
    scheduleSave();
  }
});

document.addEventListener("click", async (e) => {
  const el = e.target;
  if (el?.id === "refreshBtn") {
    await loadState();
    render();
  }
});

(async function init() {
  await loadState();
  render();
})();
