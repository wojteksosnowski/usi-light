Przejście z modelu, w którym każdy moduł na bieżąco interpretuje wierzchołki i parametry, na architekturę **Canonical Precomputed Geometry (Bake on Edit)** to kluczowy krok do uzyskania stałych 60 FPS w CADCanvas, natychmiastowego renderu izometrii oraz odciążenia silników analitycznych.

Poniżej znajduje się kompletna propozycja przebudowy architektury.

## 1. Model Danych: Standard `CompiledObjectGeometry`

Rozdzielamy stan obiektu na **Deklarację intencji** (dane wejściowe użytkownika: obrys bazowy, wysokość, modyfikatory) oraz **Skompilowaną geometrię** (zmaterializowane dane 2D i 3D).

  

Każdy obiekt w scenie (`Building`, `CompoundBuilding`, `LogicalGroup`) staje się bezpośrednim nośnikiem wygenerowanej struktury:

  

TypeScript

```
// src/types/compiledGeometry.ts

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface PolygonRing {
  exterior: Point2D[];
  holes: Point2D[][];
}

export interface Face3D {
  id: string;
  type: 'wall' | 'roof' | 'ground' | 'terrace' | 'cutout';
  vertices: Point3D[];
  normal?: Point3D;
  materialTag?: string; // np. kolor strefy, funkcja
}

export interface CompiledObjectGeometry {
  /** Unikalna sygnatura wersji danych wejściowych (hash/revision) */
  geometryHash: string;
  timestamp: number;

  /** Zrzut 2D dla widoku z góry / Masterplanu / rzutów */
  footprint2D: {
    base: PolygonRing;          // Rzut przyziemia (obrys + otwory)
    roof: PolygonRing;          // Rzut dachu (np. po uwzględnieniu modyfikatorów, wycofań)
    storySlices?: {             // Opcjonalne obrysy kondygnacji (dla uskoków/nadwieszeń)
      floorIndex: number;
      elevation: number;
      height: number;
      ring: PolygonRing;
    }[];
  };

  /** Bryła 3D dla BuildingIsoPreview, cieniowania i ray-castingu */
  mesh3D: {
    faces: Face3D[];            // Prekalkulowane wielokąty 3D (ściany, dachy, blendy)
    bounds3D: {
      min: Point3D;
      max: Point3D;
    };
  };

  /** Metryki wyliczone raz przy edycji */
  metrics: {
    footprintArea: number;      // Powierzchnia zabudowy netto (z odliczonymi dziurami)
    totalFloorArea: number;     // PUM / pow. całkowita
    volume: number;             // Kubatura
    heightMax: number;          // Wysokość maksymalna
  };
}
```

W strukturze bazowej w `src/types/geometry.ts`:

  

- Dodajemy pole `computed?: CompiledObjectGeometry` do interfejsu obiektu sceny.
    
      
    
- Pole to jest oznaczone jako **pochodne/runtime**. Przy zapisie do formatu JSON/exportu (`projectStorage.ts`) pole to może być pomijane (by nie pompować wagi pliku), a po załadowaniu projektu generowane w jednym cyklu podczas bootstrapu.
    
      
    

## 2. Warstwa Pośrednia: Kompilator i Zarządca Unieważniania (Bake Pipeline)

Geometry compiler działa reaktywnie lub jako middleware w `useSceneStore`. Skoro edycja geometrii zachodzi rzadko (drag punktu, zmiana wysokości, dodanie modyfikatora), **kompilacja odbywa się synchronicznie na zakończenie akcji edycyjnej (np. `onPointerUp` / `commitAction`)**.

  

```
               [ Akcja Użytkownika / Edycja Obiektu A ]
                                  │
                                  ▼
                     useSceneStore (Mutation)
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
       1. GeometryCompiler.bake(A)         (Inne obiekty: BRAK ZMIAN)
                  │
        A.computed = NewGeometry
                  │
        Czy A należy do Grupy G?
             ├── NIE ──► Gotowe
             └── TAK ──► 2. GeometryCompiler.rebuildGroup(G)
                               │
                     G.computed = Aggregate(Children)
```

### Zasady działania pipeline'u:

1. **Zero rekalkulacji przy renderze:** Żaden komponent Reacta ani renderer Canvas/WebGL nie wywołuje `modifierPipeline.ts`, wycinania otworów ani triangulacji w pętli renderowania.
    
      
    
