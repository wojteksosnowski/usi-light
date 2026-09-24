import React, { useCallback } from 'react';
import { Building, Square, ChevronDown, ChevronRight, Lock, Unlock, Ghost, Layers, Lightbulb, LightbulbOff, Magnet } from 'lucide-react';
import { useSceneObjectsList, BuildingSubgroup } from './hooks/useSceneObjectsList';
import { ObjectCategoryGroup } from './ObjectCategoryGroup';
import { ObjectScopeSubgroup } from './ObjectScopeSubgroup';
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

  const handleToggleLock = useCallback((id: string, currentLocked: boolean) => {
    updateBuilding(id, { isLocked: !currentLocked });
  }, [updateBuilding]);

  const handleToggleGhost = useCallback((id: string, currentGhosted: boolean) => {
    updateBuilding(id, { isGhosted: !currentGhosted });
  }, [updateBuilding]);

  const handleToggleVisibility = useCallback((id: string, currentVisible: boolean) => {
    updateBuilding(id, { isVisible: !currentVisible });
  }, [updateBuilding]);

  const handleToggleSnapExclusion = useCallback((id: string, currentSnapExcluded: boolean) => {
    updateBuilding(id, { isSnapExcluded: !currentSnapExcluded });
  }, [updateBuilding]);

  const handleMassLock = useCallback((items: BuildingLoop[]) => {
    const allLocked = items.every((b) => b.isLocked);
    items.forEach((b) => updateBuilding(b.id, { isLocked: !allLocked }));
  }, [updateBuilding]);

  const handleMassGhost = useCallback((items: BuildingLoop[]) => {
    const allGhosted = items.every((b) => b.isGhosted);
    items.forEach((b) => updateBuilding(b.id, { isGhosted: !allGhosted }));
  }, [updateBuilding]);

  const handleMassVisibility = useCallback((items: BuildingLoop[]) => {
    const allVisible = items.every((b) => b.isVisible !== false);
    items.forEach((b) => updateBuilding(b.id, { isVisible: !allVisible }));
  }, [updateBuilding]);

  const handleMassSnapExclusion = useCallback((items: BuildingLoop[]) => {
    const allSnapExcluded = items.every((b) => b.isSnapExcluded);
    items.forEach((b) => updateBuilding(b.id, { isSnapExcluded: !allSnapExcluded }));
  }, [updateBuilding]);

  const renderBuildingSubgroups = (subgroups: BuildingSubgroup[]) => {
    return subgroups.map((subgroup) => {
      const groupKey = `bldg_sub_${subgroup.key}`;
      const isSubCollapsed = isGroupCollapsed(groupKey);
      const allSubLocked = subgroup.items.every((b) => b.isLocked);
      const allSubGhosted = subgroup.items.every((b) => b.isGhosted);
      const allSubVisible = subgroup.items.every((b) => b.isVisible !== false);
      const allSubSnapExcluded = subgroup.items.every((b) => b.isSnapExcluded);
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
              padding: '3px 6px',
              borderRadius: '5px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {isSubCollapsed ? (
                <ChevronRight size={11} color="var(--text-secondary)" />
              ) : (
                <ChevronDown size={11} color="var(--text-secondary)" />
              )}
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>
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
                <CircleSelectionIcon status={subStatus} size={11} />
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
                {allSubLocked ? <Lock size={11} /> : <Unlock size={11} />}
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
                <Ghost size={11} />
              </button>
              <button
                type="button"
                title={allSubVisible ? 'Ukryj grupę' : 'Pokaż grupę'}
                onClick={() => handleMassVisibility(subgroup.items)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: allSubVisible ? 'var(--accent-amber)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                {allSubVisible ? <Lightbulb size={11} /> : <LightbulbOff size={11} />}
              </button>
              <button
                type="button"
                title={allSubSnapExcluded ? 'Włącz grupę do OSNAP' : 'Wyłącz grupę z OSNAP (magnes)'}
                onClick={() => handleMassSnapExclusion(subgroup.items)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: allSubSnapExcluded ? '#92400e' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <Magnet size={11} />
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
                  onToggleVisibility={handleToggleVisibility}
                  onToggleSnapExclusion={handleToggleSnapExclusion}
                />
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="ui-card">
      <div className="ui-title">
        <span>Obiekty ({buildings.length})</span>
        <Building size={14} color="var(--accent-indigo)" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* ── Grupa 1: Budynki ────────────────────────────────────────── */}
        {objectTree.buildings.all.length > 0 && (
          <ObjectCategoryGroup
            id="cat_buildings"
            title="Budynki"
            count={objectTree.buildings.all.length}
            icon={<Building size={13} color="var(--accent-indigo)" />}
            accentColor="var(--accent-indigo)"
            bgRgba="rgba(99, 102, 241, 0.12)"
            borderRgba="rgba(99, 102, 241, 0.3)"
            items={objectTree.buildings.all}
            isCollapsed={isGroupCollapsed('cat_buildings')}
            selectionStatus={getSelectionStatus(objectTree.buildings.all)}
            onToggleCollapse={toggleTreeGroup}
            onToggleSelection={toggleGroupSelection}
            onToggleMassLock={handleMassLock}
            onToggleMassGhost={handleMassGhost}
            onToggleMassVisibility={handleMassVisibility}
            onToggleMassSnapExclusion={handleMassSnapExclusion}
          >
            {/* 1.1 Budynki W projekcie */}
            {objectTree.buildings.inProject.length > 0 && (
              <ObjectScopeSubgroup
                id="bldg_scope_in"
                label="W projekcie"
                count={objectTree.buildings.inProject.length}
                scope="inProject"
                items={objectTree.buildings.inProject}
                isCollapsed={isGroupCollapsed('bldg_scope_in')}
                selectionStatus={getSelectionStatus(objectTree.buildings.inProject)}
                onToggleCollapse={toggleTreeGroup}
                onToggleSelection={toggleGroupSelection}
                onToggleMassLock={handleMassLock}
                onToggleMassGhost={handleMassGhost}
                onToggleMassVisibility={handleMassVisibility}
                onToggleMassSnapExclusion={handleMassSnapExclusion}
              >
                {renderBuildingSubgroups(objectTree.buildings.inProjectSubgroups)}
              </ObjectScopeSubgroup>
            )}

            {/* 1.2 Budynki Poza projektem */}
            {objectTree.buildings.outsideProject.length > 0 && (
              <ObjectScopeSubgroup
                id="bldg_scope_out"
                label="Poza projektem"
                count={objectTree.buildings.outsideProject.length}
                scope="outsideProject"
                items={objectTree.buildings.outsideProject}
                isCollapsed={isGroupCollapsed('bldg_scope_out')}
                selectionStatus={getSelectionStatus(objectTree.buildings.outsideProject)}
                onToggleCollapse={toggleTreeGroup}
                onToggleSelection={toggleGroupSelection}
                onToggleMassLock={handleMassLock}
                onToggleMassGhost={handleMassGhost}
                onToggleMassVisibility={handleMassVisibility}
                onToggleMassSnapExclusion={handleMassSnapExclusion}
              >
                {renderBuildingSubgroups(objectTree.buildings.outsideProjectSubgroups)}
              </ObjectScopeSubgroup>
            )}
          </ObjectCategoryGroup>
        )}

        {/* ── Grupa 2: Obszary (Działki, Place zabaw, Utwardzenia) ──────── */}
        {objectTree.areas.all.length > 0 && (
          <ObjectCategoryGroup
            id="cat_areas"
            title="Obszary"
            count={objectTree.areas.all.length}
            icon={<Square size={13} color="var(--accent-rose)" />}
            accentColor="var(--accent-rose)"
            bgRgba="rgba(244, 63, 94, 0.12)"
            borderRgba="rgba(244, 63, 94, 0.3)"
            items={objectTree.areas.all}
            isCollapsed={isGroupCollapsed('cat_areas')}
            selectionStatus={getSelectionStatus(objectTree.areas.all)}
            onToggleCollapse={toggleTreeGroup}
            onToggleSelection={toggleGroupSelection}
            onToggleMassLock={handleMassLock}
            onToggleMassGhost={handleMassGhost}
            onToggleMassVisibility={handleMassVisibility}
            onToggleMassSnapExclusion={handleMassSnapExclusion}
          >
            {/* 2.1 Działki */}
            {objectTree.plots.all.length > 0 && (
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
                      Działki ({objectTree.plots.all.length})
                    </span>
                  </div>

                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(() => {
                      const plotStatus = getSelectionStatus(objectTree.plots.all);
                      return (
                        <button
                          type="button"
                          title={plotStatus === 'all' ? 'Odznacz działki' : 'Zaznacz działki'}
                          onClick={() => toggleGroupSelection(objectTree.plots.all)}
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '6px' }}>
                    {/* Działki W projekcie */}
                    {objectTree.plots.inProject.length > 0 && (
                      <ObjectScopeSubgroup
                        id="plot_scope_in"
                        label="W projekcie"
                        count={objectTree.plots.inProject.length}
                        scope="inProject"
                        items={objectTree.plots.inProject}
                        isCollapsed={isGroupCollapsed('plot_scope_in')}
                        selectionStatus={getSelectionStatus(objectTree.plots.inProject)}
                        onToggleCollapse={toggleTreeGroup}
                        onToggleSelection={toggleGroupSelection}
                        onToggleMassLock={handleMassLock}
                        onToggleMassGhost={handleMassGhost}
                        onToggleMassVisibility={handleMassVisibility}
                        onToggleMassSnapExclusion={handleMassSnapExclusion}
                      >
                        {objectTree.plots.inProject.map((b) => (
                          <ObjectTreeItem
                            key={b.id}
                            item={b}
                            isSelected={selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id}
                            variant="plot"
                            onSelect={selectBuilding}
                            onToggleLock={handleToggleLock}
                            onToggleGhost={handleToggleGhost}
                            onToggleVisibility={handleToggleVisibility}
                            onToggleSnapExclusion={handleToggleSnapExclusion}
                          />
                        ))}
                      </ObjectScopeSubgroup>
                    )}

                    {/* Działki Poza projektem */}
                    {objectTree.plots.outsideProject.length > 0 && (
                      <ObjectScopeSubgroup
                        id="plot_scope_out"
                        label="Poza projektem"
                        count={objectTree.plots.outsideProject.length}
                        scope="outsideProject"
                        items={objectTree.plots.outsideProject}
                        isCollapsed={isGroupCollapsed('plot_scope_out')}
                        selectionStatus={getSelectionStatus(objectTree.plots.outsideProject)}
                        onToggleCollapse={toggleTreeGroup}
                        onToggleSelection={toggleGroupSelection}
                        onToggleMassLock={handleMassLock}
                        onToggleMassGhost={handleMassGhost}
                        onToggleMassVisibility={handleMassVisibility}
                        onToggleMassSnapExclusion={handleMassSnapExclusion}
                      >
                        {objectTree.plots.outsideProject.map((b) => (
                          <ObjectTreeItem
                            key={b.id}
                            item={b}
                            isSelected={selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id}
                            variant="plot"
                            onSelect={selectBuilding}
                            onToggleLock={handleToggleLock}
                            onToggleGhost={handleToggleGhost}
                            onToggleVisibility={handleToggleVisibility}
                            onToggleSnapExclusion={handleToggleSnapExclusion}
                          />
                        ))}
                      </ObjectScopeSubgroup>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 2.2 Place zabaw */}
            {objectTree.playgrounds.all.length > 0 && (
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
                      Place zabaw ({objectTree.playgrounds.all.length})
                    </span>
                  </div>

                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(() => {
                      const pgStatus = getSelectionStatus(objectTree.playgrounds.all);
                      return (
                        <button
                          type="button"
                          title={pgStatus === 'all' ? 'Odznacz place zabaw' : 'Zaznacz place zabaw'}
                          onClick={() => toggleGroupSelection(objectTree.playgrounds.all)}
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '6px' }}>
                    {/* Place zabaw W projekcie */}
                    {objectTree.playgrounds.inProject.length > 0 && (
                      <ObjectScopeSubgroup
                        id="pg_scope_in"
                        label="W projekcie"
                        count={objectTree.playgrounds.inProject.length}
                        scope="inProject"
                        items={objectTree.playgrounds.inProject}
                        isCollapsed={isGroupCollapsed('pg_scope_in')}
                        selectionStatus={getSelectionStatus(objectTree.playgrounds.inProject)}
                        onToggleCollapse={toggleTreeGroup}
                        onToggleSelection={toggleGroupSelection}
                        onToggleMassLock={handleMassLock}
                        onToggleMassGhost={handleMassGhost}
                        onToggleMassVisibility={handleMassVisibility}
                        onToggleMassSnapExclusion={handleMassSnapExclusion}
                      >
                        {objectTree.playgrounds.inProject.map((b) => (
                          <ObjectTreeItem
                            key={b.id}
                            item={b}
                            isSelected={selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id}
                            variant="playground"
                            onSelect={selectBuilding}
                            onToggleLock={handleToggleLock}
                            onToggleGhost={handleToggleGhost}
                            onToggleVisibility={handleToggleVisibility}
                            onToggleSnapExclusion={handleToggleSnapExclusion}
                          />
                        ))}
                      </ObjectScopeSubgroup>
                    )}

                    {/* Place zabaw Poza projektem */}
                    {objectTree.playgrounds.outsideProject.length > 0 && (
                      <ObjectScopeSubgroup
                        id="pg_scope_out"
                        label="Poza projektem"
                        count={objectTree.playgrounds.outsideProject.length}
                        scope="outsideProject"
                        items={objectTree.playgrounds.outsideProject}
                        isCollapsed={isGroupCollapsed('pg_scope_out')}
                        selectionStatus={getSelectionStatus(objectTree.playgrounds.outsideProject)}
                        onToggleCollapse={toggleTreeGroup}
                        onToggleSelection={toggleGroupSelection}
                        onToggleMassLock={handleMassLock}
                        onToggleMassGhost={handleMassGhost}
                        onToggleMassVisibility={handleMassVisibility}
                        onToggleMassSnapExclusion={handleMassSnapExclusion}
                      >
                        {objectTree.playgrounds.outsideProject.map((b) => (
                          <ObjectTreeItem
                            key={b.id}
                            item={b}
                            isSelected={selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id}
                            variant="playground"
                            onSelect={selectBuilding}
                            onToggleLock={handleToggleLock}
                            onToggleGhost={handleToggleGhost}
                            onToggleVisibility={handleToggleVisibility}
                            onToggleSnapExclusion={handleToggleSnapExclusion}
                          />
                        ))}
                      </ObjectScopeSubgroup>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 2.3 Utwardzenia */}
            {objectTree.paved.all.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div
                  onClick={() => toggleTreeGroup('area_sub_paved')}
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
                    {isGroupCollapsed('area_sub_paved') ? (
                      <ChevronRight size={12} color="var(--text-secondary)" />
                    ) : (
                      <ChevronDown size={12} color="var(--text-secondary)" />
                    )}
                    <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Utwardzenia ({objectTree.paved.all.length})
                    </span>
                  </div>

                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(() => {
                      const pavedStatus = getSelectionStatus(objectTree.paved.all);
                      return (
                        <button
                          type="button"
                          title={pavedStatus === 'all' ? 'Odznacz utwardzenia' : 'Zaznacz utwardzenia'}
                          onClick={() => toggleGroupSelection(objectTree.paved.all)}
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
                          <CircleSelectionIcon status={pavedStatus} size={12} />
                        </button>
                      );
                    })()}
                  </div>
                </div>

                {!isGroupCollapsed('area_sub_paved') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '6px' }}>
                    {/* Utwardzenia W projekcie */}
                    {objectTree.paved.inProject.length > 0 && (
                      <ObjectScopeSubgroup
                        id="paved_scope_in"
                        label="W projekcie"
                        count={objectTree.paved.inProject.length}
                        scope="inProject"
                        items={objectTree.paved.inProject}
                        isCollapsed={isGroupCollapsed('paved_scope_in')}
                        selectionStatus={getSelectionStatus(objectTree.paved.inProject)}
                        onToggleCollapse={toggleTreeGroup}
                        onToggleSelection={toggleGroupSelection}
                        onToggleMassLock={handleMassLock}
                        onToggleMassGhost={handleMassGhost}
                        onToggleMassVisibility={handleMassVisibility}
                        onToggleMassSnapExclusion={handleMassSnapExclusion}
                      >
                        {objectTree.paved.inProject.map((b) => (
                          <ObjectTreeItem
                            key={b.id}
                            item={b}
                            isSelected={selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id}
                            variant="plot"
                            onSelect={selectBuilding}
                            onToggleLock={handleToggleLock}
                            onToggleGhost={handleToggleGhost}
                            onToggleVisibility={handleToggleVisibility}
                            onToggleSnapExclusion={handleToggleSnapExclusion}
                          />
                        ))}
                      </ObjectScopeSubgroup>
                    )}

                    {/* Utwardzenia Poza projektem */}
                    {objectTree.paved.outsideProject.length > 0 && (
                      <ObjectScopeSubgroup
                        id="paved_scope_out"
                        label="Poza projektem"
                        count={objectTree.paved.outsideProject.length}
                        scope="outsideProject"
                        items={objectTree.paved.outsideProject}
                        isCollapsed={isGroupCollapsed('paved_scope_out')}
                        selectionStatus={getSelectionStatus(objectTree.paved.outsideProject)}
                        onToggleCollapse={toggleTreeGroup}
                        onToggleSelection={toggleGroupSelection}
                        onToggleMassLock={handleMassLock}
                        onToggleMassGhost={handleMassGhost}
                        onToggleMassVisibility={handleMassVisibility}
                        onToggleMassSnapExclusion={handleMassSnapExclusion}
                      >
                        {objectTree.paved.outsideProject.map((b) => (
                          <ObjectTreeItem
                            key={b.id}
                            item={b}
                            isSelected={selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id}
                            variant="plot"
                            onSelect={selectBuilding}
                            onToggleLock={handleToggleLock}
                            onToggleGhost={handleToggleGhost}
                            onToggleVisibility={handleToggleVisibility}
                            onToggleSnapExclusion={handleToggleSnapExclusion}
                          />
                        ))}
                      </ObjectScopeSubgroup>
                    )}
                  </div>
                )}
              </div>
            )}
          </ObjectCategoryGroup>
        )}

        {/* ── Grupa 3: Balkony ────────────────────────────────────────── */}
        {objectTree.balconies.all.length > 0 && (
          <ObjectCategoryGroup
            id="cat_balconies"
            title="Balkony"
            count={objectTree.balconies.all.length}
            icon={<Square size={13} color="var(--accent-cyan)" />}
            accentColor="var(--accent-cyan)"
            bgRgba="rgba(56, 189, 248, 0.12)"
            borderRgba="rgba(56, 189, 248, 0.3)"
            items={objectTree.balconies.all}
            isCollapsed={isGroupCollapsed('cat_balconies')}
            selectionStatus={getSelectionStatus(objectTree.balconies.all)}
            onToggleCollapse={toggleTreeGroup}
            onToggleSelection={toggleGroupSelection}
            onToggleMassLock={handleMassLock}
            onToggleMassGhost={handleMassGhost}
            onToggleMassVisibility={handleMassVisibility}
            onToggleMassSnapExclusion={handleMassSnapExclusion}
          >
            {/* Balkony W projekcie */}
            {objectTree.balconies.inProject.length > 0 && (
              <ObjectScopeSubgroup
                id="balc_scope_in"
                label="W projekcie"
                count={objectTree.balconies.inProject.length}
                scope="inProject"
                items={objectTree.balconies.inProject}
                isCollapsed={isGroupCollapsed('balc_scope_in')}
                selectionStatus={getSelectionStatus(objectTree.balconies.inProject)}
                onToggleCollapse={toggleTreeGroup}
                onToggleSelection={toggleGroupSelection}
                onToggleMassLock={handleMassLock}
                onToggleMassGhost={handleMassGhost}
                onToggleMassVisibility={handleMassVisibility}
                onToggleMassSnapExclusion={handleMassSnapExclusion}
              >
                {objectTree.balconies.inProject.map((b) => (
                  <ObjectTreeItem
                    key={b.id}
                    item={b}
                    isSelected={selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id}
                    variant="balcony"
                    onSelect={selectBuilding}
                    onToggleLock={handleToggleLock}
                    onToggleGhost={handleToggleGhost}
                    onToggleVisibility={handleToggleVisibility}
                    onToggleSnapExclusion={handleToggleSnapExclusion}
                  />
                ))}
              </ObjectScopeSubgroup>
            )}

            {/* Balkony Poza projektem */}
            {objectTree.balconies.outsideProject.length > 0 && (
              <ObjectScopeSubgroup
                id="balc_scope_out"
                label="Poza projektem"
                count={objectTree.balconies.outsideProject.length}
                scope="outsideProject"
                items={objectTree.balconies.outsideProject}
                isCollapsed={isGroupCollapsed('balc_scope_out')}
                selectionStatus={getSelectionStatus(objectTree.balconies.outsideProject)}
                onToggleCollapse={toggleTreeGroup}
                onToggleSelection={toggleGroupSelection}
                onToggleMassLock={handleMassLock}
                onToggleMassGhost={handleMassGhost}
                onToggleMassVisibility={handleMassVisibility}
                onToggleMassSnapExclusion={handleMassSnapExclusion}
              >
                {objectTree.balconies.outsideProject.map((b) => (
                  <ObjectTreeItem
                    key={b.id}
                    item={b}
                    isSelected={selectedBuildingIds.includes(b.id) || selectedBuildingId === b.id}
                    variant="balcony"
                    onSelect={selectBuilding}
                    onToggleLock={handleToggleLock}
                    onToggleGhost={handleToggleGhost}
                    onToggleVisibility={handleToggleVisibility}
                    onToggleSnapExclusion={handleToggleSnapExclusion}
                  />
                ))}
              </ObjectScopeSubgroup>
            )}
          </ObjectCategoryGroup>
        )}
      </div>
    </div>
  );
};
