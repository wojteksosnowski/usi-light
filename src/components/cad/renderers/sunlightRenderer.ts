import { CadRenderContext } from '../types';
import { calculateSolarPosition, AstroSolarSystem, LinijkaSolarSystem } from '../../../utils/solar';
import { APP_CONFIG } from '../../../config/appConfig';

// Purple-to-Orange sunlight color scale in 30-minute steps from APP_CONFIG
export const getSunlightColor = (hours: number, alpha: number = APP_CONFIG.analysisBands.defaultAlpha) => {
  return APP_CONFIG.analysisBands.sunlight.getColor(hours, alpha);
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
  const sectors = shadowing?.sectors ?? [];

  const getRayDist = (azimuthDeg: number): number => {
    const mathDeg = ((90 - azimuthDeg) % 360 + 360) % 360;
    const relDeg = ((mathDeg - normalWorldDeg) % 360 + 360) % 360;

    for (let sIdx = 0; sIdx < sectors.length; sIdx++) {
      const sec = sectors[sIdx];
      const startRel = ((sec.startAngleDeg % 360) + 360) % 360;
      const span = sec.spanDeg ?? 0;
      const delta = ((relDeg - startRel) % 360 + 360) % 360;
      if (delta > span + 0.01) continue;

      if (sec.isFree) {
        const prevReq = sIdx > 0 ? (sectors[sIdx - 1].requiredDistance ?? 0) : 0;
        const nextReq = sIdx < sectors.length - 1 ? (sectors[sIdx + 1].requiredDistance ?? 0) : 0;
        const boundingReq = Math.max(sec.requiredDistance ?? 0, prevReq, nextReq);
        return boundingReq > 0 ? Math.min(boundingReq, maxAllowedReq) : shadowLengthH;
      } else {
        const req = sec.requiredDistance ?? 0;
        return Math.min(req > 0 ? req : maxAllowedReq, maxAllowedReq);
      }
    }
    return shadowLengthH;
  };

  const validSlots = slots.filter(
    (s: any) => s.isSunAboveHorizon && s.elevationDeg > 0.5 && s.isAngleAbove12Deg
  );

  ctx.save();

  const normalMathRad = (normalWorldDeg * Math.PI) / 180;
  const rayLen = Math.max(shadowLengthH * 1.5, 20.0);

  // 1. Rysowanie linii granicznych 12° od lica badanego odcinka (±78° od normalnej)
  const angleLim1 = normalMathRad + (78 * Math.PI) / 180;
  const limP1 = {
    wx: point.x + Math.cos(angleLim1) * rayLen,
    wy: point.y + Math.sin(angleLim1) * rayLen,
  };
  const limS1 = worldToScreen(limP1.wx, limP1.wy);

  const angleLim2 = normalMathRad - (78 * Math.PI) / 180;
  const limP2 = {
    wx: point.x + Math.cos(angleLim2) * rayLen,
    wy: point.y + Math.sin(angleLim2) * rayLen,
  };
  const limS2 = worldToScreen(limP2.wx, limP2.wy);

  ctx.beginPath();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 2.0;

  ctx.moveTo(px, py);
  ctx.lineTo(limS1.sx, limS1.sy);

  ctx.moveTo(px, py);
  ctx.lineTo(limS2.sx, limS2.sy);
  ctx.stroke();
  ctx.setLineDash([]);

  // Etykiety 12°
  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = '#eab308';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('12° od lica', limS1.sx, limS1.sy - 4);
  ctx.fillText('12° od lica', limS2.sx, limS2.sy - 4);

  // 2. Rysowanie promieni kolejnych pełnych godzin słonecznych (-5h do +5h) ze struktur HourLine2D
  const isLinijkaMethod =
    rc.sunlightMethod === 'segments' || (sunlight.sectors !== undefined && rc.sunlightMethod !== 'raycasting');
  const lat = latitude ?? 52.2297;
  const lon = longitude ?? 21.0122;
  const eqDate = equinoxDate ?? 'spring';

  const hourSystem = isLinijkaMethod
    ? new LinijkaSolarSystem(lat, lon, eqDate)
    : new AstroSolarSystem(lat, lon, eqDate);

  const noonHourDec = hourSystem.solarNoonDecimal;

  // Pobranie prekomputowanych i zapisanych linii godzinowych dla aktywnego systemu (-5h do +5h od górowania)
  const hourLines = hourSystem.getHourLines(-5, 5, 1);

  ctx.save();
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const line of hourLines) {
    if (line.elevationDeg <= 0) continue;

    const azMathRad = ((90 - line.azimuthDeg + 360) % 360) * (Math.PI / 180);
    const dirX = Math.cos(azMathRad);
    const dirY = Math.sin(azMathRad);

    const dot = selectedPointResult.normal.x * dirX + selectedPointResult.normal.y * dirY;
    if (dot < -0.05) continue;

    const hp = {
      wx: point.x + dirX * rayLen,
      wy: point.y + dirY * rayLen,
    };
    const hsScreen = worldToScreen(hp.wx, hp.wy);

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

    const label = line.offsetLabel;
    ctx.fillText(label, hsScreen.sx, hsScreen.sy);
  }
  ctx.restore();

  const calcRulerEndpoint = (dirX: number, dirY: number, d: number) => {
    // Podstawa trójkąta Linijki Słońca leży zawsze na poziomej linii E-W: Y = point.y - d
    // gdzie d = H / tan(phi). Wektor promienia (dirX, dirY) przecina prostą Y = point.y - d:
    if (dirY < -1e-5) {
      const t = -d / dirY;
      return { wx: point.x + dirX * t, wy: point.y - d };
    } else {
      // Dla promieni bliskich poziomu
      return { wx: point.x + dirX * (d * 5.0), wy: point.y - d };
    }
  };

  // 3. Rysowanie sektorów / wachlarza światła
  if (isLinijkaMethod && sunlight.sectors && sunlight.sectors.length > 0) {
    const directSectors = sunlight.sectors.filter((s: any) => s.isDirectSunlight && s.spanDeg > 0.05);

    for (const sec of directSectors) {
      const az1MathRad = ((90 - sec.startAzimuthDeg + 360) % 360) * (Math.PI / 180);
      const dirX1 = Math.cos(az1MathRad);
      const dirY1 = Math.sin(az1MathRad);

      const az2MathRad = ((90 - sec.endAzimuthDeg + 360) % 360) * (Math.PI / 180);
      const dirX2 = Math.cos(az2MathRad);
      const dirY2 = Math.sin(az2MathRad);

      const dist = shadowLengthH;

      const p1 = calcRulerEndpoint(dirX1, dirY1, dist);
      const s1 = worldToScreen(p1.wx, p1.wy);

      const p2 = calcRulerEndpoint(dirX2, dirY2, dist);
      const s2 = worldToScreen(p2.wx, p2.wy);

      const fillCol = getSunlightColor(sunlight.totalHours, 0.35);
      const strokeCol = getSunlightColor(sunlight.totalHours, 0.85);
      const solidCol = getSunlightColor(sunlight.totalHours, 1.0);

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

      // Pozioma podstawa E-W
      ctx.beginPath();
      ctx.moveTo(s1.sx, s1.sy);
      ctx.lineTo(s2.sx, s2.sy);
      ctx.strokeStyle = solidCol;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      const midSx = (s1.sx + s2.sx) / 2;
      const midSy = (s1.sy + s2.sy) / 2;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#f8fafc';
      const timeLabel = sec.startTimeStr && sec.endTimeStr ? `${sec.startTimeStr}–${sec.endTimeStr} ` : '';
      ctx.fillText(`${timeLabel}(${sec.hours.toFixed(2)}h, ${sec.spanDeg.toFixed(1)}°)`, midSx, midSy + 6);
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

      const dist = getRayDist(s.azimuthDeg);

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
        }
        groupStart = -1;
      }
    }
  }

  // 4. Badge tytułowy metody
  const badgeY = py - 24;
  const solidCol = getSunlightColor(sunlight.totalHours, 1.0);
  const labelPrefix = selectedPointResult.label ? `${selectedPointResult.label}: ` : '';
  const titleText = isLinijkaMethod
    ? `${labelPrefix}Linijka Słońca (H=${heightH.toFixed(0)}m, ${sunlight.totalHours.toFixed(2)}h)`
    : `${labelPrefix}Metoda Astro (H=${heightH.toFixed(0)}m, ${sunlight.totalHours.toFixed(2)}h)`;
  ctx.font = 'bold 11px sans-serif';
  const tw = ctx.measureText(titleText).width;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = solidCol;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(px - tw / 2 - 8, badgeY - 8, tw + 16, 20, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = solidCol;
  ctx.textBaseline = 'middle';
  ctx.fillText(titleText, px, badgeY + 2);

  ctx.restore();
}
