-- =====================================================================
-- Schéma Supabase pour l'agent Maya — revue-audit-energetique
-- Reconstruit depuis api/maya-sync.js (2026-06-02).
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query > Run.
-- Accès uniquement via la service_role key (RLS activé, deny-all public).
-- =====================================================================

-- ── 1. Feedbacks / commentaires faits à Maya ─────────────────────────
create table if not exists public.maya_feedbacks (
  id                text primary key,
  client_id         text not null default 'default',
  scope             text,                -- 'global' | 'line'
  key_field         text,
  audit_value       text,
  vt_value          text,
  conformity_status text,
  commentaire       text,
  category          text,                -- pattern | rule | prompt | other
  feedback_text     text,
  status            text default 'pending',  -- pending | applied | permanent | archived
  snapshot          jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create index if not exists idx_maya_feedbacks_client_created
  on public.maya_feedbacks (client_id, created_at desc);

-- ── 2. Rapports / historique des analyses ────────────────────────────
create table if not exists public.maya_reports (
  id              text primary key,
  client_id       text not null default 'default',
  title           text,
  audit_filename  text,
  vt_filename     text,
  score           integer,
  total           integer,
  conformes       integer,
  oranges         integer,
  rouges          integer,
  manquants       integer,
  export_file     text,
  results_json    jsonb,
  metadata        jsonb,
  date_fr         text,
  time_fr         text,
  created_at      timestamptz default now()
);
create index if not exists idx_maya_reports_client_created
  on public.maya_reports (client_id, created_at desc);

-- ── 3. Correspondances (lexique Fix D, validées par l'utilisateur) ───
create table if not exists public.maya_correspondences (
  id              text primary key,
  client_id       text not null default 'default',
  scope_key       text not null,
  audit_norm      text not null,
  vt_norm         text not null,
  audit_raw       text,
  vt_raw          text,
  instance_labels jsonb default '[]'::jsonb,
  is_singleton    boolean default false,
  occurrences     integer default 1,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  deleted_at      timestamptz,            -- soft-delete (P0-1 anti-résurrection)
  schema_version  integer default 1
);
create index if not exists idx_maya_corr_client_active
  on public.maya_correspondences (client_id, updated_at desc)
  where deleted_at is null;

-- ── 4. Sécurité : RLS activé, aucune policy publique ─────────────────
-- La service_role key (utilisée côté serveur par /api/maya-sync) bypass RLS.
-- L'anon key (public) n'a donc AUCUN accès à ces tables.
alter table public.maya_feedbacks       enable row level security;
alter table public.maya_reports         enable row level security;
alter table public.maya_correspondences enable row level security;
