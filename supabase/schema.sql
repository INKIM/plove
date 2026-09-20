-- PLOVE — 이메일·파트너·공유·문의에 필요한 최소 테이블
-- Supabase SQL Editor 에 통째로 붙여넣고 한 번 실행하면 됩니다. 여러 번 돌려도 안전합니다.

-- 1) 팀 구독 문의 — 쌓아뒀다 하루 1번 메일로 보낸다
create table if not exists inquiries (
  id          uuid primary key default gen_random_uuid(),
  company     text not null,
  headcount   text not null,
  timing      text not null,
  contact     text not null,
  created_at  timestamptz not null default now(),
  mailed_at   timestamptz                      -- 보낸 시각. null 이면 아직 안 보냄
);
create index if not exists inquiries_unmailed on inquiries (created_at) where mailed_at is null;

-- 2) 구독권 선물
create table if not exists gifts (
  id          uuid primary key default gen_random_uuid(),
  sender_email text not null,
  sender_name  text,
  to_email    text not null,
  message     text,
  token       text not null unique,
  status      text not null default 'sent',    -- sent | claimed | expired
  sent_at     timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  claimed_at  timestamptz,
  claimed_by  text
);
create index if not exists gifts_token on gifts (token);

-- 3) 파트너 초대·연결
create table if not exists partners (
  id           uuid primary key default gen_random_uuid(),
  a_email      text not null,                  -- 초대한 사람
  a_name       text,
  b_email      text,                           -- 초대받은 사람 (수락 전에는 target 과 같다)
  target_email text not null,                  -- 초대장을 보낸 주소
  status       text not null default 'pending',-- pending | active | severed
  token        text not null unique,
  open_courses text[] not null default '{}',   -- 상호 공개 (대칭)
  invited_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  severed_at   timestamptz
);
create index if not exists partners_token  on partners (token);
create index if not exists partners_a      on partners (a_email) where status = 'active';
create index if not exists partners_b      on partners (b_email) where status = 'active';

-- 해제한 상대와는 다시 연결하지 않는다
create table if not exists partner_blocks (
  low_email   text not null,
  high_email  text not null,
  blocked_at  timestamptz not null default now(),
  primary key (low_email, high_email)
);

-- 4) 회고 공유 링크
create table if not exists shares (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  owner_email text not null,
  course_key  text not null,
  scope       text not null default 'link',    -- all | link | private
  hide_photos boolean not null default false,
  payload     jsonb not null,                  -- 그 시점의 회고 스냅샷
  created_at  timestamptz not null default now(),
  expires_at  timestamptz                      -- null = 무기한
);
create index if not exists shares_slug on shares (slug);


-- 6) 진행도 — 계정마다 한 줄. 파트너가 내 기록을 보려면 서버에 있어야 한다.
--    (localStorage 에만 두면 상대 화면에서 가져올 데가 없다)
create table if not exists progress (
  email       text primary key,
  name        text,
  photo_url   text,
  data        jsonb not null,            -- levels·completedMap·records·xp·gems·streak 스냅샷
  updated_at  timestamptz not null default now()
);
alter table progress enable row level security;

-- RLS — 브라우저(anon)는 아무것도 못 읽고 못 쓴다. 전부 서버(service_role)를 거친다.
alter table inquiries      enable row level security;
alter table gifts          enable row level security;
alter table partners       enable row level security;
alter table partner_blocks enable row level security;
alter table shares         enable row level security;

-- 공개 회고만 예외 — 링크를 아는 사람이 로그인 없이 볼 수 있어야 한다
drop policy if exists shares_public_read on shares;
create policy shares_public_read on shares
  for select to anon
  using (scope in ('all','link') and (expires_at is null or expires_at > now()));

grant usage on schema public to anon, authenticated;
grant select on shares to anon, authenticated;
