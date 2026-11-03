-- MOK: integrity, ownership and accounting safeguards.
-- Billing policy retained: full settlement required; overpayments become credits.

ALTER TABLE public.tenants ADD CONSTRAINT tenants_owner_id_id_key UNIQUE (owner_id, id);
ALTER TABLE public.periods ADD CONSTRAINT periods_owner_id_id_key UNIQUE (owner_id, id);
ALTER TABLE public.bills ADD CONSTRAINT bills_owner_id_id_key UNIQUE (owner_id, id);

ALTER TABLE public.readings ALTER COLUMN period_id SET NOT NULL, ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.bills ALTER COLUMN period_id SET NOT NULL, ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.payments ALTER COLUMN bill_id SET NOT NULL;
ALTER TABLE public.emergency_fund ALTER COLUMN period_id SET NOT NULL;

ALTER TABLE public.readings DROP CONSTRAINT readings_period_id_fkey;
ALTER TABLE public.readings DROP CONSTRAINT readings_tenant_id_fkey;
ALTER TABLE public.bills DROP CONSTRAINT bills_period_id_fkey;
ALTER TABLE public.bills DROP CONSTRAINT bills_tenant_id_fkey;
ALTER TABLE public.payments DROP CONSTRAINT payments_bill_id_fkey;
ALTER TABLE public.emergency_fund DROP CONSTRAINT emergency_fund_period_id_fkey;

ALTER TABLE public.readings
  ADD CONSTRAINT readings_period_owner_fkey FOREIGN KEY (period_id, owner_id) REFERENCES public.periods(id, owner_id) ON DELETE CASCADE,
  ADD CONSTRAINT readings_tenant_owner_fkey FOREIGN KEY (tenant_id, owner_id) REFERENCES public.tenants(id, owner_id);
ALTER TABLE public.bills
  ADD CONSTRAINT bills_period_owner_fkey FOREIGN KEY (period_id, owner_id) REFERENCES public.periods(id, owner_id) ON DELETE CASCADE,
  ADD CONSTRAINT bills_tenant_owner_fkey FOREIGN KEY (tenant_id, owner_id) REFERENCES public.tenants(id, owner_id);
ALTER TABLE public.payments
  ADD CONSTRAINT payments_bill_owner_fkey FOREIGN KEY (bill_id, owner_id) REFERENCES public.bills(id, owner_id) ON DELETE CASCADE;
ALTER TABLE public.emergency_fund
  ADD CONSTRAINT emergency_fund_period_owner_fkey FOREIGN KEY (period_id, owner_id) REFERENCES public.periods(id, owner_id) ON DELETE CASCADE;

ALTER TABLE public.emergency_fund ADD CONSTRAINT emergency_fund_owner_period_key UNIQUE (owner_id, period_id);

