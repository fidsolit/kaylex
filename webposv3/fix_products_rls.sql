-- =============================================================================
-- Fix: products table RLS policies
-- "new row violates row-level security policy for table products"
--
-- The products table was missing RLS policies entirely.
-- Run this in Supabase SQL Editor.
-- =============================================================================

-- Enable RLS (safe to run even if already enabled)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- ── SELECT ──────────────────────────────────────────────────────────────────
-- Any authenticated user can read products (needed by POS, inventory, etc.)
DROP POLICY IF EXISTS products_select_policy ON public.products;
CREATE POLICY products_select_policy
  ON public.products
  FOR SELECT
  TO authenticated
  USING (true);

-- ── INSERT ──────────────────────────────────────────────────────────────────
-- Only admins can add new products
DROP POLICY IF EXISTS products_insert_policy ON public.products;
CREATE POLICY products_insert_policy
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── UPDATE ──────────────────────────────────────────────────────────────────
-- Only admins can edit products
DROP POLICY IF EXISTS products_update_policy ON public.products;
CREATE POLICY products_update_policy
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── DELETE ──────────────────────────────────────────────────────────────────
-- Only admins can delete products
DROP POLICY IF EXISTS products_delete_policy ON public.products;
CREATE POLICY products_delete_policy
  ON public.products
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =============================================================================
-- Also fix inventory table (same issue — no RLS policies)
-- =============================================================================
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_select_policy ON public.inventory;
CREATE POLICY inventory_select_policy
  ON public.inventory
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS inventory_insert_policy ON public.inventory;
CREATE POLICY inventory_insert_policy
  ON public.inventory
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS inventory_update_policy ON public.inventory;
CREATE POLICY inventory_update_policy
  ON public.inventory
  FOR UPDATE
  TO authenticated
  USING (true)   -- cashiers need to update stock during sales
  WITH CHECK (true);

DROP POLICY IF EXISTS inventory_delete_policy ON public.inventory;
CREATE POLICY inventory_delete_policy
  ON public.inventory
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =============================================================================
-- Also fix branches table (same issue)
-- =============================================================================
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branches_select_policy ON public.branches;
CREATE POLICY branches_select_policy
  ON public.branches
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS branches_insert_policy ON public.branches;
CREATE POLICY branches_insert_policy
  ON public.branches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS branches_update_policy ON public.branches;
CREATE POLICY branches_update_policy
  ON public.branches
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
