"""유니버스 스크리닝 및 RS Rating 유니버스 캐시."""
import threading
import time

from . import data
from .analysis import add_moving_averages, trend_template_checks, weighted_rs_score, percentile_rank
from .universe import US_UNIVERSE, KR_UNIVERSE

_LOCK = threading.Lock()
_UNIVERSE_SCORES = {"US": [], "KR": []}  # market -> [rs_score, ...]
_SCAN_CACHE = {}  # market -> (timestamp, [candidates])
_SCAN_TTL = 60 * 20


def get_universe_scores(market: str):
    with _LOCK:
        return list(_UNIVERSE_SCORES.get(market, []))


def _set_universe_scores(market: str, scores):
    with _LOCK:
        _UNIVERSE_SCORES[market] = scores


def _universe_for(market: str):
    if market == "US":
        return US_UNIVERSE
    if market == "KR":
        return KR_UNIVERSE
    raise ValueError("market must be US or KR")


def scan_market(market: str, force: bool = False):
    now = time.time()
    if not force:
        with _LOCK:
            cached = _SCAN_CACHE.get(market)
        if cached and now - cached[0] < _SCAN_TTL:
            return cached[1]

    tickers = _universe_for(market)
    hist = data.fetch_bulk_history(tickers, period="16mo")

    scored = []
    all_scores = []
    for t in tickers:
        df = hist.get(t)
        if df is None or len(df) < 60:
            continue
        df = add_moving_averages(df)
        score, perf = weighted_rs_score(df)
        all_scores.append(score)
        scored.append((t, df, score, perf))

    _set_universe_scores(market, all_scores)

    candidates = []
    for t, df, score, perf in scored:
        rs_rating = percentile_rank(score, all_scores)
        checks, all_pass = trend_template_checks(df, rs_rating)
        if all_pass:
            last = df.iloc[-1]
            fundamentals = data.fetch_fundamentals(t)
            candidates.append({
                "ticker": t,
                "name": fundamentals.get("short_name") or t,
                "exchange_label": fundamentals.get("exchange_label"),
                "market_cap": fundamentals.get("market_cap"),
                "currency": fundamentals.get("currency"),
                "eps_outlook": fundamentals.get("eps_outlook") or [],
                "operating_income_quarters": fundamentals.get("operating_income_quarters") or [],
                "close": round(float(last["Close"]), 2),
                "rs_rating": rs_rating,
            })

    candidates.sort(key=lambda c: (c["rs_rating"] or 0), reverse=True)

    with _LOCK:
        _SCAN_CACHE[market] = (now, candidates)

    return candidates
