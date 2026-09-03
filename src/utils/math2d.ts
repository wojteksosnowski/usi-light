/**
 * math2d.ts
 *
 * Fasada modułowa re-eksportująca wszystkie podmoduły z folderu math2d/:
 * - vec2: operacje wektorowe 2D, iloczyny, odległości kwadratowe, normalne
 * - segments: przecięcia odcinków, rzutowania, sample'owanie, przycinanie do okręgu
 * - polygons: pole powierzchni (Gauss/Shoelace), testy orientacji CCW/CW, otoczka wypukła, sumy boolowskie
 * - transforms: przesunięcia krawędzi, dostosowywanie długości, aktualizacja wierzchołków
 * - dimensions: wymiarowanie liniowe, kątowe, odległości do granic działek
 * - shadowEnvelope: geometria rzutowania cienia brył, krawędzie sylwetkowe, obwiednie godzinowe
 */

export * from './math2d/index';
