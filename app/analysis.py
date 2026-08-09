"""마크 미너비니 SEPA 방법론: 트렌드 템플릿 / RS Rating / VCP 휴리스틱 분석."""
import numpy as np
import pandas as pd


def add_moving_averages(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["SMA50"] = out["Close"].rolling(50).mean()
    out["SMA150"] = out["Close"].rolling(150).mean()
    out["SMA200"] = out["Close"].rolling(200).mean()
    out["VOL_AVG50"] = out["Volume"].rolling(50).mean()
    return out


def weighted_rs_score(df: pd.DataFrame):
    """IBD 스타일 가중 상대강도 점수: 2*3개월 + 6개월 + 9개월 + 12개월 수익률."""
    closes = df["Close"]
    n = len(closes)

    def pct(days):
        if n <= days:
            return None
        base = closes.iloc[-1 - days]
        if base == 0 or pd.isna(base):
            return None
        return float((closes.iloc[-1] / base - 1) * 100)

    p3, p6, p9, p12 = pct(63), pct(126), pct(189), pct(252)
    perf = {"p3m": p3, "p6m": p6, "p9m": p9, "p12m": p12}

    parts, weights = [], []
    for p, w in [(p3, 2), (p6, 1), (p9, 1), (p12, 1)]:
        if p is not None:
            parts.append(p * w)
            weights.append(w)
    score = sum(parts) if parts else None
    return score, perf


def percentile_rank(score, universe_scores):
    if score is None or not universe_scores:
        return None
    arr = np.array([s for s in universe_scores if s is not None])
    if len(arr) == 0:
        return None
    pct = float((arr <= score).sum()) / len(arr) * 100
    return round(pct, 1)


def trend_template_checks(df: pd.DataFrame, rs_rating):
    """8대 트렌드 템플릿 조건을 평가한다. 각 조건: id, label, passed, detail."""
    checks = []
    if len(df) < 60:
        return checks, False

    last = df.iloc[-1]
    close = last["Close"]
    sma50 = last.get("SMA50")
    sma150 = last.get("SMA150")
    sma200 = last.get("SMA200")

    has150 = pd.notna(sma150)
    has200 = pd.notna(sma200)
    has50 = pd.notna(sma50)

    # 조건 1
    c1 = bool(has150 and has200 and close > sma150 and close > sma200)
    checks.append({
        "id": 1, "label": "현재가 > 150일선 & 200일선", "passed": c1,
        "detail": f"현재가 {close:,.2f} / 150일선 {sma150:,.2f} / 200일선 {sma200:,.2f}" if has150 and has200 else "데이터 부족(200일선 계산 불가)",
    })

    # 조건 2
    c2 = bool(has150 and has200 and sma150 > sma200)
    checks.append({
        "id": 2, "label": "150일선 > 200일선", "passed": c2,
        "detail": f"150일선 {sma150:,.2f} / 200일선 {sma200:,.2f}" if has150 and has200 else "데이터 부족",
    })

    # 조건 3: 200일선이 최소 1개월(약 21거래일) 이상 상승, 이상적으로는 4~5개월(약 84~105거래일)
    c3 = False
    c3_detail = "데이터 부족(200일선 산출을 위한 데이터 필요)"
    if has200 and len(df) >= 221:
        sma200_series = df["SMA200"].dropna()
        if len(sma200_series) >= 22:
            up_1m = sma200_series.iloc[-1] > sma200_series.iloc[-22]
            ideal = len(sma200_series) >= 90 and sma200_series.iloc[-1] > sma200_series.iloc[-90]
            c3 = bool(up_1m)
            c3_detail = ("200일선 상승 추세 " + ("(4개월 이상, 이상적)" if ideal else "(최근 1개월 기준)")) if c3 else "200일선이 최근 1개월간 하락 또는 횡보"
    checks.append({"id": 3, "label": "200일선이 최소 1개월 이상 상승 추세", "passed": c3, "detail": c3_detail})

    # 조건 4
    c4 = bool(has50 and has150 and has200 and sma50 > sma150 and sma50 > sma200)
    checks.append({
        "id": 4, "label": "50일선 > 150일선 & 200일선", "passed": c4,
        "detail": f"50일선 {sma50:,.2f}" if has50 else "데이터 부족",
    })

    # 조건 5
    c5 = bool(has50 and close > sma50)
    checks.append({"id": 5, "label": "현재가 > 50일선", "passed": c5, "detail": f"현재가 {close:,.2f} / 50일선 {sma50:,.2f}" if has50 else "데이터 부족"})

    # 조건 6, 7: 52주 최저/최고 대비 위치
    lookback = df.tail(252)
    low52 = float(lookback["Low"].min())
    high52 = float(lookback["High"].max())
    above_low_pct = (close / low52 - 1) * 100 if low52 > 0 else None
    below_high_pct = (1 - close / high52) * 100 if high52 > 0 else None

    c6 = bool(above_low_pct is not None and above_low_pct >= 25)
    checks.append({
        "id": 6, "label": "52주 최저가 대비 25~30% 이상 상승", "passed": c6,
        "detail": f"52주 최저 {low52:,.2f} 대비 +{above_low_pct:.1f}%" if above_low_pct is not None else "데이터 부족",
    })

    c7 = bool(below_high_pct is not None and below_high_pct <= 25)
    checks.append({
        "id": 7, "label": "52주 최고가 대비 25% 이내", "passed": c7,
        "detail": f"52주 최고 {high52:,.2f} 대비 -{below_high_pct:.1f}%" if below_high_pct is not None else "데이터 부족",
    })

    # 조건 8: RS Rating >= 70
    c8 = bool(rs_rating is not None and rs_rating >= 70)
    checks.append({
        "id": 8, "label": "RS Rating 70 이상 (이상적 80~90대)", "passed": c8,
        "detail": f"RS Rating {rs_rating:.0f}" if rs_rating is not None else "동일 시장 유니버스 데이터 부족으로 산출 불가(먼저 '종목 발굴' 스캔을 1회 실행하면 정확도가 올라갑니다)",
    })

    all_pass = all(c["passed"] for c in checks)
    return checks, all_pass


def _find_pivots(series: pd.Series, window: int = 5):
    """롤링 윈도우 프랙탈 방식으로 스윙 고점/저점 인덱스를 찾는다."""
    highs, lows = [], []
    vals = series.values
    n = len(vals)
    for i in range(window, n - window):
        seg = vals[i - window:i + window + 1]
        if vals[i] == seg.max():
            highs.append(i)
        if vals[i] == seg.min():
            lows.append(i)
    return highs, lows


def vcp_analysis(df: pd.DataFrame):
    """변동성 수축 패턴(VCP) 휴리스틱 탐지. 결과는 참고용 추정치."""
    recent = df.tail(160).reset_index(drop=True)
    if len(recent) < 40:
        return {"status": "데이터 부족", "contractions": [], "pivot": None, "note": "분석에 충분한 거래일 데이터가 없습니다."}

    high_idx, low_idx = _find_pivots(recent["High"], window=5)
    low_idx2, _ = _find_pivots(recent["Low"], window=5)
    low_idx = sorted(set(low_idx2))
    high_idx = sorted(set(high_idx))

    if not high_idx or not low_idx:
        return {"status": "패턴 미형성", "contractions": [], "pivot": None, "note": "뚜렷한 스윙 고점/저점을 찾지 못했습니다."}

    # 최근 구간에서 가장 높은 스윙 고점을 VCP 기산점으로 사용
    peak_i = max(high_idx, key=lambda i: recent["High"].iloc[i])
    peak_val = float(recent["High"].iloc[peak_i])

    # 기산점 이후의 고점/저점만 사용해 수축 구간(레그) 구성
    seq = sorted([(i, "H", float(recent["High"].iloc[i])) for i in high_idx if i >= peak_i] +
                 [(i, "L", float(recent["Low"].iloc[i])) for i in low_idx if i >= peak_i])
    seq.sort(key=lambda x: x[0])

    contractions = []
    cur_high = None
    for i, typ, val in seq:
        if typ == "H":
            if cur_high is None or val >= cur_high[1]:
                cur_high = (i, val)
        elif typ == "L" and cur_high is not None:
            depth = (cur_high[1] - val) / cur_high[1] * 100 if cur_high[1] else 0
            vol_slice = recent["Volume"].iloc[cur_high[0]:i + 1]
            contractions.append({
                "high_idx": cur_high[0], "high": round(cur_high[1], 2),
                "low_idx": i, "low": round(val, 2),
                "depth_pct": round(depth, 1),
                "avg_volume": float(vol_slice.mean()) if len(vol_slice) else None,
            })
            cur_high = None

    # 수축폭이 점진적으로 줄어드는지 확인(약간의 여유 허용)
    depths = [c["depth_pct"] for c in contractions]
    contracting = all(depths[i] <= depths[i - 1] * 1.1 for i in range(1, len(depths))) if len(depths) >= 2 else False

    vols = [c["avg_volume"] for c in contractions if c["avg_volume"] is not None]
    vol_declining = all(vols[i] <= vols[i - 1] * 1.15 for i in range(1, len(vols))) if len(vols) >= 2 else False

    pivot = None
    breakout = False
    vol_ratio = None
    if contractions:
        last_leg = contractions[-1]
        pivot = last_leg["high"]
        last_close = float(recent["Close"].iloc[-1])
        last_vol = float(recent["Volume"].iloc[-1])
        avg_vol50 = float(df["Volume"].tail(50).mean())
        vol_ratio = round(last_vol / avg_vol50, 2) if avg_vol50 else None
        breakout = bool(last_close > pivot and vol_ratio is not None and vol_ratio >= 1.4)

    last_close = float(recent["Close"].iloc[-1])
    if pivot is None:
        status = "패턴 미형성"
    elif breakout:
        status = "피벗 돌파 발생"
    elif last_close >= pivot * 0.97:
        status = "피벗 근접(돌파 임박)"
    elif len(depths) >= 2 and contracting:
        status = "VCP 형성 중(변동성 수축)"
    else:
        status = "수축 패턴 불명확"

    return {
        "status": status,
        "contraction_count": len(contractions),
        "contractions": contractions[-6:],
        "contracting_pattern": contracting,
        "volume_declining": vol_declining,
        "pivot": round(pivot, 2) if pivot else None,
        "last_close": round(last_close, 2),
        "volume_ratio_vs_avg50": vol_ratio,
        "breakout": breakout,
        "peak_reference": round(peak_val, 2),
    }
