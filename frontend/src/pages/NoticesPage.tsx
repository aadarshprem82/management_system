import { useEffect, useState, type SyntheticEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Alert,
    AppBar,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    Container,
    FormControlLabel,
    MenuItem,
    Stack,
    TextField,
    Toolbar,
    Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';

import { formatDate } from '../lib/date';

interface ClassItem {
    id: string;
    name: string;
}

interface NoticeItem {
    id: string;
    title: string;
    content: string;
    is_pinned: boolean;
    created_at: string;
    class_id: string | null;
    class: { id: string; name: string } | null;
    author: { id: string; full_name: string; role: string } | null;
}

export default function NoticesPage() {
    const { session, profile } = useAuth();
    const token = session?.access_token ?? '';
    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

    const [notices, setNotices] = useState<NoticeItem[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [liveStatus, setLiveStatus] = useState<'connecting' | 'live'>('connecting');

    // Form states
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [classId, setClassId] = useState('');
    const [isPinned, setIsPinned] = useState(false);

    const loadNotices = async () => {
        if (!token) return;
        try {
            setError(null);
            const data = await apiFetch<NoticeItem[]>('/api/v1/notices', token);
            setNotices(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load notices');
        }
    };

    useEffect(() => {
        if (!token || !profile) return;
        loadNotices();

        if (isStaff) {
            apiFetch<ClassItem[]>('/api/v1/academics/classes', token)
                .then(setClasses)
                .catch(() => { });
        }

        // Subscribe to Supabase Realtime for instant updates
        const channel = supabase
            .channel('school-notices-live')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'notices',
                    filter: `school_id=eq.${profile.school_id}`,
                },
                () => {
                    loadNotices();
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') setLiveStatus('live');
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [token, profile, isStaff]);

    const handleCreateNotice = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        try {
            await apiFetch('/api/v1/notices', token, {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    content,
                    class_id: classId || null,
                    is_pinned: isPinned,
                }),
            });
            setTitle('');
            setContent('');
            setClassId('');
            setIsPinned(false);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to post notice');
        }
    };

    const handleDeleteNotice = async (id: string) => {
        setError(null);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/v1/notices/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to delete notice');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Delete failed');
        }
    };

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Notice Board
                    </Typography>
                    <Chip
                        label={liveStatus === 'live' ? 'LIVE' : 'CONNECTING...'}
                        color={liveStatus === 'live' ? 'success' : 'default'}
                        size="small"
                        sx={{ mr: 2 }}
                    />
                    <Button color="inherit" component={RouterLink} to="/dashboard">
                        Back to Dashboard
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="md" sx={{ mt: 4 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                <Stack spacing={3}>
                    {isStaff && (
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Post Announcement</Typography>
                                <Box
                                    component="form"
                                    onSubmit={handleCreateNotice}
                                    sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                                >
                                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                        <TextField
                                            label="Title"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            required
                                            sx={{ flexGrow: 1, minWidth: 220 }}
                                        />
                                        <TextField
                                            select
                                            label="Target Audience"
                                            value={classId}
                                            onChange={(e) => setClassId(e.target.value)}
                                            sx={{ minWidth: 180 }}
                                        >
                                            <MenuItem value="">All School</MenuItem>
                                            {classes.map((c) => (
                                                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                                            ))}
                                        </TextField>
                                    </Box>

                                    <TextField
                                        label="Announcement Details"
                                        multiline
                                        rows={3}
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        required
                                        fullWidth
                                    />

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={isPinned}
                                                    onChange={(e) => setIsPinned(e.target.checked)}
                                                />
                                            }
                                            label="Pin to top"
                                        />
                                        <Button type="submit" variant="contained">
                                            Publish Notice
                                        </Button>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    )}

                    {notices.length === 0 ? (
                        <Typography color="text.secondary" align="center" sx={{ mt: 4 }}>
                            No announcements yet.
                        </Typography>
                    ) : (
                        notices.map((n) => (
                            <Card
                                key={n.id}
                                variant="outlined"
                                sx={{ borderLeft: n.is_pinned ? '4px solid #1976d2' : undefined }}
                            >
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                                        <Box>
                                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                                                <Typography variant="h6">{n.title}</Typography>
                                                {n.is_pinned && <Chip label="Pinned" color="primary" size="small" />}
                                                <Chip
                                                    label={n.class ? n.class.name : 'School-Wide'}
                                                    variant="outlined"
                                                    size="small"
                                                />
                                            </Stack>
                                            <Typography variant="caption" color="text.secondary">
                                                Posted by {n.author?.full_name || 'Staff'} •{' '}
                                                {formatDate(n.created_at)}
                                            </Typography>
                                        </Box>

                                        {isStaff && (
                                            <Button
                                                size="small"
                                                color="error"
                                                onClick={() => handleDeleteNotice(n.id)}
                                            >
                                                Delete
                                            </Button>
                                        )}
                                    </Box>

                                    <Typography variant="body1" sx={{ mt: 1.5, whiteSpace: 'pre-wrap' }}>
                                        {n.content}
                                    </Typography>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </Stack>
            </Container>
        </>
    );
}