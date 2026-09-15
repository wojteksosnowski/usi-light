import React from 'react';
import { ProjectAnalysisTogglesCard, MasterplanShadowAlgorithmCard } from './project';

/**
 * Kontener widoku grupy Analizy w panelu bocznym.
 * Gromadzi wszystkie przełączniki analiz: § 12 (przesłanianie), § 56 (nasłonecznienie),
 * punkty pomiarowe, wektory normalne, zakres cienia, podkłady satelitarne oraz plany/podkłady.
 */
export const AnalysesGroup: React.FC = () => {
  return (
    <div className="sidebar-group-content">
      <ProjectAnalysisTogglesCard />
      <MasterplanShadowAlgorithmCard />
    </div>
  );
};
