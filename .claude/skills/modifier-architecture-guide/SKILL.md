---
name: modifier-architecture-guide
description: Definiuje architekturę modyfikatorów 2.5D w USI Light — silnik (dispatch przez rejestr) oraz panel sterujący złożony z generycznych kontrolek zamiast bespoke JSX per typ. Użyj przy dodawaniu nowego typu modyfikatora budynku, edycji BuildingModifiersPanel.tsx / modifierPipeline.ts / modifierRegistry.ts / modifierDescriptors.tsx, dodawaniu przycisku "dodaj modyfikator" w ToolsGroup.tsx lub innym pasku narzędzi, albo gdy panel modyfikatora potrzebuje nowej kontrolki UI.
---

# Architektura modyfikatorów budynku (USI Light 2.5D)

Źródło prawdy: `src/types/modifiers.ts` (typy + fabryki domyślne), `src/engine/modifiers/modifierRegistry.ts` (dispatch silnika), `src/components/modifiers/modifierDescriptors.tsx` (dispatch UI: tytuł/ikona/kolor/pola).

## Kiedy się uruchamia

- Dodawanie nowego typu modyfikatora (`ModifierType`) do budynku.
- Edycja `src/components/modifiers/BuildingModifiersPanel.tsx`, `src/components/modifiers/ModifierCard.tsx`, `src/engine/modifiers/modifierPipeline.ts` lub `modifierRegistry.ts`.
- Dodawanie przycisku "dodaj modyfikator X" w `ToolsGroup.tsx` lub dowolnym innym pasku narzędzi.
- Tworzenie nowej kontrolki formularza w panelu modyfikatora (numeryczne pole, wybór enum, suwak, select).

## Zasady twarde (nie negocjuj, nie omijaj)

1. **Nowy typ modyfikatora = dokładnie 5 zmian, nie więcej**: wpis w unii `Modifier` w `types/modifiers.ts` + funkcja `createDefaultXModifier()` w tym samym pliku + funkcja generatora geometrii w `modifierPipeline.ts` + wpis w `MODIFIER_APPLIERS` (`modifierRegistry.ts`) + wpis w `MODIFIER_DESCRIPTORS` (`modifierDescriptors.tsx`) wraz z nowym `panels/XFields.tsx`.
2. **Zakaz `if/else`/`switch` po `modifier.type`** poza `modifierRegistry.ts` (dispatch silnika) i `modifierDescriptors.tsx` (mapa UI). Nowy warunek gdziekolwiek indziej (panel, toolbar, quick-listy) to regres do God File — użyj `MODIFIER_APPLIERS[type]` / `MODIFIER_DESCRIPTORS[type]` zamiast tego. Jedyny sankcjonowany wyjątek: `applyBuildingModifiers` w `modifierPipeline.ts` filtruje modyfikatory po `type === 'zone_offset'` dla obiektów `category === 'boundary'`, bo to jedyny typ, jaki taki obiekt obsługuje — sama logika mimo to idzie przez `applyModifier`/`MODIFIER_APPLIERS`, nie jest duplikowana.
3. **Panel pól nowego modyfikatora składaj wyłącznie z istniejących generycznych kontrolek** z `src/components/modifiers/controls/` (`LabeledNumberField`, `SegmentedControl`, `LabeledSlider`, `LabeledSelect`) oraz `StoryRangeSelector`. Nowa bespoke JSX w `panels/*Fields.tsx` tylko wtedy, gdy żaden istniejący kształt kontrolki nie pasuje — wtedy najpierw dodaj kolejną generyczną kontrolkę w `controls/`, nie pisz ad-hoc stylowanego JSX inline w pliku pól.
4. **`BuildingModifiersPanel.tsx` nie rośnie z powrotem** — cała logika specyficzna dla typu modyfikatora trafia do `panels/*Fields.tsx` i `modifierDescriptors.tsx`. Panel sam w sobie ma tylko: odczyt store'a, listę `<ModifierCard>` i chrome (`FloatingInspectorCard`, `BuildingIsoPreview`).
5. **Każde miejsce dodające modyfikator do budynku** (panel, `ToolsGroup.tsx`, przyszłe toolbary) wywołuje `MODIFIER_DESCRIPTORS[type].createDefault()` — nigdy nie buduj własnego literału `{ id, type, enabled, ... }`.
6. **Kolory i style wyłącznie przez tokeny `var(--*)`** z `src/index.css` (zob. skill `design-system-guardian`) — brak nowych hardkodowanych hex. Nowy akcent koloru dla typu modyfikatora dopisz jako token (`--accent-*`) w `src/index.css` i w tabeli `design-system.md`.

## Workflow przy dodawaniu nowego modyfikatora

1. **Typ i fabryka** — w `src/types/modifiers.ts` dodaj interfejs rozszerzający `BaseModifier`, dopisz go do unii `Modifier` oraz do `ModifierType`, napisz `createDefaultXModifier()` obok istniejących fabryk.
2. **Generator geometrii** — w `src/engine/modifiers/modifierPipeline.ts` dodaj czystą funkcję `generateXPolygon(...)` operującą na `Point2D[]` (bez zależności od Reacta/store).
3. **Rejestracja w silniku** — w `src/engine/modifiers/modifierRegistry.ts` dodaj wpis w `MODIFIER_APPLIERS[type]`, wywołujący nowy generator (użyj `resolveStoryModifierSteps`/`resolveIndexTarget` z istniejących helperów, jeśli modyfikator działa per-kondygnacja / per-krawędź).
4. **Panel pól UI** — utwórz `src/components/modifiers/panels/XFields.tsx` (`React.FC<ModifierFieldsProps<XModifier>>`), składając go wyłącznie z gotowych kontrolek z `controls/`.
5. **Deskryptor** — dodaj wpis w `MODIFIER_DESCRIPTORS` w `modifierDescriptors.tsx`: `title`, `Icon` (użyj istniejącej ikony z `CustomCadIcons.tsx`/`icons/` albo dodaj nową tam, nie w tym pliku), `accentVar` (token CSS), `createDefault`, `renderFields`.
6. **Podpięcie w miejscach dodających modyfikator** — w `ToolsGroup.tsx` (i innych toolbarach) dodaj typ do odpowiedniej listy renderowanej przez `MODIFIER_DESCRIPTORS[type]` — nie kopiuj literału domyślnego ani mapowania tytuł/kolor.
7. **Weryfikacja** — uruchom `npx vitest run src/engine/modifiers/modifierPipeline.test.ts`, `npm run build`, i ręcznie w `npm run dev` dodaj nowy modyfikator z panelu i z toolbaru, sprawdź reorder/toggle/delete oraz podgląd izometryczny.
