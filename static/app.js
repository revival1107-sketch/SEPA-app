const API_BASE = "";
let priceChartInstance = null;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ---- 탭 전환 ----
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

function switchToAnalyzeTab() {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelector('.tab-btn[data-tab="analyze"]').classList.add("active");
  document.getElementById("tab-analyze").classList.add("active");
}

// ---- 종목 분석 ----
const tickerInput = document.getElementById("tickerInput");
const analyzeBtn = document.getElementById("analyzeBtn");

analyzeBtn.addEventListener("click", () => runAnalyze(tickerInput.value));
tickerInput.addEventListener("keydown", e => {
  if (e.key === "Enter") runAnalyze(tickerInput.value);
});

function setState(state) {
  document.getElementById("analyzeEmpty").classList.toggle("hidden", state !== "empty");
  document.getElementById("analyzeLoading").classList.toggle("hidden", state !== "loading");
  document.getElementById("analyzeError").classList.toggle("hidden", state !== "error");
  document.getElementById("analyzeResult").classList.toggle("hidden", state !== "result");
}

async function runAnalyze(rawTicker) {
  const ticker = (rawTicker || "").trim();
  if (!ticker) return;
  switchToAnalyzeTab();
  setState("loading");
  try {
    const res = await fetch(`${API_BASE}/api/analyze?ticker=${encodeURIComponent(ticker)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "분석 중 오류가 발생했습니다.");
    }
    renderResult(data);
    setState("result");
  } catch (err) {
    document.getElementById("analyzeError").textContent = err.message;
    setState("error");
  }
}

function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function formatValueWithYoy(value, yoyPct) {
  if (value === null || value === undefined) return "-";
  const text = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (yoyPct === null || yoyPct === undefined) return text;
  return `${text} (${fmtPct(yoyPct)})`;
}

function formatEpsValue(q) {
  if (!q) return "-";
  return formatValueWithYoy(q.eps, q.yoy_growth_pct);
}

function formatOiValue(q, currency) {
  if (!q) return "-";
  const scaled = currency === "KRW" ? q.value / 1e8 : q.value / 1e6;
  const unit = currency === "KRW" ? "억" : "M";
  const text = `${scaled.toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`;
  if (q.yoy_growth_pct === null || q.yoy_growth_pct === undefined) return text;
  return `${text} (${fmtPct(q.yoy_growth_pct)})`;
}

function formatMarketCap(value, currency) {
  if (value === null || value === undefined) return "-";
  if (currency === "KRW") {
    const jo = value / 1e12;
    return jo >= 1 ? `${jo.toLocaleString(undefined, { maximumFractionDigits: 1 })}조원` : `${(value / 1e8).toLocaleString(undefined, { maximumFractionDigits: 0 })}억원`;
  }
  const symbol = currency === "USD" || !currency ? "$" : currency + " ";
  if (value >= 1e12) return `${symbol}${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${symbol}${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${symbol}${(value / 1e6).toFixed(1)}M`;
  return `${symbol}${value.toLocaleString()}`;
}

function renderResult(data) {
  const f = data.fundamentals || {};
  document.getElementById("resName").textContent = `${data.ticker} (${data.name})`;
  const marketLabel = f.exchange_label || (data.market === "KR" ? "한국" : "미국/해외");
  const marketCapText = "시가총액 " + formatMarketCap(f.market_cap, f.currency);
  document.getElementById("resMeta").textContent =
    [marketLabel, marketCapText, data.sector, data.industry].filter(Boolean).join(" · ");
  document.getElementById("resPrice").textContent = data.close.toLocaleString();

  const verdictEl = document.getElementById("resVerdict");
  const tt = data.trend_template;
  if (tt.all_pass) {
    verdictEl.textContent = "트렌드 템플릿 8/8 충족 (스테이지 2 후보)";
    verdictEl.className = "verdict pass";
  } else {
    verdictEl.textContent = `트렌드 템플릿 ${tt.passed_count}/8 충족`;
    verdictEl.className = "verdict fail";
  }

  renderChecklist(tt.checks);
  renderChart(data.chart);
  renderVcp(data.vcp);
  renderRs(data);
}

document.getElementById("resetZoomBtn").addEventListener("click", () => {
  if (priceChartInstance) priceChartInstance.resetZoom();
});

function renderChecklist(checks) {
  const ul = document.getElementById("checklist");
  ul.innerHTML = "";
  checks.forEach(c => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="check-badge ${c.passed ? "pass" : "fail"}">${c.passed ? "✓" : "✕"}</div>
      <div class="check-text">
        <div class="label">${c.id}. ${c.label}</div>
        <div class="detail">${c.detail || ""}</div>
      </div>`;
    ul.appendChild(li);
  });
}

function renderChart(chart) {
  const ctx = document.getElementById("priceChart").getContext("2d");
  if (priceChartInstance) priceChartInstance.destroy();

  const n = chart.dates.length;
  const points = chart.dates.map(d => new Date(d + "T00:00:00").getTime());
  const volumeByX = {};
  chart.dates.forEach((d, i) => { volumeByX[points[i]] = chart.volume[i]; });

  const candleData = [];
  for (let i = 0; i < n; i++) {
    if (chart.open[i] == null || chart.high[i] == null || chart.low[i] == null || chart.close[i] == null) continue;
    candleData.push({ x: points[i], o: chart.open[i], h: chart.high[i], l: chart.low[i], c: chart.close[i] });
  }
  const lineData = (arr) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (arr[i] != null) out.push({ x: points[i], y: arr[i] });
    }
    return out;
  };
  const volumeData = chart.dates.map((d, i) => ({ x: points[i], y: chart.volume[i] }));

  priceChartInstance = new Chart(ctx, {
    type: "candlestick",
    data: {
      datasets: [
        {
          type: "candlestick", label: "가격", data: candleData,
          color: { up: "#2fbf71", down: "#ef4a5f", unchanged: "#9aa0b0" },
          parsing: false,
          order: 1,
        },
        { type: "line", label: "50일선", data: lineData(chart.sma50), borderColor: "#4f8cff", borderWidth: 1.2, pointRadius: 0, order: 2 },
        { type: "line", label: "150일선", data: lineData(chart.sma150), borderColor: "#e0a52c", borderWidth: 1.2, pointRadius: 0, order: 2 },
        { type: "line", label: "200일선", data: lineData(chart.sma200), borderColor: "#ef9a4a", borderWidth: 1.2, pointRadius: 0, order: 2 },
        {
          type: "bar", label: "거래량", data: volumeData, yAxisID: "volume",
          backgroundColor: "rgba(79,140,255,0.35)", order: 3,
        },
      ],
    },
    options: {
      responsive: true,
      animation: false,
      events: ["mousemove", "mouseout", "click", "touchstart", "touchmove", "mousedown", "mouseup"],
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          type: "timeseries",
          time: { unit: "month" },
          ticks: { color: "#9aa0b0", maxTicksLimit: 8, autoSkip: true, maxRotation: 0 },
          grid: { color: "#2a2e3a" },
        },
        y: {
          position: "right",
          ticks: { color: "#9aa0b0" },
          grid: { color: "#2a2e3a" },
        },
        volume: {
          position: "left",
          display: false,
          grid: { display: false },
          suggestedMax: (() => {
            const max = Math.max(...chart.volume.filter(v => v != null));
            return max * 4;
          })(),
        },
      },
      plugins: {
        legend: { labels: { color: "#e6e8ef", filter: (item) => item.text !== "거래량" } },
        zoom: {
          pan: { enabled: true, mode: "x" },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: "x",
          },
          limits: { x: { min: "original", max: "original" } },
        },
        tooltip: {
          filter: (item) => item.dataset.type !== "bar",
          callbacks: {
            label: (context) => {
              const raw = context.raw;
              const vol = volumeByX[raw.x];
              if (context.dataset.type === "candlestick") {
                const parts = [
                  `시가 ${raw.o.toLocaleString()}`,
                  `고가 ${raw.h.toLocaleString()}`,
                  `저가 ${raw.l.toLocaleString()}`,
                  `종가 ${raw.c.toLocaleString()}`,
                ];
                if (vol != null) parts.push(`거래량 ${vol.toLocaleString()}`);
                return parts;
              }
              if (context.dataset.type === "bar") {
                return `거래량 ${raw.y.toLocaleString()}`;
              }
              return `${context.dataset.label} ${raw.y.toLocaleString()}`;
            },
          },
        },
      },
    },
  });
}

