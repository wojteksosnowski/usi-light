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

