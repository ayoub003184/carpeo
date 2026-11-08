-- CARPEO Complete Production Schema for Supabase (PostgreSQL)
create extension if not exists pgcrypto;

-- 1. Users & Roles (Admin, Team, Readonly)
create table if not exists public.carpeo_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null default 'Équipe CARPEO',
  role text not null default 'readonly' check (role in ('admin','team','readonly')),
  created_at timestamptz not null default now()
);

-- 2. Pricing Grid
create table if not exists public.carpeo_pricing (
  key text primary key,
  label text not null,
  group_name text not null,
  mode text not null check(mode in ('price','quote')),
  price numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- 3. Platform Settings
create table if not exists public.carpeo_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- 4. Bookings & Quotes (Pipeline 7 steps + Routing + Attribution)
create table if not exists public.carpeo_bookings (
  id bigint generated always as identity primary key,
  ref text unique not null,
  access_key_hash text not null,
  type text not null,
  status text not null,
  customer_json jsonb not null,
  items_json jsonb not null,
  slot text,
  total numeric(10,2),
  deposit numeric(10,2),
  balance numeric(10,2),
  promo text,
  advance text,
  quote_amount numeric(10,2),
  notes text not null default '',
  tags text not null default '',
  lat double precision,
  lng double precision,
  route_order integer,
  attribution_json jsonb not null default '{}'::jsonb,
  photos_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.carpeo_bookings add column if not exists tags text not null default '';
alter table public.carpeo_bookings add column if not exists lat double precision;
alter table public.carpeo_bookings add column if not exists lng double precision;
alter table public.carpeo_bookings add column if not exists route_order integer;
alter table public.carpeo_bookings add column if not exists attribution_json jsonb not null default '{}'::jsonb;
alter table public.carpeo_bookings add column if not exists photos_json jsonb not null default '[]'::jsonb;

create unique index if not exists carpeo_bookings_active_slot on public.carpeo_bookings(slot) where slot is not null and status not in ('Annulé','Terminé');

-- 5. CRM Contacts
create table if not exists public.carpeo_contacts (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  phone text default '',
  address text default '',
  city text default '',
  postal_code text default '',
  need text default '',
  message text not null default '',
  status text not null default 'Nouveau',
  tags text not null default '',
  notes text not null default '',
  source text not null default 'Site web',
  attribution_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.carpeo_contacts add column if not exists address text default '';
alter table public.carpeo_contacts add column if not exists city text default '';
alter table public.carpeo_contacts add column if not exists postal_code text default '';
alter table public.carpeo_contacts add column if not exists tags text not null default '';
alter table public.carpeo_contacts add column if not exists notes text not null default '';
alter table public.carpeo_contacts add column if not exists source text not null default 'Site web';
alter table public.carpeo_contacts add column if not exists attribution_json jsonb not null default '{}'::jsonb;
alter table public.carpeo_contacts add column if not exists updated_at timestamptz not null default now();

-- 6. Omnichannel Conversations (Email, SMS, WhatsApp, Instagram DM, Form)
create table if not exists public.carpeo_conversations (
  id bigint generated always as identity primary key,
  booking_id bigint references public.carpeo_bookings(id) on delete set null,
  contact_id bigint references public.carpeo_contacts(id) on delete set null,
  recipient text default '',
  subject text default '',
  channel text not null,
  direction text not null,
  body text not null,
  status text not null,
  created_at timestamptz not null default now()
);

alter table public.carpeo_conversations add column if not exists recipient text default '';
alter table public.carpeo_conversations add column if not exists subject text default '';

-- 7. Team Tasks & Internal Planning
create table if not exists public.carpeo_tasks (
  id bigint generated always as identity primary key,
  booking_id bigint references public.carpeo_bookings(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  status text not null default 'À faire',
  assignee text default '',
  priority text not null default 'Normale',
  created_at timestamptz not null default now()
);

alter table public.carpeo_tasks add column if not exists priority text not null default 'Normale';

-- 8. Blocked Calendar Slots
create table if not exists public.carpeo_blocked_slots (
  id bigint generated always as identity primary key,
  slot_start text not null,
  slot_end text not null,
  reason text default '',
  created_at timestamptz not null default now()
);

-- 9. Automated Marketing Notifications (J-1 Reminder, Quote Followup, Review Request)
create table if not exists public.carpeo_notifications (
  id bigint generated always as identity primary key,
  booking_id bigint references public.carpeo_bookings(id) on delete cascade,
  channel text not null,
  template text not null,
  status text not null default 'queued',
  send_at timestamptz not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now(),
  unique(booking_id, channel, template)
);

-- 10. Stripe Payments & Refunds
create table if not exists public.carpeo_payments (
  id bigint generated always as identity primary key,
  booking_id bigint references public.carpeo_bookings(id) on delete cascade,
  provider_id text unique,
  kind text not null default 'deposit',
  amount numeric(10,2) not null,
  status text not null,
  method text not null default 'stripe',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.carpeo_payments add column if not exists method text not null default 'stripe';

-- 11. Customer Reviews & Satisfaction
create table if not exists public.carpeo_reviews (
  id bigint generated always as identity primary key,
  booking_id bigint references public.carpeo_bookings(id) on delete set null,
  customer_name text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text not null default '',
  reply text not null default '',
  status text not null default 'Publié',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 12. Analytics & Ad Attribution Events
create table if not exists public.carpeo_events (
  id bigint generated always as identity primary key,
  name text not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now()
);

-- 13. Security Audit Log
create table if not exists public.carpeo_audit (
  id bigint generated always as identity primary key,
  user_id uuid references public.carpeo_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security (Backend accesses via service_role key)
do $$ begin
  alter table public.carpeo_users enable row level security;
  alter table public.carpeo_pricing enable row level security;
  alter table public.carpeo_settings enable row level security;
  alter table public.carpeo_bookings enable row level security;
  alter table public.carpeo_contacts enable row level security;
  alter table public.carpeo_conversations enable row level security;
  alter table public.carpeo_tasks enable row level security;
  alter table public.carpeo_blocked_slots enable row level security;
  alter table public.carpeo_notifications enable row level security;
  alter table public.carpeo_payments enable row level security;
  alter table public.carpeo_reviews enable row level security;
  alter table public.carpeo_events enable row level security;
  alter table public.carpeo_audit enable row level security;
exception when others then null; end $$;

-- Seed Default Settings
insert into public.carpeo_settings(key,value) values
  ('deposit','20'),
  ('area','Intervention à domicile et en entreprise'),
  ('hours','7 jours sur 7, de 9 h à 19 h'),
  ('maps_url','https://www.google.com/maps/place/Carpeo/@48.8350077,2.4096267,11z/data=!3m1!4b1!4m6!3m5!1s0x42afe645686fa375:0xe9c68ae617bca720!8m2!3d48.8350076!4d2.4096267!16s%2Fg%2F11zzsk71ns?entry=ttu&g_ep=EgoyMDI2MTEwMy4wIKXMDSoASAFQAw%3D%3D'),
  ('auto_reminder_j1','true'),
  ('auto_quote_followup','true'),
  ('auto_review_request','true')
on conflict(key) do update set
  value = case when public.carpeo_settings.key = 'area' and public.carpeo_settings.value like '%Île-de-France%' then excluded.value else public.carpeo_settings.value end;

-- Seed Default Pricing Grid
insert into public.carpeo_pricing(key,label,group_name,mode,price) values
  ('sofa2Straight','Canapé droit, 2 places','Canapés','price',89),
  ('sofa3Straight','Canapé droit, 3 places','Canapés','price',99),
  ('sofa4Straight','Canapé droit, 4 places','Canapés','quote',0),
  ('sofa2Angle','Canapé d’angle, 2 places','Canapés','price',119),
  ('sofa3Angle','Canapé d’angle, 3 places','Canapés','price',139),
  ('sofa4Angle','Canapé d’angle, 4 places','Canapés','quote',0),
  ('sofa2Meridienne','Méridienne, 2 places','Canapés','price',119),
  ('sofa3Meridienne','Méridienne, 3 places','Canapés','price',139),
  ('sofaPanoramic','Canapé panoramique','Canapés','quote',0),
  ('sofaConvertible','Canapé convertible','Canapés','quote',0),
  ('mattress1','Matelas, une face','Literie','price',79),
  ('mattress2','Matelas, deux faces','Literie','price',89),
  ('headboard','Tête de lit','Literie','quote',0),
  ('armchair','Fauteuil','Assises','price',49),
  ('chair','Chaise rembourrée','Assises','price',25),
  ('chairs6','Lot de 6 chaises','Assises','price',90),
  ('rug','Tapis','Surfaces','quote',39),
  ('carpet','Moquette','Surfaces','quote',0),
  ('cushion','Coussin','Autres textiles','quote',0),
  ('other','Autre demande','Autres textiles','quote',0)
on conflict(key) do nothing;

insert into storage.buckets(id,name,public) values ('carpeo-booking-photos','carpeo-booking-photos',false) on conflict(id) do nothing;

-- Auto-grant admin access to existing Supabase Auth users
insert into public.carpeo_users(id,email,name,role)
select id, email, 'Administrateur CARPEO', 'admin'
from auth.users
where email is not null
on conflict(id) do update set role = 'admin';

-- Optional demo data is intentionally disabled in production.
do $$
declare
  b1_id bigint;
  b2_id bigint;
  b3_id bigint;
  b4_id bigint;
  c1_id bigint;
  c2_id bigint;
begin
  if false and not exists (select 1 from public.carpeo_bookings limit 1) then
    insert into public.carpeo_contacts(name,email,phone,address,city,postal_code,need,message,status,tags,notes,source)
    values
      ('Sophie Martin','sophie.martin@example.com','06 12 34 56 78','14 Rue de Rivoli','Paris','75004','Canapé 3 places + Tapis','Bonjour, je souhaite un nettoyage complet avant réception.','Client','VIP, Particulier','Cliente fidèle, code porte 4589A','Google Ads')
    returning id into c1_id;

    insert into public.carpeo_contacts(name,email,phone,address,city,postal_code,need,message,status,tags,notes,source)
    values
      ('Marc Lefèvre — Hôtel Le Swann','direction@hotel-swann.fr','01 45 22 88 00','15 Rue de Constantinople','Paris','75008','Moquette & 18 fauteuils','Demande de devis pour nettoyage mensuel de nos fauteuils de salon.','Devis en cours','Entreprise, B2B, VIP','Contrat récurrent potentiel','SEO / Site web')
    returning id into c2_id;

    insert into public.carpeo_contacts(name,email,phone,address,city,postal_code,need,message,status,tags,notes,source)
    values
      ('Camille Dubois','camille.dubois@example.com','06 98 76 54 32','28 Avenue Jean Jaurès','Lyon','69007','Matelas 2 faces','Tache de café sur matelas King Size.','Confirmé','Particulier','Accès ascenseur','Meta Ads (Instagram)');

    insert into public.carpeo_bookings(ref,access_key_hash,type,status,customer_json,items_json,slot,total,deposit,balance,notes,tags,lat,lng,attribution_json)
    values
      ('CAR-8F4A21B9',encode(digest('DEMOKEY1','sha256'),'hex'),'reservation','Planifié',
       '{"nom":"Martin","prenom":"Sophie","email":"sophie.martin@example.com","tel":"06 12 34 56 78","adresse":"14 Rue de Rivoli","cp":"75004","ville":"Paris","heard":"Google Ads"}'::jsonb,
       '[{"cat":"canape","places":"3","config":"droit","qty":"1","frozenPrice":99}]'::jsonb,
       to_char(now() + interval '1 day', 'YYYY-MM-DD') || ' 11:00', 99, 20, 79,
       'Prévoir détachant enzymatique.', 'VIP', 48.8556, 2.3574, '{"source":"Google Ads","campaign":"Search Canapé"}'::jsonb)
    returning id into b1_id;

    insert into public.carpeo_bookings(ref,access_key_hash,type,status,customer_json,items_json,slot,total,deposit,balance,quote_amount,notes,tags,lat,lng,attribution_json)
    values
      ('CAR-3C9E10A4',encode(digest('DEMOKEY2','sha256'),'hex'),'devis','Devis envoyé',
       '{"nom":"Lefèvre","prenom":"Marc","email":"direction@hotel-swann.fr","tel":"01 45 22 88 00","adresse":"15 Rue de Constantinople","cp":"75008","ville":"Paris","heard":"Google"}'::jsonb,
       '[{"cat":"moquette","surface":"45m2","qty":"1","frozenPrice":null},{"cat":"fauteuil","qty":"6","frozenPrice":294}]'::jsonb,
       null, null, null, null, 540,
       'Devis B2B envoyé avec remise volume.', 'B2B, Urgent', 48.8794, 2.3185, '{"source":"SEO / Site web"}'::jsonb)
    returning id into b2_id;

    insert into public.carpeo_bookings(ref,access_key_hash,type,status,customer_json,items_json,slot,total,deposit,balance,notes,tags,lat,lng,attribution_json)
    values
      ('CAR-7B2D91E0',encode(digest('DEMOKEY3','sha256'),'hex'),'reservation','Confirmé',
       '{"nom":"Dubois","prenom":"Camille","email":"camille.dubois@example.com","tel":"06 98 76 54 32","adresse":"88 Boulevard Saint-Germain","cp":"75005","ville":"Paris","heard":"Instagram"}'::jsonb,
       '[{"cat":"matelas","faces":"2","qty":"1","frozenPrice":89}]'::jsonb,
       to_char(now() + interval '1 day', 'YYYY-MM-DD') || ' 14:00', 89, 20, 69,
       'Tache récente.', 'Particulier', 48.8508, 2.3469, '{"source":"Meta Ads (Instagram)"}'::jsonb)
    returning id into b3_id;

    insert into public.carpeo_bookings(ref,access_key_hash,type,status,customer_json,items_json,slot,total,deposit,balance,notes,tags,lat,lng,attribution_json)
    values
      ('CAR-9A1F44C2',encode(digest('DEMOKEY4','sha256'),'hex'),'reservation','Terminé',
       '{"nom":"Bernard","prenom":"Thomas","email":"t.bernard@example.com","tel":"06 55 44 33 22","adresse":"42 Rue du Bac","cp":"75007","ville":"Paris","heard":"Bouche à oreille"}'::jsonb,
       '[{"cat":"canape","places":"3","config":"angle","qty":"1","frozenPrice":139}]'::jsonb,
       to_char(now() - interval '2 days', 'YYYY-MM-DD') || ' 08:00', 139, 20, 0,
       'Prestation réglée intégralement.', 'Fidèle', 48.8562, 2.3256, '{"source":"Recommandation"}'::jsonb)
    returning id into b4_id;

    insert into public.carpeo_payments(booking_id,provider_id,kind,amount,status,method)
    values
      (b1_id,'pi_carpeo_demo_01','deposit',20,'paid','stripe'),
      (b3_id,'pi_carpeo_demo_02','deposit',20,'paid','stripe'),
      (b4_id,'pi_carpeo_demo_03','deposit',20,'paid','stripe'),
      (b4_id,'pi_carpeo_demo_04','balance',119,'paid','stripe');

    insert into public.carpeo_conversations(booking_id,contact_id,recipient,subject,channel,direction,body,status)
    values
      (b1_id,c1_id,'sophie.martin@example.com','Confirmation CAR-8F4A21B9','email','outbound','Bonjour Sophie, votre créneau de demain à 11h00 est bien confirmé.','sent'),
      (b2_id,c2_id,'direction@hotel-swann.fr','Devis CAR-3C9E10A4','email','outbound','Bonjour Marc, veuillez trouver votre devis personnalisé de 540 € TTC.','sent'),
      (b3_id,null,'06 98 76 54 32','Question horaire','whatsapp','inbound','Bonjour, le technicien pourra-t-il m’appeler 15 min avant son arrivée ?','reçu'),
      (null,null,'@atelier_deco_paris','DM Instagram','instagram','inbound','Bonjour ! Intervenez-vous aussi sur les fauteuils en velours côtelé ?','reçu');

    insert into public.carpeo_tasks(booking_id,title,due_at,status,assignee,priority)
    values
      (b1_id,'Préparer injecteur-extracteur + produit velours (CAR-8F4A21B9)',now() + interval '1 day','À faire','Équipe terrain','Haute'),
      (b2_id,'Relancer Marc Lefèvre (Hôtel Le Swann) pour validation devis',now() + interval '2 days','En cours','Commercial','Haute');

    insert into public.carpeo_reviews(booking_id,customer_name,rating,comment,reply,status)
    values
      (b4_id,'Thomas Bernard',5,'Résultat bluffant sur notre canapé d’angle beige, plus aucune trace et séchage rapide. Merci !','Merci beaucoup Thomas pour votre confiance !','Publié'),
      (b1_id,'Sophie Martin',5,'Ponctualité exemplaire et matériel très professionnel. Je recommande à 100%.','Merci Sophie, au plaisir de vous revoir !','Publié');
  end if;
end $$;

