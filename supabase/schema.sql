-- CARPEO production schema for Supabase (PostgreSQL)
create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null default 'Équipe CARPEO',
  role text not null default 'readonly' check (role in ('admin','team','readonly')),
  created_at timestamptz not null default now()
);
create table if not exists public.pricing (key text primary key,label text not null,group_name text not null,mode text not null check(mode in ('price','quote')),price numeric(10,2) not null default 0,updated_at timestamptz not null default now());
create table if not exists public.settings (key text primary key,value text not null,updated_at timestamptz not null default now());
create table if not exists public.bookings (id bigint generated always as identity primary key,ref text unique not null,access_key_hash text not null,type text not null,status text not null,customer_json jsonb not null,items_json jsonb not null,slot text,total numeric(10,2),deposit numeric(10,2),balance numeric(10,2),promo text,advance text,quote_amount numeric(10,2),notes text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index if not exists bookings_active_slot on public.bookings(slot) where slot is not null and status not in ('Annulé','Terminé');
create table if not exists public.contacts (id bigint generated always as identity primary key,name text not null,email text not null,phone text default '',need text default '',message text not null,status text not null default 'Nouveau',created_at timestamptz not null default now());
create table if not exists public.conversations (id bigint generated always as identity primary key,booking_id bigint references public.bookings(id) on delete set null,contact_id bigint references public.contacts(id) on delete set null,channel text not null,direction text not null,body text not null,status text not null,created_at timestamptz not null default now());
create table if not exists public.tasks (id bigint generated always as identity primary key,booking_id bigint references public.bookings(id) on delete cascade,title text not null,due_at timestamptz,status text not null default 'À faire',assignee text default '',created_at timestamptz not null default now());
create table if not exists public.blocked_slots (id bigint generated always as identity primary key,slot_start text not null,slot_end text not null,reason text default '',created_at timestamptz not null default now());
create table if not exists public.notifications (id bigint generated always as identity primary key,booking_id bigint references public.bookings(id) on delete cascade,channel text not null,template text not null,status text not null default 'queued',send_at timestamptz not null,payload_json jsonb not null,created_at timestamptz not null default now());
create table if not exists public.payments (id bigint generated always as identity primary key,booking_id bigint references public.bookings(id) on delete cascade,provider_id text unique,kind text not null,amount numeric(10,2) not null,status text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.events (id bigint generated always as identity primary key,name text not null,payload_json jsonb not null,created_at timestamptz not null default now());
create table if not exists public.audit (id bigint generated always as identity primary key,user_id uuid references public.users(id) on delete set null,action text not null,entity_type text not null,entity_id text,meta_json jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());

do $$ begin
  alter table public.users enable row level security; alter table public.pricing enable row level security; alter table public.settings enable row level security; alter table public.bookings enable row level security; alter table public.contacts enable row level security; alter table public.conversations enable row level security; alter table public.tasks enable row level security; alter table public.blocked_slots enable row level security; alter table public.notifications enable row level security; alter table public.payments enable row level security; alter table public.events enable row level security; alter table public.audit enable row level security;
exception when others then null; end $$;

insert into public.settings(key,value) values ('deposit','20'),('area','Paris et ses alentours — Île-de-France') on conflict(key) do nothing;
insert into public.pricing(key,label,group_name,mode,price) values
('sofa2Straight','Canapé droit, 2 places','Canapés','price',89),('sofa3Straight','Canapé droit, 3 places','Canapés','price',99),('sofa4Straight','Canapé droit, 4 places','Canapés','quote',0),('sofa2Angle','Canapé d’angle, 2 places','Canapés','price',119),('sofa3Angle','Canapé d’angle, 3 places','Canapés','price',139),('sofa4Angle','Canapé d’angle, 4 places','Canapés','quote',0),('sofa2Meridienne','Méridienne, 2 places','Canapés','price',119),('sofa3Meridienne','Méridienne, 3 places','Canapés','price',139),('sofaPanoramic','Canapé panoramique','Canapés','quote',0),('sofaConvertible','Canapé convertible','Canapés','quote',0),('mattress1','Matelas, une face','Literie','price',79),('mattress2','Matelas, deux faces','Literie','price',89),('headboard','Tête de lit','Literie','quote',0),('armchair','Fauteuil','Assises','price',49),('chair','Chaise rembourrée','Assises','price',25),('chairs6','Lot de 6 chaises','Assises','price',90),('rug','Tapis','Surfaces','quote',39),('carpet','Moquette','Surfaces','quote',0),('cushion','Coussin','Autres textiles','quote',0),('other','Autre demande','Autres textiles','quote',0)
on conflict(key) do nothing;

insert into storage.buckets(id,name,public) values ('booking-photos','booking-photos',false) on conflict(id) do nothing;

-- After creating an Auth user in Supabase, grant access with:
-- insert into public.users(id,email,name,role) select id,email,'Administrateur CARPEO','admin' from auth.users where email='YOUR_EMAIL' on conflict(id) do update set role='admin';
