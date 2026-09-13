import React from 'react';
import { Building, Square, ChevronDown, ChevronRight, Lock, Unlock, Ghost } from 'lucide-react';
import { useSceneObjectsList } from './hooks/useSceneObjectsList';
import { ObjectCategoryGroup } from './ObjectCategoryGroup';
import { ObjectTreeItem } from './ObjectTreeItem';
import { CircleSelectionIcon } from '../common/CircleSelectionIcon';
import { BuildingLoop } from '@/types/geometry';

export const SceneObjectsSection: React.FC = () => {
  const {
    buildings,
    selectedBuildingId,
    selectedBuildingIds,
    objectTree,
    isGroupCollapsed,
    toggleTreeGroup,
    getSelectionStatus,
    toggleGroupSelection,
    selectBuilding,
    updateBuilding,
  } = useSceneObjectsList();

  const handleToggleLock = (id: string, currentLocked: boolean) => {
    updateBuilding(id, { isLocked: !currentLocked });
  };

  const handleToggleGhost = (id: string, currentGhosted: boolean) => {
    updateBuilding(id, { isGhosted: !currentGhosted });
  };

  const handleMassLock = (items: BuildingLoop[]) => {
    const allLocked = items.every((b) => b.isLocked);
    items.forEach((b) => updateBuilding(b.id, { isLocked: !allLocked }));
  };

  const handleMassGhost = (items: BuildingLoop[]) => {
    const allGhosted = items.every((b) => b.isGhosted);
    items.forEach((b) => updateBuilding(b.id, { isGhosted: !allGhosted }));
  };

  return (
    <div className="ui-card">
      <div className="ui-title">
        <span>Obiekty ({buildings.length})</span>
        <Building size={14} color="var(--accent-indigo)" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Grupa 1: Budynki */}
        {objectTree.buildingList.length > 0 && (
          <ObjectCategoryGroup
            id="cat_buildings"
            title="Budynki"
            count={objectTree.buildingList.length}
            icon={<Building size={13} color="var(--accent-indigo)" />}
            accentColor="var(--accent-indigo)"
            bgRgba="rgba(99, 102, 241, 0.12)"
            borderRgba="rgba(99, 102, 241, 0.3)"
            items={objectTree.buildingList}
            isCollapsed={isGroupCollapsed('cat_buildings')}
            selectionStatus={getSelectionStatus(objectTree.buildingList)}
            onToggleCollapse={toggleTreeGroup}
            onToggleSelection={toggleGroupSelection}
            onToggleMassLock={handleMassLock}
            onToggleMassGhost={handleMassGhost}
          >
            {objectTree.buildingSubgroups.map((subgroup) => {
              const groupKey = `bldg_sub_${subgroup.key}`;
              const isSubCollapsed = isGroupCollapsed(groupKey);
              const allSubLocked = subgroup.items.every((b) => b.isLocked);
              const allSubGhosted = subgroup.items.every((b) => b.isGhosted);
              const subStatus = getSelectionStatus(subgroup.items);

              return (
                <div key={subgroup.key} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {/* Subgroup Header */}
                  <div
                    onClick={() => toggleTreeGroup(groupKey)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 6px',
                      borderRadius: '5px',
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {isSubCollapsed ? (
                        <ChevronRight size={12} color="var(--text-secondary)" />
                      ) : (
                        <ChevronDown size={12} color="var(--text-secondary)" />
                      )}
                      <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {subgroup.label} ({subgroup.items.length})
                      </span>
                    </div>

                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title={subStatus === 'all' ? 'Odznacz obiekty w tej grupie' : 'Zaznacz obiekty w tej grupie'}
                        onClick={() => toggleGroupSelection(subgroup.items)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CircleSelectionIcon status={subStatus} size={12} />
                      </button>
                      <button
                        type="button"
                        title={allSubLocked ? 'Odblokuj grupę' : 'Zablokuj grupę'}
                        onClick={() => handleMassLock(subgroup.items)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: allSubLocked ? 'var(--accent-lock)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '2px',
                        }}
                      >
                        {allSubLocked ? <Lock size={12} /> : <Unlock size={12} />}
                      </button>
                      <button
                        type="button"
                        title={allSubGhosted ? 'Wyłącz ducha' : 'Włącz ducha'}
                        onClick={() => handleMassGhost(subgroup.items)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: allSubGhosted ? 'var(--accent-purple)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '2px',
                        }}
                      >
                        <Ghost size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Subgroup Items */}
                  {!isSubCollapsed && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
                      {subgroup.items.map((b) => (
                        <ObjectTreeItem
                          key={b.id}
                          item={b}
                          isSelected={selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id}
                          variant="building"
                          onSelect={selectBuilding}
                          onToggleLock={handleToggleLock}
                          onToggleGhost={handleToggleGhost}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </ObjectCategoryGroup>
        )}

        {/* Grupa 2: Obszary */}
        {objectTree.areaList.length > 0 && (
          <ObjectCategoryGroup
            id="cat_areas"
            title="Obszary"
            count={objectTree.areaList.length}
            icon={<Square size={13} color="var(--accent-rose)" />}
            accentColor="var(--accent-rose)"
            bgRgba="rgba(244, 63, 94, 0.12)"
            borderRgba="rgba(244, 63, 94, 0.3)"
            items={objectTree.areaList}
            isCollapsed={isGroupCollapsed('cat_areas')}
            selectionStatus={getSelectionStatus(objectTree.areaList)}
            onToggleCollapse={toggleTreeGroup}
            onToggleSelection={toggleGroupSelection}
            onToggleMassLock={handleMassLock}
            onToggleMassGhost={handleMassGhost}
          >
            {/* Działki */}
            {objectTree.plotList.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div
                  onClick={() => toggleTreeGroup('area_sub_plots')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '3px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-input)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {isGroupCollapsed('area_sub_plots') ? (
                      <ChevronRight size={12} color="var(--accent-rose)" />
                    ) : (
                      <ChevronDown size={12} color="var(--accent-rose)" />
                    )}
                    <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--accent-rose)' }}>
                      Działki ({objectTree.plotList.length})
                    </span>
                  </div>

                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(() => {
                      const plotStatus = getSelectionStatus(objectTree.plotList);
                      return (
                        <button
                          type="button"
                          title={plotStatus === 'all' ? 'Odznacz działki' : 'Zaznacz działki'}
                          onClick={() => toggleGroupSelection(objectTree.plotList)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <CircleSelectionIcon status={plotStatus} size={12} />
                        </button>
                      );
                    })()}
                  </div>
                </div>

                {!isGroupCollapsed('area_sub_plots') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
                    {objectTree.plotList.map((b) => (
                      <ObjectTreeItem
                        key={b.id}
                        item={b}
                        isSelected={selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id}
                        variant="plot"
                        onSelect={selectBuilding}
                        onToggleLock={handleToggleLock}
                        onToggleGhost={handleToggleGhost}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Place zabaw */}
            {objectTree.playgroundList.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div
                  onClick={() => toggleTreeGroup('area_sub_playgrounds')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '3px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-input)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {isGroupCollapsed('area_sub_playgrounds') ? (
                      <ChevronRight size={12} color="var(--accent-emerald)" />
                    ) : (
                      <ChevronDown size={12} color="var(--accent-emerald)" />
                    )}
                    <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--accent-emerald)' }}>
                      Place zabaw ({objectTree.playgroundList.length})
                    </span>
                  </div>

                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(() => {
                      const pgStatus = getSelectionStatus(objectTree.playgroundList);
                      return (
                        <button
                          type="button"
                          title={pgStatus === 'all' ? 'Odznacz place zabaw' : 'Zaznacz place zabaw'}
                          onClick={() => toggleGroupSelection(objectTree.playgroundList)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <CircleSelectionIcon status={pgStatus} size={12} />
                        </button>
                      );
                    })()}
                  </div>
                </div>

                {!isGroupCollapsed('area_sub_playgrounds') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' }}>
                    {objectTree.playgroundList.map((b) => (
                      <ObjectTreeItem
                        key={b.id}
                        item={b}
                        isSelected={selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id}
                        variant="playground"
                        onSelect={selectBuilding}
                        onToggleLock={handleToggleLock}
                        onToggleGhost={handleToggleGhost}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </ObjectCategoryGroup>
        )}

        {/* Grupa 3: Balkony */}
        {objectTree.balconyList.length > 0 && (
          <ObjectCategoryGroup
            id="cat_balconies"
            title="Balkony"
            count={objectTree.balconyList.length}
            icon={<Square size={13} color="var(--accent-cyan)" />}
            accentColor="var(--accent-cyan)"
            bgRgba="rgba(56, 189, 248, 0.12)"
            borderRgba="rgba(56, 189, 248, 0.3)"
            items={objectTree.balconyList}
            isCollapsed={isGroupCollapsed('cat_balconies')}
            selectionStatus={getSelectionStatus(objectTree.balconyList)}
            onToggleCollapse={toggleTreeGroup}
            onToggleSelection={toggleGroupSelection}
            onToggleMassLock={handleMassLock}
            onToggleMassGhost={handleMassGhost}
          >
            {objectTree.balconyList.map((b) => (
              <ObjectTreeItem
                key={b.id}
                item={b}
                isSelected={selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id}
                variant="balcony"
                onSelect={selectBuilding}
                onToggleLock={handleToggleLock}
                onToggleGhost={handleToggleGhost}
              />
            ))}
          </ObjectCategoryGroup>
        )}
      </div>
    </div>
  );
};
