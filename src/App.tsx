import React, { useState, useMemo } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Maximize2,
} from 'lucide-react';

export const App: React.FC = () => {
  // State
  const [buildings, setBuildings] = useState<BuildingLoop[]>(createSampleBuildings());
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>('bldg-1');
  const [selectedPointResult, setSelectedPointResult] = useState<AnalysisPointResult | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [fitKey, setFitKey] = useState<number>(0);

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
          setFitKey((prev) => prev + 1);
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
    <div className="app-container">
      {/* Collapsible Left Sidebar */}
      <aside className={`app-sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                padding: '8px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #f59e0b, #6366f1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#fff' }}>USI Light 2.5D</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Analiza § 12 & § 56 WT</div>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            title="Schowaj panel boczny"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="sidebar-body custom-scrollbar">
          {/* Section: Zbiorczy Bilans Zgodności */}
          <div className="ui-card">
            <div className="ui-title">
              <span>Bilans Zgodności</span>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'normal' }}>
                {stats.total} pkt pomiarowych
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* § 12 Card */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  backgroundColor: stats.pct12 === 100 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                  border: `1px solid ${stats.pct12 === 100 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: '#e2e8f0' }}>
                    <Shield size={14} color="#34d399" />
                    <span>§ 12 Przesłan.</span>
                  </div>
                  {stats.pct12 === 100 ? (
                    <CheckCircle2 size={14} color="#34d399" />
                  ) : (
                    <AlertTriangle size={14} color="#fb7185" />
                  )}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                  {stats.pct12}%
                </div>
                <div style={{ width: '100%', height: '4px', backgroundColor: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${stats.pct12}%`, height: '100%', backgroundColor: '#10b981', transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>
                  Zgodne: <b>{stats.compliant12}</b> / {stats.total}
                </div>
              </div>

              {/* § 56 Card */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  backgroundColor: stats.pct56 >= 80 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                  border: `1px solid ${stats.pct56 >= 80 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: '#e2e8f0' }}>
                    <Sun size={14} color="#fbbf24" />
                    <span>§ 56 Nasłon.</span>
                  </div>
                  {stats.pct56 >= 80 ? (
                    <CheckCircle2 size={14} color="#fbbf24" />
                  ) : (
                    <AlertTriangle size={14} color="#fb7185" />
                  )}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                  {stats.pct56}%
                </div>
                <div style={{ width: '100%', height: '4px', backgroundColor: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${stats.pct56}%`, height: '100%', backgroundColor: '#f59e0b', transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>
                  Zgodne: <b>{stats.compliant56}</b> / {stats.total}
                </div>
              </div>
            </div>
          </div>

          {/* Section: Przełączniki warstw */}
          <div className="ui-card">
            <div className="ui-title">
              <span>Warstwy analityczne</span>
              <Layers size={14} color="#818cf8" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowShadowingLines(!showShadowingLines)}
                className={`btn-tile ${showShadowingLines ? 'active-emerald' : 'inactive'}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: showShadowingLines ? '#34d399' : '#64748b' }} />
                  <span>Przesłanianie § 12 (Wewnętrzny obrys)</span>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700 }}>{showShadowingLines ? 'WŁ' : 'WYŁ'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSunlightLines(!showSunlightLines)}
                className={`btn-tile ${showSunlightLines ? 'active-amber' : 'inactive'}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: showSunlightLines ? '#fbbf24' : '#64748b' }} />
                  <span>Nasłonecznienie § 56 (Zewnętrzny pas)</span>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700 }}>{showSunlightLines ? 'WŁ' : 'WYŁ'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowNormals(!showNormals)}
                className={`btn-tile ${showNormals ? 'active-indigo' : 'inactive'}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: showNormals ? '#818cf8' : '#64748b' }} />
                  <span>Wektory normalne fasad (Zwrot ścian)</span>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700 }}>{showNormals ? 'WŁ' : 'WYŁ'}</span>
              </button>
            </div>
          </div>

          {/* Section: Parametry zaznaczonego obiektu */}
          {selectedBuilding ? (
            <div className="ui-card">
              <div className="ui-title">
                <span>Edycja Obiektu 2.5D</span>
                <Building size={14} color="#818cf8" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Nazwa bryły</label>
                  <input
                    type="text"
                    value={selectedBuilding.name}
                    onChange={(e) => updateSelectedBuilding({ name: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      padding: '7px 10px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Wysokość H (m)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={selectedBuilding.defaultHeight}
                      onChange={(e) => updateSelectedBuilding({ defaultHeight: parseFloat(e.target.value) || 0 })}
                      style={{
                        width: '100%',
                        backgroundColor: 'var(--bg-input)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '8px',
                        padding: '7px 10px',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Parapet H_okna (m)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={selectedBuilding.hWindowBottom}
                      onChange={(e) => updateSelectedBuilding({ hWindowBottom: parseFloat(e.target.value) || 0.85 })}
                      style={{
                        width: '100%',
                        backgroundColor: 'var(--bg-input)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '8px',
                        padding: '7px 10px',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    />
                  </div>
                </div>

                {/* Status Toggle Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => updateSelectedBuilding({ isTested: !selectedBuilding.isTested })}
                    className={`btn-tile ${selectedBuilding.isTested ? 'active-indigo' : 'inactive'}`}
                  >
                    <span>Obiekt badany (Projektowany)</span>
                    <span style={{ fontSize: '10px', fontWeight: 700 }}>{selectedBuilding.isTested ? 'TAK' : 'NIE'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSelectedBuilding({ isCityCentre: !selectedBuilding.isCityCentre })}
                    className={`btn-tile ${selectedBuilding.isCityCentre ? 'active-amber' : 'inactive'}`}
                  >
                    <span>Zabudowa śródmiejska (§ 12 ust. 5)</span>
                    <span style={{ fontSize: '10px', fontWeight: 700 }}>{selectedBuilding.isCityCentre ? 'TAK' : 'NIE'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="ui-card" style={{ textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
              Kliknij dowolny budynek na rzucie CAD, aby edytować jego parametry.
            </div>
          )}

          {/* Section: Akcje Główne */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label className="btn-primary">
              <Upload size={16} />
              <span>Wgraj plik DXF</span>
              <input type="file" accept=".dxf" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>

            <button
              type="button"
              onClick={() => {
                setBuildings(createSampleBuildings());
                setSelectedBuildingId('bldg-1');
                setSelectedPointResult(null);
                setFitKey((prev) => prev + 1);
              }}
              className="btn-secondary"
            >
              <RotateCcw size={15} />
              <span>Załaduj scenę wzorcową</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <Move size={16} color="#818cf8" style={{ flexShrink: 0 }} />
          <span>Przeciągaj obiekty myszą. Analiza przelicza się na żywo.</span>
        </div>
      </aside>

      {/* Main Fullscreen CAD Viewport */}
      <main className="cad-viewport">
        {/* Floating Top HUD */}
        <div className="cad-hud-top">
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '10px',
                background: 'var(--accent-indigo)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              <ChevronRight size={14} />
              <span>Pokaż panel</span>
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
              <span style={{ color: '#94a3b8' }}>§ 12: <b style={{ color: '#fff' }}>{stats.pct12}%</b></span>
            </div>
            <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
              <span style={{ color: '#94a3b8' }}>§ 56: <b style={{ color: '#fff' }}>{stats.pct56}%</b></span>
            </div>
          </div>

          <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

          <button
            onClick={() => setShowShadowingLines(!showShadowingLines)}
            style={{
              padding: '5px 9px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: showShadowingLines ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              color: showShadowingLines ? '#6ee7b7' : '#94a3b8',
            }}
          >
            § 12
          </button>
          <button
            onClick={() => setShowSunlightLines(!showSunlightLines)}
            style={{
              padding: '5px 9px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: showSunlightLines ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
              color: showSunlightLines ? '#fcd34d' : '#94a3b8',
            }}
          >
            § 56
          </button>
          <button
            onClick={() => setShowNormals(!showNormals)}
            style={{
              padding: '5px 9px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: showNormals ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              color: showNormals ? '#a5b4fc' : '#94a3b8',
            }}
          >
            Wektory
          </button>

          <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />

          <button
            onClick={() => setFitKey((prev) => prev + 1)}
            title="Dopasuj widok do obiektów (Zoom Extents)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid #334155',
              backgroundColor: 'rgba(30, 41, 59, 0.8)',
              color: '#f8fafc',
            }}
          >
            <Maximize2 size={13} />
            <span>Centruj</span>
          </button>
        </div>

        {/* Legend Overlay at Bottom-Left */}
        <div className="cad-legend-bottom">
          <span style={{ fontWeight: 'bold', color: '#e2e8f0' }}>Legenda:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981' }} />
            <span>Zgodne (§ 12 / &ge; 3.0 h)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
            <span>1.5 h - 3.0 h (§ 56)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f43f5e' }} />
            <span>Niezgodne / &lt; 1.5 h</span>
          </div>
        </div>

        {/* The CAD Canvas Element */}
        <div className="cad-canvas-wrapper">
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
            fitTrigger={fitKey}
          />
        </div>

        {/* Floating Point Inspector Modal */}
        <PointInspectorModal
          pointResult={selectedPointResult}
          onClose={() => setSelectedPointResult(null)}
        />
      </main>
    </div>
  );
};

export default App;
