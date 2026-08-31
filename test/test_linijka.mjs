/**
 * Test skryptu Metody Linijki Słońca na scenie z docs/usi-light-scene-2026-08-30.json
 */
import { readFileSync } from 'fs';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function getDayOfYear(month, day) {
  const d = [0,31,28,31,30,31,30,31,31,30,31,30,31];
  let n = day;
  for (let m = 1; m < month; m++) n += d[m];
  return n;
}

function solarPos(lat, lon, month, day, hour, tz = 1) {
  const doy = getDayOfYear(month, day);
  const g = (2*Math.PI/365)*(doy-1+(hour-12)/24);
  const eq = 229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
  const decl = 0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
  const tst = hour*60 + eq + 4*lon - 60*tz;
  const haDeg = tst/4 - 180;
  const haR = haDeg*DEG2RAD, latR = lat*DEG2RAD;
  const cz = Math.sin(latR)*Math.sin(decl)+Math.cos(latR)*Math.cos(decl)*Math.cos(haR);
  const zenR = Math.acos(Math.max(-1,Math.min(1,cz)));
  const elev = 90 - zenR*RAD2DEG;
  let az = 180;
  if (elev < 89.9) {
    const ca = (Math.sin(latR)*Math.cos(zenR)-Math.sin(decl))/(Math.cos(latR)*Math.sin(zenR)+1e-10);
    const a = Math.acos(Math.max(-1,Math.min(1,ca)))*RAD2DEG;
    az = haDeg > 0 ? (a+180)%360 : (540-a)%360;
  }
  const noonMin = 720 - 4*lon - eq + tz*60;
  return { az: (az+360)%360, elev, noon: noonMin/60 };
}

function hourAtAz(az, lat, lon, month, day) {
  let lo=4, hi=20;
  for (let i=0;i<28;i++) {
    const mid=(lo+hi)/2;
    solarPos(lat,lon,month,day,mid).az < az ? lo=mid : hi=mid;
  }
  return (lo+hi)/2;
}

// ─── Wczytaj scenę ────────────────────────────────────────────────────────────
const scene = JSON.parse(readFileSync('/Volumes/Samsam/py/usi-light/docs/usi-light-scene-2026-08-30.json','utf8'));
const { buildings, settings, selectedPointKey } = scene;
const { latitude: lat, longitude: lon, equinoxDate } = settings;
const month = equinoxDate === 'autumn' ? 9 : 3;
const day   = equinoxDate === 'autumn' ? 23 : 21;

const tBldg = buildings.find(b => b.id === selectedPointKey.buildingId);
const tSeg  = tBldg.segments.find(s => s.id === selectedPointKey.segmentId);
const r = selectedPointKey.offsetRatio;
const P = {
  x: tSeg.p1.x + r*(tSeg.p2.x - tSeg.p1.x),
  y: tSeg.p1.y + r*(tSeg.p2.y - tSeg.p1.y),
};
const N = tSeg.normal;

console.log(`\n${'═'.repeat(70)}`);
console.log(`Punkt P=(${P.x.toFixed(4)}, ${P.y.toFixed(4)})  normalnia N=(${N.x},${N.y})  hTop=${tSeg.hTop}`);

const noon = solarPos(lat,lon,month,day,12);
const noonH = noon.noon;
const startH = Math.max(5.0, noonH-5), endH = Math.min(19.0, noonH+5);
const sp = solarPos(lat,lon,month,day,startH);
const ep = solarPos(lat,lon,month,day,endH);
const azSolMin = Math.min(sp.az,ep.az), azSolMax = Math.max(sp.az,ep.az);
const normalAz = ((Math.atan2(N.x,N.y)*RAD2DEG+360)%360);
const azMin = Math.max(azSolMin, normalAz-78);
const azMax = Math.min(azSolMax, normalAz+78);
const k = Math.tan(lat*DEG2RAD);

console.log(`Górowanie: ${noonH.toFixed(3)}h | az słońca: [${azSolMin.toFixed(2)}°,${azSolMax.toFixed(2)}°]`);
console.log(`Normalnia az: ${normalAz.toFixed(2)}° | Zakres aktywny: [${azMin.toFixed(4)}°, ${azMax.toFixed(4)}°]`);
console.log(`k=tan(${lat}°)=${k.toFixed(6)}\n`);

// ─── Pętla po odcinkach ───────────────────────────────────────────────────────
const rawBlocked = [];
console.log('OCENA ODCINKÓW PRZESZKÓD:\n');

