# 스크리닝(종목 발굴) 대상 유니버스: 주요 종목 리스트
# 개별 티커 검색/분석은 이 리스트에 없어도 야후 파이낸스에 존재하는 모든 티커에 대해 동작한다.

US_UNIVERSE = [
    # 메가캡 테크
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "CRM",
    "ADBE", "CSCO", "INTC", "QCOM", "TXN", "AMD", "IBM", "NOW", "PANW", "CRWD",
    "ABNB", "UBER", "LYFT", "SHOP", "SQ", "PYPL", "NET", "SNOW", "DDOG", "ZS",
    "OKTA", "DOCU", "ZM", "ROKU", "ETSY", "TTD", "PLTR", "MELI", "JD", "PDD",
    "BIDU", "NTES", "TCOM",
    # 반도체/장비
    "ASML", "MU", "LRCX", "KLAC", "SNPS", "CDNS", "ON", "MRVL", "ARM",
    # 헬스케어/바이오
    "UNH", "JNJ", "LLY", "PFE", "MRK", "TMO", "DHR", "ABBV", "AMGN", "GILD",
    "VRTX", "REGN", "ISRG", "BIIB", "ILMN", "MRNA", "BNTX", "DXCM", "IDXX", "STAA",
    "NNOX",
    # 금융
    "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP", "SPGI", "BLK",
    # 소비재/유통
    "WMT", "PG", "KO", "PEP", "COST", "HD", "MCD", "NKE", "SBUX", "DIS",
    "YETI", "ANF", "ROST", "ORLY", "MAR", "BKNG", "EA",
    # 산업재/에너지/기타
    "XOM", "CVX", "BA", "CAT", "GE", "RTX", "LMT", "NOC", "GD", "DE",
    "MMM", "UPS", "FDX", "HON", "GM", "F",
    # 통신/미디어
    "NFLX", "CMCSA", "T", "VZ",
    # 리츠/기타 성장주
    "MDLZ", "CTAS", "ADP", "PAYX", "FTNT", "CTSH", "ODFL", "WBA",
]

KR_UNIVERSE = [
    # KOSPI 대형주
    "005930.KS",  # 삼성전자
    "000660.KS",  # SK하이닉스
    "373220.KS",  # LG에너지솔루션
    "207940.KS",  # 삼성바이오로직스
    "005380.KS",  # 현대차
    "000270.KS",  # 기아
    "005490.KS",  # POSCO홀딩스
    "051910.KS",  # LG화학
    "006400.KS",  # 삼성SDI
    "035420.KS",  # NAVER
    "035720.KS",  # 카카오
    "068270.KS",  # 셀트리온
    "105560.KS",  # KB금융
    "055550.KS",  # 신한지주
    "086790.KS",  # 하나금융지주
    "316140.KS",  # 우리금융지주
    "032830.KS",  # 삼성생명
    "000810.KS",  # 삼성화재
    "018260.KS",  # 삼성에스디에스
    "009150.KS",  # 삼성전기
    "010130.KS",  # 고려아연
    "011200.KS",  # HMM
    "010950.KS",  # S-Oil
    "096770.KS",  # SK이노베이션
    "034730.KS",  # SK
    "017670.KS",  # SK텔레콤
    "030200.KS",  # KT
    "015760.KS",  # 한국전력
    "024110.KS",  # 기업은행
    "138040.KS",  # 메리츠금융지주
    "042660.KS",  # 한화오션
    "012330.KS",  # 현대모비스
    "028260.KS",  # 삼성물산
    "011070.KS",  # LG이노텍
    "066570.KS",  # LG전자
    "003550.KS",  # LG
    "034220.KS",  # LG디스플레이
    "051900.KS",  # LG생활건강
    "097950.KS",  # CJ제일제당
    "036570.KS",  # 엔씨소프트
    "251270.KS",  # 넷마블
    "259960.KS",  # 크래프톤
    "352820.KS",  # 하이브
    "090430.KS",  # 아모레퍼시픽
    "161390.KS",  # 한국타이어앤테크놀로지
    "010140.KS",  # 삼성중공업
    "003670.KS",  # 포스코퓨처엠
    "016360.KS",  # 삼성증권
    "039490.KS",  # 키움증권
    "035900.KS",  # JYP Ent.
    "035760.KS",  # CJ ENM
    "028300.KS",  # HLB
    # KOSDAQ
    "247540.KQ",  # 에코프로비엠
    "086520.KQ",  # 에코프로
    "196170.KQ",  # 알테오젠
    "263750.KQ",  # 펄어비스
    "293490.KQ",  # 카카오게임즈
    "112040.KQ",  # 위메이드
    "042700.KQ",  # 한미반도체
    "141080.KQ",  # 레고켐바이오사이언스
    "145020.KQ",  # 휴젤
    "096530.KQ",  # 씨젠
    "357780.KQ",  # 솔브레인
    "091990.KQ",  # 셀트리온헬스케어
]

BENCHMARKS = {
    "US": "^GSPC",
    "KR": "^KS11",
}
