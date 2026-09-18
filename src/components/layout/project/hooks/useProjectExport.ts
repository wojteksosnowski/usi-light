import React from 'react';
import {
  useSceneStore,
  useSolarAnalysisStore,
  useUiStore,
  useLicenseStore,
} from '../../../../store';
import { useWfsStore } from '../../../../modules/wfs-import/store/useWfsStore';
import { detectCoordinateSystem } from '../../../../utils/geoTransform';
import { exportSceneToDxf } from '../../../../utils/dxfExport';

export const useProjectExport = () => {
  const buildings = useSceneStore((s) => s.buildings);
  const pinnedPoints = useSolarAnalysisStore((s) => s.pinnedPoints);
  const settings = useSolarAnalysisStore((s) => s.settings);
  const isPro = useLicenseStore((s) => s.isPro);
  const openModal = useUiStore((s) => s.openModal);

  const [includeTerrainMesh, setIncludeTerrainMesh] = React.useState(true);
  const [terrainExportBusy, setTerrainExportBusy] = React.useState(false);
  const [exportWarning, setExportWarning] = React.useState<string | null>(null);

  const handleExportDxf = async (options?: { forceIncludeTerrain?: boolean }) => {
    if (!isPro) {
      openModal('pricing');
      return;
    }

    const currentTerrainMesh = useWfsStore.getState().terrainMesh;
    const shouldExportTerrain = options?.forceIncludeTerrain ?? (includeTerrainMesh || currentTerrainMesh !== null);

    const terrain = shouldExportTerrain && !currentTerrainMesh
      ? {
          projectCenter: { lat: settings.latitude, lon: settings.longitude },
          radiusMeters: useWfsStore.getState().projectRadius,
          projectCrs: detectCoordinateSystem(buildings.flatMap((b) => b.vertices || [])),
        }
      : undefined;

    setTerrainExportBusy(true);
    setExportWarning(null);
    try {
      const { terrainWarning } = await exportSceneToDxf({
        buildings,
        pinnedPoints,
        terrainMeshData: shouldExportTerrain ? currentTerrainMesh : null,
        terrain,
      });
      if (terrainWarning) {
        setExportWarning(`⚠️ Eksport DXF: ${terrainWarning}`);
      }
    } catch (err: any) {
      console.error('[useProjectExport] Błąd eksportu DXF:', err);
      setExportWarning(`Błąd eksportu DXF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTerrainExportBusy(false);
    }
  };

  return {
    isPro,
    includeTerrainMesh,
    setIncludeTerrainMesh,
    terrainExportBusy,
    exportWarning,
    handleExportDxf,
  };
};