function renderVcp(vcp) {
  const box = document.getElementById("vcpBox");
  let html = `<div class="vcp-status">${vcp.status}</div>`;
  html += `<div class="stat-row"><span class="label">피벗(저항선)</span><span class="value">${vcp.pivot ?? "-"}</span></div>`;
  html += `<div class="stat-row"><span class="label">현재가</span><span class="value">${vcp.last_close ?? "-"}</span></div>`;
  html += `<div class="stat-row"><span class="label">거래량/50일평균 배수</span><span class="value">${vcp.volume_ratio_vs_avg50 ?? "-"}x</span></div>`;
  html += `<div class="stat-row"><span class="label">수축폭 점진적 감소</span><span class="value">${vcp.contracting_pattern ? "예" : "아니오"}</span></div>`;
  html += `<div class="stat-row"><span class="label">수축 구간 거래량 감소</span><span class="value">${vcp.volume_declining ? "예" : "아니오"}</span></div>`;

  if (vcp.contractions && vcp.contractions.length) {
    html += `<table class="contraction-table"><thead><tr><th>구간</th><th>고점</th><th>저점</th><th>수축폭</th></tr></thead><tbody>`;
    vcp.contractions.forEach((c, i) => {
      html += `<tr><td>${i + 1}</td><td>${c.high}</td><td>${c.low}</td><td>${c.depth_pct}%</td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `<p class="hint">※ VCP는 스윙 고점/저점 기반 휴리스틱 추정치이며, 실제 패턴과 다를 수 있습니다.</p>`;
  box.innerHTML = html;
}

function renderRs(data) {
  const box = document.getElementById("rsBox");
  const f = data.fundamentals || {};
  const epsOutlook = f.eps_outlook || [];
  const oiQuarters = f.operating_income_quarters || [];
  const epsLabels = ["현재분기", "+1분기", "+2분기", "+3분기", "+4분기"];
  let html = "";
  html += `<div class="stat-row"><span class="label">RS Rating (유니버스 백분위)</span><span class="value">${data.rs_rating ?? "-"}</span></div>`;
  for (let i = 0; i < 5; i++) {
    const q = epsOutlook[i];
    const label = `${epsLabels[i]} EPS${q ? " (" + q.label + ")" : ""}`;
    html += `<div class="stat-row"><span class="label">${label}</span><span class="value">${formatEpsValue(q)}</span></div>`;
  }
  html += `<div class="stat-row"><span class="label">매출 성장률(YoY)</span><span class="value">${f.revenue_growth_yoy != null ? (f.revenue_growth_yoy * 100).toFixed(1) + "%" : "-"}</span></div>`;
  html += `<div class="stat-row"><span class="label">이익 성장률(YoY)</span><span class="value">${f.earnings_growth_yoy != null ? (f.earnings_growth_yoy * 100).toFixed(1) + "%" : "-"}</span></div>`;
  html += `<div class="stat-row"><span class="label">영업이익률</span><span class="value">${f.profit_margins != null ? (f.profit_margins * 100).toFixed(1) + "%" : "-"}</span></div>`;
  html += `<div class="stat-row"><span class="label">자기자본이익률(ROE)</span><span class="value">${f.return_on_equity != null ? (f.return_on_equity * 100).toFixed(1) + "%" : "-"}</span></div>`;
  html += `<p class="hint">※ EPS는 애널리스트 컨센서스 추정치이며, 무료 데이터 특성상 현재분기·+1분기까지만 제공되고 +2~+4분기는 데이터가 없어 "-"로 표시됩니다.</p>`;

  if (oiQuarters.length) {
    html += `<h4 style="margin:14px 0 6px 0;color:var(--muted);font-size:13px;font-weight:600;">분기별 영업이익 (실제)</h4>`;
    oiQuarters.forEach(q => {
      html += `<div class="stat-row"><span class="label">${q.label} 영업이익</span><span class="value">${formatOiValue(q, f.currency)}</span></div>`;
    });
  }
  box.innerHTML = html;
}

// ---- 종목 발굴(스크리닝) ----
const scanBtn = document.getElementById("scanBtn");
scanBtn.addEventListener("click", runScan);

async function runScan() {
  const market = document.querySelector('input[name="market"]:checked').value;
  const statusEl = document.getElementById("scanStatus");
  const resultEl = document.getElementById("screenResult");
  scanBtn.disabled = true;
  statusEl.textContent = "스캔 중입니다... (최초 실행 시 다소 시간이 걸릴 수 있습니다)";
  resultEl.innerHTML = "";
  try {
    const res = await fetch(`${API_BASE}/api/screen?market=${market}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "스캔 중 오류가 발생했습니다.");
    renderScreenResult(data);
    statusEl.textContent = "완료";
  } catch (err) {
    statusEl.textContent = "오류: " + err.message;
  } finally {
    scanBtn.disabled = false;
  }
}

function renderScreenResult(data) {
  const resultEl = document.getElementById("screenResult");
  let rows = [];
  Object.keys(data).forEach(market => {
    data[market].forEach(c => rows.push({ ...c, market }));
  });
  rows.sort((a, b) => (b.rs_rating || 0) - (a.rs_rating || 0));

  if (!rows.length) {
    resultEl.innerHTML = `<p class="empty-state">트렌드 템플릿 8개 조건을 모두 충족하는 종목이 없습니다. (약세장이거나 조건이 엄격한 시기일 수 있습니다)</p>`;
    return;
  }

  let html = `<div style="overflow-x:auto"><table class="screen-table"><thead><tr>
    <th>종목</th><th>현재가</th><th>시가총액</th><th>RS Rating</th>
    <th>현재분기 EPS</th><th>+1분기 EPS</th><th>+2분기 EPS</th><th>+3분기 EPS</th><th>+4분기 EPS</th>
    <th>영업이익(1)</th><th>영업이익(2)</th><th>영업이익(3)</th><th>영업이익(4)</th>
  </tr></thead><tbody>`;
  rows.forEach(r => {
    const marketLabel = r.exchange_label || (r.market === "KR" ? "한국" : "미국");
    const epsQ = r.eps_outlook || [];
    const oiQ = r.operating_income_quarters || [];
    const epsCells = [0, 1, 2, 3, 4].map(i => `<td>${epsQ[i] ? epsQ[i].label + ": " : ""}${formatEpsValue(epsQ[i])}</td>`).join("");
    const oiCells = [0, 1, 2, 3].map(i => `<td>${oiQ[i] ? oiQ[i].label + ": " : ""}${formatOiValue(oiQ[i], r.currency)}</td>`).join("");
    html += `<tr data-ticker="${r.ticker}">
      <td>
        <div class="stock-cell-ticker">${r.ticker}</div>
        <div class="stock-cell-name">${r.name || r.ticker}</div>
        <span class="badge-market">${marketLabel}</span>
      </td>
      <td>${r.close}</td>
      <td>${formatMarketCap(r.market_cap, r.currency)}</td>
      <td>${r.rs_rating ?? "-"}</td>
      ${epsCells}
      ${oiCells}
    </tr>`;
  });
  html += `</tbody></table></div>`;
  html += `<p class="hint">※ EPS는 애널리스트 컨센서스 추정치이며(현재분기·+1분기까지만 데이터 존재, 이후는 "-"), 영업이익은 실제 보고된 분기 실적입니다. 괄호 값은 전년 동기 대비 증감률입니다.</p>`;
  resultEl.innerHTML = html;

  resultEl.querySelectorAll("tr[data-ticker]").forEach(tr => {
    tr.addEventListener("click", () => {
      const t = tr.dataset.ticker;
      tickerInput.value = t;
      runAnalyze(t);
    });
  });
}
