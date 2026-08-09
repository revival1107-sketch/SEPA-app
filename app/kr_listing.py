"""KRX(코스피·코스닥) 전체 종목 코드/한글명 데이터베이스.

app/kr_listing.json 은 KRX 상장법인목록(kind.krx.co.kr)에서 내려받은 스냅샷으로,
종목코드 <-> 한글 종목명 검색 및 표시에 사용한다. 신규 상장 종목 등 스냅샷에 없는
경우는 data.py의 네이버 금융 조회로 보완한다.
"""
import json
import os
import re
import sys

if getattr(sys, "_MEIPASS", None):
    _JSON_PATH = os.path.join(sys._MEIPASS, "app", "kr_listing.json")
else:
    _JSON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kr_listing.json")

_RECORDS = []
_NAME_TO_RECORD = {}
_CODE_TO_RECORD = {}

try:
    with open(_JSON_PATH, "r", encoding="utf-8") as f:
        _RECORDS = json.load(f)
    for r in _RECORDS:
        _NAME_TO_RECORD[r["name"]] = r
        _CODE_TO_RECORD[r["code"]] = r
except Exception:
    _RECORDS = []


def _suffix(market: str) -> str:
    return ".KS" if market == "KOSPI" else ".KQ"


def code_to_name(code6: str):
    r = _CODE_TO_RECORD.get(code6)
    return r["name"] if r else None


def code_to_market_label(code6: str):
    r = _CODE_TO_RECORD.get(code6)
    if not r:
        return None
    return "코스피" if r["market"] == "KOSPI" else "코스닥"


# KRX 공식 등록명과 통용명이 달라 검색이 실패하는 대표적인 경우에 대한 보정
_ALIASES = {
    "엔씨소프트": "NC",
}

_HANGUL_RE = re.compile(r"[가-힣]")


def contains_hangul(text: str) -> bool:
    return bool(_HANGUL_RE.search(text))


def resolve_by_name(query: str):
    """한글 종목명(정확히 일치 또는 부분일치)으로 (ticker, code, market) 을 찾는다."""
    query = query.strip()
    if not query:
        return None
    query = _ALIASES.get(query, query)

    exact = _NAME_TO_RECORD.get(query)
    if exact:
        return exact["code"] + _suffix(exact["market"]), exact["code"], exact["market"]

    candidates = [r for r in _RECORDS if query in r["name"]]
    if not candidates:
        return None
    candidates.sort(key=lambda r: len(r["name"]))
    best = candidates[0]
    return best["code"] + _suffix(best["market"]), best["code"], best["market"]
