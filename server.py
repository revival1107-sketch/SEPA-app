"""Flask 백엔드: 미너비니 SEPA 종목 분석/발굴 API."""
import os
import sys

from flask import Flask, jsonify, request, send_from_directory

from app import data, screener
from app.analysis import add_moving_averages, trend_template_checks, weighted_rs_score, percentile_rank, vcp_analysis

BASE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/api/analyze")
def analyze():
    raw_ticker = request.args.get("ticker", "")
    if not raw_ticker:
        return jsonify({"error": "ticker 파라미터가 필요합니다."}), 400

    try:
        ticker, market, df = data.fetch_history(raw_ticker)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": f"데이터 조회 중 오류: {e}"}), 500

    df = add_moving_averages(df)
    score, perf = weighted_rs_score(df)

    universe_scores = screener.get_universe_scores(market)
    if not universe_scores:
        try:
            screener.scan_market(market)
            universe_scores = screener.get_universe_scores(market)
        except Exception:
            universe_scores = []

    rs_rating = percentile_rank(score, universe_scores)
    checks, all_pass = trend_template_checks(df, rs_rating)
    vcp = vcp_analysis(df)
    fundamentals = data.fetch_fundamentals(ticker)

    tail = df.tail(280).reset_index()
    date_col = tail.columns[0]
    chart = {
        "dates": [d.strftime("%Y-%m-%d") for d in tail[date_col]],
        "open": [round(float(v), 2) if v == v else None for v in tail["Open"]],
        "high": [round(float(v), 2) if v == v else None for v in tail["High"]],
        "low": [round(float(v), 2) if v == v else None for v in tail["Low"]],
        "close": [round(float(v), 2) if not (v != v) else None for v in tail["Close"]],
        "sma50": [round(float(v), 2) if v == v else None for v in tail["SMA50"]],
        "sma150": [round(float(v), 2) if v == v else None for v in tail["SMA150"]],
        "sma200": [round(float(v), 2) if v == v else None for v in tail["SMA200"]],
        "volume": [int(v) for v in tail["Volume"]],
    }

    last = df.iloc[-1]
    result = {
        "ticker": ticker,
        "market": market,
        "name": fundamentals.get("short_name") or ticker,
        "sector": fundamentals.get("sector"),
        "industry": fundamentals.get("industry"),
        "close": round(float(last["Close"]), 2),
        "trend_template": {"checks": checks, "all_pass": all_pass, "passed_count": sum(c["passed"] for c in checks)},
        "rs_rating": rs_rating,
        "performance": perf,
        "vcp": vcp,
        "fundamentals": fundamentals,
        "chart": chart,
    }
    return jsonify(result)


@app.get("/api/screen")
def screen():
    market = request.args.get("market", "US").upper()
    force = request.args.get("refresh", "false").lower() == "true"

    if market == "ALL":
        try:
            us = screener.scan_market("US", force=force)
            kr = screener.scan_market("KR", force=force)
        except Exception as e:  # noqa: BLE001
            return jsonify({"error": str(e)}), 500
        return jsonify({"US": us, "KR": kr})

    if market not in ("US", "KR"):
        return jsonify({"error": "market은 US, KR, ALL 중 하나여야 합니다."}), 400

    try:
        candidates = screener.scan_market(market, force=force)
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500

    return jsonify({market: candidates})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5678, debug=False, use_reloader=False)