2. **Propagacja w górę (Bottom-Up Invalidation):**
    
      
    - Edycja obiektu prostego aktualizuje tylko ten obiekt.
        
          
        
    - Jeśli obiekt ma `parentId` (jest w grupie/compound), wysyłany jest sygnał aktualizacji do grupy nadrzędnej.
        
          
        
    - Grupa nadrzędna **nie** przelicza na nowo geometrii swoich pozostałych dzieci – po prostu bierze ich gotowe `child.computed` i dokonuje operacji scalenia (Boolean Union lub zgrupowania w kontener).
        
          
        

## 3. Geometria Grup Logicznych i Obiektów Złożonych

Grupy logiczne pełnią rolę agregatorów geometrii:

  

- **Reprezentacja 2D grupy:** Suma obrysów składowych. Jeśli obiekty stykają się lub przenikają, kompilator grupy wykonuje `polygonBooleanTwo.ts (union)` na gotowych obrysach `child.computed.footprint2D`. Jeśli są rozłączne, grupa przechowuje zbiór pierścieni (MultiPolygon).
    
      
    
- **Reprezentacja 3D grupy:** Suma kolekcji ścian: `mesh3D.faces = children.flatMap(c => c.computed.mesh3D.faces)`. Opcjonalnie usuwane są ściany wewnętrzne stykające się wzajemnie, jeśli silnik analizy wymaga bryły jednorodnej.
    
      
    
- **Metryki grupy:** Agregacja sumaryczna powierzchni, kubatury i wspólny bounding box 3D obliczany w czasie $O(n)$ na podstawie metryk składowych.
    
      
    

## 4. Adaptacja Modułów Konsumenckich

Wszystkie moduły aplikacji przechodzą na tryb czystego konsumenta:

  

