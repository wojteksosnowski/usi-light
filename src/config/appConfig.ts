/**
 * Centralna konfiguracja aplikacji USI Light 2.5D
 * Zawiera parametry wizualizacji CAD, konfigurację pasm analitycznych oraz domyślne stałe obliczeniowe.
 */

export const APP_CONFIG = {
  // Wizualizacja kolorowych pasm analizy § 12 i § 56 na fasadach budynków
  analysisBands: {
    // Grubość pasm w pikselach (szersze linie)
    minThicknessPx: 6, // minimalna grubość na ekranie w px
    maxThicknessPx: 14, // maksymalna grubość na ekranie w px
    scaleFactor: 0.45, // współczynnik skalowania z zoomem

    // Domyślna przezroczystość (bardziej przezroczyste, elegancki wygląd CAD)
    defaultAlpha: 0.65,

    // Kolorystyka § 12 (Przesłanianie - pasmo wewnętrzne)
    shadowing: {
      compliantColor: (alpha = 0.65) => `rgba(16, 185, 129, ${alpha})`,
      nonCompliantColor: (alpha = 0.65) => `rgba(244, 63, 94, ${alpha})`,
    },

    // Skala barwna § 56 (Nasłonecznienie - pasmo zewnętrzne w krokach 30-minutowych)
    sunlight: {
      getColor: (hours: number, alpha = 0.65) => {
        const stepped = Math.floor(hours * 2) / 2;
        if (stepped < 0.5) return `rgba(59, 7, 100, ${alpha})`;
        if (stepped < 1.0) return `rgba(88, 28, 135, ${alpha})`;
        if (stepped < 1.5) return `rgba(126, 34, 206, ${alpha})`;
        if (stepped < 2.0) return `rgba(168, 85, 247, ${alpha})`;
        if (stepped < 2.5) return `rgba(192, 38, 211, ${alpha})`;
        if (stepped < 3.0) return `rgba(225, 29, 72, ${alpha})`;
        if (stepped < 3.5) return `rgba(234, 88, 12, ${alpha})`;
        if (stepped < 4.0) return `rgba(249, 115, 22, ${alpha})`;
        return `rgba(251, 191, 36, ${alpha})`;
      },
    },
  },

  // Domyślne parametry prawne i geometryczne analizy
  analysis: {
    defaultBuildingHeight: 15.0,
    defaultWindowBottom: 0.85,
    maxDistanceStandard: 35.0,
    maxDistanceCityCentre: 17.5,
    shadowAngleToleranceDeg: 15.0,
    shadowMinCompliantSpanDeg: 60.0,
    shadowToleranceMinSpanDeg: 75.0,
    facadeWorkingAngleDeg: 78.0, // ±78° (12° od lica fasady)
  },

  // Punkty badania fasady
  facadePoints: {
    maxPinnedPoints: 3, // Maksymalna liczba badanych punktów fasady
  },

  // Kolory i style widoku CAD
  cad: {
    gridColor: '#1e293b',
    selectionColor: '#38bdf8',
    hoverColor: '#fbbf24',
    testedBuildingFill: 'rgba(59, 130, 246, 0.16)',
    testedBuildingSelectedFill: 'rgba(59, 130, 246, 0.30)',
    obstacleBuildingFill: 'rgba(71, 85, 105, 0.18)',
    obstacleBuildingSelectedFill: 'rgba(148, 163, 184, 0.28)',
  },

  // System śledzenia kierunków i snapowania (Polar / Ortho Tracking & Snapping)
  directionSnapping: {
    enabledDefault: true,
    // Tolerancja kątowa przyciągania do osi w stopniach (siła / okno przyciągania)
    angleToleranceDeg: 4.0,
    // Maksymalna odległość prostopadła kursora do osi w pikselach ekranowych (elastyczność)
    screenSnapThresholdPx: 20,
    // Minimalna odległość od punktu bazowego w metrach do aktywacji snapowania
    minDistanceMeters: 0.2,
    // Maksymalna liczba rozważanych najbliższych obiektów / ścian
    maxNearbySegments: 16,
    // Długość rysowanej linii naprowadzającej w metrach świata CAD
    guideLineLengthMeters: 60.0,
    // Kolorystyka i styl linii naprowadzających
    guideLineColor: '#38bdf8',
    guideLineDash: [6, 4],
    guideLineWidth: 1.5,
    // Rozróżnienie kolorystyczne: statystyczne vs przedłużenia krawędzi
    statisticalGuideColor: '#f59e0b', // Bursztynowy/Złoty dla siatek głównych i statystycznych
    edgeGuideColor: '#38bdf8', // Błękitny/Cyjanowy dla konkretnych krawędzi i ścian
    statisticalGuideDash: [8, 4],
    edgeGuideDash: [5, 4],
    badgeBgColor: 'rgba(15, 23, 42, 0.94)',
    badgeBorderColor: '#38bdf8',
  },

  // Zaawansowany silnik OSNAP & OTRACK
  osnap: {
    enabledDefault: true,
    snapRadiusPx: 14, // Promień łapania punktu snap w px
    hoverAcquireDelayMs: 300, // Czas zatrzymania kursora dla nabycia punktu OTRACK (ms)
    maxAcquiredPoints: 2, // Maksymalna liczba punktów referencyjnych OTRACK
    collinearDistanceToleranceMeters: 0.35, // Dociąganie nośnika ścian (Collinear Lock)
    parallelAngleToleranceDeg: 0.8, // Dociąganie kątowe ścian (Parallel Snap)
    rayLengthMeters: 100.0,
    // Kolory i style wskaźników CAD
    endpointColor: '#10b981', // Zielony kwadrat
    midpointColor: '#06b6d4', // Cyjanowy trójkąt
    intersectionColor: '#f43f5e', // Różowy krzyżyk/klepsydra
    nearestColor: '#38bdf8', // Błękitna klepsydra
    extensionColor: '#38bdf8', // Błękitna linia przedłużenia konkretnej ściany
    otrackAnchorColor: '#f59e0b', // Bursztynowy okrąg akwizycji
    otrackRayColor: '#818cf8', // Fioletowo-niebieski domyślny promień
    statisticalRayColor: '#f59e0b', // Bursztynowa prowadnica OTRACK (kierunki statystyczne / ortho 0°/90°)
    edgeRayColor: '#38bdf8', // Błękitna prowadnica OTRACK (pochodząca z konkretnej ściany/krawędzi)
    collinearColor: '#a855f7', // Fioletowa linia blokady kolinearnej
  },

  // Konfiguracja analizy statystycznej kierunków fasad
  statistics: {
    defaultNoisePercentile: 20, // 20% najkrótszych odcinków ignorowanych przy wyznaczaniu siatek
    minSegmentLengthMeters: 0.2, // Minimalna długość ściany w metrach
    highlightColor: '#f59e0b', // Kolor aktywnego koszyka kątowego w UI
  },

  // Warstwa analityczna podkładu satelitarnego
  googleMaps: {
    apiKey: 'AIzaSyC6fe9THidhFMg1TT0OcIPJ_vRCUWFfra4',
    defaultOpacity: 0.65,
  },

  // Wypełnienie cienia godzinowego (warstwa Zakres cienia)
  shadowFill: {
    // 95% przezroczystości (alpha = 0.05) — subtelne, prawie niewidoczne tło
    fillAlpha: 0.05,
  },
} as const;


