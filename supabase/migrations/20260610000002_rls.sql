-- CorpSSH — Row-Level Security. O coração do modelo de acesso.
-- Sem policy explícita = acesso negado (RLS é deny-by-default). É assim que as
-- tabelas de auditoria ficam append-only: não há policy de UPDATE/DELETE nelas.

alter table public.profiles     enable row level security;
alter table public.orgs         enable row level security;
alter table public.org_members  enable row level security;
alter table public.host_groups  enable row level security;
alter table public.credentials  enable row level security;
alter table public.hosts        enable row level security;
alter table public.ssh_keys     enable row level security;
alter table public.snippets     enable row level security;
alter table public.audit_events enable row level security;
alter table public.session_logs enable row level security;

-- ─── profiles: cada um só enxerga/edita o próprio ────────────────────────────
create policy "profile self" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- ─── Dados pessoais: isolamento total por dono (todas as operações) ──────────
create policy "hosts owner"       on public.hosts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "host_groups owner" on public.host_groups
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "credentials owner" on public.credentials
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ssh_keys owner"    on public.ssh_keys
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "snippets owner"    on public.snippets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── orgs: dono administra; membros leem ─────────────────────────────────────
create policy "orgs read" on public.orgs
  for select using (owner_id = auth.uid() or public.is_org_member(id, null));
create policy "orgs owner write" on public.orgs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ─── org_members: admin/dono administram; usuário lê a própria associação ────
create policy "members read" on public.org_members
  for select using (
    user_id = auth.uid()
    or public.is_org_member(org_id, array['admin','auditor'])
  );
create policy "members admin write" on public.org_members
  for all using (
    public.is_org_member(org_id, array['admin'])
    or exists (select 1 from public.orgs o where o.id = org_id and o.owner_id = auth.uid())
  ) with check (
    public.is_org_member(org_id, array['admin'])
    or exists (select 1 from public.orgs o where o.id = org_id and o.owner_id = auth.uid())
  );

-- ─── Auditoria (append-only): membro INSERT do próprio; staff SELECT ─────────
-- SEM policy de UPDATE/DELETE → ninguém altera/apaga pela aplicação.
create policy "audit insert own" on public.audit_events
  for insert with check (user_id = auth.uid() and public.is_org_member(org_id, null));
create policy "audit read staff" on public.audit_events
  for select using (
    user_id = auth.uid()
    or public.is_org_member(org_id, array['admin','auditor'])
  );

create policy "slog insert own" on public.session_logs
  for insert with check (user_id = auth.uid() and public.is_org_member(org_id, null));
create policy "slog read staff" on public.session_logs
  for select using (
    user_id = auth.uid()
    or public.is_org_member(org_id, array['admin','auditor'])
  );
