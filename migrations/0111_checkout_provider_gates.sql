-- Apply only in a separately approved checkout rollout, after 0110. No startup mutation.
CREATE TABLE IF NOT EXISTS checkout_provider_gates (
 user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 shop text NOT NULL,
 next_request_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,shop)
);
