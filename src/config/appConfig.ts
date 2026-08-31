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
} as const;
