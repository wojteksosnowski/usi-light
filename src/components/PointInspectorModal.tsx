import React from 'react';
import { AnalysisPointResult } from '../types/geometry';
import { Sun, ShieldCheck, ShieldAlert, Clock, Compass, X } from 'lucide-react';

interface PointInspectorModalProps {
  pointResult: AnalysisPointResult | null;
  onClose: () => void;
}

export const PointInspectorModal: React.FC<PointInspectorModalProps> = ({
  pointResult,
  onClose,
}) => {
  if (!pointResult) return null;

  const { point, shadowing, sunlight } = pointResult;
  const isCompliant12 = shadowing.isCompliant;
  const isCompliant56 = sunlight.isCompliant;

  return (
    <div className="inspector-card">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '10px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
            <Compass size={18} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#f8fafc' }}>Punkt fasady</div>
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

      {/* § 12 Przesłanianie Box */}
      <div style={{ backgroundColor: 'rgba(2, 6, 23, 0.7)', borderRadius: '12px', padding: '12px', border: '1px solid #1e293b', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isCompliant12 ? <ShieldCheck size={16} color="#34d399" /> : <ShieldAlert size={16} color="#fb7185" />}
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#e2e8f0' }}>§ 12 Przesłanianie</span>
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
            <div style={{ color: '#64748b', fontSize: '9px' }}>Wymóg: min. 60.0°</div>
          </div>
          <div style={{ backgroundColor: '#0f172a', padding: '8px 10px', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <div style={{ color: '#94a3b8', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Kąt w oknie (przeszkoda ≤15°)</div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#f8fafc', marginTop: '2px' }}>
              {shadowing.totalFreeSpanDeg.toFixed(1)}°
            </div>
            <div style={{ color: '#64748b', fontSize: '9px' }}>Wymóg: min. 60° w oknie ≥75°</div>
          </div>
        </div>
      </div>

      {/* § 56 Nasłonecznienie Box */}
      <div style={{ backgroundColor: 'rgba(2, 6, 23, 0.7)', borderRadius: '12px', padding: '12px', border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sun size={16} color="#fbbf24" />
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#e2e8f0' }}>§ 56 Nasłonecznienie (21 III)</span>
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
        <div style={{ display: 'flex', width: '100%', height: '10px', borderRadius: '5px', overflow: 'hidden', backgroundColor: '#020617', border: '1px solid #1e293b' }}>
          {sunlight.timeSlots.map((slot, idx) => (
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
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', fontFamily: 'monospace', marginTop: '4px' }}>
          <span>{sunlight.timeSlots[0]?.time}</span>
          <span>{sunlight.timeSlots[Math.floor(sunlight.timeSlots.length / 2)]?.time}</span>
          <span>{sunlight.timeSlots[sunlight.timeSlots.length - 1]?.time}</span>
        </div>
      </div>
    </div>
  );
};
