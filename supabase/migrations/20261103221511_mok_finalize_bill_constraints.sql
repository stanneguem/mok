-- Complete required billing fields and cover composite foreign-key lookups.
ALTER TABLE public.bills
  ALTER COLUMN consumption SET NOT NULL,
  ALTER COLUMN conso_amount SET NOT NULL,
  ALTER COLUMN residual_share SET NOT NULL,
  ALTER COLUMN carry SET NOT NULL,
  ALTER COLUMN penalty SET NOT NULL,
  ALTER COLUMN total SET NOT NULL,
  ALTER COLUMN due_on SET NOT NULL;

CREATE INDEX IF NOT EXISTS bills_period_owner_idx ON public.bills (period_id, owner_id);
CREATE INDEX IF NOT EXISTS readings_period_owner_idx ON public.readings (period_id, owner_id);
