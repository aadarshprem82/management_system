-- Wave 1 TASK-01: Multi-Campus Organization, Calendar, Rooms, Streams, Houses, Numbering & Feature Flags

-- 1. Organization branding, timezone & currency on schools
ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS tagline TEXT,
    ADD COLUMN IF NOT EXISTS website TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#1976d2',
    ADD COLUMN IF NOT EXISTS secondary_color TEXT NOT NULL DEFAULT '#9c27b0',
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC',
    ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR',
    ADD COLUMN IF NOT EXISTS currency_symbol TEXT NOT NULL DEFAULT '₹',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Campuses
CREATE TABLE IF NOT EXISTS campuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    timezone TEXT,
    phone TEXT,
    email TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (school_id, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_campuses_primary_per_school
    ON campuses (school_id)
    WHERE is_primary = true;

-- 3. Terms (with campus_id & effective-date versioning)
CREATE TABLE IF NOT EXISTS terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    sequence_order INT NOT NULL DEFAULT 1,
    is_current BOOLEAN NOT NULL DEFAULT false,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    CHECK (end_date >= start_date),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_terms_school_year ON terms (school_id, academic_year_id);

-- 4. Calendar Days (holidays, closures, special schedules, exam days, events)
CREATE TABLE IF NOT EXISTS calendar_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
    academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
    term_id UUID REFERENCES terms(id) ON DELETE SET NULL,
    day_date DATE NOT NULL,
    day_type TEXT NOT NULL CHECK (day_type IN ('holiday', 'closure', 'special_schedule', 'exam_day', 'event')),
    title TEXT NOT NULL,
    description TEXT,
    is_working_day BOOLEAN NOT NULL DEFAULT false,
    schedule_override JSONB,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_days_school_date ON calendar_days (school_id, day_date);

-- 5. Rooms
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    building TEXT,
    floor TEXT,
    room_type TEXT NOT NULL DEFAULT 'classroom' CHECK (room_type IN ('classroom', 'lab', 'auditorium', 'library', 'sports', 'office', 'other')),
    capacity INT NOT NULL CHECK (capacity > 0),
    exam_capacity INT CHECK (exam_capacity IS NULL OR exam_capacity > 0),
    facilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_school_campus_code
    ON rooms (school_id, campus_id, code)
    WHERE campus_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_school_code_no_campus
    ON rooms (school_id, code)
    WHERE campus_id IS NULL;

-- 6. Streams
CREATE TABLE IF NOT EXISTS streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (school_id, code)
);

-- 7. Houses
CREATE TABLE IF NOT EXISTS houses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#1976d2',
    motto TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (school_id, code)
);

-- 8. Numbering Sequences (with campus_id & effective-date versioning)
CREATE TABLE IF NOT EXISTS numbering_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
    academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
    sequence_type TEXT NOT NULL,
    prefix TEXT NOT NULL,
    suffix TEXT NOT NULL DEFAULT '',
    separator TEXT NOT NULL DEFAULT '-',
    padding INT NOT NULL DEFAULT 4 CHECK (padding BETWEEN 1 AND 12),
    next_number BIGINT NOT NULL DEFAULT 1 CHECK (next_number >= 1),
    reset_policy TEXT NOT NULL DEFAULT 'never' CHECK (reset_policy IN ('never', 'yearly', 'monthly')),
    last_reset_period TEXT,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    version INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_numbering_sequences_lookup
    ON numbering_sequences (school_id, sequence_type, is_active, effective_from);

CREATE TABLE IF NOT EXISTS numbering_sequence_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    sequence_id UUID NOT NULL REFERENCES numbering_sequences(id) ON DELETE CASCADE,
    sequence_type TEXT NOT NULL,
    generated_number TEXT NOT NULL,
    number_value BIGINT NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (school_id, sequence_type, generated_number)
);

