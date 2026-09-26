Diagnoza zgłoszenia użytkownika: migotanie cienia na dachu w Canvas Masterplan
(budynek `WFS 146510_8.0501.115_BUD`, scena `reference/speed/war-geo.json`).

Stan na 2026-09-26: przyczyna zdiagnozowana i zweryfikowana testami, produkcyjny
kod NIE został zmieniony (próba naprawy w warstwie cache'u została wypróbowana
i świadomie cofnięta — patrz sekcja "Ślepy zaułek" niżej). `masterplanRoofFlicker.test.ts`
zawiera teraz celowo failing test dokumentujący błąd do czasu właściwej naprawy.

---

## Objaw

Użytkownik zgłosił, że w trybie Canvas Masterplan cień na dachu budynku
`146510_8.0501.115_BUD` "znika, pojawia się" (artefakty) przy przeciąganiu suwaka
godziny słońca, konkretnie przy godzinach: `+3:05`, `+5:00`, `+0:30`, `-0:15`, `-0:25`
(offsety względem górowania słońca, format `±HH:MM` z `MasterplanShadowAlgorithmCard.tsx`).
Późniejsza własna analiza użytkownika silnikiem `raycasting` (zamiast `segments`/Linijka)
pokazała ten sam efekt, tylko przy innych godzinach.

## Ślepe zaułki po drodze

1. **Hipoteza: niestabilna wypukłość wielokąta.** Budynek ma 5-wierzchołkowy obrys
   z jednym prawie-zdegenerowanym (prawie współliniowym) wierzchołkiem — iloczyny
   wektorowe kolejnych krawędzi to `[0.64, 138.1, 300.2, 295.4, 160.5]`, więc jeden
   wierzchołek jest 200-450x "słabszy" niż pozostałe. To realna obserwacja, ale
   **nie jest przyczyną** — `isConvex` jest liczone raz z bazowej geometrii
   (`GeometryCompiler.bakeBuilding`) i nie jest przeliczane przy zmianie godziny
   słońca, więc nie może "migać" między klatkami z tego powodu.
2. **Hipoteza: zła metoda słoneczna w teście.** Prawdziwa i naprawiona (patrz niżej),
   ale sama w sobie nie tłumaczyła braku detekcji anomalii w pierwotnym skanie.
3. **Hipoteza: zła rozdzielczość czasowa w teście.** Prawdziwa i naprawiona (patrz
   niżej) — to był kluczowy brakujący element.

## Przyczyna źródłowa

Cień na dachu (`getCachedRoofShadowSamples`, `masterplanShadowCache.ts`) jest
cache'owany kluczem `SunBucketKey` (`makeSunBucketKey`, `src/engine/buildingGeometryCache.ts`),
który **kwantuje `hourFraction` do kroku 5 minut**: `Math.round(hourFraction * 12) / 12`.
To ten sam krok, co suwak godziny słońca (`step = 5 / 60` w `MasterplanShadowAlgorithmCard.tsx`).
Kwantowanie jest świadome i udokumentowane w kodzie jako kompromis "trafienia cache'u
vs. płynność przy przeciąganiu suwaka" — ale jest **dyskretne, bez interpolacji**:
kształt cienia między dwoma sąsiednimi kubełkami zmienia się skokowo, nie płynnie.

Dla większości budynków ta zmiana jest mała i niezauważalna. Dla `146510_8.0501.115_BUD`
krawędź cienia sąsiedniego, wyższego budynku przemiata ten (mały, 298 m²) dach na tyle
szybko względem tempa zmiany azymutu słońca, że pokrycie dachu cieniem potrafi skoczyć
o ~50 punktów procentowych między dwoma sąsiednimi 5-minutowymi krokami — np. `15:00`
93% pokrycia → `15:05` 43% pokrycia. To jest realny, duży, wizualnie oczywisty skok,
nie artefakt pomiaru.

**To NIE jest błąd operacji boolowskich ani wierności geometrii.** Każdy pojedynczy
kubełek jest wewnętrznie poprawny i policzony bez fallbacku do `polygon-clipping`
(zmierzone: 0% fallback dla tego budynku w pełnym przeciągnięciu ±5h). Problem
dotyczy wyłącznie **granulacji cache'u vs. czułości krawędzi cienia** dla tego
konkretnego układu (mały dach blisko wyższego sąsiada).

