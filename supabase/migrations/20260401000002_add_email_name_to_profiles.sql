alter table user_profiles
  add column if not exists email text,
  add column if not exists name  text;
