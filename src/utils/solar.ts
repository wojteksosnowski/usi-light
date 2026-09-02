/**
 * Solar position calculations based on NOAA Solar Position Algorithm.
 * Computes solar azimuth and elevation for any latitude, longitude and time of day.
 * Azimuth convention: 0 = North, 90 = East, 180 = South, 270 = West.
 */

export interface SolarPosition {
  azimuthDeg: number;
  elevationDeg: number;
  declinationDeg: number;
  solarNoonTime: string;
  solarNoonDecimal: number;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function getDayOfYear(month: number, day: number, isLeap: boolean = false): number {
  const daysInMonth = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let d = day;
  for (let m = 1; m < month; m++) {
    d += daysInMonth[m];
  }
  return d;
}

/**
 * Calculates solar position for given location, date and local standard time.
 * @param lat Latitude in degrees (+ for North, e.g. 52.23 for Warsaw)
 * @param lon Longitude in degrees (+ for East, e.g. 21.01 for Warsaw)
 * @param month Month (1-12) - Equinox: 3 for March 21
 * @param day Day of month (1-31) - Equinox: 21
 * @param hourFraction Hour of day in local time (0.0 to 24.0, e.g. 12.5 = 12:30)
 * @param tzOffset Timezone offset from UTC in hours (e.g. +1 for Poland CET / UTC+1)
 */
export function calculateSolarPosition(
  lat: number,
  lon: number,
  month: number = 3,
  day: number = 21,
  hourFraction: number = 12.0,
  tzOffset: number = 1.0
): SolarPosition {
  const dayOfYear = getDayOfYear(month, day);
  
  // Fractional year in radians
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hourFraction - 12) / 24);

  // Equation of time in minutes
  const eqtime = 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) -
    0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) -
    0.040849 * Math.sin(2 * gamma)
  );

  // Solar declination angle in radians
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // True solar time in minutes
  const timeOffset = eqtime + 4 * lon - 60 * tzOffset;
  const tst = hourFraction * 60 + timeOffset;

  // Solar hour angle in degrees
  const haDeg = (tst / 4) - 180;
  const haRad = haDeg * DEG2RAD;
  const latRad = lat * DEG2RAD;

  // Solar zenith angle
  const cosZenith =
    Math.sin(latRad) * Math.sin(decl) +
    Math.cos(latRad) * Math.cos(decl) * Math.cos(haRad);
  
  const zenithRad = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  const elevationDeg = 90 - zenithRad * RAD2DEG;

  // Solar azimuth angle (measured clockwise from North)
  let azimuthDeg = 180;
  if (elevationDeg < 89.9) {
    const cosAzimuth =
      (Math.sin(latRad) * Math.cos(zenithRad) - Math.sin(decl)) /
      (Math.cos(latRad) * Math.sin(zenithRad) + 1e-10);
    
    let az = Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) * RAD2DEG;
    if (haDeg > 0) {
      azimuthDeg = (az + 180) % 360;
    } else {
      azimuthDeg = (540 - az) % 360;
    }
  }

  // Solar noon calculation
  const solarNoonMinutes = 720 - 4 * lon - eqtime + tzOffset * 60;
  const noonHour = Math.floor(solarNoonMinutes / 60);
  const noonMin = Math.round(solarNoonMinutes % 60);
  const solarNoonTime = `${String(noonHour).padStart(2, '0')}:${String(noonMin).padStart(2, '0')}`;

  return {
    azimuthDeg: (azimuthDeg + 360) % 360,
    elevationDeg,
    declinationDeg: decl * RAD2DEG,
    solarNoonTime,
    solarNoonDecimal: solarNoonMinutes / 60
  };
}

/**
 * Zwraca dokładną godzinę dziesiętną (hourFraction) dla zadanego azymutu słońca w dniu równonocy.
 * Wykorzystuje monotoniczność azymutu w ciągu dnia i szybkie wyszukiwanie binarne.
 */
