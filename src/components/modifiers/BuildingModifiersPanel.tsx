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
import {
  StoryOffsetModifier,
  ZoneOffsetModifier,
  ZoneCornerType,
  BayWindowModifier,
  TerraceModifier,
  DonutModifier,
  CornerCutModifier,
  StoryFootprint,
} from '../../types/modifiers';
import { SetbackPenthouseIcon } from '../icons/SetbackPenthouseIcon';
import {
  BayWindowIcon,
  TerraceIcon,
  DonutIcon,
  ZoneBufferIcon,
  ChamferIcon,
  FilletIcon,
  NotchIcon,
} from '../common/CustomCadIcons';
import { FloatingInspectorCard } from '../common/FloatingInspectorCard';
import { StoryRangeSelector } from './StoryRangeSelector';

interface GlobalIndexOption {
  value: number;
  label: string;
}

/**
 * Buduje listę opcji indeksowanych globalnie (obrys zewnętrzny 0..n-1, następnie kolejne otwory dziedzińca),
 * zgodnie z konwencją indeksowania używaną przez modyfikatory (bay_window/terrace/corner_cut).
 */
function buildGlobalIndexOptions(
  outerCount: number,
  storyPolygons: StoryFootprint[],
  outerLabel: (i: number) => string,
  holeLabel: (holeIdx: number, localIdx: number) => string
): GlobalIndexOption[] {
  const list: GlobalIndexOption[] = [];

  for (let i = 0; i < outerCount; i++) {
    list.push({ value: i, label: outerLabel(i) });
  }

  const sampleStoryWithHoles = storyPolygons.find((sp) => sp.holes && sp.holes.length > 0);
  if (sampleStoryWithHoles && sampleStoryWithHoles.holes) {
    let currGlobal = outerCount;
    sampleStoryWithHoles.holes.forEach((hole, hIdx) => {
      hole.forEach((_, lIdx) => {
        list.push({ value: currGlobal, label: holeLabel(hIdx, lIdx) });
        currGlobal++;
      });
    });
  }
  return list;
}

const CORNER_CUT_MODE_OPTIONS: { value: CornerCutModifier['mode']; label: string; Icon: React.FC<{ size?: number; color?: string }> }[] = [
  { value: 'chamfer', label: 'Ukośne', Icon: ChamferIcon },
  { value: 'fillet', label: 'Zaokrąglenie', Icon: FilletIcon },
  { value: 'notch', label: 'Karo', Icon: NotchIcon },
];

const ZONE_CORNER_OPTIONS: { value: ZoneCornerType; label: string }[] = [
  { value: 'miter', label: 'Proste' },
  { value: 'round', label: 'Zaokrąglone' },
  { value: 'chamfer', label: 'Ścięte' },
];

