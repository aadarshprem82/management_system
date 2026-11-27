const API_BASE = import.meta.env.VITE_API_BASE_URL;

const ACTIVE_ROLE_KEY = 'agy_active_role';
const ACTIVE_CAMPUS_KEY = 'agy_active_campus_id';

export function getStoredContextHeaders(): { activeRole: string | null; activeCampusId: string | null } {
  try {
    return {
      activeRole: localStorage.getItem(ACTIVE_ROLE_KEY),
      activeCampusId: localStorage.getItem(ACTIVE_CAMPUS_KEY),
    };
  } catch {
    return { activeRole: null, activeCampusId: null };
  }
}

export function setStoredContextHeaders(activeRole: string | null, activeCampusId: string | null): void {
  try {
    if (activeRole) {
      localStorage.setItem(ACTIVE_ROLE_KEY, activeRole);
    } else {
      localStorage.removeItem(ACTIVE_ROLE_KEY);
    }
    if (activeCampusId) {
      localStorage.setItem(ACTIVE_CAMPUS_KEY, activeCampusId);
    } else {
      localStorage.removeItem(ACTIVE_CAMPUS_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const { activeRole, activeCampusId } = getStoredContextHeaders();
  const contextHeaders: Record<string, string> = {};
  if (activeRole) contextHeaders['X-Active-Role'] = activeRole;
  if (activeCampusId) contextHeaders['X-Campus-Id'] = activeCampusId;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...contextHeaders,
      ...options.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json();
  if (!res.ok) {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : data.detail?.message || `Request failed (${res.status})`;
    throw new Error(detail);
  }
  return data as T;
}
