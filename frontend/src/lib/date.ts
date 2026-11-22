import dayjs from 'dayjs';

export function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format('DD/MM/YYYY') : value;
}

export function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format('DD/MM/YYYY, hh:mm A') : value;
}