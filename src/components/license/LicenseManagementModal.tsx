import React, { useState } from 'react';
import {
  X,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Trash2,
  Loader2,
  Crown,
} from 'lucide-react';
import { useLicenseStore, useUiStore } from '../../store';

export const LicenseManagementModal: React.FC = () => {
  const isLicenseModalOpen = useUiStore((s) => s.isLicenseModalOpen);
  const setLicenseModalOpen = useUiStore((s) => s.setLicenseModalOpen);
  const setPricingModalOpen = useUiStore((s) => s.setPricingModalOpen);

  const isPro = useLicenseStore((s) => s.isPro);
  const licenseKey = useLicenseStore((s) => s.licenseKey);
  const days = useLicenseStore((s) => s.days);
  const daysLeft = useLicenseStore((s) => s.daysLeft);
  const expiresAt = useLicenseStore((s) => s.expiresAt);
  const activatedAt = useLicenseStore((s) => s.activatedAt);
  const activateLicense = useLicenseStore((s) => s.activateLicense);
  const clearLicense = useLicenseStore((s) => s.clearLicense);

  const [inputKey, setInputKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isLicenseModalOpen) return null;

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) {
      setFeedback({ type: 'error', message: 'Wpisz klucz licencyjny.' });
      return;
    }

    setLoading(true);
    setFeedback(null);

    const result = await activateLicense(inputKey);
    setLoading(false);

    if (result.success) {
      setFeedback({ type: 'success', message: result.message || 'Licencja PRO została aktywowana!' });
      setInputKey('');
    } else {
      setFeedback({ type: 'error', message: result.error || 'Nie udało się aktywować klucza.' });
    }
  };

  const formattedExpiresAt = expiresAt ? new Date(expiresAt).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) : null;

  const formattedActivatedAt = activatedAt ? new Date(activatedAt).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }) : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.82)',
        backdropFilter: 'blur(12px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setLicenseModalOpen(false);
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--bg-sidebar)',
          border: '1px solid var(--border-light)',
          borderRadius: '18px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.4), transparent)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: isPro
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 88, 12, 0.3))'
                  : 'rgba(99, 102, 241, 0.15)',
                border: isPro ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isPro ? <Crown size={18} color="#fbbf24" /> : <KeyRound size={18} color="#818cf8" />}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {isPro ? 'Zarządzanie Licencją PRO' : 'Aktywacja Licencji PRO'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {isPro ? 'Twój pakiet jest aktywny na tym urządzeniu.' : 'Wprowadź klucz otrzymany po zakupie.'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setLicenseModalOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
            }}
            title="Zamknij"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {feedback && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor:
                  feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                border:
                  feedback.type === 'success'
                    ? '1px solid rgba(16, 185, 129, 0.4)'
                    : '1px solid rgba(244, 63, 94, 0.4)',
                color: feedback.type === 'success' ? '#6ee7b7' : '#fca5a5',
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Active License Info Card */}
          {isPro && licenseKey ? (
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Aktywny Klucz:
                </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '12px', color: '#fbbf24' }}>
                  {licenseKey}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <Clock size={13} color="#38bdf8" />
                  <span>Pozostało: <b style={{ color: '#38bdf8' }}>{daysLeft ?? 0} dni</b></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <Calendar size={13} color="#a5b4fc" />
                  <span>Ważny do: <b style={{ color: 'var(--text-primary)' }}>{formattedExpiresAt}</b></span>
                </div>
              </div>

              {formattedActivatedAt && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  Data aktywacji: {formattedActivatedAt} (Pakiet {days} dni)
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (confirm('Czy na pewno chcesz usunąć klucz licencyjny z tego urządzenia?')) {
                    clearLicense();
                    setFeedback({ type: 'success', message: 'Klucz licencyjny został odpięty.' });
                  }
                }}
                style={{
                  marginTop: '4px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(244, 63, 94, 0.4)',
                  backgroundColor: 'rgba(244, 63, 94, 0.1)',
                  color: '#fca5a5',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Trash2 size={12} />
                <span>Odłącz licencję od tego urządzenia</span>
              </button>
            </div>
          ) : (
            /* License Activation Form */
            <form onSubmit={handleActivate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Wklej swój klucz licencyjny:
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    gap: '8px',
                  }}
                >
                  <KeyRound size={15} color="#818cf8" />
                  <input
                    type="text"
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    placeholder="np. USI-30D-ABCD-EFGH"
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      textTransform: 'uppercase',
                    }}
                  />
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                  Okres 7 lub 30 dni rozpocznie się z chwilą kliknięcia przycisku poniżej.
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{
                  padding: '10px 14px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Weryfikowanie klucza...</span>
                  </>
                ) : (
                  <>
                    <KeyRound size={14} />
                    <span>Aktywuj licencję PRO</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Bottom Buy CTA */}
          <div
            style={{
              paddingTop: '12px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Nie masz jeszcze klucza?
            </span>
            <button
              type="button"
              onClick={() => {
                setLicenseModalOpen(false);
                setPricingModalOpen(true);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fbbf24',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                textDecoration: 'underline',
              }}
            >
              <Crown size={12} />
              <span>Kup dostęp 7 lub 30 dni</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
