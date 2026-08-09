# 관심종목·메모 기능(Supabase) 설정 가이드

관심종목/메모는 Supabase에 저장되어 PC exe, 클라우드 웹, 폰(PWA) 어디서든 동일하게 동기화됩니다. 설정하지 않아도 나머지 기능(종목 분석, 스크리닝)은 그대로 사용 가능합니다.

## 1. Supabase 프로젝트 생성
1. [supabase.com](https://supabase.com) 무료 가입
2. **New project** 생성 (이름/비밀번호는 임의로, 리전은 가까운 곳으로)

## 2. 테이블 생성
프로젝트 대시보드 좌측 **SQL Editor** 에서 아래 SQL을 실행하세요.

```sql
create table watchlist (
  id bigint generated always as identity primary key,
  ticker text not null unique,
  name text,
  market text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table watchlist enable row level security;
-- 정책을 추가하지 않습니다: 서버(백엔드)는 service_role 키를 사용해 RLS를 우회하고,
-- 그 외 경로(익명 키 등)로는 어떤 요청도 허용되지 않아 안전합니다.
```

## 3. API 키 확인
대시보드 **Project Settings → API** 에서 아래 두 값을 확인하세요.
- **Project URL** (예: `https://xxxxxxxxxxxx.supabase.co`)
- **service_role key** (⚠️ `anon` 키가 아니라 `service_role` 키입니다 — 서버에서만 사용하고 절대 외부에 공개하지 마세요)

## 4. 앱에 설정 값 입력

### PC exe로 실행하는 경우
`.env.example` 파일을 복사해 `미너비니종목발굴기.exe` 와 **같은 폴더**에 `.env` 로 저장하고 값을 채워넣으세요.

```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...실제_service_role_키...
```

exe를 다시 실행하면 자동으로 적용됩니다.

### Render(클라우드) 배포인 경우
Render 대시보드 → 해당 서비스 → **Environment** 탭에서 `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` 를 각각 등록하세요. `.env` 파일은 필요 없습니다.

## 확인 방법
앱의 "관심종목" 탭이나 종목 분석 화면의 "☆ 관심종목 추가" 버튼이 정상적으로 눌리면 설정이 완료된 것입니다. "Supabase 미설정" 문구가 보이면 위 값이 제대로 적용되지 않은 것이니 `.env` 파일 위치/오탈자를 다시 확인해주세요.
