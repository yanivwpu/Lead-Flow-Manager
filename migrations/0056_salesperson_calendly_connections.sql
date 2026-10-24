-- Sales Portal Calendly connections are scoped to salespeople, not customer workspaces.
-- Never expose the encrypted PAT via public salespeople or demo APIs.
CREATE TABLE IF NOT EXISTS salesperson_calendly_connections (
  salesperson_id varchar PRIMARY KEY REFERENCES salespeople(id) ON DELETE CASCADE,
  encrypted_access_token text NOT NULL,
  calendly_user_uri text,
  calendly_scheduling_url text,
  enabled boolean NOT NULL DEFAULT true,
  last_poll_at timestamp,
  last_error text,
  updated_at timestamp NOT NULL DEFAULT NOW()
);
