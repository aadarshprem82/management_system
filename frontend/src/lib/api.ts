const API_BASE = import.meta.env.VITE_API_BASE_URL;

export async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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