CREATE INDEX IF NOT EXISTS readings_tenant_owner_idx ON public.readings (tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS bills_tenant_owner_idx ON public.bills (tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS payments_bill_owner_idx ON public.payments (bill_id, owner_id);
CREATE INDEX IF NOT EXISTS emergency_fund_period_owner_idx ON public.emergency_fund (period_id, owner_id);

ALTER TABLE public.tenants ADD CONSTRAINT tenants_name_not_blank CHECK (length(btrim(name)) > 0);
ALTER TABLE public.periods
  ADD CONSTRAINT periods_kwh_price_nonnegative CHECK (kwh_price >= 0),
  ADD CONSTRAINT periods_main_index_nonnegative CHECK (main_index IS NULL OR main_index >= 0),
  ADD CONSTRAINT periods_main_amount_nonnegative CHECK (main_amount IS NULL OR main_amount >= 0);
ALTER TABLE public.readings ADD CONSTRAINT readings_indexes_nonnegative CHECK (prev_index >= 0 AND curr_index >= prev_index);
ALTER TABLE public.bills ADD CONSTRAINT bills_amount_components_nonnegative CHECK (consumption IS NULL OR consumption >= 0) NOT VALID;
ALTER TABLE public.bills
  ADD CONSTRAINT bills_conso_amount_nonnegative CHECK (conso_amount IS NULL OR conso_amount >= 0),
  ADD CONSTRAINT bills_residual_share_nonnegative CHECK (residual_share IS NULL OR residual_share >= 0),
  ADD CONSTRAINT bills_penalty_nonnegative CHECK (penalty IS NULL OR penalty >= 0);
ALTER TABLE public.emergency_fund ADD CONSTRAINT emergency_fund_amount_nonnegative CHECK (amount >= 0);

CREATE OR REPLACE FUNCTION public.enforce_mok_payment_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_total numeric; v_bill_owner uuid; v_paid numeric; v_due numeric;
BEGIN
  SELECT b.total, b.owner_id INTO v_total, v_bill_owner
  FROM public.bills AS b WHERE b.id = NEW.bill_id FOR UPDATE;
  IF NOT FOUND OR v_bill_owner IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'Facture introuvable ou inaccessible.' USING ERRCODE = '23503';
  END IF;
  SELECT COALESCE(sum(p.amount), 0) INTO v_paid FROM public.payments AS p WHERE p.bill_id = NEW.bill_id;
  v_due := v_total - v_paid;
  IF v_due <= 0 THEN RAISE EXCEPTION 'Cette facture est déjà réglée.' USING ERRCODE = '23514'; END IF;
  IF NEW.amount < v_due THEN RAISE EXCEPTION 'Le paiement doit couvrir le solde dû (%).', v_due USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payments_enforce_integrity BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_mok_payment_integrity();

CREATE OR REPLACE FUNCTION public.prevent_mok_paid_bill_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.bill_id = OLD.id) THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Une facture ayant des paiements ne peut pas être supprimée.'; END IF;
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Une facture déjà payée ne peut plus être modifiée.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bills_protect_paid_records BEFORE UPDATE OR DELETE ON public.bills
FOR EACH ROW EXECUTE FUNCTION public.prevent_mok_paid_bill_mutation();

CREATE OR REPLACE FUNCTION public.prevent_mok_payment_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Un paiement enregistré est définitif et ne peut pas être modifié ou supprimé.';
END;
$$;
CREATE TRIGGER payments_immutable BEFORE UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.prevent_mok_payment_mutation();

CREATE OR REPLACE FUNCTION public.save_mok_period_main_details(
  p_period_id uuid, p_main_index numeric, p_main_amount numeric, p_residual numeric, p_fund_amount numeric
)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Authentification requise.'; END IF;
  IF p_main_index < 0 OR p_main_amount < 0 OR p_fund_amount < 0 THEN
    RAISE EXCEPTION 'Les index et montants doivent être positifs ou nuls.';
  END IF;
  UPDATE public.periods SET main_index = p_main_index, main_amount = p_main_amount, residual = p_residual
  WHERE id = p_period_id AND owner_id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Période introuvable ou inaccessible.'; END IF;
  INSERT INTO public.emergency_fund (owner_id, period_id, amount)
  VALUES (v_owner, p_period_id, p_fund_amount)
  ON CONFLICT (owner_id, period_id)
  DO UPDATE SET amount = EXCLUDED.amount, created_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_mok_period_main_details(uuid, numeric, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_mok_period_main_details(uuid, numeric, numeric, numeric, numeric) TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','periods','readings','bills','payments','emergency_fund'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS own ON public.%I', t);
    EXECUTE format('CREATE POLICY own_select ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id)', t);
    IF t <> 'payments' THEN
      EXECUTE format('CREATE POLICY own_insert ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id)', t);
      EXECUTE format('CREATE POLICY own_update ON public.%I FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = owner_id) WITH CHECK ((SELECT auth.uid()) = owner_id)', t);
    ELSE
      EXECUTE 'CREATE POLICY own_insert ON public.payments FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id)';
    END IF;
  END LOOP;
END;
$$;
