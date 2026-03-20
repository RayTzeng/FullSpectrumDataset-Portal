create extension if not exists pgcrypto;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dataset_name text not null,
  task_name text not null,
  task_definition text not null,
  payload jsonb not null
);

create index if not exists submissions_dataset_task_idx
  on public.submissions (dataset_name, task_name, created_at desc);
