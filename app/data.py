"""야후 파이낸스를 통한 시세/재무 데이터 조회 계층."""
import datetime
import io
import re
import threading
import time

import pandas as pd
import requests
import yfinance as yf

from . import kr_listing
from .kr_names import KR_NAMES

_CACHE_LOCK = threading.Lock()
_HISTORY_CACHE = {}  # ticker -> (timestamp, df)
_KR_NAME_CACHE = {}  # code6 -> name
_CACHE_TTL = 60 * 15  # 15분

_QUOTE_CACHE = {}  # ticker -> (timestamp, quote_dict)
_QUOTE_CACHE_TTL = 15  # 초. 여러 클라이언트가 동시에 폴링해도 야후에 과도한 요청을 보내지 않도록 함


def normalize_ticker(raw: str):
    """사용자 입력을 (야후 티커, 시장코드) 로 정규화한다.

    - 한글이 포함되어 있으면 한국 종목명으로 간주하고 KRX 종목 데이터베이스에서 코드를 검색한다.
    - 순수 6자리 숫자면 한국 종목으로 간주하고 .KS 를 우선 시도, 실패 시 .KQ 로 재시도한다.
    - 이미 .KS/.KQ 접미사가 있으면 그대로 사용한다.
    - 그 외(영문 등)는 미국(또는 기타 해외) 티커로 간주한다.
    """
    original = raw.strip()
    if not original:
        raise ValueError("티커를 입력해주세요.")

    if kr_listing.contains_hangul(original):
        resolved = kr_listing.resolve_by_name(original)
        if not resolved:
            raise ValueError(f"'{original}' 종목명을 찾을 수 없습니다. 티커나 정확한 종목명을 입력해주세요.")
        ticker, _code, _market = resolved
        return ticker, "KR"

    raw = original.upper()

    if re.fullmatch(r"\d{6}", raw):
        return raw, "KR_AMBIGUOUS"  # 시장(KS/KQ) 판별은 fetch_history 에서 시도

    if raw.endswith(".KS") or raw.endswith(".KQ"):
        return raw, "KR"

    return raw, "US"


def _download_history(ticker: str, period: str = "2y"):
    t = yf.Ticker(ticker)
    df = t.history(period=period, interval="1d", auto_adjust=False)
    if df is None or df.empty:
        return None
    df = df.dropna(subset=["Close"])
    return df


def fetch_history(raw_ticker: str, period: str = "12y"):
    """단일 종목 히스토리 조회. 반환: (ticker_used, market, df)"""
    ticker, market = normalize_ticker(raw_ticker)

    candidates = []
    if market == "KR_AMBIGUOUS":
        candidates = [(ticker + ".KS", "KR"), (ticker + ".KQ", "KR")]
    else:
        candidates = [(ticker, market)]

    last_err = None
    for cand_ticker, cand_market in candidates:
        # fetch_bulk_history(스크리닝, 기간이 짧음)와 캐시를 공유하면 어느 쪽이 먼저
        # 채우느냐에 따라 차트에 필요한 긴 기간 데이터가 짧은 데이터로 덮일 수 있으므로
        # 캐시 키에 기간을 포함해 서로 다른 기간 요청이 캐시를 공유하지 않게 한다.
        cache_key = f"{cand_ticker}|{period}"
        with _CACHE_LOCK:
            cached = _HISTORY_CACHE.get(cache_key)
            if cached and time.time() - cached[0] < _CACHE_TTL:
                return cand_ticker, cand_market, cached[1]
        try:
            df = _download_history(cand_ticker, period)
        except Exception as e:  # noqa: BLE001
            last_err = e
            df = None
        if df is not None and len(df) > 30:
            with _CACHE_LOCK:
                _HISTORY_CACHE[cache_key] = (time.time(), df)
            return cand_ticker, cand_market, df

    if last_err:
        raise ValueError(f"'{raw_ticker}' 데이터를 가져올 수 없습니다: {last_err}")
    raise ValueError(f"'{raw_ticker}' 종목을 찾을 수 없습니다. 티커를 확인해주세요.")


