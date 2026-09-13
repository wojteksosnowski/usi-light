import React from 'react';
import { Layers } from 'lucide-react';
import { useCadLayers } from './hooks/useCadLayers';
import { CadLayerRow } from './CadLayerRow';
import { CadLayerProperties } from './CadLayerProperties';

export const CadLayersSection: React.FC = () => {
  const {
    buildings,
    activeCadLayers,
    layerSettings,
    selectedLayerName,
    setSelectedLayerName,
    toggleLayerLock,
    toggleLayerGhost,
    toggleLayerVisibility,
    updateLayerBuildings,
    getSelectionStatus,
    toggleGroupSelection,
  } = useCadLayers();

  const selectedLayerBuildings = selectedLayerName
    ? buildings.filter((b) => (b.layer || 'Domyślna (0)') === selectedLayerName)
    : [];

  return (
    <div className="ui-card">
      <div className="ui-title">
        <span>Warstwy CAD ({activeCadLayers.length})</span>
        <Layers size={14} color="var(--accent-indigo)" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {activeCadLayers.map((lyr) => {
            const isSelected = selectedLayerName === lyr.name;
            const setting = layerSettings[lyr.name];
            const layerBuildings = buildings.filter(
              (b) => (b.layer || 'Domyślna (0)') === lyr.name
            );
            const selectionStatus = getSelectionStatus(layerBuildings);

            return (
              <CadLayerRow
                key={lyr.name}
                name={lyr.name}
                count={lyr.count}
                isSelected={isSelected}
                setting={setting}
                layerBuildings={layerBuildings}
                selectionStatus={selectionStatus}
                onSelectLayer={setSelectedLayerName}
                onToggleSelection={toggleGroupSelection}
                onToggleLock={toggleLayerLock}
                onToggleGhost={toggleLayerGhost}
                onToggleVisibility={toggleLayerVisibility}
              />
            );
          })}
        </div>

        {selectedLayerName && (
          <CadLayerProperties
            selectedLayerName={selectedLayerName}
            layerBuildings={selectedLayerBuildings}
            onUpdateLayerBuildings={updateLayerBuildings}
          />
        )}
      </div>
    </div>
  );
};
