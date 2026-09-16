import React, { useMemo } from 'react';
import { Layers, Sun, RotateCcw } from 'lucide-react';
import { useSolarAnalysisStore, useUiStore } from '../../../store';
import { AstroSolarSystem, LinijkaSolarSystem } from '../../../utils/solar';

/**
 * Formatuje liczbę godzin dziesiętnych na format zegarowy HH:MM
 */
function formatClockTime(hours: number): string {
  const totalM = Math.round(hours * 60);
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Formatuje odchylenie od górowania słońca (w godzinach) na format ±HH:MM
 */
function formatLinijkaOffset(offsetHours: number): string {
  const totalM = Math.round(offsetHours * 60);
  if (totalM === 0) return '±00:00 (Górowanie)';
  const sign = totalM > 0 ? '+' : '-';
  const absM = Math.abs(totalM);
  const h = Math.floor(absM / 60);
  const m = absM % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const algorithmButtonBaseStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: '5px',
  fontSize: '10px',
  fontWeight: 700,
  cursor: 'pointer',
  border: 'none',
  letterSpacing: '0.02em',
  transition: 'all 0.15s ease',
};

/**
 * Kafelek widoku Masterplan White:
 * 1. Przełącznik algorytmu renderowania cieni (A123 vs A456).
 * 2. Suwak godziny słońca (metoda zegarowa Astro lub odchylenie ±HH:MM dla Linijki).
 */
export const MasterplanShadowAlgorithmCard: React.FC = () => {
  const viewMode2D = useUiStore((s) => s.viewMode2D);
  const algorithm = useSolarAnalysisStore((s) => s.masterplanShadowAlgorithm);
  const setAlgorithm = useSolarAnalysisStore((s) => s.setMasterplanShadowAlgorithm);
  const sunlightMethod = useSolarAnalysisStore((s) => s.sunlightMethod);
  const hourFraction = useSolarAnalysisStore((s) => s.masterplanHourFraction);
  const setHourFraction = useSolarAnalysisStore((s) => s.setMasterplanHourFraction);
  const settings = useSolarAnalysisStore((s) => s.settings);

  const isLinijka = sunlightMethod === 'segments';

  // Wyznaczamy górowanie dla metody Astro
  const astroSystem = useMemo(() => {
    return new AstroSolarSystem(settings.latitude, settings.longitude, settings.equinoxDate);
  }, [settings.latitude, settings.longitude, settings.equinoxDate]);

  // Wartość domyślna (południe / górowanie)
  const defaultHour = isLinijka ? 12.0 : (astroSystem.solarNoonDecimal || 12.0);

  // Zakres suwaka
  // Astro: standardowo od 6:00 do 18:00 (godziny zegarowe)
  // Linijka: od 7.0 (12:00 - 5h) do 17.0 (12:00 + 5h)
  const minHour = isLinijka ? 7.0 : 6.0;
  const maxHour = isLinijka ? 17.0 : 18.0;
  const step = 5 / 60; // krok co 5 minut (0.08333h)

  // Wyświetlana etykieta godziny
  const displayLabel = isLinijka
    ? formatLinijkaOffset(hourFraction - 12.0)
    : `${formatClockTime(hourFraction)}${Math.abs(hourFraction - astroSystem.solarNoonDecimal) < 0.04 ? ' (Górowanie)' : ''}`;

  if (viewMode2D !== 'masterplan_white') return null;

  return (
    <div className="ui-card">
      <div className="ui-title">
        <span>Widok biały (Masterplan)</span>
        <Layers size={14} color="var(--accent-amber)" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* 1. Przełącznik algorytmu cienia */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>Algorytm cienia:</span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              borderRadius: '7px',
              padding: '2px',
              border: '1px solid var(--border-light)',
            }}
          >
            <button
              type="button"
              onClick={() => setAlgorithm('legacy')}
              title="Algorytm A123 (Obecny) — 3 próbki penumbry (union poligonów)"
              style={{
                ...algorithmButtonBaseStyle,
                backgroundColor: algorithm === 'legacy' ? 'rgba(245,158,11,0.25)' : 'transparent',
                color: algorithm === 'legacy' ? 'var(--accent-lock)' : 'var(--text-muted)',
              }}
            >
              A123
            </button>
            <button
              type="button"
              onClick={() => setAlgorithm('soft')}
              title="Algorytm A456 — pojedynczy surowy obrys cienia podstawowego (umbra)"
              style={{
                ...algorithmButtonBaseStyle,
                backgroundColor: algorithm === 'soft' ? 'rgba(99,102,241,0.25)' : 'transparent',
                color: algorithm === 'soft' ? 'var(--accent-indigo)' : 'var(--text-muted)',
              }}
            >
              A456
            </button>
          </div>
        </div>

        {/* 2. Suwak godziny słońca */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            borderRadius: '8px',
            padding: '8px 10px',
            border: '1px solid var(--border-light)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '10.5px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)' }}>
              <Sun size={12} color={isLinijka ? 'var(--accent-indigo)' : 'var(--accent-amber)'} />
              <span>Godzina słońca:</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '11px',
                  color: isLinijka ? 'var(--accent-indigo)' : 'var(--accent-amber)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {displayLabel}
              </span>
              <button
                type="button"
                onClick={() => setHourFraction(defaultHour)}
                title="Przywróć moment górowania słońca"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  borderRadius: '3px',
                }}
              >
                <RotateCcw size={11} />
              </button>
            </div>
          </div>

          <input
            type="range"
            min={minHour}
            max={maxHour}
            step={step}
            value={hourFraction}
            onChange={(e) => setHourFraction(parseFloat(e.target.value))}
            style={{
              width: '100%',
              accentColor: isLinijka ? 'var(--accent-indigo)' : 'var(--accent-amber)',
              cursor: 'pointer',
              margin: '2px 0',
            }}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '9px',
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span>{isLinijka ? '-05:00' : '06:00'}</span>
            <span style={{ fontSize: '8.5px', color: 'var(--text-secondary)', opacity: 0.8 }}>
              {isLinijka ? 'Linijka (±od górowania)' : 'Astro (czas zegarowy)'}
            </span>
            <span>{isLinijka ? '+05:00' : '18:00'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
