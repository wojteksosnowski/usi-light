import { describe, it, expect } from 'vitest';
import {
  matchOsmLayerId,
  computePolylineLength,
  parseOsmHeight,
  parseOsmCircumference,
  parseOsmCrownDiameter,
  isOsmNaturalMonument,
  detectTreeGenus,
  resolveLeafType,
  estimateTreeDimensions,
  getPseudoRandomSeed,
} from './osmLanduseClient';
import { DEFAULT_OSM_LANDUSE_LAYERS } from '../store/useOsmLanduseStore';

describe('osmLanduseClient tag matching', () => {
  it('matches trees and tree rows correctly', () => {
    expect(matchOsmLayerId({ natural: 'tree' })).toBe('osm_trees');
    expect(matchOsmLayerId({ natural: 'tree_row' })).toBe('osm_trees');
    expect(matchOsmLayerId({ natural: 'tree_group' })).toBe('osm_trees');
  });

  it('matches highways and major roads correctly', () => {
    expect(matchOsmLayerId({ highway: 'motorway' })).toBe('osm_roads_highways');
    expect(matchOsmLayerId({ highway: 'trunk' })).toBe('osm_roads_highways');
    expect(matchOsmLayerId({ highway: 'primary' })).toBe('osm_roads_highways');
    expect(matchOsmLayerId({ highway: 'secondary' })).toBe('osm_roads_highways');
    expect(matchOsmLayerId({ highway: 'tertiary' })).toBe('osm_roads_highways');
    expect(matchOsmLayerId({ highway: 'primary_link' })).toBe('osm_roads_highways');
  });

  it('matches local and residential roads correctly', () => {
    expect(matchOsmLayerId({ highway: 'residential' })).toBe('osm_roads_local');
    expect(matchOsmLayerId({ highway: 'unclassified' })).toBe('osm_roads_local');
    expect(matchOsmLayerId({ highway: 'living_street' })).toBe('osm_roads_local');
    expect(matchOsmLayerId({ highway: 'service' })).toBe('osm_roads_local');
    expect(matchOsmLayerId({ highway: 'road' })).toBe('osm_roads_local');
  });

  it('matches paths, footways and cycleways correctly', () => {
    expect(matchOsmLayerId({ highway: 'pedestrian' })).toBe('osm_roads_paths');
    expect(matchOsmLayerId({ highway: 'footway' })).toBe('osm_roads_paths');
    expect(matchOsmLayerId({ highway: 'cycleway' })).toBe('osm_roads_paths');
    expect(matchOsmLayerId({ highway: 'path' })).toBe('osm_roads_paths');
    expect(matchOsmLayerId({ highway: 'track' })).toBe('osm_roads_paths');
    expect(matchOsmLayerId({ highway: 'steps' })).toBe('osm_roads_paths');
  });

  it('matches railways and tramways correctly', () => {
    expect(matchOsmLayerId({ railway: 'rail' })).toBe('osm_railways');
    expect(matchOsmLayerId({ railway: 'tram' })).toBe('osm_railways');
    expect(matchOsmLayerId({ railway: 'subway' })).toBe('osm_railways');
    expect(matchOsmLayerId({ railway: 'light_rail' })).toBe('osm_railways');
  });

  it('matches parking facilities correctly', () => {
    expect(matchOsmLayerId({ amenity: 'parking' })).toBe('osm_parking');
    expect(matchOsmLayerId({ amenity: 'parking_space' })).toBe('osm_parking');
    expect(matchOsmLayerId({ amenity: 'bicycle_parking' })).toBe('osm_parking');
  });

  it('matches water bodies correctly', () => {
    expect(matchOsmLayerId({ natural: 'water' })).toBe('osm_landuse_water');
    expect(matchOsmLayerId({ waterway: 'riverbank' })).toBe('osm_landuse_water');
    expect(matchOsmLayerId({ waterway: 'river' })).toBe('osm_landuse_water');
    expect(matchOsmLayerId({ waterway: 'stream' })).toBe('osm_landuse_water');
    expect(matchOsmLayerId({ landuse: 'basin' })).toBe('osm_landuse_water');
  });

  it('matches forests and woods correctly', () => {
    expect(matchOsmLayerId({ landuse: 'forest' })).toBe('osm_landuse_forest');
    expect(matchOsmLayerId({ natural: 'wood' })).toBe('osm_landuse_forest');
  });

  it('matches parks and green areas correctly', () => {
    expect(matchOsmLayerId({ leisure: 'park' })).toBe('osm_landuse_green');
    expect(matchOsmLayerId({ landuse: 'grass' })).toBe('osm_landuse_green');
    expect(matchOsmLayerId({ landuse: 'meadow' })).toBe('osm_landuse_green');
  });

  it('matches residential and commercial zones', () => {
    expect(matchOsmLayerId({ landuse: 'residential' })).toBe('osm_landuse_residential');
    expect(matchOsmLayerId({ landuse: 'commercial' })).toBe('osm_landuse_commercial');
    expect(matchOsmLayerId({ landuse: 'retail' })).toBe('osm_landuse_commercial');
  });

  it('matches public and civic amenities', () => {
    expect(matchOsmLayerId({ amenity: 'school' })).toBe('osm_landuse_civic');
    expect(matchOsmLayerId({ amenity: 'hospital' })).toBe('osm_landuse_civic');
    expect(matchOsmLayerId({ landuse: 'cemetery' })).toBe('osm_landuse_civic');
  });

  it('matches sport facilities', () => {
    expect(matchOsmLayerId({ leisure: 'pitch' })).toBe('osm_landuse_sports');
    expect(matchOsmLayerId({ leisure: 'stadium' })).toBe('osm_landuse_sports');
  });

  it('computes polyline length correctly', () => {
    expect(computePolylineLength([])).toBe(0);
    expect(computePolylineLength([{ x: 0, y: 0 }])).toBe(0);
    expect(computePolylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
    expect(computePolylineLength([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }])).toBe(7);
  });

  it('parses tree height correctly', () => {
    expect(parseOsmHeight('15')).toBe(15);
    expect(parseOsmHeight('12.5 m')).toBe(12.5);
    expect(parseOsmHeight('18m')).toBe(18);
    expect(parseOsmHeight(undefined)).toBeUndefined();
  });

  it('parses tree circumference correctly to centimeters', () => {
    expect(parseOsmCircumference('180')).toBe('180');
    expect(parseOsmCircumference('180 cm')).toBe('180');
    expect(parseOsmCircumference('1.5 m')).toBe('150');
    expect(parseOsmCircumference('2.2')).toBe('220');
    expect(parseOsmCircumference(undefined, { diameter: '280' })).toBe('88'); // 280mm -> 28cm -> pi*28 ~ 88cm
    expect(parseOsmCircumference(undefined, { diameter: '45| 34' })).toBe('141'); // 45cm -> pi*45 ~ 141cm
    expect(parseOsmCircumference(undefined)).toBeUndefined();
  });

  it('parses tree crown diameter correctly and does not confuse trunk diameter with crown diameter', () => {
    expect(parseOsmCrownDiameter({ diameter_crown: '8' })).toBe(8);
    expect(parseOsmCrownDiameter({ 'crown:diameter': '6.5 m' })).toBe(6.5);
    expect(parseOsmCrownDiameter({ crown_diameter: '10' })).toBe(10);
    // diameter is trunk diameter (in mm or cm), should NOT be parsed as crown diameter:
    expect(parseOsmCrownDiameter({ diameter: '280' })).toBeUndefined();
    expect(parseOsmCrownDiameter({})).toBeUndefined();
  });

  it('identifies natural monuments correctly', () => {
    expect(isOsmNaturalMonument({ denotation: 'natural_monument' })).toBe(true);
    expect(isOsmNaturalMonument({ monument: 'yes' })).toBe(true);
    expect(isOsmNaturalMonument({ protected: 'yes' })).toBe(true);
    expect(isOsmNaturalMonument({ natural: 'tree' })).toBe(false);
  });

  it('has all matched layer IDs present in DEFAULT_OSM_LANDUSE_LAYERS', () => {
    const knownLayerIds = new Set(DEFAULT_OSM_LANDUSE_LAYERS.map((l) => l.id));
    const sampleTagsList: Record<string, string>[] = [
      { natural: 'tree' },
      { natural: 'tree_row' },
      { highway: 'motorway' },
      { highway: 'primary' },
      { highway: 'residential' },
      { highway: 'footway' },
      { highway: 'cycleway' },
      { railway: 'rail' },
      { railway: 'tram' },
      { amenity: 'parking' },
      { natural: 'water' },
      { waterway: 'stream' },
      { landuse: 'forest' },
      { leisure: 'park' },
      { landuse: 'farmland' },
      { leisure: 'pitch' },
      { amenity: 'school' },
      { landuse: 'residential' },
      { landuse: 'commercial' },
      { landuse: 'industrial' },
      { landuse: 'something_unknown' },
    ];

    for (const tags of sampleTagsList) {
      const layerId = matchOsmLayerId(tags);
      expect(knownLayerIds.has(layerId)).toBe(true);
    }
  });

  it('detects tree genus accurately', () => {
    expect(detectTreeGenus({ genus: 'Quercus' })).toBe('Quercus');
    expect(detectTreeGenus({ species: 'Pinus sylvestris' })).toBe('Pinus');
    expect(detectTreeGenus({ name: 'Stary Dąb Bartek' })).toBe('Quercus');
    expect(detectTreeGenus({ species: 'Betula pendula' })).toBe('Betula');
    expect(detectTreeGenus({ 'species:pl': 'Klon zwyczajny' })).toBe('Acer');
    expect(detectTreeGenus({ 'species:pl': 'Lipa drobnolistna' })).toBe('Tilia');
  });

  it('resolves leaf types correctly based on tags and genus', () => {
    expect(resolveLeafType({ 'leaf_type': 'needleleaved' }, undefined)).toBe('needleleaved');
    expect(resolveLeafType({ 'leaf_type': 'broadleaved' }, undefined)).toBe('broadleaved');
    expect(resolveLeafType({}, 'Picea')).toBe('needleleaved');
    expect(resolveLeafType({}, 'Quercus')).toBe('broadleaved');
    expect(resolveLeafType({}, undefined)).toBe('broadleaved');
  });

  it('estimates tree dimensions realistically when tags are missing or partial', () => {
    // Explicit dimensions take priority
    const explicit = estimateTreeDimensions({ height: '14', diameter_crown: '10', circumference: '180' }, 'Quercus', 12345);
    expect(explicit.height).toBe(14);
    expect(explicit.crownDiameter).toBe(10);

    // Height derived from trunk circumference if height missing
    const fromCirc = estimateTreeDimensions({ circumference: '250 cm' }, 'Quercus', 12345);
    expect(fromCirc.height).toBeGreaterThan(12);
    expect(fromCirc.crownDiameter).toBeGreaterThan(5);

    // Genus fallback defaults without seed (rand=0.5 default)
    const pineDefaults = estimateTreeDimensions({}, 'Pinus');
    expect(pineDefaults.height).toBe(14);
    expect(pineDefaults.crownDiameter).toBeCloseTo(14 * 0.35, 1);
  });

  it('generates deterministic yet varied tree dimensions from node IDs', () => {
    const treeA1 = estimateTreeDimensions({}, undefined, 9448478527);
    const treeA2 = estimateTreeDimensions({}, undefined, 9448478527);
    const treeB = estimateTreeDimensions({}, undefined, 9448478528);
    const treeC = estimateTreeDimensions({}, undefined, 9448478529);

    // 100% determinizm (ten sam ID daje ten sam wynik)
    expect(treeA1.height).toBe(treeA2.height);
    expect(treeA1.crownDiameter).toBe(treeA2.crownDiameter);

    // Zróżnicowanie między sąsiednimi drzewami w realistycznym, umiarkowanym zakresie
    expect(treeA1.height).toBeGreaterThanOrEqual(10.0);
    expect(treeA1.height).toBeLessThanOrEqual(14.0);
    expect(treeB.height).toBeGreaterThanOrEqual(10.0);
    expect(treeB.height).toBeLessThanOrEqual(14.0);

    // Korony nie są identyczne
    const diameters = new Set([treeA1.crownDiameter, treeB.crownDiameter, treeC.crownDiameter]);
    expect(diameters.size).toBeGreaterThan(1);
  });
});


