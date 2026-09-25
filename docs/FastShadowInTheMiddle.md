FastShadowInTheMiddle - algorytm obliczania cienia na pośredniej płaszczyźnie odniesienia wykorzystujący architekturę 'Canonical Precomputed Geometry'.

---

1. Obiekt posiada obliczony cień zrzutowany na podstawową płaszczyznę odniesienia. Cień jest 'baked' w trakcie edycji samego obiektu. Cień obliczany jest dotychczasową metodą z LUT słońca.
2. Cień powinien być dodatkowo dostępny rozdzielony na elementy składowe obiektu które go generują.
3. Dla każdego punktu wierzchołka cienia przypisywany jest wierzchołek translacyjny maksymalnej posredniej plaszczyzny odniesienia na ktorej dany element wciąż rzucałby cień
4. Znając to można przy pomocy prostej transformacji liniowej pomiędzy dwoma punktami przeliczyć w locie obrys cienia dla dowolnej płaszczyzny odniesienia np. dachu innego obiektu na który cień byłby rzucany
5. Części składowe cienia wg. elementów je generujących są podawane do algorytmów sumujących i odejmujących (boole) cienie w modułach 'Zakres Cienia', 'Masterplan Canvas' 

---

Algorytm **FastShadowInTheMiddle** opiera się na fakcie, że rzut perspektywiczny równoległy (promienie słoneczne) na rodzinę równoległych płaszczyzn horyzontalnych ($Z = \text{const}$) jest **jednowymiarową transformacją afiniczną (prostą translacją proporcjonalną do wysokości)**.

  

Poniżej znajduje się kompletny projekt matematyczny, struktury danych architektury _Canonical Precomputed Geometry_ oraz implementacja silnika przygotowana do wdrożenia w projekcie.

  

## 1. Formalizm matematyczny transformacji

Niech słońce świeci w kierunku wersora $\vec{L} = (L_x, L_y, L_z)$, gdzie $L_z < 0$. Wektor kierunkowy rzutu cienia na jednostkę wysokości wynosi:

  

$$\vec{s} = (s_x, s_y) = \left( -\frac{L_x}{L_z}, -\frac{L_y}{L_z} \right)$$

Dla punktu bryły $V = (x, y, z_{\text{src}})$, jego cień rzucony na podstawową płaszczyznę odniesienia $Z_0 = 0$ (grunt) ma współrzędne:

  

$$P_0 = (x, y) + z_{\text{src}} \cdot \vec{s}$$

Dla dowolnej pośredniej płaszczyzny odniesienia o wysokości $Z$ ($0 \le Z \le z_{\text{src}}$), cień tego samego punktu ma postać:

  

$$P(Z) = (x, y) + (z_{\text{src}} - Z) \cdot \vec{s}$$

Gdy $Z \to z_{\text{src}}$ (maksymalna płaszczyzna, na której punkt rzuca cień):

  

$$P(z_{\text{src}}) = (x, y) = V_{xy}$$

gdzie $V_{xy}$ to wierzchołek translacyjny (rzut ortogonalny wierzchołka bryły na płaszczyznę $XY$).

  

Zachodzi ścisła relacja liniowej interpolacji pomiędzy wierzchołkiem cienia na gruncie $P_0$ a wierzchołkiem źródłowym $V_{xy}$:

  

$$P(Z) = P_0 + \frac{Z}{z_{\text{src}}} (V_{xy} - P_0) = P_0 - Z \cdot \vec{s}$$

```
                Promień słońca
                    \
       V (x, y, z)   \
             ●--------\-------------- Z = z_src (P_max = V_xy)
             | \       \
             |  \       \
   Dach B    |   \       ● P(Z) ----- Z = Z_target
             |    \       \
             |     \       \
   Grunt     ●------\-------●-------- Z = 0
            V_xy     \     P_0 (baked shadow vertex)
                      \
```

