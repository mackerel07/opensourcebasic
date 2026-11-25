-- 기존 공유 목록에 반납 확정과 재고 증가를 한 트랜잭션으로 추가한다.
-- 기존 재고 값을 초기화하거나 개인별 테이블의 권한을 변경하지 않는다.
begin;

alter table public.shared_item_group_items
  drop constraint if exists shared_item_group_items_expected_quantity_check;
alter table public.shared_item_group_items
  add constraint shared_item_group_items_stock_range check (expected_quantity between 0 and 999);

create table public.shared_inventory_returns (
  request_id uuid primary key,
  group_id uuid not null references public.shared_item_groups(id),
  confirmed_counts jsonb not null check (jsonb_typeof(confirmed_counts) = 'object'),
  created_at timestamptz not null default now()
);
create index shared_inventory_returns_group_time_idx
  on public.shared_inventory_returns(group_id, created_at desc);
alter table public.shared_inventory_returns enable row level security;
revoke all on public.shared_inventory_returns from anon, authenticated;
grant select, insert on public.shared_inventory_returns to anon, authenticated;
grant all on public.shared_inventory_returns to service_role;
create policy shared_returns_read on public.shared_inventory_returns
  for select to anon, authenticated using (true);
create policy shared_returns_create on public.shared_inventory_returns
  for insert to anon, authenticated with check (true);

create function public.confirm_shared_return(p_request_id uuid, p_group_id uuid, p_counts jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted uuid;
  v_group uuid;
  v_counts jsonb;
  v_key text;
  v_value jsonb;
  v_quantity integer;
  v_after integer;
  v_items jsonb;
begin
  if p_request_id is null or p_group_id is null or p_counts is null
     or jsonb_typeof(p_counts) <> 'object' then
    raise exception '반납 요청 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if p_counts = '{}'::jsonb or (select count(*) from jsonb_object_keys(p_counts)) > 3 then
    raise exception '반납할 품목을 선택해 주세요.' using errcode = '22023';
  end if;
  for v_key, v_value in select key, value from jsonb_each(p_counts) order by key loop
    if v_key not in ('calculator', 'scissors', 'mouse')
       or jsonb_typeof(v_value) <> 'number' or v_value::text !~ '^[0-9]{1,3}$' then
      raise exception '확인 수량은 지원하는 품목별 0~999 정수여야 합니다.' using errcode = '22023';
    end if;
  end loop;

  -- 같은 요청의 동시 실행도 PK 충돌에서 대기한 뒤 한 번만 반영된다.
  insert into public.shared_inventory_returns(request_id, group_id, confirmed_counts)
    values (p_request_id, p_group_id, p_counts)
    on conflict (request_id) do nothing returning request_id into v_inserted;

  if v_inserted is null then
    select group_id, confirmed_counts into v_group, v_counts
      from public.shared_inventory_returns where request_id = p_request_id;
    if v_group is distinct from p_group_id or v_counts is distinct from p_counts then
      raise exception '같은 반납 요청의 내용을 바꿀 수 없습니다.' using errcode = '22023';
    end if;
  else
    -- 품목 순서를 고정하고 DB의 현재 값에 더한다. 한 품목이라도 실패하면
    -- 앞의 증가와 영수증 INSERT를 포함해 호출 전체가 롤백된다.
    for v_key, v_value in select key, value from jsonb_each(p_counts) order by key loop
      v_quantity := (v_value::text)::integer;
      update public.shared_item_group_items
        set expected_quantity = expected_quantity + v_quantity
        where group_id = p_group_id and label_code = v_key
          and expected_quantity <= 999 - v_quantity
        returning expected_quantity into v_after;
      if not found then
        raise exception '등록 품목이 없거나 반납 후 재고가 999개를 초과합니다.' using errcode = '22023';
      end if;
    end loop;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'label_code', label_code, 'expected_quantity', expected_quantity) order by label_code), '[]'::jsonb)
    into v_items from public.shared_item_group_items where group_id = p_group_id;
  return jsonb_build_object('request_id', p_request_id, 'applied', v_inserted is not null, 'items', v_items);
end;
$$;
revoke all on function public.confirm_shared_return(uuid, uuid, jsonb) from public;
grant execute on function public.confirm_shared_return(uuid, uuid, jsonb) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
