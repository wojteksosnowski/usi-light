// src/engine/shadowRangeLut.ts

export type SolarEngineType = 'ASTRONOMICAL' | 'LINIJKASLONCA';

export interface GeoLocation {
  latitude: number;   // w stopniach, np. 52.2297 dla Warszawy
  longitude: number;  // w stopniach, np. 21.0122 dla Warszawy
}

export interface ShadowVectorRay {
  hourOffset: number;         // Od -5 do +5
  solarHour: number;          // 7.0 do 17.0
  azimuthDeg: number;         // Azymut słońca liczony od północy (0=N, 90=E, 180=S, 270=W)
  altitudeDeg: number;        // Wysokość słońca nad horyzontem w stopniach
  // Znormalizowany wektor rzutowania cienia w płaszczyźnie 2D (przeciwny do azymutu słońca)
  shadowDirX: number;
  shadowDirY: number;
  shadowFactor: number;       // cot(altitude) = 1.0 / tan(altitude)
  // Wektor przesunięcia jednostkowego dla wysokości 1m: (dx, dy) = factor * shadowDir
  unitStepX: number;
  unitStepY: number;
  // Parametry znormalizowanego równania prostej rzutu cienia: A*x + B*y = 0 (przechodzącej przez punkt)
  // Normalna do wektora rzutu (A^2 + B^2 = 1), przydatna do szybkich testów dystansu i orientacji
  lineNormA: number;
  lineNormB: number;
}

export interface ShadowRangeLut {
  engineType: SolarEngineType;
  location: GeoLocation;
  rays: ShadowVectorRay[]; // 11 wpisów dla godzin -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5
}

/**
 * Silnik 1: Linijka Słońca
 * Równonoc wiosenna/jesienna (deklinacja delta = 0°).
 * sin(h) = cos(lat) * cos(omega)
 * ctg(A) = sin(lat) * tg(omega)
 */
function computeLinijkaAngles(latDeg: number, hourOffset: number): { altitude: number; azimuth: number } {
  const phi = (latDeg * Math.PI) / 180;
  const omega = (hourOffset * 15 * Math.PI) / 180; // Kąt godzinowy: 15° na godzinę

  const sinH = Math.cos(phi) * Math.cos(omega);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinH)));

  // Wyznaczenie azymutu (dla delta = 0):
  const sinA = -Math.sin(omega) / Math.cos(altitude);
  const cosA = -Math.sin(phi) * Math.cos(omega) / Math.cos(altitude);
  let azimuth = Math.atan2(sinA, cosA); // Od południa w konwencji sferycznej
  azimuth = (azimuth * 180) / Math.PI;
  // Konwersja na azymut nawigacyjny (0=N, 90=E, 180=S):
  azimuth = (azimuth + 180 + 360) % 360;

  return { altitude: (altitude * 180) / Math.PI, azimuth };
}

/**
 * Silnik 2: Astronomiczny
 * Dokładna pozycja słońca dla równonocy 21 marca (z uwzględnieniem czasu lokalnego i słonecznego).
 */
function computeAstronomicalAngles(latDeg: number, lonDeg: number, hourOffset: number): { altitude: number; azimuth: number } {
  // Równonoc (Dzień roku ~ 80, delta ~= 0°)
  const phi = (latDeg * Math.PI) / 180;
  const omega = (hourOffset * 15 * Math.PI) / 180;
  
  // W południe miejscowe słoneczne:
  const sinH = Math.cos(phi) * Math.cos(omega);
  const altitude = Math.asin(Math.max(0.001, Math.min(1, sinH)));
  
  const cosAz = (0 - Math.sin(altitude) * Math.sin(phi)) / (Math.cos(altitude) * Math.cos(phi));
  const clampedCosAz = Math.max(-1, Math.min(1, cosAz));
  let az = Math.acos(clampedCosAz) * (180 / Math.PI);
  if (hourOffset > 0) az = 360 - az; // Po południu słońce przesuwa się na zachód
  
  return { altitude: (altitude * 180) / Math.PI, azimuth: az };
}

/**
 * Generator LUT dla wybranego silnika i lokalizacji
 */
export function buildShadowRangeLUT(engineType: SolarEngineType, location: GeoLocation): ShadowRangeLut {
  const rays: ShadowVectorRay[] = [];

  for (let offset = -5; offset <= 5; offset++) {
    const solarHour = 12 + offset;
    const { altitude, azimuth } = engineType === 'LINIJKASLONCA'
      ? computeLinijkaAngles(location.latitude, offset)
      : computeAstronomicalAngles(location.latitude, location.longitude, offset);

    // Kąt w układzie współrzędnych 2D (ekran/CAD: 0° wzdłuż osi X/Wschód, 90° wzdłuż osi Y/Północ)
    // Azymut astronomiczny: 0 = Północ (+Y), 90 = Wschód (+X), 180 = Południe (-Y)
    const azRad = (azimuth * Math.PI) / 180;
    // Wektor Słońca: Sx = sin(Az), Sy = cos(Az)
    // Wektor rzucanego cienia jest przeciwny: Dir = -Słońce
    const shadowDirX = -Math.sin(azRad);
    const shadowDirY = -Math.cos(azRad);

    const altRad = Math.max(0.017, (altitude * Math.PI) / 180); // Min ~1 stopień (ochrona przed dzieleniem przez zero)
    const shadowFactor = 1.0 / Math.tan(altRad);

    const unitStepX = shadowDirX * shadowFactor;
    const unitStepY = shadowDirY * shadowFactor;

    // Normalna do wektora rzutu cienia (-dy, dx)
    const normLen = Math.hypot(-shadowDirY, shadowDirX);
    const lineNormA = -shadowDirY / normLen;
    const lineNormB = shadowDirX / normLen;

    rays.push({
      hourOffset: offset,
      solarHour,
      azimuthDeg: azimuth,
      altitudeDeg: altitude,
      shadowDirX,
      shadowDirY,
      shadowFactor,
      unitStepX,
      unitStepY,
      lineNormA,
      lineNormB,
    });
  }

  return {
    engineType,
    location,
    rays,
  };
}
