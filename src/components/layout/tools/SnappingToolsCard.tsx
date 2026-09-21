import React from 'react';
import { Magnet } from 'lucide-react';
import { useCadToolStore } from '../../../store';
import {
  SnapEndpointIcon,
  SnapIntersectionIcon,
  SnapPerpendicularIcon,
  SnapNearestIcon,
  SnapExtensionIcon,
  SnapOrthoIcon,
  SnapDominantIcon,
  SnapRelativeIcon,
  SnapDualIntersectionIcon,
} from '../../common/CustomCadIcons';

interface SnapInfoItem {
  label: string;
  title: string;
  Icon: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;
}

// Punkty/prowadnice wchodzące w skład grupy OSNAP/OTRACK — informacyjne, nie da się
// wyłączyć pojedynczego typu: cała grupa działa razem albo wcale (patrz SnapContext.isOsnapActive /
// isDirectionSnappingActive w src/engine/snapping/types.ts, OSNAP_TYPES/OTRACK_TYPES).
const OSNAP_ITEMS: SnapInfoItem[] = [
  { label: 'Wierzchołek', title: 'Wierzchołek (Endpoint): przyciąganie do narożników i końców ścian', Icon: SnapEndpointIcon },
  { label: 'Przecięcie', title: 'Przecięcie (Intersection): przyciąganie do przecięć ścian i krawędzi', Icon: SnapIntersectionIcon },
  { label: 'Prostopadły', title: 'Rzut prostopadły (Perpendicular): dociąganie pod kątem prostym do ścian', Icon: SnapPerpendicularIcon },
  { label: 'Krawędź', title: 'Punkt na krawędzi (Nearest): przyciąganie bezpośrednio do obrysu ściany', Icon: SnapNearestIcon },
  { label: 'Przedłużenie', title: 'Przedłużenie (Extension): śledzenie prostej przedłużenia istniejącej ściany', Icon: SnapExtensionIcon },
];

const OTRACK_ITEMS: SnapInfoItem[] = [
  { label: 'Kardynalne 0°/90°', title: 'Osie kardynalne (Ortho): śledzenie kierunków głównych 0°, 90°, 180°, 270°', Icon: SnapOrthoIcon },
  { label: 'Siatka projektu', title: 'Siatka dominująca: śledzenie dominujących kierunków wyznaczonych z analizy ścian', Icon: SnapDominantIcon },
  { label: 'Kąty ścian (|| / ⊥)', title: 'Kąty względne: prowadnice równoległe i prostopadłe do wskazywanych ścian i polilinii', Icon: SnapRelativeIcon },
  { label: 'Przecięcia osi', title: 'Przecięcia prowadnic (Dual-Guide): dociąganie do punktów przecięcia dwóch osi śledzenia', Icon: SnapDualIntersectionIcon },
];

interface SliderSpec {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  format?: (v: number) => string;
}

const SnapSlider: React.FC<SliderSpec> = ({ label, value, onChange, min, max, step, unit, format }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--text-secondary)' }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
        {format ? format(value) : value}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{ width: '100%', accentColor: 'var(--accent-emerald)', cursor: 'pointer' }}
    />
  </div>
);

