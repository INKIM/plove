-- LLM·업로드 남용 방어 — 부른 기록과 차단 목록.
-- 서버리스는 인스턴스마다 메모리가 갈라져 세는 것을 DB 에 둬야 한다.
create table if not exists api_hits (
  id    bigserial primary key,
  ip    text not null,
  route text not null,
  at    timestamptz not null default now()
);
create index if not exists api_hits_ip_at on api_hits (ip, at desc);
create index if not exists api_hits_at    on api_hits (at);

create table if not exists api_blocks (
  ip          text primary key,
  reason      text,
  hits        integer,
  route       text,
  blocked_at  timestamptz not null default now(),
  until       timestamptz not null,
  notified_at timestamptz                      -- 같은 차단으로 메일을 두 번 보내지 않는다
);

alter table api_hits   enable row level security;
alter table api_blocks enable row level security;
