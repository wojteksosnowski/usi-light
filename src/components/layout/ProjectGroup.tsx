import React from 'react';
import {
  ProjectNameCard,
  ProjectLocationCard,
  ProjectCadCard,
  ProjectDevToolsCard,
} from './project';

/**
 * Czysty kontener widoku sekcji Projekt w panelu bocznym.
 * Cała logika biznesowa, I/O i synchronizacja zostały wydelegowane do dedykowanych hooków i podkomponentów.
 */
export const ProjectGroup: React.FC = () => {
  return (
    <div className="sidebar-group-content">
      {/* 1.0 Nazwa projektu & Udostępnianie */}
      <ProjectNameCard />

      {/* 1.1 Środek projektu & Geolokalizacja */}
      <ProjectLocationCard />

      {/* 1.2 Pliki CAD (Import / Eksport DXF) */}
      <ProjectCadCard />

      {/* Narzędzia deweloperskie (Localhost) */}
      <ProjectDevToolsCard />
    </div>
  );
};
