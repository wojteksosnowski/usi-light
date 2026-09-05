/**
 * Obliczenia chłonności mieszkaniowej placu zabaw wg § 33 ust. 8 WT.
 * 
 * Przepisy (§ 33 ust. 8 WT):
 * Powierzchnia placu zabaw dla dzieci ma wynosić co najmniej:
 * 1) 1 m2 na każdy lokal mieszkalny – w przypadku gdy w budynku lub zespole budynków znajduje się od 21 do 50 lokali mieszkalnych;
 * 2) 50 m2 – w przypadku gdy w budynku lub zespole budynków znajduje się od 51 do 100 lokali mieszkalnych;
 * 3) 0,5 m2 na każdy lokal mieszkalny – w przypadku gdy w budynku lub zespole budynków znajduje się od 101 do 300 lokali mieszkalnych;
 * 4) 200 m2 – w przypadku gdy w budynku lub zespole budynków znajduje się powyżej 300 lokali mieszkalnych.
 */

export interface PlaygroundApartmentCapacity {
  areaM2: number;
  maxApartments: number | null; // null or Infinity for unlimited
  isUnlimited: boolean;
  displayText: string;
  tierDescription: string;
  details: string;
}

export function computePlaygroundApartmentCapacity(areaM2: number): PlaygroundApartmentCapacity {
  const area = Math.max(0, Number.isFinite(areaM2) ? areaM2 : 0);

  if (area < 21) {
    const maxApts = Math.floor(area);
    return {
      areaM2: area,
      maxApartments: maxApts,
      isUnlimited: false,
      displayText: maxApts > 0 ? `do ${maxApts} mieszkań (inwestycja < 21 mzk)` : 'poniżej 21 mieszkań',
      tierDescription: 'Inwestycje do 20 mieszkań (brak ustawowego obowiązku placu)',
      details: 'Dla zespołu 21–50 mieszkań wymagana powierzchnia min. 1 m²/mieszkanie (min. 21 m²).',
    };
  }

  if (area < 50) {
    const maxApts = Math.floor(area);
    const missingForNext = (50 - area).toFixed(1);
    return {
      areaM2: area,
      maxApartments: maxApts,
      isUnlimited: false,
      displayText: `do ${maxApts} mieszkań`,
      tierDescription: 'Zakres 21–50 mieszkań (wymóg: 1 m²/mieszkanie)',
      details: `Obsługuje do ${maxApts} mieszkań. Do progu 100 mieszkań (min. 50 m²) brakuje ${missingForNext} m².`,
    };
  }

  if (area < 150) {
    // Dla 50m² obsłuży 100 mieszkań (stałe 50m²).
    // Dla pow. powyżej 50m² przy 0.5m²/mieszkanie: obsłuży Math.floor(area / 0.5) mieszkań (zakres 101-300 lokali).
    const maxApts = Math.max(100, Math.min(300, Math.floor(area / 0.5)));
    const missingFor200 = (200 - area).toFixed(1);
    return {
      areaM2: area,
      maxApartments: maxApts,
      isUnlimited: false,
      displayText: `do ${maxApts} mieszkań`,
      tierDescription: area < 50.5
        ? 'Zakres 51–100 mieszkań (wymóg: min. 50 m²)'
        : 'Zakres 101–300 mieszkań (wymóg: 0.5 m²/mieszkanie)',
      details: `Obsługuje do ${maxApts} mieszkań. Do progu >300 mieszkań (min. 200 m²) brakuje ${missingFor200} m².`,
    };
  }

  if (area < 200) {
    const missingFor200 = (200 - area).toFixed(1);
    return {
      areaM2: area,
      maxApartments: 300,
      isUnlimited: false,
      displayText: 'do 300 mieszkań',
      tierDescription: 'Zakres 101–300 mieszkań (pokrywa pełne 300 lokali)',
      details: `Obsługuje do 300 mieszkań. Do pełnego spełnienia dla >300 mieszkań (min. 200 m²) brakuje ${missingFor200} m².`,
    };
  }

  return {
    areaM2: area,
    maxApartments: null,
    isUnlimited: true,
    displayText: '> 300 mieszkań (bez limitu)',
    tierDescription: 'Powyżej 300 mieszkań (wymóg stały: min. 200 m²)',
    details: 'Powierzchnia ≥ 200 m² spełnia wymóg dla dowolnej liczby mieszkań w inwestycji.',
  };
}
