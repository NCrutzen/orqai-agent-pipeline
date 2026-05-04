-- Phase 67 (D-07, R-05): separate iController-tagging outcome from resolver outcome.
-- email_labels.status currently mixes both concerns. Add a dedicated column for
-- the side-effect dispatch result + a numeric msg_id placeholder so future re-tag
-- runs can skip the search-and-click step.

alter table debtor.email_labels
  add column if not exists icontroller_tag_status text
    check (icontroller_tag_status in (
      'pending',
      'tagged',
      'skipped_dry_run',
      'skipped_unconfigured',
      'failed'
    )) default 'pending';

alter table debtor.email_labels
  add column if not exists icontroller_msg_id text;

create index if not exists email_labels_icontroller_tag_status_idx
  on debtor.email_labels (icontroller_tag_status, created_at desc)
  where icontroller_tag_status in ('pending', 'failed');