def fetch_bulk_history(tickers, period: str = "16mo"):
    """스크리닝용 대량 다운로드. 반환: {ticker: df}"""
    result = {}
    to_fetch = []
    now = time.time()
    with _CACHE_LOCK:
        for t in tickers:
            cached = _HISTORY_CACHE.get(f"{t}|{period}")
            if cached and now - cached[0] < _CACHE_TTL:
                result[t] = cached[1]
            else:
                to_fetch.append(t)

    if to_fetch:
        try:
            data = yf.download(
                to_fetch,
                period=period,
                interval="1d",
                group_by="ticker",
                threads=True,
                auto_adjust=False,
                progress=False,
            )
        except Exception:
            data = None

        if data is not None:
            for t in to_fetch:
                try:
                    if len(to_fetch) == 1:
                        df = data
                    else:
                        df = data[t]
                    df = df.dropna(subset=["Close"])
                    if len(df) > 30:
                        result[t] = df
                        with _CACHE_LOCK:
                            _HISTORY_CACHE[f"{t}|{period}"] = (now, df)
                except Exception:
                    continue

    return result


_US_EXCHANGE_LABELS = {
    "NMS": "나스닥", "NGM": "나스닥", "NCM": "나스닥",
    "NYQ": "뉴욕증권거래소(NYSE)", "ASE": "NYSE American", "PCX": "NYSE Arca",
}


def exchange_label(ticker: str, info: dict):
    if ticker.endswith(".KS"):
        return "코스피"
    if ticker.endswith(".KQ"):
        return "코스닥"
    code = (info or {}).get("exchange")
    if code in _US_EXCHANGE_LABELS:
        return _US_EXCHANGE_LABELS[code]
    return (info or {}).get("fullExchangeName") or "해외"


def fetch_korean_name(code6: str):
    """네이버 금융에서 한글 종목명을 조회한다(유니버스 정적 매핑에 없는 종목용)."""
    if code6 in _KR_NAME_CACHE:
        return _KR_NAME_CACHE[code6]
    name = None
    try:
        r = requests.get(
            f"https://finance.naver.com/item/main.naver?code={code6}",
            timeout=4, headers={"User-Agent": "Mozilla/5.0"},
        )
        m = re.search(r"<title>(.*?)</title>", r.text)
        if m:
            candidate = m.group(1).split(" : ")[0].strip()
            if candidate and "증권" not in candidate:
                name = candidate
    except Exception:
        pass
    _KR_NAME_CACHE[code6] = name
    return name


def korean_display_name(ticker: str):
    code6 = ticker.split(".")[0]
    return kr_listing.code_to_name(code6) or KR_NAMES.get(code6) or fetch_korean_name(code6)


def _quarter_label(year: int, month: int) -> str:
    q = (month - 1) // 3 + 1
    return f"{year % 100}.{q}Q"


def _offset_quarter_label(base: datetime.date, offset: int) -> str:
    """base 날짜가 속한 분기로부터 offset 분기만큼 이동한 '년도.분기' 라벨."""
    zero_month = (base.month - 1) + offset * 3
    year = base.year + zero_month // 12
    month = zero_month % 12 + 1
    return _quarter_label(year, month)


def _period_quarter_label(period_end: datetime.date) -> str:
    return _quarter_label(period_end.year, period_end.month)


_EPS_OUTLOOK_OFFSETS = [(0, "0q"), (1, "+1q"), (2, "+2q"), (3, "+3q"), (4, "+4q")]


def fetch_eps_outlook(ticker: str):
    """현재분기~+4분기 EPS 컨센서스 추정치(전년동기 대비 증감률 포함).

    라벨은 항상 실제 '년도.분기'로 채워지며, 야후가 데이터를 제공하지 않는
    구간(보통 0q, +1q 이후)은 eps/yoy_growth_pct 가 None 으로 채워진다.
    """
    today = datetime.date.today()
    est = None
    try:
        t = yf.Ticker(ticker)
        est = t.earnings_estimate
    except Exception:
        est = None

    out = []
    for offset, row_key in _EPS_OUTLOOK_OFFSETS:
        eps_val = None
        yoy = None
        has_data = False
        if est is not None and row_key in getattr(est, "index", []):
            row = est.loc[row_key]
            avg = row.get("avg")
            year_ago = row.get("yearAgoEps")
            growth = row.get("growth")
            if avg is not None and avg == avg:
                eps_val = round(float(avg), 2)
                has_data = True
                if growth is not None and growth == growth:
                    yoy = round(float(growth) * 100, 1)
                elif year_ago and year_ago == year_ago and year_ago > 0:
                    yoy = round((float(avg) / float(year_ago) - 1) * 100, 1)
        out.append({
            "label": _offset_quarter_label(today, offset),
            "eps": eps_val,
            "yoy_growth_pct": yoy,
            "estimate": True,
            "has_data": has_data,
        })
    return out


_NAVER_FINSUM_TOKEN_CACHE = {}  # code6 -> (timestamp, encparam, id)
_NAVER_FINSUM_TOKEN_TTL = 60 * 60 * 6  # encparam/id는 종목코드에 종속되어 거의 바뀌지 않는다


