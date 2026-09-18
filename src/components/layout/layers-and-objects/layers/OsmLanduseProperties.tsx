import React from 'react';
import { OsmLanduseLayerConfig } from '@/modules/wfs-import/store/useOsmLanduseStore';

interface OsmLandusePropertiesProps {
  layer: OsmLanduseLayerConfig;
  featuresCount: number;
  totalAreaM2: number;
  totalLengthM?: number;
  monumentsCount?: number;
  onUpdateConfig: (layerId: string, patch: Partial<OsmLanduseLayerConfig>) => void;
}

export const OsmLanduseProperties: React.FC<OsmLandusePropertiesProps> = ({
  layer,
  featuresCount,
  totalAreaM2,
  totalLengthM = 0,
  monumentsCount = 0,
  onUpdateConfig,
}) => {
  const isTrees = layer.id === 'osm_trees';
  const isLinear = !isTrees && (layer.isLinear || totalLengthM > 0);

  const formattedArea =
    totalAreaM2 >= 10000
      ? `${(totalAreaM2 / 10000).toFixed(2)} ha`
      : `${Math.round(totalAreaM2)} m²`;

  const formattedLength =
    totalLengthM >= 1000
      ? `${(totalLengthM / 1000).toFixed(2)} km`
      : `${Math.round(totalLengthM)} m`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        paddingTop: '8px',
        marginTop: '2px',
        borderTop: '1px dashed var(--border-light)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          {isTrees
            ? 'Liczba drzew:'
            : isLinear
            ? 'Obiekty / Długość trasy:'
            : 'Obiekty / Powierzchnia:'}
        </span>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          {featuresCount} ob. {isTrees ? (monumentsCount > 0 ? `(🌟 ${monumentsCount} pomn.)` : '') : isLinear ? `(${formattedLength})` : `(${formattedArea})`}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          Przezroczystość ({Math.round(layer.opacity * 100)}%)
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={layer.opacity}
          onChange={(e) => onUpdateConfig(layer.id, { opacity: parseFloat(e.target.value) })}
          style={{ width: '100px', cursor: 'pointer' }}
        />
      </div>

      {isLinear && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Grubość linii ({(layer.lineWidth ?? 2).toFixed(1)} px)
          </label>
          <input
            type="range"
            min="0.5"
            max="8"
            step="0.5"
            value={layer.lineWidth ?? 2}
            onChange={(e) => onUpdateConfig(layer.id, { lineWidth: parseFloat(e.target.value) })}
            style={{ width: '100px', cursor: 'pointer' }}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {isTrees ? 'Kolor koron:' : isLinear ? 'Kolor linii:' : 'Kolor wypełnienia:'}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="color"
            value={layer.color}
            onChange={(e) =>
              onUpdateConfig(layer.id, {
                color: e.target.value,
                ...(isLinear ? { strokeColor: e.target.value } : {}),
              })
            }
            style={{
              width: '28px',
              height: '22px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              padding: 0,
              cursor: 'pointer',
              background: 'transparent',
            }}
          />
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
            {layer.color}
          </span>
        </div>
      </div>
    </div>
  );
};
