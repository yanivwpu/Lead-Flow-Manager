-- Preparation only. Not a startup migration. Apply with the approved store cutover.
CREATE TABLE IF NOT EXISTS public.shopify_store_assignments (
  shop text PRIMARY KEY,
  source_user_id varchar NOT NULL REFERENCES public.users(id),
  target_user_id varchar NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(source_user_id<>target_user_id)
);
REVOKE ALL ON public.shopify_store_assignments FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.enforce_shopify_store_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.shopify_shop IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.shopify_store_assignments a
    WHERE a.shop=NEW.shopify_shop AND a.target_user_id<>NEW.id
  ) THEN RAISE EXCEPTION 'SHOPIFY_STORE_ASSIGNED_ELSEWHERE'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_shopify_store_assignment ON public.users;
CREATE TRIGGER enforce_shopify_store_assignment BEFORE INSERT OR UPDATE OF shopify_shop ON public.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_shopify_store_assignment();
