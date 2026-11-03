create table tenants(id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(), name text not null, phone text, meter_no text, active boolean default true);
create table periods(id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(), month date not null, kwh_price numeric not null, main_index numeric, main_amount numeric, distributed_on date, residual numeric, unique(owner_id, month));
create table readings(id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(), period_id uuid references periods on delete cascade, tenant_id uuid references tenants, prev_index numeric not null, curr_index numeric not null, unique(period_id, tenant_id));
create table bills(id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(), period_id uuid references periods on delete cascade, tenant_id uuid references tenants, consumption numeric, conso_amount numeric, residual_share numeric, carry numeric, penalty numeric, total numeric, due_on date, unique(period_id, tenant_id));
create table payments(id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(), bill_id uuid references bills on delete cascade, amount numeric not null check(amount > 0), paid_on date not null);
create table emergency_fund(id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(), period_id uuid references periods on delete cascade, amount numeric not null, created_at timestamptz default now());
do $$ declare t text; begin
  foreach t in array array['tenants','periods','readings','bills','payments','emergency_fund'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy own on %I using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop; end $$;
