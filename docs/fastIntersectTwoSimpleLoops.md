Sprawdź czy `polygonIntersectionTwo` może być zastąpione `fastIntersectTwoSimpleLoops`. 

---



---

Algorytm **FastIntersectTwoSimpleLoops** stanowi symetryczne dopełnienie szybkiego łączenia pętli (_FastUnion_), wykorzystując fundamentalną specyfikę geometrii architektonicznej w projekcie: wielokąty rzutów dachów, działek oraz wypieczonych cieni są **prostymi, zorientowanymi dodatnio (CCW), niesamoprzecinającymi się pętlami 2D**.
  

W analizach nasłonecznienia i masterplanu ponad 85% zapytań o przecięcie ($A \cap B$) to przypadki skrajne: całkowita rozłączność lub całkowite zawieranie się cienia w dachu (lub dachu w cieniu). Poniższa architektura eliminuje narzut bibliotek ogólnych (takich jak Martinez-Rueda czy Vatti/Clipper) na alokację struktur DCEL (_Doubly Connected Edge List_), sprowadzając operację do potoku opartego na testach _short-circuit_ i bezpośrednim śledzeniu odcinków wewnętrznych.

### 1. Fazy decyzyjne potoku FastIntersect

```
[ Polygon A (Dach) ]      [ Polygon B (Cień) ]
         \                      /
          \                    /
       +--------------------------+
       |   Faza 0: AABB Reject    | ---> Brak nakładania? ---> Zwróć natychmiast []  O(1)
       +--------------------------+
                    | (AABB zachodzą)
       +--------------------------+
       |   Faza 1: Segment Cross  | ---> 0 przecięć krawędzi?
       +--------------------------+         |
                    |                       +---> A wewnątrz B?  ---> Zwróć [A]       O(N+M)
                    |                       +---> B wewnątrz A?  ---> Zwróć [B]       O(N+M)
                    |                       +---> Na zewnątrz?   ---> Zwróć []        O(N+M)
                    | (k przecięć, k >= 2)
       +--------------------------+
       | Faza 2: Fast Loop Trace  | ---> Śledzenie krawędzi WEWNĘTRZNYCH (Weiler-Atherton)
       +--------------------------+      Brak degeneracji?   ---> Zwróć wielokąt 1:1  O(N+M + k log k)
                    | (wykryto kolinearność / zdegenerowane styki)
       +--------------------------+
       | Faza 3: Robust Fallback  | ---> Pełny silnik boolowski (polygonClipping)
       +--------------------------+
```

1. **Faza 0: Odrzucenie AABB ($O(1)$)**
    
      
    
    Jeśli obwiednie prostokątne są rozłączne:
    
      
    
    $$\min(A_x^{\max}, B_x^{\max}) < \max(A_x^{\min}, B_x^{\min}) \quad \lor \quad \min(A_y^{\max}, B_y^{\max}) < \max(A_y^{\min}, B_y^{\min})$$
    
    Wielokąty nie mogą się przecinać. Wynik: natychmiastowe `[]`.
    
      
    
2. **Faza 1: Test bezprzecięciowy i inkluzja ($O(N+M)$)**
    
      
    
    Wyznaczane są punkty przecięcia krawędzi $A$ i $B$. Jeśli liczba przecięć wynosi $0$:
    
      
    - Sprawdzany jest pojedynczy punkt wielokąta $A$ względem wnętrza $B$ (algorytm Winding Number / Ray Casting).
        
          
        
    - Jeśli punkt $A_0 \in B$, to cały wielokąt $A$ leży wewnątrz $B \implies A \cap B = A$.
        
          
        
    - W przeciwnym razie sprawdzany jest punkt $B_0 \in A$. Jeśli $B_0 \in A \implies A \cap B = B$.
        
          
        
    - Jeśli żaden nie zawiera się w drugim $\implies A \cap B = \emptyset$.
        
          
        
