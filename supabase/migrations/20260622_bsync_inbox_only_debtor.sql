-- Behavior-sync volume fix (2026-06-22): track ONLY the inbox for the debtor
-- mailboxes.
--
-- Root cause: swarmBehaviorSyncMailbox bootstraps EVERY tracked folder in one
-- Inngest invocation (300s ceiling). debiteuren@smeba.nl has 127 customer
-- folders + ~40k mail; the full bootstrap exceeds 300s -> FUNCTION_INVOCATION_
-- TIMEOUT -> the per-folder delta token never advances -> permanent re-walk ->
-- operator-correction capture is down (~88 timeouts/3d observed live).
--
-- Operators correct AI: labels while mail sits in the inbox, so inbox-only delta
-- polling keeps capture working without reading mailbox history. A move OUT of
-- the inbox is still observed as `left_to_untracked` from the inbox side; a drag
-- BACK into the inbox is re-seen via the inbox delta and re-tracked.
--
-- The worker's new-folder default (tracked = bucket = 'inbox') makes this
-- generic for any future folder/swarm. This migration only flips EXISTING rows
-- (the every-tick refresh uses ignoreDuplicates and won't change them).
--
-- Scope: debtor mailboxes only. sales verkoop@smeba.nl is small (~1.8k) and
-- healthy -- intentionally left untouched during this hotfix.

-- 1. Untrack every non-inbox folder for the 4 debtor mailboxes (127 customer
--    folders + afgehandeld + sent on smeba, plus the other three boxes).
UPDATE public.outlook_folder_map
   SET tracked = false
 WHERE mailbox IN (
         'debiteuren@smeba.nl',
         'debiteuren@berki.nl',
         'debiteuren@smeba-fire.be',
         'administratie@fire-control.nl'
       )
   AND bucket <> 'inbox';

-- 2. Drop the stale delta tokens for those now-untracked folders so they stop
--    carrying half-walked sync state. The inbox token is preserved (bucket =
--    'inbox' is excluded). A future re-track bootstraps the folder cleanly.
DELETE FROM public.outlook_delta_tokens
 WHERE folder_id IN (
         SELECT folder_id
           FROM public.outlook_folder_map
          WHERE mailbox IN (
                  'debiteuren@smeba.nl',
                  'debiteuren@berki.nl',
                  'debiteuren@smeba-fire.be',
                  'administratie@fire-control.nl'
                )
            AND bucket <> 'inbox'
       );
