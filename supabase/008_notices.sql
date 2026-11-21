CREATE TABLE notices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID REFERENCES classes(id) ON DELETE CASCADE, -- NULL means school-wide
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false,
    posted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members can view notices"
ON notices FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Staff can manage notices"
ON notices FOR ALL
USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('admin', 'teacher')
)
WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN ('admin', 'teacher')
);

ALTER PUBLICATION supabase_realtime ADD TABLE notices;