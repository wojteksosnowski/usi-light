import React from 'react';
import { AnalysisPointResult } from '../types/geometry';
import { Sun, ShieldCheck, ShieldAlert, Clock, Compass, X } from 'lucide-react';

interface PointInspectorModalProps {
  pointResult: AnalysisPointResult | null;
  allPoints?: AnalysisPointResult[];
  activePointId?: string | null;
  onSelectPointId?: (id: string) => void;
  onDeletePointId?: (id: string) => void;
  activeMode?: 'shadowing' | 'sunlight';
  sunlightMethod?: 'raycasting' | 'segments';
  onModeChange?: (mode: 'shadowing' | 'sunlight') => void;
  onClose: () => void;
}

export const PointInspectorModal: React.FC<PointInspectorModalProps> = React.memo(({
  pointResult,
  allPoints = [],
  activePointId,
  onSelectPointId,
  onDeletePointId,
  activeMode = 'shadowing',
  sunlightMethod = 'raycasting',
  onModeChange,
  onClose,
}) => {
  if (!pointResult) return null;

  const { point, shadowing, sunlight } = pointResult;
  const isCompliant12 = shadowing.isCompliant;
  const isCompliant56 = sunlight.isCompliant;
  const isLinijka = sunlightMethod === 'segments' || sunlight.sectors !== undefined;

  return (
    <div className="inspector-card">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '10px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
            <Compass size={18} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#f8fafc' }}>
              {pointResult.label ? `Punkt fasady (${pointResult.label})` : 'Punkt fasady'}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
              X={point.x.toFixed(2)}m, Y={point.y.toFixed(2)}m
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Multiple Pinned Points Tabs */}
      {allPoints.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {allPoints.map((pt, idx) => {
            const isActive = activePointId ? pt.id === activePointId : pt.id === pointResult.id;
            const label = pt.label || `P${idx + 1}`;
            const ptCompliant = (pt.shadowing?.isCompliant ?? true) && (pt.sunlight?.isCompliant ?? true);
            return (
              <div
                key={pt.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: isActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.8)',
                  border: `1px solid ${isActive ? '#38bdf8' : '#334155'}`,
                  color: isActive ? '#38bdf8' : '#cbd5e1',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => onSelectPointId?.(pt.id)}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: ptCompliant ? '#34d399' : '#fb7185',
                    display: 'inline-block',
                  }}
                  title={ptCompliant ? 'Zgodne z przepisami' : 'Wymaga uwagi'}
                />
                <span>{label}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePointId?.(pt.id);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.6)',
                    cursor: 'pointer',
                    padding: '0 2px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Usuń ten punkt"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* § 12 Przesłanianie Box (Clickable to activate shadowing visualization) */}
      <div
        onClick={() => onModeChange?.('shadowing')}
        style={{
          backgroundColor: activeMode === 'shadowing' ? 'rgba(30, 41, 59, 0.9)' : 'rgba(2, 6, 23, 0.7)',
          borderRadius: '12px',
          padding: '12px',
          border: activeMode === 'shadowing' ? '2px solid #34d399' : '1px solid #1e293b',
          marginBottom: '12px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: activeMode === 'shadowing' ? '0 0 16px rgba(52, 211, 153, 0.2)' : 'none',
        }}
        title="Kliknij, aby włączyć wizualizację przesłaniania § 12"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isCompliant12 ? <ShieldCheck size={16} color="#34d399" /> : <ShieldAlert size={16} color="#fb7185" />}
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: activeMode === 'shadowing' ? '#34d399' : '#e2e8f0' }}>
              § 12 Przesłanianie
            </span>
          </div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 'bold',
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: isCompliant12 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
              color: isCompliant12 ? '#6ee7b7' : '#fda4af',
              border: `1px solid ${isCompliant12 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)'}`,
            }}
          >
            {isCompliant12 ? 'ZGODNE' : 'NIEZGODNE'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
          <div style={{ backgroundColor: '#0f172a', padding: '8px 10px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <div style={{ color: '#94a3b8', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Ciągły kąt wolny</div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#f8fafc', marginTop: '2px' }}>
              {shadowing.maxContinuousFreeSpanDeg.toFixed(1)}°
            </div>
          </div>
          <div style={{ backgroundColor: '#0f172a', padding: '8px 10px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <div style={{ color: '#94a3b8', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Łączony kąt</div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#f8fafc', marginTop: '2px' }}>
              {shadowing.totalFreeSpanDeg.toFixed(1)}°
            </div>
          </div>
        </div>
      </div>

      {/* § 56 Nasłonecznienie Box (Clickable to activate Linijka Słońca vs Astro) */}
      <div
        onClick={() => onModeChange?.('sunlight')}
        style={{
          backgroundColor: activeMode === 'sunlight' ? 'rgba(30, 41, 59, 0.9)' : 'rgba(2, 6, 23, 0.7)',
          borderRadius: '12px',
          padding: '12px',
          border: activeMode === 'sunlight' ? (isLinijka ? '2px solid #818cf8' : '2px solid #f59e0b') : '1px solid #1e293b',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: activeMode === 'sunlight' ? (isLinijka ? '0 0 16px rgba(129, 140, 248, 0.25)' : '0 0 16px rgba(245, 158, 11, 0.2)') : 'none',
        }}
        title={isLinijka ? 'Kliknij, aby włączyć wizualizację nasłonecznienia (Linijka Słońca Twarowskiego)' : 'Kliknij, aby włączyć wizualizację nasłonecznienia (Metoda Astronomiczna)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sun size={16} color={isLinijka ? '#a5b4fc' : '#fbbf24'} />
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: activeMode === 'sunlight' ? (isLinijka ? '#a5b4fc' : '#fbbf24') : '#e2e8f0' }}>
              {isLinijka ? '§ 56 Linijka Słońca' : '§ 56 Metoda Astro'}
            </span>
          </div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 'bold',
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: isCompliant56 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
              color: isCompliant56 ? '#6ee7b7' : '#fda4af',
              border: `1px solid ${isCompliant56 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)'}`,
            }}
          >
            {isCompliant56 ? 'ZGODNE' : 'NIEZGODNE'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '8px 10px', borderRadius: '8px', border: '1px solid #1e293b', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
            <Clock size={14} color="#fbbf24" />
            <span>Czas słońca:</span>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fcd34d' }}>
            {sunlight.totalHours.toFixed(2)} h ({sunlight.totalMinutes} min)
          </div>
        </div>

        {/* Timeline Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
            Oś nasłonecznienia:
          </span>
          <span style={{ fontSize: '9px', color: '#cbd5e1' }}>
            Kąt padania na rzucie ≥ 12° (§ 56 ust. 5)
          </span>
        </div>
        <div style={{ position: 'relative', display: 'flex', width: '100%', height: '10px', borderRadius: '5px', overflow: 'hidden', backgroundColor: '#020617', border: '1px solid #1e293b' }}>
          {sunlight.sectors && sunlight.sectors.length > 0 ? (
            sunlight.sectors.map((sec, idx) => {
              const parseTimeDec = (tStr?: string) => {
                if (!tStr) return 12;
                const [hh, mm] = tStr.split(':').map(Number);
                return hh + mm / 60;
              };
              const h1 = parseTimeDec(sec.startTimeStr);
              const h2 = parseTimeDec(sec.endTimeStr);
              // Window 07:00 to 17:00 (10.0 hours)
              const leftPct = Math.max(0, Math.min(100, ((h1 - 7.0) / 10.0) * 100));
              const rightPct = Math.max(0, Math.min(100, ((h2 - 7.0) / 10.0) * 100));
              const widthPct = Math.max(0, rightPct - leftPct);

              return (
                <div
                  key={idx}
                  title={`${sec.startTimeStr} - ${sec.endTimeStr} (${sec.hours.toFixed(2)}h) — ${
                    sec.isDirectSunlight ? 'Bezpośrednie słońce (Kąt ≥ 12°)' : 'Zacienione'
                  }`}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    height: '100%',
                    backgroundColor: sec.isDirectSunlight ? '#f59e0b' : '#334155',
                  }}
                />
              );
            })
          ) : sunlight.timeSlots && sunlight.timeSlots.length > 0 ? (
            sunlight.timeSlots.map((slot, idx) => (
              <div
                key={idx}
                title={`${slot.time} — ${
                  slot.isDirectSunlight
                    ? 'Bezpośrednie słońce (Kąt ≥ 12°)'
                    : slot.isAngleAbove12Deg
                    ? 'Zacienione przez przeszkodę'
                    : 'Brak nasłonecznienia (Kąt padania < 12° lub z tyłu ściany)'
                }`}
                style={{
                  flex: 1,
                  backgroundColor: slot.isDirectSunlight
                    ? '#f59e0b'
                    : slot.isAngleAbove12Deg
                    ? '#334155'
                    : '#020617',
                }}
              />
            ))
          ) : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', fontFamily: 'monospace', marginTop: '4px' }}>
          <span>07:00</span>
          <span>12:00</span>
          <span>17:00</span>
        </div>
      </div>
    </div>
  );
});
