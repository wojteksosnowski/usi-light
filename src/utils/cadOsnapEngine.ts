/**
 * cadOsnapEngine.ts
 *
 * Fasada modułowa agregująca wyspecjalizowane podsystemy:
 * 1. cadCursorSnapEngine - Interaktywny kursor OSNAP i OTRACK (przyciąganie wskaźnika myszy do geometrii ekranu)
 * 2. cadObjectSnapEngine - Wielorelacyjny solver transformacji brył (dociąganie i wyrównywanie całych obiektów)
 */

export * from './cadCursorSnapEngine';
export * from './cadObjectSnapEngine';