|**Moduł**|**Dotychczasowa rola**|**Rola po zmianie architektury**|
|---|---|---|
|**`CADCanvas / Masterplan`**|Wyliczanie modyfikatorów, obrysów, odsunięć stref i otworów w każdej klatce.|**Tylko rysowanie:** Pobiera `obj.computed.footprint2D.base`, rysuje ścieżkę (`ctx.lineTo`), wypełnia tło, rysuje dziury (`evenodd`).|
|**`BuildingIsoPreview`**|Ekstruzja ścian, kalkulacja poziomów i rzutowanie z wierzchołków obiektu.|**Tylko rzutowanie:** Iteruje po `obj.computed.mesh3D.faces`, mnoży wierzchołki przez stałą macierz izometryczną, sortuje po głębokości (Painter's algorithm) i renderuje poligony.|
|**Silniki Analiz (Słońce / Cienie / Przesłanianie)**|Parsowanie modyfikatorów, ręczna ekstruzja krawędzi, wyliczanie geometrii cienia.|**Tylko analiza fizyczna:** Rzutowanie promieni bezpośrednio na `mesh3D.faces` lub rzucanie wielokątów cienia z gotowych krawędzi zrzutu dachu i ścian.|

## 5. Rekomendowana Ścieżka Wdrożenia

1. **Warstwa Typów (`src/types/compiledGeometry.ts`):** Zdefiniować zunifikowaną strukturę `CompiledObjectGeometry` dla 2D i 3D.
    
      
    
2. **Ekstrakcja Generatora (`src/engine/compiler/GeometryCompiler.ts`):** Połączyć obecną logikę z `modifierPipeline.ts`, `compoundObjectPipeline.ts` oraz `buildingIsoGeometry.ts` w jeden deterministyczny proces budujący obiekt geometrii.
    
      
    
3. **Integracja z Magazynem Stanu (`useSceneStore.ts`):**
    
      
    - Dodać pole `computed` do `Building` i obiektów grup.
        
          
        
    - Podpiąć `GeometryCompiler.bake(object)` pod mutacje edycyjne: przesunięcie punktu, zmiana wysokości, aktualizacja modyfikatora, usunięcie/dodanie dziecka do grupy.
        
          
        
4. **Przepięcie Konsumentów:**
    
      
    - Uprościć `MasterplanRenderPipeline` i `buildingsRenderer.ts` — usunąć lokalne generatory geometrii.
        
          
        
    - W `BuildingIsoPreview.tsx` odwołać się wprost do `building.computed.mesh3D`.
        
          
        
    - W `analysisEngine.ts` przekazywać przygotowane `mesh3D` do workerów analitycznych bez powtórnego generowania bryły.
        
          


---

### 1. Specyfikacja Typów: `src/types/compiledGeometry.ts`

Interfejs dzieli geometrię na trzy wyspecjalizowane domeny: **rzut 2D (CAD / Masterplan)**, **bryłę 3D (IsoPreview / Raycasting)** oraz **dane analityczne (cienie / przesłanianie)**, uzupełnione o metryki numeryczne wyliczane raz podczas edycji.

  

TypeScript

```
// src/types/compiledGeometry.ts

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Dwuwymiarowy wielokąt z opcjonalnymi otworami */
export interface Polygon2D {
  readonly exterior: readonly Point2D[];
  readonly holes: readonly (readonly Point2D[])[];
}

/** Płaska ściana w przestrzeni 3D zorientowana wierzchołkami CCW */
export interface Face3D {
  readonly id: string;
  readonly sourceObjectId: string;
  readonly type: 'roof' | 'wall' | 'terrace' | 'ground' | 'cutout';
  readonly vertices: readonly Point3D[];
  readonly normal: Point3D;
  readonly floorIndex?: number;
  readonly zoneFunction?: string;
}

/** Prekalkulowana krawędź rzucająca cień dla silnika solarnego */
export interface ShadowCastingEdge {
  readonly p1: Point3D;
  readonly p2: Point3D;
  readonly isRidgeOrRoofEdge: boolean;
}

/** Przekrój poziomy danej kondygnacji */
export interface StorySlice {
  readonly storyIndex: number;
  readonly elevationBottom: number;
  readonly elevationTop: number;
  readonly height: number;
  readonly footprint: Polygon2D;
}

/**
 * Kompletny nośnik zmaterializowanej geometrii obiektu.
 * Wartości są niemutowalne (readonly) i deterministyczne.
 */
export interface CompiledObjectGeometry {
  /** Unikalny hash stanu wejściowego (punkty + parametry + modyfikatory) */
  readonly geometryHash: string;
  readonly computedAt: number;

  /** Reprezentacja 2D dla CADCanvas i Masterplan */
  readonly representation2D: {
    readonly footprintBase: Polygon2D;     // Przyziemie (obrys + dziury)
    readonly footprintRoof: Polygon2D;     // Rzut dachu (z uskokami / wycofaniami)
    readonly storySlices: readonly StorySlice[]; // Obrysy poszczególnych kondygnacji
    readonly bounds2D: {
      readonly min: Point2D;
      readonly max: Point2D;
    };
  };

  /** Reprezentacja siatki 3D dla BuildingIsoPreview i widoków perspektywicznych */
  readonly representation3D: {
    readonly faces: readonly Face3D[];
    readonly bounds3D: {
      readonly min: Point3D;
      readonly max: Point3D;
    };
  };

  /** Ekstrakty dla silników analitycznych (Słońce, Cienie, Linijka Słońca) */
  readonly analysis: {
    readonly castingEdges: readonly ShadowCastingEdge[];
    readonly heightMin: number;
    readonly heightMax: number;
    readonly simplifiedEnvelope2D: Polygon2D; // Uproszczony obrys do zgrubnego culling'u
  };

  /** Metryki powierzchniowe i objętościowe zbuforowane raz przy kompilacji */
  readonly metrics: {
    readonly footprintArea: number;   // Powierzchnia zabudowy netto (m²)
    readonly grossFloorArea: number;  // PUM / pow. całkowita kondygnacji (m²)
    readonly volume: number;          // Kubatura (m³)
    readonly perimeter: number;       // Obwód przyziemia (m)
  };
}
```

### 2. Rozszerzenie Modeli Sceny: `Building` i `LogicalGroup`

Każdy element w `src/types/geometry.ts` otrzymuje pole `computed?: CompiledObjectGeometry`.

  

TypeScript

```
// Fragment rozszerzenia obiektów sceny

export interface SceneObjectBase {
  id: string;
  name: string;
  layerId: string;
  groupId?: string; // Przynależność do grupy logicznej
  
  /** 
   * Zmaterializowana geometria runtime.
   * Pomijana przy serializacji do pliku JSON (projectStorage),
   * odtwarzana podczas bootstrapu projektu.
   */
  computed?: CompiledObjectGeometry;
}

export interface Building extends SceneObjectBase {
  type: 'building';
  points: Point2D[];
  baseElevation: number;
  height: number;
  modifiers?: BuildingModifier[];
  // ...pozostałe parametry wejściowe
}

export interface LogicalGroup extends SceneObjectBase {
  type: 'group';
  childrenIds: string[];
  groupType: 'compound_building' | 'functional_set' | 'parcel_block';
  // Obiekt grupy sam jest nośnikiem zagregowanej geometrii swoich dzieci
}
```

### 3. Logika Kompilacji i Unieważniania (Bake Pipeline)

Kompilacja odbywa się synchronicznie na zakończenie akcji edycji (np. `onPointerUp` przy modyfikacji wierzchołka, zmiana w panelu właściwości czy dodanie modyfikatora). Żaden renderer nie wylicza geometrii w pętli renderującej.

  

TypeScript

```
// src/engine/compiler/GeometryCompiler.ts

export class GeometryCompiler {
  /** Kompiluje geometrię pojedynczego obiektu prostego */
  public static bakeBuilding(building: Building): CompiledObjectGeometry {
    const hash = this.computeStateHash(building);
    if (building.computed && building.computed.geometryHash === hash) {
      return building.computed;
    }

    // 1. Zastosowanie modyfikatorów na 2D (setbacki, wycięcia, pille)
    const { basePolygon, roofPolygon, storySlices } = this.processModifiers(building);

    // 2. Ekstruzja ścian i generowanie płaszczyzn 3D
    const faces = this.build3DMesh(building.id, basePolygon, storySlices, building.baseElevation);

    // 3. Wyciągnięcie krawędzi rzucających cień
    const castingEdges = this.extractCastingEdges(faces);

    // 4. Kalkulacja metryk
    const metrics = this.calculateMetrics(basePolygon, storySlices);

    return {
      geometryHash: hash,
      computedAt: Date.now(),
      representation2D: {
        footprintBase: basePolygon,
        footprintRoof: roofPolygon,
        storySlices,
        bounds2D: this.computeBounds2D(basePolygon.exterior),
      },
      representation3D: {
        faces,
        bounds3D: this.computeBounds3D(faces),
      },
      analysis: {
        castingEdges,
        heightMin: building.baseElevation,
        heightMax: building.baseElevation + building.height,
        simplifiedEnvelope2D: basePolygon,
      },
      metrics,
    };
  }

  /** Kompiluje geometrię grupy logicznej na bazie gotowych danych dzieci */
  public static bakeGroup(group: LogicalGroup, children: readonly SceneObjectBase[]): CompiledObjectGeometry {
    const validChildren = children.filter((c): c is Building => c.computed !== undefined);
    const hash = validChildren.map(c => c.computed!.geometryHash).sort().join('|');

    // 1. Scalenie obrysów 2D przy pomocy polygonBooleanTwo (operacja Union)
    const mergedBaseFootprint = this.union2DPolygons(
      validChildren.map(c => c.computed!.representation2D.footprintBase)
    );
    const mergedRoofFootprint = this.union2DPolygons(
      validChildren.map(c => c.computed!.representation2D.footprintRoof)
    );

    // 2. Agregacja ścian 3D (zbiór wszystkich ścian ze składowych)
    const aggregatedFaces: Face3D[] = validChildren.flatMap(c => c.computed!.representation3D.faces);

    // 3. Agregacja krawędzi analitycznych
    const aggregatedCastingEdges: ShadowCastingEdge[] = validChildren.flatMap(
      c => c.computed!.analysis.castingEdges
    );

    // 4. Sumowanie metryk (czas O(n), bez triangulacji)
    const aggregatedMetrics = validChildren.reduce((acc, c) => ({
      footprintArea: acc.footprintArea + c.computed!.metrics.footprintArea,
      grossFloorArea: acc.grossFloorArea + c.computed!.metrics.grossFloorArea,
      volume: acc.volume + c.computed!.metrics.volume,
      perimeter: acc.perimeter + c.computed!.metrics.perimeter,
    }), { footprintArea: 0, grossFloorArea: 0, volume: 0, perimeter: 0 });

    return {
      geometryHash: hash,
      computedAt: Date.now(),
      representation2D: {
        footprintBase: mergedBaseFootprint,
        footprintRoof: mergedRoofFootprint,
        storySlices: [], // Opcjonalnie fuzja kondygnacji o tej samej wysokości
        bounds2D: this.mergeBounds2D(validChildren.map(c => c.computed!.representation2D.bounds2D)),
      },
      representation3D: {
        faces: aggregatedFaces,
        bounds3D: this.mergeBounds3D(validChildren.map(c => c.computed!.representation3D.bounds3D)),
      },
      analysis: {
        castingEdges: aggregatedCastingEdges,
        heightMin: Math.min(...validChildren.map(c => c.computed!.analysis.heightMin)),
        heightMax: Math.max(...validChildren.map(c => c.computed!.analysis.heightMax)),
        simplifiedEnvelope2D: mergedBaseFootprint,
      },
      metrics: aggregatedMetrics,
    };
  }

  private static computeStateHash(obj: Building): string {
    return `${obj.id}:${obj.points.length}:${obj.height}:${obj.baseElevation}:${JSON.stringify(obj.modifiers ?? [])}`;
  }
}
```

### 4. Przepływ w Magazynie Stanu (`useSceneStore`)

Podczas jakiejkolwiek mutacji w store wywoływana jest funkcja pomocnicza aktualizująca zmodyfikowany obiekt oraz ewentualnego rodzica:

  

TypeScript

```
// Wewnątrz akcji useSceneStore (np. updateBuildingPoints, commitModifierChange)

commitObjectEdit: (objectId: string) => {
  set((state) => {
    const object = state.objects[objectId];
    if (!object || object.type !== 'building') return state;

    // 1. Przelicz TYLKO ten edytowany obiekt
    const updatedGeometry = GeometryCompiler.bakeBuilding(object);
    const updatedObject = { ...object, computed: updatedGeometry };
    
    const newObjects = { ...state.objects, [objectId]: updatedObject };

    // 2. Jeśli obiekt należy do grupy, unieważnij i przebuduj TYLKO tę grupę
    if (object.groupId && state.objects[object.groupId]) {
      const group = state.objects[object.groupId] as LogicalGroup;
      const groupChildren = group.childrenIds.map(id => newObjects[id]).filter(Boolean);
      
      newObjects[group.id] = {
        ...group,
        computed: GeometryCompiler.bakeGroup(group, groupChildren)
      };
    }

    return { objects: newObjects };
  });
}
```

### 5. Konsumpcja Danych w Modułach Aplikacji

Każdy z kluczowych modułów zostaje odciążony z logiki kalkulacji:

  

- **`CADCanvas` / `buildingsRenderer.ts`:**
    
      
    
    TypeScript
    
    ```
    export function renderBuilding2D(ctx: CanvasRenderingContext2D, building: Building) {
      const geom = building.computed?.representation2D.footprintBase;
      if (!geom) return;
    
      ctx.beginPath();
      // Kontur zewnętrzny
      drawRing(ctx, geom.exterior);
      // Otwory / dziury
      for (const hole of geom.holes) {
        drawRing(ctx, hole);
      }
      ctx.fill('evenodd');
      ctx.stroke();
    }
    ```
    
- **`BuildingIsoPreview.tsx`:**
    
      
    
    TypeScript
    
    ```
    export function renderIsometric(ctx: CanvasRenderingContext2D, object: SceneObjectBase) {
      const faces = object.computed?.representation3D.faces;
      if (!faces) return;
    
      // 1. Rzutowanie wierzchołków faces przez macierz izometryczną
      // 2. Sortowanie ścian według średniej głębokości Z/Y (Painter's algorithm)
      // 3. Rysowanie gotowych wielokątów z normalną oświetlenia
    }
    ```
    
- **Silniki Analiz (`analysisEngine.ts` / Web Worker):**
    
    Zamiast przesyłać definicje modyfikatorów i parametry budynków do workera, przekazujemy płaskie tablice z `computed.analysis.castingEdges` oraz `computed.representation3D.faces`. Worker operuje wyłącznie na surowych wektorach 3D bez importowania reguł architektonicznych.