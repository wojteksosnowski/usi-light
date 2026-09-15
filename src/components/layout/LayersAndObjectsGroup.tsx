import React from 'react';
import {
  CadLayersSection,
  SceneObjectsSection,
  ObjectEditorSection,
} from './layers-and-objects';

/**
 * Czysty kontener widoku sekcji Warstwy i Obiekty w panelu bocznym.
 * Logika domenowa została podzielona na dedykowane moduły:
 * - CadLayersSection: zarządzanie warstwami CAD (widoczność, blokady, duch, masowa edycja)
 * - SceneObjectsSection: drzewo obiektów sceny (budynki, działki, place zabaw, balkony)
 * - ObjectEditorSection: inspektor edycji wybranego obiektu 2.5D
 */
export const LayersAndObjectsGroup: React.FC = () => {
  return (
    <div className="sidebar-group-content">
      {/* 2.0 Warstwy CAD */}
      <CadLayersSection />

      {/* 2.1 Obiekty w projekcie */}
      <SceneObjectsSection />

      {/* 2.2 Edycja Obiektu 2.5D */}
      <ObjectEditorSection />
    </div>
  );
};
