import React, { useState } from 'react';
import { AnalysisPointResult, ShadowingResult, SunlightResult } from '../types/geometry';
import { Sun, ShieldCheck, ShieldAlert, Clock, Compass, Eye } from 'lucide-react';

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
    <div className="fixed bottom-6 right-6 w-96 max-h-[85vh] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-5 text-white overflow-y-auto z-50 animate-in fade-in slide-in-from-bottom-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Szczegóły punktu fasady</h3>
            <p className="text-xs text-slate-400">
              X: {point.x.toFixed(2)}m, Y: {point.y.toFixed(2)}m
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 text-lg font-bold p-1"
        >
          ✕
        </button>
      </div>

      {/* § 12 Przesłanianie */}
      <div className="mb-4 bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isCompliant12 ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            )}
            <span className="text-sm font-medium">§ 12 Przesłanianie</span>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              isCompliant12
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {isCompliant12 ? 'SPEŁNIONE' : 'NIESPEŁNIONE'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 mt-2">
          <div className="bg-slate-900/50 p-2 rounded-lg">
            <div className="text-slate-400 text-[10px]">Ciągły kąt wolny:</div>
            <div className="font-bold text-sm text-slate-100">
              {shadowing.maxContinuousFreeSpanDeg.toFixed(1)}°
              <span className="text-slate-400 font-normal text-[10px]"> (min 60°)</span>
            </div>
          </div>
          <div className="bg-slate-900/50 p-2 rounded-lg">
            <div className="text-slate-400 text-[10px]">Suma kątów wolnych:</div>
            <div className="font-bold text-sm text-slate-100">
              {shadowing.totalFreeSpanDeg.toFixed(1)}°
              <span className="text-slate-400 font-normal text-[10px]"> (min 75°)</span>
            </div>
          </div>
        </div>
      </div>

      {/* § 56 Nasłonecznienie */}
      <div className="mb-4 bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-medium">§ 56 Nasłonecznienie (21 III)</span>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              isCompliant56
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {isCompliant56 ? 'SPEŁNIONE' : 'NIESPEŁNIONE'}
          </span>
        </div>

        <div className="flex items-center justify-between bg-slate-900/50 p-2.5 rounded-lg text-xs mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-slate-300">Łączny czas słońca:</span>
          </div>
          <div className="text-sm font-bold text-amber-300">
            {sunlight.totalHours.toFixed(2)}h ({sunlight.totalMinutes} min)
          </div>
        </div>

        {/* Timeline Bar */}
        <div className="text-[10px] text-slate-400 mb-1">Oś nasłonecznienia (godziny badania):</div>
        <div className="flex w-full h-3 rounded-full overflow-hidden bg-slate-950 border border-slate-800">
          {sunlight.timeSlots.map((slot, idx) => (
            <div
              key={idx}
              title={`${slot.time} - ${slot.isDirectSunlight ? 'Słońce' : 'Cień / Brak kąta'}`}
              className={`flex-1 transition-all ${
                slot.isDirectSunlight
                  ? 'bg-amber-400'
                  : slot.isAngleAbove12Deg
                  ? 'bg-slate-700'
                  : 'bg-slate-900'
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-slate-400 mt-1">
          <span>{sunlight.timeSlots[0]?.time}</span>
          <span>{sunlight.timeSlots[Math.floor(sunlight.timeSlots.length / 2)]?.time}</span>
          <span>{sunlight.timeSlots[sunlight.timeSlots.length - 1]?.time}</span>
        </div>
      </div>
    </div>
  );
};
