-- Account self-service deletion request (pending; no hard-delete)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.deletion_requested_at IS
  'Set when the user requests account deletion; access may be disabled; retention per privacy policy.';
