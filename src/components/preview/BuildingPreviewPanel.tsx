import React from 'react';
import type { BuildingLoop } from '@/types/geometry';
import { useSceneStore, useUiStore } from '../../store';
import { useCadToolStore } from '../../store/useCadToolStore';
import { useLocalizedBuilding } from '@/hooks/useLocalizedBuilding';
import { getActiveHighlightEdgeIndex } from '@/types/modifiers';
import { findSelectedBuilding } from '@/utils/geometrySelectors';
import { generateSweepPolygon } from '@/utils/math2d/sweep';
import { applyBuildingModifiers } from '@/engine/modifiers/modifierPipeline';
import { BuildingIsoPreview } from './BuildingIsoPreview';

export const BuildingPreviewPanel: React.FC = React.memo(() => {
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const expandedModifierId = useUiStore((s) => s.expandedModifierId);
  const liveVertexPreview = useCadToolStore((s) => s.liveVertexPreview);

  const selectedBuilding = React.useMemo(
    () => findSelectedBuilding(buildings, selectedBuildingId),
    [buildings, selectedBuildingId]
  );

  // Vertex/edge dragging doesn't commit to useSceneStore until mouseup (avoids rebuilding
  // facade segments/R-tree/analysis on every mousemove) - so during a drag, patch in the live
  // in-progress vertex position from the cheap `liveVertexPreview` channel and recompute
  // storyPolygons for the preview, so the 3D preview reflects it on the fly.
  const patchedSelectedBuilding = React.useMemo(() => {
    if (
      !selectedBuilding ||
      !liveVertexPreview ||
      liveVertexPreview.buildingId !== selectedBuilding.id
    ) {
      return selectedBuilding;
    }
    const isSweep = Array.isArray(selectedBuilding.sweepPath) && selectedBuilding.sweepPath.length >= 2;
    let candidate: BuildingLoop;
    if (isSweep) {
      const sweepPath = selectedBuilding.sweepPath!.map((v, idx) =>
        idx === liveVertexPreview.vertexIndex ? liveVertexPreview.point : v
      );
      const sweepPoly = generateSweepPolygon(
        sweepPath,
        selectedBuilding.sweepWidth || 12,
        selectedBuilding.sweepAlignment || 'center'
      );
      candidate = { ...selectedBuilding, sweepPath, vertices: sweepPoly };
    } else {
      const vertices = selectedBuilding.vertices.map((v, idx) =>
        idx === liveVertexPreview.vertexIndex ? liveVertexPreview.point : v
      );
      candidate = { ...selectedBuilding, vertices };
    }

    const modRes = applyBuildingModifiers(candidate);
    return {
      ...candidate,
      storyPolygons: modRes.storyPolygons && modRes.storyPolygons.length > 0 ? modRes.storyPolygons : undefined,
      zonePolygons: modRes.zonePolygons && modRes.zonePolygons.length > 0 ? modRes.zonePolygons : undefined,
      segments: modRes.segments,
    };
  }, [selectedBuilding, liveVertexPreview]);

  // Lokalny układ współrzędnych obiektu (patrz useLocalizedBuilding.ts) - anchor pochodzi
  // WYŁĄCZNIE z `selectedBuilding` (ostatnio zatwierdzony w store stan), NIGDY z
  // `patchedSelectedBuilding` (może zawierać niezatwierdzoną, "na żywo" edytowaną pozycję
  // wierzchołka) - dzięki temu pozycja obiektu w scenie jest całkowicie niezależna od tego, co
  // dzieje się z pojedynczym wierzchołkiem podczas edycji.
  const { localizedBuilding, localizedGroupBuildings } = useLocalizedBuilding(
    selectedBuilding,
    patchedSelectedBuilding,
    buildings
  );

  // Grace state: if a building id is selected but momentarily doesn't resolve (a store-update
  // race between `selectedBuildingId` and `buildings`), keep showing the last-known building for
  // that tick instead of unmounting the WebGL canvas, which is expensive to recreate. This only
  // applies while something is actually selected — an intentional deselection still renders null.
  const lastKnownBuildingRef = React.useRef<BuildingLoop | null>(null);
  React.useEffect(() => {
    if (localizedBuilding) {
      lastKnownBuildingRef.current = localizedBuilding;
    }
  }, [localizedBuilding]);
  const effectiveBuilding = localizedBuilding ?? (selectedBuildingId ? lastKnownBuildingRef.current : null);

  const activeHighlight = getActiveHighlightEdgeIndex(
    effectiveBuilding?.modifiers,
    expandedModifierId
  );

  if (!effectiveBuilding) {
    return null;
  }

  return (
    <div className="building-preview-card">
      <BuildingIsoPreview
        building={effectiveBuilding}
        groupBuildings={localizedGroupBuildings}
        highlightEdgeIndex={activeHighlight}
      />
    </div>
  );
});