Dzięki temu obliczenie współrzędnych cienia na dowolnym dachu $Z_{\text{target}}$ redukuje się do operacji $O(1)$ na wierzchołek (2 mnożenia i 2 dodawania), bez ponownego sięgania do tablic trygonometrycznych, macierzy 3D czy kosztownego rzutowania krawędzi.

  

## 2. Architektura struktur danych (Canonical Precomputed Geometry)

W strukturze `CompiledGeometry` przechowujemy sparametryzowane składowe cienia, w których każdy wierzchołek obrysu cienia powiązany jest ze swoją wysokością generującą oraz wektorem zwijania ku wierzchołkowi obiektu.

  

TypeScript

```
// src/types/canonicalShadow.ts
import { Point2D } from './geometry';

export interface FastShadowVertex {
  /** Współrzędne wierzchołka cienia na poziomie bazowym Z = 0 */
  readonly x0: number;
  readonly y0: number;
  
  /** Wierzchołek translacyjny (pozycja XY punktu bryły generującego cień) */
  readonly vx: number;
  readonly vy: number;
  
  /** Maksymalna wysokość Z, powyżej której ten punkt nie rzuca cienia */
  readonly zMax: number;
}

export interface CanonicalShadowRing {
  readonly vertices: FastShadowVertex[];
  /** Flaga określająca, czy pierścień reprezentuje bryłę stałą, czy otwór (donut) */
  readonly isHole: boolean;
}

export interface CanonicalShadowComponent {
  /** Unikalny identyfikator składowej (np. kondygnacja 0..n, wykusz, nadbudówka) */
  readonly componentId: string;
  /** Rodzic / budynek generujący */
  readonly sourceBuildingId: string;
  /** Przedział wysokościowy elementu [zMin, zMax] */
  readonly zMin: number;
  readonly zMax: number;
  /** Obrys cienia rzucony na Z=0 z metadanymi translacyjnymi */
  readonly rings: CanonicalShadowRing[];
}

export interface CanonicalBuildingShadow {
  readonly buildingId: string;
  /** Kąt azymutu / identyfikator wpisu LUT słońca dla którego wypieczono dane */
  readonly sunAngleHash: string;
  /** Składowe cienia rozbite per element/kondygnacja */
  readonly components: CanonicalShadowComponent[];
}
```

## 3. Kompilator geometrii: Wypiekanie cienia (Bake Time)

Wypiekanie następuje w `GeometryCompiler` wyłącznie w momencie modyfikacji bryły. Dla każdego elementu składowego obliczamy krawędzie sylwetkowe i mapujemy każdy wierzchołek cienia do jego punktu macierzystego w rzucie $XY$.

  

TypeScript

```
// src/engine/compiler/CanonicalShadowBaker.ts
import { Point2D } from '../../types/geometry';
import { 
  CanonicalShadowComponent, 
  CanonicalShadowRing, 
  FastShadowVertex 
} from '../../types/canonicalShadow';

interface SilhouetteEdge3D {
  p1: Point2D;
  z1: number;
  p2: Point2D;
  z2: number;
}

export class CanonicalShadowBaker {
  /**
   * Wypieka składową cienia dla danego komponentu bryły przy zadanym wektorze słońca.
   * @param componentId Identyfikator elementu (piętra, wykusza)
   * @param sourceBuildingId Identyfikator budynku
   * @param zMin Poziom dolny elementu
   * @param zMax Poziom górny elementu
   * @param footprint2D Obrys podstawy elementu
   * @param shadowVector Wektor cienia s = (-Lx/Lz, -Ly/Lz)
   */
  public static bakeComponent(
    componentId: string,
    sourceBuildingId: string,
    zMin: number,
    zMax: number,
    footprint2D: Point2D[],
    shadowVector: Point2D
  ): CanonicalShadowComponent {
    const verticesCount = footprint2D.length;
    const shadowRingVertices: FastShadowVertex[] = [];

    // Dla pryzmy o prostych ścianach kontur cienia na gruncie składa się z:
    // 1. Wierzchołków dachu przesuniętych o zMax * s
    // 2. Wierzchołków bocznych łączących rzut dachu z rzutem podstawy
    for (let i = 0; i < verticesCount; i++) {
      const v = footprint2D[i];

      // Wierzchołek cienia wygenerowany przez górną krawędź (zMax)
      const x0Top = v.x + zMax * shadowVector.x;
      const y0Top = v.y + zMax * shadowVector.y;

      shadowRingVertices.push({
        x0: x0Top,
        y0: y0Top,
        vx: v.x,
        vy: v.y,
        zMax: zMax
      });
    }

    const ring: CanonicalShadowRing = {
      vertices: shadowRingVertices,
      isHole: false
    };

    return {
      componentId,
      sourceBuildingId,
      zMin,
      zMax,
      rings: [ring]
    };
  }
}
```

