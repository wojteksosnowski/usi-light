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
import { StoryOffsetModifier, StoryFootprint } from '../../types/modifiers';

interface BuildingModifiersPanelProps {
  onClose?: () => void;
}

export const BuildingModifiersPanel: React.FC<BuildingModifiersPanelProps> = React.memo(({ onClose }) => {
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

  const handleAddModifier = () => {
    const newMod: StoryOffsetModifier = {
      id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'story_offset',
      enabled: true,
      distance: -2.0, // domyślnie 2m cofnięcia
      storiesCount: -1, // domyślnie ostatnia kondygnacja (penthouse)
    };
    addBuildingModifier(selectedBuilding.id, newMod);
  };

  return (
    <div
      className="inspector-card"
      style={{
        position: 'absolute',
        top: '70px',
        right: '20px',
        width: '360px',
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(168, 85, 247, 0.35)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(168, 85, 247, 0.15)',
        borderRadius: '14px',
        padding: '16px',
        zIndex: 50,
        color: '#f8fafc',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: '12px',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '8px',
              borderRadius: '10px',
              backgroundColor: 'rgba(168, 85, 247, 0.2)',
              color: '#c084fc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers size={18} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#f8fafc' }}>
              Modyfikatory 2.5D
            </div>
            <div style={{ fontSize: '11px', color: '#a855f7', fontWeight: 600 }}>
              {selectedBuilding.name}
            </div>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Zamknij panel modyfikatorów"
          >
            <X size={18} />
          </button>
        )}
      </div>

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
          Modyfikatory generują uskokowe poziomy kondygnacji i ściany o przedziałach wysokości{' '}
          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#f3e8ff' }}>
            [H<sub>base</sub>, H<sub>total</sub>]
          </span>
          .
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
          <button
            type="button"
            onClick={handleAddModifier}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'rgba(168, 85, 247, 0.2)',
              border: '1px solid #a855f7',
              borderRadius: '6px',
              color: '#e9d5ff',
              fontSize: '10.5px',
              fontWeight: 600,
              padding: '3px 8px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Plus size={12} />
            <span>Dodaj uskok</span>
          </button>
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
            Kliknij <b>Dodaj uskok</b>, aby wymodelować penthouse lub podcień.
          </div>
        ) : (
          modifiers.map((mod, idx) => {
            const isStoryOffset = mod.type === 'story_offset';
            const offsetMod = mod as StoryOffsetModifier;

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
                    <span style={{ fontWeight: 700, fontSize: '11.5px', color: '#f3e8ff' }}>
                      #{idx + 1} {isStoryOffset ? 'Uskok kondygnacji' : 'Modyfikator'}
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
              </div>
            );
          })
        )}
      </div>

      {/* 2.5D Story Levels Summary */}
      {storyPolygons.length > 0 && (
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

      {/* Footer Close / Finish Action */}
      <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '10px' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            padding: '7px 12px',
            backgroundColor: 'rgba(168, 85, 247, 0.2)',
            border: '1px solid #a855f7',
            borderRadius: '8px',
            color: '#f3e8ff',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
          title="Zamknij panel modyfikatorów (Escape)"
        >
          <CheckCircle2 size={13} color="#c084fc" />
          <span>Zakończ edycję modyfikatorów (Esc)</span>
        </button>
      </div>
    </div>
  );
});
