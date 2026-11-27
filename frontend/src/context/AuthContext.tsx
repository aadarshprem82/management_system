import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { apiFetch, getStoredContextHeaders, setStoredContextHeaders } from '../lib/api';
import type { Session } from '@supabase/supabase-js';

export type UserRole =
    | 'super_admin'
    | 'admin'
    | 'principal'
    | 'admissions_officer'
    | 'accountant'
    | 'librarian'
    | 'transport_manager'
    | 'nurse'
    | 'auditor'
    | 'teacher'
    | 'student'
    | 'parent';

export interface RoleContextItem {
    id?: string | null;
    role: UserRole;
    campus_id?: string | null;
    campus_name?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
    is_primary: boolean;
}

export interface UserProfile {
    id: string;
    email: string;
    school_id: string;
    role: UserRole;
    primary_role?: UserRole;
    full_name: string;
    active_campus_id?: string | null;
    status?: string;
    aal?: 'aal1' | 'aal2' | null;
    mfa_required?: boolean;
    roles?: RoleContextItem[];
}

interface ConsentStatusResponse {
    policy_key: string;
    required_version: string;
    has_accepted_current: boolean;
}

interface AuthContextType {
    session: Session | null;
    profile: UserProfile | null;
    loading: boolean;
    activeRole: UserRole | null;
    activeCampusId: string | null;
    mfaLevel: 'aal1' | 'aal2';
    needsMfaChallenge: boolean;
    consentRequired: boolean;
    consentVersion: string;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    switchRoleContext: (role: UserRole, campusId?: string | null) => Promise<void>;
    acceptConsent: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [mfaLevel, setMfaLevel] = useState<'aal1' | 'aal2'>('aal1');
    const [consentRequired, setConsentRequired] = useState(false);
    const [consentVersion, setConsentVersion] = useState('2026.1');

    const loadSessionDetails = useCallback(async (accessToken: string) => {
        const stored = getStoredContextHeaders();
        const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`,
        };
        if (stored.activeRole) headers['X-Active-Role'] = stored.activeRole;
        if (stored.activeCampusId) headers['X-Campus-Id'] = stored.activeCampusId;

        let res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/v1/me`, { headers });
        if (res.status === 403 && stored.activeRole) {
            setStoredContextHeaders(null, null);
            res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/v1/me`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
        }
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.detail || 'Failed to load user profile');
        }
        const data: UserProfile = await res.json();
        setProfile(data);

        let detectedAal: 'aal1' | 'aal2' = data.aal === 'aal2' ? 'aal2' : 'aal1';
        try {
            const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (aalData?.currentLevel === 'aal2') {
                detectedAal = 'aal2';
            }
        } catch {
            // Ignore if MFA API unavailable
        }
        setMfaLevel(detectedAal);

        try {
            const consentData = await apiFetch<ConsentStatusResponse>('/api/v1/iam/consents/me', accessToken);
            setConsentRequired(!consentData.has_accepted_current);
            setConsentVersion(consentData.required_version);
        } catch {
            setConsentRequired(false);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
            if (!mounted) return;
            setSession(initialSession);
            if (initialSession) {
                try {
                    await loadSessionDetails(initialSession.access_token);
                } catch {
                    if (mounted) setProfile(null);
                }
            }
            if (mounted) setLoading(false);
        });

        const { data: listener } = supabase.auth.onAuthStateChange(
            async (_event, newSession) => {
                setSession(newSession);
                if (newSession) {
                    try {
                        await loadSessionDetails(newSession.access_token);
                    } catch {
                        setProfile(null);
                    }
                } else {
                    setProfile(null);
                    setConsentRequired(false);
                    setMfaLevel('aal1');
                }
            }
        );

        return () => {
            mounted = false;
            listener.subscription.unsubscribe();
        };
    }, [loadSessionDetails]);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    };

    const signOut = async () => {
        setStoredContextHeaders(null, null);
        await supabase.auth.signOut();
        setProfile(null);
        setConsentRequired(false);
    };

    const switchRoleContext = async (role: UserRole, campusId: string | null = null) => {
        setStoredContextHeaders(role, campusId);
        if (session?.access_token) {
            await loadSessionDetails(session.access_token);
        }
    };

    const acceptConsent = async () => {
        if (!session?.access_token) return;
        await apiFetch('/api/v1/iam/consents/accept', session.access_token, {
            method: 'POST',
            body: JSON.stringify({
                policy_key: 'terms_and_privacy',
                version: consentVersion,
                channel: 'web',
            }),
        });
        setConsentRequired(false);
    };

    const refreshProfile = async () => {
        const { data } = await supabase.auth.getSession();
        const activeSession = data.session || session;
        if (activeSession) {
            setSession(activeSession);
            await loadSessionDetails(activeSession.access_token);
        }
    };

    const activeRole = profile?.role ?? null;
    const activeCampusId = profile?.active_campus_id ?? null;
    const needsMfaChallenge = Boolean(profile?.mfa_required && mfaLevel !== 'aal2');

    return (
        <AuthContext.Provider
            value={{
                session,
                profile,
                loading,
                activeRole,
                activeCampusId,
                mfaLevel,
                needsMfaChallenge,
                consentRequired,
                consentVersion,
                signIn,
                signOut,
                switchRoleContext,
                acceptConsent,
                refreshProfile,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}
