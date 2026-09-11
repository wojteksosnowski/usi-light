import React, { useEffect, useState } from 'react';
import {
  X,
  CheckCircle2,
  Copy,
  Download,
  Check,
  Crown,
  KeyRound,
  Loader2,
  Sparkles,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useLicenseStore, useUiStore } from '../../store';
import { fetchJson, downloadLicenseKeyFile } from '../../utils/apiFetch';

export const PaymentSuccessModal: React.FC = () => {
  const isPaymentSuccessModalOpen = useUiStore((s) => s.isPaymentSuccessModalOpen);
  const setPaymentSuccessModalOpen = useUiStore((s) => s.setPaymentSuccessModalOpen);
  const paymentSuccessSessionId = useUiStore((s) => s.paymentSuccessSessionId);
  const setPaymentSuccessSessionId = useUiStore((s) => s.setPaymentSuccessSessionId);

  const activateLicense = useLicenseStore((s) => s.activateLicense);
  const isPro = useLicenseStore((s) => s.isPro);

  const [licenseKey, setLicenseKey] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activating, setActivating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPaymentSuccessModalOpen || !paymentSuccessSessionId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    // Wystrzał confetti z okazji udanego zakupu
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#38bdf8', '#f59e0b', '#10b981', '#6366f1'],
      });
    } catch (e) {
      // ignore
    }

    const fetchSession = async () => {
      try {
        const { ok: resOk, data } = await fetchJson(`/api/stripe/verify-session?session_id=${encodeURIComponent(paymentSuccessSessionId)}`);

        if (isMounted) {
          if (resOk && data.success && data.licenseKey) {
            setLicenseKey(data.licenseKey);
            setDays(data.days);
            setCustomerEmail(data.customerEmail);

            // Automatyczne pobranie pliku TXT z kluczem
            try {
              downloadLicenseKeyFile(data.licenseKey, data.days || 30, `Pakiet ${data.days || 30} Dni PRO`);
            } catch (dlErr) {
              console.warn('Błąd pobierania pliku TXT:', dlErr);
            }
          } else {
            setError(data.error || 'Nie udało się pobrać szczegółów transakcji.');
          }
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Błąd połączenia z serwerem licencji.');
          setLoading(false);
        }
      }
    };

    fetchSession();

    return () => {
      isMounted = false;
    };
  }, [isPaymentSuccessModalOpen, paymentSuccessSessionId]);

  if (!isPaymentSuccessModalOpen) return null;

  const handleCopy = () => {
    if (!licenseKey) return;
    navigator.clipboard.writeText(licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivateNow = async () => {
    if (!licenseKey) return;
    setActivating(true);
    await activateLicense(licenseKey);
    setActivating(false);
  };

  const handleClose = () => {
    setPaymentSuccessModalOpen(false);
    setPaymentSuccessSessionId(null);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.85)',
        backdropFilter: 'blur(14px)',
        zIndex: 110,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: 'var(--bg-sidebar)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(16, 185, 129, 0.1))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid rgba(16, 185, 129, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2 size={22} color="#10b981" />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Płatność Zakończona Sukcesem!
              </div>
              <div style={{ fontSize: '11px', color: '#6ee7b7' }}>
                Twój klucz licencyjny został wygenerowany.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
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
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '30px 0' }}>
              <Loader2 size={32} className="animate-spin" color="#fbbf24" />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Pobieranie i weryfikacja Twojej licencji ze Stripe...
              </span>
            </div>
          ) : error ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                backgroundColor: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.4)',
                color: '#fca5a5',
                fontSize: '12px',
              }}
            >
              {error}
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Dziękujemy za zakup pakietu <b>{days} dni PRO</b>. Zapisz poniższy klucz licencyjny w bezpiecznym miejscu (został również przesłany w potwierdzeniu transakcji).
              </div>

              {/* License Key Display Box */}
              <div
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '2px solid rgba(245, 158, 11, 0.5)',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <KeyRound size={20} color="#fbbf24" />
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Twój Klucz Licencyjny:
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace', color: '#fbbf24', letterSpacing: '0.04em' }}>
                      {licenseKey}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => licenseKey && downloadLicenseKeyFile(licenseKey, days || 30, `Pakiet ${days || 30} Dni PRO`)}
                    className="btn-secondary"
                    style={{
                      width: 'auto',
                      padding: '8px 10px',
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Pobierz klucz jako plik tekstowy (.txt)"
                  >
                    <Download size={14} color="#fbbf24" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="btn-secondary"
                    style={{
                      width: 'auto',
                      padding: '8px 12px',
                      fontSize: '11px',
                      gap: '5px',
                    }}
                    title="Skopiuj klucz do schowka"
                  >
                    {copied ? (
                      <>
                        <Check size={13} color="#10b981" />
                        <span style={{ color: '#10b981' }}>Skopiowano</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>Kopiuj</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Quick Activate CTA */}
              {isPro ? (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: '#6ee7b7',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={18} color="#10b981" />
                  <span>Licencja PRO jest już aktywna na tym urządzeniu!</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleActivateNow}
                  disabled={activating}
                  className="btn-primary"
                  style={{
                    padding: '12px 16px',
                    fontSize: '13px',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                    cursor: activating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {activating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Aktywowanie na tym urządzeniu...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Aktywuj licencję teraz na tym urządzeniu</span>
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