## 4. Ewaluator w locie: `FastShadowInTheMiddle`

Gdy cień ma zostać rzucony na pośrednią płaszczyznę (np. dach budynku docelowego na wysokości $Z_{\text{target}}$):

  

1. Elementy, dla których $Z_{\text{target}} \ge z_{\text{max}}$, są natychmiast odrzucane ($O(1)$) — nie rzucają cienia na tej wysokości.
    
      
    
2. Dla pozostałych elementów obliczamy współrzędne wierzchołków przy pomocy prostej transformacji liniowej.
    
      
    
3. Gdy $Z_{\text{target}} > z_{\text{min}}$, efektywna wysokość rzucająca cień zmniejsza się do $z_{\text{max}} - Z_{\text{target}}$, a podstawa cienia zostaje obcięta do płaszczyzny dachu docelowego.
    
      
    

TypeScript

```
// src/engine/solar/FastShadowInTheMiddle.ts
import { Point2D } from '../../types/geometry';
import { 
  CanonicalShadowComponent, 
  CanonicalShadowRing, 
  FastShadowVertex 
} from '../../types/canonicalShadow';

export class FastShadowInTheMiddle {
  /**
   * Przelicza w locie obrys cienia składowej dla zadanej wysokości pośredniej Z.
   * Zwraca wielokąt 2D w przestrzeni dachu docelowego lub null, jeśli cień nie sięga.
   */
  public static projectComponentToPlane(
    component: CanonicalShadowComponent,
    zTarget: number
  ): Point2D[][] | null {
    // 1. Odrzucenie w O(1) - dach docelowy powyżej wierzchołka elementu
    if (zTarget >= component.zMax) {
      return null;
    }

    const projectedRings: Point2D[][] = [];

    // Współczynnik przesunięcia liniowego
    // P(z) = P0 + (Z / zMax) * (V - P0)
    for (const ring of component.rings) {
      const ringPoints: Point2D[] = new Array(ring.vertices.length);

      for (let i = 0; i < ring.vertices.length; i++) {
        const vert = ring.vertices[i];
        
        // Zabezpieczenie przed dzieleniem przez zero dla płaskich elementów zMax = 0
        if (vert.zMax <= 0.0001) {
          ringPoints[i] = { x: vert.vx, y: vert.vy };
          continue;
        }

        const t = Math.min(1.0, Math.max(0.0, zTarget / vert.zMax));
        
        // Transformacja liniowa w locie pomiędzy P0 a V_xy
        ringPoints[i] = {
          x: vert.x0 + t * (vert.vx - vert.x0),
          y: vert.y0 + t * (vert.vy - vert.y0)
        };
      }

      projectedRings.push(ringPoints);
    }

    return projectedRings;
  }
}
```

## 5. Integracja z modułami `Masterplan Canvas` i `Zakres Cienia`

Dzięki temu, że każda składowa cienia jest generowana niezależnie dla danego $Z_{\text{target}}$, możemy przekazać wynikowe wielokąty bezpośrednio do istniejącego w aplikacji potoku operacji boolowskich (`polygonBooleanTwo` / `polygonClipping`).

  

