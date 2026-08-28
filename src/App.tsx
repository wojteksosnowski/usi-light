import React, { useState, useMemo, useEffect } from 'react';
import { CadCanvas } from './components/CadCanvas';
import { PointInspectorModal } from './components/PointInspectorModal';
import { BuildingLoop, AnalysisPointResult, ProjectSettings } from './types/geometry';
import {
  createSampleBuildings,
  parseDxfWithMetadata,
  DxfUnitOption,
  DxfUnitInfo,
} from './utils/dxfParser';
import {
  runFullAnalysis,
  analyzeShadowingAtPoint,
  analyzeSunlightAtPoint,
  AnalysisAccuracyOptions,
} from './engine/analysisEngine';
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
  Sliders,
  Activity,
  MapPin,
} from 'lucide-react';

export type AccuracyStage = 'live' | 'stage1' | 'stage2' | 'final';

export const App: React.FC = () => {
  // State
  const [buildings, setBuildings] = useState<BuildingLoop[]>(createSampleBuildings());
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>('bldg-1');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [fitKey, setFitKey] = useState<number>(0);

  // Dynamic Variable Accuracy State (Live vs Stillness Progressive Refinement)
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [accuracyStage, setAccuracyStage] = useState<AccuracyStage>('final');

  // DXF Units State
  const [dxfUnit, setDxfUnit] = useState<DxfUnitOption>('auto');
  const [lastDxfText, setLastDxfText] = useState<string | null>(null);
  const [dxfImportInfo, setDxfImportInfo] = useState<DxfUnitInfo | null>(null);

  // Polish Cities list with accurate geographic coordinates
  const POLISH_CITIES = [
    { name: 'Warszawa', lat: 52.2297, lon: 21.0122 },
    { name: 'Gdańsk',   lat: 54.3520, lon: 18.6466 },
    { name: 'Wrocław',  lat: 51.1079, lon: 17.0385 },
    { name: 'Kraków',   lat: 50.0647, lon: 19.9450 },
    { name: 'Poznań',   lat: 52.4064, lon: 16.9252 },
  ];

  const [selectedCity, setSelectedCity] = useState<string>('Warszawa');

  // Settings
  const [settings, setSettings] = useState<ProjectSettings>({
    latitude: 52.2297, // Warszawa
    longitude: 21.0122,
    isCityCentreDefault: false,
    samplingInterval: 0.25, // Target precision 0.25m
    equinoxDate: 'spring',
  });

  // Layer Visibility
  const [showNormals, setShowNormals] = useState<boolean>(false);
  const [showShadowingLines, setShowShadowingLines] = useState<boolean>(true);
  const [showSunlightLines, setShowSunlightLines] = useState<boolean>(true);

  // Progressive Accuracy Refinement Effect
  // When interacting/moving: use fast low-resolution mesh (1.5m).
  // When still: automatically refine in stages stopping at target 0.25m.
  useEffect(() => {
    if (isInteracting) {
      setAccuracyStage('live');
      return;
    }

    // Schedule progressive refinement when idle
    const t1 = setTimeout(() => {
      setAccuracyStage((prev) => (prev === 'live' ? 'stage1' : prev));
    }, 100);

    const t2 = setTimeout(() => {
      setAccuracyStage((prev) => (prev === 'live' || prev === 'stage1' ? 'stage2' : prev));
    }, 250);

    const t3 = setTimeout(() => {
      setAccuracyStage('final'); // Stop at target 0.25m
    }, 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [buildings, isInteracting]);

  // Current calculation accuracy parameters based on active refinement stage
  const currentAccuracyOptions = useMemo<AnalysisAccuracyOptions>(() => {
    switch (accuracyStage) {
      case 'live':
        return { samplingInterval: 1.5, angleStepDeg: 2.0, sunlightStepMinutes: 15 };
      case 'stage1':
        return { samplingInterval: 1.0, angleStepDeg: 1.0, sunlightStepMinutes: 10 };
      case 'stage2':
        return { samplingInterval: 0.5, angleStepDeg: 0.5, sunlightStepMinutes: 5 };
      case 'final':
      default:
        return { samplingInterval: 0.25, angleStepDeg: 0.5, sunlightStepMinutes: 5 };
    }
  }, [accuracyStage]);

  // Run Calculation with Variable Precision
  const analysisResults = useMemo(() => {
    return runFullAnalysis(buildings, settings, currentAccuracyOptions);
  }, [buildings, settings, currentAccuracyOptions]);

  const [selectedPointKey, setSelectedPointKey] = useState<{
    buildingId: string;
    segmentId: string;
    offsetRatio: number;
  } | null>(null);

  // Directly evaluate selected point at its EXACT pinned offsetRatio on the segment
  // (so its position on the wall is 100% fixed and never moves when background mesh precision changes)
  const selectedPointResult = useMemo<AnalysisPointResult | null>(() => {
    if (!selectedPointKey) return null;
    const bldg = buildings.find((b) => b.id === selectedPointKey.buildingId);
    if (!bldg) return null;
    const seg = bldg.segments.find((s) => s.id === selectedPointKey.segmentId);
    if (!seg) return null;

    const r = selectedPointKey.offsetRatio;
    const exactPoint = {
      x: seg.p1.x + r * (seg.p2.x - seg.p1.x),
      y: seg.p1.y + r * (seg.p2.y - seg.p1.y),
    };

    const shadowRes = analyzeShadowingAtPoint(
      exactPoint,
      seg,
      r,
      buildings,
      bldg.id,
      currentAccuracyOptions.angleStepDeg
    );

    const sunRes = analyzeSunlightAtPoint(
      exactPoint,
      seg,
      r,
      buildings,
      bldg.id,
      settings,
      currentAccuracyOptions.sunlightStepMinutes
    );

    return {
      id: `pinned-${bldg.id}-${seg.id}-${r.toFixed(4)}`,
      point: exactPoint,
      normal: seg.normal,
      buildingId: bldg.id,
      segmentId: seg.id,
      shadowing: shadowRes,
      sunlight: sunRes,
    };
  }, [selectedPointKey, buildings, settings, currentAccuracyOptions]);

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
    if (!isInteracting) setIsInteracting(true);
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
        setLastDxfText(text);
        const result = parseDxfWithMetadata(text, dxfUnit);
        if (result.buildings.length > 0) {
          setBuildings(result.buildings);
          setSelectedBuildingId(result.buildings[0].id);
          setSelectedPointKey(null);
          setDxfImportInfo(result.unitInfo);
          setFitKey((prev) => prev + 1);
        } else {
          alert('Nie znaleziono zamkniętych polilinii w pliku DXF.');
        }
      } catch (err) {
        alert('Błąd podczas parsowania pliku DXF.');
      }
    };
    reader.readAsText(file);
    // Reset file input value to allow re-uploading the same file if needed
    e.target.value = '';
  };

  // Handle changing DXF Units
  const handleDxfUnitChange = (newUnit: DxfUnitOption) => {
    setDxfUnit(newUnit);
    if (lastDxfText) {
      try {
        const result = parseDxfWithMetadata(lastDxfText, newUnit);
        if (result.buildings.length > 0) {
          setBuildings(result.buildings);
          setSelectedBuildingId(result.buildings[0].id);
          setSelectedPointKey(null);
          setDxfImportInfo(result.unitInfo);
          setFitKey((prev) => prev + 1);
        }
      } catch (err) {
        console.error('Błąd przy przeliczaniu jednostek DXF:', err);
      }
    }
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

          {/* Section: Lokalizacja / Miasto (Słońce § 56) */}
          <div className="ui-card">
            <div className="ui-title">
              <span>Lokalizacja (Kąt słońca § 56)</span>
              <MapPin size={14} color="#f59e0b" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '4px',
                  backgroundColor: 'var(--bg-input)',
                  padding: '4px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light)',
                }}
              >
                {POLISH_CITIES.map((city) => {
                  const isActive = selectedCity === city.name;
                  return (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => {
                        setSelectedCity(city.name);
                        setSettings((prev) => ({
                          ...prev,
                          latitude: city.lat,
                          longitude: city.lon,
                        }));
                      }}
                      style={{
                        padding: '6px 2px',
                        fontSize: '11px',
                        fontWeight: isActive ? 700 : 500,
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        backgroundColor: isActive ? '#f59e0b' : 'transparent',
                        color: isActive ? '#000000' : 'var(--text-secondary)',
                      }}
                      title={`${city.name} (${city.lat}° N, ${city.lon}° E)`}
                    >
                      {city.name}
                    </button>
                  );
                })}
              </div>

              {/* Coordinates info pill */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '11px',
                  color: '#94a3b8',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                }}
              >
                <span>Współrzędne:</span>
                <span style={{ color: '#fbbf24', fontWeight: 600, fontFamily: 'monospace' }}>
                  {settings.latitude.toFixed(2)}° N, {settings.longitude.toFixed(2)}° E
                </span>
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

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Wysokość przesłaniania H (m)</label>
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

                {/* Real-world metric dimensions display */}
                {(() => {
                  const xs = selectedBuilding.vertices.map((v) => v.x);
                  const ys = selectedBuilding.vertices.map((v) => v.y);
                  const w = Math.max(...xs) - Math.min(...xs);
                  const h = Math.max(...ys) - Math.min(...ys);
                  const perimeter = selectedBuilding.segments.reduce((sum, s) => sum + s.length, 0);
                  const isHuge = w > 200 || h > 200;

                  return (
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: isHuge ? 'rgba(244, 63, 94, 0.15)' : 'rgba(15, 23, 42, 0.7)',
                        border: `1px solid ${isHuge ? 'rgba(244, 63, 94, 0.35)' : 'var(--border-light)'}`,
                        fontSize: '11px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#94a3b8' }}>Rzut (Szer × Głęb):</span>
                        <b style={{ color: isHuge ? '#fca5a5' : '#38bdf8', fontFamily: 'monospace' }}>
                          {w.toFixed(2)} m × {h.toFixed(2)} m
                        </b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#94a3b8' }}>Obwód fasad:</span>
                        <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{perimeter.toFixed(2)} m</span>
                      </div>
                      {isHuge && (
                        <div style={{ fontSize: '10px', color: '#fda4af', marginTop: '2px' }}>
                          ⚠️ Bardzo duży rzut ({w.toFixed(0)}m)! Jeśli budynek miał mieć np. 10m, zmień jednostkę DXF na <b>cm</b> lub <b>mm</b>.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Status Toggle Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => updateSelectedBuilding({ isIncluded: selectedBuilding.isIncluded === false ? true : false })}
                    className={`btn-tile ${selectedBuilding.isIncluded !== false ? 'active-emerald' : 'inactive'}`}
                  >
                    <span>Uwzględnij w kalkulacji</span>
                    <span style={{ fontSize: '10px', fontWeight: 700 }}>{selectedBuilding.isIncluded !== false ? 'TAK' : 'NIE'}</span>
                  </button>

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

          {/* Section: Jednostki DXF / Rysunku */}
          <div className="ui-card">
            <div className="ui-title">
              <span>Jednostki DXF / Skala</span>
              <Sliders size={14} color="#818cf8" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                Jednostka rysunku DXF:
              </div>

              {/* Unit Selector Segmented Buttons */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '4px',
                  backgroundColor: 'var(--bg-input)',
                  padding: '4px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light)',
                }}
              >
                {(
                  [
                    { id: 'auto', label: 'Auto' },
                    { id: 'm', label: 'm' },
                    { id: 'dm', label: 'dm' },
                    { id: 'cm', label: 'cm' },
                    { id: 'mm', label: 'mm' },
                  ] as const
                ).map((tab) => {
                  const isActive = dxfUnit === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleDxfUnitChange(tab.id)}
                      style={{
                        padding: '6px 2px',
                        fontSize: '11px',
                        fontWeight: isActive ? 700 : 500,
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        backgroundColor: isActive ? 'var(--accent-indigo)' : 'transparent',
                        color: isActive ? '#ffffff' : 'var(--text-secondary)',
                      }}
                      title={
                        tab.id === 'auto'
                          ? 'Automatyczne wykrywanie jednostki z nagłówka $INSUNITS lub skali geometrii'
                          : `Wymuś skalę: 1 jednostka DXF = 1 ${tab.id}`
                      }
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Status / Active Info Banner */}
              {dxfImportInfo ? (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(99, 102, 241, 0.12)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    fontSize: '11px',
                    color: '#cbd5e1',
                    lineHeight: '1.4',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontWeight: 600,
                      color: '#e0e7ff',
                      marginBottom: '2px',
                    }}
                  >
                    <span>Skala importu:</span>
                    <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                      {dxfImportInfo.unitName}
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                    {dxfImportInfo.source}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.3' }}>
                  {dxfUnit === 'auto'
                    ? 'Automatycznie odczytuje $INSUNITS z pliku DXF lub dopasowuje skalę (mm/cm/m).'
                    : `Wymuszenie: 1 jednostka = ${
                        dxfUnit === 'm'
                          ? '1 metr (1.0)'
                          : dxfUnit === 'cm'
                          ? '1 centymetr (0.01 m)'
                          : '1 milimetr (0.001 m)'
                      }.`}
                </div>
              )}
            </div>
          </div>

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
                setSelectedPointKey(null);
                setLastDxfText(null);
                setDxfImportInfo(null);
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
      <main className="cad-viewport" style={{ flex: 1, width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
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

          {/* Dynamic Accuracy Refinement Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              borderRadius: '6px',
              backgroundColor:
                accuracyStage === 'final'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : accuracyStage === 'live'
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(99, 102, 241, 0.15)',
              border: `1px solid ${
                accuracyStage === 'final'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : accuracyStage === 'live'
                  ? 'rgba(245, 158, 11, 0.3)'
                  : 'rgba(99, 102, 241, 0.3)'
              }`,
              color:
                accuracyStage === 'final'
                  ? '#6ee7b7'
                  : accuracyStage === 'live'
                  ? '#fcd34d'
                  : '#a5b4fc',
              fontSize: '11px',
              fontWeight: 600,
            }}
            title={
              accuracyStage === 'final'
                ? 'Osiągnięto docelową dokładność obliczeń (krok 0.25m)'
                : 'Trwa adaptacyjne przeliczanie i zagęszczanie siatki (docelowo 0.25m)'
            }
          >
            <Activity size={13} />
            <span>
              {accuracyStage === 'live'
                ? 'Live: 1.5m (60fps)'
                : accuracyStage === 'stage1'
                ? 'Dociąganie: 1.0m'
                : accuracyStage === 'stage2'
                ? 'Dociąganie: 0.5m'
                : 'Dokładność: 0.25m'}
            </span>
          </div>

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
        <div className="cad-legend-bottom" style={{ gap: '14px' }}>
          <span style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '11px' }}>LEGENDA:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '4px', backgroundColor: '#10b981', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px' }}>§ 12 Zgodne</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '4px', backgroundColor: '#f43f5e', borderRadius: '2px' }} />
            <span style={{ fontSize: '11px' }}>§ 12 Niezgodne</span>
          </div>
          <div style={{ width: '1px', height: '14px', backgroundColor: '#334155' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>§ 56 Nasłonecznienie:</span>
            <div style={{ display: 'flex', height: '6px', width: '80px', borderRadius: '3px', overflow: 'hidden' }}>
              <span style={{ flex: 1, backgroundColor: '#3b0764' }} title="0h (Fiolet)" />
              <span style={{ flex: 1, backgroundColor: '#7e22ce' }} title="1.0h" />
              <span style={{ flex: 1, backgroundColor: '#c026d3' }} title="2.0h" />
              <span style={{ flex: 1, backgroundColor: '#ea580c' }} title="3.0h (Zgodne)" />
              <span style={{ flex: 1, backgroundColor: '#fb923c' }} title="4.0h+ (Pomarańcz)" />
            </div>
            <span style={{ fontSize: '10px', color: '#cbd5e1' }}>0h &rarr; 4h+ (krok 30m)</span>
          </div>
        </div>

        {/* The CAD Canvas Element */}
        <div className="cad-canvas-wrapper" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
          <CadCanvas
            buildings={buildings}
            selectedBuildingId={selectedBuildingId}
            onSelectBuilding={setSelectedBuildingId}
            onBuildingMove={handleBuildingMove}
            analysisResults={analysisResults}
            selectedPointResult={selectedPointResult}
            onSelectPointResult={(res) => {
              if (!res) {
                setSelectedPointKey(null);
              } else {
                setSelectedPointKey({
                  buildingId: res.buildingId,
                  segmentId: res.segmentId,
                  offsetRatio: res.shadowing.offsetRatio,
                });
              }
            }}
            showNormals={showNormals}
            showShadowingLines={showShadowingLines}
            showSunlightLines={showSunlightLines}
            fitTrigger={fitKey}
            onInteractionChange={setIsInteracting}
          />
        </div>

        {/* Floating Point Inspector Modal */}
        <PointInspectorModal
          pointResult={selectedPointResult}
          onClose={() => setSelectedPointKey(null)}
        />
      </main>
    </div>
  );
};

export default App;
