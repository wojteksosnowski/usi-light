import { useState, useMemo, useCallback } from 'react';
import { useSceneStore } from '@/store';
import { BuildingLoop } from '@/types/geometry';
import { useMultiSelection } from '../../common/useMultiSelection';

export interface BuildingSubgroup {
  key: string;
  height: number;
  elevation: number;
  label: string;
  items: BuildingLoop[];
}

export interface ObjectTreeStructure {
  buildingList: BuildingLoop[];
  buildingSubgroups: BuildingSubgroup[];
  areaList: BuildingLoop[];
  plotList: BuildingLoop[];
  playgroundList: BuildingLoop[];
  balconyList: BuildingLoop[];
}

export const useSceneObjectsList = () => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const selectedBuildingIds = useSceneStore((s) => s.selectedBuildingIds);
  const selectBuilding = useSceneStore((s) => s.selectBuilding);
  const updateBuilding = useSceneStore((s) => s.updateBuilding);

  const [collapsedTreeGroups, setCollapsedTreeGroups] = useState<Record<string, boolean>>({});

  // 1st level (cat_*) defaults to expanded (false), 2nd level (subgroups) defaults to collapsed (true)
  const isGroupCollapsed = useCallback(
    (groupKey: string) => {
      if (collapsedTreeGroups[groupKey] !== undefined) {
        return collapsedTreeGroups[groupKey];
      }
      return !groupKey.startsWith('cat_');
    },
    [collapsedTreeGroups]
  );

  const toggleTreeGroup = useCallback(
    (groupKey: string) => {
      const current = isGroupCollapsed(groupKey);
      setCollapsedTreeGroups((prev) => ({
        ...prev,
        [groupKey]: !current,
      }));
    },
    [isGroupCollapsed]
  );

  const { getSelectionStatus, toggleGroupSelection } = useMultiSelection();

  const objectTree = useMemo<ObjectTreeStructure>(() => {
    const buildingList = buildings.filter((b) => b.category !== 'boundary' && b.category !== 'balcony');
    const areaList = buildings.filter((b) => b.category === 'boundary');
    const balconyList = buildings.filter((b) => b.category === 'balcony');

    const buildingSubgroupsMap = new Map<string, { height: number; elevation: number; items: BuildingLoop[] }>();
    buildingList.forEach((b) => {
      const h = b.defaultHeight || 15.0;
      const elev = b.elevation ?? 0.0;
      const key = `H_${h}_E_${elev}`;
      const existing = buildingSubgroupsMap.get(key) || { height: h, elevation: elev, items: [] };
      existing.items.push(b);
      buildingSubgroupsMap.set(key, existing);
    });

    const buildingSubgroups = Array.from(buildingSubgroupsMap.entries()).map(([key, group]) => ({
      key,
      height: group.height,
      elevation: group.elevation,
      label: `H = ${group.height}m, posad. ${group.elevation}m`,
      items: group.items,
    }));

    const plotList = areaList.filter((b) => !b.areaType || b.areaType === 'plot');
    const playgroundList = areaList.filter((b) => b.areaType === 'playground');
    const pavedList = areaList.filter((b) => b.areaType === 'paved');

    return {
      buildingList,
      buildingSubgroups,
      areaList,
      plotList,
      playgroundList,
      pavedList,
      balconyList,
    };
  }, [buildings]);

  return {
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
  };
};