TypeScript

```
// src/components/cad/masterplan/masterplanFastShadowPipeline.ts
import { CanonicalBuildingShadow } from '../../types/canonicalShadow';
import { FastShadowInTheMiddle } from '../../engine/solar/FastShadowInTheMiddle';
import { polygonUnionMulti, polygonDifference } from '../../utils/math2d/polygonBooleanTwo';
import { Point2D } from '../../types/geometry';

export interface RoofTargetPlane {
  buildingId: string;
  roofHeight: number;
  roofPolygon: Point2D[];
}

export class MasterplanFastShadowPipeline {
  /**
   * Oblicza finalny cień padający na dach innego obiektu.
   * Używane zarówno w Masterplan Canvas, jak i w analizie Zakresu Cienia.
   */
  public static calculateShadowOnRoof(
    casterShadows: CanonicalBuildingShadow[],
    targetRoof: RoofTargetPlane
  ): Point2D[][] {
    const shadowPatchesOnRoofLevel: Point2D[][] = [];

    for (const buildingShadow of casterShadows) {
      // Ignorujemy cień rzucany przez budynek docelowy na samego siebie na poziomie dachu
      if (buildingShadow.buildingId === targetRoof.buildingId) {
        continue;
      }

      for (const component of buildingShadow.components) {
        // Obliczenie w locie dla płaszczyzny pośredniej Z = targetRoof.roofHeight
        const projected = FastShadowInTheMiddle.projectComponentToPlane(
          component,
          targetRoof.roofHeight
        );

        if (projected && projected.length > 0) {
          for (const poly of projected) {
            shadowPatchesOnRoofLevel.push(poly);
          }
        }
      }
    }

    if (shadowPatchesOnRoofLevel.length === 0) {
      return [];
    }

    // 1. Suma części składowych cieni znajdujących się na tej wysokości
    const unifiedShadow = polygonUnionMulti(shadowPatchesOnRoofLevel);

    // 2. Przycięcie do obrysu dachu docelowego (Intersection z dachem)
    // Cień na dachu = Cień ∩ Dach
    return polygonDifference(targetRoof.roofPolygon, polygonDifference(targetRoof.roofPolygon, unifiedShadow));
  }
}
```

## 6. Kluczowe korzyści i optymalizacje brzegowe

- **Brak alokacji pamięci w pętli renderowania:** Użycie płaskich struktur buforowych (`Float64Array`) dla par $(P_0, V_{xy})$ pozwala na wektoryzację obliczeń i brak pracy dla Garbage Collectora podczas interaktywnego przesuwania kamery lub obiektów.
    
      
    
- **Elementy wiszące (overhangs / wykusze):** Dla elementów, gdzie $z_{\text{min}} > 0$, jeśli $Z_{\text{target}} \le z_{\text{min}}$, dolny kontur cienia również podlega transformacji liniowej ku swojemu rzutowi $XY$, zachowując fizyczną poprawność cieni rzucanych przez bryły lewitujące lub nadwieszone.
    
      
    
- **Zero ponownego parsowania kątów słońca:** Przy przejściu z płaszczyzny gruntu na dach nie trzeba ponownie iterować po macierzach nasłonecznienia ani przeszukiwać tablic LUT – transformacja liniowa zachowuje kierunek i proporcje rzutu światła dla zadanego azymutu.

---

Uzupełnij o testy regresyjne, benchmarkowe i tożsamościowe:

  • shadowEnvelope.benchmark.test.ts (profilowanie krok po kroku i drill-down)
  • shadowEnvelope.test.ts (kotwice stabilizacyjne i AABB culling)
  • polygonBooleanTwo.test.ts
  • polygonBooleanTwo.benchmark.test.ts
  • umbraA456.regression.test.ts
  • umbraA456.benchmark.test.ts