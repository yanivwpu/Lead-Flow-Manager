CREATE TABLE IF NOT EXISTS agent_neighborhood_pilot (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  published boolean NOT NULL DEFAULT false
);
