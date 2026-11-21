CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., 'Mid-Term Exam'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE exam_marks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    marks_obtained NUMERIC(5,2) NOT NULL CHECK (marks_obtained >= 0),
    max_marks NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (max_marks > 0),
    remarks TEXT,
    graded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (exam_id, subject_id, student_id)
);

CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE NOT NULL,
    file_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE assignment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    remarks TEXT,
    submitted_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (assignment_id, student_id)
);

ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members can view exams"
ON exams FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Staff can manage exams"
ON exams FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() IN ('admin', 'teacher'))
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() IN ('admin', 'teacher'));

CREATE POLICY "Staff can manage exam marks"
ON exam_marks FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() IN ('admin', 'teacher'))
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() IN ('admin', 'teacher'));

CREATE POLICY "Students can view own marks"
ON exam_marks FOR SELECT
USING (school_id = public.get_my_school_id() AND student_id = auth.uid());

CREATE POLICY "School members can view assignments"
ON assignments FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Staff can manage assignments"
ON assignments FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() IN ('admin', 'teacher'))
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() IN ('admin', 'teacher'));

CREATE POLICY "Staff can view school submissions"
ON assignment_submissions FOR SELECT
USING (school_id = public.get_my_school_id() AND public.get_my_role() IN ('admin', 'teacher'));

CREATE POLICY "Students can manage own submissions"
ON assignment_submissions FOR ALL
USING (school_id = public.get_my_school_id() AND student_id = auth.uid())
WITH CHECK (school_id = public.get_my_school_id() AND student_id = auth.uid());