import React, { useState } from 'react';
import {
  X,
  Check,
  Zap,
  Crown,
  ShieldCheck,
  FileSpreadsheet,
  Download,
  Building2,
  KeyRound,
  Loader2,
  Gift,
  Copy,
  Sparkles,
} from 'lucide-react';
import { useUiStore, useLicenseStore } from '../../store';
import { APP_CONFIG } from '../../config/appConfig';

const PREVIEW_MODE = APP_CONFIG.previewMode.enabled;

export const PricingModal: React.FC = () => {
  const isPricingModalOpen = useUiStore((s) => s.isPricingModalOpen);
  const setPricingModalOpen = useUiStore((s) => s.setPricingModalOpen);
  const setLicenseModalOpen = useUiStore((s) => s.setLicenseModalOpen);
  const activateLicense = useLicenseStore((s) => s.activateLicense);

  const [loadingPlan, setLoadingPlan] = useState<'7d' | '30d' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [trialKey, setTrialKey] = useState<string | null>(null);
  const [trialActivating, setTrialActivating] = useState(false);
  const [trialCopied, setTrialCopied] = useState(false);

  if (!isPricingModalOpen) return null;

  const handleGetTrialKey = async () => {
    try {
      setTrialLoading(true);
      setTrialError(null);

      const res = await fetch('/api/license/trial', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.licenseKey) {
        throw new Error(data.error || 'Nie udało się wygenerować klucza próbnego.');
      }

      setTrialKey(data.licenseKey);
    } catch (err: any) {
      setTrialError(err.message || 'Wystąpił błąd podczas generowania klucza próbnego.');
    } finally {
      setTrialLoading(false);
    }
  };

  const handleCopyTrialKey = () => {
    if (!trialKey) return;
    navigator.clipboard.writeText(trialKey);
    setTrialCopied(true);
    setTimeout(() => setTrialCopied(false), 2000);
  };

  const handleActivateTrialKey = async () => {
    if (!trialKey) return;
    setTrialActivating(true);
    await activateLicense(trialKey);
    setTrialActivating(false);
    setPricingModalOpen(false);
  };

  const handleCheckout = async (plan: '7d' | '30d') => {
    try {
      setLoadingPlan(plan);
      setError(null);

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Nie udało się zainicjalizować płatności Stripe.');
      }

      // Przekierowanie do Stripe Checkout
      window.location.href = data.url;
    } catch (err: any) {
      console.error('Błąd checkoutu:', err);
      setError(err.message || 'Wystąpił błąd podczas przekierowania do płatności.');
      setLoadingPlan(null);
    }
  };

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
        if (e.target === e.currentTarget) setPricingModalOpen(false);
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
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
            padding: '18px 22px',
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
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 88, 12, 0.3))',
                border: '1px solid rgba(245, 158, 11, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Crown size={20} color="#fbbf24" />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Rozszerz Pełne Możliwości Światło PRO
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Wybierz dostęp czasowy dopasowany do Twojego projektu. Czas biegnie od momentu aktywacji.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPricingModalOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
            }}
            title="Zamknij"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                backgroundColor: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.4)',
                color: '#fca5a5',
                fontSize: '12px',
              }}
            >
              {error}
            </div>
          )}

          {/* Pricing Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Plan 7 Dni */}
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '14px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px',
                transition: 'all 0.2s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Dostęp 7 Dni
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                    }}
                  >
                    Projektowy
                  </span>
                </div>

                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.4' }}>
                  Szybki dostęp na pojedynczą ekspertyzę lub weryfikację nasłonecznienia.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11.5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                    <Check size={14} color="#10b981" style={{ flexShrink: 0 }} />
                    <span>Import działek geodezyjnych i obrysów budynków (ULDK)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                    <Check size={14} color="#10b981" style={{ flexShrink: 0 }} />
                    <span>Eksport geometrii do DXF</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                    <Check size={14} color="#64748b" style={{ flexShrink: 0 }} />
                    <span>Linki współdzielenia ważne 14 dni</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCheckout('7d')}
                disabled={loadingPlan !== null || PREVIEW_MODE}
                className="btn-secondary"
                style={{
                  padding: '10px 14px',
                  fontWeight: 600,
                  fontSize: '12.5px',
                  gap: '8px',
                  opacity: PREVIEW_MODE ? 0.5 : 1,
                  cursor: PREVIEW_MODE ? 'not-allowed' : loadingPlan !== null ? 'not-allowed' : 'pointer',
                }}
                title={PREVIEW_MODE ? 'Dostępne wkrótce — trwa okres zapoznawczy' : undefined}
              >
                {loadingPlan === '7d' ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Przygotowywanie...</span>
                  </>
                ) : (
                  <>
                    <Zap size={14} color="#38bdf8" />
                    <span>{PREVIEW_MODE ? 'Dostępne wkrótce' : 'Wybierz pakiet 7 dni'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Plan 30 Dni (Polecany) */}
            <div
              style={{
                backgroundColor: 'rgba(19, 29, 56, 0.95)',
                border: '2px solid rgba(245, 158, 11, 0.6)',
                borderRadius: '14px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px',
                position: 'relative',
                boxShadow: '0 8px 24px rgba(245, 158, 11, 0.15)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Dostęp 30 Dni
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(245, 158, 11, 0.2)',
                      color: '#fbbf24',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                    }}
                  >
                    Pełny Miesiąc
                  </span>
                </div>

                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: '1.4' }}>
                  Kompletny pakiet do stałej pracy nad projektami architektonicznymi.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11.5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                    <Check size={14} color="#10b981" style={{ flexShrink: 0 }} />
                    <span>Import działek geodezyjnych i obrysów budynków (ULDK)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                    <Check size={14} color="#10b981" style={{ flexShrink: 0 }} />
                    <span>Eksport DXF do CAD</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontWeight: 600 }}>
                    <Check size={14} color="#fbbf24" style={{ flexShrink: 0 }} />
                    <span>Linki współdzielenia ważne 30 dni</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCheckout('30d')}
                disabled={loadingPlan !== null || PREVIEW_MODE}
                className="btn-primary"
                style={{
                  padding: '10px 14px',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  gap: '8px',
                  opacity: PREVIEW_MODE ? 0.5 : 1,
                  cursor: PREVIEW_MODE ? 'not-allowed' : loadingPlan !== null ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                }}
                title={PREVIEW_MODE ? 'Dostępne wkrótce — trwa okres zapoznawczy' : undefined}
              >
                {loadingPlan === '30d' ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Przygotowywanie...</span>
                  </>
                ) : (
                  <>
                    <Crown size={15} color="#ffffff" />
                    <span>{PREVIEW_MODE ? 'Dostępne wkrótce' : 'Kup dostęp 30 dni'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Tryb zapoznawczy: darmowy klucz dostępu na 7 dni */}
          {PREVIEW_MODE && (
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: '14px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Gift size={16} color="#34d399" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Okres zapoznawczy: bezpłatny klucz dostępu na 7 dni
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Zakupy przez Stripe są chwilowo wstrzymane. Wygeneruj darmowy klucz PRO ważny 7 dni i wypróbuj pełną funkcjonalność (import działek, DXF, modyfikatory).
              </div>

              {trialError && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(244, 63, 94, 0.15)',
                    border: '1px solid rgba(244, 63, 94, 0.4)',
                    color: '#fca5a5',
                    fontSize: '11px',
                  }}
                >
                  {trialError}
                </div>
              )}

              {trialKey ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      border: '2px solid rgba(16, 185, 129, 0.5)',
                      borderRadius: '12px',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'monospace', color: '#34d399', letterSpacing: '0.03em' }}>
                      {trialKey}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyTrialKey}
                      className="btn-secondary"
                      style={{ width: 'auto', padding: '6px 10px', fontSize: '11px', gap: '5px' }}
                      title="Skopiuj klucz do schowka"
                    >
                      {trialCopied ? (
                        <>
                          <Check size={12} color="#10b981" />
                          <span style={{ color: '#10b981' }}>Skopiowano</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>Kopiuj</span>
                        </>
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleActivateTrialKey}
                    disabled={trialActivating}
                    className="btn-primary"
                    style={{
                      padding: '9px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      cursor: trialActivating ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {trialActivating ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Aktywowanie...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        <span>Aktywuj klucz na tym urządzeniu</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGetTrialKey}
                  disabled={trialLoading}
                  className="btn-secondary"
                  style={{
                    padding: '10px 14px',
                    fontWeight: 600,
                    fontSize: '12.5px',
                    gap: '8px',
                    borderColor: 'rgba(16, 185, 129, 0.5)',
                    cursor: trialLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {trialLoading ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Generowanie klucza...</span>
                    </>
                  ) : (
                    <>
                      <Gift size={14} color="#34d399" />
                      <span>Uzyskaj bezpłatny klucz na 7 dni</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Footer information & Activate existing key button */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <ShieldCheck size={16} color="#10b981" style={{ flexShrink: 0 }} />
              <span>Bezpieczna płatność Stripe (BLIK, Karty, P24, Apple Pay).</span>
            </div>

            <button
              type="button"
              onClick={() => {
                setPricingModalOpen(false);
                setLicenseModalOpen(true);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                textDecoration: 'underline',
              }}
            >
              <KeyRound size={12} />
              <span>Mam już klucz</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
