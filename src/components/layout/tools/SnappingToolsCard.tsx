import React from 'react';
import { Magnet, SlidersHorizontal } from 'lucide-react';
import { useCadToolStore, useSceneStore } from '../../../store';
import { OsnapModes, OtrackModes } from '../../../store/useCadToolStore';
import {
  SnapEndpointIcon,
  SnapMidpointIcon,
  SnapIntersectionIcon,
  SnapPerpendicularIcon,
  SnapNearestIcon,
  SnapExtensionIcon,
  SnapOrthoIcon,
  SnapDominantIcon,
  SnapRelativeIcon,
  SnapDualIntersectionIcon,
} from '../../common/CustomCadIcons';
import { analyzeSegmentsStatistics } from '../../../utils/segmentStatistics';

interface SnapOptionItem<T> {
  key: T;
  label: string;
  title: string;
  Icon: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;
}

const OSNAP_ITEMS: SnapOptionItem<keyof OsnapModes>[] = [
  {
    key: 'vertex',
    label: 'Wierzchołek',
    title: 'Wierzchołek (Endpoint): przyciągaj do narożników i końców ścian',
    Icon: SnapEndpointIcon,
  },
  {
    key: 'midpoint',
    label: 'Środek',
    title: 'Środek odcinka (Midpoint): przyciągaj do środków krawędzi',
    Icon: SnapMidpointIcon,
  },
  {
    key: 'intersection',
    label: 'Przecięcie',
    title: 'Przecięcie (Intersection): przyciągaj do przecięć ścian i krawędzi',
    Icon: SnapIntersectionIcon,
  },
  {
    key: 'perpendicular',
    label: 'Prostopadły',
    title: 'Rzut prostopadły (Perpendicular): dociągaj pod kątem prostym do ścian',
    Icon: SnapPerpendicularIcon,
  },
  {
    key: 'edge',
    label: 'Krawędź',
    title: 'Punkt na krawędzi (Nearest): przyciągaj bezpośrednio do obrysu ściany',
    Icon: SnapNearestIcon,
  },
  {
    key: 'extension',
    label: 'Przedłużenie',
    title: 'Przedłużenie (Extension): śledź prostą przedłużenia istniejącej ściany',
    Icon: SnapExtensionIcon,
  },
];

const OTRACK_ITEMS: SnapOptionItem<keyof OtrackModes>[] = [
  {
    key: 'ortho',
    label: 'Kardynalne 0°/90°',
    title: 'Osie kardynalne (Ortho): śledzenie kierunków głównych 0°, 90°, 180°, 270°',
    Icon: SnapOrthoIcon,
  },
  {
    key: 'dominant',
    label: 'Siatka projektu',
    title: 'Siatka dominująca: śledzenie dominujących kierunków wyznaczonych z analizy ścian',
    Icon: SnapDominantIcon,
  },
  {
    key: 'relative',
    label: 'Kąty ścian (|| / ⊥)',
    title: 'Kąty względne: prowadnice równoległe i prostopadłe do wskazywanych ścian i polilinii',
    Icon: SnapRelativeIcon,
  },
  {
    key: 'dualIntersection',
    label: 'Przecięcia osi',
    title: 'Przecięcia prowadnic (Dual-Guide): dociągaj do punktów przecięcia dwóch osi śledzenia',
    Icon: SnapDualIntersectionIcon,
  },
];

