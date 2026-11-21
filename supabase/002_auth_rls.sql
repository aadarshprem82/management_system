CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT school_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE POLICY "Users can view their own school"
ON schools FOR SELECT
USING (id = public.get_my_school_id());

CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles in their school"
ON profiles FOR SELECT
USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'admin'
);

CREATE POLICY "Admins can insert profiles in their school"
ON profiles FOR INSERT
WITH CHECK (
  school_id = public.get_my_school_id()
  AND public.get_my_role() = 'admin'
);

CREATE POLICY "Admins can update profiles in their school"
ON profiles FOR UPDATE
USING (
  school_id = public.get_my_school_id()
  AND public.get_my_role() = 'admin'
);