for (const bldg of buildings) {
  for (const seg of bldg.segments) {
    if (bldg.id === tBldg.id && seg.id === tSeg.id) continue;

    const v1x=seg.p1.x-P.x, v1y=seg.p1.y-P.y;
    const v2x=seg.p2.x-P.x, v2y=seg.p2.y-P.y;
    const d1=v1x*N.x+v1y*N.y, d2=v2x*N.x+v2y*N.y;

    // FILTR 1
    if (d1 < -0.01 && d2 < -0.01) {
      console.log(`  F1-SKIP  ${bldg.id}/${seg.id}  (za fasadą: dot1=${d1.toFixed(2)}, dot2=${d2.toFixed(2)})`);
      continue;
    }

    const H = Math.max(0, seg.hTop);
    if (H <= 0) continue;

    // FILTR 2 (L×1.5)
    const yPre = P.y - H*1.5;
    if (seg.p1.y < yPre && seg.p2.y < yPre) {
      console.log(`  F2-SKIP  ${bldg.id}/${seg.id}  (L×1.5=${yPre.toFixed(2)}: p1.y=${seg.p1.y.toFixed(2)}, p2.y=${seg.p2.y.toFixed(2)})`);
      continue;
    }

    const yL = P.y - H*k;

    let p1={x:seg.p1.x,y:seg.p1.y}, p2={x:seg.p2.x,y:seg.p2.y};
    const op1={...p1}, op2={...p2};

    // KROK 3/4
    if (p1.y < yL && p2.y < yL) {
      console.log(`  L-SKIP   ${bldg.id}/${seg.id}  (oba < yL=${yL.toFixed(2)})`);
      continue;
    }

    // KROK 5 – przycięcie
    let clipped = '';
    if (p1.y < yL) {
      const t=(yL-p1.y)/(p2.y-p1.y);
      p1={x:p1.x+t*(p2.x-p1.x),y:yL};
      clipped='p1→yL';
    } else if (p2.y < yL) {
      const t=(yL-p1.y)/(p2.y-p1.y);
      p2={x:p1.x+t*(p2.x-p1.x),y:yL};
      clipped='p2→yL';
    }

    if (Math.hypot(p2.x-p1.x,p2.y-p1.y) < 0.05) continue;

    // Azymuty
    const a1=((Math.atan2(p1.x-P.x,p1.y-P.y)*RAD2DEG+360)%360);
    const a2=((Math.atan2(p2.x-P.x,p2.y-P.y)*RAD2DEG+360)%360);
    const diff=Math.abs(a1-a2);

    const tag = `  PASS     ${bldg.id}/${seg.id}  N=(${seg.normal.x},${seg.normal.y}) H=${H} yL=${yL.toFixed(2)}${clipped?' ['+clipped+']':''}`;
    console.log(tag);
    console.log(`           orig  p1=(${op1.x.toFixed(2)},${op1.y.toFixed(2)}) p2=(${op2.x.toFixed(2)},${op2.y.toFixed(2)})`);
    if (clipped) console.log(`           clip  p1=(${p1.x.toFixed(2)},${p1.y.toFixed(2)}) p2=(${p2.x.toFixed(2)},${p2.y.toFixed(2)})`);
    console.log(`           az1=${a1.toFixed(4)}° az2=${a2.toFixed(4)}° diff=${diff.toFixed(2)}°`);

    // Interwały
    const intervals = diff > 180
      ? [[Math.max(a1,a2), 360], [0, Math.min(a1,a2)]]
      : [[Math.min(a1,a2), Math.max(a1,a2)]];

    for (const [bs,be] of intervals) {
      const cs=Math.max(azMin,bs), ce=Math.min(azMax,be);
      if (ce > cs+0.01) {
        rawBlocked.push({startAz:cs, endAz:ce, id:`${bldg.id}/${seg.id}`});
        console.log(`           → BLOCKED [${cs.toFixed(4)}°, ${ce.toFixed(4)}°]`);
      } else {
        console.log(`           → poza zakresem aktywnym`);
      }
    }
    console.log('');
  }
}

// ─── Scalanie ─────────────────────────────────────────────────────────────────
rawBlocked.sort((a,b) => a.startAz-b.startAz);
const merged=[];
for (const b of rawBlocked) {
  if (!merged.length) { merged.push({...b}); continue; }
  const last=merged[merged.length-1];
  if (b.startAz <= last.endAz+0.05) last.endAz=Math.max(last.endAz,b.endAz);
  else merged.push({...b});
}

console.log(`${'─'.repeat(70)}`);
console.log(`Zakres aktywny:  [${azMin.toFixed(4)}°, ${azMax.toFixed(4)}°]`);
console.log(`Scalone cienie:  ${merged.map(m=>`[${m.startAz.toFixed(4)}°,${m.endAz.toFixed(4)}°]`).join('  ')}`);

console.log(`\nWOLNE SEKTORY (= fałszywe paski nasłonecznienia):`);
let cursor=azMin, totalH=0;
for (const b of merged) {
  if (b.startAz > cursor+0.01) {
    const h1=hourAtAz(cursor,lat,lon,month,day);
    const h2=hourAtAz(b.startAz,lat,lon,month,day);
    const dt=Math.abs(h2-h1);
    const midElev=solarPos(lat,lon,month,day,(h1+h2)/2).elev;
    console.log(`  ⚡ [${cursor.toFixed(4)}°, ${b.startAz.toFixed(4)}°]  Δaz=${( b.startAz-cursor).toFixed(4)}°  ≈${(dt*60).toFixed(2)} min  elev_słońca≈${midElev.toFixed(1)}°`);
    totalH+=dt;
  }
  cursor=Math.max(cursor,b.endAz);
}
if (cursor < azMax-0.01) {
  const h1=hourAtAz(cursor,lat,lon,month,day);
  const h2=hourAtAz(azMax,lat,lon,month,day);
  const dt=Math.abs(h2-h1);
  const midElev=solarPos(lat,lon,month,day,(h1+h2)/2).elev;
  console.log(`  ⚡ [${cursor.toFixed(4)}°, ${azMax.toFixed(4)}°]  Δaz=${(azMax-cursor).toFixed(4)}°  ≈${(dt*60).toFixed(2)} min  elev_słońca≈${midElev.toFixed(1)}°`);
  totalH+=dt;
}
if (totalH < 0.001) console.log('  ✅ Brak wolnych sektorów — punkt w pełni zacieniowany');
else console.log(`\n  ⚠️  ŁĄCZNY BŁĘDNY CZAS: ${(totalH*60).toFixed(2)} min (${totalH.toFixed(4)} h)`);
console.log(`${'═'.repeat(70)}\n`);