**Potwierdzone jako niezależne od modelu słonecznego**: użytkownik zaobserwował
identyczny mechanizm przy silniku `raycasting`, tylko przy innych godzinach — zgodne
z oczekiwaniem, bo `raycasting` i `segments` mają różne krzywe azymutu/elewacji, więc
"moment przemiatania krawędzi cienia" wypada u nich o innej godzinie, ale oba silniki
przechodzą przez tę samą warstwę `makeSunBucketKey`.

## Kontrola zasięgu problemu

`getCachedRoofShadowSamples` / `getCachedGroundShadowSamples` są używane WYŁĄCZNIE
przez dwa renderery Masterplanu (`masterplanRoofsRenderer.ts`, `masterplanGroundRenderer.ts`)
— zweryfikowane przez wyszukanie wszystkich wywołań w repo. Silniki analityczne § 12 / § 56
(`shadowEnvelope.ts`, `analysisEngine.ts`) mają **całkowicie osobną ścieżkę obliczeniową**
i nie dotykają tego cache'u. Błąd jest więc odizolowany do warstwy wizualnej Canvas
Masterplan i nie wpływa na wyniki zgodności § 12 / § 56.

Dodatkowo znaleziono (i naprawiono w teście, nie w kodzie produkcyjnym) osobny problem:
`getCachedRoofShadowSamples` ma skrót "singleShadow" — gdy dach ma dokładnie JEDEN
zasłaniający tier, funkcja pomija docinanie CPU (`fastIntersectTwoSimpleLoops`) i zwraca
NIEZDOCINANY kształt cienia zasłaniającego budynku, licząc na to, że renderer i tak
zrobi `ctx.clip('evenodd')` do obrysu dachu przed rysowaniem. To jest bezpieczne dla
renderowania (zweryfikowane: oba wywołania rysujące faktycznie robią `ctx.clip` przed
rysowaniem), ale **niebezpieczne dla każdego kodu, który liczy pole powierzchni z
`.polys` bez ponownego docinania** — w tym oryginalnego testu `masterplanRoofFlicker.test.ts`,
który dawał tam do ~400x zawyżone wartości pola.

## Naprawione testy

`src/components/cad/masterplan/masterplanRoofFlicker.test.ts`:
- Obie sceny (`poz.json`, `war-geo.json`) czytają teraz własne `sunlightMethod` ze sceny
  zamiast mieć zahardkodowane `'raycasting'` (obie w praktyce używają `"segments"`).
- Nowa funkcja `computeClippedPolysArea` docina każdy poligon do obrysu dachu przed
  zsumowaniem pola — poprawia opisany wyżej błąd "singleShadow" w metodologii testu.
- Nowy detektor **bucket-to-bucket jump**: grupuje próbki po ich rzeczywistym
  5-minutowym kubełku (a nie po minucie) i zgłasza skoki pokrycia dachu >25 punktów
  procentowych między sąsiednimi kubełkami — to jest właściwa metodologia dla systemu
  skwantowanego, bo poprzedni detektor "dolina/szczyt" porównywał sąsiednie MINUTY,
  które w większości są identyczne (ten sam kubełek) i nigdy nie widział prawdziwej
  nieciągłości, która występuje wyłącznie NA granicy kubełków.
- Test na `146510_8.0501.115_BUD` teraz **celowo failuje** (`expect(bucketJumps.length).toBe(0)`),
  reprodukując 6 potwierdzonych skoków (do ~70pp) dokładnie w godzinach zgłoszonych
  przez użytkownika. To jest zamierzone — test ma pozostać czerwony, dopóki granulacja
  cache'u nie zostanie naprawiona.
- Test na `poz.json` pozostaje zielony z tymi samymi poprawkami (0 anomalii), co
  potwierdza, że naprawa metodologii testu nie wprowadza fałszywych alarmów.

