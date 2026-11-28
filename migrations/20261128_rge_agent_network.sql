CREATE TABLE IF NOT EXISTS rge_network_members (
 user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 display_name text NOT NULL, brokerage text NOT NULL, country text NOT NULL, region text NOT NULL, city text NOT NULL,
 active boolean NOT NULL DEFAULT true, consent_version text NOT NULL, consent_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rge_network_referrals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sender_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 sender_name text NOT NULL, recipient_name text NOT NULL, description text NOT NULL,
 proposed_percent numeric(5,2) CHECK (proposed_percent BETWEEN 0 AND 100),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
 created_at timestamptz NOT NULL DEFAULT now(), responded_at timestamptz, sender_seen_at timestamptz,
 CHECK (sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS rge_network_referrals_sender_idx ON rge_network_referrals(sender_id,created_at DESC);
CREATE INDEX IF NOT EXISTS rge_network_referrals_recipient_idx ON rge_network_referrals(recipient_id,created_at DESC);
