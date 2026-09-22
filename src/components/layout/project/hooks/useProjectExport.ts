import React from 'react';
import {
  useSceneStore,
  useSolarAnalysisStore,
  useUiStore,
  useLicenseStore,
} from '../../../../store';
import { exportSceneToDxf } from '../../../../utils/dxfExport';

export const useProjectExport = () => {
  const buildings = useSceneStore((s) => s.buildings);
  const pinnedPoints = useSolarAnalysisStore((s) => s.pinnedPoints);
  const pinnedPointResults = useSolarAnalysisStore((s) => s.pinnedPointResults);
  const analysisResults = useSolarAnalysisStore((s) => s.analysisOutput.results);
  const shadowAnalysis = useSolarAnalysisStore((s) => s.analysisOutput.shadowAnalysis);
  const isPro = useLicenseStore((s) => s.isPro);
  const openModal = useUiStore((s) => s.openModal);

  const [terrainExportBusy, setTerrainExportBusy] = React.useState(false);
  const [exportWarning, setExportWarning] = React.useState<string | null>(null);

  const handleExportDxf = async () => {
    if (!isPro) {
      openModal('pricing');
      return;
    }

    setTerrainExportBusy(true);
    setExportWarning(null);
    try {
      await exportSceneToDxf({
        buildings,
        pinnedPoints,
        hourlyShadows: shadowAnalysis?.hourlyShadows,
        pinnedPointResults,
        analysisResults,
      });
    } finally {
      setTerrainExportBusy(false);
    }
  };

  return {
    isPro,
    terrainExportBusy,
    exportWarning,
    handleExportDxf,
  };
};
