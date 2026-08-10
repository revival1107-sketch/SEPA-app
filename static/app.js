const API_BASE = "";
let priceChartInstance = null;
let dataDisplayEnabled = false;

function drawCrosshairLabel(ctx, text, cx, cy, align, bounds) {
  ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
  const paddingX = 6;
  const boxH = 18;
  const textWidth = ctx.measureText(text).width;
  const boxW = textWidth + paddingX * 2;
  let boxX, boxY;
  if (align === "top") {
    boxX = cx - boxW / 2;
    boxY = bounds.top;
  } else {
    boxX = bounds.right;
    boxY = cy - boxH / 2;
  }
  boxX = Math.max(bounds.left, Math.min(boxX, bounds.canvasWidth - boxW));
  boxY = Math.max(0, Math.min(boxY, bounds.canvasHeight - boxH));
  ctx.fillStyle = "rgba(45,52,68,0.95)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = "rgba(226,230,238,0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
  ctx.fillStyle = "#e6e8ef";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, boxX + paddingX, boxY + boxH / 2 + 0.5);
}

function formatCrosshairDate(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatCrosshairPrice(value) {
  if (value == null || isNaN(value)) return "";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const crosshairPlugin = {
  id: "crosshair",
  afterDraw(chart) {
    const active = chart.getActiveElements();
    if (!active || !active.length) return;
    const { ctx, chartArea, scales } = chart;
    const { x, y } = active[0].element;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(226,230,238,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const bounds = { ...chartArea, canvasWidth: chart.width, canvasHeight: chart.height };
    if (scales.x) {
      const dateLabel = formatCrosshairDate(scales.x.getValueForPixel(x));
      if (dateLabel) drawCrosshairLabel(ctx, dateLabel, x, y, "top", bounds);
    }
    if (scales.y) {
      const priceLabel = formatCrosshairPrice(scales.y.getValueForPixel(y));
      if (priceLabel) drawCrosshairLabel(ctx, priceLabel, x, y, "right", bounds);
    }
    ctx.restore();
  },
};
Chart.register(crosshairPlugin);

function positionAxisDragZones(chart) {
  const wrap = chart.canvas.parentElement;
  if (!wrap) return;
  const yZone = wrap.querySelector(".axis-drag-y");
  const xZone = wrap.querySelector(".axis-drag-x");
  const area = chart.chartArea;
  if (!area) return;
  const w = chart.canvas.clientWidth;
  const h = chart.canvas.clientHeight;
  if (yZone) {
    yZone.style.left = area.right + "px";
    yZone.style.top = area.top + "px";
    yZone.style.width = Math.max(0, w - area.right) + "px";
    yZone.style.height = Math.max(0, area.bottom - area.top) + "px";
  }
  if (xZone) {
    xZone.style.left = area.left + "px";
    xZone.style.top = area.bottom + "px";
    xZone.style.width = Math.max(0, area.right - area.left) + "px";
    xZone.style.height = Math.max(0, h - area.bottom) + "px";
  }
}

const axisZoneSyncPlugin = {
  id: "axisZoneSync",
  afterLayout(chart) {
    positionAxisDragZones(chart);
  },
};
Chart.register(axisZoneSyncPlugin);

function setupAxisDrag(zoneEl, chartGetter, axis) {
  if (!zoneEl) return;
  const K = 0.006;
  let dragging = false;
  let startPos = 0;
  let startMin = 0;
  let startMax = 0;

  zoneEl.addEventListener("pointerdown", (e) => {
    const chart = chartGetter();
    if (!chart || !chart.scales[axis]) return;
    dragging = true;
    startPos = axis === "y" ? e.clientY : e.clientX;
    startMin = chart.scales[axis].min;
    startMax = chart.scales[axis].max;
    try { zoneEl.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    e.preventDefault();
  });

  zoneEl.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const chart = chartGetter();
    if (!chart) return;
    const pos = axis === "y" ? e.clientY : e.clientX;
    const rawDelta = pos - startPos;
    const signedDelta = axis === "y" ? rawDelta : -rawDelta;
    const factor = Math.exp(signedDelta * K);
    const range = startMax - startMin;
    const newRange = range * factor;
    const center = (startMax + startMin) / 2;
    chart.zoomScale(axis, { min: center - newRange / 2, max: center + newRange / 2 }, "none");
  });

  const endDrag = () => { dragging = false; };
  zoneEl.addEventListener("pointerup", endDrag);
  zoneEl.addEventListener("pointercancel", endDrag);
}

function setupPlotPan(canvasId, chartGetter) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function inPlotArea(chart, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const area = chart.chartArea;
    return area && x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
  }

  canvas.addEventListener("pointerdown", (e) => {
    const chart = chartGetter();
    if (!chart || !inPlotArea(chart, e.clientX, e.clientY)) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const chart = chartGetter();
    if (!chart) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (dx === 0 && dy === 0) return;
    chart.pan({ x: -dx, y: -dy }, undefined, "none");
  });

  const endDrag = () => { dragging = false; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
}

setupPlotPan("priceChart", () => priceChartInstance);
setupPlotPan("popupChart", () => popupChartInstance);

setupAxisDrag(document.getElementById("priceChartYAxisDrag"), () => priceChartInstance, "y");
setupAxisDrag(document.getElementById("priceChartXAxisDrag"), () => priceChartInstance, "x");
setupAxisDrag(document.getElementById("popupChartYAxisDrag"), () => popupChartInstance, "y");
setupAxisDrag(document.getElementById("popupChartXAxisDrag"), () => popupChartInstance, "x");

// ---- 봉 주기(일봉/주봉/월봉) ----
let currentInterval = "day";

function getPeriodKey(dateStr, interval) {
  const d = new Date(dateStr + "T00:00:00");
  if (interval === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function resampleChartData(chart, interval) {
  if (interval === "day") return chart;
  const n = chart.dates.length;
  const buckets = [];
  const indexByKey = new Map();
  for (let i = 0; i < n; i++) {
    const key = getPeriodKey(chart.dates[i], interval);
    if (!indexByKey.has(key)) {
      indexByKey.set(key, buckets.length);
      buckets.push({
        date: chart.dates[i],
        open: chart.open[i], high: chart.high[i], low: chart.low[i], close: chart.close[i],
        volume: 0, sma50: null, sma150: null, sma200: null,
      });
    }
    const b = buckets[indexByKey.get(key)];
    b.date = chart.dates[i];
    if (chart.high[i] != null) b.high = b.high == null ? chart.high[i] : Math.max(b.high, chart.high[i]);
    if (chart.low[i] != null) b.low = b.low == null ? chart.low[i] : Math.min(b.low, chart.low[i]);
    if (chart.close[i] != null) b.close = chart.close[i];
    if (chart.volume[i] != null) b.volume += chart.volume[i];
    if (chart.sma50[i] != null) b.sma50 = chart.sma50[i];
    if (chart.sma150[i] != null) b.sma150 = chart.sma150[i];
    if (chart.sma200[i] != null) b.sma200 = chart.sma200[i];
  }
  return {
    dates: buckets.map(b => b.date),
    open: buckets.map(b => b.open),
    high: buckets.map(b => b.high),
    low: buckets.map(b => b.low),
    close: buckets.map(b => b.close),
    volume: buckets.map(b => b.volume),
    sma50: buckets.map(b => b.sma50),
    sma150: buckets.map(b => b.sma150),
    sma200: buckets.map(b => b.sma200),
  };
}

function setInterval_(interval) {
  currentInterval = interval;
  document.querySelectorAll(".interval-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.interval === interval);
  });
  if (lastChartData) {
    if (priceChartInstance) renderChart(lastChartData);
    if (popupChartInstance) {
      const ctx = document.getElementById("popupChart").getContext("2d");
      popupChartInstance.destroy();
      popupChartInstance = new Chart(ctx, buildChartConfig(resampleChartData(lastChartData, currentInterval)));
      requestAnimationFrame(() => { if (popupChartInstance) popupChartInstance.resize(); });
    }
  }
}

document.querySelectorAll(".interval-btn").forEach(btn => {
  btn.addEventListener("click", () => setInterval_(btn.dataset.interval));
});

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
    if (btn.dataset.tab === "watchlist") loadWatchlist();
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
  currentInterval = "day";
  document.querySelectorAll(".interval-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.interval === "day");
  });
  renderChart(data.chart);
  renderVcp(data.vcp);
  renderRs(data);
  currentAnalyzed = { ticker: data.ticker, name: data.name, market: data.market };
  updateWatchlistToggleUI();
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

let lastChartData = null;
let popupChartInstance = null;

function isMobileViewport() {
  return window.innerWidth <= 768;
}

function buildChartConfig(chart) {
  const mobile = isMobileViewport();
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

  return {
    type: "candlestick",
    data: {
      datasets: [
        {
          type: "candlestick", label: "가격", data: candleData,
          color: { up: "#ef4a5f", down: "#2fbf71", unchanged: "#9aa0b0" },
          parsing: false,
          barPercentage: mobile ? 0.85 : 0.7,
          order: 1,
        },
        { type: "line", label: "50일선", data: lineData(chart.sma50), borderColor: "#4f8cff", borderWidth: mobile ? 1.6 : 1.2, pointRadius: 0, order: 2 },
        { type: "line", label: "150일선", data: lineData(chart.sma150), borderColor: "#e0a52c", borderWidth: mobile ? 1.6 : 1.2, pointRadius: 0, order: 2 },
        { type: "line", label: "200일선", data: lineData(chart.sma200), borderColor: "#ef9a4a", borderWidth: mobile ? 1.6 : 1.2, pointRadius: 0, order: 2 },
        {
          type: "bar", label: "거래량", data: volumeData, yAxisID: "volume",
          backgroundColor: "rgba(79,140,255,0.35)", order: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      events: ["mousemove", "mouseout", "click", "touchstart", "touchmove", "mousedown", "mouseup"],
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          type: "timeseries",
          time: { unit: "month" },
          ticks: { color: "#9aa0b0", maxTicksLimit: mobile ? 5 : 8, autoSkip: true, maxRotation: 0, font: { size: mobile ? 11 : 12 } },
          grid: { color: "#2a2e3a" },
        },
        y: {
          position: "right",
          ticks: { color: "#9aa0b0", font: { size: mobile ? 11 : 12 } },
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
        legend: { labels: { color: "#e6e8ef", filter: (item) => item.text !== "거래량", font: { size: mobile ? 11 : 12 }, boxWidth: mobile ? 12 : 24 } },
        zoom: {
          pan: { enabled: false },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: "xy",
          },
          limits: {
            x: { min: "original", max: "original" },
            y: { min: "original", max: "original" },
          },
        },
        tooltip: {
          enabled: dataDisplayEnabled,
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
  };
}

function renderChart(chart) {
  lastChartData = chart;
  const ctx = document.getElementById("priceChart").getContext("2d");
  if (priceChartInstance) priceChartInstance.destroy();
  priceChartInstance = new Chart(ctx, buildChartConfig(resampleChartData(chart, currentInterval)));
  requestAnimationFrame(() => { if (priceChartInstance) priceChartInstance.resize(); });
}

function openChartPopup() {
  if (!lastChartData) return;
  document.getElementById("chartModal").classList.remove("hidden");
  document.getElementById("chartModalTitle").textContent = document.getElementById("chartTitle").textContent;
  document.getElementById("popupDataDisplayBtn").classList.toggle("active", dataDisplayEnabled);
  document.body.style.overflow = "hidden";
  const ctx = document.getElementById("popupChart").getContext("2d");
  if (popupChartInstance) popupChartInstance.destroy();
  popupChartInstance = new Chart(ctx, buildChartConfig(resampleChartData(lastChartData, currentInterval)));
  requestAnimationFrame(() => { if (popupChartInstance) popupChartInstance.resize(); });
}

function closeChartPopup() {
  document.getElementById("chartModal").classList.add("hidden");
  document.body.style.overflow = "";
  if (popupChartInstance) {
    popupChartInstance.destroy();
    popupChartInstance = null;
  }
}

document.getElementById("popupChartBtn").addEventListener("click", openChartPopup);
document.getElementById("popupCloseBtn").addEventListener("click", closeChartPopup);
document.getElementById("popupResetZoomBtn").addEventListener("click", () => {
  if (popupChartInstance) popupChartInstance.resetZoom();
});
document.getElementById("chartModal").addEventListener("click", (e) => {
  if (e.target.id === "chartModal") closeChartPopup();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("chartModal").classList.contains("hidden")) closeChartPopup();
});

function toggleDataDisplay() {
  dataDisplayEnabled = !dataDisplayEnabled;
  document.getElementById("dataDisplayBtn").classList.toggle("active", dataDisplayEnabled);
  document.getElementById("popupDataDisplayBtn").classList.toggle("active", dataDisplayEnabled);
  [priceChartInstance, popupChartInstance].forEach(instance => {
    if (!instance) return;
    instance.options.plugins.tooltip.enabled = dataDisplayEnabled;
    instance.update();
  });
}

document.getElementById("dataDisplayBtn").addEventListener("click", toggleDataDisplay);
document.getElementById("popupDataDisplayBtn").addEventListener("click", toggleDataDisplay);

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

// ---- 관심종목(Watchlist) ----
let watchlistItems = {}; // ticker -> item
let watchlistConfigured = true;
let currentAnalyzed = null; // {ticker, name, market}
let noteSaveTimer = null;

async function loadWatchlist() {
  const statusEl = document.getElementById("watchlistStatus");
  statusEl.textContent = "불러오는 중...";
  try {
    const res = await fetch(`${API_BASE}/api/watchlist`);
    const data = await res.json();
    watchlistConfigured = data.configured !== false;
    watchlistItems = {};
    (data.items || []).forEach(it => { watchlistItems[it.ticker] = it; });
    statusEl.textContent = watchlistConfigured ? "" : "Supabase 미설정";
    renderWatchlistList();
    updateWatchlistToggleUI();
  } catch (err) {
    statusEl.textContent = "불러오기 오류: " + err.message;
  }
}

function renderWatchlistList() {
  const box = document.getElementById("watchlistResult");
  if (!watchlistConfigured) {
    box.innerHTML = `<p class="empty-state">Supabase가 아직 설정되지 않았습니다. SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수를 설정하면 관심종목·메모 기능이 활성화됩니다.</p>`;
    return;
  }
  const items = Object.values(watchlistItems);
  if (!items.length) {
    box.innerHTML = `<p class="empty-state">관심종목이 없습니다. 종목 분석 화면에서 "☆ 관심종목 추가"를 눌러보세요.</p>`;
    return;
  }
  box.innerHTML = "";
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "watchlist-card";
    const marketLabel = item.market === "KR" ? "코스피/코스닥" : "미국/해외";
    card.innerHTML = `
      <div class="watchlist-card-header">
        <div>
          <div class="watchlist-card-title">${item.ticker} (${item.name || item.ticker})</div>
          <div class="watchlist-card-sub">${marketLabel}</div>
        </div>
        <button class="watchlist-remove-btn">삭제</button>
      </div>
      <textarea class="note-textarea" style="margin-top:10px;" placeholder="메모 입력...">${item.note || ""}</textarea>
    `;
    card.querySelector(".watchlist-card-title").addEventListener("click", () => {
      tickerInput.value = item.ticker;
      runAnalyze(item.ticker);
    });
    card.querySelector(".watchlist-remove-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      await removeFromWatchlist(item.ticker);
    });
    const textarea = card.querySelector("textarea");
    textarea.addEventListener("input", () => {
      clearTimeout(noteSaveTimer);
      noteSaveTimer = setTimeout(() => saveNote(item.ticker, textarea.value), 800);
    });
    box.appendChild(card);
  });
}

function updateWatchlistToggleUI() {
  const btn = document.getElementById("watchlistToggleBtn");
  const noteBox = document.getElementById("watchlistNoteBox");
  const noteInput = document.getElementById("watchlistNoteInput");
  if (!currentAnalyzed) {
    btn.classList.add("hidden");
    noteBox.classList.add("hidden");
    return;
  }
  btn.classList.remove("hidden");
  if (!watchlistConfigured) {
    btn.textContent = "Supabase 미설정";
    btn.disabled = true;
    noteBox.classList.add("hidden");
    return;
  }
  btn.disabled = false;
  const inList = !!watchlistItems[currentAnalyzed.ticker];
  btn.textContent = inList ? "★ 관심종목 제거" : "☆ 관심종목 추가";
  btn.classList.toggle("active", inList);
  if (inList) {
    noteBox.classList.remove("hidden");
    noteInput.value = watchlistItems[currentAnalyzed.ticker].note || "";
  } else {
    noteBox.classList.add("hidden");
  }
}

async function toggleWatchlist() {
  if (!currentAnalyzed || !watchlistConfigured) return;
  const btn = document.getElementById("watchlistToggleBtn");
  btn.disabled = true;
  try {
    const inList = !!watchlistItems[currentAnalyzed.ticker];
    if (inList) {
      await removeFromWatchlist(currentAnalyzed.ticker);
    } else {
      const res = await fetch(`${API_BASE}/api/watchlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: currentAnalyzed.ticker }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "추가 실패");
      watchlistItems[data.item.ticker] = data.item;
      updateWatchlistToggleUI();
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function removeFromWatchlist(ticker) {
  try {
    const res = await fetch(`${API_BASE}/api/watchlist/${encodeURIComponent(ticker)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "삭제 실패");
    }
    delete watchlistItems[ticker];
    updateWatchlistToggleUI();
    renderWatchlistList();
  } catch (err) {
    alert(err.message);
  }
}

async function saveNote(ticker, note) {
  const statusEl = document.getElementById("watchlistNoteStatus");
  try {
    const res = await fetch(`${API_BASE}/api/watchlist/${encodeURIComponent(ticker)}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "저장 실패");
    if (watchlistItems[ticker]) watchlistItems[ticker].note = note;
    if (statusEl) { statusEl.textContent = "저장됨"; setTimeout(() => { statusEl.textContent = ""; }, 1500); }
  } catch (err) {
    if (statusEl) statusEl.textContent = "저장 오류: " + err.message;
  }
}

document.getElementById("watchlistToggleBtn").addEventListener("click", toggleWatchlist);
document.getElementById("watchlistRefreshBtn").addEventListener("click", loadWatchlist);
document.getElementById("watchlistNoteInput").addEventListener("input", () => {
  if (!currentAnalyzed) return;
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => saveNote(currentAnalyzed.ticker, document.getElementById("watchlistNoteInput").value), 800);
});

loadWatchlist();
