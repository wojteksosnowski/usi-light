import React, { useState, useMemo, useEffect } from 'react';
import { CadCanvas } from './components/CadCanvas';
import { PointInspectorModal } from './components/PointInspectorModal';
import { BuildingLoop, AnalysisPointResult, ProjectSettings } from './types/geometry';
import { createSampleBuildings, parseDxfContent } from './utils/dxfParser';
import { runFullAnalysis } from './engine/analysisEngine';
import {
  Sun,
  Shield,
  Layers,
  Upload,
  RotateCcw,
  Sparkles,
  Building,
  CheckCircle2,
  AlertTriangle,
  Move,
  Eye,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Compass,
  FileSpreadsheet,
} from 'lucide-react';

export const App: React.FC = () => {
  // State
  const [buildings, setBuildings] = useState<BuildingLoop[]>(createSampleBuildings());
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>('bldg-1');
  const [selectedPointResult, setSelectedPointResult] = useState<AnalysisPointResult | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Settings
  const [settings, setSettings] = useState<ProjectSettings>({
    latitude: 52.2297, // Warszawa
    longitude: 21.0122,
    isCityCentreDefault: false,
    samplingInterval: 0.5,
    equinoxDate: 'spring',
  });

  // Layer Visibility
  const [showNormals, setShowNormals] = useState<boolean>(false);
  const [showShadowingLines, setShowShadowingLines] = useState<boolean>(true);
  const [showSunlightLines, setShowSunlightLines] = useState<boolean>(true);

  // Run Realtime Calculation
  const analysisResults = useMemo(() => {
    return runFullAnalysis(buildings, settings);
  }, [buildings, settings]);

  // Overall Statistics
  const stats = useMemo(() => {
    const total = analysisResults.length;
    if (total === 0) return { total: 0, compliant12: 0, compliant56: 0, pct12: 100, pct56: 100 };

    const c12 = analysisResults.filter((r) => r.shadowing.isCompliant).length;
    const c56 = analysisResults.filter((r) => r.sunlight.isCompliant).length;

    return {
      total,
      compliant12: c12,
      compliant56: c56,
      pct12: Math.round((c12 / total) * 100),
      pct56: Math.round((c56 / total) * 100),
    };
  }, [analysisResults]);

  // Selected building object
  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);

  // Move building handler
  const handleBuildingMove = (id: string, dx: number, dy: number) => {
    setBuildings((prev) =>
      prev.map((bldg) => {
        if (bldg.id !== id) return bldg;
        const newVertices = bldg.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy }));
        const newSegments = bldg.segments.map((s) => ({
          ...s,
          p1: { x: s.p1.x + dx, y: s.p1.y + dy },
          p2: { x: s.p2.x + dx, y: s.p2.y + dy },
        }));
        return {
          ...bldg,
          vertices: newVertices,
          segments: newSegments,
        };
      })
    );
  };

  // Update selected building property
  const updateSelectedBuilding = (fields: Partial<BuildingLoop>) => {
    if (!selectedBuildingId) return;
    setBuildings((prev) =>
      prev.map((bldg) => {
        if (bldg.id !== selectedBuildingId) return bldg;
        const updated = { ...bldg, ...fields };
        if (
          fields.defaultHeight !== undefined ||
          fields.hWindowBottom !== undefined ||
          fields.isCityCentre !== undefined
        ) {
          updated.segments = updated.segments.map((s) => ({
            ...s,
            hTop: fields.defaultHeight ?? s.hTop,
            hWindowBottom: fields.hWindowBottom ?? s.hWindowBottom,
            isCityCentre: fields.isCityCentre ?? s.isCityCentre,
          }));
        }
        return updated;
      })
    );
  };

  // Handle DXF File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseDxfContent(text);
        if (parsed.length > 0) {
          setBuildings(parsed);
          setSelectedBuildingId(parsed[0].id);
          setSelectedPointResult(null);
        } else {
          alert('Nie znaleziono zamkniętych polilinii w pliku DXF.');
        }
      } catch (err) {
        alert('Błąd podczas parsowania pliku DXF.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden select-none">
      {/* Collapsible Left Sidebar */}
      <aside
        className={`relative h-full bg-slate-900/95 backdrop-blur-md border-r border-slate-800 flex flex-col transition-all duration-300 z-30 shadow-2xl ${
          isSidebarOpen ? 'w-96 min-w-[24rem]' : 'w-0 min-w-0 border-r-0 overflow-hidden'
        }`}
      >
        {/* App Header */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 via-indigo-600 to-blue-600 shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-wide text-white flex items-center gap-2">
                USI Light <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">2.5D CAD</span>
              </h1>
              <p className="text-xs text-slate-400">Analiza nasłonecznienia & przesłaniania</p>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            title="Schowaj panel boczny"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          {/* Section: Status Bilansu */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Zbiorczy Bilans Zgodności</span>
              <span className="text-[11px] font-medium text-slate-500">{stats.total} pkt pomiarowych</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* § 12 Card */}
              <div
                className={`p-3.5 rounded-xl border transition-all shadow-sm ${
                  stats.pct12 === 100
                    ? 'bg-emerald-950/25 border-emerald-500/30'
                    : 'bg-rose-950/25 border-rose-500/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span>§ 12 Przesłan.</span>
                  </div>
                  {stats.pct12 === 100 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  )}
                </div>
                <div className="text-2xl font-black tracking-tight text-white mb-1">
                  {stats.pct12}%
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-400 h-full transition-all duration-500"
                    style={{ width: `${stats.pct12}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5">
                  Spełnione: <span className="text-slate-200 font-semibold">{stats.compliant12}</span> / {stats.total}
                </div>
              </div>

              {/* § 56 Card */}
              <div
                className={`p-3.5 rounded-xl border transition-all shadow-sm ${
                  stats.pct56 >= 80
                    ? 'bg-amber-950/25 border-amber-500/30'
                    : 'bg-rose-950/25 border-rose-500/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                    <Sun className="w-4 h-4 text-amber-400" />
                    <span>§ 56 Nasłon.</span>
                  </div>
                  {stats.pct56 >= 80 ? (
                    <CheckCircle2 className="w-4 h-4 text-amber-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  )}
                </div>
                <div className="text-2xl font-black tracking-tight text-white mb-1">
                  {stats.pct56}%
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-400 h-full transition-all duration-500"
                    style={{ width: `${stats.pct56}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5">
                  Spełnione: <span className="text-slate-200 font-semibold">{stats.compliant56}</span> / {stats.total}
                </div>
              </div>
            </div>
          </div>

          {/* Section: Przełączniki warstw analitycznych (Modern Toggle Buttons) */}
          <div className="bg-slate-800/50 p-3.5 rounded-2xl border border-slate-700/60 space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Widoczność Warstw Analitycznych</span>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowShadowingLines(!showShadowingLines)}
                className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                  showShadowingLines
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${showShadowingLines ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span>Przesłanianie § 12 (Wewnętrzny obrys)</span>
                </div>
                <span className="text-[10px] font-bold uppercase">{showShadowingLines ? 'WŁ' : 'WYŁ'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSunlightLines(!showSunlightLines)}
                className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                  showSunlightLines
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${showSunlightLines ? 'bg-amber-400' : 'bg-slate-600'}`} />
                  <span>Nasłonecznienie § 56 (Zewnętrzny pas)</span>
                </div>
                <span className="text-[10px] font-bold uppercase">{showSunlightLines ? 'WŁ' : 'WYŁ'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowNormals(!showNormals)}
                className={`flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                  showNormals
                    ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${showNormals ? 'bg-indigo-400' : 'bg-slate-600'}`} />
                  <span>Wektory normalne fasad (Zwrot ścian)</span>
                </div>
                <span className="text-[10px] font-bold uppercase">{showNormals ? 'WŁ' : 'WYŁ'}</span>
              </button>
            </div>
          </div>

          {/* Section: Edycja zaznaczonego budynku */}
          {selectedBuilding ? (
            <div className="bg-slate-800/50 p-3.5 rounded-2xl border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-indigo-400" />
                  <span>Edycja Obiektu 2.5D</span>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  {selectedBuilding.segments.length} fasad
                </span>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 text-[11px] font-medium">Nazwa bryły</label>
                <input
                  type="text"
                  value={selectedBuilding.name}
                  onChange={(e) => updateSelectedBuilding({ name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px] font-medium">Wysokość H (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedBuilding.defaultHeight}
                    onChange={(e) =>
                      updateSelectedBuilding({ defaultHeight: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px] font-medium">Parapet $H_{{w}}$ (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedBuilding.hWindowBottom}
                    onChange={(e) =>
                      updateSelectedBuilding({ hWindowBottom: parseFloat(e.target.value) || 0.85 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Status Buttons */}
              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => updateSelectedBuilding({ isTested: !selectedBuilding.isTested })}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
                    selectedBuilding.isTested
                      ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span>Obiekt badany (Projektowany)</span>
                  <span className="text-[10px] font-bold">{selectedBuilding.isTested ? 'TAK' : 'NIE'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => updateSelectedBuilding({ isCityCentre: !selectedBuilding.isCityCentre })}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
                    selectedBuilding.isCityCentre
                      ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span>Zabudowa śródmiejska (§ 12 ust. 5)</span>
                  <span className="text-[10px] font-bold">{selectedBuilding.isCityCentre ? 'TAK' : 'NIE'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800 text-center text-slate-500 text-xs">
              Kliknij dowolny budynek na rzucie CAD, aby edytować jego parametry.
            </div>
          )}

          {/* Section: Akcje CAD & Import */}
          <div className="space-y-2 pt-2">
            <label className="flex items-center justify-center gap-2.5 w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold py-2.5 px-4 rounded-xl cursor-pointer transition shadow-lg shadow-indigo-600/20">
              <Upload className="w-4 h-4" />
              <span>Wgraj własny plik DXF</span>
              <input type="file" accept=".dxf" onChange={handleFileUpload} className="hidden" />
            </label>

            <button
              type="button"
              onClick={() => {
                setBuildings(createSampleBuildings());
                setSelectedBuildingId('bldg-1');
                setSelectedPointResult(null);
              }}
              className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 px-3 rounded-xl transition border border-slate-700/60"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Załaduj scenę wzorcową</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 text-[11px] text-slate-400 flex items-center gap-2">
          <Move className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Przeciągaj obiekty myszą. Analiza przelicza się w czasie rzeczywistym.</span>
        </div>
      </aside>

      {/* Main Fullscreen CAD Viewport */}
      <main className="flex-1 h-full relative overflow-hidden bg-slate-950 flex flex-col">
        {/* Floating Top Toolbar */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-800/80 shadow-2xl">
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition"
            >
              <ChevronRight className="w-4 h-4" />
              <span>Pokaż panel</span>
            </button>
          )}

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3 px-3 py-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-slate-300 font-medium">§ 12: <b className="text-white">{stats.pct12}%</b></span>
            </div>
            <div className="h-4 w-px bg-slate-700" />
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-slate-300 font-medium">§ 56: <b className="text-white">{stats.pct56}%</b></span>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Quick View Controls */}
          <button
            onClick={() => setShowShadowingLines(!showShadowingLines)}
            title="Przełącz widok § 12"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
              showShadowingLines ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-white'
            }`}
          >
            § 12
          </button>
          <button
            onClick={() => setShowSunlightLines(!showSunlightLines)}
            title="Przełącz widok § 56"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
              showSunlightLines ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white'
            }`}
          >
            § 56
          </button>
          <button
            onClick={() => setShowNormals(!showNormals)}
            title="Przełącz wektory normalne"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
              showNormals ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400 hover:text-white'
            }`}
          >
            Wektory
          </button>
        </div>

        {/* Legend Overlay at Bottom-Left */}
        <div className="absolute bottom-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md px-3.5 py-2.5 rounded-2xl border border-slate-800/80 shadow-2xl text-xs text-slate-300 flex items-center gap-4">
          <div className="font-semibold text-slate-200">Legenda:</div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
            <span>Zgodne (§ 12 / $\ge 3\text{h}$)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            <span>$1.5\text{h} - 3.0\text{h}$ (§ 56)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500" />
            <span>Niezgodne / $< 1.5\text{h}$</span>
          </div>
        </div>

        {/* The CAD Canvas Container */}
        <div className="flex-1 w-full h-full relative">
          <CadCanvas
            buildings={buildings}
            selectedBuildingId={selectedBuildingId}
            onSelectBuilding={setSelectedBuildingId}
            onBuildingMove={handleBuildingMove}
            analysisResults={analysisResults}
            selectedPointResult={selectedPointResult}
            onSelectPointResult={setSelectedPointResult}
            showNormals={showNormals}
            showShadowingLines={showShadowingLines}
            showSunlightLines={showSunlightLines}
          />
        </div>

        {/* Point Inspector Modal */}
        <PointInspectorModal
          pointResult={selectedPointResult}
          onClose={() => setSelectedPointResult(null)}
        />
      </main>
    </div>
  );
};

export default App;
