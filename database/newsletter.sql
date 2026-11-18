-- Newsletter module. Run once in the Neon SQL Editor before deploying.
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 email VARCHAR(254) NOT NULL UNIQUE,
 status VARCHAR(16) NOT NULL DEFAULT 'subscribed' CHECK(status IN ('subscribed','unsubscribed')),
 unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 unsubscribed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS newsletter_subscribers_active_idx ON public.newsletter_subscribers(subscribed_at DESC) WHERE status='subscribed';
CREATE TABLE IF NOT EXISTS public.newsletter_campaigns (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 subject VARCHAR(180) NOT NULL,
 preview_text VARCHAR(240) NOT NULL DEFAULT '',
 html_content TEXT NOT NULL DEFAULT '',
 status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sending','sent','partial')),
 recipient_count INTEGER NOT NULL DEFAULT 0,
 sent_count INTEGER NOT NULL DEFAULT 0,
 failed_count INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS newsletter_campaigns_updated_idx ON public.newsletter_campaigns(updated_at DESC);