def _fetch_naver_finsum_tokens(code6: str):
    """네이버 금융(WiseReport) Financial Summary AJAX 호출에 필요한 encparam/id 토큰을
    기업현황 페이지의 임베디드 스크립트에서 추출한다(종목코드별로 고정값)."""
    with _CACHE_LOCK:
        cached = _NAVER_FINSUM_TOKEN_CACHE.get(code6)
        if cached and time.time() - cached[0] < _NAVER_FINSUM_TOKEN_TTL:
            return cached[1], cached[2]
    r = requests.get(
        f"https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd={code6}&target=finsum_more",
        timeout=6, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/"},
    )
    r.encoding = "utf-8"
    text = r.text
    m_enc = re.search(r"encparam:\s*'([^']+)'", text)
    m_id = re.search(r"id:\s*'([^']+)'\s*\?", text)
    if not m_enc or not m_id:
        return None, None
    encparam, id_ = m_enc.group(1), m_id.group(1)
    with _CACHE_LOCK:
        _NAVER_FINSUM_TOKEN_CACHE[code6] = (time.time(), encparam, id_)
    return encparam, id_


def fetch_kr_operating_income_quarters(code6: str, limit: int = 4):
    """네이버 금융(종목분석>기업현황) Financial Summary 표에서 현재 분기와 향후 분기의
    컨센서스(예상) 영업이익/영업이익률을 가져온다(단위: 억원 -> 원 환산).

    투자 판단에는 이미 지나간 실적보다 앞으로의 실적이 중요하므로 과거 발표된 분기는
    제외하고, 아직 발표되지 않은(컨센서스 추정치, "(E)" 표시) 분기만 반환한다. 단
    전년동기 대비 증감률 계산에는 과거 실제 분기 값을 사용한다.
    """
    out = []
    try:
        encparam, id_ = _fetch_naver_finsum_tokens(code6)
        if not encparam or not id_:
            return out
        r = requests.get(
            "https://navercomp.wisereport.co.kr/v2/company/ajax/cF1001.aspx",
            params={"cmp_cd": code6, "fin_typ": 0, "freq_typ": "Q", "encparam": encparam, "id": id_},
            timeout=6, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://navercomp.wisereport.co.kr/"},
        )
        r.encoding = "utf-8"
        tables = pd.read_html(io.StringIO(r.text))
        target = None
        for t in tables:
            if t.shape[1] < 2:
                continue
            try:
                first_col = t.iloc[:, 0].astype(str)
            except Exception:
                continue
            if (first_col == "영업이익").any():
                target = t
                break
        if target is None:
            return out
        target = target.set_index(target.columns[0])
        # "영업이익" 행은 아직 발표되지 않은 분기(컨센서스)에 대해 값이 비어 있고,
        # "영업이익(발표기준)" 행만 향후 분기의 컨센서스 추정치까지 채워져 있다.
        if "영업이익(발표기준)" not in target.index:
            return out
        oi_row = target.loc["영업이익(발표기준)"]
        margin_row = target.loc["영업이익률"] if "영업이익률" in target.index else None

        entries = []
        for col in target.columns:
            if not isinstance(col, tuple) or "분기" not in str(col[0]):
                continue
            period = str(col[1])
            is_estimate = "(E)" in period
            period_clean = period.split("(IFRS")[0].replace("(E)", "").strip()
            val = oi_row.get(col)
            if val is None or (isinstance(val, float) and val != val):
                continue
            try:
                year_s, month_s = period_clean.split("/")
                label = _quarter_label(int(year_s), int(month_s))
            except Exception:
                continue
            margin = None
            if margin_row is not None:
                mval = margin_row.get(col)
                if mval is not None and not (isinstance(mval, float) and mval != mval):
                    margin = float(mval)
            entries.append({"label": label, "value_eok": float(val), "is_estimate": is_estimate, "margin_pct": margin})

        # entries는 표 순서 그대로(과거->현재->미래) 정렬되어 있다. 전년동기 대비 증감률은
        # 같은 분기의 1년 전(4분기 전, 실제 발표치) 값과 비교해 계산한 뒤, 출력은 아직
        # 발표되지 않은(컨센서스) 분기만 현재->미래 순으로 남긴다.
        for i, e in enumerate(entries):
            if not e["is_estimate"]:
                continue
            yoy = None
            if i - 4 >= 0:
                prev = entries[i - 4]["value_eok"]
                if prev and prev > 0:
                    yoy = round((e["value_eok"] / prev - 1) * 100, 1)
            out.append({
                "label": e["label"],
                "value": e["value_eok"] * 1e8,
                "yoy_growth_pct": yoy,
                "margin_pct": e["margin_pct"],
            })
        out = out[:limit]
    except Exception:
        pass
    return out


