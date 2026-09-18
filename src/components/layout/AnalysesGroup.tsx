import React from 'react';
import {
  ProjectAnalysisTogglesCard,
  ProjectTerrainCard,
  MasterplanShadowAlgorithmCard,
} from './project';

/**
 * Kontener widoku grupy Analizy w panelu bocznym.
 * Gromadzi:
 * 1. Przełączniki analiz nasłonecznienia (§12, §56), punktów, wektorów i podkładów satelitarnych oraz planów.
 * 2. Kafel 'Teren' (OpenStreetMap) — zagospodarowanie, drogi, zieleń i drzewa z automatycznym buforem.
 * 3. Sterowanie cieniem i algorytmem widoku białego (Masterplan).
 */
export const AnalysesGroup: React.FC = () => {
  return (
    <div className="sidebar-group-content">
      <ProjectAnalysisTogglesCard />
      <ProjectTerrainCard />
      <MasterplanShadowAlgorithmCard />
    </div>
  );
};
