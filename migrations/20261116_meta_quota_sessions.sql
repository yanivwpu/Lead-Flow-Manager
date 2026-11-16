-- Additive, forward-only shadow ledger. Never backfill or reset legacy usage.
BEGIN;
CREATE TABLE meta_quota_rollout (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tracking_started_at timestamp NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  enforce_from timestamp,
  reviewed_at timestamp,
  CHECK (enforce_from IS NULL OR (reviewed_at IS NOT NULL AND enforce_from >= tracking_started_at + interval '24 hours'))
);
CREATE TABLE meta_quota_sessions (
  id bigserial PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp','facebook','instagram')),
  customer_key text NOT NULL,
  started_at timestamp NOT NULL,
  expires_at timestamp NOT NULL,
  period_start timestamp NOT NULL,
  CHECK (expires_at = started_at + interval '24 hours')
);
CREATE INDEX meta_quota_customer_window ON meta_quota_sessions(user_id, channel, customer_key, started_at DESC);
CREATE INDEX meta_quota_period ON meta_quota_sessions(user_id, period_start);
CREATE TABLE meta_quota_events (
  -- No FK to messages: deleting a message must not refund usage or allow replay.
  message_id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_message_id text,
  session_id bigint NOT NULL REFERENCES meta_quota_sessions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX meta_quota_provider_event ON meta_quota_events(user_id, external_message_id) WHERE external_message_id IS NOT NULL;

-- UTC, half-open monthly periods. Annual billing windows are subdivided monthly.
CREATE FUNCTION meta_quota_period_start(bstart timestamp, bend timestamp, at_time timestamp)
RETURNS timestamp LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN bstart <= at_time AND at_time < bend AND bstart < bend
    THEN (SELECT max(bstart + make_interval(months => n))
      FROM generate_series(0, (extract(year FROM age(at_time,bstart))::int * 12 + extract(month FROM age(at_time,bstart))::int + 1)) n
      WHERE bstart + make_interval(months => n) <= at_time)
    ELSE date_trunc('month', at_time) END
$$;

CREATE FUNCTION record_meta_quota_inbound() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ch text; identity_value text; customer text; sid bigint;
  accepted_at timestamp; ps timestamp; bs timestamp; be timestamp;
BEGIN
  IF NEW.direction <> 'inbound' OR NEW.status = 'failed' THEN RETURN NEW; END IF;
  SELECT c.channel, CASE c.channel
    WHEN 'whatsapp' THEN regexp_replace(coalesce(nullif(p.whatsapp_id,''),p.phone), '[^0-9]', '', 'g')
    WHEN 'facebook' THEN p.facebook_id WHEN 'instagram' THEN p.instagram_id END
    INTO ch, identity_value FROM conversations c JOIN contacts p ON p.id = c.contact_id
    WHERE c.id = NEW.conversation_id AND c.user_id = NEW.user_id
      AND p.user_id = NEW.user_id AND p.id = NEW.contact_id;
  IF ch IS NULL OR ch NOT IN ('whatsapp','facebook','instagram') THEN RETURN NEW; END IF;
  -- Never substitute a thread ID: this would double-count across WhatsApp numbers.
  IF coalesce(identity_value,'') = '' THEN RAISE EXCEPTION 'quota_customer_identity_missing'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('meta-quota:' || NEW.user_id, 0));
  IF EXISTS (SELECT 1 FROM meta_quota_events WHERE message_id = NEW.id OR (user_id = NEW.user_id AND external_message_id = NEW.external_message_id)) THEN RETURN NEW; END IF;
  -- Acceptance time, not untrusted provider timestamps; acquired AFTER serialization.
  accepted_at := clock_timestamp() AT TIME ZONE 'UTC';
  INSERT INTO meta_quota_rollout(user_id, tracking_started_at) VALUES(NEW.user_id, accepted_at) ON CONFLICT DO NOTHING;
  SELECT current_period_start, current_period_end INTO bs,be FROM users WHERE id = NEW.user_id;
  ps := meta_quota_period_start(bs,be,accepted_at);
  customer := encode(sha256(convert_to(NEW.user_id || ':' || ch || ':' || identity_value,'UTF8')),'hex');
  SELECT id INTO sid FROM meta_quota_sessions WHERE user_id = NEW.user_id AND channel = ch
    AND customer_key = customer AND started_at <= accepted_at AND expires_at > accepted_at
    ORDER BY started_at DESC LIMIT 1;
  IF sid IS NULL THEN
    INSERT INTO meta_quota_sessions(user_id,channel,customer_key,started_at,expires_at,period_start)
      VALUES(NEW.user_id,ch,customer,accepted_at,accepted_at + interval '24 hours',ps) RETURNING id INTO sid;
  END IF;
  INSERT INTO meta_quota_events(message_id,user_id,external_message_id,session_id) VALUES(NEW.id,NEW.user_id,NEW.external_message_id,sid);
  RETURN NEW;
END $$;
CREATE TRIGGER meta_quota_inbound AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION record_meta_quota_inbound();
COMMIT;
