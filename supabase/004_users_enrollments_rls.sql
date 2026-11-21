CREATE POLICY "School members can view enrollments"
ON enrollments FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage enrollments"
ON enrollments FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE TABLE parent_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    UNIQUE (parent_id, student_id)
);

ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members can view parent-student links"
ON parent_students FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage parent-student links"
ON parent_students FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');