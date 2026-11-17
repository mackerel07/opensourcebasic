-- 로그인 없이 모든 방문자가 함께 조회·수정하는 공개 물품 목록이다.
-- 기존 개인별 item_groups / item_group_items와 계정 정보는 변경하지 않는다.
begin;

create table public.shared_item_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.shared_item_group_items (
  group_id uuid not null references public.shared_item_groups(id) on delete cascade,
  label_code text not null references public.inventory_labels(code),
  expected_quantity integer not null check (expected_quantity between 1 and 999),
  primary key (group_id, label_code),
  check (label_code in ('calculator', 'scissors', 'mouse'))
);

alter table public.shared_item_groups enable row level security;
alter table public.shared_item_group_items enable row level security;
revoke all on public.shared_item_groups, public.shared_item_group_items from anon, authenticated;
grant select, insert, update on public.shared_item_groups, public.shared_item_group_items to anon, authenticated;
grant all on public.shared_item_groups, public.shared_item_group_items to service_role;

create policy shared_groups_read on public.shared_item_groups for select to anon, authenticated using (true);
create policy shared_groups_create on public.shared_item_groups for insert to anon, authenticated with check (true);
create policy shared_groups_update on public.shared_item_groups for update to anon, authenticated using (true) with check (true);
create policy shared_items_read on public.shared_item_group_items for select to anon, authenticated using (true);
create policy shared_items_create on public.shared_item_group_items for insert to anon, authenticated with check (true);
create policy shared_items_update on public.shared_item_group_items for update to anon, authenticated using (true) with check (true);

with default_group as (
  insert into public.shared_item_groups (name) values ('기본 물품') returning id
)
insert into public.shared_item_group_items (group_id, label_code, expected_quantity)
select g.id, v.code, 1
from default_group g cross join (values ('calculator'), ('scissors'), ('mouse')) v(code);

notify pgrst, 'reload schema';
commit;
