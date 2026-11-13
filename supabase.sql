-- =====================================================================
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여넣고
-- 맨 아래 [3단계]의 비밀 키만 바꾼 뒤 Run 하세요.
-- 여러 번 실행해도 안전합니다. (비밀 키를 바꿀 때도 다시 실행하면 됩니다)
-- =====================================================================

-- [1단계] 메모 테이블 -------------------------------------------------
create table if not exists public.memos (
  id          uuid primary key default gen_random_uuid(),
  memo_date   date not null default current_date,
  title       text not null default '',
  content     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists memos_date_idx on public.memos (memo_date desc);

-- 테이블은 외부(웹페이지)에서 직접 접근 불가. 아래 함수로만 접근합니다.
alter table public.memos enable row level security;
revoke all on public.memos from anon, authenticated;

-- 비밀 키의 해시만 보관하는 비공개 영역 (API로 노출되지 않음)
create schema if not exists private;
revoke all on schema private from anon, authenticated;
create table if not exists private.settings (
  id        int primary key default 1 check (id = 1),
  key_hash  text not null
);

create or replace function private.check_key(p_key text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from private.settings
    where key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex')
  ) then
    raise exception 'invalid key' using errcode = '28000';
  end if;
end;
$$;

-- [2단계] 웹페이지가 호출하는 함수들 ----------------------------------
create or replace function public.memo_check(p_key text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_key(p_key);
  return true;
exception when sqlstate '28000' then
  return false;
end;
$$;

create or replace function public.memo_list(p_key text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare result json;
begin
  perform private.check_key(p_key);
  select coalesce(json_agg(m order by m.memo_date desc, m.updated_at desc), '[]'::json)
    into result from public.memos m;
  return result;
end;
$$;

create or replace function public.memo_create(p_key text, p_date date, p_title text, p_content text)
returns public.memos language plpgsql security definer set search_path = '' as $$
declare r public.memos;
begin
  perform private.check_key(p_key);
  insert into public.memos (memo_date, title, content)
  values (coalesce(p_date, current_date), coalesce(p_title, ''), coalesce(p_content, ''))
  returning * into r;
  return r;
end;
$$;

create or replace function public.memo_update(p_key text, p_id uuid, p_date date, p_title text, p_content text)
returns public.memos language plpgsql security definer set search_path = '' as $$
declare r public.memos;
begin
  perform private.check_key(p_key);
  update public.memos
     set memo_date = coalesce(p_date, memo_date),
         title = coalesce(p_title, ''),
         content = coalesce(p_content, ''),
         updated_at = now()
   where id = p_id
  returning * into r;
  if not found then
    raise exception 'memo not found';
  end if;
  return r;
end;
$$;

create or replace function public.memo_delete(p_key text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_key(p_key);
  delete from public.memos where id = p_id;
end;
$$;

revoke all on function private.check_key(text) from public, anon, authenticated;
revoke all on function public.memo_check(text) from public;
revoke all on function public.memo_list(text) from public;
revoke all on function public.memo_create(text, date, text, text) from public;
revoke all on function public.memo_update(text, uuid, date, text, text) from public;
revoke all on function public.memo_delete(text, uuid) from public;
grant execute on function public.memo_check(text) to anon, authenticated;
grant execute on function public.memo_list(text) to anon, authenticated;
grant execute on function public.memo_create(text, date, text, text) to anon, authenticated;
grant execute on function public.memo_update(text, uuid, date, text, text) to anon, authenticated;
grant execute on function public.memo_delete(text, uuid) to anon, authenticated;

-- [3단계] 비밀 키 설정 ------------------------------------------------
-- 아래 'CHANGE-ME' 를 나만의 비밀 키로 바꾸세요. (16자 이상, 추측하기 어려운 문장 추천)
-- ※ 이 파일은 GitHub에 올라가므로, 실제 키는 SQL Editor에서만 바꾸고 파일에는 저장하지 마세요.
do $$
declare
  new_key text := 'CHANGE-ME';
begin
  if new_key = 'CHANGE-ME' or length(new_key) < 16 then
    raise exception '비밀 키를 16자 이상의 나만의 값으로 바꾼 뒤 다시 실행하세요.';
  end if;
  insert into private.settings (id, key_hash)
  values (1, encode(sha256(convert_to(new_key, 'UTF8')), 'hex'))
  on conflict (id) do update set key_hash = excluded.key_hash;
end;
$$;

-- API가 새 테이블·함수를 바로 인식하도록 갱신
notify pgrst, 'reload schema';
