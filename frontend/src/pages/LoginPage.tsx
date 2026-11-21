import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Container,
    TextField,
    Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
    const { signIn } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await signIn(email, password);
            navigate('/dashboard');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Container maxWidth="xs" sx={{ mt: 12 }}>
            <Card elevation={3}>
                <CardContent>
                    <Typography variant="h5" gutterBottom align="center">
                        School Portal Login
                    </Typography>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                            label="Email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            fullWidth
                        />
                        <TextField
                            label="Password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            fullWidth
                        />
                        <Button type="submit" variant="contained" disabled={submitting} fullWidth>
                            {submitting ? 'Signing in...' : 'Sign In'}
                        </Button>
                    </Box>
                </CardContent>
            </Card>
        </Container>
    );
}