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
  const pinnedPointResults = useSolarAnalysisStore((s) => s.pinnedPointResults);
  const analysisResults = useSolarAnalysisStore((s) => s.analysisOutput.results);
  const shadowAnalysis = useSolarAnalysisStore((s) => s.analysisOutput.shadowAnalysis);
  const settings = useSolarAnalysisStore((s) => s.settings);
  const isPro = useLicenseStore((s) => s.isPro);
  const openModal = useUiStore((s) => s.openModal);

  const [includeTerrainMesh, setIncludeTerrainMesh] = React.useState(false);
  const [terrainExportBusy, setTerrainExportBusy] = React.useState(false);
  const [exportWarning, setExportWarning] = React.useState<string | null>(null);

  const handleExportDxf = async () => {
    if (!isPro) {
      openModal('pricing');
      return;
    }
    const terrain = includeTerrainMesh
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
        terrain,
        hourlyShadows: shadowAnalysis?.hourlyShadows,
        pinnedPointResults,
        analysisResults,
      });
      if (terrainWarning) {
        setExportWarning(`⚠️ Eksport DXF: ${terrainWarning}`);
      }
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
