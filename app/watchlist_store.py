"""Supabase(Postgres REST API)를 이용한 관심종목·메모 저장소.

프론트엔드는 이 모듈을 직접 호출하지 않고 항상 Flask API(/api/watchlist...)를 거친다.
Supabase 자격증명은 SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수로 설정하며,
설정되지 않은 경우 이 모듈의 함수들은 is_configured() 가 False 를 반환해
호출부(server.py)가 사용자에게 안내 메시지를 보여줄 수 있도록 한다.
"""
import datetime
import os

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY", "")
_TABLE = "watchlist"


def is_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def _headers(extra: dict = None):
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _base_url():
    return f"{SUPABASE_URL}/rest/v1/{_TABLE}"


def list_watchlist():
    r = requests.get(
        f"{_base_url()}?select=*&order=created_at.desc",
        headers=_headers(), timeout=8,
    )
    r.raise_for_status()
    return r.json()


def add_watchlist(ticker: str, name: str, market: str):
    r = requests.post(
        f"{_base_url()}?on_conflict=ticker",
        headers=_headers({"Prefer": "resolution=merge-duplicates,return=representation"}),
        json={"ticker": ticker, "name": name, "market": market},
        timeout=8,
    )
    r.raise_for_status()
    items = r.json()
    return items[0] if items else None


def remove_watchlist(ticker: str):
    r = requests.delete(
        f"{_base_url()}?ticker=eq.{ticker}",
        headers=_headers(), timeout=8,
    )
    r.raise_for_status()


def update_note(ticker: str, note: str):
    r = requests.patch(
        f"{_base_url()}?ticker=eq.{ticker}",
        headers=_headers({"Prefer": "return=representation"}),
        json={"note": note, "updated_at": datetime.datetime.utcnow().isoformat()},
        timeout=8,
    )
    r.raise_for_status()
    items = r.json()
    return items[0] if items else None
