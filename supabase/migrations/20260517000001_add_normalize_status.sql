-- Track background normalize status per document.
-- pending: queued or in progress, done: normalized_text populated, failed: normalize errored.
alter table user_documents
  add column normalize_status text
    check (normalize_status in ('pending', 'done', 'failed'))
    default 'pending'
    not null;

-- Backfill: existing rows with non-empty normalized_text are 'done',
-- the rest are 'failed' so users can explicitly retry.
update user_documents
  set normalize_status = case
    when normalized_text is not null and length(trim(normalized_text)) > 0 then 'done'
    else 'failed'
  end;

create index user_documents_normalize_status_idx
  on user_documents (user_id, normalize_status);
