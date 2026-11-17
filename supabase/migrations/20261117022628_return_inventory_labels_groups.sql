begin;

create table public.inventory_labels (
  code text primary key check (code in ('calculator', 'scissors', 'mouse', 'other')),
  name text not null
);
insert into public.inventory_labels (code, name) values
  ('calculator', '계산기'), ('scissors', '가위'), ('mouse', '마우스'), ('other', '기타');

create table public.item_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create index item_groups_owner_idx on public.item_groups(owner_id);

create table public.item_group_items (
  group_id uuid not null references public.item_groups(id) on delete cascade,
  label_code text not null references public.inventory_labels(code),
  expected_quantity integer not null check (expected_quantity between 1 and 999),
  primary key (group_id, label_code),
  check (label_code <> 'other')
);

alter table public.inventory_labels enable row level security;
alter table public.item_groups enable row level security;
alter table public.item_group_items enable row level security;

revoke all on public.inventory_labels, public.item_groups, public.item_group_items from anon, authenticated;
grant select on public.inventory_labels to anon, authenticated;
grant select, insert, update, delete on public.item_groups, public.item_group_items to authenticated;
grant all on public.inventory_labels, public.item_groups, public.item_group_items to service_role;

create policy labels_read on public.inventory_labels for select to anon, authenticated using (true);

create policy own_groups on public.item_groups for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy own_group_items on public.item_group_items for all to authenticated
  using (exists (
    select 1 from public.item_groups g
    where g.id = group_id and g.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.item_groups g
    where g.id = group_id and g.owner_id = (select auth.uid())
  ));

commit;