export const SnappingToolsCard: React.FC = () => {
  const isOsnapActive = useCadToolStore((s) => s.isOsnapActive);
  const toggleOsnap = useCadToolStore((s) => s.toggleOsnap);
  const isDirectionSnappingActive = useCadToolStore((s) => s.isDirectionSnappingActive);
  const toggleDirectionSnapping = useCadToolStore((s) => s.toggleDirectionSnapping);

  // Parametry silnika SNAP zgodne ze spec §5 (SnapEngineConfig) i K_cat (spec §3) —
  // wcześniej zahardkodowane w SnapCoordinator.ts / types.ts, teraz sterowalne z UI.
  const snapApertureRadiusPx = useCadToolStore((s) => s.snapApertureRadiusPx);
  const setSnapApertureRadiusPx = useCadToolStore((s) => s.setSnapApertureRadiusPx);
  const snapProjectRadiusMeters = useCadToolStore((s) => s.snapProjectRadiusMeters);
  const setSnapProjectRadiusMeters = useCadToolStore((s) => s.setSnapProjectRadiusMeters);
  const snapEdgeUcsDeadbandDeg = useCadToolStore((s) => s.snapEdgeUcsDeadbandDeg);
  const setSnapEdgeUcsDeadbandDeg = useCadToolStore((s) => s.setSnapEdgeUcsDeadbandDeg);
  const snapTypeWeights = useCadToolStore((s) => s.snapTypeWeights);
  const setSnapTypeWeight = useCadToolStore((s) => s.setSnapTypeWeight);
  const snapCategorySameWeightPx = useCadToolStore((s) => s.snapCategorySameWeightPx);
  const setSnapCategorySameWeightPx = useCadToolStore((s) => s.setSnapCategorySameWeightPx);
  const snapCategoryBalconyToBuildingWeightPx = useCadToolStore((s) => s.snapCategoryBalconyToBuildingWeightPx);
  const setSnapCategoryBalconyToBuildingWeightPx = useCadToolStore((s) => s.setSnapCategoryBalconyToBuildingWeightPx);
  const snapCategoryBuildingToBoundaryWeightPx = useCadToolStore((s) => s.snapCategoryBuildingToBoundaryWeightPx);
  const setSnapCategoryBuildingToBoundaryWeightPx = useCadToolStore((s) => s.setSnapCategoryBuildingToBoundaryWeightPx);

  const resetSnapEngineDefaults = useCadToolStore((s) => s.resetSnapEngineDefaults);

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

        {/* 1. SEKCJA OSNAP (Punkty charakterystyczne) — grupowy przełącznik, bez wyboru per-typu */}
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
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-primary)' }}>OSNAP (Punkty)</span>
            <button
              type="button"
              onClick={toggleOsnap}
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '4px',
                border: isOsnapActive ? '1px solid var(--accent-emerald)' : '1px solid var(--border-light)',
                backgroundColor: isOsnapActive ? 'var(--status-emerald-bg)' : 'transparent',
                color: isOsnapActive ? 'var(--accent-emerald)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: 700,
              }}
              title="Włącz / wyłącz cały OSNAP naraz — poszczególne typy punktów działają wyłącznie razem"
            >
              {isOsnapActive ? 'WŁ' : 'WYŁ'}
            </button>
          </div>

          {/* Informacyjna siatka typów punktów wchodzących w skład OSNAP (bez interakcji) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
            {OSNAP_ITEMS.map((item) => (
              <div
                key={item.label}
                className={`btn-tile ${isOsnapActive ? 'active-emerald' : 'inactive'}`}
                style={{
                  padding: '5px 4px',
                  fontSize: '9.5px',
                  justifyContent: 'center',
                  gap: '4px',
                  opacity: isOsnapActive ? 1 : 0.5,
                  cursor: 'default',
                }}
                title={item.title}
              >
                <item.Icon size={12} color={isOsnapActive ? 'var(--accent-emerald)' : 'var(--text-secondary)'} />
                <span style={{ fontWeight: isOsnapActive ? 700 : 500 }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 2. SEKCJA OTRACK (Śledzenie biegunowe / prowadnice kierunków) — grupowy przełącznik */}
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
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-primary)' }}>OTRACK (Prowadnice)</span>
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
              title="Włącz / wyłącz cały OTRACK naraz — poszczególne prowadnice działają wyłącznie razem"
            >
              {isDirectionSnappingActive ? 'WŁ' : 'WYŁ'}
            </button>
          </div>

          {/* Informacyjna siatka prowadnic wchodzących w skład OTRACK (bez interakcji) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
            {OTRACK_ITEMS.map((item) => (
              <div
                key={item.label}
                className={`btn-tile ${isDirectionSnappingActive ? 'active-emerald' : 'inactive'}`}
                style={{
                  padding: '5px 6px',
                  fontSize: '9.5px',
                  justifyContent: 'flex-start',
                  gap: '5px',
                  opacity: isDirectionSnappingActive ? 1 : 0.5,
                  cursor: 'default',
                }}
                title={item.title}
              >
                <item.Icon size={12} color={isDirectionSnappingActive ? 'var(--accent-emerald)' : 'var(--text-secondary)'} />
                <span style={{ fontWeight: isDirectionSnappingActive ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Silnik SNAP — parametry ze specyfikacji algorytmicznej (SnapEngineConfig + K_cat) */}
        <div
          style={{
            padding: '8px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-primary)' }}>Silnik SNAP — parametry</span>

          <SnapSlider
            label="Apertura (R_aperture)"
            value={snapApertureRadiusPx}
            onChange={setSnapApertureRadiusPx}
            min={4}
            max={40}
            step={1}
            unit=" px"
          />
          <SnapSlider
            label="Promień normalizacji krawędzi (R_proj)"
            value={snapProjectRadiusMeters}
            onChange={setSnapProjectRadiusMeters}
            min={10}
            max={150}
            step={5}
            unit=" m"
          />
          <SnapSlider
            label="Deadband EDGE_UCS"
            value={snapEdgeUcsDeadbandDeg}
            onChange={setSnapEdgeUcsDeadbandDeg}
            min={0.5}
            max={10}
            step={0.5}
            unit="°"
            format={(v) => v.toFixed(1)}
          />

          <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '2px' }}>
            Wagi hierarchii węzłów (M_type)
          </span>
          <SnapSlider
            label="Wierzchołek"
            value={snapTypeWeights.vertex ?? 1.5}
            onChange={(v) => setSnapTypeWeight('vertex', v)}
            min={0.1}
            max={2.0}
            step={0.05}
            unit=""
            format={(v) => v.toFixed(2)}
          />
          <SnapSlider
            label="Przecięcie / OTRACK"
            value={snapTypeWeights.otrack_intersection ?? 1.3}
            onChange={(v) => setSnapTypeWeight('otrack_intersection', v)}
            min={0.1}
            max={2.0}
            step={0.05}
            unit=""
            format={(v) => v.toFixed(2)}
          />
          <SnapSlider
            label="Prostopadły"
            value={snapTypeWeights.perpendicular ?? 1.0}
            onChange={(v) => setSnapTypeWeight('perpendicular', v)}
            min={0.1}
            max={2.0}
            step={0.05}
            unit=""
            format={(v) => v.toFixed(2)}
          />
          <SnapSlider
            label="Przedłużenie"
            value={snapTypeWeights.extension ?? 0.8}
            onChange={(v) => setSnapTypeWeight('extension', v)}
            min={0.1}
            max={2.0}
            step={0.05}
            unit=""
            format={(v) => v.toFixed(2)}
          />
          <SnapSlider
            label="Krawędź"
            value={snapTypeWeights.edge ?? 0.75}
            onChange={(v) => setSnapTypeWeight('edge', v)}
            min={0.1}
            max={2.0}
            step={0.05}
            unit=""
            format={(v) => v.toFixed(2)}
          />

          <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '2px' }}>
            Powinowactwo kategorii (K_cat)
          </span>
          <SnapSlider
            label="Ta sama kategoria"
            value={snapCategorySameWeightPx}
            onChange={setSnapCategorySameWeightPx}
            min={0}
            max={10}
            step={0.5}
            unit=" px"
          />
          <SnapSlider
            label="Balkon → Budynek"
            value={snapCategoryBalconyToBuildingWeightPx}
            onChange={setSnapCategoryBalconyToBuildingWeightPx}
            min={0}
            max={10}
            step={0.5}
            unit=" px"
          />
          <SnapSlider
            label="Budynek → Granica działki"
            value={snapCategoryBuildingToBoundaryWeightPx}
            onChange={setSnapCategoryBuildingToBoundaryWeightPx}
            min={0}
            max={10}
            step={0.5}
            unit=" px"
          />
        </div>

        <button
          type="button"
          onClick={resetSnapEngineDefaults}
          className="btn-tile inactive"
          style={{ padding: '6px 10px', justifyContent: 'center', width: '100%', fontSize: '10px', fontWeight: 700 }}
          title="Przywróć domyślne wartości parametrów OSNAP/OTRACK"
        >
          Przywróć domyślne
        </button>

      </div>
    </div>
  );
};
