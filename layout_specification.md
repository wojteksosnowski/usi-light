# Projekt Interfejsu i Architektura Wizualna USI Light 2.5D

Dokument ten precyzuje konstrukcję, hierarchię bloków oraz dokładne wymiary i zachowanie poszczególnych elementów interfejsu aplikacji webowej.

---

## 1. Podstawowa Konstrukcja i Układ Ekranu (Layout 100vw x 100vh)

Aplikacja oparta jest na nowoczesnym, pełnoekranowym układzie dwukolumnowym typu **Studio CAD / Pro Desktop App**:

```
+-------------------------------------------------------------------------------------------------------+
|  [ LEWY PANEL BOCZNY - 380px ]   |  [ GŁÓWNY OBSZAR CAD - Reszta Szerokości (Flex: 1, 100% Wysokości) ] |
|----------------------------------|--------------------------------------------------------------------|
|  1. Nagłówek aplikacji (64px)     |  [ Pływający HUD / Toolbar - góra rzutu: Szybkie statystyki & warstwy]
|  2. Zbiorczy Bilans Zgodności    |                                                                    |
|     (Karty § 12 i § 56, słupki)   |  [ WŁAŚCIWY OBSZAR RZUTU CAD 2.5D (Canvas) ]                       |
|  3. Kafelkowe przełączniki       |  - Siatka CAD modularna (linie co 1m i 5m)                         |
|     warstw i normalnych fasad    |  - Geometria budynków (wypełnienia, obrysy, etykiety)              |
|  4. Karta edycji obiektu 2.5D    |  - Linie przesłaniania § 12 (zielone/czerwone punkty)              |
|     (H_top, Parapet, Śródmieście)|  - Pas gradientowy nasłonecznienia § 56 (kolorowy offset)          |
|  5. Przyciski akcji CAD          |                                                                    |
|     (Wgraj DXF, Reset modelu)    |  [ Pływający Inspektor Punktu - prawy górny róg rzutu ]            |
|  6. Stopka ze wskazówką          |  [ Legenda kolorów - lewy dolny róg rzutu ]                        |
+-------------------------------------------------------------------------------------------------------+
```

---

## 2. Orientacyjne Wielkości i Parametry Elementów

| Element | Wymiary / Położenie | Opis i Styl |
| :--- | :--- | :--- |
| **Główny Widok CAD (`CadCanvas`)** | **Szerokość: 100% pozostałej przestrzeni (np. 1500–2100px), Wysokość: 100vh** | Ciemne tło `#020617`, dynamiczny viewport z pan & zoom, obsługa HiDPI (DPR). |
| **Lewy Panel Narzędziowy** | **Szerokość: stała 380px, Wysokość: 100vh** (z możliwością zwinięcia do 0px) | Półprzezroczysty ciemny panel (`#090d16` / `slate-900`) z pionowym paskiem przewijania. |
| **Pływający HUD (Góra)** | **Pozycja: `top: 16px, left: 16px`, Wysokość: 44px** | Kapsuła z szybkim podsumowaniem procentowym (§ 12: XX%, § 56: YY%) oraz skrótami włączania warstw. |
| **Inspektor Punktu Fasady** | **Pozycja: `top: 16px, right: 16px`, Szerokość: 380px, Wysokość: max 85vh** | Karta wyświetlająca wykres osi nasłonecznienia minuta po minucie oraz diagram kątów wolnych w § 12. |
| **Pasek Legendy** | **Pozycja: `bottom: 16px, left: 16px`, Wysokość: 38px** | Kompaktowy panel wyjaśniający kody kolorystyczne (zielony, żółty, czerwony). |

---

## 3. Elementy Klikalne i Przyciski Aktywne

1. **Przełączniki Warstw Analitycznych**:
   - Przesłanianie § 12 (Wewnętrzny obrys) – Przycisk kafelkowy z podświetleniem szmaragdowym.
   - Nasłonecznienie § 56 (Zewnętrzny pas) – Przycisk kafelkowy z podświetleniem bursztynowym.
   - Wektory normalne fasad – Przycisk z podświetleniem indygo.
2. **Przełączniki Statusu Budynku**:
   - Obiekt badany / projektowany (`TAK / NIE`).
   - Zabudowa śródmiejska wg § 12 ust. 5 (`TAK / NIE`).
3. **Akcje Główne**:
   - Duży przycisk *Wgraj własny plik DXF* (z gradientem indygo-niebieskim).
   - Przycisk *Załaduj scenę wzorcową* (przywrócenie demonstracyjnego układu 3 budynków).
4. **Interakcja z Rzutem CAD**:
   - **LPM na budynku + przeciąganie**: natychmiastowe przesuwanie bryły z dynamicznym przeliczaniem analizy w czasie rzeczywistym.
   - **LPM na wolnym tle + przeciąganie**: przesuwanie widoku (*Pan*).
   - **Kółko myszy**: płynne przybliżanie i oddalanie (*Zoom* od 3px/m do 100px/m).
   - **Kliknięcie w punkt pomiarowy na fasadzie**: otwarcie szczegółowego modalu analitycznego.