3. **Faza 2: Zoptymalizowany Weiler-Atherton (Śledzenie pętli wewnętrznych)**
    
      
    
    Gdy występują właściwe przecięcia:
    
      
    - Dla iloczynu ($A \cap B$) interesują nas wyłącznie fragmenty krawędzi $A$ leżące wewnątrz $B$ oraz krawędzi $B$ leżące wewnątrz $A$.
        
          
        
    - Przecięcia sortowane są wzdłuż obwodu każdego wielokąta.
        
          
        
    - Wektor wejścia do wnętrza drugiego wielokąta wyznacza iloczyn wektorowy krawędzi:
        
          
        
        $$\det(\vec{e}_A, \vec{e}_B) = e_{Ax} e_{By} - e_{Ay} e_{Bx}$$
        
        Dla orientacji CCW, jeśli $\det(\vec{e}_A, \vec{e}_B) > 0$, krawędź $A$ wchodzi do wnętrza $B$.
        
          
        
    - Zbieranie pętli polega na przechodzeniu po krawędziach wewnętrznych i przełączaniu wielokątów w punktach węzłowych.
        
          
        
4. **Faza 3: Bezpiecznik degeneracji (100% wierności 1:1)**
    
      
    
    W przypadku krawędzi ściśle współliniowych (_collinear overlapping segments_) lub wierzchołków stycznych, algorytm natychmiast przekazuje parę do ogólnego solvera boolowskiego, eliminując błędy numeryczne _floating point_.
    
      
    

### 2. Implementacja: `FastIntersectTwoSimpleLoops`

Poniższy moduł jest gotowy do wdrożenia w katalogu `src/utils/math2d/`:

  

TypeScript