-- Transactional sequence generator using row-level locking (FOR UPDATE)
CREATE OR REPLACE FUNCTION public.generate_next_sequence_number(
    p_school_id UUID,
    p_sequence_type TEXT,
    p_campus_id UUID DEFAULT NULL,
    p_academic_year_id UUID DEFAULT NULL,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seq numbering_sequences%ROWTYPE;
    v_current BIGINT;
    v_period TEXT;
    v_padded TEXT;
    v_formatted TEXT;
BEGIN
    SELECT *
    INTO v_seq
    FROM numbering_sequences
    WHERE school_id = p_school_id
      AND sequence_type = p_sequence_type
      AND is_active = true
      AND effective_from <= p_as_of_date
      AND (effective_to IS NULL OR effective_to >= p_as_of_date)
      AND (campus_id = p_campus_id OR campus_id IS NULL)
      AND (academic_year_id = p_academic_year_id OR academic_year_id IS NULL)
    ORDER BY
      (campus_id IS NOT NULL) DESC,
      (academic_year_id IS NOT NULL) DESC,
      effective_from DESC,
      version DESC,
      created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_ACTIVE_SEQUENCE: No active sequence found for type %', p_sequence_type;
    END IF;

    IF v_seq.reset_policy = 'yearly' THEN
        v_period := to_char(p_as_of_date, 'YYYY');
    ELSIF v_seq.reset_policy = 'monthly' THEN
        v_period := to_char(p_as_of_date, 'YYYYMM');
    ELSE
        v_period := NULL;
    END IF;

    IF v_period IS NOT NULL AND v_seq.last_reset_period IS DISTINCT FROM v_period THEN
        v_current := 1;
    ELSE
        v_current := v_seq.next_number;
    END IF;

    UPDATE numbering_sequences
    SET next_number = v_current + 1,
        last_reset_period = COALESCE(v_period, last_reset_period),
        updated_at = now()
    WHERE id = v_seq.id;

    v_padded := lpad(v_current::text, v_seq.padding, '0');
    v_formatted := v_seq.prefix || v_seq.separator || v_padded || v_seq.suffix;

    INSERT INTO numbering_sequence_logs (
        school_id, sequence_id, sequence_type, generated_number, number_value
    ) VALUES (
        p_school_id, v_seq.id, p_sequence_type, v_formatted, v_current
    );

    RETURN jsonb_build_object(
        'sequence_id', v_seq.id,
        'sequence_type', p_sequence_type,
        'number_value', v_current,
        'formatted_number', v_formatted,
        'campus_id', v_seq.campus_id
    );
END;
$$;

-- 9. Feature Flags (with campus_id & effective-date versioning)
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    version INT NOT NULL DEFAULT 1,
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_lookup
    ON feature_flags (school_id, module_key, effective_from);

-- 10. Add campus_id and effective-date versioning columns to existing tables where policies/structures apply
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL;

ALTER TABLE academic_years
    ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cloned_from_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL;

ALTER TABLE classes
    ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS stream_id UUID REFERENCES streams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS effective_to DATE,
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE sections
    ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS max_capacity INT CHECK (max_capacity IS NULL OR max_capacity > 0);

ALTER TABLE subjects
    ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS stream_id UUID REFERENCES streams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS effective_to DATE,
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE enrollments
    ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS stream_id UUID REFERENCES streams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS house_id UUID REFERENCES houses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS admission_number TEXT;

ALTER TABLE fee_structures
    ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS effective_to DATE,
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE fee_payments
    ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS invoice_number TEXT;

ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL;

ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL;

ALTER TABLE notices
    ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL;

-- 11. Enable RLS & define policies
ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE numbering_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE numbering_sequence_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Schools update policy for admins
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'schools' AND policyname = 'Admins can update their own school'
    ) THEN
        CREATE POLICY "Admins can update their own school"
        ON schools FOR UPDATE
        USING (id = public.get_my_school_id() AND public.get_my_role() = 'admin')
        WITH CHECK (id = public.get_my_school_id() AND public.get_my_role() = 'admin');
    END IF;
END $$;

-- Campuses policies
CREATE POLICY "School members can view campuses"
ON campuses FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage campuses"
ON campuses FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Terms policies
CREATE POLICY "School members can view terms"
ON terms FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage terms"
ON terms FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Calendar days policies
CREATE POLICY "School members can view calendar days"
ON calendar_days FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage calendar days"
ON calendar_days FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Rooms policies
CREATE POLICY "School members can view rooms"
ON rooms FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage rooms"
ON rooms FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Streams policies
CREATE POLICY "School members can view streams"
ON streams FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage streams"
ON streams FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Houses policies
CREATE POLICY "School members can view houses"
ON houses FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage houses"
ON houses FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Numbering sequences policies
CREATE POLICY "Admins can view numbering sequences"
ON numbering_sequences FOR SELECT
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "Admins can manage numbering sequences"
ON numbering_sequences FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "Admins can view numbering sequence logs"
ON numbering_sequence_logs FOR SELECT
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Feature flags policies
CREATE POLICY "School members can view feature flags"
ON feature_flags FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage feature flags"
ON feature_flags FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- 12. Seed default Main Campus, Feature Flags, and Numbering Sequences for existing schools
INSERT INTO campuses (school_id, name, code, address, is_primary, is_active)
SELECT s.id, 'Main Campus', 'MAIN', s.address, true, true
FROM schools s
WHERE NOT EXISTS (
    SELECT 1 FROM campuses c WHERE c.school_id = s.id
);

INSERT INTO feature_flags (school_id, module_key, is_enabled, description)
SELECT s.id, m.module_key, true, m.description
FROM schools s
CROSS JOIN (
    VALUES
        ('academics', 'Academic years, classes, sections, and subjects'),
        ('users', 'User management and student enrollments'),
        ('attendance', 'Daily attendance roster and summaries'),
        ('assessments', 'Exams, gradebook marks, and assignments'),
        ('fees', 'Fee structures, invoicing, and payment receipts'),
        ('notices', 'School and class notice board'),
        ('analytics', 'Dashboard analytics and metrics')
) AS m(module_key, description)
WHERE NOT EXISTS (
    SELECT 1 FROM feature_flags f
    WHERE f.school_id = s.id AND f.module_key = m.module_key AND f.campus_id IS NULL
);

INSERT INTO numbering_sequences (school_id, sequence_type, prefix, separator, padding, next_number, reset_policy)
SELECT s.id, seq.sequence_type, seq.prefix, '-', 5, 1, 'yearly'
FROM schools s
CROSS JOIN (
    VALUES
        ('admission', 'ADM'),
        ('receipt', 'RCPT'),
        ('invoice', 'INV')
) AS seq(sequence_type, prefix)
WHERE NOT EXISTS (
    SELECT 1 FROM numbering_sequences ns
    WHERE ns.school_id = s.id AND ns.sequence_type = seq.sequence_type AND ns.campus_id IS NULL
);