const CORNER_CUT_SCOPE_OPTIONS: { value: CornerCutModifier['scope']; label: string }[] = [
  { value: 'all', label: 'Wszystkie narożniki' },
  { value: 'edge', label: 'Narożniki krawędzi' },
  { value: 'vertex', label: 'Jeden narożnik' },
];

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

  const modifiers = selectedBuilding?.modifiers || [];
  const storyPolygons: StoryFootprint[] = selectedBuilding?.storyPolygons || [];

  const availableEdges = React.useMemo(() => {
    if (!selectedBuilding) return [];
    return buildGlobalIndexOptions(
      selectedBuilding.vertices?.length || 0,
      storyPolygons,
      (i) => `Ściana zewnętrzna #${i + 1}`,
      (hIdx, lIdx) => `Dziedziniec #${hIdx + 1} - Krawędź #${lIdx + 1}`
    );
  }, [selectedBuilding, storyPolygons]);

  const availableVertices = React.useMemo(() => {
    if (!selectedBuilding) return [];
    return buildGlobalIndexOptions(
      selectedBuilding.vertices?.length || 0,
      storyPolygons,
      (i) => `Narożnik zewnętrzny #${i + 1}`,
      (hIdx, lIdx) => `Dziedziniec #${hIdx + 1} - Narożnik #${lIdx + 1}`
    );
  }, [selectedBuilding, storyPolygons]);

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
      cornerType: 'miter',
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

  const handleAddTerraceModifier = () => {
    const newMod: TerraceModifier = {
      id: `mod-terrace-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'terrace',
      enabled: true,
      depth: -4.0, // domyślnie -4m głębokość uskoku
      storiesCount: -1, // domyślnie ostatnia kondygnacja (penthouse)
    };
    addBuildingModifier(selectedBuilding.id, newMod);
  };

  const handleAddDonutModifier = () => {
    const newMod: DonutModifier = {
      id: `mod-donut-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'donut',
      enabled: true,
      offset: -12.0, // domyślnie -12m offset otworu
      storiesCount: 0, // domyślnie cała wysokość / bryła
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
          Modyfikatory generują uskokowe poziomy kondygnacji, strefy o zadanym odsunięciu, wykusze fasad, tarasy oraz wewnętrzne dziedzińce (donat).
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
            const isTerrace = mod.type === 'terrace';
            const isDonut = mod.type === 'donut';
            const isCornerCut = mod.type === 'corner_cut';
            const offsetMod = mod as StoryOffsetModifier;

            const modTitle = isStoryOffset
              ? 'Uskok kondygnacji'
              : isZoneOffset
              ? 'Strefa (obszar)'
              : isBayWindow
              ? 'Wykusz (Bay Window)'
              : isTerrace
              ? 'Taras (uskok krawędzi)'
              : isDonut
              ? 'Donat (otwór/patio)'
              : 'Ścięcie narożnika';
            const titleColor = isStoryOffset
              ? '#f3e8ff'
              : isZoneOffset
              ? '#bae6fd'
              : isBayWindow
              ? '#fef08a'
              : isTerrace
              ? '#fed7aa'
              : isDonut
              ? '#a7f3d0'
              : '#7dd3fc';

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
                    <StoryRangeSelector
                      value={offsetMod.storiesCount}
                      allowWholeBuilding={false}
                      onChange={(val) =>
                        updateBuildingModifier(selectedBuilding.id, mod.id, {
                          storiesCount: val,
                        })
                      }
                    />
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

                      {/* Typ naroża pasa strefy: miter / round / chamfer */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                          Typ naroży:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                          {ZONE_CORNER_OPTIONS.map(({ value, label }) => {
                            const currentCorner = zoneMod.cornerType ?? 'miter';
                            const isSelectedCorner = currentCorner === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() =>
                                  updateBuildingModifier(selectedBuilding.id, mod.id, { cornerType: value })
                                }
                                style={{
                                  padding: '5px 0',
                                  fontSize: '9.5px',
                                  fontWeight: isSelectedCorner ? 700 : 500,
                                  borderRadius: '4px',
                                  border: isSelectedCorner ? '1px solid #7dd3fc' : '1px solid rgba(255, 255, 255, 0.1)',
                                  backgroundColor: isSelectedCorner ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                                  color: isSelectedCorner ? '#7dd3fc' : '#94a3b8',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                {label}
                              </button>
                            );
                          })}
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
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
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
                      </div>

                      {/* Stories Count */}
                      <StoryRangeSelector
                        value={bayMod.storiesCount}
                        label="Kondygnacja:"
                        allowWholeBuilding={true}
                        onChange={(val) =>
                          updateBuildingModifier(selectedBuilding.id, mod.id, {
                            storiesCount: val,
                          })
                        }
                      />

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
                      <div style={{ display: 'grid', gridTemplateColumns: availableEdges.length > 1 ? '1.2fr 0.8fr' : '1fr', gap: '8px', alignItems: 'center' }}>
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

                        {availableEdges.length > 1 && (
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
                              {availableEdges.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
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

                {isTerrace && (() => {
                  const terraceMod = mod as TerraceModifier;

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {/* Depth [m] */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                            Uskok kaskady (m):
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={terraceMod.depth}
                            onChange={(e) =>
                              updateBuildingModifier(selectedBuilding.id, mod.id, {
                                depth: parseFloat(e.target.value) || 0,
                              })
                            }
                            style={{
                              width: '100%',
                              backgroundColor: 'var(--bg-input)',
                              border: '1px solid var(--border-light)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
                              padding: '4px 6px',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              fontWeight: 600,
                            }}
                          />
                          <span style={{ fontSize: '9px', color: terraceMod.depth < 0 ? '#fed7aa' : 'var(--accent-blue)' }}>
                            {terraceMod.depth < 0 ? 'Cofnięcie ściany (-)' : 'Nadwieszenie ściany (+)'}
                          </span>
                        </div>

                        {/* Stories Count */}
                        <StoryRangeSelector
                          value={terraceMod.storiesCount}
                          allowWholeBuilding={true}
                          onChange={(val) =>
                            updateBuildingModifier(selectedBuilding.id, mod.id, {
                              storiesCount: val,
                            })
                          }
                        />
                      </div>

                      {/* Wybór krawędzi */}
                      {availableEdges.length > 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                            Modyfikowana krawędź ściany:
                          </label>
                          <select
                            value={terraceMod.edgeIndex !== undefined ? terraceMod.edgeIndex : -1}
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
                            <option value="-1">Domyślna (najdłuższa krawędź)</option>
                            {availableEdges.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {isDonut && (() => {
                  const donutMod = mod as DonutModifier;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {/* Offset [m] */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                            Offset otworu (m):
                          </label>
                          <input
                            type="number"
                            step="1.0"
                            value={donutMod.offset}
                            onChange={(e) =>
                              updateBuildingModifier(selectedBuilding.id, mod.id, {
                                offset: parseFloat(e.target.value) || 0,
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
                          <span style={{ fontSize: '9px', color: '#a7f3d0' }}>
                            Wcięcie do środka: {donutMod.offset}m
                          </span>
                        </div>

                        {/* Stories Count */}
                        <StoryRangeSelector
                          value={donutMod.storiesCount}
                          allowWholeBuilding={true}
                          onChange={(val) =>
                            updateBuildingModifier(selectedBuilding.id, mod.id, {
                              storiesCount: val,
                            })
                          }
                        />
                      </div>
                    </div>
                  );
                })()}

                {isCornerCut && (() => {
                  const cutMod = mod as CornerCutModifier;
                  const modeOptions = CORNER_CUT_MODE_OPTIONS;
                  const scopeOptions = CORNER_CUT_SCOPE_OPTIONS;
                  const selectedModeLabel = modeOptions.find((m) => m.value === cutMod.mode)?.label;
                  const selectedScopeLabel = scopeOptions.find((s) => s.value === cutMod.scope)?.label;

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {/* Depth 'd' [m] */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                            Wartość d (m):
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={cutMod.depth}
                            onChange={(e) =>
                              updateBuildingModifier(selectedBuilding.id, mod.id, {
                                depth: Math.max(0.1, parseFloat(e.target.value) || 0.1),
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
                        <StoryRangeSelector
                          value={cutMod.storiesCount}
                          allowWholeBuilding={true}
                          onChange={(val) =>
                            updateBuildingModifier(selectedBuilding.id, mod.id, {
                              storiesCount: val,
                            })
                          }
                        />
                      </div>

                      {/* Tryb ścięcia: chamfer / fillet / notch */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                          Tryb ścięcia:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                          {modeOptions.map(({ value, label, Icon }) => {
                            const isSelectedMode = cutMod.mode === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() =>
                                  updateBuildingModifier(selectedBuilding.id, mod.id, { mode: value })
                                }
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: '2px',
                                  padding: '5px 0',
                                  fontSize: '9.5px',
                                  fontWeight: isSelectedMode ? 700 : 500,
                                  borderRadius: '4px',
                                  border: isSelectedMode ? '1px solid #7dd3fc' : '1px solid rgba(255, 255, 255, 0.1)',
                                  backgroundColor: isSelectedMode ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                                  color: isSelectedMode ? '#7dd3fc' : '#94a3b8',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <Icon size={14} color={isSelectedMode ? '#7dd3fc' : '#94a3b8'} />
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Zakres: wszystkie / krawędź / jeden narożnik */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                          Zakres ścięcia:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                          {scopeOptions.map(({ value, label }) => {
                            const isSelectedScope = cutMod.scope === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() =>
                                  updateBuildingModifier(selectedBuilding.id, mod.id, { scope: value })
                                }
                                style={{
                                  padding: '4px 2px',
                                  fontSize: '9.5px',
                                  fontWeight: isSelectedScope ? 700 : 500,
                                  borderRadius: '4px',
                                  border: isSelectedScope ? '1px solid #7dd3fc' : '1px solid rgba(255, 255, 255, 0.1)',
                                  backgroundColor: isSelectedScope ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                                  color: isSelectedScope ? '#7dd3fc' : '#94a3b8',
                                  cursor: 'pointer',
                                  textAlign: 'center',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {cutMod.scope === 'edge' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                            Krawędź:
                          </label>
                          <select
                            value={cutMod.edgeIndex !== undefined ? cutMod.edgeIndex : -1}
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
                            <option value="-1">Domyślna (pierwsza)</option>
                            {availableEdges.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {cutMod.scope === 'vertex' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '10px', color: '#94a3b8' }}>
                            Narożnik:
                          </label>
                          <select
                            value={cutMod.vertexIndex !== undefined ? cutMod.vertexIndex : -1}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              updateBuildingModifier(selectedBuilding.id, mod.id, {
                                vertexIndex: val >= 0 ? val : undefined,
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
                            <option value="-1">Domyślny (pierwszy)</option>
                            {availableVertices.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <span style={{ fontSize: '9px', color: '#7dd3fc' }}>
                        d = {cutMod.depth}m • {selectedModeLabel}
                        {' • '}
                        {selectedScopeLabel}
                      </span>
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>

    </FloatingInspectorCard>
  );
});

