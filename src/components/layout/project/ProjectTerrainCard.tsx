/**
 * Karta "Rzeźba terenu" — steruje warstwami NMT i generowaniem 3D mesh.
 * Zgodna z Design System (klasy .ui-card, .btn-tile, tokeny var(--...)).
 */

import React from 'react';
import { Mountain } from 'lucide-react';
import { SimpleLayerToggle } from './SimpleLayerToggle';
import { useWfsStore } from '../../../modules/wfs-import/store/useWfsStore';
import { generateTerrainMesh } from '../../../modules/wfs-import/services/generateTerrainMesh';
import { useLicenseStore } from '../../../store';

export const ProjectTerrainCard: React.FC = () => {
  const isPro = useLicenseStore((s) => s.isPro);
  const showTerrainLayer = useWfsStore((s) => s.showTerrainLayer);
  const setShowTerrainLayer = useWfsStore((s) => s.setShowTerrainLayer);
  const terrainOpacity = useWfsStore((s) => s.terrainOpacity);
  const setTerrainOpacity = useWfsStore((s) => s.setTerrainOpacity);
  const showTerrainMesh = useWfsStore((s) => s.showTerrainMesh);
  const setShowTerrainMesh = useWfsStore((s) => s.setShowTerrainMesh);
  const terrainMeshOpacity = useWfsStore((s) => s.terrainMeshOpacity);
  const setTerrainMeshOpacity = useWfsStore((s) => s.setTerrainMeshOpacity);
  const terrainMesh = useWfsStore((s) => s.terrainMesh);

  // UI state for generation progress
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!isPro) return null;

  const handleGenerateMesh = async () => {
    setBusy(true);
    setError(null);
    try {
      await generateTerrainMesh();
      // Success — store now has mesh data; hasMesh will be recalculated on next render
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Nie udało się wygenerować mesha: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  // Check if mesh has been generated yet (re-checked each render since store updates cause re-renders)
  const hasMesh = terrainMesh !== null && terrainMesh.totalVertices > 0;

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
        <div style={{ borderTop: '1px solid rgba(51, 65, 85, 0.4)', paddingTop: '6px' }} />

        {/* Toggle wireframe mesh */}
        <SimpleLayerToggle
          label="Wireframe 3D mesh"
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
                {terrainMesh!.totalVertices} wierzchołków · {Math.round(terrainMesh!.maxElevation - terrainMesh!.minElevation)} m różnica wysokości
              </div>
            )}
          </div>
        )}

        {/* Generate 3D Mesh button */}
        <button
          type="button"
          onClick={handleGenerateMesh}
          disabled={busy || hasMesh}
          className={`btn-tile ${!hasMesh && !busy ? 'active-cyan' : 'inactive'}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 6px',
            fontSize: '11px',
            fontWeight: 600,
            opacity: busy ? 0.7 : 1,
            cursor: busy || hasMesh ? 'not-allowed' : 'pointer',
          }}
          title={
            busy ? 'Generowanie mesha z danych NMT GUGiK…'
            : hasMesh ? 'Mesh został już wygenerowany — włacz Wireframe aby zobaczyć'
            : 'Generuj siatkę 3D z danych NMT GUGiK'
          }
        >
          <span>{busy ? 'Generowanie… ⏳' : hasMesh ? 'Mesh wygenerowany ✓' : 'Generuj 3D mesh'}</span>
        </button>

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