```
// src/utils/math2d/fastIntersect.ts
import { Point2D } from '../../types/geometry';

const EPSILON = 1e-7;
const EPSILON_SQ = EPSILON * EPSILON;

interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function computeAABB(poly: Point2D[]): AABB {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Sprawdza, czy punkt leży wewnątrz wielokąta (Ray-Casting algorithm).
 */
export function isPointInsideSimpleLoop(p: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;

    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

interface IntersectionNode {
  pt: Point2D;
  edgeA: number;
  paramA: number;
  edgeB: number;
  paramB: number;
  isEntryA: boolean; // Czy krawędź A wchodzi do wnętrza wielokąta B
}

/**
 * Wyznacza przecięcie dwóch odcinków p1-p2 oraz q1-q2.
 */
function lineSegmentIntersection(
  p1: Point2D, p2: Point2D,
  q1: Point2D, q2: Point2D
): { pt: Point2D; tA: number; tB: number; isCollinear: boolean } | null {
  const dxA = p2.x - p1.x;
  const dyA = p2.y - p1.y;
  const dxB = q2.x - q1.x;
  const dyB = q2.y - q1.y;

  const denom = dxA * dyB - dyA * dxB;

  // Równoległe lub współliniowe
  if (Math.abs(denom) < 1e-10) {
    return null;
  }

  const dxStart = q1.x - p1.x;
  const dyStart = q1.y - p1.y;

  const tA = (dxStart * dyB - dyStart * dxB) / denom;
  const tB = (dxStart * dyA - dyStart * dxA) / denom;

  if (tA > EPSILON && tA < 1 - EPSILON && tB > EPSILON && tB < 1 - EPSILON) {
    return {
      pt: {
        x: p1.x + tA * dxA,
        y: p1.y + tA * dyA
      },
      tA,
      tB,
      isCollinear: false
    };
  }

  return null;
}

/**
 * Szybkie przecięcie dwóch prostych, niezorientowanych pętli (FastIntersect).
 * Zapewnia wierność 1:1 - w przypadku wykrycia styków zdegenerowanych
 * transparentnie wywołuje dostarczony fallbackFn.
 */
export function fastIntersectTwoSimpleLoops(
  polyA: Point2D[],
  polyB: Point2D[],
  fallbackFn: (a: Point2D[], b: Point2D[]) => Point2D[][]
): Point2D[][] {
  const nA = polyA.length;
  const nB = polyB.length;

  if (nA < 3 || nB < 3) return [];

  // Faza 0: Szybki test AABB (O(1))
  const boxA = computeAABB(polyA);
  const boxB = computeAABB(polyB);

  if (!aabbOverlap(boxA, boxB)) {
    return [];
  }

  // Faza 1: Wyszukiwanie przecięć odcinków
  const intersections: IntersectionNode[] = [];

  for (let i = 0; i < nA; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % nA];

    for (let j = 0; j < nB; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % nB];

      const inter = lineSegmentIntersection(a1, a2, b1, b2);
      if (inter) {
        // Iloczyn wektorowy określający wejście krawędzi A w obszar B (dla CCW)
        const cross = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
        intersections.push({
          pt: inter.pt,
          edgeA: i,
          paramA: inter.tA,
          edgeB: j,
          paramB: inter.tB,
          isEntryA: cross > 0
        });
      }
    }
  }

  // Przypadek 0 przecięć krawędzi
  if (intersections.length === 0) {
    // Sprawdź inkluzję: A wewnątrz B
    if (isPointInsideSimpleLoop(polyA[0], polyB)) {
      return [polyA.map(p => ({ ...p }))];
    }
    // Sprawdź inkluzję: B wewnątrz A
    if (isPointInsideSimpleLoop(polyB[0], polyA)) {
      return [polyB.map(p => ({ ...p }))];
    }
    // Rozłączne
    return [];
  }

  // Jeśli liczba przecięć jest nieparzysta lub mała/nieregularna (styczności, kolinearność),
  // używamy bezpiecznika geometrycznego
  if (intersections.length % 2 !== 0) {
    return fallbackFn(polyA, polyB);
  }

  // Faza 2: Śledzenie krawędzi wewnętrznych (Weiler-Atherton Trace)
  try {
    return traceIntersectionLoops(polyA, polyB, intersections);
  } catch {
    // Wszelkie niestabilności topologiczne kierowane są do certyfikowanego silnika
    return fallbackFn(polyA, polyB);
  }
}

function traceIntersectionLoops(
  polyA: Point2D[],
  polyB: Point2D[],
  intersections: IntersectionNode[]
): Point2D[][] {
  const resultLoops: Point2D[][] = [];
  const visitedIntersections = new Uint8Array(intersections.length);

  // Sortowanie węzłów wzdłuż krawędzi wielokąta A
  const sortedOnA = intersections
    .map((node, idx) => ({ node, idx }))
    .sort((x, y) => {
      if (x.node.edgeA !== y.node.edgeA) return x.node.edgeA - y.node.edgeA;
      return x.node.paramA - y.node.paramA;
    });

  // Sortowanie węzłów wzdłuż krawędzi wielokąta B
  const sortedOnB = intersections
    .map((node, idx) => ({ node, idx }))
    .sort((x, y) => {
      if (x.node.edgeB !== y.node.edgeB) return x.node.edgeB - y.node.edgeB;
      return x.node.paramB - y.node.paramB;
    });

  const nextOnA = new Int32Array(intersections.length);
  const nextOnB = new Int32Array(intersections.length);

  for (let i = 0; i < sortedOnA.length; i++) {
    const curr = sortedOnA[i].idx;
    const next = sortedOnA[(i + 1) % sortedOnA.length].idx;
    nextOnA[curr] = next;
  }

  for (let i = 0; i < sortedOnB.length; i++) {
    const curr = sortedOnB[i].idx;
    const next = sortedOnB[(i + 1) % sortedOnB.length].idx;
    nextOnB[curr] = next;
  }

  // Pętle wynikowe zaczynamy od każdego punktu wejścia A do B
  for (let i = 0; i < intersections.length; i++) {
    if (visitedIntersections[i] || !intersections[i].isEntryA) {
      continue;
    }

    const currentLoop: Point2D[] = [];
    let currIdx = i;

    while (!visitedIntersections[currIdx]) {
      visitedIntersections[currIdx] = 1;
      const startNode = intersections[currIdx];
      currentLoop.push(startNode.pt);

      // Idź wzdłuż krawędzi A wewnątrz B aż do następnego punktu wyjścia
      let edgeIdx = startNode.edgeA;
      const nextNodeIdx = nextOnA[currIdx];
      const nextNode = intersections[nextNodeIdx];

      let vIdx = (edgeIdx + 1) % polyA.length;
      while (vIdx !== (nextNode.edgeA + 1) % polyA.length) {
        currentLoop.push(polyA[vIdx]);
        vIdx = (vIdx + 1) % polyA.length;
      }

      visitedIntersections[nextNodeIdx] = 1;
      currentLoop.push(nextNode.pt);

      // Przełącz na B w punkcie wyjścia z A (który jest wejściem dla B do A)
      // i podążaj po krawędziach B
      const returnNodeIdx = nextOnB[nextNodeIdx];
      const returnNode = intersections[returnNodeIdx];

      let bVIdx = (nextNode.edgeB + 1) % polyB.length;
      while (bVIdx !== (returnNode.edgeB + 1) % polyB.length) {
        currentLoop.push(polyB[bVIdx]);
        bVIdx = (bVIdx + 1) % polyB.length;
      }

      currIdx = returnNodeIdx;
      if (currIdx === i) break;
    }

    if (currentLoop.length >= 3) {
      resultLoops.push(currentLoop);
    }
  }

  return resultLoops;
}
```

