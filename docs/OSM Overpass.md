Kod:

`@/src/modules/wfs-import/services/osm/osmBuildingsClient.ts`

---

# Algorytm usi-light

1. Podzielić obszar na kwadranty po 300x300 lub 400x400m każdy ze 100m zakładem
2. Sprawdzic kompletnosc, deduplikowac, pobrac ponownie kwadranty ktore sie nie pobrały, ewentualnie fallback na mirror
3. Wysłać zoptymalizowane zapytanie na serwer overpass odpytujące o budynki z minimalizacją payloadu (`out tags geom qt;`):

```
[out:json][timeout:25];
// Zastąp współrzędne własnymi: (min_lat, min_lon, max_lat, max_lon)
(
  way["building"](52.251,20.995,52.256,20.999);
  relation["building"]["type"="multipolygon"](52.251,20.995,52.256,20.999);
);
out tags geom qt;
```

4. Dla każdego odebranego budynku odpytać serwer overpass o `building:part` według jego ID z buforem `nwr(around:10)["building:part"]`, aby nie gubić wież, kopuł i wycofanych kondygnacji.
5. Sprawdzić kompletność budynku i building parts (relacje 3D, węzły, runda naprawcza recovery).
6. Zbudować obiekty, wieloelementowe obiekty łączyć w jeden obiekt logiczny (`groupId`) po geometrycznym odrzuceniu obwiedni (envelope) i wyodrębnieniu dziedzińców (holes).

---

Aby pobrać budynki z OpenStreetMap za pomocą Overpass API w TypeScript, możesz użyć natywnej funkcji `fetch` lub dedykowanej biblioteki, takiej jak [`overpass-ts`](https://github.com/1papaya/overpass-ts). [1]

Poniżej znajdziesz kompletne, typowane rozwiązanie wykorzystujące czysty `fetch`, które pobiera budynki na podstawie Bounding Boxa (współrzędnych obszaru) i zwraca je w formacie JSON. [2, 3]

## 1. Definicje typów TypeScript dla Overpass JSON

OSM zwraca dane w określonej strukturze. Odpowiednie otypowanie wyników pozwala na bezpieczną pracę z właściwościami budynków.

```typescript
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: {
    building?: string;
    name?: string;
    'addr:street'?: string;
    'addr:housenumber'?: string;
    [key: string]: string | undefined;
  };
}

export interface OverpassResponse {
  version: number;
  generator: string;
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: OverpassElement[];
}
```

## 2. Kod pobierania budynków

Poniższa funkcja wysyła zapytanie w języku Overpass QL. Zapytanie pobiera obiekty typu `way` oraz `relation` oznaczone tagiem `building=*` w zadanym obszarze, a instrukcja `out geom;` dba o to, aby serwer zwrócił pełną geometrię (współrzędne) punktów składowych. [4, 5]

```typescript
/**
 * Pobiera budynki z Overpass API dla podanego obszaru (Bounding Box)
 * @param south Minimalna szerokość geograficzna (min lat)
 * @param west Minimalna długość geograficzna (min lon)
 * @param north Maksymalna szerokość geograficzna (max lat)
 * @param east Maksymalna długość geograficzna (max lon)
 */
async function fetchBuildingsInBBox(
  south: number,
  west: number,
  north: number,
  east: number
): Promise<OverpassResponse> {
  // Publiczny endpoint Overpass API
  const endpoint = 'https://overpass-api.de';

  // Zapytanie Overpass QL: wyszukuje budynki typu way i relation w bboxie
  const query = `
    [out:json][timeout:25];
    (
      way["building"](${south},${west},${north},${east});
      relation["building"](${south},${west},${north},${east});
    );
    out geom;
  `;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ data: query }),
  });

  if (!response.ok) {
    throw new Error(`Błąd Overpass API: ${response.status} ${response.statusText}`);
  }

  const data: OverpassResponse = await response.json();
  return data;
}
```

## 3. Przykład użycia

Współrzędne w przykładzie odpowiadają wycinkowi centrum Warszawy:

```typescript
async function main() {
  try {
    console.log('Pobieranie danych o budynkach...');
    // Przykładowy Bounding Box (okolice PKiN w Warszawie)
    const data = await fetchBuildingsInBBox(52.228, 21.000, 52.232, 21.010);

    console.log(`Znaleziono obiektów: ${data.elements.length}`);

    // Filtrowanie i wyświetlanie pobranych budynków
    data.elements.forEach((element) => {
      if (element.tags) {
        const name = element.tags.name || 'Brak nazwy';
        const type = element.tags.building;
        const street = element.tags['addr:street'] || '';
        const houseNumber = element.tags['addr:housenumber'] || '';

        console.log(`- [${element.type} ${element.id}] ${name} (${type}) - Adres: ${street} ${houseNumber}`);
      }
    });
  } catch (error) {
    console.error('Wystąpił błąd podczas pobierania danych:', error);
  }
}

main();
```

## Alternatywa za pomocą dedykowanej biblioteki

Jeśli wolisz gotowe rozwiązanie zamiast pisać surowy `fetch`, zainstaluj paczkę npm `overpass-ts`: [1]

```bash
npm install overpass-ts
```

Umożliwia ona wykonywanie zapytań poprzez prostą funkcję `overpass()`, która automatycznie obsługuje m.in. ponowne próby w przypadku przekroczenia limitów zapytań (błędy HTTP 409/504). [1]

---

  

[1] [https://github.com](https://github.com/1papaya/overpass-ts)

[2] [https://stackoverflow.com](https://stackoverflow.com/questions/31795115/query-overpass-api-for-highways-and-corresponding-nodes)

[3] [https://dev.to](https://dev.to/toodaniels/how-to-get-streets-data-using-overpass-api-2b2g)

[4] [https://wiki.openstreetmap.org](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)

[5] [https://www.npmjs.com](https://www.npmjs.com/package/overpass-frontend)