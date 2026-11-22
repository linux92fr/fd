-- Bring the production PostgreSQL schema in line with the audited preview schema.
-- Prepared and validated on a temporary Neon branch cloned from production.
-- Safe for existing production data: only additive columns/tables/indexes/constraints.
-- Review and apply through the controlled deployment process; do not run manually in advance.

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_source varchar(32),
  ADD COLUMN IF NOT EXISTS consent_version varchar(32);

CREATE TABLE IF NOT EXISTS public.contact_rate_limits (
  ip_hash char(64) PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1,
  CONSTRAINT contact_rate_limits_attempts_check CHECK (attempts >= 1)
);
CREATE INDEX IF NOT EXISTS contact_rate_limits_window_idx
  ON public.contact_rate_limits (window_started_at);

CREATE TABLE IF NOT EXISTS public.newsletter_signup_rate_limits (
  ip_hash char(64) PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1,
  CONSTRAINT newsletter_signup_rate_limits_attempts_check CHECK (attempts >= 1)
);
CREATE INDEX IF NOT EXISTS newsletter_signup_rate_limits_window_idx
  ON public.newsletter_signup_rate_limits (window_started_at);

CREATE TABLE IF NOT EXISTS public.neon_auth_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  status text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT neon_auth_webhook_events_status_check CHECK (status IN ('processing', 'sent'))
);

CREATE TABLE IF NOT EXISTS public.newsletter_campaign_recipients (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id bigint NOT NULL,
  subscriber_id bigint NOT NULL,
  email varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT newsletter_campaign_recipients_status_check
    CHECK (status IN ('pending','sending','sent','failed','unknown','skipped')),
  CONSTRAINT newsletter_campaign_recipients_campaign_id_subscriber_id_key
    UNIQUE (campaign_id, subscriber_id),
  CONSTRAINT newsletter_campaign_recipients_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES public.newsletter_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT newsletter_campaign_recipients_subscriber_id_fkey
    FOREIGN KEY (subscriber_id) REFERENCES public.newsletter_subscribers(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS newsletter_campaign_recipients_queue_idx
  ON public.newsletter_campaign_recipients (campaign_id, status, id);

CREATE TABLE IF NOT EXISTS public.private_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT private_messages_body_check CHECK (char_length(body) >= 1 AND char_length(body) <= 5000),
  CONSTRAINT private_messages_distinct_users CHECK (sender_id <> recipient_id),
  CONSTRAINT private_messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  CONSTRAINT private_messages_recipient_id_fkey
    FOREIGN KEY (recipient_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS private_messages_conversation_idx
  ON public.private_messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS private_messages_inbox_idx
  ON public.private_messages (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS private_messages_recipient_unread_idx
  ON public.private_messages (recipient_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.site_user_access (
  user_id uuid PRIMARY KEY,
  role text NOT NULL DEFAULT 'employee',
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_user_access_role_check
    CHECK (role IN ('admin','admin_delegate','editor','employee')),
  CONSTRAINT site_user_access_status_check
    CHECK (status IN ('pending','active','suspended')),
  CONSTRAINT site_user_access_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  CONSTRAINT site_user_access_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES neon_auth."user"(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS site_user_access_status_idx
  ON public.site_user_access (status, updated_at DESC);
