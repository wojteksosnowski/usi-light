import { describe, it, expect, beforeEach } from 'vitest';
import { useSceneStore } from '@/store';
import {
  CadLayersSection,
  SceneObjectsSection,
  ObjectEditorSection,
  CircleSelectionIcon,
} from './index';
import { computeObjectTree } from './objects/hooks/useSceneObjectsList';

describe('LayersAndObjects module exports & store integration', () => {
  beforeEach(() => {
    useSceneStore.getState().resetScene();
    useSceneStore.setState({
      buildings: [
        {
          id: 'b1',
          name: 'Budynek A',
          layer: 'Architektura',
          category: 'building',
          isTested: true,
          isIncluded: true,
          isCityCentre: false,
          buildingType: 'residential',
          defaultHeight: 15,
          elevation: 0,
          hWindowBottom: 0.85,
          vertices: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
          ],
          segments: [],
          transform: { tx: 0, ty: 0, rotationDeg: 0 },
        },
        {
          id: 'plot1',
          name: 'Działka 1',
          layer: 'Działki',
          category: 'boundary',
          areaType: 'plot',
          plotNumber: '101/1',
          isTested: false,
          isIncluded: true,
          isCityCentre: false,
          buildingType: 'residential',
          defaultHeight: 0,
          hWindowBottom: 0,
          vertices: [
            { x: -5, y: -5 },
            { x: 20, y: -5 },
            { x: 20, y: 20 },
            { x: -5, y: 20 },
          ],
          segments: [],
          transform: { tx: 0, ty: 0, rotationDeg: 0 },
        },
      ],
      selectedBuildingId: 'b1',
      selectedBuildingIds: ['b1'],
      selectedLayerName: 'Architektura',
      layerSettings: {},
    });
  });

  it('exports all decomposed components', () => {
    expect(CadLayersSection).toBeDefined();
    expect(SceneObjectsSection).toBeDefined();
    expect(ObjectEditorSection).toBeDefined();
    expect(CircleSelectionIcon).toBeDefined();
  });

  it('handles layer mass property updates in store', () => {
    useSceneStore.getState().updateLayerBuildings('Architektura', { defaultHeight: 22 });
    const bldg = useSceneStore.getState().buildings.find((b) => b.id === 'b1');
    expect(bldg?.defaultHeight).toBe(22);
  });

  it('handles layer visibility and ghosting toggles in store', () => {
    useSceneStore.getState().toggleLayerGhost('Architektura');
    expect(useSceneStore.getState().layerSettings['Architektura']?.isGhosted).toBe(true);

    useSceneStore.getState().toggleLayerVisibility('Architektura');
    expect(useSceneStore.getState().layerSettings['Architektura']?.isVisible).toBe(false);
  });

  it('correctly categorizes objects into inProject and outsideProject for each type', () => {
    const prevBuildings = useSceneStore.getState().buildings;
    useSceneStore.setState({
      buildings: [
        ...prevBuildings,
        {
          id: 'b2_context',
          name: 'Budynek Istniejący',
          layer: 'Otoczenie',
          category: 'building',
          isTested: false,
          isIncluded: true,
          isCityCentre: false,
          buildingType: 'residential',
          defaultHeight: 25,
          elevation: 2,
          hWindowBottom: 0.85,
          vertices: [{ x: 30, y: 30 }, { x: 40, y: 30 }, { x: 40, y: 40 }, { x: 30, y: 40 }],
          segments: [],
          transform: { tx: 0, ty: 0, rotationDeg: 0 },
        },
        {
          id: 'pg1',
          name: 'Plac Zabaw A',
          layer: 'Zieleń',
          category: 'boundary',
          areaType: 'playground',
          isTested: true,
          isIncluded: true,
          isCityCentre: false,
          buildingType: 'residential',
          defaultHeight: 0,
          hWindowBottom: 0,
          vertices: [{ x: 0, y: 15 }, { x: 10, y: 15 }, { x: 10, y: 25 }, { x: 0, y: 25 }],
          segments: [],
          transform: { tx: 0, ty: 0, rotationDeg: 0 },
        },
      ],
    });

    const currentBuildings = useSceneStore.getState().buildings;
    const tree = computeObjectTree(currentBuildings);

    // Budynki
    expect(tree.buildings.all.length).toBe(2);
    expect(tree.buildings.inProject.length).toBe(1);
    expect(tree.buildings.inProject[0].id).toBe('b1');
    expect(tree.buildings.outsideProject.length).toBe(1);
    expect(tree.buildings.outsideProject[0].id).toBe('b2_context');

    // Działki
    expect(tree.plots.all.length).toBe(1);
    expect(tree.plots.inProject.length).toBe(0);
    expect(tree.plots.outsideProject.length).toBe(1);
    expect(tree.plots.outsideProject[0].id).toBe('plot1');

    // Place zabaw
    expect(tree.playgrounds.all.length).toBe(1);
    expect(tree.playgrounds.inProject.length).toBe(1);
    expect(tree.playgrounds.inProject[0].id).toBe('pg1');
    expect(tree.playgrounds.outsideProject.length).toBe(0);
  });
});
