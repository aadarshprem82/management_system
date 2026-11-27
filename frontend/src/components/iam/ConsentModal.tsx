import { useState } from 'react';
import {
    Alert,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Stack,
    Typography,
} from '@mui/material';
import { useAuth } from '../../context/AuthContext';

export default function ConsentModal() {
    const { consentRequired, consentVersion, acceptConsent, signOut } = useAuth();
    const [agreed, setAgreed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!consentRequired) return null;

    const handleAccept = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await acceptConsent();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to record consent');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={consentRequired} maxWidth="sm" fullWidth>
            <DialogTitle>Terms, Acceptable Use &amp; Privacy Consent (v{consentVersion})</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    {error && <Alert severity="error">{error}</Alert>}
                    <Typography variant="body2">
                        Before continuing, please review and accept the organization&apos;s data privacy,
                        academic integrity, and role-based access policy (Version <strong>{consentVersion}</strong>).
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        • Access to student, attendance, assessment, and financial records is logged and audited.
                        <br />
                        • Privileged and finance roles require active Multi-Factor Authentication (MFA / AAL2).
                        <br />
                        • High-risk actions are subject to maker-checker segregation of duties.
                        <br />
                        • Your acceptance timestamp, policy version, and channel (<code>web</code>) will be recorded.
                    </Typography>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={agreed}
                                onChange={(e) => setAgreed(e.target.checked)}
                            />
                        }
                        label={`I accept the Terms & Privacy Policy (v${consentVersion})`}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={() => void signOut()} disabled={submitting}>
                    Sign Out
                </Button>
                <Button
                    variant="contained"
                    onClick={handleAccept}
                    disabled={!agreed || submitting}
                >
                    {submitting ? 'Recording...' : 'Accept & Continue'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