def fetch_operating_income_quarters(ticker: str, limit: int = 4):
    """분기별 실제 영업이익(전년동기 대비 증감률 포함, 가능한 경우). 최근 분기부터 내림차순.

    한국 종목은 네이버 금융의 기업실적분석 데이터를, 그 외는 야후 파이낸스 데이터를 사용한다.
    """
    if ticker.endswith(".KS") or ticker.endswith(".KQ"):
        code6 = ticker.split(".")[0]
        return fetch_kr_operating_income_quarters(code6, limit)

    out = []
    try:
        t = yf.Ticker(ticker)
        qi = t.quarterly_income_stmt
        if qi is None or "Operating Income" not in qi.index:
            return out
        row = qi.loc["Operating Income"].dropna().sort_index(ascending=False)
        items = [(idx, float(v)) for idx, v in row.items()]
        for i in range(min(limit, len(items))):
            date_i, val_i = items[i]
            yoy = None
            if i + 4 < len(items):
                _, val_prev = items[i + 4]
                if val_prev and val_prev > 0:
                    yoy = round((val_i / val_prev - 1) * 100, 1)
            out.append({
                "label": _period_quarter_label(date_i.date()),
                "value": val_i,
                "yoy_growth_pct": yoy,
            })
    except Exception:
        pass
    return out


def fetch_fundamentals(ticker: str):
    """분기 매출/이익 성장, EPS(전년동기 대비 성장률 포함), 시가총액 등 스니펫."""
    out = {
        "revenue_growth_yoy": None,
        "earnings_growth_yoy": None,
        "quarterly_revenue": [],
        "eps_outlook": [],
        "operating_income_quarters": [],
        "market_cap": None,
        "currency": None,
        "exchange_label": None,
    }
    info = {}
    t = yf.Ticker(ticker)
    try:
        info = t.get_info() if hasattr(t, "get_info") else t.info
        out["revenue_growth_yoy"] = info.get("revenueGrowth")
        out["earnings_growth_yoy"] = info.get("earningsGrowth")
        out["profit_margins"] = info.get("profitMargins")
        out["return_on_equity"] = info.get("returnOnEquity")
        out["short_name"] = info.get("shortName") or info.get("longName")
        out["sector"] = info.get("sector")
        out["industry"] = info.get("industry")
        out["market_cap"] = info.get("marketCap")
        out["currency"] = info.get("currency")
    except Exception:
        pass

    out["exchange_label"] = exchange_label(ticker, info)

    if ticker.endswith(".KS") or ticker.endswith(".KQ"):
        kr_name = korean_display_name(ticker)
        if kr_name:
            out["short_name"] = kr_name

    try:
        qf = t.quarterly_financials
        if qf is not None and "Total Revenue" in qf.index:
            rev = qf.loc["Total Revenue"].dropna()
            out["quarterly_revenue"] = [
                {"period": str(c.date()), "value": float(v)} for c, v in rev.items()
            ][:4]
    except Exception:
        pass

    out["eps_outlook"] = fetch_eps_outlook(ticker)
    out["operating_income_quarters"] = fetch_operating_income_quarters(ticker)

    return out


def fetch_quote(ticker: str):
    """실시간(지연 시세) 자동 갱신용 경량 조회. 전체 히스토리를 다시 받지 않고 현재가/당일 고저/거래량만 가져온다."""
    now = time.time()
    with _CACHE_LOCK:
        cached = _QUOTE_CACHE.get(ticker)
        if cached and now - cached[0] < _QUOTE_CACHE_TTL:
            return cached[1]

    fi = dict(yf.Ticker(ticker).fast_info)
    result = {
        "ticker": ticker,
        "price": fi.get("lastPrice"),
        "open": fi.get("open"),
        "high": fi.get("dayHigh"),
        "low": fi.get("dayLow"),
        "previous_close": fi.get("previousClose") or fi.get("regularMarketPreviousClose"),
        "volume": fi.get("lastVolume"),
        "currency": fi.get("currency"),
        "server_time": now,
    }
    if result["price"] is None:
        raise ValueError(f"'{ticker}' 현재가를 가져올 수 없습니다.")

    with _CACHE_LOCK:
        _QUOTE_CACHE[ticker] = (now, result)
    return result
