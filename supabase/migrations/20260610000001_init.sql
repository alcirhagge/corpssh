-- CorpSSH — schema inicial (Postgres / Supabase)
-- Local-first preservado: estas tabelas só são usadas por quem optar pela nuvem.
-- Segredos sobem cifrados no cliente (colunas *_cipher/*_nonce); o servidor é cego.

-- ─── profiles (espelho de auth.users) ───────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  display_name text,
  kdf_salt    text,                       -- salt base64 da KDF da senha-mestra
  created_at  timestamptz not null default now()
);

-- Cria o profile automaticamente quando um usuário se cadastra no Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Organização & membros ──────────────────────────────────────────────────
create table if not exists public.orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id     uuid not null references public.orgs on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  role       text not null check (role in ('admin','auditor','member')),
  team       text,                        -- rótulo: "noc1", "noc3"
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Helper SECURITY DEFINER: evita recursão de RLS ao checar pertencimento à org.
create or replace function public.is_org_member(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid()
      and (p_roles is null or m.role = any(p_roles))
  );
$$;

-- ─── Dados pessoais de host (sync opt-in; dono = user_id) ────────────────────
create table if not exists public.host_groups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  name       text not null,
  color      text,
  sort_order int default 0,
  updated_at timestamptz not null default now(),
  rev        bigint not null default 1,
  deleted    boolean not null default false
);

create table if not exists public.credentials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles on delete cascade,
  name          text not null,
  username      text,
  auth_method   text,
  secret_cipher text,                     -- cifrado no cliente (cego p/ servidor)
  secret_nonce  text,
  updated_at    timestamptz not null default now(),
  rev           bigint not null default 1,
  deleted       boolean not null default false
);

create table if not exists public.hosts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles on delete cascade,
  group_id      uuid references public.host_groups on delete set null,
  name          text not null,
  host          text not null,
  port          int not null default 22,
  username      text,
  protocol      text check (protocol in ('ssh','rdp','vnc')) default 'ssh',
  auth_method   text,
  color         text,
  tags          text[],
  notes         text,
  detected_os   text,
  icon_override text,
  credential_id uuid references public.credentials on delete set null,
  secret_cipher text,                     -- cifrado no cliente
  secret_nonce  text,
  updated_at    timestamptz not null default now(),
  rev           bigint not null default 1,
  deleted       boolean not null default false
);

create table if not exists public.ssh_keys (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  name       text not null,
  comment    text,
  key_cipher text,                        -- material da chave cifrado no cliente
  key_nonce  text,
  updated_at timestamptz not null default now(),
  rev        bigint not null default 1,
  deleted    boolean not null default false
);

create table if not exists public.snippets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles on delete cascade,
  name         text not null,
  command      text not null,
  device_types text[],                    -- ['huawei','cisco']; vazio = global
  is_global    boolean not null default false,
  sort_order   int default 0,
  updated_at   timestamptz not null default now(),
  rev          bigint not null default 1,
  deleted      boolean not null default false
);

-- ─── Auditoria (propósito da conta empresarial; append-only via RLS) ─────────
create table if not exists public.audit_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  type        text,
  server_name text,
  host        text,
  username    text,
  duration    int,
  message     text,
  occurred_at timestamptz not null default now()
);

create table if not exists public.session_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  server_name text,
  host        text,
  started_at  timestamptz,
  ended_at    timestamptz,
  log_ref     text                        -- ponteiro p/ object storage
);

-- ─── Índices para pulls de sync e leitura de auditoria ───────────────────────
create index if not exists idx_hosts_user_updated       on public.hosts (user_id, updated_at);
create index if not exists idx_credentials_user_updated  on public.credentials (user_id, updated_at);
create index if not exists idx_hostgroups_user_updated   on public.host_groups (user_id, updated_at);
create index if not exists idx_sshkeys_user_updated      on public.ssh_keys (user_id, updated_at);
create index if not exists idx_snippets_user_updated     on public.snippets (user_id, updated_at);
create index if not exists idx_audit_org_occurred        on public.audit_events (org_id, occurred_at);
create index if not exists idx_slog_org_started          on public.session_logs (org_id, started_at);