`src/utils/math2d/umbraA456.benchmark.test.ts`: dodano telemetrię fallbacku
`fastUnionTwoSimpleLoops` na dużych, prawdziwych scenach (`reference/speed/wro.json`,
`reference/speed/poz.json`, 676 i 203 budynki) — zmierzono 0% fallbacku na ścieżce
hierarchicznej unii masterplanu, co przekierowało wcześniejszy trop śledztwa
wydajnościowego (`polygon-clipping.js` ~41% czasu CPU w profilu `wro.json`) z dala
od tej funkcji — realny winowajca to `unionPolygonLoops` (`polygons.ts`), które
fast-pathuje tylko dokładnie 2-elementowe grupy nachodzących się poligonów (osobny,
wciąż otwarty wątek, patrz plan sesji).

## Ślepy zaułek: próba naprawy w warstwie cache'u

Wypróbowano (i cofnięto, `git checkout`) cross-fade między dwoma sąsiednimi kubełkami
bezpośrednio w `masterplanShadowCache.ts` / `getCachedRoofShadowSamples`, sterowany
`performance.now()`: przy zmianie kubełka funkcja miała zwracać przez ~180ms OBIE
warstwy (starą gasnącą + nową narastającą alpha) zamiast podmieniać kształt w jednej
klatce.

**Dlaczego to złe miejsce na naprawę**: `performance.now()`-owy stan przejścia żyjący
wewnątrz współdzielonej funkcji cache'u zakłada, że wywołujący wywołuje ją w tempie
prawdziwej pętli klatek (~16ms/klatkę, zmiana godziny w tempie interakcji człowieka).
Dowolny inny wywołujący — w tym własny test regresyjny tego repo, uruchamiający
setki wywołań na milisekundę podczas przeciągania przez cały zakres godzin — łamie
to założenie: rzeczywisty czas ledwo płynie między wywołaniami, więc "okno przejścia"
nigdy się nie zamyka, przejścia nakładają się na kolejne granice kubełków, a każdy
konsument liczący pole powierzchni z dwóch nałożonych, częściowo przezroczystych
warstw dostaje podwójnie zliczony wynik (zmierzone: pokrycie dachu >100%, regresja
`poz.json` z 0 do 58 fałszywych anomalii).

**Właściwe miejsce naprawy**: warstwa renderująca (`masterplanRoofsRenderer.ts`),
NIE `masterplanShadowCache.ts`. Renderer ma już prawdziwą pętlę klatek z realnymi
deltami czasu — to on powinien trzymać lokalny stan "narysowałem kubełek N w zeszłej
klatce, teraz jest N+1, blenduj przez kolejne kilka realnych klatek", podczas gdy
`getCachedRoofShadowSamples` / `getCachedGroundShadowSamples` powinny nadal zwracać
dokładną, niezblendowaną geometrię danego kubełka — żeby żaden inny konsument
(w tym przyszłe silniki analityczne, testy, eksport) nigdy nie dostał zblendowanego,
podwójnie liczonego wyniku.

## Rekomendacja (niewykonana w tej sesji)

Zaimplementować cross-fade jako stan renderera (`masterplanRoofsRenderer.ts`):
- Przechowywać per-tier `{ ostatniKubełek, ostatniWynik, czasZmianyKlatki }` w
  strukturze lokalnej dla renderera (nie w `masterplanShadowCache.ts`).
- Przy wykryciu zmiany kubełka: rysować przez ~150-200ms obie warstwy z alpha
  ważoną rzeczywistym czasem od zmiany (z realnego zegara pętli renderowania,
  nie z wywołań funkcji cache'u), tak jak w cofniętej próbie — ale WYŁĄCZNIE
  w kodzie rysującym, nigdy w zwracanych danych.
- Upewnić się, że potok renderowania faktycznie zamawia kilka kolejnych klatek
  po zmianie godziny słońca (żeby animacja przejścia miała szansę się dorysować),
  a nie tylko jedną klatkę na żądanie.
- Zweryfikować `masterplanRoofFlicker.test.ts` (blok `146510_8.0501.115_BUD`)
  pozostaje nietknięty jako test na SUROWĄ geometrię (musi nadal wykrywać
  6 skoków — to dokumentuje rzeczywistą nieciągłość danych, cross-fade jest
  kosmetyką rysowania, nie naprawą geometrii) i dodać osobny, renderer-poziomowy
  test/manualną weryfikację wizualną dla samego cross-fade.
