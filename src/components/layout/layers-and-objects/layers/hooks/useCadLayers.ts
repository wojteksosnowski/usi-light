import { useMemo } from 'react';
import { useSceneStore } from '@/store';
import { computePolygonArea } from '@/utils/math2d/polygons';
import { useMultiSelection } from '../../common/useMultiSelection';

export interface CadLayerItemInfo {
  name: string;
  count: number;
  area: number;
}

export const useCadLayers = () => {
  const buildings = useSceneStore((s) => s.buildings);
  const layerSettings = useSceneStore((s) => s.layerSettings);
  const selectedLayerName = useSceneStore((s) => s.selectedLayerName);
  const setSelectedLayerName = useSceneStore((s) => s.setSelectedLayerName);
  const toggleLayerLock = useSceneStore((s) => s.toggleLayerLock);
  const toggleLayerGhost = useSceneStore((s) => s.toggleLayerGhost);
  const toggleLayerVisibility = useSceneStore((s) => s.toggleLayerVisibility);
  const toggleLayerSnapExclusion = useSceneStore((s) => s.toggleLayerSnapExclusion);
  const updateLayerBuildings = useSceneStore((s) => s.updateLayerBuildings);

  const activeCadLayers = useMemo<CadLayerItemInfo[]>(() => {
    const map = new Map<string, typeof buildings>();
    buildings.forEach((b) => {
      const lyr = b.layer || 'Domyślna (0)';
      const list = map.get(lyr) || [];
      list.push(b);
      map.set(lyr, list);
    });
    return Array.from(map.entries()).map(([name, bldgs]) => ({
      name,
      count: bldgs.length,
      area: bldgs.reduce(
        (sum, b) => sum + (b.computed?.metrics?.footprintArea ?? (b.vertices ? computePolygonArea(b.vertices) : 0)),
        0
      ),
    }));
  }, [buildings]);

  const { getSelectionStatus, toggleGroupSelection } = useMultiSelection();

  return {
    buildings,
    activeCadLayers,
    layerSettings,
    selectedLayerName,
    setSelectedLayerName,
    toggleLayerLock,
    toggleLayerGhost,
    toggleLayerVisibility,
    toggleLayerSnapExclusion,
    updateLayerBuildings,
    getSelectionStatus,
    toggleGroupSelection,
  };
};
