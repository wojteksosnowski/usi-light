## Specyfikacja Techniczna: Udostępnianie Projektów (Upstash Redis + Vercel)

### 1. Architektura i Przepływ Danych

System działa w modelu bezstanowym po stronie frontendu, wykorzystując Upstash Redis jako szybki magazyn klucz-wartość z automatycznym czasem życia (TTL) rekordów wynoszącym dokładnie 14 dni.

  

```
[Klient: Edytor] 
   │ 1. Ekstrakcja stanu ze store'ów (Scene, Solar, Viewport)
   │ 2. Serializacja do JSON + kompresja (fflate / gzip)
   ▼
[Vercel Serverless: POST /api/share]
   │ 3. Walidacja wielkości i Rate Limit (IP cooldown)
   │ 4. Zapis do Upstash Redis: SET project:{nanoId} [dane] EX 1209600
   ▼
[Klient: Zwrot linku https://app.pl/p/:id]

---

[Odbiorca: Link /p/:id]
   │ 1. GET /api/share?id=:id -> Upstash Redis GET project:{id}
   │ 2. Dekompresja w locie (klient)
   │ 3. Wstrzyknięcie do store'a w trybie Read-Only (Prezentacja)
   ▼
[Akcja: Kliknięcie "Edytuj / Fork"]
   │ 4. Kopiowanie stanu do roboczego localStorage
   ▼
[Przejście do pełnego edytora z zachowaniem geometrii]
```

### 2. Schema Danych Projektu (Payload Contract)

Payload zawiera wyłącznie matematyczny i konfiguracyjny opis sceny bez ciężkich plików binarnych.

  

TypeScript

```
export interface SharedProjectPayload {
  v: 1; // wersja schematu pod przyszłe migracje
  createdAt: number;
  metadata: {
    name?: string;
    northAngleDeg: number;
  };
  // Stan rzutni i podkładu
  viewport: {
    center: [number, number]; // [lat, lng]
    zoom: number;
    rotation: number;
  };
  // Parametry analizy nasłonecznienia (§ 13 / § 60 WT)
  solar: {
    analysisType: 'SECTION_13' | 'SECTION_60';
    date: string; // ISO date string (domyślnie równonoc 21 marca)
    timeOfDayMinutes?: number; // do zatrzymania suwaka na konkretnej minucie
    latitude: number;
    longitude: number;
  };
  // Warstwy, obiekty i modyfikatory
  scene: {
    buildings: Array<{
      id: string;
      name: string;
      vertices: Array<{ x: number; y: number }>;
      elevation: number; // rzędna terenu / spodu
      height: number;    // wysokość H budynku
      isAnalyzingPoint?: boolean; // czy to budynek badany
      modifiers?: {
        roofType?: 'FLAT' | 'PITCHED';
        roofAngle?: number;
        parapetHeight?: number; // attyka
        setbackDistance?: number;
      };
    }>;
    analysisPoints?: Array<{
      id: string;
      buildingId: string;
      position: { x: number; y: number; z: number }; // współrzędne okna badanego
      label?: string;
    }>;
  };
}
```

### 3. Konfiguracja Upstash Redis & Bezpieczeństwo

- **Pakiet instalacyjny:** `@upstash/redis` oraz `@upstash/ratelimit`.
    
      
    
- **Zmienne środowiskowe na Vercelu:**
    
      
    - `UPSTASH_REDIS_REST_URL`
        
          
        
    - `UPSTASH_REDIS_REST_TOKEN`
        
          
        
- **Format klucza:** `project:${id}` gdzie `:id` to ciąg generowany za pomocą `nanoid(10)` (np. `k9X2mQ8Lzp`).
    
      
    
- **TTL (Time to Live):** 14 dni = $14 \times 24 \times 60 \times 60 = 1\,209\,600$ sekund. Ustawiane parametrem `ex: 1209600`.
    
      
    
