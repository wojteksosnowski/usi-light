import React, { useState, useEffect, useMemo } from 'react';
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
  Download,
  Building,
  Settings,
  CheckCircle2,
  AlertTriangle,
  Move,
} from 'lucide-react';

export const App: React.FC = () => {
  // State
  const [buildings, setBuildings] = useState<BuildingLoop[]>(createSampleBuildings());
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>('bldg-1');
  const [selectedPointResult, setSelectedPointResult] = useState<AnalysisPointResult | null>(null);

  // Settings
  const [settings, setSettings] = useState<ProjectSettings>({
    latitude: 52.2297, // Warszawa
    longitude: 21.0122,
    isCityCentreDefault: false,
    samplingInterval: 0.5, // 0.5m
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
        if (fields.defaultHeight !== undefined || fields.hWindowBottom !== undefined || fields.isCityCentre !== undefined) {
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
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Sidebar Controls */}
      <aside className="w-80 h-full bg-slate-900 border-r border-slate-800 flex flex-col z-10 shadow-xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 shadow-md">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">USI Light 2.5D</h1>
              <p className="text-[11px] text-slate-400">Analiza § 12 & § 56 WT</p>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Quick Stats Summary */}
          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60 shadow-sm space-y-2">
            <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Bilans Inwestycji</h2>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>§ 12 Przesłan.</span>
                </div>
                <div className="text-base font-bold text-slate-100">{stats.pct12}%</div>
                <div className="text-[10px] text-slate-400">
                  {stats.compliant12}/{stats.total} pkt
                </div>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>§ 56 Nasłon.</span>
                </div>
                <div className="text-base font-bold text-slate-100">{stats.pct56}%</div>
                <div className="text-[10px] text-slate-400">
                  {stats.compliant56}/{stats.total} pkt
                </div>
              </div>
            </div>
          </div>

          {/* Layer & Display Toggles */}
          <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40 space-y-2">
            <h2 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" /> Warstwy widoku
            </h2>
            <label className="flex items-center justify-between py-1 cursor-pointer">
              <span className="text-slate-300">Wskaźniki § 12 (Przesłanianie)</span>
              <input
                type="checkbox"
                checked={showShadowingLines}
                onChange={(e) => setShowShadowingLines(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
              />
            </label>
            <label className="flex items-center justify-between py-1 cursor-pointer">
              <span className="text-slate-300">Wskaźniki § 56 (Nasłonecznienie)</span>
              <input
                type="checkbox"
                checked={showSunlightLines}
                onChange={(e) => setShowSunlightLines(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
              />
            </label>
            <label className="flex items-center justify-between py-1 cursor-pointer">
              <span className="text-slate-300">Wektory normalne fasad</span>
              <input
                type="checkbox"
                checked={showNormals}
                onChange={(e) => setShowNormals(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
              />
            </label>
          </div>

          {/* Selected Building Properties */}
          {selectedBuilding && (
            <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40 space-y-3">
              <h2 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-amber-400" /> Parametry 2.5D obiektu
              </h2>
              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">Nazwa obiektu</label>
                <input
                  type="text"
                  value={selectedBuilding.name}
                  onChange={(e) => updateSelectedBuilding({ name: e.target.value })}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">Wysokość H (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedBuilding.defaultHeight}
                    onChange={(e) =>
                      updateSelectedBuilding({ defaultHeight: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">Rzędna parapetu (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={selectedBuilding.hWindowBottom}
                    onChange={(e) =>
                      updateSelectedBuilding({ hWindowBottom: parseFloat(e.target.value) || 0.85 })
                    }
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBuilding.isTested}
                    onChange={(e) => updateSelectedBuilding({ isTested: e.target.checked })}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                  />
                  <span className="text-slate-300">Obiekt badany / projektowany</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBuilding.isCityCentre}
                    onChange={(e) => updateSelectedBuilding({ isCityCentre: e.target.checked })}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                  />
                  <span className="text-slate-300">Zabudowa śródmiejska (§ 12 ust. 5)</span>
                </label>
              </div>
            </div>
          )}

          {/* CAD Import & Actions */}
          <div className="space-y-2 pt-2">
            <label className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-3 rounded-xl cursor-pointer transition shadow-md">
              <Upload className="w-4 h-4" />
              <span>Wgraj plik DXF</span>
              <input type="file" accept=".dxf" onChange={handleFileUpload} className="hidden" />
            </label>
            <button
              onClick={() => {
                setBuildings(createSampleBuildings());
                setSelectedBuildingId('bldg-1');
                setSelectedPointResult(null);
              }}
              className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 px-3 rounded-xl transition border border-slate-700/60"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Przywróć model demo</span>
            </button>
          </div>
        </div>

        {/* Footer Hint */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 text-[10px] text-slate-400 flex items-center gap-2">
          <Move className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Przeciągnij budynek, aby przeliczyć zacienianie na żywo. Kliknij punkt fasady po szczegóły.</span>
        </div>
      </aside>

      {/* Main Interactive CAD Area */}
      <main className="flex-1 h-full relative">
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

        {/* Floating Point Inspector */}
        <PointInspectorModal
          pointResult={selectedPointResult}
          onClose={() => setSelectedPointResult(null)}
        />
      </main>
    </div>
  );
};
export default App;
