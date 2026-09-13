import { useMemo, useCallback } from 'react';
import { useSceneStore, useSolarAnalysisStore } from '@/store';
import { computePolygonArea } from '@/utils/math2d';
import { analyzePlaygroundSunlight } from '@/engine/analysisEngine';
import { BuildingLoop } from '@/types/geometry';

export const useObjectEditor = () => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const selectedBuildingIds = useSceneStore((s) => s.selectedBuildingIds);
  const updateSelectedBuilding = useSceneStore((s) => s.updateSelectedBuilding);
  const updateBuilding = useSceneStore((s) => s.updateBuilding);
  const rotateBuilding = useSceneStore((s) => s.rotateBuilding);
  const layerSettings = useSceneStore((s) => s.layerSettings);

  const settings = useSolarAnalysisStore((s) => s.settings);
  const sunlightMethod = useSolarAnalysisStore((s) => s.sunlightMethod);

  // Active building object
  const selectedBuilding = useMemo(() => {
    if (!selectedBuildingId) return null;
    const b = buildings.find((item) => item.id === selectedBuildingId);
    if (!b) return null;
    const lyr = b.layer || 'Domyślna (0)';
    if (layerSettings[lyr]?.isVisible === false) return null;
    return b;
  }, [buildings, selectedBuildingId, layerSettings]);

  // Selected building area
  const selectedBuildingArea = useMemo(() => {
    if (!selectedBuilding || !selectedBuilding.vertices || selectedBuilding.vertices.length < 3) return 0;
    return computePolygonArea(selectedBuilding.vertices);
  }, [selectedBuilding]);

  // Playground sunlight analysis (§ 33 ust. 3 WT)
  const playgroundAnalysis = useMemo(() => {
    if (
      !selectedBuilding ||
      selectedBuilding.category !== 'boundary' ||
      selectedBuilding.areaType !== 'playground' ||
      !selectedBuilding.isTested ||
      !selectedBuilding.vertices ||
      selectedBuilding.vertices.length < 3
    ) {
      return null;
    }
    return analyzePlaygroundSunlight(selectedBuilding, buildings, settings, sunlightMethod);
  }, [selectedBuilding, buildings, settings, sunlightMethod]);

  // Absolute rotation
  const handleSetBuildingAbsoluteRotation = useCallback(
    (buildingId: string, targetDeg: number) => {
      const targetIds = selectedBuildingIds.length > 0 ? selectedBuildingIds : [buildingId];
      targetIds.forEach((id) => {
        const target = buildings.find((b) => b.id === id);
        if (!target || target.vertices.length < 3) return;

        const currentRot = target.transform?.rotationDeg !== undefined
          ? target.transform.rotationDeg
          : target.segments.length > 0
          ? ((target.segments[0].angleRad * 180) / Math.PI + 360) % 360
          : 0;

        let deltaDeg = targetDeg - currentRot;
        while (deltaDeg > 180) deltaDeg -= 360;
        while (deltaDeg < -180) deltaDeg += 360;

        const deltaRad = (deltaDeg * Math.PI) / 180;
        let cx = 0;
        let cy = 0;
        for (const v of target.vertices) {
          cx += v.x;
          cy += v.y;
        }
        const pivot = { x: cx / target.vertices.length, y: cy / target.vertices.length };
        rotateBuilding(id, pivot, deltaRad);
      });
    },
    [buildings, selectedBuildingIds, rotateBuilding]
  );

  return {
    buildings,
    selectedBuilding,
    selectedBuildingId,
    selectedBuildingIds,
    selectedBuildingArea,
    playgroundAnalysis,
    sunlightMethod,
    updateSelectedBuilding,
    updateBuilding,
    handleSetBuildingAbsoluteRotation,
  };
};
