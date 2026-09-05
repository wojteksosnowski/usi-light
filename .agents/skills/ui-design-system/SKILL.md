---
name: ui-design-system
description: Utrzymuje spójność wizualną, czystość kodu wyglądu i zgodność z Design Systemem aplikacji USI Light. Wymusza używanie zdefiniowanych tokenów, zakazuje hardcodowania styli w React i Canvas oraz nakazuje dopytywanie użytkownika w przypadku rozbieżności.
---

# UI Design System & Styling Guidelines (USI Light)

Niniejszy skill definiuje zasady utrzymania spójności wizualnej, czystości kodu wyglądu oraz egzekwowania reguł Design Systemu w projekcie **USI Light 2.5D**.

---

## 1. Główne Źródło Prawdy (Single Source of Truth)

Przed przystąpieniem do jakichkolwiek modyfikacji interfejsu lub tworzenia nowych komponentów, zapoznaj się z poniższymi plikami:

1. **Główny dokument Design Systemu**: [`design-system.md`](file:///Volumes/Samsam/py/usi-light/design-system.md) – skodyfikowane tokeny barw, typografia, promienie zaokrągleń i komponenty bazowe.
2. **Specyfikacja układu i architektury**: [`layout_specification.md`](file:///Volumes/Samsam/py/usi-light/layout_specification.md) – wymiary paneli, siatka, HUD, zachowanie responsywne.
3. **Zmienne i style CSS**: [`src/index.css`](file:///Volumes/Samsam/py/usi-light/src/index.css) – definicje `:root`, klasy przycisków, kart i scrollbara.
4. **Konfiguracja wizualna silnika CAD**: [`src/config/appConfig.ts`](file:///Volumes/Samsam/py/usi-light/src/config/appConfig.ts) – kolory obiektów CAD, pasma analityczne § 12 i § 56, OSNAP i OTRACK.

---

## 2. Kluczowe Zasady i Zakaz Hardcodowania

### 2.1. Warstwa Komponentów React / DOM
- **BEZWZGLĘDNY ZAKAZ** wpisywania stałych kolorów HEX/RGB w stylach inline (`style={{ color: '#ffffff', backgroundColor: '#020617' }}`).
- Używaj wyłącznie tokenów CSS:
  - Zmienne w stylach inline: `style={{ color: 'var(--text-primary)', background: 'var(--bg-card)' }}`
  - Predefiniowane klasy: `.btn-primary`, `.btn-secondary`, `.btn-tile`, `.ui-card`, `.ui-title` z [`src/index.css`](file:///Volumes/Samsam/py/usi-light/src/index.css).
- Stosuj spójną skalę zaokrągleń:
  - Tagi / badge: `4px` - `6px`
  - Przyciski i kafle: `8px` - `12px`
  - Panele i modale: `12px` - `18px`

### 2.2. Warstwa Silnika CAD Canvas 2.5D
- **BEZWZGLĘDNY ZAKAZ** bezpośredniego wpisywania ciągów kolorów w plikach renderujących (np. `ctx.fillStyle = '#38bdf8'`).
- Wszystkie kolory, grubości linii, przezroczystości i style linii przerywanych **muszą** pochodzić ze stałych w [`src/config/appConfig.ts`](file:///Volumes/Samsam/py/usi-light/src/config/appConfig.ts) (`APP_CONFIG.cad.*`, `APP_CONFIG.analysisBands.*`, `APP_CONFIG.directionSnapping.*`, `APP_CONFIG.osnap.*`).

---

## 3. Postępowanie w Przypadku Rozbieżności i Wątpliwości

> [!IMPORTANT]
> **Zasada Dopytywania (Clarify, Don't Guess)**:
> Jeżeli w pliku [`design-system.md`](file:///Volumes/Samsam/py/usi-light/design-system.md) lub w kodzie:
> 1. Brakuje tokenu dla nowego elementu lub stanu,
> 2. Występuje niespójność pomiędzy specyfikacją (`layout_specification.md`) a stylami w `index.css`,
> 3. Zapotrzebowanie wymaga nowego komponentu nieprzewidzianego w dotychczasowej palecie,
>
> **NALEŻY ZAPYTAĆ UŻYTKOWNIKA** i ustalić właściwe rozwiązanie, zamiast wymyślać losowe kolory lub tworzyć style ad-hoc. Po uzyskaniu odpowiedzi zaktualizuj plik [`design-system.md`](file:///Volumes/Samsam/py/usi-light/design-system.md).

---

## 4. Wzorce Kodu: Do's and Don'ts

### Komponenty React (DOM)

❌ **ŹLE (Hardcoded values):**
```tsx
// ❌ Niedozwolone: bezpośrednie kolory hex i losowe zaokrąglenia
<div style={{ background: '#0b1329', color: '#f8fafc', padding: '13px', borderRadius: '7px' }}>
  <button style={{ backgroundColor: '#3b82f6', color: '#fff' }}>Zapisz</button>
</div>
```

✅ **DOBRZE (Tokeny i klasy Design Systemu):**
```tsx
// ✅ Poprawne: użycie klas lub zmiennych z design-system.md
<div className="ui-card">
  <button className="btn-primary">
    Zapisz
  </button>
</div>

// Lub jeśli wymagany jest inline style ze zmienną:
<div style={{ background: 'var(--bg-sidebar)', color: 'var(--text-primary)', borderRadius: '12px' }}>
  ...
</div>
```

---

### Renderery Canvas 2.5D

❌ **ŹLE (Hardcoded colors in Canvas):**
```ts
// ❌ Niedozwolone: wpisywanie koloru bezpośrednio w pętli renderującej
ctx.strokeStyle = '#38bdf8';
ctx.fillStyle = 'rgba(59, 130, 246, 0.16)';
ctx.stroke();
```

✅ **DOBRZE (Użycie APP_CONFIG):**
```ts
import { APP_CONFIG } from '../../config/appConfig';

// ✅ Poprawne: odwołanie do centralnej konfiguracji wizualnej
ctx.strokeStyle = APP_CONFIG.cad.selectionColor;
ctx.fillStyle = APP_CONFIG.cad.testedBuildingFill;
ctx.stroke();
```

---

## 5. Procedura Dodawania Nowych Stylów

1. Sprawdź, czy odpowiedni token istnieje w [`design-system.md`](file:///Volumes/Samsam/py/usi-light/design-system.md).
2. Jeśli nie istnieje:
   - Dopytaj użytkownika o preferowany wariant, lub
   - Zdefiniuj nową zmienną w `:root` w [`src/index.css`](file:///Volumes/Samsam/py/usi-light/src/index.css) (dla UI) lub w `APP_CONFIG` w [`src/config/appConfig.ts`](file:///Volumes/Samsam/py/usi-light/src/config/appConfig.ts) (dla Canvas).
   - Zaktualizuj [`design-system.md`](file:///Volumes/Samsam/py/usi-light/design-system.md).
3. Użyj nowo zdefiniowanego tokenu w komponencie.

---

## 6. Lista Kontrolna Przed Zakończeniem Prac (Self-Review Checklist)

- [ ] Czy wszystkie kolory tekstu, tła i obramowań korzystają ze zmiennych `var(--...)` lub klas CSS?
- [ ] Czy wyeliminowano wszystkie hardcodowane wartości `#hex` i `rgb(...)` z plików JSX/TSX?
- [ ] Czy wszystkie moduły rysujące Canvas korzystają ze stałych `APP_CONFIG`?
- [ ] Czy zachowano standardowe zaokrąglenia i hierarchię typograficzną?
- [ ] Czy w przypadku jakichkolwiek wątpliwości skonsultowano się z użytkownikiem i zaktualizowano `design-system.md`?
