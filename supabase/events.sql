-- 유입 퍼널용 최소 이벤트 — 방문·로그인·미션 완수 셋만 쌓는다.
-- 구독·파트너·선물은 이미 progress·gifts 에 있어 다시 쌓지 않는다.
create table if not exists events (
  id       uuid primary key default gen_random_uuid(),
  anon_id  text not null,          -- 로그인 전에도 이어 세려고 브라우저마다 붙이는 값
  email    text,                   -- 로그인하면 채워진다
  step     text not null,          -- visit | signin | mission_done
  props    jsonb,
  at       timestamptz not null default now()
);
create index if not exists events_step on events (step);
create index if not exists events_anon on events (anon_id);
create index if not exists events_at   on events (at);

alter table events enable row level security;  -- 읽기·쓰기는 전부 서버(service_role)를 거친다
