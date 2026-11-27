import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from './AuthContext';
import {
    ConfigContext,
    type ModuleDescriptor,
    type OrganizationConfig,
} from './configContextDef';

interface FeatureFlagsResponse {
    modules: Record<string, boolean>;
    available_modules: ModuleDescriptor[];
}

export function ConfigProvider({ children }: { children: ReactNode }) {
    const { session, profile } = useAuth();
    const token = session?.access_token ?? '';

    const [organization, setOrganization] = useState<OrganizationConfig | null>(null);
    const [modules, setModules] = useState<Record<string, boolean>>({});
    const [availableModules, setAvailableModules] = useState<ModuleDescriptor[]>([]);
    const [loading, setLoading] = useState(false);

    const refreshConfig = useCallback(
        async (campusId?: string) => {
            if (!token) {
                setOrganization(null);
                setModules({});
                return;
            }
            setLoading(true);
            try {
                const flagPath = campusId
                    ? `/api/v1/config/feature-flags?campus_id=${encodeURIComponent(campusId)}`
                    : '/api/v1/config/feature-flags';
                const [orgData, flagsData] = await Promise.all([
                    apiFetch<OrganizationConfig>('/api/v1/config/organization', token),
                    apiFetch<FeatureFlagsResponse>(flagPath, token),
                ]);
                setOrganization(orgData);
                setModules(flagsData.modules || {});
                setAvailableModules(flagsData.available_modules || []);
            } catch {
                // Keep defaults if config endpoints are unavailable
            } finally {
                setLoading(false);
            }
        },
        [token]
    );

    useEffect(() => {
        if (!token || !profile) {
            return;
        }
        let cancelled = false;
        const load = async () => {
            try {
                const [orgData, flagsData] = await Promise.all([
                    apiFetch<OrganizationConfig>('/api/v1/config/organization', token),
                    apiFetch<FeatureFlagsResponse>('/api/v1/config/feature-flags', token),
                ]);
                if (!cancelled) {
                    setOrganization(orgData);
                    setModules(flagsData.modules || {});
                    setAvailableModules(flagsData.available_modules || []);
                }
            } catch {
                // Ignore if unavailable
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [token, profile]);

    const isModuleEnabled = useCallback(
        (moduleKey: string): boolean => {
            if (Object.keys(modules).length === 0) return true;
            return modules[moduleKey] !== false;
        },
        [modules]
    );

    return (
        <ConfigContext.Provider
            value={{
                organization,
                modules,
                availableModules,
                loading,
                isModuleEnabled,
                refreshConfig,
            }}
        >
            {children}
        </ConfigContext.Provider>
    );
}