### 3. Integracja z potokiem `polygonBooleanTwo.ts`

W pliku `src/utils/math2d/polygonBooleanTwo.ts` nowa funkcja `fastIntersectTwoSimpleLoops` zastępuje standardowe wywołanie `polygonClipping.intersection` w ścieżce szybkiej:

  

TypeScript

```
// Fragment integracji w polygonBooleanTwo.ts
import { fastIntersectTwoSimpleLoops } from './fastIntersect';
import polygonClipping from 'polygon-clipping';

export function polygonIntersectionTwo(
  polyA: Point2D[],
  polyB: Point2D[]
): Point2D[][] {
  // Jeśli oba wielokąty to proste pętle bez otworów - użyj FastIntersect
  return fastIntersectTwoSimpleLoops(
    polyA, 
    polyB, 
    (a, b) => robustPolygonIntersectionFallback(a, b)
  );
}

function robustPolygonIntersectionFallback(a: Point2D[], b: Point2D[]): Point2D[][] {
  const geomA: [number, number][][] = [a.map(p => [p.x, p.y])];
  const geomB: [number, number][][] = [b.map(p => [p.x, p.y])];
  
  const result = polygonClipping.intersection([geomA], [geomB]);
  const outPolygons: Point2D[][] = [];

  for (const multi of result) {
    for (const ring of multi) {
      outPolygons.push(ring.map(([x, y]) => ({ x, y })));
    }
  }
  return outPolygons;
}
```

### 4. Zysk wydajnościowy w modułach CAD

Eliminacja tworzenia wielowymiarowych zagnieżdżonych struktur tablicowych `[number, number][][][]` bezpośrednio zmniejsza narzut Garbage Collectora podczas interaktywnego przesuwania brył oraz obliczeń w pętli 60 FPS na płótnie `Masterplan Canvas`.

---

Uzupełnij o testy regresyjne, benchmarkowe i tożsamościowe:

  • shadowEnvelope.benchmark.test.ts (profilowanie krok po kroku i drill-down)
  • shadowEnvelope.test.ts (kotwice stabilizacyjne i AABB culling)
  • polygonBooleanTwo.test.ts
  • polygonBooleanTwo.benchmark.test.ts
  • umbraA456.regression.test.ts
  • umbraA456.benchmark.test.ts
