# Specyfikacja i Zasady Działania: Tryb Kiosk (Mobile Showcase)

Dokumentacja techniczna, architektoniczna i zasady działania trybu pokazowego **Kiosk / Mobile Showcase** w aplikacji **USI Light**.

---

## 1. Przeznaczenie i Warunki Aktywacji

Tryb Kiosk służy do bezobsługowej, estetycznej prezentacji projektu architektonicznego i nasłonecznienia na urządzeniach mobilnych, ekranach dotykowych oraz w widoku pokazowym dla inwestorów/klientów.

### Warunek uruchomienia:
```typescript
const isKiosk = isMobile || isMobileShowcasePreview;
```
- `isMobile`: automatyczna detekcja urządzeń mobilnych i ekranów dotykowych (`width <= 768px` lub wskaźnik `pointer: coarse`).
- `isMobileShowcasePreview`: flaga podglądu deweloperskiego/prezentacyjnego włączana przyciskiem „Kiosk” w dolnej belce (`CadLegendBottom`) lub karcie narzędzi deweloperskich (`ProjectDevToolsCard`).

---

## 2. Płynna Animacja Słońca (30 FPS)

W tle trybu Kiosk słońce przesuwa się automatycznie po nieboskłonie, symulując pełny dzień nasłonecznienia i rzutowania cieni wielopoziomowych ($\Delta H$):
- **Krok czasowy**: 1 minuta na klatkę.
- **Odstęp między klatkami**: $1/30\text{ sekundy} = 33.33\text{ ms}$ (`intervalMs = 1000 / 30`).
- **Zakres dobowy**: od 7:00 do 17:00 (od $-5\text{h}$ do $+5\text{h}$ względem południa słonecznego); po osiągnięciu 17:00 następuje zapętlenie do 7:00.

---

## 3. Izolacja Wizualna i Środowisko Renderowania

Podczas wejścia w tryb Kiosk następuje automatyczne wyczyszczenie całego interfejsu CAD do minimalistycznego rysunku tuszowego na białym tle:
1. **Tryb 2D**: automatyczne przełączenie rzutni w `viewMode2D = 'masterplan_white'`.
2. **Ukrycie interfejsu (UI)**:
   - Panel boczny (`AppSidebar`) jest całkowicie ukrywany, a stan `isSidebarOpen` ustawiany na `false` (zapisywany stan poprzedni i przywracany na wyjściu).
   - Ukrywane są: górny HUD (`CadTopHud`), pasek narzędzi (`CadToolBar`), kontroler punktu fasady (`ControlPointButton`), dolna legenda (`CadLegendBottom`), inspektory i panele pływające (`FloatingPanelsHost`).
   - Usunięto wszelkie nakładki nagłówkowe (brak elementów `<header>`).
3. **Wyłączenie warstw analitycznych i geodezyjnych**:
   - Wyłączane są: wektory normalnych, linie przesłaniania § 12, promienie słońca § 56, punkty analizy, obwiednie LUT i zakresy cieni, podkłady satelitarne, warstwy WFS/GESUT/BDOT/MPZP/Zieleń/Drzewa oraz grupy OSM Landuse.
   - Wyłączane są aktywne narzędzia kreślarskie, tryb wymiarowania, pędzel projektu i punkty fasad.
   - Odznaczane są wszystkie budynki (`selectedBuildingId = null`, `selectedBuildingIds = []`).
   - Płótno Canvas blokuje przechwytywanie zdarzeń dotykowych/myszy (`pointerEvents: 'none'`, `touchAction: 'none'`).
4. **Wyjście z trybu Kiosk**:
   - Klawisz `Escape` natychmiast wyłącza tryb `isMobileShowcasePreview`.
   - Na zdarzeniu `cleanup` przywracany jest poprzedni stan wszystkich warstw, narzędzi, zaznaczeń, panelu bocznego oraz trybu rzutni (`viewMode2D`).

---

## 4. Rzutnia, Kadrowanie i Zoom (`project_circle_cover`)

### Problem historyczny (wyeliminowany):
Wcześniej fallback kalkulacji szerokości rzutni odejmował 380 px szerokości sidebaru (`window.innerWidth - 380`), co przesuwało środek rzutni w lewo i obcinało widok z lewej strony.

### Zasada działania trybu `project_circle_cover`:
Aby projekt wypełniał cały ekran ($100\text{vw} \times 100\text{vh}$), a okrąg zasięgu projektu (`projectRadius`, promień $r$, średnica $D = 2r$) znalazł się **całkowicie poza obszarem widzenia canvasu**:
1. **Wyznaczenie skali**:
   $$\text{scale} = \frac{\max(\text{width}, \text{height})}{2 \times r}$$
2. **Wyśrodkowanie**:
   $$\text{panX} = \frac{\text{width}}{2}, \quad \text{panY} = \frac{\text{height}}{2}$$
3. **Brak offsetu sidebaru**:
   `useCadViewport.ts` oraz `CadCanvas.tsx` weryfikują `isKiosk = isMobile || isMobileShowcasePreview` i nie odejmują 380 px od szerokości roboczej, korzystając z pełnego `container.clientWidth`.
4. **Automatyczne elastyczne dopasowanie (Auto-Fit & Resize)**:
   Przy zdarzeniach zmiany rozmiaru okna lub obrotu ekranu (`resize`, `orientationchange`) oraz po krótkich opóźnieniach na reflow drzewa DOM (0ms, 60ms, 180ms) rzutnia automatycznie odświeża pozycję i skalę `project_circle_cover`.
