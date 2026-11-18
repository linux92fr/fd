-- Track each campaign recipient independently to support safe recovery.
CREATE TABLE IF NOT EXISTS public.newsletter_campaign_recipients (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 campaign_id BIGINT NOT NULL REFERENCES public.newsletter_campaigns(id) ON DELETE CASCADE,
 subscriber_id BIGINT NOT NULL REFERENCES public.newsletter_subscribers(id) ON DELETE RESTRICT,
 email VARCHAR(254) NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending'
   CHECK (status IN ('pending','sending','sent','failed','unknown')),
 attempts INTEGER NOT NULL DEFAULT 0,
 last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 sent_at TIMESTAMPTZ,
 UNIQUE (campaign_id, subscriber_id)
);
CREATE INDEX IF NOT EXISTS newsletter_campaign_recipients_queue_idx
 ON public.newsletter_campaign_recipients(campaign_id, status, id);