export const SnappingToolsCard: React.FC = () => {
  const isOsnapActive = useCadToolStore((s) => s.isOsnapActive);
  const toggleOsnap = useCadToolStore((s) => s.toggleOsnap);
  const isDirectionSnappingActive = useCadToolStore((s) => s.isDirectionSnappingActive);
  const toggleDirectionSnapping = useCadToolStore((s) => s.toggleDirectionSnapping);

  const osnapModes = useCadToolStore((s) => s.osnapModes);
  const toggleOsnapMode = useCadToolStore((s) => s.toggleOsnapMode);
  const setAllOsnapModes = useCadToolStore((s) => s.setAllOsnapModes);

  const otrackModes = useCadToolStore((s) => s.otrackModes);
  const toggleOtrackMode = useCadToolStore((s) => s.toggleOtrackMode);
  const setAllOtrackModes = useCadToolStore((s) => s.setAllOtrackModes);

  const noisePercentileCutoff = useCadToolStore((s) => s.noisePercentileCutoff);
  const setNoisePercentileCutoff = useCadToolStore((s) => s.setNoisePercentileCutoff);

  const snapRadiusPx = useCadToolStore((s) => s.snapRadiusPx);
  const setSnapRadiusPx = useCadToolStore((s) => s.setSnapRadiusPx);

  const buildings = useSceneStore((s) => s.buildings);

  // Wyliczenie aktualnego progu długości w metrach dla filtru HPF
  const stats = React.useMemo(
    () => analyzeSegmentsStatistics(buildings, { noisePercentileCutoff }),
    [buildings, noisePercentileCutoff]
  );

  const allOsnapOn = Object.values(osnapModes).every(Boolean);
  const allOtrackOn = Object.values(otrackModes).every(Boolean);

  const magnetismPercentage = Math.round((snapRadiusPx / 14) * 100);

  return (
    <div className="ui-card">
      <div className="ui-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Dociąganie</span>
          <span
            style={{
              fontSize: '9.5px',
              padding: '1px 6px',
              borderRadius: '10px',
              backgroundColor: isOsnapActive || isDirectionSnappingActive ? 'var(--status-emerald-bg)' : 'var(--bg-input)',
              color: isOsnapActive || isDirectionSnappingActive ? 'var(--accent-emerald)' : 'var(--text-secondary)',
              fontWeight: 700,
              border: '1px solid var(--border-light)',
            }}
          >
            {isOsnapActive || isDirectionSnappingActive ? 'AKTYWNE' : 'WYŁ'}
          </span>
        </div>
        <Magnet size={14} color="var(--accent-emerald)" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Główny przełącznik dociągania (Master Switch) */}
        <button
          type="button"
          onClick={toggleOsnap}
          className={`btn-tile ${isOsnapActive ? 'active-emerald' : 'inactive'}`}
          style={{ padding: '7px 10px', justifyContent: 'space-between', width: '100%' }}
          title="Włącz / wyłącz przyciąganie geometryczne [S / F3] (przytrzymaj SHIFT aby wymusić kąty kardynalne i dominujące)"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Magnet size={13} color={isOsnapActive ? 'var(--accent-emerald)' : 'var(--text-muted)'} />
            <span style={{ fontWeight: 600, fontSize: '11px' }}>Przyciąganie [S / F3]</span>
          </div>
          <span style={{ fontSize: '10px', fontWeight: 700 }}>
            {isOsnapActive ? 'WŁ' : 'WYŁ'}
          </span>
        </button>

        {/* 1. SEKCJA OSNAP (Punkty charakterystyczne) */}
        <div
          style={{
            padding: '8px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span>OSNAP (Punkty)</span>
            </span>

            <button
              type="button"
              onClick={() => setAllOsnapModes(!allOsnapOn)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '9.5px',
                cursor: 'pointer',
                padding: '2px 4px',
                fontWeight: 600,
              }}
              title="Włącz lub wyłącz wszystkie tryby OSNAP"
            >
              {allOsnapOn ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
            </button>
          </div>

          {/* Siatka 3 kolumny z monochromatycznymi ikonami */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
            {OSNAP_ITEMS.map((item) => {
              const active = isOsnapActive && osnapModes[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleOsnapMode(item.key)}
                  className={`btn-tile ${active ? 'active-emerald' : 'inactive'}`}
                  style={{
                    padding: '5px 4px',
                    fontSize: '9.5px',
                    justifyContent: 'center',
                    gap: '4px',
                    opacity: isOsnapActive ? 1 : 0.5,
                  }}
                  title={item.title}
                >
                  <item.Icon size={12} color={active ? 'var(--accent-emerald)' : 'var(--text-secondary)'} />
                  <span style={{ fontWeight: active ? 700 : 500 }}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. SEKCJA OTRACK (Śledzenie biegunowe / prowadnice kierunków) */}
        <div
          style={{
            padding: '8px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                OTRACK (Prowadnice)
              </span>
              <button
                type="button"
                onClick={toggleDirectionSnapping}
                style={{
                  fontSize: '9px',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  border: isDirectionSnappingActive ? '1px solid var(--accent-emerald)' : '1px solid var(--border-light)',
                  backgroundColor: isDirectionSnappingActive ? 'var(--status-emerald-bg)' : 'transparent',
                  color: isDirectionSnappingActive ? 'var(--accent-emerald)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
                title="Włącz / wyłącz śledzenie biegunowe OTRACK"
              >
                {isDirectionSnappingActive ? 'WŁ' : 'WYŁ'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAllOtrackModes(!allOtrackOn)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '9.5px',
                cursor: 'pointer',
                padding: '2px 4px',
                fontWeight: 600,
              }}
              title="Włącz lub wyłącz wszystkie tryby OTRACK"
            >
              {allOtrackOn ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
            </button>
          </div>

          {/* Siatka 2 kolumny z monochromatycznymi ikonami OTRACK */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
            {OTRACK_ITEMS.map((item) => {
              const active = isDirectionSnappingActive && otrackModes[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleOtrackMode(item.key)}
                  className={`btn-tile ${active ? 'active-emerald' : 'inactive'}`}
                  style={{
                    padding: '5px 6px',
                    fontSize: '9.5px',
                    justifyContent: 'flex-start',
                    gap: '5px',
                    opacity: isDirectionSnappingActive ? 1 : 0.5,
                  }}
                  title={item.title}
                >
                  <item.Icon size={12} color={active ? 'var(--accent-emerald)' : 'var(--text-secondary)'} />
                  <span style={{ fontWeight: active ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. SIŁA PRZYCIĄGANIA (MAGNETYCZNOŚĆ SNAP) */}
        <div
          style={{
            padding: '8px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Magnet size={12} color="var(--accent-emerald)" />
              <span>Magnetyczność (Siła przyciągania)</span>
            </span>
            <span style={{ color: 'var(--accent-emerald)', fontWeight: 700, fontFamily: 'monospace' }}>
              {snapRadiusPx}px ({magnetismPercentage}%)
            </span>
          </div>

          <input
            type="range"
            min={6}
            max={30}
            step={1}
            value={snapRadiusPx}
            onChange={(e) => setSnapRadiusPx(Number(e.target.value))}
            style={{
              width: '100%',
              accentColor: 'var(--accent-emerald)',
              cursor: 'pointer',
              height: '4px',
              margin: '3px 0',
            }}
            title="Regulacja promienia łapania punktów i siły dociągania krawędzi oraz prowadnic"
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)' }}>
            <span>Precyzyjny (6px)</span>
            <span>Standard (14px)</span>
            <span>Mocny (30px)</span>
          </div>
        </div>

        {/* 4. FILTR GÓRNOPRZEPUSTOWY (HPF - High Pass Filter) */}
        <div
          style={{
            padding: '8px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <SlidersHorizontal size={12} color="var(--text-secondary)" />
              <span>Filtr szumu osi (HPF)</span>
            </span>
            <span style={{ color: 'var(--accent-amber)', fontWeight: 700, fontFamily: 'monospace' }}>
              {noisePercentileCutoff}% ({stats.lengthCutoffMeters.toFixed(2)}m)
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={50}
            step={5}
            value={noisePercentileCutoff}
            onChange={(e) => setNoisePercentileCutoff(Number(e.target.value))}
            style={{
              width: '100%',
              accentColor: 'var(--accent-amber)',
              cursor: 'pointer',
              height: '4px',
              margin: '3px 0',
            }}
            title="Odrzuca najkrótsze odcinki i mniejszościowe kierunki przy wyznaczaniu siatki projektu"
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)' }}>
            <span>Wszystkie ścianki (0%)</span>
            <span>Eliminuj szum DXF (50%)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
