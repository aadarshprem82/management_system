CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused');

CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status attendance_status NOT NULL DEFAULT 'present',
    remarks TEXT,
    marked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (student_id, date)
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and teachers can manage school attendance"
ON attendance FOR ALL
USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('admin', 'teacher')
)
WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('admin', 'teacher')
);

CREATE POLICY "Students can view own attendance"
ON attendance FOR SELECT
USING (
    school_id = public.get_my_school_id()
    AND student_id = auth.uid()
);

CREATE POLICY "Parents can view their children's attendance"
ON attendance FOR SELECT
USING (
    school_id = public.get_my_school_id()
    AND EXISTS (
        SELECT 1 FROM parent_students ps
        WHERE ps.parent_id = auth.uid()
          AND ps.student_id = attendance.student_id
    )
);