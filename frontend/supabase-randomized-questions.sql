alter table questions
  add column if not exists difficulty text default 'MEDIUM';

alter table questions
  drop constraint if exists questions_difficulty_check;

alter table questions
  add constraint questions_difficulty_check
  check (difficulty in ('EASY', 'MEDIUM', 'HARD'));

create table if not exists assessment_question_config (
  id text primary key,
  assessment_id text not null,
  easy_count integer default 0,
  medium_count integer default 0,
  hard_count integer default 0,
  randomize_order boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists applicant_assessment_questions (
  id text primary key,
  applicant_assessment_id text not null,
  question_id text not null,
  display_order integer not null,
  points integer default 1,
  difficulty text,
  created_at timestamptz default now()
);

create index if not exists assessment_question_config_assessment_id_idx
  on assessment_question_config (assessment_id);

create index if not exists applicant_assessment_questions_attempt_idx
  on applicant_assessment_questions (applicant_assessment_id);
