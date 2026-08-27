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
    <div className="absolute top-4 right-4 w-96 max-h-[90vh] bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-5 text-white overflow-y-auto z-40 animate-in fade-in slide-in-from-right-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Punkt pomiarowy fasady</h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Współrzędne: X={point.x.toFixed(2)}m, Y={point.y.toFixed(2)}m
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* § 12 Przesłanianie Box */}
      <div className="mb-4 bg-slate-950/60 rounded-xl p-3.5 border border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            {isCompliant12 ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            )}
            <span className="text-xs font-bold text-slate-200">§ 12 Przesłanianie</span>
          </div>
          <span
            className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase ${
              isCompliant12
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {isCompliant12 ? 'ZGODNE' : 'NIEZGODNE'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80">
            <div className="text-slate-400 text-[10px] uppercase font-semibold">Ciągły kąt wolny</div>
            <div className="font-bold text-base text-slate-100 mt-0.5">
              {shadowing.maxContinuousFreeSpanDeg.toFixed(1)}°
            </div>
            <div className="text-slate-500 text-[10px]">Wymóg: min. 60.0°</div>
          </div>
          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80">
            <div className="text-slate-400 text-[10px] uppercase font-semibold">Suma kątów wolnych</div>
            <div className="font-bold text-base text-slate-100 mt-0.5">
              {shadowing.totalFreeSpanDeg.toFixed(1)}°
            </div>
            <div className="text-slate-500 text-[10px]">Wymóg: min. 75.0°</div>
          </div>
        </div>
      </div>

      {/* § 56 Nasłonecznienie Box */}
      <div className="mb-2 bg-slate-950/60 rounded-xl p-3.5 border border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-slate-200">§ 56 Nasłonecznienie (21 III)</span>
          </div>
          <span
            className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase ${
              isCompliant56
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {isCompliant56 ? 'ZGODNE' : 'NIEZGODNE'}
          </span>
        </div>

        <div className="flex items-center justify-between bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 mb-3">
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-slate-300 font-medium">Czas słońca:</span>
          </div>
          <div className="text-base font-bold text-amber-300">
            {sunlight.totalHours.toFixed(2)} h ({sunlight.totalMinutes} min)
          </div>
        </div>

        {/* Timeline Bar */}
        <div className="text-[10px] text-slate-400 font-semibold uppercase mb-1.5">
          Wykres nasłonecznienia minuta po minucie:
        </div>
        <div className="flex w-full h-3 rounded-full overflow-hidden bg-slate-950 border border-slate-800">
          {sunlight.timeSlots.map((slot, idx) => (
            <div
              key={idx}
              title={`${slot.time} - ${slot.isDirectSunlight ? 'Bezpośrednie słońce' : 'Cień / Brak kąta'}`}
              className={`flex-1 transition-all ${
                slot.isDirectSunlight
                  ? 'bg-amber-400'
                  : slot.isAngleAbove12Deg
                  ? 'bg-slate-700'
                  : 'bg-slate-950'
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
          <span>{sunlight.timeSlots[0]?.time}</span>
          <span>{sunlight.timeSlots[Math.floor(sunlight.timeSlots.length / 2)]?.time}</span>
          <span>{sunlight.timeSlots[sunlight.timeSlots.length - 1]?.time}</span>
        </div>
      </div>
    </div>
  );
};
