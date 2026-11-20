import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Container,
  CssBaseline,
  Typography,
} from '@mui/material';

interface HealthResponse {
  status: string;
  database: string;
  sample_school: { id: string; name: string; code: string } | null;
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  console.log("Before useEffect");
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE_URL}/healthz`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: HealthResponse) => setHealth(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <CssBaseline />
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Card elevation={3}>
          <CardContent>
            <Typography variant='h5' gutterBottom>
              Management System - Phase 1
            </Typography>

            {loading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                <CircularProgress size={20} />
                <Typography>Checking FastAPI &amp; Supabase connection...</Typography>
              </Box>
            )}

            {error && (
              <Alert severity='error' sx={{ mt: 2 }}>
                Connection failed: {error}
              </Alert>
            )}

            {health && (
              <Alert severity='success' sx={{ mt: 2 }}>
                Backend: <strong>{health.status}</strong> | Database: {' '}
                <strong>{health.database} </strong>
                {health.sample_school && (
                  <>
                    <br />
                    Active School: <strong>{health.sample_school.name} </strong> ({health.sample_school.code})
                  </>
                )}
              </Alert>
            )}
          </CardContent>
        </Card>
      </Container>
    </>
  )
}