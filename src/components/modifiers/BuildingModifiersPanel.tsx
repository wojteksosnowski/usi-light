import React from 'react';
import {
  Layers,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
  Sliders,
  CheckCircle2,
  Info,
  ChevronDown,
  Building,
} from 'lucide-react';
import { useSceneStore } from '../../store';
import { StoryOffsetModifier, ZoneOffsetModifier, BayWindowModifier, StoryFootprint } from '../../types/modifiers';
import { SetbackPenthouseIcon } from '../icons/SetbackPenthouseIcon';
import { BayWindowIcon } from '../common/CustomCadIcons';
import { FloatingInspectorCard } from '../common/FloatingInspectorCard';

interface BuildingModifiersPanelProps {
  onClose?: () => void;
  isEmbedded?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

export const BuildingModifiersPanel: React.FC<BuildingModifiersPanelProps> = React.memo(({
  onClose,
  isEmbedded = false,
  isCollapsed,
  onToggleCollapse,
}) => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const addBuildingModifier = useSceneStore((s) => s.addBuildingModifier);
  const updateBuildingModifier = useSceneStore((s) => s.updateBuildingModifier);
  const removeBuildingModifier = useSceneStore((s) => s.removeBuildingModifier);
  const reorderBuildingModifiers = useSceneStore((s) => s.reorderBuildingModifiers);
  const toggleBuildingModifier = useSceneStore((s) => s.toggleBuildingModifier);

  const selectedBuilding = React.useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) || null,
    [buildings, selectedBuildingId]
  );

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!selectedBuilding) return null;

  const modifiers = selectedBuilding.modifiers || [];
  const storyPolygons: StoryFootprint[] = selectedBuilding.storyPolygons || [];
  const segments = selectedBuilding.segments || [];

  const handleAddStoryModifier = () => {
    const newMod: StoryOffsetModifier = {
      id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'story_offset',
      enabled: true,
      distance: -2.0, // domyślnie 2m cofnięcia
      storiesCount: -1, // domyślnie ostatnia kondygnacja (penthouse)
    };
    addBuildingModifier(selectedBuilding.id, newMod);
  };

  const handleAddZoneModifier = () => {
    const newMod: ZoneOffsetModifier = {
      id: `mod-zone-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'zone_offset',
      enabled: true,
      distance: 4.0, // domyślnie 4m bufora na zewnątrz
      areaType: 'plot',
      name: 'Strefa buforowa',
    };
    addBuildingModifier(selectedBuilding.id, newMod);
  };

  const handleAddBayWindowModifier = () => {
    const newMod: BayWindowModifier = {
      id: `mod-bay-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'bay_window',
      enabled: true,
      width: 4.0, // domyślnie 4m szerokości
      projection: 1.5, // domyślnie 1.5m wysunięcia
      storiesCount: 0, // domyślnie cała wysokość / obszar
    };
    addBuildingModifier(selectedBuilding.id, newMod);
  };

  return (
    <FloatingInspectorCard
      title="Modyfikatory"
      badge={modifiers.length > 0 ? modifiers.length : undefined}
      icon={<SetbackPenthouseIcon size={18} color="#c084fc" />}
      accentColor="purple"
      onClose={onClose}
      isEmbedded={isEmbedded}
      width={isEmbedded ? '100%' : 360}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >

      {/* Info Banner */}
      <div
        style={{
          backgroundColor: 'rgba(168, 85, 247, 0.08)',
          border: '1px solid rgba(168, 85, 247, 0.25)',
          borderRadius: '8px',
          padding: '8px 10px',
          fontSize: '11px',
          color: '#e9d5ff',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-start',
          marginBottom: '14px',
        }}
      >
        <Info size={14} color="#c084fc" style={{ marginTop: '2px', flexShrink: 0 }} />
        <div>
          Modyfikatory generują uskokowe poziomy kondygnacji, strefy o zadanym odsunięciu oraz wykusze fasad.
        </div>
      </div>

      {/* Modifier Stack List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            fontWeight: 700,
            color: '#cbd5e1',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <span>Stos modyfikatorów ({modifiers.length})</span>
        </div>

        {modifiers.length === 0 ? (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              backgroundColor: 'rgba(30, 41, 59, 0.5)',
              border: '1px dashed rgba(255, 255, 255, 0.15)',
              borderRadius: '10px',
              color: '#94a3b8',
              fontSize: '11.5px',
            }}
          >
            Brak modyfikatorów na tym obiekcie.
            <br />
            Dodaj <b>Uskok</b>, <b>Strefę</b> lub <b>Wykusz</b> z paska narzędzi.
          </div>
        ) : (
          modifiers.map((mod, idx) => {
            const isStoryOffset = mod.type === 'story_offset';
            const isZoneOffset = mod.type === 'zone_offset';
            const isBayWindow = mod.type === 'bay_window';
            const offsetMod = mod as StoryOffsetModifier;

            const modTitle = isStoryOffset
              ? 'Uskok kondygnacji'
              : isZoneOffset
              ? 'Strefa (obszar)'
              : 'Wykusz (Bay Window)';
            const titleColor = isStoryOffset ? '#f3e8ff' : isZoneOffset ? '#bae6fd' : '#fef08a';

            return (
              <div
                key={mod.id}
                style={{
                  backgroundColor: mod.enabled ? 'rgba(30, 41, 59, 0.8)' : 'rgba(15, 23, 42, 0.6)',
                  border: `1px solid ${mod.enabled ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  opacity: mod.enabled ? 1 : 0.6,
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Modifier Top Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={mod.enabled}
                      onChange={() => toggleBuildingModifier(selectedBuilding.id, mod.id)}
                      style={{ cursor: 'pointer', accentColor: '#a855f7' }}
                      title="Włącz / wyłącz ten modyfikator"
                    />
                    <span style={{ fontWeight: 700, fontSize: '11.5px', color: titleColor }}>
                      #{idx + 1} {modTitle}
                    </span>
                  </div>

                  {/* Reorder and Delete */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => reorderBuildingModifiers(selectedBuilding.id, idx, idx - 1)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: idx === 0 ? '#475569' : '#cbd5e1',
                        cursor: idx === 0 ? 'default' : 'pointer',
                        padding: '2px 4px',
                      }}
                      title="Przesuń wyżej w stosie"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === modifiers.length - 1}
                      onClick={() => reorderBuildingModifiers(selectedBuilding.id, idx, idx + 1)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: idx === modifiers.length - 1 ? '#475569' : '#cbd5e1',
                        cursor: idx === modifiers.length - 1 ? 'default' : 'pointer',
                        padding: '2px 4px',
                      }}
                      title="Przesuń niżej w stosie"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBuildingModifier(selectedBuilding.id, mod.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#fb7185',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        marginLeft: '4px',
                      }}
                      title="Usuń ten modyfikator"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Modifier Controls */}
                {isStoryOffset && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingTop: '4px' }}>
                    {/* Distance [m] */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                        Przesunięcie (m):
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                        <input
                          type="number"
                          step="0.5"
                          value={offsetMod.distance}
                          onChange={(e) =>
                            updateBuildingModifier(selectedBuilding.id, mod.id, {
                              distance: parseFloat(e.target.value) || 0,
                            })
                          }
                          style={{
                            width: '100%',
                            backgroundColor: 'rgba(15, 23, 42, 0.8)',
                            border: '1px solid #475569',
                            borderRadius: '6px',
                            color: '#f8fafc',
                            padding: '4px 6px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '9px', color: offsetMod.distance < 0 ? '#c084fc' : '#38bdf8' }}>
                        {offsetMod.distance < 0 ? 'Cofnięcie (wcięcie)' : offsetMod.distance > 0 ? 'Nadwieszenie' : 'Brak'}
                      </span>
                    </div>

                    {/* Stories Count */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                        Zakres kondygnacji:
                      </label>
                      <select
                        value={offsetMod.storiesCount}
                        onChange={(e) =>
                          updateBuildingModifier(selectedBuilding.id, mod.id, {
                            storiesCount: parseInt(e.target.value, 10),
                          })
                        }
                        style={{
                          width: '100%',
                          backgroundColor: 'rgba(15, 23, 42, 0.8)',
                          border: '1px solid #475569',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          padding: '4px 6px',
                          fontSize: '11px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        <option value="-1">Ostatnia kondygnacja (-1)</option>
                        <option value="-2">2 ostatnie kondygnacje (-2)</option>
                        <option value="-3">3 ostatnie kondygnacje (-3)</option>
                        <option value="1">Parter (+1)</option>
                        <option value="2">2 dolne kondygnacje (+2)</option>
                      </select>
                      <span style={{ fontSize: '9px', color: '#94a3b8' }}>
                        {offsetMod.storiesCount < 0
                          ? `${Math.abs(offsetMod.storiesCount)} od góry (poddasze)`
                          : `${offsetMod.storiesCount} od dołu (podcień)`}
                      </span>
                    </div>
                  </div>
                )}

                {isZoneOffset && (() => {
                  const zoneMod = mod as ZoneOffsetModifier;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {/* Distance [m] */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                            Odsunięcie strefy (m):
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={zoneMod.distance}
                            onChange={(e) =>
                              updateBuildingModifier(selectedBuilding.id, mod.id, {
                                distance: parseFloat(e.target.value) || 0,
                              })
                            }
                            style={{
                              width: '100%',
                              backgroundColor: 'rgba(15, 23, 42, 0.8)',
                              border: '1px solid #475569',
                              borderRadius: '6px',
                              color: '#f8fafc',
                              padding: '4px 6px',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              fontWeight: 600,
                            }}
                          />
                          <span style={{ fontSize: '9px', color: zoneMod.distance >= 0 ? '#38bdf8' : '#f43f5e' }}>
                            {zoneMod.distance >= 0 ? 'Bufor zewnętrzny (+)' : 'Offset do wnętrza (-)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {isBayWindow && (() => {
                  const bayMod = mod as BayWindowModifier;
                  const currentAngle = bayMod.sideAngle ?? 45;
                  const currentPos = bayMod.positionRatio ?? 0.5;
                  const numEdges = selectedBuilding.vertices?.length || 0;

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                        {/* Width [m] */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                            Szerokość (m):
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            value={bayMod.width}
                            onChange={(e) =>
                              updateBuildingModifier(selectedBuilding.id, mod.id, {
                                width: Math.max(0.1, parseFloat(e.target.value) || 1),
                              })
                            }
                            style={{
                              width: '100%',
                              backgroundColor: 'rgba(15, 23, 42, 0.8)',
                              border: '1px solid #475569',
                              borderRadius: '6px',
                              color: '#f8fafc',
                              padding: '4px 6px',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              fontWeight: 600,
                            }}
                          />
                        </div>

                        {/* Projection [m] */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                            Wysunięcie (m):
                          </label>
                          <input
                            type="number"
                            step="0.2"
                            value={bayMod.projection}
                            onChange={(e) =>
                              updateBuildingModifier(selectedBuilding.id, mod.id, {
                                projection: parseFloat(e.target.value) || 0,
                              })
                            }
                            style={{
                              width: '100%',
                              backgroundColor: 'rgba(15, 23, 42, 0.8)',
                              border: '1px solid #475569',
                              borderRadius: '6px',
                              color: '#f8fafc',
                              padding: '4px 6px',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              fontWeight: 600,
                            }}
                          />
                        </div>

                        {/* Stories Count */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                            Kondygnacja:
                          </label>
                          <select
                            value={bayMod.storiesCount}
                            onChange={(e) =>
                              updateBuildingModifier(selectedBuilding.id, mod.id, {
                                storiesCount: parseInt(e.target.value, 10) || 0,
                              })
                            }
                            style={{
                              width: '100%',
                              backgroundColor: 'rgba(15, 23, 42, 0.8)',
                              border: '1px solid #475569',
                              borderRadius: '6px',
                              color: '#f8fafc',
                              padding: '4px 4px',
                              fontSize: '10.5px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            <option value="0">Całość (0)</option>
                            <option value="1">Parter (+1)</option>
                            <option value="2">2 dolne (+2)</option>
                            <option value="-1">Góra (-1)</option>
                            <option value="-2">2 górne (-2)</option>
                          </select>
                        </div>
                      </div>

                      {/* Kąt boków: 90°, 60°, 45°, 30° */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                            Kąt ścian bocznych:
                          </label>
                          <span style={{ fontSize: '9.5px', color: '#fef08a', fontWeight: 600 }}>
                            {currentAngle === 90 ? 'Prostopadły (90°)' : `${currentAngle}°`}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                          {([90, 60, 45, 30] as const).map((angle) => {
                            const isSelectedAngle = currentAngle === angle;
                            return (
                              <button
                                key={angle}
                                type="button"
                                onClick={() =>
                                  updateBuildingModifier(selectedBuilding.id, mod.id, {
                                    sideAngle: angle,
                                  })
                                }
                                style={{
                                  padding: '3px 0',
                                  fontSize: '10.5px',
                                  fontWeight: isSelectedAngle ? 700 : 500,
                                  borderRadius: '4px',
                                  border: isSelectedAngle ? '1px solid #fef08a' : '1px solid rgba(255, 255, 255, 0.1)',
                                  backgroundColor: isSelectedAngle ? 'rgba(234, 179, 8, 0.25)' : 'rgba(15, 23, 42, 0.6)',
                                  color: isSelectedAngle ? '#fef08a' : '#94a3b8',
                                  cursor: 'pointer',
                                  textAlign: 'center',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                {angle}°
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Pozycja wzdłuż krawędzi (suwak 0..1) oraz wybór krawędzi */}
                      <div style={{ display: 'grid', gridTemplateColumns: numEdges > 3 ? '1.2fr 0.8fr' : '1fr', gap: '8px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                              Pozycja wzdłuż krawędzi:
                            </label>
                            <span style={{ fontSize: '9.5px', color: '#cbd5e1', fontFamily: 'monospace' }}>
                              {currentPos === 0.5 ? 'Środek (50%)' : `${Math.round(currentPos * 100)}%`}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={currentPos}
                            onChange={(e) =>
                              updateBuildingModifier(selectedBuilding.id, mod.id, {
                                positionRatio: parseFloat(e.target.value),
                              })
                            }
                            style={{
                              width: '100%',
                              accentColor: '#fef08a',
                              cursor: 'pointer',
                              height: '4px',
                            }}
                          />
                        </div>

                        {numEdges > 3 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                              Krawędź:
                            </label>
                            <select
                              value={bayMod.edgeIndex !== undefined ? bayMod.edgeIndex : -1}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                updateBuildingModifier(selectedBuilding.id, mod.id, {
                                  edgeIndex: val >= 0 ? val : undefined,
                                });
                              }}
                              style={{
                                width: '100%',
                                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                                border: '1px solid #475569',
                                borderRadius: '6px',
                                color: '#f8fafc',
                                padding: '3px 4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="-1">Domyślna (najdłuższa)</option>
                              {Array.from({ length: numEdges }).map((_, eIdx) => (
                                <option key={eIdx} value={eIdx}>
                                  Krawędź #{eIdx + 1}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <span style={{ fontSize: '9px', color: bayMod.projection >= 0 ? '#fef08a' : '#f87171' }}>
                        {bayMod.projection >= 0
                          ? `Wysunięcie na zewnątrz (+${bayMod.projection}m)`
                          : `Wcięcie do wnętrza (${bayMod.projection}m)`}
                        {' • '}
                        {currentAngle === 90 ? 'Boki 90°' : `Kąt boków ${currentAngle}°`}
                        {' • '}
                        {bayMod.storiesCount === 0
                          ? 'Wszystkie kondygnacje / obszar'
                          : bayMod.storiesCount < 0
                          ? `${Math.abs(bayMod.storiesCount)} od góry`
                          : `${bayMod.storiesCount} od dołu`}
                      </span>
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>

      {/* 2.5D Story Levels Summary (Tylko dla budynków) */}
      {selectedBuilding.category !== 'boundary' && storyPolygons.length > 0 && (
        <div
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            paddingTop: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div
            style={{
              fontSize: '10.5px',
              fontWeight: 700,
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Generowane warstwy ({storyPolygons.length} kond., {segments.length} ścian)</span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              maxHeight: '140px',
              overflowY: 'auto',
              backgroundColor: 'rgba(15, 23, 42, 0.5)',
              borderRadius: '6px',
              padding: '6px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            {storyPolygons.map((sf) => {
              const isBaseLevel = sf.storyIndex === 0;
              const hasRecess =
                sf.polygon.length > 0 &&
                selectedBuilding.vertices.length > 0 &&
                Math.hypot(
                  sf.polygon[0].x - selectedBuilding.vertices[0].x,
                  sf.polygon[0].y - selectedBuilding.vertices[0].y
                ) > 0.01;

              return (
                <div
                  key={sf.storyIndex}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    backgroundColor: hasRecess ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                  }}
                >
                  <span style={{ color: '#cbd5e1', fontWeight: 600 }}>
                    Kondygnacja #{sf.storyIndex + 1}
                  </span>
                  <span style={{ fontFamily: 'monospace', color: hasRecess ? '#e9d5ff' : '#94a3b8' }}>
                    [{sf.hBottom.toFixed(1)}m - {sf.hTop.toFixed(1)}m]
                    {hasRecess ? ' (Uskok)' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </FloatingInspectorCard>
  );
});

