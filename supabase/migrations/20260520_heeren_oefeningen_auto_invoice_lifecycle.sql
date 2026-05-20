-- Lifecycle-timestamps + invoice traceability voor Fase 2 autoInvoice flow.
-- Fase 2 doorloopt nu: prospect (createInvoiceDraft) → open (saveAsConfirm)
-- → invoice OPEN (createInvoice) → invoice PROCESSING (process).

ALTER TABLE public.heeren_oefeningen_staging
  ADD COLUMN IF NOT EXISTS confirmed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS invoiced_at          timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_uuid         text,
  ADD COLUMN IF NOT EXISTS invoice_url          text,
  ADD COLUMN IF NOT EXISTS final_invoice_status text;

COMMENT ON COLUMN public.heeren_oefeningen_staging.confirmed_at IS
  'Moment dat NXT order status van prospect → open is gezet (vm.saveAsConfirm).';
COMMENT ON COLUMN public.heeren_oefeningen_staging.invoiced_at IS
  'Moment dat de invoice is aangemaakt vanuit de order (vm.createInvoice). Invoice status = OPEN.';
COMMENT ON COLUMN public.heeren_oefeningen_staging.invoice_processed_at IS
  'Moment dat de invoice is gefinaliseerd via Process (vm.process). Invoice status = PROCESSING.';
COMMENT ON COLUMN public.heeren_oefeningen_staging.invoice_uuid IS
  'NXT invoice UUID uit de detail-URL na createInvoice.';
COMMENT ON COLUMN public.heeren_oefeningen_staging.invoice_url IS
  'Full URL naar de invoice detail page in NXT — voor traceerbaarheid.';
COMMENT ON COLUMN public.heeren_oefeningen_staging.final_invoice_status IS
  'Laatst geobserveerde invoice status (OPEN/PROCESSING/...) — debug bij gedeeltelijke flow.';
