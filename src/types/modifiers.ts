import { Point2D } from './geometry';

export type ModifierType = 'story_offset' | 'zone_offset' | 'bay_window';

export interface BaseModifier {
  id: string;
  type: ModifierType;
  enabled: boolean;
  name?: string;
}

export interface StoryOffsetModifier extends BaseModifier {
  type: 'story_offset';
  distance: number;      // metry (+ na zewnątrz / nadwieszenie, - do wewnątrz / cofnięcie)
  storiesCount: number;  // < 0: N kondygnacji od góry (poddasze/penthouse); > 0: N kondygnacji od dołu (podcień)
}

export interface ZoneOffsetModifier extends BaseModifier {
  type: 'zone_offset';
  distance: number;      // metry (+ na zewnątrz bufor, - do wnętrza obiektu)
  areaType?: 'plot' | 'playground';
  name?: string;
}

export type BayWindowAngle = 90 | 60 | 45 | 30;

export interface BayWindowModifier extends BaseModifier {
  type: 'bay_window';
  width: number;           // Szerokość czoła wykuszu na krawędzi (metry)
  projection: number;      // Wysunięcie równoległe (metry, >0 na zewnątrz, <0 do wnętrza)
  storiesCount: number;    // Kondygnacja: <0 od góry, >0 od dołu, 0 cała wysokość / obszar
  edgeIndex?: number;      // Opcjonalny indeks krawędzi (domyślnie najdłuższa)
  sideAngle?: BayWindowAngle; // Kąt ścian bocznych: 90, 60, 45, 30 stopni (domyślnie 45)
  positionRatio?: number;  // Położenie wzdłuż krawędzi: 0.0 (początek) .. 0.5 (środek) .. 1.0 (koniec)
}

export type Modifier = StoryOffsetModifier | ZoneOffsetModifier | BayWindowModifier;


export interface StoryFootprint {
  storyIndex: number;    // Indeks kondygnacji 0 .. K-1
  hBottom: number;       // Rzędna spodu kondygnacji (m)
  hTop: number;          // Rzędna wierzchu kondygnacji (m)
  polygon: Point2D[];    // Obrys 2D danej kondygnacji po przejściu stosu modyfikatorów
}

export interface ZoneFootprint {
  id: string;
  areaType?: 'plot' | 'playground';
  distance: number;
  polygon: Point2D[];
}

