import { readFileSync } from 'fs';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function getDayOfYear(month, day) {
  const d = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let n = day;
  for (let m = 1; m < month; m++) n += d[m];
  return n;
}

function calculateSolarPosition(lat, lon, month, day, hourFraction, tzOffset = 1.0) {
  const dayOfYear = getDayOfYear(month, day);
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hourFraction - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868*Math.cos(gamma) - 0.032077*Math.sin(gamma) - 0.014615*Math.cos(2*gamma) - 0.040849*Math.sin(2*gamma));
  const decl = 0.006918 - 0.399912*Math.cos(gamma) + 0.070257*Math.sin(gamma) - 0.006758*Math.cos(2*gamma) + 0.000907*Math.sin(2*gamma) - 0.002697*Math.cos(3*gamma) + 0.00148*Math.sin(3*gamma);
  const timeOffset = eqtime + 4*lon - 60*tzOffset;
  const tst = hourFraction * 60 + timeOffset;
  const haDeg = tst/4 - 180;
  const haRad = haDeg * DEG2RAD;
  const latRad = lat * DEG2RAD;
  const cosZenith = Math.sin(latRad)*Math.sin(decl) + Math.cos(latRad)*Math.cos(decl)*Math.cos(haRad);
  const zenithRad = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  const elevationDeg = 90 - zenithRad * RAD2DEG;
  let azimuthDeg = 180;
  if (elevationDeg < 89.9) {
    const cosAzimuth = (Math.sin(latRad)*Math.cos(zenithRad) - Math.sin(decl)) / (Math.cos(latRad)*Math.sin(zenithRad) + 1e-10);
    let az = Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) * RAD2DEG;
    azimuthDeg = haDeg > 0 ? (az + 180) % 360 : (540 - az) % 360;
  }
  const solarNoonMinutes = 720 - 4*lon - eqtime + tzOffset*60;
  return {
    azimuthDeg: (azimuthDeg+360)%360,
    elevationDeg,
    declinationDeg: decl * RAD2DEG,
    solarNoonDecimal: solarNoonMinutes / 60
  };
}

