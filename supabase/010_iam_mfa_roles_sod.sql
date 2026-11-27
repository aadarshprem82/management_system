-- Wave 1 TASK-02: Advanced IAM, MFA, Multi-Role Contexts & Segregation of Duties

-- 1. Expand user_role enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'principal';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'admissions_officer';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'accountant';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'librarian';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'transport_manager';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'nurse';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'auditor';

-- 2. Lifecycle, session revocation, and MFA enforcement columns on profiles
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('invited', 'active', 'suspended', 'archived')),
    ADD COLUMN IF NOT EXISTS status_reason TEXT,
    ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS session_revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS mfa_enforced BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. Many-to-Many user_roles (supports multiple roles per user across campuses & effective dates)
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_lookup
    ON user_roles (user_id, school_id, is_active, effective_from);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_roles_active_campus
    ON user_roles (user_id, role, campus_id)
    WHERE is_active = true AND campus_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_roles_active_schoolwide
    ON user_roles (user_id, role)
    WHERE is_active = true AND campus_id IS NULL;

-- Backfill existing profiles into user_roles
INSERT INTO user_roles (school_id, user_id, role, campus_id, is_primary, is_active)
SELECT p.school_id, p.id, p.role, p.campus_id, true, true
FROM profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = p.id AND ur.role = p.role AND ur.is_active = true
);

-- 4. User Consents (version, timestamp, channel)
CREATE TABLE IF NOT EXISTS user_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    policy_key TEXT NOT NULL DEFAULT 'terms_and_privacy',
    version TEXT NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'mobile', 'api', 'in_person')),
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (user_id, policy_key, version)
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user
    ON user_consents (user_id, policy_key, accepted_at DESC);

-- 5. Approval Requests (Maker-Checker / Segregation of Duties)
CREATE TABLE IF NOT EXISTS approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES campuses(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'executed')),
    requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    requested_role TEXT,
    reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_role TEXT,
    review_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_approval_segregation_of_duties CHECK (reviewed_by IS NULL OR reviewed_by <> requested_by)
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_school_status
    ON approval_requests (school_id, status, created_at DESC);

-- 6. Immediate Supabase Auth Session Revocation Helper RPC
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    BEGIN
        DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
    EXCEPTION WHEN undefined_table OR insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        DELETE FROM auth.sessions WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table OR insufficient_privilege THEN
        NULL;
    END;
END;
$$;

-- 7. Enable RLS & define policies
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

-- user_roles policies
CREATE POLICY "Users can view own role assignments"
ON user_roles FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Admins can view school role assignments"
ON user_roles FOR SELECT
USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role()::text IN ('admin', 'super_admin', 'principal', 'auditor')
);

CREATE POLICY "Admins can manage school role assignments"
ON user_roles FOR ALL
USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role()::text IN ('admin', 'super_admin', 'principal')
)
WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role()::text IN ('admin', 'super_admin', 'principal')
);

-- user_consents policies
CREATE POLICY "Users can view own consents"
ON user_consents FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own consents"
ON user_consents FOR INSERT
WITH CHECK (user_id = auth.uid() AND school_id = public.get_my_school_id());

CREATE POLICY "Admins and auditors can view school consents"
ON user_consents FOR SELECT
USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role()::text IN ('admin', 'super_admin', 'principal', 'auditor')
);

-- approval_requests policies
CREATE POLICY "Users can view own or school approval requests"
ON approval_requests FOR SELECT
USING (
    school_id = public.get_my_school_id()
    AND (
        requested_by = auth.uid()
        OR public.get_my_role()::text IN ('admin', 'super_admin', 'principal', 'accountant', 'auditor')
    )
);

CREATE POLICY "School staff can create approval requests"
ON approval_requests FOR INSERT
WITH CHECK (
    school_id = public.get_my_school_id()
    AND requested_by = auth.uid()
);

CREATE POLICY "Authorized reviewers can decide others approval requests"
ON approval_requests FOR UPDATE
USING (
    school_id = public.get_my_school_id()
    AND requested_by <> auth.uid()
    AND public.get_my_role()::text IN ('admin', 'super_admin', 'principal', 'accountant')
)
WITH CHECK (
    school_id = public.get_my_school_id()
    AND requested_by <> auth.uid()
    AND public.get_my_role()::text IN ('admin', 'super_admin', 'principal', 'accountant')
);
