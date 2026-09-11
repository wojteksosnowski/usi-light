import React, { useState } from 'react';
import {
  X,
  Check,
  Zap,
  ShieldCheck,
  KeyRound,
  Loader2,
  Gift,
  Copy,
  Sparkles,
  Crown,
  Clock,
  Calendar,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { useUiStore, useLicenseStore } from '../../store';
import { APP_CONFIG } from '../../config/appConfig';
import { fetchJson } from '../../utils/apiFetch';

const PREVIEW_MODE = APP_CONFIG.previewMode.enabled;

interface ParsedKeyInfo {
  isValidFormat: boolean;
  days: number | null;
  buttonLabel: string;
  isDev: boolean;
}

function parseLicenseKeyInput(rawKey: string): ParsedKeyInfo {
  const clean = rawKey.trim().toUpperCase();
  if (!clean) {
    return { isValidFormat: false, days: null, buttonLabel: '', isDev: false };
  }

  // Master Dev Keys
  if (clean === 'USI-DEV-MASTER-PRO' || clean === 'USI-DEV-PRO-9999' || clean === 'DEV-PRO') {
    return { isValidFormat: true, days: 9999, buttonLabel: 'Aktywuj Dostęp Developerski PRO', isDev: true };
  }

  // Standardowy format klucza: USI-{days}D-{part1}-{part2} (np. USI-1D-ABCD-1234, USI-7D-W1X2-Y3Z4, USI-30D-ABCD-EFGH)
  const regexStandard = /^USI-(\d+)D-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  const match = clean.match(regexStandard);
  if (match) {
    const days = parseInt(match[1], 10);
    const dayLabel = days === 1 ? '1 dzień' : `${days} dni`;
    return { isValidFormat: true, days, buttonLabel: `Aktywuj dostęp ${dayLabel}`, isDev: false };
  }

  // Elastyczny format kluczy USI-
  if (clean.startsWith('USI-') && clean.length >= 14) {
    const dMatch = clean.match(/^USI-(\d+)D/);
    const days = dMatch ? parseInt(dMatch[1], 10) : null;
    const dayLabel = days ? (days === 1 ? '1 dzień' : `${days} dni`) : 'PRO';
    return { isValidFormat: true, days, buttonLabel: `Aktywuj dostęp ${dayLabel}`, isDev: false };
  }

  return { isValidFormat: false, days: null, buttonLabel: '', isDev: false };
}

export const PricingModal: React.FC = () => {
  const isPricingModalOpen = useUiStore((s) => s.isPricingModalOpen);
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
  const [keyActivating, setKeyActivating] = useState(false);
  const [activationFeedback, setActivationFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [loadingPlan, setLoadingPlan] = useState<'7d' | '30d' | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [trialKey, setTrialKey] = useState<string | null>(null);
  const [trialActivating, setTrialActivating] = useState(false);
  const [trialCopied, setTrialCopied] = useState(false);

  const keyInfo = parseLicenseKeyInput(inputKey);

  if (!isPricingModalOpen) return null;

  const handleManualActivate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanKey = inputKey.trim().toUpperCase();
    if (!cleanKey) {
      setActivationFeedback({ type: 'error', message: 'Wprowadź klucz licencyjny przed aktywacją.' });
      return;
    }

    setKeyActivating(true);
    setActivationFeedback(null);

    const result = await activateLicense(cleanKey);
    setKeyActivating(false);

    if (result.success) {
      setActivationFeedback({ type: 'success', message: result.message || 'Licencja PRO została pomyślnie aktywowana!' });
      setInputKey('');
    } else {
      setActivationFeedback({ type: 'error', message: result.error || 'Nie udało się aktywować podanego klucza.' });
    }
  };

  const handleGetTrialKey = async () => {
    try {
      setTrialLoading(true);
      setTrialError(null);

      const { ok: resOk, data } = await fetchJson('/api/license/trial', { method: 'POST' });

      if (!resOk || !data.licenseKey) {
        throw new Error(data.error || 'Nie udało się wygenerować klucza próbnego.');
      }

      setTrialKey(data.licenseKey);
      setInputKey(data.licenseKey);
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
    setActivationFeedback(null);
    const res = await activateLicense(trialKey);
    setTrialActivating(false);
    if (res.success) {
      setActivationFeedback({ type: 'success', message: 'Klucz próbny 7-dniowy został aktywowany!' });
    } else {
      setTrialError(res.error || 'Błąd aktywacji klucza próbnego.');
    }
  };

  const handleCheckout = async (plan: '7d' | '30d') => {
    try {
      setLoadingPlan(plan);
      setCheckoutError(null);

      const { ok: resOk, data } = await fetchJson('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      if (!resOk || !data.url) {
        throw new Error(data.error || 'Nie udało się zainicjalizować płatności Stripe.');
      }

      // Przekierowanie do Stripe Checkout
      window.location.href = data.url;
    } catch (err: any) {
      console.error('Błąd checkoutu:', err);
      setCheckoutError(err.message || 'Wystąpił błąd podczas przekierowania do płatności.');
      setLoadingPlan(null);
    }
  };

  const formattedExpiresAt = expiresAt
    ? new Date(expiresAt).toLocaleDateString('pl-PL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const formattedActivatedAt = activatedAt
    ? new Date(activatedAt).toLocaleDateString('pl-PL', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

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
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-sidebar)',
          border: '1px solid var(--border-light)',
          borderRadius: '18px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflowY: 'auto',
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
            position: 'sticky',
            top: 0,
            zIndex: 10,
            backgroundColor: 'var(--bg-sidebar)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: isPro
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(234, 88, 12, 0.35))'
                  : 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(56, 189, 248, 0.25))',
                border: isPro ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(99, 102, 241, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isPro ? <Crown size={19} color="#fbbf24" /> : <KeyRound size={19} color="#818cf8" />}
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {isPro ? 'Licencja PRO i Rozszerzenia' : 'Klucz Licencyjny i Rozszerzenia PRO'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {isPro
                  ? 'Twój pakiet rozszerzeń jest aktywny. Możesz przedłużyć czas lub zmienić klucz.'
                  : 'Wpisz posiadany klucz, aby natychmiast odblokować funkcje PRO, lub pobierz nowy dostęp.'}
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
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Feedback messages */}
          {activationFeedback && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                backgroundColor:
                  activationFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                border:
                  activationFeedback.type === 'success'
                    ? '1px solid rgba(16, 185, 129, 0.4)'
                    : '1px solid rgba(244, 63, 94, 0.4)',
                color: activationFeedback.type === 'success' ? '#6ee7b7' : '#fca5a5',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {activationFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{activationFeedback.message}</span>
            </div>
          )}

          {checkoutError && (
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
              {checkoutError}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TOP HERO BOX: WPISANIE / AKTYWACJA KLUCZA LUB STATUS AKTYWNEJ LICENCJI */}
          {/* ========================================================================= */}
          {isPro && licenseKey ? (
            /* Stan aktywnej licencji */
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid rgba(245, 158, 11, 0.45)',
                borderRadius: '14px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: '0 4px 20px rgba(245, 158, 11, 0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Crown size={18} color="#fbbf24" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Aktywna Licencja PRO
                  </span>
                </div>
                <div
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: '12px',
                    color: '#fbbf24',
                    letterSpacing: '0.04em',
                  }}
                >
                  {licenseKey}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '10px',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <Clock size={15} color="#38bdf8" />
                  <span>
                    Pozostało: <b style={{ color: '#38bdf8', fontSize: '13px' }}>{daysLeft ?? 0} dni</b>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <Calendar size={15} color="#a5b4fc" />
                  <span>
                    Ważny do: <b style={{ color: 'var(--text-primary)' }}>{formattedExpiresAt || 'Bezterminowo'}</b>
                  </span>
                </div>
              </div>

              {formattedActivatedAt && (
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                  Data aktywacji: {formattedActivatedAt} (Pakiet {days} dni)
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Czy na pewno chcesz usunąć klucz licencyjny z tego urządzenia?')) {
                      clearLicense();
                      setActivationFeedback({ type: 'success', message: 'Klucz licencyjny został odłączony.' });
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(244, 63, 94, 0.4)',
                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                    color: '#fca5a5',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Trash2 size={12} />
                  <span>Odłącz licencję</span>
                </button>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Możesz przedłużyć czas wybierając pakiet poniżej.
                </span>
              </div>
            </div>
          ) : (
            /* Formularz wprowadzania klucza z pełną szerokością i dynamicznym przyciskiem */
            <div
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-light)',
                borderRadius: '14px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.5), rgba(15, 23, 42, 0.5))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <KeyRound size={16} color="#818cf8" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Masz już klucz licencyjny?
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Wpisz lub wklej klucz
                </span>
              </div>

              <form onSubmit={handleManualActivate} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Pełnoszerokościowe pole tekstowe z wyszarzonym wzorcem */}
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: 'var(--bg-input)',
                    border: keyInfo.isValidFormat
                      ? '1px solid rgba(99, 102, 241, 0.6)'
                      : '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    gap: '10px',
                    boxShadow: keyInfo.isValidFormat ? '0 0 12px rgba(99, 102, 241, 0.2)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <KeyRound size={16} color={keyInfo.isValidFormat ? '#818cf8' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
                  <input
                    type="text"
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    placeholder="Wpisz lub wklej klucz np. USI-30D-ABCD-EFGH"
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  />
                  {inputKey && (
                    <button
                      type="button"
                      onClick={() => setInputKey('')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Wyczyść pole"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Dynamiczny przycisk aktywacji pojawiający się po wprowadzeniu właściwego klucza */}
                {keyInfo.isValidFormat && (
                  <button
                    type="submit"
                    disabled={keyActivating}
                    className="btn-primary"
                    style={{
                      width: '100%',
                      padding: '11px 16px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: keyActivating ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      animation: 'fadeIn 0.2s ease-in-out',
                    }}
                  >
                    {keyActivating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Weryfikowanie klucza...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>{keyInfo.buttonLabel}</span>
                        <ArrowRight size={15} />
                      </>
                    )}
                  </button>
                )}

                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Wzorce kluczy: <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>USI-1D-XXXX-XXXX</span>, <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>USI-7D-XXXX-XXXX</span>, <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>USI-30D-XXXX-XXXX</span>. Czas licencji rozpoczyna się w momencie aktywacji.
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SEKCJA POZYSKIWANIA KLUCZA: OKRES PRÓBNY LUB PAKIETY ZAKUPU */}
          {/* ========================================================================= */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Nie masz klucza? Pobierz lub zamów dostęp
              </span>
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
                  Zakupy przez Stripe są chwilowo wstrzymane. Wygeneruj darmowy klucz PRO ważny 7 dni i wypróbuj pełną funkcjonalność (import działek, obrysów ULDK, DXF, modyfikatory).
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
                          <span>Aktywuj ten klucz natychmiast</span>
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
                        <span>Wygeneruj bezpłatny klucz na 7 dni</span>
                      </>
                    )}
                  </button>
                )}
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
                  border: '1px solid var(--border-color)',
                  borderRadius: '14px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  position: 'relative',
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
                      <span>Eksport geometrii do DXF</span>
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
                  className={PREVIEW_MODE ? 'btn-secondary' : 'btn-primary'}
                  style={{
                    padding: '10px 14px',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    gap: '8px',
                    opacity: PREVIEW_MODE ? 0.5 : 1,
                    cursor: PREVIEW_MODE ? 'not-allowed' : loadingPlan !== null ? 'not-allowed' : 'pointer',
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
                      <Zap size={14} color={PREVIEW_MODE ? 'var(--text-primary)' : '#ffffff'} />
                      <span>{PREVIEW_MODE ? 'Dostępne wkrótce' : 'Kup dostęp 30 dni'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Footer security badge */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
            }}
          >
            <ShieldCheck size={16} color="#10b981" style={{ flexShrink: 0 }} />
            <span>Bezpieczna aktywacja licencji oraz płatności Stripe (BLIK, Karty, P24, Apple Pay).</span>
          </div>
        </div>
      </div>
    </div>
  );
};


