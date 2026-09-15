# Reguły Architektury Projektu USI Light

## 1. Bufor Geometrii Obiektów i Niezmienniczość Modyfikatorów (Geometry Buffer & Local Object Space)
- **Każdy obiekt (budynek/obszar) jest buforem własnej geometrii wynikowej** pochodzącej z modyfikatorów (`storyPolygons`, `zonePolygons`, `segments`).
- **Niezmienniczość przy translacji i rotacji**:
  - Przesuwanie (`moveBuilding`, `moveBuildings`) i obracanie (`rotateBuilding`) obiektu na scenie **NIE PRZELICZA** potoku modyfikatorów (`applyBuildingModifiers`) od zera.
  - Zamiast tego, translacja i rotacja bezpośrednio transformują istniejący bufor wierzchołków (`vertices`, `storyPolygons`, `zonePolygons`, `segments`) oraz aktualizują metadane transformacji (`transform.tx`, `transform.ty`, `transform.rotationDeg`).
- **Warunek ponownego przeliczenia modyfikatorów**:
  - Potok `applyBuildingModifiers` wywoływany jest **WYŁĄCZNIE** w chwili rzeczywistej zmiany geometrii bazowej (edycja/dodanie/usunięcie wierzchołków, odsunięcie pojedynczej krawędzi, zmiana wysokości kondygnacji lub parametrów modyfikatorów).
- **Lokalny układ współrzędnych**:
  - Wszystkie operacje modyfikatorów (podcienia bram, wykusze, tarasy, donaty, strefy) operują w relacji do układu geometrii obiektu, gwarantując identyczne wyniki niezależnie od bezwzględnych współrzędnych w scenie.
