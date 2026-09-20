import { useState, useMemo, useCallback } from 'react';
import { useSceneStore } from '@/store';
import { BuildingLoop } from '@/types/geometry';
import { filterActiveVariantBuildings } from '@/utils/geometrySelectors';
import { useMultiSelection } from '../../common/useMultiSelection';

export interface BuildingSubgroup {
  key: string;
  height: number;
  elevation: number;
  label: string;
  items: BuildingLoop[];
}

export interface ScopeGroup<T = BuildingLoop> {
  all: T[];
  inProject: T[];
  outsideProject: T[];
}

export interface BuildingScopeGroup extends ScopeGroup<BuildingLoop> {
  inProjectSubgroups: BuildingSubgroup[];
  outsideProjectSubgroups: BuildingSubgroup[];
}

export interface ObjectTreeStructure {
  buildings: BuildingScopeGroup;
  plots: ScopeGroup;
  playgrounds: ScopeGroup;
  paved: ScopeGroup;
  balconies: ScopeGroup;
  areas: ScopeGroup;

  // Wsteczna kompatybilność
  buildingList: BuildingLoop[];
  buildingSubgroups: BuildingSubgroup[];
  areaList: BuildingLoop[];
  plotList: BuildingLoop[];
  playgroundList: BuildingLoop[];
  pavedList: BuildingLoop[];
  balconyList: BuildingLoop[];
}

function groupBuildingsByHeight(items: BuildingLoop[], prefix: string): BuildingSubgroup[] {
  const map = new Map<string, { height: number; elevation: number; items: BuildingLoop[] }>();
  items.forEach((b) => {
    const h = b.defaultHeight || 15.0;
    const elev = b.elevation ?? 0.0;
    const key = `${prefix}_H_${h}_E_${elev}`;
    const existing = map.get(key) || { height: h, elevation: elev, items: [] };
    existing.items.push(b);
    map.set(key, existing);
  });

  return Array.from(map.entries()).map(([key, group]) => ({
    key,
    height: group.height,
    elevation: group.elevation,
    label: `H = ${group.height}m, posad. ${group.elevation}m`,
    items: group.items,
  }));
}

export function computeObjectTree(buildings: BuildingLoop[]): ObjectTreeStructure {
  const activeBuildings = filterActiveVariantBuildings(buildings);

  const buildingList = activeBuildings.filter((b) => b.category !== 'boundary' && b.category !== 'balcony');
  const areaList = activeBuildings.filter((b) => b.category === 'boundary');
  const balconyList = activeBuildings.filter((b) => b.category === 'balcony');

  const buildingsInProject = buildingList.filter((b) => b.isTested === true);
  const buildingsOutside = buildingList.filter((b) => b.isTested !== true);

  const plotList = areaList.filter((b) => !b.areaType || b.areaType === 'plot');
  const playgroundList = areaList.filter((b) => b.areaType === 'playground');
  const pavedList = areaList.filter((b) => b.areaType === 'paved');

  const buildingSubgroups = groupBuildingsByHeight(buildingList, 'all');
  const inProjectSubgroups = groupBuildingsByHeight(buildingsInProject, 'in');
  const outsideProjectSubgroups = groupBuildingsByHeight(buildingsOutside, 'out');

  return {
    buildings: {
      all: buildingList,
      inProject: buildingsInProject,
      outsideProject: buildingsOutside,
      inProjectSubgroups,
      outsideProjectSubgroups,
    },
    plots: {
      all: plotList,
      inProject: plotList.filter((b) => b.isTested === true),
      outsideProject: plotList.filter((b) => b.isTested !== true),
    },
    playgrounds: {
      all: playgroundList,
      inProject: playgroundList.filter((b) => b.isTested === true),
      outsideProject: playgroundList.filter((b) => b.isTested !== true),
    },
    paved: {
      all: pavedList,
      inProject: pavedList.filter((b) => b.isTested === true),
      outsideProject: pavedList.filter((b) => b.isTested !== true),
    },
    balconies: {
      all: balconyList,
      inProject: balconyList.filter((b) => b.isTested === true),
      outsideProject: balconyList.filter((b) => b.isTested !== true),
    },
    areas: {
      all: areaList,
      inProject: areaList.filter((b) => b.isTested === true),
      outsideProject: areaList.filter((b) => b.isTested !== true),
    },

    // Legacy fallback
    buildingList,
    buildingSubgroups,
    areaList,
    plotList,
    playgroundList,
    pavedList,
    balconyList,
  };
}

export const useSceneObjectsList = () => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const selectedBuildingIds = useSceneStore((s) => s.selectedBuildingIds);
  const selectBuilding = useSceneStore((s) => s.selectBuilding);
  const updateBuilding = useSceneStore((s) => s.updateBuilding);

  const [collapsedTreeGroups, setCollapsedTreeGroups] = useState<Record<string, boolean>>({});

  // 1st level (cat_*) defaults to expanded (false), 2nd level (subgroups / scopes) defaults to collapsed (true)
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
    return computeObjectTree(buildings);
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
