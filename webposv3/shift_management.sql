-- =============================================================================
-- WebPOS V3 — Shift Management Migration
-- Run this in Supabase SQL Editor AFTER database_setup.sql has been applied.
-- Safe to run multiple times (all statements are idempotent).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) SHIFTS table
--    One row per cashier work session.
--    status flow:  open → closed → remitted
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shifts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id         uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  cashier_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- Timing
  opened_at         timestamptz NOT NULL DEFAULT now(),
  closed_at         timestamptz,                         -- null while open

  -- Cash accounting
  opening_float     numeric(12,2) NOT NULL DEFAULT 0,    -- starting cash declared
  expected_cash     numeric(12,2),                       -- float + cash sales (filled on close)
  declared_cash     numeric(12,2),                       -- what cashier counted (filled on close)
  variance          numeric(12,2),                       -- declared - expected  (negative = short)

  -- Status
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'closed', 'remitted')),

  notes             text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shifts_branch_opened_at_idx
  ON public.shifts (branch_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS shifts_cashier_opened_at_idx
  ON public.shifts (cashier_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS shifts_status_idx
  ON public.shifts (status);

-- Enforce: a cashier can only have ONE open shift at a time per branch
CREATE UNIQUE INDEX IF NOT EXISTS shifts_one_open_per_cashier_branch_idx
  ON public.shifts (cashier_id, branch_id)
  WHERE status = 'open';

-- -----------------------------------------------------------------------------
-- 2) CASH REMITTANCES table
--    Records the physical handover from cashier → admin/owner.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_remittances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id          uuid NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  branch_id         uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  cashier_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  amount_remitted   numeric(12,2) NOT NULL CHECK (amount_remitted >= 0),
  received_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL, -- admin

  remitted_at       timestamptz NOT NULL DEFAULT now(),
  notes             text,

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cash_remittances_shift_idx
  ON public.cash_remittances (shift_id);

CREATE INDEX IF NOT EXISTS cash_remittances_branch_remitted_at_idx
  ON public.cash_remittances (branch_id, remitted_at DESC);

-- -----------------------------------------------------------------------------
-- 3) Link SALES → SHIFTS
--    Nullable so existing sales without a shift are not broken.
-- -----------------------------------------------------------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_shift_id_idx
  ON public.sales (shift_id)
  WHERE shift_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4) RLS — SHIFTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Admins see all shifts; cashiers see only their own
DROP POLICY IF EXISTS shifts_select_policy ON public.shifts;
CREATE POLICY shifts_select_policy
  ON public.shifts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'admin' OR p.id = shifts.cashier_id)
    )
  );

-- Only the cashier themselves can insert their own shift
DROP POLICY IF EXISTS shifts_insert_policy ON public.shifts;
CREATE POLICY shifts_insert_policy
  ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (cashier_id = auth.uid());

-- Cashier can update (to close); admin can update (to remit)
DROP POLICY IF EXISTS shifts_update_policy ON public.shifts;
CREATE POLICY shifts_update_policy
  ON public.shifts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'admin' OR p.id = shifts.cashier_id)
    )
  );

-- -----------------------------------------------------------------------------
-- 5) RLS — CASH REMITTANCES
-- -----------------------------------------------------------------------------
ALTER TABLE public.cash_remittances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS remittances_select_policy ON public.cash_remittances;
CREATE POLICY remittances_select_policy
  ON public.cash_remittances FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'admin' OR p.id = cash_remittances.cashier_id)
    )
  );

-- Only admins can insert remittances (they receive the money)
DROP POLICY IF EXISTS remittances_insert_policy ON public.cash_remittances;
CREATE POLICY remittances_insert_policy
  ON public.cash_remittances FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- 6) Helper view: shift_summary
--    Pre-aggregates cash sales per shift for easy querying.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.shift_summary AS
SELECT
  s.id                                        AS shift_id,
  s.branch_id,
  s.cashier_id,
  p.full_name                                 AS cashier_name,
  s.opened_at,
  s.closed_at,
  s.status,
  s.opening_float,
  s.expected_cash,
  s.declared_cash,
  s.variance,
  s.notes,

  -- Count and revenue from sales in this shift
  COUNT(sa.id)                                AS total_transactions,
  COALESCE(SUM(sa.total), 0)                  AS total_revenue,

  -- Cash payments only (for expected_cash calculation)
  COALESCE(
    SUM(pay.amount) FILTER (
      WHERE LOWER(pay.method) = 'cash'
    ), 0
  )                                           AS total_cash_collected,

  -- Remittance info
  cr.amount_remitted,
  cr.remitted_at,
  rp.full_name                                AS received_by_name

FROM public.shifts s
LEFT JOIN public.profiles  p   ON p.id  = s.cashier_id
LEFT JOIN public.sales     sa  ON sa.shift_id = s.id AND sa.status = 'completed'
LEFT JOIN public.payments  pay ON pay.sale_id = sa.id
LEFT JOIN public.cash_remittances cr ON cr.shift_id = s.id
LEFT JOIN public.profiles  rp  ON rp.id = cr.received_by
GROUP BY
  s.id, s.branch_id, s.cashier_id, p.full_name,
  s.opened_at, s.closed_at, s.status,
  s.opening_float, s.expected_cash, s.declared_cash, s.variance, s.notes,
  cr.amount_remitted, cr.remitted_at, rp.full_name;

COMMENT ON VIEW public.shift_summary IS
  'Aggregated view of each shift with sales totals and remittance status.';

-- -----------------------------------------------------------------------------
-- 7) updated_at trigger for shifts
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shifts_set_updated_at ON public.shifts;
CREATE TRIGGER shifts_set_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
