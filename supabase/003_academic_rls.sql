CREATE POLICY "School members can view academic years"
ON academic_years FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage academic years"
ON academic_years FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "School members can view classes"
ON classes FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage classes"
ON classes FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "School members can view sections"
ON sections FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage sections"
ON sections FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "School members can view subjects"
ON subjects FOR SELECT
USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can manage subjects"
ON subjects FOR ALL
USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');