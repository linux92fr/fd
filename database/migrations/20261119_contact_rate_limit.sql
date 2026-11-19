-- Public contact form abuse protection (Preview first).
CREATE TABLE IF NOT EXISTS public.contact_rate_limits (
  ip_hash char(64) PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1,
  CONSTRAINT contact_rate_limits_attempts_check CHECK (attempts >= 1)
);

CREATE INDEX IF NOT EXISTS contact_rate_limits_window_idx
  ON public.contact_rate_limits (window_started_at);
