import React from 'react';
import type { BuildingLoop } from '@/types/geometry';
import { useSceneStore, useUiStore } from '../../store';
import { useCadToolStore } from '../../store/useCadToolStore';
import { translateBuildingGeometry } from '@/store/useSceneStore';
import { getPolygonCentroid } from '@/utils/math2d/polygons';
import { getActiveHighlightEdgeIndex } from '@/types/modifiers';
import { getCompoundGroupBuildings } from '@/utils/compoundObjectPipeline';
import { findSelectedBuilding } from '@/utils/geometrySelectors';
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

  // Punkt odniesienia (anchor) dla lokalnego układu współrzędnych podglądu 3D - liczony
  // WYŁĄCZNIE z ostatnio zatwierdzonego w store stanu (`selectedBuilding`), NIGDY z danych
  // "na żywo" edytowanych w trakcie przeciągania (`patchedSelectedBuilding` poniżej). Dzięki
  // temu pozycja obiektu w scenie jest całkowicie niezależna od tego, co dzieje się z pojedynczym
  // wierzchołkiem podczas edycji - anchor nie drgnie, dopóki edycja nie zostanie zatwierdzona.
  const anchor = React.useMemo(
    () => (selectedBuilding ? getPolygonCentroid(selectedBuilding.vertices) : null),
    [selectedBuilding]
  );

  // Vertex/edge dragging doesn't commit to useSceneStore until mouseup (avoids rebuilding
  // facade segments/R-tree/analysis on every mousemove) - so during a drag, patch in the live
  // in-progress vertex position from the cheap `liveVertexPreview` channel instead, so the 3D
  // preview can reflect it too.
  const patchedSelectedBuilding = React.useMemo(() => {
    if (
      !selectedBuilding ||
      !liveVertexPreview ||
      liveVertexPreview.buildingId !== selectedBuilding.id
    ) {
      return selectedBuilding;
    }
    const vertices = selectedBuilding.vertices.map((v, idx) =>
      idx === liveVertexPreview.vertexIndex ? liveVertexPreview.point : v
    );
    return { ...selectedBuilding, vertices };
  }, [selectedBuilding, liveVertexPreview]);

  // Przesunięcie geometrii do lokalnego układu współrzędnych obiektu (względem `anchor`) - ani
  // czyste przesunięcie całego budynku po scenie, ani edycja pojedynczego wierzchołka nie
  // powodują już przeskakiwania kamery: translacja nie zmienia kształtu względem samego siebie,
  // a anchor pochodzi wyłącznie ze stanu sprzed bieżącej, niezatwierdzonej interakcji.
  const localizedBuilding = React.useMemo(() => {
    if (!patchedSelectedBuilding || !anchor) return patchedSelectedBuilding;
    return translateBuildingGeometry(patchedSelectedBuilding, -anchor.x, -anchor.y);
  }, [patchedSelectedBuilding, anchor]);

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

  const localizedGroupBuildings = React.useMemo(() => {
    if (!selectedBuilding || !selectedBuilding.groupId || !anchor) return undefined;
    const inGroup = getCompoundGroupBuildings(buildings, selectedBuilding.groupId);
    if (inGroup.length <= 1) return undefined;
    return inGroup.map((b) => translateBuildingGeometry(b, -anchor.x, -anchor.y));
  }, [buildings, selectedBuilding, anchor]);

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