function getHourAtSolarAzimuth(azimuthDeg, lat, lon, month, day, tzOffset = 1.0) {
  let low = 4.0;
  let high = 20.0;
  for (let i = 0; i < 28; i++) {
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

// ─── Linijka Słońca (Segments) ────────────────────────────────────────────────
function runLinijka(scene) {
  const { buildings, settings, selectedPointKey } = scene;
  const { latitude, longitude, equinoxDate } = settings;
  const month = equinoxDate === 'autumn' ? 9 : 3;
  const day = equinoxDate === 'autumn' ? 23 : 21;

  const targetBuilding = buildings.find(b => b.id === selectedPointKey.buildingId);
  const targetSegment = targetBuilding.segments.find(s => s.id === selectedPointKey.segmentId);
  const r = selectedPointKey.offsetRatio;
  const point = {
    x: targetSegment.p1.x + r * (targetSegment.p2.x - targetSegment.p1.x),
    y: targetSegment.p1.y + r * (targetSegment.p2.y - targetSegment.p1.y),
  };
  const normal = targetSegment.normal;

  const noonPos = calculateSolarPosition(latitude, longitude, month, day, 12.0);
  const noonHour = noonPos.solarNoonDecimal;
  const hoursRadius = 5;

  const startHour = Math.max(5.0, noonHour - hoursRadius);
  const endHour = Math.min(19.0, noonHour + hoursRadius);

  const startPos = calculateSolarPosition(latitude, longitude, month, day, startHour);
  const endPos = calculateSolarPosition(latitude, longitude, month, day, endHour);

  const azSolarMin = Math.min(startPos.azimuthDeg, endPos.azimuthDeg);
  const azSolarMax = Math.max(startPos.azimuthDeg, endPos.azimuthDeg);

  const normalAzimuth = ((Math.atan2(normal.x, normal.y) * RAD2DEG + 360) % 360);

  const azActiveMin = Math.max(azSolarMin, normalAzimuth - 78.0);
  const azActiveMax = Math.min(azSolarMax, normalAzimuth + 78.0);

  const k = Math.tan(latitude * DEG2RAD);
  const rawBlocked = [];

  for (const bldg of buildings) {
    if (bldg.isIncluded === false) continue;
    for (const seg of bldg.segments) {
      if (bldg.id === targetBuilding.id && seg.id === targetSegment.id) continue;

      // Filtr 1: za fasadą
      const v1x = seg.p1.x - point.x;
      const v1y = seg.p1.y - point.y;
      const v2x = seg.p2.x - point.x;
      const v2y = seg.p2.y - point.y;
      if (v1x * normal.x + v1y * normal.y < -0.01 && v2x * normal.x + v2y * normal.y < -0.01) continue;

      const deltaH = Math.max(0, seg.hTop);
      if (deltaH <= 0) continue;

      // Filtr 2: odrzuć jeśli oba wierzchołki na południe od L = H * 1.5
      if (seg.p1.y < point.y - deltaH * 1.5 && seg.p2.y < point.y - deltaH * 1.5) continue;

      // L = H * tan(lat)
      const L = deltaH * k;
      const yLine = point.y - L;

      let p1 = { x: seg.p1.x, y: seg.p1.y };
      let p2 = { x: seg.p2.x, y: seg.p2.y };

      // Krok 3/4: oba na południe od L
      if (p1.y < yLine && p2.y < yLine) continue;

      // Krok 5: przycięcie do yLine
      if (p1.y < yLine) {
        const t = (yLine - p1.y) / (p2.y - p1.y);
        p1 = { x: p1.x + t * (p2.x - p1.x), y: yLine };
      } else if (p2.y < yLine) {
        const t = (yLine - p1.y) / (p2.y - p1.y);
        p2 = { x: p1.x + t * (p2.x - p1.x), y: yLine };
      }

      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 0.05) continue;

      const d1 = Math.hypot(p1.x - point.x, p1.y - point.y);
      const d2 = Math.hypot(p2.x - point.x, p2.y - point.y);
      if (d1 < 0.05) {
        p1.x = p1.x + 0.05 * (p2.x - p1.x);
        p1.y = p1.y + 0.05 * (p2.y - p1.y);
      }
      if (d2 < 0.05) {
        p2.x = p2.x + 0.05 * (p1.x - p2.x);
        p2.y = p2.y + 0.05 * (p1.y - p2.y);
      }

      const az1 = ((Math.atan2(p1.x - point.x, p1.y - point.y) * RAD2DEG + 360) % 360);
      const az2 = ((Math.atan2(p2.x - point.x, p2.y - point.y) * RAD2DEG + 360) % 360);

      const intervals = [];
      if (Math.abs(az1 - az2) > 180) {
        const minA = Math.min(az1, az2);
        const maxA = Math.max(az1, az2);
        intervals.push([maxA, 360]);
        intervals.push([0, minA]);
      } else {
        intervals.push([Math.min(az1, az2), Math.max(az1, az2)]);
      }

      for (const [bStart, bEnd] of intervals) {
        if (bEnd > bStart + 0.01) {
          rawBlocked.push({ startAz: bStart, endAz: bEnd, bldgId: bldg.id, segId: seg.id });
        }
      }
    }
  }

  // 3. Scalanie
  rawBlocked.sort((a, b) => a.startAz - b.startAz);
  const mergedBlocked = [];
  for (const b of rawBlocked) {
    if (mergedBlocked.length === 0) {
      mergedBlocked.push({ startAz: b.startAz, endAz: b.endAz });
    } else {
      const last = mergedBlocked[mergedBlocked.length - 1];
      if (b.startAz <= last.endAz + 0.05) {
        last.endAz = Math.max(last.endAz, b.endAz);
      } else {
        mergedBlocked.push({ startAz: b.startAz, endAz: b.endAz });
      }
    }
  }

  // 4. Sektory
  const sectors = [];
  let cursor = azActiveMin;
  let totalHours = 0;

  function addFreeSector(startAz, endAz) {
    const rawH1 = getHourAtSolarAzimuth(startAz, latitude, longitude, month, day);
    const rawH2 = getHourAtSolarAzimuth(endAz, latitude, longitude, month, day);
    const hStart = Math.min(rawH1, rawH2);
    const hEnd   = Math.max(rawH1, rawH2);
    const secHours = hEnd - hStart;
    sectors.push({ startAz, endAz, hours: secHours, hStart, hEnd });
    totalHours += secHours;
  }

  for (const b of mergedBlocked) {
    if (cursor >= azActiveMax) break;
    const gapEnd = Math.min(b.startAz, azActiveMax);
    if (gapEnd > cursor + 0.01) {
      addFreeSector(cursor, gapEnd);
    }
    cursor = Math.max(cursor, b.endAz);
  }

  if (cursor < azActiveMax - 0.01) {
    addFreeSector(cursor, azActiveMax);
  }

  return { point, normal, azActiveMin, azActiveMax, rawBlocked, mergedBlocked, sectors, totalHours, totalMinutes: Math.round(totalHours * 60) };
}

// ─── Metoda Astronomiczna (Raycasting) ─────────────────────────────────────────
function runAstro(scene, stepMinutes = 5) {
  const { buildings, settings, selectedPointKey } = scene;
  const { latitude, longitude, equinoxDate } = settings;
  const month = equinoxDate === 'autumn' ? 9 : 3;
  const day = equinoxDate === 'autumn' ? 23 : 21;

  const targetBuilding = buildings.find(b => b.id === selectedPointKey.buildingId);
  const targetSegment = targetBuilding.segments.find(s => s.id === selectedPointKey.segmentId);
  const r = selectedPointKey.offsetRatio;
  const point = {
    x: targetSegment.p1.x + r * (targetSegment.p2.x - targetSegment.p1.x),
    y: targetSegment.p1.y + r * (targetSegment.p2.y - targetSegment.p1.y),
  };
  const normal = targetSegment.normal;
  const hWindowBottom = targetSegment.hWindowBottom ?? 0.85;

  const noonPos = calculateSolarPosition(latitude, longitude, month, day, 12.0);
  const noonHour = noonPos.solarNoonDecimal;
  const startHour = Math.max(5.0, noonHour - 5);
  const endHour = Math.min(19.0, noonHour + 5);

  let directMinutes = 0;
  const slotResults = [];

  for (let h = startHour; h <= endHour + 1e-4; h += stepMinutes / 60) {
    const pos = calculateSolarPosition(latitude, longitude, month, day, h);
    if (pos.elevationDeg <= 0) continue;

    // Normal check
    const azRad = pos.azimuthDeg * DEG2RAD;
    const elRad = pos.elevationDeg * DEG2RAD;
    const sunDir = {
      x: Math.sin(azRad) * Math.cos(elRad),
      y: Math.cos(azRad) * Math.cos(elRad),
      z: Math.sin(elRad)
    };

    const dot = normal.x * sunDir.x + normal.y * sunDir.y;
    const COS_78_DEG = Math.cos(78.0 * DEG2RAD);
    const isAngleAbove12Deg = dot >= COS_78_DEG;

    let isBlocked = false;
    let blockedBy = null;

    if (isAngleAbove12Deg) {
      // Raycast 3D
      for (const bldg of buildings) {
        if (bldg.isIncluded === false) continue;
        for (const seg of bldg.segments) {
          if (bldg.id === targetBuilding.id && seg.id === targetSegment.id) continue;

          // 2D segment intersection with horizontal ray projection
          const p1 = seg.p1;
          const p2 = seg.p2;
          const v1x = point.x - p1.x;
          const v1y = point.y - p1.y;
          const v2x = p2.x - p1.x;
          const v2y = p2.y - p1.y;
          const v3x = -sunDir.x;
          const v3y = -sunDir.y;

          const denom = v2x * v3y - v2y * v3x;
          if (Math.abs(denom) < 1e-8) continue;

          const t1 = (v2x * v1y - v2y * v1x) / denom; // distance along ray
          const t2 = (v1y * v3x - v1x * v3y) / denom; // parameter along segment [0, 1]

          if (t1 > 0.05 && t2 >= 0 && t2 <= 1) {
            // Check obstacle height at hit
            const hitZ = hWindowBottom + t1 * sunDir.z;
            const obsH = seg.hTop ?? bldg.defaultHeight ?? 10;
            if (hitZ < obsH) {
              isBlocked = true;
              blockedBy = `${bldg.id}/${seg.id}`;
              break;
            }
          }
        }
        if (isBlocked) break;
      }
    }

    const isDirect = isAngleAbove12Deg && !isBlocked;
    if (isDirect) directMinutes += stepMinutes;

    slotResults.push({
      h,
      az: pos.azimuthDeg,
      el: pos.elevationDeg,
      isAngleAbove12Deg,
      isBlocked,
      blockedBy,
      isDirect
    });
  }

  return { directMinutes, totalHours: directMinutes / 60, slotResults };
}

// ─── Test ──────────────────────────────────────────────────────────────────────
const scenePath = '/Volumes/Samsam/py/usi-light/docs/usi-light-scene-2026-08-30 (2).json';
const scene = JSON.parse(readFileSync(scenePath, 'utf8'));

console.log('='.repeat(70));
console.log('TEST SCENY: docs/usi-light-scene-2026-08-30 (2).json');
console.log('='.repeat(70));

const linijka = runLinijka(scene);
const astro5 = runAstro(scene, 5);
const astro1 = runAstro(scene, 1);

console.log(`\nPunkt P: (${linijka.point.x.toFixed(4)}, ${linijka.point.y.toFixed(4)})`);
console.log(`Normalna fasady: (${linijka.normal.x}, ${linijka.normal.y})`);
console.log(`Zakres aktywny kątowy [azActiveMin, azActiveMax]: [${linijka.azActiveMin.toFixed(4)}°, ${linijka.azActiveMax.toFixed(4)}°]`);

console.log('\n--- METODA LINIJKI SŁOŃCA (Twarowski) ---');
console.log(`Liczba surowych odcinków cienia: ${linijka.rawBlocked.length}`);
for (const b of linijka.rawBlocked) {
  console.log(`  Odcinek ${b.bldgId}/${b.segId}: [${b.startAz.toFixed(4)}°, ${b.endAz.toFixed(4)}°] (span: ${(b.endAz - b.startAz).toFixed(4)}°)`);
}

console.log(`\nScalone przedziały cienia: ${linijka.mergedBlocked.length}`);
for (const m of linijka.mergedBlocked) {
  console.log(`  Cień: [${m.startAz.toFixed(4)}°, ${m.endAz.toFixed(4)}°]`);
}

console.log(`\nWolne sektory nasłonecznienia: ${linijka.sectors.length}`);
for (const s of linijka.sectors) {
  console.log(`  Sektor: [${s.startAz.toFixed(4)}°, ${s.endAz.toFixed(4)}°] -> ${(s.hours*60).toFixed(1)} min (${s.hours.toFixed(3)}h) [${s.hStart.toFixed(2)}h - ${s.hEnd.toFixed(2)}h]`);
}
console.log(`\n>>> WYNIK LINIJKA: ${linijka.totalMinutes} min (${linijka.totalHours.toFixed(3)} h)`);

console.log('\n--- METODA ASTRONOMICZNA (Astro) ---');
console.log(`>>> WYNIK ASTRO (krok 5 min): ${astro5.directMinutes} min (${astro5.totalHours.toFixed(3)} h)`);
console.log(`>>> WYNIK ASTRO (krok 1 min): ${astro1.directMinutes} min (${astro1.totalHours.toFixed(3)} h)`);

console.log('\n--- PORÓWNANIE METOD ---');
console.log(`Różnica (Linijka vs Astro 1min): ${Math.abs(linijka.totalMinutes - astro1.directMinutes)} min`);
console.log('='.repeat(70));
