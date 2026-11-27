import { createContext, useContext } from 'react';

export interface OrganizationConfig {
    id: string;
    name: string;
    code: string;
    address: string | null;
    logo_url: string | null;
    tagline: string | null;
    website: string | null;
    email: string | null;
    phone: string | null;
    primary_color: string;
    secondary_color: string;
    timezone: string;
    currency_code: string;
    currency_symbol: string;
}

export interface ModuleDescriptor {
    module_key: string;
    description: string;
}

export interface ConfigContextType {
    organization: OrganizationConfig | null;
    modules: Record<string, boolean>;
    availableModules: ModuleDescriptor[];
    loading: boolean;
    isModuleEnabled: (moduleKey: string) => boolean;
    refreshConfig: (campusId?: string) => Promise<void>;
}

export const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function useConfig(): ConfigContextType {
    const ctx = useContext(ConfigContext);
    if (!ctx) throw new Error('useConfig must be used inside ConfigProvider');
    return ctx;
}
