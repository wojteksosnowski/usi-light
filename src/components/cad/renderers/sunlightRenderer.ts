import { CadRenderContext } from '../types';
import { AstroSolarSystem, LinijkaSolarSystem } from '../../../utils/solar';
import { APP_CONFIG } from '../../../config/appConfig';

// Purple-to-Orange sunlight color scale in 30-minute steps from APP_CONFIG
export const getSunlightColor = (hours: number, alpha: number = APP_CONFIG.analysisBands.defaultAlpha) => {
  return APP_CONFIG.analysisBands.sunlight.getColor(hours, alpha);
};

const formatHoursAndMinutes = (hours: number): string => {
  const totalM = Math.round(hours * 60);
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
};

const formatLinijkaOffsetHM = (offsetHours: number): string => {
  const totalM = Math.round(offsetHours * 60);
  const sign = totalM > 0 ? '+' : (totalM < 0 ? '-' : '');
  const absM = Math.abs(totalM);
  const h = Math.floor(absM / 60);
  const m = absM % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
};

export function renderSunlightVisualization(
  rc: CadRenderContext,
  selectedPointResult: any,
  buildings: any[]
) {
  const { ctx, worldToScreen, latitude, longitude, equinoxDate } = rc;
  if (!selectedPointResult || !selectedPointResult.point || !selectedPointResult.normal) return;
  const { point, shadowing, sunlight } = selectedPointResult;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  const { sx: px, sy: py } = worldToScreen(point.x, point.y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return;

  const bldgOfPoint = buildings.find((b) => b.id === selectedPointResult.buildingId);
  const heightH = Math.max(5, bldgOfPoint?.defaultHeight ?? 15);
  const isCityCentre = bldgOfPoint?.isCityCentre ?? false;
  const maxAllowedReq = isCityCentre ? 17.5 : 35.0;

  const slots = sunlight?.timeSlots || [];
  let noonElevationDeg = 38.0;
  for (const s of slots) {
    if (s.elevationDeg > noonElevationDeg) noonElevationDeg = s.elevationDeg;
  }
  const noonElevRad = (noonElevationDeg * Math.PI) / 180;
  const tanElev = Math.max(1e-4, Math.tan(noonElevRad));
  const shadowLengthH = Math.min(heightH / tanElev, maxAllowedReq);

  // Normalna fasady w stopniach (matematycznych, CCW od wschodu)
  const normalWorldDeg = (Math.atan2(selectedPointResult.normal.y, selectedPointResult.normal.x) * 180) / Math.PI;
  if (!Number.isFinite(normalWorldDeg)) return;
  const normalMathRad = (normalWorldDeg * Math.PI) / 180;
  const normalAzimuth = ((Math.atan2(selectedPointResult.normal.x, selectedPointResult.normal.y) * 180 / Math.PI + 360) % 360);

  const isLinijkaMethod =
    rc.sunlightMethod === 'segments' || (sunlight.sectors !== undefined && rc.sunlightMethod !== 'raycasting');
  const lat = latitude ?? 52.2297;
  const lon = longitude ?? 21.0122;
  const eqDate = equinoxDate ?? 'spring';

  const hourSystem = isLinijkaMethod
    ? new LinijkaSolarSystem(lat, lon, eqDate)
    : new AstroSolarSystem(lat, lon, eqDate);

  const calcRulerEndpoint = (dirX: number, dirY: number, d: number) => {
    // Podstawa trójkąta Linijki Słońca leży zawsze na poziomej linii E-W: Y = point.y - d
    // Wektor promienia (dirX, dirY) przecina prostą Y = point.y - d:
    if (dirY < -1e-5) {
      const t = -d / dirY;
      return { wx: point.x + dirX * t, wy: point.y - d };
    } else {
      return { wx: point.x + dirX * (d * 5.0), wy: point.y - d };
    }
  };

  const directSectors = isLinijkaMethod && sunlight.sectors
    ? sunlight.sectors.filter((s: any) => s.isDirectSunlight && s.spanDeg > 0.05)
    : [];

  const validSlots = slots.filter(
    (s: any) => s.isSunAboveHorizon && s.elevationDeg > 0.5 && s.isAngleAbove12Deg
  );

  ctx.save();

  // 1. Rysowanie sektorów / wachlarza światła
  if (isLinijkaMethod && directSectors.length > 0) {
    for (let sIdx = 0; sIdx < directSectors.length; sIdx++) {
      const sec = directSectors[sIdx];
      const az1MathRad = ((90 - sec.startAzimuthDeg + 360) % 360) * (Math.PI / 180);
      const dirX1 = Math.cos(az1MathRad);
      const dirY1 = Math.sin(az1MathRad);

      const az2MathRad = ((90 - sec.endAzimuthDeg + 360) % 360) * (Math.PI / 180);
      const dirX2 = Math.cos(az2MathRad);
      const dirY2 = Math.sin(az2MathRad);

      // Indywidualna odległość podstawy dla tego konkretnego sektora z obiektów klipujących
      const dist = (sec.requiredDistance && sec.requiredDistance > 0)
        ? sec.requiredDistance
        : shadowLengthH;

      const p1 = calcRulerEndpoint(dirX1, dirY1, dist);
      const s1 = worldToScreen(p1.wx, p1.wy);

      const p2 = calcRulerEndpoint(dirX2, dirY2, dist);
      const s2 = worldToScreen(p2.wx, p2.wy);

      const fillCol = getSunlightColor(sunlight.totalHours, 0.35);
      const strokeCol = getSunlightColor(sunlight.totalHours, 0.85);
      const solidCol = getSunlightColor(sunlight.totalHours, 1.0);

      // Wypełnienie trójkąta sektora
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(s1.sx, s1.sy);
      ctx.lineTo(s2.sx, s2.sy);
      ctx.closePath();
      ctx.fillStyle = fillCol;
      ctx.fill();
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Pozioma podstawa E-W wskazująca krawędź przesłaniającą
      ctx.beginPath();
      ctx.moveTo(s1.sx, s1.sy);
      ctx.lineTo(s2.sx, s2.sy);
      ctx.strokeStyle = solidCol;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Obliczenie etykiet czasowych dla końców podstawy sektora
      let startLabel = '';
      let endLabel = '';
      if (isLinijkaMethod) {
        const h1 = hourSystem.getHourForAzimuth(sec.startAzimuthDeg);
        const h2 = hourSystem.getHourForAzimuth(sec.endAzimuthDeg);
        startLabel = formatLinijkaOffsetHM(h1 - 12.0);
        endLabel = formatLinijkaOffsetHM(h2 - 12.0);
      } else {
        startLabel = sec.startTimeStr ?? '';
        endLabel = sec.endTimeStr ?? '';
      }

      // Etykiety powiększone o 50% (13.5px monospace, badge height ~22px)
      ctx.font = 'bold 13.5px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Etykieta przy punkcie s1 (początek podstawy)
      if (startLabel) {
        const tw1 = ctx.measureText(startLabel).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = solidCol;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(s1.sx - tw1 / 2 - 6, s1.sy + 5, tw1 + 12, 22, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.fillText(startLabel, s1.sx, s1.sy + 16);
      }

      // Etykieta przy punkcie s2 (koniec podstawy)
      if (endLabel) {
        const tw2 = ctx.measureText(endLabel).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = solidCol;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(s2.sx - tw2 / 2 - 6, s2.sy + 5, tw2 + 12, 22, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.fillText(endLabel, s2.sx, s2.sy + 16);
      }

      // Środek podstawy: wyłącznie czas trwania sektora w formacie "H:MM" (np. "2:17")
      const midSx = (s1.sx + s2.sx) / 2;
      const midSy = (s1.sy + s2.sy) / 2;
      const durationText = formatHoursAndMinutes(sec.hours);

      const twMid = ctx.measureText(durationText).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(midSx - twMid / 2 - 7, midSy + 5, twMid + 14, 22, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = solidCol;
      ctx.fillText(durationText, midSx, midSy + 16);
    }
  } else if (!isLinijkaMethod && validSlots.length >= 2) {
    const fillCol = getSunlightColor(sunlight.totalHours, 0.32);
    const strokeCol = getSunlightColor(sunlight.totalHours, 0.75);
    const solidCol = getSunlightColor(sunlight.totalHours, 1.0);

    const slotCoords: {
      time: string;
      isDirect: boolean;
      wx: number;
      wy: number;
      sx: number;
      sy: number;
    }[] = [];

    for (const s of validSlots) {
      const azMathRad = ((90 - s.azimuthDeg + 360) % 360) * (Math.PI / 180);
      const dirX = Math.cos(azMathRad);
      const dirY = Math.sin(azMathRad);

      const dist = shadowLengthH;

      if (dirY >= -1e-6) continue;
      const t = -dist / dirY;
      const wx = point.x + dirX * t;
      const wy = point.y - dist;
      const { sx, sy } = worldToScreen(wx, wy);

      slotCoords.push({ time: s.time, isDirect: s.isDirectSunlight, wx, wy, sx, sy });
    }

    for (let i = 0; i < slotCoords.length - 1; i++) {
      const c1 = slotCoords[i];
      const c2 = slotCoords[i + 1];
      if (!c1.isDirect || !c2.isDirect) continue;

      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(c1.sx, c1.sy);
      ctx.lineTo(c2.sx, c2.sy);
      ctx.closePath();
      ctx.fillStyle = fillCol;
      ctx.fill();
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    let groupStart = -1;
    for (let i = 0; i <= slotCoords.length - 1; i++) {
      const isDirect = slotCoords[i]?.isDirect ?? false;
      if (isDirect && groupStart < 0) {
        groupStart = i;
      }
      if ((!isDirect || i === slotCoords.length - 1) && groupStart >= 0) {
        const endIdx = isDirect ? i : i - 1;
        if (endIdx > groupStart) {
          ctx.beginPath();
          ctx.moveTo(slotCoords[groupStart].sx, slotCoords[groupStart].sy);
          for (let j = groupStart + 1; j <= endIdx; j++) {
            ctx.lineTo(slotCoords[j].sx, slotCoords[j].sy);
          }
          ctx.strokeStyle = solidCol;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Etykiety czasowe przy końcach dla metody Astro powiększone o 50%
          const startSlot = slotCoords[groupStart];
          const endSlot = slotCoords[endIdx];

          ctx.font = 'bold 13.5px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          if (startSlot?.time) {
            const tw1 = ctx.measureText(startSlot.time).width;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.strokeStyle = solidCol;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.roundRect(startSlot.sx - tw1 / 2 - 6, startSlot.sy + 5, tw1 + 12, 22, 5);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#f8fafc';
            ctx.fillText(startSlot.time, startSlot.sx, startSlot.sy + 16);
          }

          if (endSlot?.time) {
            const tw2 = ctx.measureText(endSlot.time).width;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.strokeStyle = solidCol;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.roundRect(endSlot.sx - tw2 / 2 - 6, endSlot.sy + 5, tw2 + 12, 22, 5);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#f8fafc';
            ctx.fillText(endSlot.time, endSlot.sx, endSlot.sy + 16);
          }
        }
        groupStart = -1;
      }
    }
  }

  // 2. Rysowanie promieni godzinowych (-5h do +5h) wyłącznie wewnątrz sektorów i bez opisów
  const hourLines = hourSystem.getHourLines(-5, 5, 1);

  for (const line of hourLines) {
    if (line.elevationDeg <= 0) continue;

    const azMathRad = ((90 - line.azimuthDeg + 360) % 360) * (Math.PI / 180);
    const dirX = Math.cos(azMathRad);
    const dirY = Math.sin(azMathRad);

    const dot = selectedPointResult.normal.x * dirX + selectedPointResult.normal.y * dirY;
    if (dot < -0.05) continue;

    // Sprawdzenie, czy promień leży wewnątrz któregoś z aktywnych bezpośrednich sektorów nasłonecznienia
    let sectorDist = shadowLengthH;
    let isInsideDirectSector = false;

    if (isLinijkaMethod && directSectors.length > 0) {
      for (let sIdx = 0; sIdx < directSectors.length; sIdx++) {
        const sec = directSectors[sIdx];
        if (line.azimuthDeg >= sec.startAzimuthDeg - 0.05 && line.azimuthDeg <= sec.endAzimuthDeg + 0.05) {
          isInsideDirectSector = true;
          sectorDist = (sec.requiredDistance && sec.requiredDistance > 0) ? sec.requiredDistance : shadowLengthH;
          break;
        }
      }
    } else if (!isLinijkaMethod) {
      const match = validSlots.find(
        (s: any) => Math.abs(s.azimuthDeg - line.azimuthDeg) < 3.0 && s.isDirectSunlight
      );
      if (match) {
        isInsideDirectSector = true;
      }
    }

    if (!isInsideDirectSector) continue;

    // Wyznaczenie punktu końcowego promienia na poziomej linii podstawy sektora
    const ep = calcRulerEndpoint(dirX, dirY, sectorDist);
    const hsScreen = worldToScreen(ep.wx, ep.wy);

    const isNoonRay = line.offsetHours === 0;
    ctx.beginPath();
    ctx.setLineDash(isNoonRay ? [] : [3, 4]);
    ctx.lineWidth = isNoonRay ? 2.0 : 1.2;
    ctx.strokeStyle = isNoonRay
      ? (isLinijkaMethod ? '#818cf8' : '#fbbf24')
      : (isLinijkaMethod ? 'rgba(165, 180, 252, 0.7)' : 'rgba(252, 211, 77, 0.65)');

    ctx.moveTo(px, py);
    ctx.lineTo(hsScreen.sx, hsScreen.sy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 3. Niewielki łuk 12° pomiędzy fasadą a krawędzią sektora w miejscu obcięcia
  const azSolarMin = hourSystem.getAzimuthForHour(hourSystem.solarNoonDecimal - 5.0);
  const azSolarMax = hourSystem.getAzimuthForHour(hourSystem.solarNoonDecimal + 5.0);
  const az12Morning = normalAzimuth - 78.0;
  const az12Afternoon = normalAzimuth + 78.0;

  const draw12DegArc = (startMathRad: number, endMathRad: number) => {
    const arcRadiusMeters = 2.0;
    const steps = 10;
    const stepDelta = (endMathRad - startMathRad) / steps;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;

    for (let i = 0; i <= steps; i++) {
      const ang = startMathRad + i * stepDelta;
      const wx = point.x + Math.cos(ang) * arcRadiusMeters;
      const wy = point.y + Math.sin(ang) * arcRadiusMeters;
      const sc = worldToScreen(wx, wy);
      if (i === 0) {
        ctx.moveTo(sc.sx, sc.sy);
      } else {
        ctx.lineTo(sc.sx, sc.sy);
      }
    }
    ctx.stroke();

    // Mała linia graniczna 12°
    const limWx = point.x + Math.cos(startMathRad) * (arcRadiusMeters * 1.35);
    const limWy = point.y + Math.sin(startMathRad) * (arcRadiusMeters * 1.35);
    const limSc = worldToScreen(limWx, limWy);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(limSc.sx, limSc.sy);
    ctx.stroke();

    // Etykieta 12°
    const midAng = (startMathRad + endMathRad) / 2;
    const lblWx = point.x + Math.cos(midAng) * (arcRadiusMeters * 1.4);
    const lblWy = point.y + Math.sin(midAng) * (arcRadiusMeters * 1.4);
    const lblSc = worldToScreen(lblWx, lblWy);

    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('12°', lblSc.sx, lblSc.sy);

    ctx.restore();
  };

  // Sprawdzenie strony porannej (wschód / lewa strona)
  if (az12Morning > azSolarMin + 0.5) {
    const isMorningCutoff = directSectors.some(
      (sec: any) => Math.abs(sec.startAzimuthDeg - az12Morning) < 1.0
    );
    if (isMorningCutoff) {
      // Łuk od promienia 12° (+78° od normalnej) do lica fasady (+90° od normalnej)
      draw12DegArc(normalMathRad + (78 * Math.PI) / 180, normalMathRad + (90 * Math.PI) / 180);
    }
  }

  // Sprawdzenie strony popołudniowej (zachód / prawa strona)
  if (az12Afternoon < azSolarMax - 0.5) {
    const isAfternoonCutoff = directSectors.some(
      (sec: any) => Math.abs(sec.endAzimuthDeg - az12Afternoon) < 1.0
    );
    if (isAfternoonCutoff) {
      // Łuk od promienia 12° (-78° od normalnej) do lica fasady (-90° od normalnej)
      draw12DegArc(normalMathRad - (78 * Math.PI) / 180, normalMathRad - (90 * Math.PI) / 180);
    }
  }

  // 4. Etykieta nad punktem wstawienia fasady: sam łączny czas w formacie "H:MM" (np. "2:17")
  const badgeY = py - 20;
  const solidCol = getSunlightColor(sunlight.totalHours, 1.0);
  const titleText = formatHoursAndMinutes(sunlight.totalHours);

  ctx.font = 'bold 12.5px monospace';
  const tw = ctx.measureText(titleText).width;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.strokeStyle = solidCol;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(px - tw / 2 - 8, badgeY - 10, tw + 16, 20, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = solidCol;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(titleText, px, badgeY);

  ctx.restore();
}