export function getHourAtSolarAzimuth(
  azimuthDeg: number,
  lat: number,
  lon: number,
  month: number = 3,
  day: number = 21,
  tzOffset: number = 1.0
): number {
  let low = 4.0;
  let high = 20.0;

  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    const pos = calculateSolarPosition(lat, lon, month, day, mid, tzOffset);
    if (pos.azimuthDeg < azimuthDeg) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

/**
 * Zwraca kąt elewacji słońca dla zadanego azymutu w dniu równonocy.
 */
export function getSolarElevationAtAzimuth(
  azimuthDeg: number,
  lat: number,
  lon: number,
  month: number = 3,
  day: number = 21,
  tzOffset: number = 1.0
): number {
  const hour = getHourAtSolarAzimuth(azimuthDeg, lat, lon, month, day, tzOffset);
  const pos = calculateSolarPosition(lat, lon, month, day, hour, tzOffset);
  return pos.elevationDeg;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEMY WYZNACZANIA GODZIN I PROSTYCH AZYMUTÓW (Astro vs Linijka Słońca)
// ─────────────────────────────────────────────────────────────────────────────

export interface Vector2DLike {
  x: number;
  y: number;
}

export interface Line2DEquation {
  /** Współczynnik A w postaci ogólnej: A*x + B*y + C = 0 */
  A: number;
  /** Współczynnik B w postaci ogólnej: A*x + B*y + C = 0 */
  B: number;
  /** Współczynnik C w postaci ogólnej: A*x + B*y + C = 0 (dla prostej przez (0,0) C=0) */
  C: number;
}

export interface HourLine2D {
  hourFraction: number; // Godzina w czasie lokalnym (np. 11.633 lub 12.0)
  timeStr: string;      // np. "11:38" lub "12:00"
  offsetHours: number;  // Odchylenie od górowania słońca: -5, -4, ..., 0, ..., +5
  offsetLabel: string;  // np. "11:38 (Górowanie)" lub "10:38 (-1h)" / "12:38 (+1h)"
  azimuthDeg: number;   // Azymut geograficzny (0°=N, 90°=E, 180°=S, 270°=W)
  elevationDeg: number; // Kąt elewacji nad horyzontem
  dir: Vector2DLike;    // Wektor jednostkowy w CAD (x=sin(az), y=cos(az))
  lineEq: Line2DEquation; // Postać ogólna prostej znormalizowana (A^2 + B^2 = 1)
}

export interface ISolarHourSystem {
  readonly systemType: 'astro' | 'linijka';
  readonly latitude: number;
  readonly longitude: number;
  readonly equinoxDate: 'spring' | 'autumn';
  readonly solarNoonDecimal: number;
  readonly solarNoonTime: string;
  getHourLines(startOffset?: number, endOffset?: number, stepHours?: number): HourLine2D[];
  getAzimuthForHour(hourFraction: number): number;
  getHourForAzimuth(azimuthDeg: number): number;
  getElevationForAzimuth(azimuthDeg: number): number;
  getLineEquationForHour(hourFraction: number): Line2DEquation;
  getLineEquationForAzimuth(azimuthDeg: number): Line2DEquation;
}

/**
 * Tworzy znormalizowane równanie prostej 2D A*x + B*y + C = 0 przechodzącej przez (0,0) w kierunku zadanego azymutu.
 * W układzie CAD: +Y to Północ, +X to Wschód. Wektor kierunkowy: (sin(az), cos(az)).
 * Normalna prostej: A = cos(az), B = -sin(az), C = 0.
 */
export function createLineEquationFromAzimuth(azimuthDeg: number): Line2DEquation {
  const azRad = azimuthDeg * DEG2RAD;
  const A = Math.cos(azRad);
  const B = -Math.sin(azRad);
  return { A, B, C: 0 };
}

/**
 * 1. System Astronomiczny (Astro)
 * Wyznacza pozycje, azymuty i elewacje na podstawie algorytmu astronomicznego NOAA.
 * Punktem odniesienia jest moment górowania słońca (solar noon), od którego wyznaczane są
 * godziny w przedziale [-5h, +5h] (oraz dla przedszkoli [-4h, +4h]).
 */
export class AstroSolarSystem implements ISolarHourSystem {
  readonly systemType = 'astro' as const;
  readonly latitude: number;
  readonly longitude: number;
  readonly equinoxDate: 'spring' | 'autumn';
  readonly month: number;
  readonly day: number;
  readonly tzOffset: number;
  readonly solarNoonDecimal: number;
  readonly solarNoonTime: string;

  private cachedHourLines: HourLine2D[] | null = null;
  private cachedKey: string = '';

  constructor(
    latitude: number = 52.2297,
    longitude: number = 21.0122,
    equinoxDate: 'spring' | 'autumn' = 'spring',
    tzOffset: number = 1.0
  ) {
    this.latitude = latitude;
    this.longitude = longitude;
    this.equinoxDate = equinoxDate;
    this.month = equinoxDate === 'autumn' ? 9 : 3;
    this.day = equinoxDate === 'autumn' ? 23 : 21;
    this.tzOffset = tzOffset;

    const noonPos = calculateSolarPosition(
      this.latitude,
      this.longitude,
      this.month,
      this.day,
      12.0,
      this.tzOffset
    );
    this.solarNoonDecimal = noonPos.solarNoonDecimal;
    this.solarNoonTime = noonPos.solarNoonTime;
  }

  /**
   * Zwraca linie pełnych godzin zegarowych (czasu lokalnego) w oknie analizy [-5h, +5h]
   * oraz wyróżnioną linię momentu astronomicznego górowania słońca (solar noon, 180°).
   */
  getHourLines(startOffset: number = -5, endOffset: number = 5, stepHours: number = 1): HourLine2D[] {
    const key = `${startOffset}_${endOffset}_${stepHours}`;
    if (this.cachedHourLines && this.cachedKey === key) {
      return this.cachedHourLines;
    }

    const lines: HourLine2D[] = [];
    const minHour = Math.max(5, Math.floor(this.solarNoonDecimal + startOffset));
    const maxHour = Math.min(19, Math.ceil(this.solarNoonDecimal + endOffset));

    // 1. Dodanie pełnych godzin zegarowych (np. 07:00, 08:00, ..., 12:00, ..., 17:00)
    for (let h = minHour; h <= maxHour; h += stepHours) {
      const pos = calculateSolarPosition(
        this.latitude,
        this.longitude,
        this.month,
        this.day,
        h,
        this.tzOffset
      );

      const timeStr = `${String(h).padStart(2, '0')}:00`;
      const azRad = pos.azimuthDeg * DEG2RAD;
      const dir: Vector2DLike = {
        x: Math.sin(azRad),
        y: Math.cos(azRad),
      };

      const lineEq = createLineEquationFromAzimuth(pos.azimuthDeg);
      const diffFromNoon = Math.round((h - this.solarNoonDecimal) * 10) / 10;
      const offsetSign = diffFromNoon > 0 ? `+${diffFromNoon}h` : `${diffFromNoon}h`;

      lines.push({
        hourFraction: h,
        timeStr,
        offsetHours: diffFromNoon,
        offsetLabel: `${timeStr} (${offsetSign})`,
        azimuthDeg: pos.azimuthDeg,
        elevationDeg: pos.elevationDeg,
        dir,
        lineEq,
      });
    }

    // 2. Dodanie linii dokładnego górowania słońca (solar noon, azymut 180.0° S)
    const noonPos = calculateSolarPosition(
      this.latitude,
      this.longitude,
      this.month,
      this.day,
      this.solarNoonDecimal,
      this.tzOffset
    );
    const noonAzRad = noonPos.azimuthDeg * DEG2RAD;
    lines.push({
      hourFraction: this.solarNoonDecimal,
      timeStr: this.solarNoonTime,
      offsetHours: 0,
      offsetLabel: `${this.solarNoonTime} (Górowanie 180°)`,
      azimuthDeg: noonPos.azimuthDeg,
      elevationDeg: noonPos.elevationDeg,
      dir: { x: Math.sin(noonAzRad), y: Math.cos(noonAzRad) },
      lineEq: createLineEquationFromAzimuth(noonPos.azimuthDeg),
    });

    // Sortowanie po godzinie
    lines.sort((a, b) => a.hourFraction - b.hourFraction);

    this.cachedHourLines = lines;
    this.cachedKey = key;
    return lines;
  }

  getAzimuthForHour(hourFraction: number): number {
    const pos = calculateSolarPosition(
      this.latitude,
      this.longitude,
      this.month,
      this.day,
      hourFraction,
      this.tzOffset
    );
    return pos.azimuthDeg;
  }

  getHourForAzimuth(azimuthDeg: number): number {
    return getHourAtSolarAzimuth(
      azimuthDeg,
      this.latitude,
      this.longitude,
      this.month,
      this.day,
      this.tzOffset
    );
  }

  getElevationForAzimuth(azimuthDeg: number): number {
    return getSolarElevationAtAzimuth(
      azimuthDeg,
      this.latitude,
      this.longitude,
      this.month,
      this.day,
      this.tzOffset
    );
  }

  getLineEquationForHour(hourFraction: number): Line2DEquation {
    const az = this.getAzimuthForHour(hourFraction);
    return createLineEquationFromAzimuth(az);
  }

  getLineEquationForAzimuth(azimuthDeg: number): Line2DEquation {
    return createLineEquationFromAzimuth(azimuthDeg);
  }
}

/**
 * 2. System Geometryczny Linijki Słońca (Twarowski)
 * Wyznacza azymuty godzin na podstawie wykreślnego rzutowania kierunków słońca
 * z płaszczyzny równika niebieskiego (płaszczyzny słońca, krok 15°/h) na płaszczyznę poziomą XY (2D).
 * Punktem odniesienia jest południe słoneczne geometryczne (12:00, 180°), od którego odliczamy [-5h, +5h].
 */
export class LinijkaSolarSystem implements ISolarHourSystem {
  readonly systemType = 'linijka' as const;
  readonly latitude: number;
  readonly longitude: number;
  readonly equinoxDate: 'spring' | 'autumn';
  readonly solarNoonDecimal: number;
  readonly solarNoonTime: string;
  readonly latRad: number;
  readonly sinLat: number;
  readonly tanLat: number;

  private cachedHourLines: HourLine2D[] | null = null;
  private cachedKey: string = '';

  // Tablica LUT dla szybkiego wyszukiwania binarnego azymut -> godzina (1201 próbek dla zakresu 6:00 - 18:00 co 36 sekund)
  private readonly lutAzimuths: Float64Array;
  private readonly lutHours: Float64Array;

  constructor(
    latitude: number = 52.2297,
    longitude: number = 21.0122,
    equinoxDate: 'spring' | 'autumn' = 'spring'
  ) {
    this.latitude = latitude;
    this.longitude = longitude;
    this.equinoxDate = equinoxDate;
    // W klasycznej Linijce Słońca południe słoneczne geometryczne przypada na 12:00 (kąt 180° / Południe)
    this.solarNoonDecimal = 12.0;
    this.solarNoonTime = '12:00';

    this.latRad = latitude * DEG2RAD;
    this.sinLat = Math.sin(this.latRad);
    this.tanLat = Math.tan(this.latRad);

    // Prekompilacja LUT: zakres od 4.0h do 20.0h co 0.01h (36s) = 1601 próbek
    const lutSamples = 1601;
    this.lutAzimuths = new Float64Array(lutSamples);
    this.lutHours = new Float64Array(lutSamples);

    for (let i = 0; i < lutSamples; i++) {
      const hDec = 4.0 + (i / (lutSamples - 1)) * 16.0;
      const H = (hDec - 12.0) * 15.0 * DEG2RAD;
      const x = -Math.sin(H);
      const y = -Math.cos(H) * this.sinLat;
      const azDeg = ((Math.atan2(x, y) * RAD2DEG % 360) + 360) % 360;

      this.lutHours[i] = hDec;
      this.lutAzimuths[i] = azDeg;
    }
  }

  /**
   * Szybkie mapowanie azymutu na godzinę za pomocą wyszukiwania binarnego (Binary Search) w stablicowanym LUT.
   * Złożoność O(log K) <= 11 operacji bez wywoływania Math.atan2/sin/cos.
   */
  getHourForAzimuthFast(azimuthDeg: number): number {
    const azs = this.lutAzimuths;
    const hrs = this.lutHours;
    const len = azs.length;

    if (azimuthDeg <= azs[0]) return hrs[0];
    if (azimuthDeg >= azs[len - 1]) return hrs[len - 1];

    let low = 0;
    let high = len - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const val = azs[mid];

      if (val < azimuthDeg) {
        low = mid + 1;
      } else if (val > azimuthDeg) {
        high = mid - 1;
      } else {
        return hrs[mid];
      }
    }

    // Interpolacja liniowa pomiędzy high a low (high = low - 1)
    const idx1 = Math.max(0, high);
    const idx2 = Math.min(len - 1, low);
    if (idx1 === idx2) return hrs[idx1];

    const az1 = azs[idx1];
    const az2 = azs[idx2];
    const t = (azimuthDeg - az1) / (az2 - az1);
    return hrs[idx1] + t * (hrs[idx2] - hrs[idx1]);
  }

  /**
   * Zwraca czas trwania (w godzinach dziesiętnych) między dwoma azymutami na równonoc.
   */
  getSpanHours(startAzimuthDeg: number, endAzimuthDeg: number): number {
    const h1 = this.getHourForAzimuth(startAzimuthDeg);
    const h2 = this.getHourForAzimuth(endAzimuthDeg);
    return Math.abs(h2 - h1);
  }

  /**
   * Zwraca linie godzinowe wyznaczone jako odchylenia od punktu odniesienia 12:00 (południe geometryczne 180°).
   */
  getHourLines(startOffset: number = -5, endOffset: number = 5, stepHours: number = 1): HourLine2D[] {
    const key = `${startOffset}_${endOffset}_${stepHours}`;
    if (this.cachedHourLines && this.cachedKey === key) {
      return this.cachedHourLines;
    }

    const lines: HourLine2D[] = [];

    for (let offset = startOffset; offset <= endOffset + 1e-4; offset += stepHours) {
      const hDec = this.solarNoonDecimal + offset;
      const az = this.getAzimuthForHour(hDec);
      const elev = this.getElevationForAzimuth(az);

      let hInt = Math.floor(hDec);
      let mInt = Math.round((hDec - hInt) * 60);
      if (mInt >= 60) {
        hInt += 1;
        mInt = 0;
      }
      const timeStr = `${String(hInt).padStart(2, '0')}:${String(mInt).padStart(2, '0')}`;

      const azRad = az * DEG2RAD;
      const dir: Vector2DLike = {
        x: Math.sin(azRad),
        y: Math.cos(azRad),
      };

      const lineEq = createLineEquationFromAzimuth(az);
      const roundedOffset = Math.round(offset * 100) / 100;
      const offsetSign = roundedOffset > 0 ? `+${roundedOffset}h` : `${roundedOffset}h`;
      const offsetLabel = Math.abs(roundedOffset) < 1e-3
        ? '12:00 (Południe)'
        : `${timeStr} (${offsetSign})`;

      lines.push({
        hourFraction: hDec,
        timeStr,
        offsetHours: roundedOffset,
        offsetLabel,
        azimuthDeg: az,
        elevationDeg: elev,
        dir,
        lineEq,
      });
    }

    this.cachedHourLines = lines;
    this.cachedKey = key;
    return lines;
  }

  getAzimuthForHour(hourFraction: number): number {
    const H = (hourFraction - 12.0) * 15.0 * DEG2RAD;
    const x = -Math.sin(H);
    const y = -Math.cos(H) * this.sinLat;
    let azDeg = Math.atan2(x, y) * RAD2DEG;
    return ((azDeg % 360) + 360) % 360;
  }

  getHourForAzimuth(azimuthDeg: number): number {
    const azRad = azimuthDeg * DEG2RAD;
    const sinAz = Math.sin(azRad);
    const cosAz = Math.cos(azRad);
    const hRad = Math.atan2(-sinAz, -cosAz / (this.sinLat || 1e-6));
    const hDeg = hRad * RAD2DEG;
    return 12.0 + hDeg / 15.0;
  }

  getElevationForAzimuth(azimuthDeg: number): number {
    const azRad = azimuthDeg * DEG2RAD;
    const tanElev = -Math.cos(azRad) / (this.tanLat || 1e-6);
    if (tanElev <= 0) return 0;
    return Math.atan(tanElev) * RAD2DEG;
  }

  getLineEquationForHour(hourFraction: number): Line2DEquation {
    const az = this.getAzimuthForHour(hourFraction);
    return createLineEquationFromAzimuth(az);
  }

  getLineEquationForAzimuth(azimuthDeg: number): Line2DEquation {
    return createLineEquationFromAzimuth(azimuthDeg);
  }
}