- **Ograniczenie spamu (Cooldown / Rate Limiting):**
    
      
    - Maksymalnie **15 udostępnień na godzinę z jednego IP** przy użyciu `@upstash/ratelimit` z algorytmem `slidingWindow(15, "1 h")`.
        
          
        
    - Blokada wielkości żądania: maksymalny rozmiar skompresowanego body to **200 KB** (co odpowiada nawet kilkuset skomplikowanym bryłom).
        
          
        

### 4. Kompresja i Płytki Transfer

Do kompresji zalecana jest lekka biblioteka `fflate` działająca symetrycznie w przeglądarce i Node.js.

  

- **Eksport (Klient):**
    
      
    1. Serializacja obiektu: `JSON.stringify(payload)`.
        
          
        
    2. Kompresja gzip/deflate do `Uint8Array` za pomocą `fflate.gzipSync`.
        
          
        
    3. Konwersja na ciąg Base64 przed wysłaniem na endpoint.
        
          
        
- **Optymalizacja rozmiaru:** Kompresja JSON o strukturze wektorowej (współrzędne $x, y$) osiąga współczynnik kompresji na poziomie **80–88%**. Typowy projekt o wielkości 150 KB surowego JSON-a zmniejsza się do ok. **18–25 KB**, co drastycznie redukuje opłaty sieciowe i zużycie limitów bazy.
    
      
    

### 5. Implementacja Endpointów API (Vercel Serverless)

#### POST `/api/share` (Tworzenie linku)

TypeScript

```
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { nanoid } from 'nanoid';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const redis = Redis.fromEnv();
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(15, '1 h'),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const { success } = await ratelimit.limit(typeof ip === 'string' ? ip : ip[0]);
  if (!success) {
    return res.status(429).json({ error: 'Zbyt wiele zapytań. Spróbuj ponownie za godzinę.' });
  }

  const { compressedData } = req.body;
  if (!compressedData || typeof compressedData !== 'string') {
    return res.status(400).json({ error: 'Nieprawidłowy format danych.' });
  }

  // Limit wielkości: 250 KB w Base64
  if (compressedData.length > 256 * 1024) {
    return res.status(413).json({ error: 'Projekt jest zbyt duży do udostępnienia.' });
  }

  const shareId = nanoid(10);
  const TTL_SECONDS = 14 * 24 * 60 * 60; // 14 dni

  await redis.set(`project:${shareId}`, compressedData, { ex: TTL_SECONDS });

  return res.status(200).json({ shareId, url: `/p/${shareId}` });
}
```

#### GET `/api/share?id=[shareId]` (Pobieranie projektu)

TypeScript

```
import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const redis = Redis.fromEnv();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Brak ID projektu' });

  const data = await redis.get<string>(`project:${id}`);
  if (!data) {
    return res.status(404).json({ error: 'Projekt wygasł lub nie istnieje.' });
  }

  return res.status(200).json({ compressedData: data });
}
```

### 6. Doświadczenie Odbiorcy (UX & Klonowanie)

- **Rout `/p/:id`:**
    
      
    - Komponent pobiera dane z `/api/share?id=:id`, dekompresuje string Base64 przez `fflate.gunzipSync` i parsuje JSON.
        
          
        
    - Inicjalizuje stan w trybie **Presentation Mode**: ukrywa lewe menu edycji narzędzi i warstw, pokazuje jedynie dolny pasek osi czasu słońca, widok 2D z rzucanym cieniem oraz plakietkę zgodności z przepisami.
        
          
        
- **Akcja „Edytuj projekt” (Fork):**
    
      
    - Zrzuca pobrany stan projektu bezpośrednio do lokalnego store'a `useSceneStore` i `useSolarAnalysisStore`.
        
          
        
    - Usuwa flagę `readOnly`.
        
          
        
    - Przekierowuje użytkownika pod ścieżkę główną `/` z w pełni załadowanym edytorem i geometrią.