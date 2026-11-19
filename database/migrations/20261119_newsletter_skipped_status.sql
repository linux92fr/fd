ALTER TABLE public.newsletter_campaign_recipients DROP CONSTRAINT IF EXISTS newsletter_campaign_recipients_status_check;
ALTER TABLE public.newsletter_campaign_recipients ADD CONSTRAINT newsletter_campaign_recipients_status_check CHECK (status IN ('pending','sending','sent','failed','unknown','skipped'));
