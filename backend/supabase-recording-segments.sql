alter table public.recordings
  add column if not exists segment_number integer,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists duration_seconds integer,
  add column if not exists client_segment_id text,
  add column if not exists upload_status text default 'UPLOADED',
  add column if not exists created_at timestamptz default now();

with numbered_recordings as (
  select
    id,
    row_number() over (
      partition by applicant_assessment_id
      order by uploaded_at nulls last, id
    ) as generated_segment_number
  from public.recordings
)
update public.recordings r
set
  segment_number = coalesce(r.segment_number, n.generated_segment_number),
  started_at = coalesce(r.started_at, r.uploaded_at),
  ended_at = coalesce(r.ended_at, r.uploaded_at),
  duration_seconds = coalesce(r.duration_seconds, r.duration),
  upload_status = coalesce(r.upload_status, 'UPLOADED'),
  created_at = coalesce(r.created_at, r.uploaded_at, now())
from numbered_recordings n
where r.id = n.id;

alter table public.recordings
  alter column segment_number set not null,
  alter column upload_status set not null;

create unique index if not exists recordings_assessment_segment_unique
  on public.recordings (applicant_assessment_id, segment_number);

create unique index if not exists recordings_assessment_client_segment_unique
  on public.recordings (applicant_assessment_id, client_segment_id)
  where client_segment_id is not null;

create index if not exists recordings_assessment_segment_order_idx
  on public.recordings (applicant_assessment_id, segment_number, uploaded_at);

create table if not exists public.recording_events (
  id text primary key,
  applicant_assessment_id text not null,
  event_type text not null,
  segment_number integer,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists recording_events_assessment_time_idx
  on public.recording_events (applicant_assessment_id, occurred_at);
