import { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface TotpFactor {
    id: string;
    friendly_name?: string;
    status: string;
}

interface MfaDialogProps {
    open: boolean;
    onClose: () => void;
    required?: boolean;
}

export default function MfaDialog({ open, onClose, required = false }: MfaDialogProps) {
    const { mfaLevel, refreshProfile } = useAuth();
    const [factors, setFactors] = useState<TotpFactor[]>([]);
    const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [totpSecret, setTotpSecret] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const loadFactors = useCallback(async () => {
        try {
            const { data, error: listErr } = await supabase.auth.mfa.listFactors();
            if (listErr) throw listErr;
            setFactors((data?.totp as TotpFactor[]) || []);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Unable to load MFA factors');
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const init = async () => {
            try {
                const { data, error: listErr } = await supabase.auth.mfa.listFactors();
                if (listErr) throw listErr;
                if (!cancelled) {
                    setFactors((data?.totp as TotpFactor[]) || []);
                    setError(null);
                    setSuccess(null);
                }
            } catch (err: unknown) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Unable to load MFA factors');
                }
            }
        };
        void init();
        return () => {
            cancelled = true;
        };
    }, [open]);

    const verifiedFactor = factors.find((f) => f.status === 'verified');

    const handleStartEnroll = async () => {
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
            const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName: 'School Portal Authenticator',
            });
            if (enrollErr) throw enrollErr;
            setEnrollFactorId(data.id);
            setQrCode(data.totp.qr_code);
            setTotpSecret(data.totp.secret);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'MFA enrollment failed');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        const targetFactorId = enrollFactorId || verifiedFactor?.id;
        if (!targetFactorId || !code.trim()) {
            setError('Enter the 6-digit authenticator code.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
                factorId: targetFactorId,
                code: code.trim(),
            });
            if (verifyErr) throw verifyErr;

            setCode('');
            setEnrollFactorId(null);
            setQrCode(null);
            setTotpSecret(null);
            setSuccess('MFA verified. Session upgraded to AAL2.');
            await loadFactors();
            await refreshProfile();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Invalid verification code');
        } finally {
            setLoading(false);
        }
    };

    const handleUnenroll = async (factorId: string) => {
        setLoading(true);
        setError(null);
        try {
            const { error: unenrollErr } = await supabase.auth.mfa.unenroll({ factorId });
            if (unenrollErr) throw unenrollErr;
            setSuccess('Authenticator factor removed.');
            await loadFactors();
            await refreshProfile();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to unenroll MFA factor');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={required && mfaLevel !== 'aal2' ? undefined : onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Multi-Factor Authentication (MFA)</span>
                <Chip
                    label={`Session: ${mfaLevel.toUpperCase()}`}
                    color={mfaLevel === 'aal2' ? 'success' : 'warning'}
                    size="small"
                />
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5}>
                    {required && mfaLevel !== 'aal2' && (
                        <Alert severity="warning">
                            Your active role requires <strong>AAL2 (MFA-verified)</strong> authentication before
                            accessing privileged or financial operations.
                        </Alert>
                    )}
                    {error && <Alert severity="error">{error}</Alert>}
                    {success && <Alert severity="success">{success}</Alert>}

                    {mfaLevel === 'aal2' && verifiedFactor && (
                        <Alert severity="success">
                            Your session is currently verified at <strong>AAL2</strong> using factor{' '}
                            <strong>{verifiedFactor.friendly_name || 'TOTP Authenticator'}</strong>.
                        </Alert>
                    )}

                    {!verifiedFactor && !enrollFactorId && (
                        <Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                No verified TOTP authenticator is enrolled on this account yet. Enroll an
                                authenticator app (Google Authenticator, 1Password, Authy) to enable AAL2 verification.
                            </Typography>
                            <Button variant="contained" onClick={handleStartEnroll} disabled={loading}>
                                Enroll TOTP Authenticator
                            </Button>
                        </Box>
                    )}

                    {qrCode && (
                        <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
                            <Typography variant="subtitle2">
                                Scan this QR code in your authenticator app:
                            </Typography>
                            <Box
                                component="img"
                                src={qrCode}
                                alt="TOTP MFA QR Code"
                                sx={{ width: 180, height: 180, border: '1px solid #ddd', borderRadius: 1, p: 1, bgcolor: '#fff' }}
                            />
                            {totpSecret && (
                                <Typography variant="caption" color="text.secondary">
                                    Manual secret: <code>{totpSecret}</code>
                                </Typography>
                            )}
                        </Stack>
                    )}

                    {(verifiedFactor || enrollFactorId) && mfaLevel !== 'aal2' && (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <TextField
                                label="6-Digit Authenticator Code"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="123456"
                                slotProps={{ htmlInput: { maxLength: 6 } }}
                                fullWidth
                            />
                            <Button
                                variant="contained"
                                onClick={handleVerifyCode}
                                disabled={loading || code.trim().length < 6}
                                sx={{ minWidth: 160 }}
                            >
                                Verify MFA Code
                            </Button>
                        </Stack>
                    )}

                    {verifiedFactor && mfaLevel === 'aal2' && (
                        <Box>
                            <Button
                                variant="outlined"
                                color="error"
                                size="small"
                                onClick={() => handleUnenroll(verifiedFactor.id)}
                                disabled={loading}
                            >
                                Unenroll TOTP Factor
                            </Button>
                        </Box>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>
                    {mfaLevel === 'aal2' ? 'Close' : 'Dismiss'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
