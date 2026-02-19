-- ============================================================
-- Payments Table + RPCs
-- Run this in Supabase SQL Editor AFTER rls_policies.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payments (
    id             uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id     uuid          NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    from_user_id   uuid          NOT NULL REFERENCES auth.users(id),
    to_user_id     uuid          NOT NULL REFERENCES auth.users(id),
    amount         numeric(10,2) NOT NULL,
    status         text          NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'claimed', 'confirmed')),
    created_at     timestamptz   DEFAULT now(),
    claimed_at     timestamptz,
    confirmed_at   timestamptz,

    -- Prevents duplicate payments for the same pair in one session
    UNIQUE (session_id, from_user_id, to_user_id)
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- RLS Policies
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "payments_select_participants"     ON public.payments;
DROP POLICY IF EXISTS "payments_select_members"         ON public.payments;
DROP POLICY IF EXISTS "payments_insert_session_member"  ON public.payments;

-- SELECT: any session member can see all payments for their session
CREATE POLICY "payments_select_members"
ON public.payments FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.session_members
        WHERE session_id = payments.session_id
          AND user_id = auth.uid()
    )
);

-- INSERT: any session member can create payment records (payouts page does this on first load)
-- The unique constraint prevents duplicates; computeTransfers is deterministic
CREATE POLICY "payments_insert_session_member"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.session_members
        WHERE session_id = payments.session_id
          AND user_id = auth.uid()
    )
);

-- No direct UPDATE policy — mutations go through SECURITY DEFINER RPCs below


-- ─────────────────────────────────────────────────────────────
-- RPCs
-- ─────────────────────────────────────────────────────────────

-- Payer marks a payment as sent (pending → claimed)
CREATE OR REPLACE FUNCTION public.claim_payment(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE payments
    SET status = 'claimed', claimed_at = now()
    WHERE id = p_payment_id
      AND from_user_id = auth.uid()
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found or you are not the payer';
    END IF;
END;
$$;

-- Receiver confirms they got the money (claimed → confirmed)
CREATE OR REPLACE FUNCTION public.confirm_payment(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE payments
    SET status = 'confirmed', confirmed_at = now()
    WHERE id = p_payment_id
      AND to_user_id = auth.uid()
      AND status = 'claimed';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found or you are not the receiver';
    END IF;
END;
$$;
