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

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatCrosshairDate(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return formatLocalDate(d);
}

function formatCrosshairPrice(value) {
  if (value == null || isNaN(value)) return "";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function findNearestCandleByPixel(xScale, data, xPixel) {
  // Chart.js의 "index" 모드 히트테스트는 데이터 경계(특히 맨 마지막 캔들) 부근에서
  // 한 칸 옆 인덱스를 잘못 고르는 경우가 있어, 우리가 직접 이진 탐색으로 가장 가까운
  // 캔들을 찾는다(십자선 위치·날짜가 실제 마우스 x좌표와 항상 일치하도록).
  let lo = 0, hi = data.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xScale.getPixelForValue(data[mid].x) < xPixel) lo = mid + 1; else hi = mid;
  }
  if (lo > 0) {
    const prevPx = xScale.getPixelForValue(data[lo - 1].x);
    const curPx = xScale.getPixelForValue(data[lo].x);
    if (Math.abs(xPixel - prevPx) < Math.abs(curPx - xPixel)) return lo - 1;
  }
  return lo;
}

const crosshairPlugin = {
  id: "crosshair",
  afterDraw(chart) {
    const ev = chart._lastEvent;
    const { ctx, chartArea, scales } = chart;
    if (!ev || typeof ev.x !== "number" || typeof ev.y !== "number") return;
    if (ev.x < chartArea.left || ev.x > chartArea.right || ev.y < chartArea.top || ev.y > chartArea.bottom) return;
    const dsIndex = chart.data.datasets.findIndex(d => d.type === "candlestick");
    const candleData = dsIndex !== -1 ? chart.data.datasets[dsIndex].data : [];
    if (!candleData.length || !scales.x) return;

    const nearestIdx = findNearestCandleByPixel(scales.x, candleData, ev.x);
    const point = candleData[nearestIdx];
    const x = scales.x.getPixelForValue(point.x);
    const y = Math.max(chartArea.top, Math.min(ev.y, chartArea.bottom));
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
    {
      const dateLabel = formatCrosshairDate(point.x);
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

const currentPricePlugin = {
  id: "currentPrice",
  afterDraw(chart) {
    const candleDataset = chart.data.datasets.find(d => d.type === "candlestick");
    if (!candleDataset || !candleDataset.data.length) return;
    const last = candleDataset.data[candleDataset.data.length - 1];
    if (!last || last.c == null) return;
    const { ctx, chartArea, scales } = chart;
    if (!scales.y) return;
    const rawY = scales.y.getPixelForValue(last.c);
    if (rawY < chartArea.top - 30 || rawY > chartArea.bottom + 30) return;
    const y = Math.max(chartArea.top, Math.min(rawY, chartArea.bottom));
    const color = last.c >= last.o ? "#ef4a5f" : "#2fbf71";

    ctx.save();
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const label = formatCrosshairPrice(last.c);
    ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    const paddingX = 6;
    const boxH = 18;
    const textWidth = ctx.measureText(label).width;
    const boxW = textWidth + paddingX * 2;
    const boxX = chartArea.right;
    const boxY = Math.max(0, Math.min(y - boxH / 2, chart.height - boxH));
    ctx.fillStyle = color;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(label, boxX + paddingX, boxY + boxH / 2 + 0.5);
    ctx.restore();
  },
};
Chart.register(currentPricePlugin);

const MIN_CANDLE_WIDTH_PX = 1.2;
const minCandleWidthPlugin = {
  id: "minCandleWidth",
  // 10년치처럼 캔들 개수가 매우 많으면 캔들 하나당 폭이 1px보다 훨씬 작아져
  // 사실상 화면에 그려지지 않는다(서브픽셀). 폭이 너무 작을 때만 최소 폭으로 보정한다.
  beforeDatasetsDraw(chart) {
    const dsIndex = chart.data.datasets.findIndex(d => d.type === "candlestick");
    if (dsIndex === -1) return;
    const meta = chart.getDatasetMeta(dsIndex);
    if (!meta || !meta.data) return;
    meta.data.forEach(el => {
      if (typeof el.width === "number" && el.width < MIN_CANDLE_WIDTH_PX) {
        el.width = MIN_CANDLE_WIDTH_PX;
      }
    });
  },
};
Chart.register(minCandleWidthPlugin);

const hoverTrackerPlugin = {
  id: "hoverTracker",
  // chart._lastEvent는 tooltip.filter가 호출되는 시점 기준으로 한 이벤트 주기 뒤늦게
  // 갱신되어(afterDraw 시점에야 최신값이 됨), tooltip.filter 안에서 읽으면 "이전" 마우스
  // 위치를 보게 된다. beforeEvent는 그보다 먼저 실행되므로 여기서 직접 현재 위치를 저장한다.
  beforeEvent(chart, args) {
    const event = args.event;
    if (event.type === "mousemove" || event.type === "mouseover") {
      chart.__hoverX = event.x;
      chart.__hoverY = event.y;
    } else if (event.type === "mouseout") {
      chart.__hoverX = null;
      chart.__hoverY = null;
    }
  },
  // Chart.js는 "가장 가까운 인덱스"가 바뀌지 않으면 다시 그리지 않는다. 그래서 마지막
  // 캔들 다음 빈 여백으로 이동해도(가장 가까운 인덱스는 여전히 마지막 캔들이라) 재렌더가
  // 아예 발생하지 않아 beforeTooltipDraw 게이트가 다시 호출될 기회조차 없다. 매
  // mousemove/mouseout마다 강제로 "바뀜" 표시를 해서 매번 다시 그리게 만든다.
  afterEvent(chart, args) {
    const t = args.event.type;
    if (t === "mousemove" || t === "mouseover" || t === "mouseout") args.changed = true;
  },
};
Chart.register(hoverTrackerPlugin);

const tooltipGatePlugin = {
  id: "tooltipGate",
  // Chart.js는 "활성 인덱스"가 바뀔 때만 툴팁 내용을 다시 계산해서, tooltip.filter나
  // afterEvent에서 active elements를 손봐도 소용없다(핵심 내부 이벤트 처리가 그 이후에
  // 다시 덮어씀). beforeTooltipDraw는 실제로 그리기 직전 마지막에 호출되고 false를
  // 반환하면 draw() 자체를 건너뛰므로, 여기서 최종적으로 표시 여부를 결정한다.
  beforeTooltipDraw(chart) {
    const hoverX = chart.__hoverX;
    if (hoverX == null) return false;
    const dsIndex = chart.data.datasets.findIndex(d => d.type === "candlestick");
    if (dsIndex === -1) return true;
    const active = chart.getActiveElements();
    const candleItem = active.find(a => a.datasetIndex === dsIndex);
    if (!candleItem) return true;
    return isMouseOverCandleColumn(chart, hoverX, candleItem.element.x);
  },
};
Chart.register(tooltipGatePlugin);

function isMouseOverCandleColumn(chart, mouseX, elementX) {
  // chartjs-chart-financial의 캔들 hover-hitbox(intersect:true)는 실제 고가~저가 꼬리를
  // 다 덮지 못하는 버그가 있어(고가 쪽 꼬리가 거의 항상 hitbox 밖), 대신 현재 확대 배율
  // 기준으로 "캔들 한 칸" 간격을 직접 계산해 마우스가 그 칸 안에 있는지 판정한다.
  const dsIndex = chart.data.datasets.findIndex(d => d.type === "candlestick");
  if (dsIndex === -1) return true;
  const data = chart.data.datasets[dsIndex].data;
  if (data.length < 2 || !chart.scales.x) return true;
  const idx = findNearestCandleByPixel(chart.scales.x, data, elementX);
  const neighborIdx = idx + 1 < data.length ? idx + 1 : idx - 1;
  if (neighborIdx < 0) return true;
  const spacing = Math.abs(
    chart.scales.x.getPixelForValue(data[neighborIdx].x) - chart.scales.x.getPixelForValue(data[idx].x)
  ) || 20;
  return Math.abs(mouseX - elementX) <= Math.max(spacing * 0.6, 3);
}

const topLeftPricePlugin = {
  id: "topLeftPrice",
  afterDraw(chart) {
    const candleDataset = chart.data.datasets.find(d => d.type === "candlestick");
    if (!candleDataset || candleDataset.data.length < 1) return;
    const data = candleDataset.data;
    const last = data[data.length - 1];
    if (!last || last.c == null) return;
    const prev = data.length >= 2 ? data[data.length - 2] : null;
    const prevClose = prev && prev.c != null ? prev.c : null;
    const up = prevClose != null ? last.c >= prevClose : last.c >= last.o;
    const color = up ? "#ef4a5f" : "#2fbf71";

    let text = formatCrosshairPrice(last.c);
    if (prevClose != null && prevClose !== 0) {
      const pct = (last.c / prevClose - 1) * 100;
      const sign = pct >= 0 ? "+" : "";
      text += `  (${sign}${pct.toFixed(2)}%)`;
    }

    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(text, chartArea.left + 8, chartArea.top + 6);
    ctx.restore();
  },
};
Chart.register(topLeftPricePlugin);

function positionAxisDragZones(chart) {
  const wrap = chart.canvas.parentElement;
  if (!wrap) return;
  const yZone = wrap.querySelector(".axis-drag-y");
  const xZone = wrap.querySelector(".axis-drag-x");
  const area = chart.chartArea;
  if (!area) return;
  // 드래그 영역은 wrap의 패딩 박스를 기준으로 절대 위치가 계산되므로,
  // 캔버스가 wrap 안에서 패딩만큼 밀려나 있으면(예: 팝업의 16px padding)
  // 캔버스 기준 좌표(chartArea)에 그 오프셋을 더해줘야 실제 캔들 위치와 정렬된다.
  const offsetX = chart.canvas.offsetLeft;
  const offsetY = chart.canvas.offsetTop;
  const w = chart.canvas.clientWidth;
  const h = chart.canvas.clientHeight;
  const buffer = 8; // 마지막 캔들/축 라벨과 드래그 영역이 겹치지 않도록 여백을 둔다
  if (yZone) {
    yZone.style.left = (offsetX + area.right + buffer) + "px";
    yZone.style.top = (offsetY + area.top) + "px";
    yZone.style.width = Math.max(0, w - area.right - buffer) + "px";
    yZone.style.height = Math.max(0, area.bottom - area.top) + "px";
  }
  if (xZone) {
    xZone.style.left = (offsetX + area.left) + "px";
    xZone.style.top = (offsetY + area.bottom + buffer) + "px";
    xZone.style.width = Math.max(0, area.right - area.left) + "px";
    xZone.style.height = Math.max(0, h - area.bottom - buffer) + "px";
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
    chart.pan({ x: dx, y: dy }, undefined, "none");
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
  if (interval === "year") {
    return `${d.getFullYear()}`;
  }
  if (interval === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return formatLocalDate(monday);
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

const DEFAULT_VISIBLE_CANDLES = 300;

function applyDefaultZoomWindow(chart) {
  if (!chart) return;
  const dsIndex = chart.data.datasets.findIndex(d => d.type === "candlestick");
  if (dsIndex === -1) return;
  const data = chart.data.datasets[dsIndex].data;
  if (data.length <= DEFAULT_VISIBLE_CANDLES) return; // 전체가 300개 이하면 그대로 다 보여준다
  const minX = data[data.length - DEFAULT_VISIBLE_CANDLES].x;
  const padDs = chart.data.datasets.find(d => d.label === "__pad");
  const maxX = (padDs && padDs.data.length) ? padDs.data[padDs.data.length - 1].x : data[data.length - 1].x;
  chart.zoomScale("x", { min: minX, max: maxX }, "none");
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
      popupChartInstance = new Chart(ctx, buildChartConfig(resampleChartData(lastChartData, currentInterval), { isPopup: true }));
      applyDefaultZoomWindow(popupChartInstance);
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
  const withYoy = (q.yoy_growth_pct === null || q.yoy_growth_pct === undefined) ? text : `${text} (${fmtPct(q.yoy_growth_pct)})`;
  // 영업이익률은 네이버(WiseReport) 소스가 있는 한국 종목에서만 채워진다.
  if (q.margin_pct === null || q.margin_pct === undefined) return withYoy;
  return `${withYoy}<br><span style="color:var(--muted);font-size:11px;">(영업이익률 ${q.margin_pct.toFixed(1)}%)</span>`;
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
  if (liveUpdateEnabled) {
    liveUpdateEnabled = false;
    document.getElementById("liveUpdateBtn").classList.remove("active");
    document.getElementById("popupLiveUpdateBtn").classList.remove("active");
    stopLiveUpdate();
  }
  renderChart(data.chart);
  renderVcp(data.vcp);
  renderRs(data);
  currentAnalyzed = { ticker: data.ticker, name: data.name, market: data.market };
  updateWatchlistToggleUI();
}

document.getElementById("resetZoomBtn").addEventListener("click", () => {
  if (priceChartInstance) {
    priceChartInstance.resetZoom();
    applyDefaultZoomWindow(priceChartInstance);
  }
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

function buildChartConfig(chart, opts) {
  const isPopup = !!(opts && opts.isPopup);
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

  // 차트 오른쪽 끝(가격 축)에 캔들 5개 정도의 여백을 준다.
  // "timeseries" 스케일은 실제 날짜 간격이 아니라 점의 순번 기준으로 픽셀을 균등 배분하므로,
  // 축의 max 값만 늘리면(실데이터 밖 구간은 보간되어) 원하는 만큼의 픽셀 여백이 생기지 않는다.
  // 대신 값이 없는(y: null) "가짜" 데이터 포인트 5개를 추가해 같은 간격으로 픽셀을 차지하게 한다.
  const PAD_CANDLES = 5;
  const futurePoints = [];
  if (points.length >= 2) {
    const sampleCount = Math.min(5, points.length - 1);
    const spacing = (points[points.length - 1] - points[points.length - 1 - sampleCount]) / sampleCount;
    const last = points[points.length - 1];
    for (let k = 1; k <= PAD_CANDLES; k++) futurePoints.push(last + spacing * k);
  }
  const padData = futurePoints.map(x => ({ x, y: null }));

  return {
    data: {
      datasets: [
        {
          // 참고: chartjs-chart-financial 라이브러리는 데이터셋의 "color" 속성을 읽지 않고
          // "backgroundColors"/"borderColors"(복수형)를 읽는다. up=상승(종가>시가),
          // down=하락(종가<시가) 매핑은 실제 렌더링 픽셀 색상으로 직접 검증했다(2026-02-10).
          type: "candlestick", label: "가격", data: candleData,
          backgroundColors: { up: "#ef4a5f", down: "#2fbf71", unchanged: "#9aa0b0" },
          borderColors: { up: "#ef4a5f", down: "#2fbf71", unchanged: "#9aa0b0" },
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
        {
          type: "line", label: "__pad", data: padData,
          borderWidth: 0, pointRadius: 0, showLine: false, spanGaps: false, order: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      events: ["mousemove", "mouseout", "click", "touchstart", "touchmove", "mousedown", "mouseup"],
      interaction: { mode: "index", intersect: false },
      hover: { mode: "index", intersect: false },
      // 팝업은 세로로 매우 길어져 날짜 축이 화면 아래쪽 끝까지 내려가므로,
      // 아래쪽에 여백을 둬 날짜 축을 위로 올리고 축 드래그 확대 영역도 넉넉하게 잡는다.
      layout: { padding: { bottom: isPopup ? 60 : 0 } },
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
        legend: { labels: { color: "#e6e8ef", filter: (item) => item.text !== "거래량" && item.text !== "__pad", font: { size: mobile ? 11 : 12 }, boxWidth: mobile ? 12 : 24 } },
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
          filter: (item) => item.dataset.type !== "bar" && item.dataset.label !== "__pad",
          callbacks: {
            label: (context) => {
              const raw = context.raw;
              const vol = volumeByX[raw.x];
              if (context.dataset.type === "candlestick") {
                const prevClose = context.dataIndex > 0 ? candleData[context.dataIndex - 1].c : null;
                const withChange = (label, value) => {
                  if (prevClose == null || prevClose === 0) return `${label} ${value.toLocaleString()}`;
                  const pct = (value / prevClose - 1) * 100;
                  const sign = pct >= 0 ? "+" : "";
                  return `${label} ${value.toLocaleString()} (${sign}${pct.toFixed(2)}%)`;
                };
                const parts = [
                  withChange("시가", raw.o),
                  withChange("고가", raw.h),
                  withChange("저가", raw.l),
                  withChange("종가", raw.c),
                ];
                if (vol != null) parts.push(`거래량 ${vol.toLocaleString()}`);
                return parts;
              }
              if (context.dataset.type === "bar") {
                return `거래량 ${raw.y.toLocaleString()}`;
              }
              return `${context.dataset.label} ${raw.y.toLocaleString()}`;
            },
            labelTextColor: (context) => {
              if (context.dataset.type === "candlestick") {
                const raw = context.raw;
                const prevClose = context.dataIndex > 0 ? candleData[context.dataIndex - 1].c : null;
                if (prevClose != null) return raw.c >= prevClose ? "#ef4a5f" : "#2fbf71";
              }
              return "#e6e8ef";
            },
          },
        },
      },
    },
  };
}

function renderChart(chart, opts) {
  const resetZoom = !opts || opts.resetZoom !== false;
  lastChartData = chart;
  const ctx = document.getElementById("priceChart").getContext("2d");
  if (priceChartInstance) priceChartInstance.destroy();
  priceChartInstance = new Chart(ctx, buildChartConfig(resampleChartData(chart, currentInterval)));
  if (resetZoom) applyDefaultZoomWindow(priceChartInstance);
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
  popupChartInstance = new Chart(ctx, buildChartConfig(resampleChartData(lastChartData, currentInterval), { isPopup: true }));
  applyDefaultZoomWindow(popupChartInstance);
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
  if (popupChartInstance) {
    popupChartInstance.resetZoom();
    applyDefaultZoomWindow(popupChartInstance);
  }
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

// ---- 실시간(지연 시세) 자동 갱신 ----
let liveUpdateEnabled = false;
let liveUpdateTimer = null;
const LIVE_UPDATE_INTERVAL_MS = 15000; // 서버 시세 캐시(app/data.py _QUOTE_CACHE_TTL)가 15초 단위라 이보다 짧게 폴링해도 더 새 데이터를 받지 못한다

function updateLastBarWithQuote(quote) {
  if (!lastChartData || !lastChartData.dates.length) return;
  const i = lastChartData.dates.length - 1;
  if (quote.high != null) lastChartData.high[i] = lastChartData.high[i] == null ? quote.high : Math.max(lastChartData.high[i], quote.high);
  if (quote.low != null) lastChartData.low[i] = lastChartData.low[i] == null ? quote.low : Math.min(lastChartData.low[i], quote.low);
  if (quote.price != null) lastChartData.close[i] = quote.price;
  if (quote.volume != null) lastChartData.volume[i] = quote.volume;
}

function setLiveUpdateStatus(text) {
  document.getElementById("liveUpdateStatus").textContent = text;
  document.getElementById("popupLiveUpdateStatus").textContent = text;
}

async function pollQuote() {
  if (!currentAnalyzed) return;
  const tickerAtStart = currentAnalyzed.ticker;
  try {
    const res = await fetch(`${API_BASE}/api/quote?ticker=${encodeURIComponent(tickerAtStart)}`);
    const q = await res.json();
    if (!currentAnalyzed || currentAnalyzed.ticker !== tickerAtStart) return; // 폴링 중 종목이 바뀐 경우 무시
    if (!res.ok) throw new Error(q.error || "실시간 시세 조회 실패");

    document.getElementById("resPrice").textContent = q.price.toLocaleString();
    updateLastBarWithQuote(q);

    if (priceChartInstance) {
      const savedX = { min: priceChartInstance.scales.x.min, max: priceChartInstance.scales.x.max };
      const savedY = { min: priceChartInstance.scales.y.min, max: priceChartInstance.scales.y.max };
      renderChart(lastChartData, { resetZoom: false });
      priceChartInstance.zoomScale("x", savedX, "none");
      priceChartInstance.zoomScale("y", savedY, "none");
    }

    if (popupChartInstance) {
      const savedX = { min: popupChartInstance.scales.x.min, max: popupChartInstance.scales.x.max };
      const savedY = { min: popupChartInstance.scales.y.min, max: popupChartInstance.scales.y.max };
      const ctx = document.getElementById("popupChart").getContext("2d");
      popupChartInstance.destroy();
      popupChartInstance = new Chart(ctx, buildChartConfig(resampleChartData(lastChartData, currentInterval), { isPopup: true }));
      popupChartInstance.zoomScale("x", savedX, "none");
      popupChartInstance.zoomScale("y", savedY, "none");
    }

    setLiveUpdateStatus(`마지막 갱신 ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    setLiveUpdateStatus("갱신 오류: " + err.message);
  }
}

function startLiveUpdate() {
  pollQuote();
  liveUpdateTimer = setInterval(pollQuote, LIVE_UPDATE_INTERVAL_MS);
}

function stopLiveUpdate() {
  if (liveUpdateTimer) clearInterval(liveUpdateTimer);
  liveUpdateTimer = null;
  setLiveUpdateStatus("");
}

function toggleLiveUpdate() {
  liveUpdateEnabled = !liveUpdateEnabled;
  document.getElementById("liveUpdateBtn").classList.toggle("active", liveUpdateEnabled);
  document.getElementById("popupLiveUpdateBtn").classList.toggle("active", liveUpdateEnabled);
  if (liveUpdateEnabled) startLiveUpdate(); else stopLiveUpdate();
}

document.getElementById("liveUpdateBtn").addEventListener("click", toggleLiveUpdate);
document.getElementById("popupLiveUpdateBtn").addEventListener("click", toggleLiveUpdate);

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
