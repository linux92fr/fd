-- Newsletter signup abuse protection and consent evidence (Preview first).
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_source varchar(32),
  ADD COLUMN IF NOT EXISTS consent_version varchar(32);

CREATE TABLE IF NOT EXISTS public.newsletter_signup_rate_limits (
  ip_hash char(64) PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1,
  CONSTRAINT newsletter_signup_rate_limits_attempts_check CHECK (attempts >= 1)
);

CREATE INDEX IF NOT EXISTS newsletter_signup_rate_limits_window_idx
  ON public.newsletter_signup_rate_limits (window_started_at);
