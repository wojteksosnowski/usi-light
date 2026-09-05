# Design System & Tokeny Wizualne USI Light 2.5D

Dokument stanowi skodyfikowane źródło prawdy (Single Source of Truth) dla architektury wizualnej, tokenów projektowych, typografii, kolorystyki oraz wytycznych implementacyjnych aplikacji **USI Light 2.5D**.

---

## 1. Architektura Barw i Tokeny (Color Tokens)

### 1.1. Podstawowa Paleta UI (Zmienne CSS w `:root`)
Zdefiniowane w [`src/index.css`](file:///Volumes/Samsam/py/usi-light/src/index.css):

| Zmienna CSS | Wartość HEX | Zastosowanie / Rola |
| :--- | :--- | :--- |
| `--bg-main` | `#020617` (Slate 950) | Główne tło aplikacji i obszaru roboczego CAD |
| `--bg-sidebar` | `#0b1329` (Deep Navy) | Tło lewego panelu bocznego (Sidebar) |
| `--bg-card` | `#131d38` (Navy Surface) | Tło kart narzędziowych (`.ui-card`) i paneli |
| `--bg-input` | `#060b18` (Dark Input) | Tło pól tekstowych, inputów i nieaktywnych kafli |
| `--border-color` | `#1e293b` (Slate 800) | Podstawowe obramowania kontenerów, separatorów |
| `--border-light` | `#334155` (Slate 700) | Obramowania pływających nakładek (HUD, Toolbar, Inspector) |
| `--text-primary` | `#f8fafc` (Slate 50) | Główny tekst, nagłówki, wartości kluczowe |
| `--text-secondary` | `#94a3b8` (Slate 400) | Podtytuły, etykiety pól, nieaktywne ikony |
| `--text-muted` | `#64748b` (Slate 500) | Opisy pomocnicze, stopki, wskazówki |
| `--accent-blue` | `#3b82f6` (Blue 500) | Akcent podstawowy, linki, wypełnienia selekcji |
| `--accent-indigo` | `#6366f1` (Indigo 500) | Przycisk główny (gradient start), wektory normalne |
| `--accent-emerald` | `#10b981` (Emerald 500) | Zgodność § 12, sukces, punkty końcowe snap (Endpoint) |
| `--accent-amber` | `#f59e0b` (Amber 500) | Nasłonecznienie § 56, ostrzeżenia, statystyki OTRACK |
| `--accent-rose` | `#f43f5e` (Rose 500) | Niezgodność § 12, błędy, przecięcia OSNAP |

### 1.2. Pływające Powierzchnie Szklane (Glassmorphism Surfaces)
Pływające panele nad rzutem CAD wykorzystują efekt rozmycia tła:
- **Tło nakładek HUD / Toolbar**: `rgba(11, 19, 41, 0.92)` z `backdrop-filter: blur(12px)`
- **Tło modalu inspektora punktu**: `rgba(11, 19, 41, 0.95)` z `backdrop-filter: blur(16px)`
- **Obramowanie**: `1px solid var(--border-light)` (`#334155`)
- **Cienie**: `box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5)`

---

## 2. Paleta Silnika CAD Canvas 2.5D

Zdefiniowane w [`src/config/appConfig.ts`](file:///Volumes/Samsam/py/usi-light/src/config/appConfig.ts) (`APP_CONFIG`):

### 2.1. Kolory Obiektów i Geometrii CAD (`APP_CONFIG.cad`)
- **Siatka bazowa (`gridColor`)**: `#1e293b`
- **Wybór/Zaznaczenie (`selectionColor`)**: `#38bdf8`
- **Podświetlenie pod kursorem (`hoverColor`)**: `#fbbf24`
- **Budynek badany (`testedBuildingFill`)**: `rgba(59, 130, 246, 0.16)` (selekcja: `rgba(59, 130, 246, 0.30)`)
- **Budynek przesłaniający (`obstacleBuildingFill`)**: `rgba(71, 85, 105, 0.18)` (selekcja: `rgba(148, 163, 184, 0.28)`)

### 2.2. Pasma Analityczne na Fasadach (`APP_CONFIG.analysisBands`)
- **Przesłanianie § 12 (Pasmo wewnętrzne)**:
  - Zgodny: `rgba(16, 185, 129, alpha)` (domyślna alpha = 0.65)
  - Niezgodny: `rgba(244, 63, 94, alpha)`
- **Nasłonecznienie § 56 (Pasmo zewnętrzne, skala 30-minutowa)**:
  - `< 0.5h`: `rgba(59, 7, 100, alpha)` (głęboki fiolet)
  - `< 1.0h`: `rgba(88, 28, 135, alpha)`
  - `< 1.5h`: `rgba(126, 34, 206, alpha)`
  - `< 2.0h`: `rgba(168, 85, 247, alpha)`
  - `< 2.5h`: `rgba(192, 38, 211, alpha)`
  - `< 3.0h`: `rgba(225, 29, 72, alpha)` (czerwień - na progu normy)
  - `< 3.5h`: `rgba(234, 88, 12, alpha)` (pomarańcz)
  - `< 4.0h`: `rgba(249, 115, 22, alpha)`
  - `>= 4.0h`: `rgba(251, 191, 36, alpha)` (złoty słoneczny)

### 2.3. System Snapowania i Prowadnic (`APP_CONFIG.osnap` / `directionSnapping`)
- **Endpoint (Koniec ściany)**: `#10b981` (Zielony kwadrat)
- **Midpoint (Środek ściany)**: `#06b6d4` (Cyjanowy trójkąt)
- **Intersection (Przecięcie)**: `#f43f5e` (Różowy X)
- **Nearest / Extension**: `#38bdf8` (Błękitny)
- **Prowadnice statystyczne / Ortho**: `#f59e0b` (Bursztynowa linia przerywana `[8, 4]`)
- **Prowadnice krawędzi ściany**: `#38bdf8` (Błękitna linia przerywana `[5, 4]`)
- **Blokada kolinearna (Collinear Lock)**: `#a855f7` (Fioletowa)

---

## 3. Typografia i Hierarchia Tekstu

- **Font Family**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif`
- **Nagłówki grup paska bocznego (`.sidebar-group-title`)**: `font-size: 11px`, `font-weight: 700`, `letter-spacing: 0.06em`, `text-transform: uppercase`, kolor `var(--text-secondary)` (`#94a3b8`), hover `var(--text-primary)` (`#f1f5f9`).
- **Tytuły kart (`.ui-title`)**: `font-size: 11px`, `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: 0.05em`, kolor `var(--text-secondary)`.
- **Etykiety danych / Wartości standardowe**: `font-size: 12px` - `13px`, `font-weight: 500` - `600`.
- **Tekst pomocniczy / stopka**: `font-size: 11px`, kolor `var(--text-muted)`.

---

## 4. Komponenty i Wzorce UI

### 4.1. Przyciski
1. **Główna akcja (`.btn-primary`)**:
   - Tło: `linear-gradient(135deg, var(--accent-indigo), var(--accent-blue))`
   - Tekst: `#ffffff`, `font-weight: 600`, `font-size: 13px`
   - Zaokrąglenie: `border-radius: 12px`
   - Cień: `0 4px 14px rgba(99, 102, 241, 0.35)`
2. **Akcja drugorzędna (`.btn-secondary`)**:
   - Tło: `rgba(19, 29, 56, 0.8)`, hover: `var(--border-color)`
   - Obramowanie: `1px solid var(--border-light)`
   - Zaokrąglenie: `border-radius: 12px`, `font-size: 12px`
3. **Kafle przełączników warstw (`.btn-tile`)**:
   - Zaokrąglenie: `border-radius: 8px`, `font-size: 11.5px`
   - Stan nieaktywny (`.inactive`): tło `rgba(6, 11, 24, 0.6)`, obramowanie `var(--border-color)`, kolor `var(--text-secondary)`
   - Stan aktywny emerald (`.active-emerald`): tło `rgba(16, 185, 129, 0.15)`, ramka `rgba(16, 185, 129, 0.4)`, tekst `#6ee7b7`
   - Stan aktywny amber (`.active-amber`): tło `rgba(245, 158, 11, 0.15)`, ramka `rgba(245, 158, 11, 0.4)`, tekst `#fcd34d`
   - Stan aktywny indigo (`.active-indigo`): tło `rgba(99, 102, 241, 0.15)`, ramka `rgba(99, 102, 241, 0.4)`, tekst `#a5b4fc`

### 4.2. Promienie Zaokrągleń (Border Radius Scale)
- **Tagi / Małe badge**: `border-radius: 4px` - `6px`
- **Kafle / Przyciski narzędziowe / Wejścia**: `border-radius: 8px`
- **Paski narzędziowe (Toolbar)**: `border-radius: 10px`
- **Karty UI (`.ui-card`) / Przyciski główne**: `border-radius: 12px`
- **Pływające paski dolne (Legenda)**: `border-radius: 14px`
- **Pływający HUD górny**: `border-radius: 16px`
- **Modale / Inspektor punktu (`.inspector-card`)**: `border-radius: 18px`

---

## 5. Zidentyfikowane Rozbieżności i Procedura Obsługi

### 5.1. Aktualne niespójności w kodzie (Do uporządkowania)
1. **Hardcodowane `#fff` lub `#ffffff` w stylach inline JSX** zamiast `var(--text-primary)` lub dedykowanej klasy.
2. **Ręczne wartości paddingów/marginesów** w niektórych podkomponentach zamiast standardowych odstępów (4px, 8px, 12px, 16px).
3. **Mieszanie styli inline ze stylami klasowymi** w nagłówkach i przyciskach HUD.

### 5.2. Procedura Dopytywania przy Wątpliwościach
> [!IMPORTANT]
> Jeżeli podczas tworzenia lub refaktoryzacji widoku natrafisz na:
> - Brakujący kolor lub token dla nowego stanu/komponentu,
> - Sprzeczność między `layout_specification.md` a istniejącymi klasami w `index.css`,
> - Zapotrzebowanie na nietypowy wymiar lub nowy wariant przycisku,
>
> **NIE zgaduj i NIE twórz styli ad-hoc.** Należy zadać pytanie użytkownikowi lub zgłosić rozbieżność w celu uzupełnienia niniejszego pliku Design Systemu.
