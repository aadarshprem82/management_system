CREATE TYPE fee_payment_status AS ENUM ('pending', 'partial', 'paid');

CREATE TABLE fee_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., 'Tuition Fee - Term 1'
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    due_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fee_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    fee_structure_id UUID NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount_paid NUMERIC(10,2) NOT NULL CHECK (amount_paid >= 0),
    status fee_payment_status NOT NULL DEFAULT 'paid',
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    receipt_number TEXT UNIQUE NOT NULL,
    remarks TEXT,
    recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members can view fee structures"
ON fee_structures FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage fee structures"
ON fee_structures FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "Admins can manage school fee payments"
ON fee_payments FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "Students can view own fee payments"
ON fee_payments FOR SELECT
USING (school_id = public.get_my_school_id() AND student_id = auth.uid());

CREATE POLICY "Parents can view their children's fee payments"
ON fee_payments FOR SELECT
USING (
    school_id = public.get_my_school_id()
    AND EXISTS (
        SELECT 1 FROM parent_students ps
        WHERE ps.parent_id = auth.uid()
          AND ps.student_id = fee_payments.student_id
    )
);