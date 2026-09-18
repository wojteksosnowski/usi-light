/**
 * Karta "Rzeźba terenu" — steruje warstwami NMT, warstwicami (izohipsami), generowaniem 3D mesh i eksportem DXF.
 * W pełni zgodna z Design Systemem (tokeny var(--...), brak hardcodowanych kolorów).
 */

import React from 'react';
import { Mountain, Loader2, Download } from 'lucide-react';
import { SimpleLayerToggle } from './SimpleLayerToggle';
import { useWfsStore } from '../../../modules/wfs-import/store/useWfsStore';
import { generateTerrainMesh } from '../../../modules/wfs-import/services/generateTerrainMesh';
import { useLicenseStore } from '../../../store';
import { useProjectExport } from './hooks/useProjectExport';

export const ProjectTerrainCard: React.FC = () => {
  const isPro = useLicenseStore((s) => s.isPro);
  const showTerrainLayer = useWfsStore((s) => s.showTerrainLayer);
  const setShowTerrainLayer = useWfsStore((s) => s.setShowTerrainLayer);
  const terrainOpacity = useWfsStore((s) => s.terrainOpacity);
  const setTerrainOpacity = useWfsStore((s) => s.setTerrainOpacity);

  const showTerrainContours = useWfsStore((s) => s.showTerrainContours);
  const setShowTerrainContours = useWfsStore((s) => s.setShowTerrainContours);
  const terrainContoursOpacity = useWfsStore((s) => s.terrainContoursOpacity);
  const setTerrainContoursOpacity = useWfsStore((s) => s.setTerrainContoursOpacity);

  const showTerrainMesh = useWfsStore((s) => s.showTerrainMesh);
  const setShowTerrainMesh = useWfsStore((s) => s.setShowTerrainMesh);
  const terrainMeshOpacity = useWfsStore((s) => s.terrainMeshOpacity);
  const setTerrainMeshOpacity = useWfsStore((s) => s.setTerrainMeshOpacity);
  const terrainMesh = useWfsStore((s) => s.terrainMesh);

  // Bufor NMT pobierany w tle
  const isTerrainDtmBuffering = useWfsStore((s) => s.isTerrainDtmBuffering);
  const terrainDtmCache = useWfsStore((s) => s.terrainDtmCache);
  const terrainDtmProgress = useWfsStore((s) => s.terrainDtmProgress);

  const { handleExportDxf, terrainExportBusy } = useProjectExport();

  // UI state for generation progress
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!isPro) return null;

  const handleGenerateMesh = async () => {
    setBusy(true);
    setError(null);
    try {
      await generateTerrainMesh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Nie udało się wygenerować mesha: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const hasMesh = terrainMesh !== null && terrainMesh.totalVertices > 0;
  const isBufferReady = terrainDtmCache !== null;
  const isButtonDisabled = busy || hasMesh || isTerrainDtmBuffering;
  const contoursCount = terrainMesh?.contours?.length ?? 0;

  return (
    <div className="ui-card">
      <div className="ui-title">
        <span>Rzeźba terenu</span>
        <Mountain size={14} color="var(--accent-emerald)" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Toggle cieniowania NMT (podkład WMS) */}
        <SimpleLayerToggle
          label="Cieniowanie NMT (GUGiK WMS)"
          active={showTerrainLayer}
          dotColorVar="var(--accent-amber)"
          onToggle={() => setShowTerrainLayer(!showTerrainLayer)}
        />

        {showTerrainLayer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--text-secondary)' }}>
              <span>Krycie cienia:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(terrainOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={terrainOpacity}
              onChange={(e) => setTerrainOpacity(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-amber)', cursor: 'pointer' }}
            />
          </div>
        )}

        {/* Separator */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '6px' }} />

        {/* Toggle warstwice / izohipsy */}
        <SimpleLayerToggle
          label="Warstwice / Izohipsy (co 1m)"
          active={showTerrainContours}
          dotColorVar="var(--accent-cyan)"
          onToggle={() => setShowTerrainContours(!showTerrainContours)}
        />

        {showTerrainContours && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--text-secondary)' }}>
              <span>Krycie warstwic:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(terrainContoursOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={terrainContoursOpacity}
              onChange={(e) => setTerrainContoursOpacity(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
            />
            {hasMesh && (
              <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {contoursCount} poziomów warstwic · {Math.round(terrainMesh!.maxElevation - terrainMesh!.minElevation)} m deniwelacji
              </div>
            )}
          </div>
        )}

        {/* Separator */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '6px' }} />

        {/* Toggle wireframe mesh */}
        <SimpleLayerToggle
          label="Siatka 3D Mesh (Wireframe)"
          active={showTerrainMesh}
          dotColorVar="var(--accent-cyan)"
          onToggle={() => setShowTerrainMesh(!showTerrainMesh)}
        />

        {showTerrainMesh && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--text-secondary)' }}>
              <span>Krycie mesh:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(terrainMeshOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={terrainMeshOpacity}
              onChange={(e) => setTerrainMeshOpacity(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
            />
            {hasMesh && (
              <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {terrainMesh!.totalVertices} wierzchołków · {Math.round(terrainMesh!.triangles.length / 9)} trójkątów (adaptacyjna siatka ⚡)
              </div>
            )}
          </div>
        )}

        {/* Pasek postępu buforowania w tle */}
        {isTerrainDtmBuffering && !hasMesh && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '6px 8px',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Loader2 size={10} className="animate-spin" color="var(--accent-cyan)" />
                Buforowanie NMT w tle…
              </span>
              <span style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>
                {terrainDtmProgress > 0 ? `${terrainDtmProgress}%` : 'Pobieranie'}
              </span>
            </div>
            <div style={{
              width: '100%',
              height: '3px',
              borderRadius: '2px',
              backgroundColor: 'var(--border-subtle)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: terrainDtmProgress > 0 ? `${terrainDtmProgress}%` : '60%',
                backgroundColor: 'var(--accent-cyan)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}

        {/* Generate 3D Mesh button */}
        <button
          type="button"
          onClick={handleGenerateMesh}
          disabled={isButtonDisabled}
          className={`btn-tile ${!hasMesh && !isButtonDisabled ? 'active-cyan' : 'inactive'}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 6px',
            fontSize: '11px',
            fontWeight: 600,
            opacity: isButtonDisabled && !hasMesh ? 0.65 : 1,
            cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
          }}
          title={
            busy ? 'Generowanie siatki 3D i warstwic…'
            : hasMesh ? 'Siatka 3D i warstwice zostały już wygenerowane'
            : isTerrainDtmBuffering ? 'Trwa ciche pobieranie danych NMT w tle… Poczekaj chwilę na zakończenie buforowania'
            : isBufferReady ? 'Dane NMT są już w pamięci — kliknij aby natychmiast wygenerować mesh 3D i warstwice'
            : 'Generuj siatkę 3D i warstwice z danych NMT GUGiK'
          }
        >
          <span>
            {busy ? 'Generowanie siatki 3D i warstwic… ⏳'
              : hasMesh ? 'Mesh i warstwice gotowe ✓'
              : isTerrainDtmBuffering ? 'Pobieranie NMT w tle… ⏳'
              : isBufferReady ? 'Generuj 3D mesh (z bufora ⚡)'
              : 'Generuj 3D mesh'}
          </span>
        </button>

        {/* Eksport terenu do DXF */}
        {hasMesh && (
          <button
            type="button"
            onClick={() => handleExportDxf({ forceIncludeTerrain: true })}
            disabled={terrainExportBusy}
            className="btn-tile active-indigo"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '7px 6px',
              fontSize: '10.5px',
              fontWeight: 600,
              cursor: terrainExportBusy ? 'not-allowed' : 'pointer',
            }}
            title="Eksportuj scenę wraz z rzeźbą terenu 3D i warstwicami do pliku DXF"
          >
            <Download size={12} />
            <span>{terrainExportBusy ? 'Eksportowanie DXF… ⏳' : 'Eksportuj z terenem (.DXF)'}</span>
          </button>
        )}

        {/* Error message */}
        {error && (
          <div style={{
            padding: '6px 8px',
            borderRadius: '6px',
            backgroundColor: 'var(--status-rose-bg)',
            border: '1px solid var(--status-rose-border)',
            fontSize: '10px',
            color: 'var(--status-rose-text)',
            lineHeight: '1.3',
          }}>
            {error}
            <br />
            <em>Pozwól na CORS lub sprawdź połączenie internetowe.</em>
          </div>
        )}
      </div>
    </div>
  );
};
