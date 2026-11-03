create table public.houses (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null, address text, city text, neighborhood text, building text, floor text, door_number text, description text,
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint houses_id_owner_unique unique(id,owner_id)
);
create table public.meters (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 meter_number text not null, meter_type text, brand text, model text, initial_index numeric(14,3), installation_date date,
 status text not null default 'available' check(status in ('available','installed','maintenance','retired')),
 notes text, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint meters_id_owner_unique unique(id,owner_id), constraint meters_owner_number_unique unique(owner_id,meter_number)
);
create table public.house_tenant_assignments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 house_id uuid not null, tenant_id uuid not null, assigned_at date not null default current_date, released_at date, notes text, created_at timestamptz not null default now(),
 constraint house_tenant_dates_valid check(released_at is null or released_at>=assigned_at),
 constraint house_tenant_house_fk foreign key(house_id,owner_id) references public.houses(id,owner_id) on delete restrict,
 constraint house_tenant_tenant_fk foreign key(tenant_id,owner_id) references public.tenants(id,owner_id) on delete restrict
);
create unique index house_one_current_tenant_idx on public.house_tenant_assignments(house_id) where released_at is null;
create unique index tenant_one_current_house_idx on public.house_tenant_assignments(tenant_id) where released_at is null;
create index house_tenant_house_owner_idx on public.house_tenant_assignments(house_id,owner_id);
create index house_tenant_tenant_owner_idx on public.house_tenant_assignments(tenant_id,owner_id);
create table public.meter_house_assignments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 meter_id uuid not null, house_id uuid not null, assigned_at date not null default current_date, released_at date, notes text, created_at timestamptz not null default now(),
 constraint meter_house_dates_valid check(released_at is null or released_at>=assigned_at),
 constraint meter_house_meter_fk foreign key(meter_id,owner_id) references public.meters(id,owner_id) on delete restrict,
 constraint meter_house_house_fk foreign key(house_id,owner_id) references public.houses(id,owner_id) on delete restrict
);
create unique index meter_one_current_house_idx on public.meter_house_assignments(meter_id) where released_at is null;
create unique index house_one_current_meter_idx on public.meter_house_assignments(house_id) where released_at is null;
create index meter_house_meter_owner_idx on public.meter_house_assignments(meter_id,owner_id);
create index meter_house_house_owner_idx on public.meter_house_assignments(house_id,owner_id);
alter table public.tenants add column if not exists email text, add column if not exists arrival_date date, add column if not exists gender text check(gender is null or gender in ('female','male','other','prefer_not_to_say')), add column if not exists address text, add column if not exists notes text;
do $$ declare t text; begin foreach t in array array['houses','meters','house_tenant_assignments','meter_house_assignments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create policy %I on public.%I for select to authenticated using(owner_id=(select auth.uid()))',t||'_own_select',t);
 execute format('create policy %I on public.%I for insert to authenticated with check(owner_id=(select auth.uid()))',t||'_own_insert',t);
 execute format('create policy %I on public.%I for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()))',t||'_own_update',t);
 execute format('create policy %I on public.%I for delete to authenticated using(owner_id=(select auth.uid()))',t||'_own_delete',t);
end loop; end $$;
grant select,insert,update,delete on public.tenants to authenticated;
