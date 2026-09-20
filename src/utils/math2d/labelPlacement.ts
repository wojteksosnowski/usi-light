import { Point2D } from '../../types/geometry';

export interface ScreenLabelItem {
  id: string;
  originalAnchor: Point2D;
  screenPos: { sx: number; sy: number };
  width: number;
  height: number;
  type: 'plus' | 'minus' | 'standard';
}

export interface PlacedLabelItem extends ScreenLabelItem {
  placedScreenPos: { sx: number; sy: number };
}

/**
 * Sprawdza czy dwa prostokąty AABB na ekranie nachodzą na siebie z uwzględnieniem marginesu.
 */
function boxesOverlap(
  pos1: { sx: number; sy: number },
  w1: number,
  h1: number,
  pos2: { sx: number; sy: number },
  w2: number,
  h2: number,
  padding: number = 4
): boolean {
  const left1 = pos1.sx - w1 / 2 - padding;
  const right1 = pos1.sx + w1 / 2 + padding;
  const top1 = pos1.sy - h1 / 2 - padding;
  const bottom1 = pos1.sy + h1 / 2 + padding;

  const left2 = pos2.sx - w2 / 2 - padding;
  const right2 = pos2.sx + w2 / 2 + padding;
  const top2 = pos2.sy - h2 / 2 - padding;
  const bottom2 = pos2.sy + h2 / 2 + padding;

  return !(left1 > right2 || right1 < left2 || top1 > bottom2 || bottom1 < top2);
}

/**
 * Rozmieszcza etykiety ekranowe w sposób antykolizyjny (Collision-Free AABB Relaxation).
 * Jeśli dwie etykiety na siebie nachodzą, przesuwa je wzdłuż wektora odsunięcia
 * tak, aby każda pozostała czytelna i klikalna.
 */
export function resolveScreenLabelPositions(
  labels: ScreenLabelItem[],
  padding: number = 4
): PlacedLabelItem[] {
  if (labels.length === 0) return [];
  if (labels.length === 1) {
    return [{ ...labels[0], placedScreenPos: { ...labels[0].screenPos } }];
  }

  const placed: PlacedLabelItem[] = labels.map((l) => ({
    ...l,
    placedScreenPos: { ...l.screenPos },
  }));

  // Wielopoziomowy test i relaksacja kolizji (maks 4 iteracje, aby zachować wysoką wydajność 60 FPS)
  const maxIterations = 4;
  for (let iter = 0; iter < maxIterations; iter++) {
    let hadCollision = false;

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const itemA = placed[i];
        const itemB = placed[j];

        if (
          boxesOverlap(
            itemA.placedScreenPos,
            itemA.width,
            itemA.height,
            itemB.placedScreenPos,
            itemB.width,
            itemB.height,
            padding
          )
        ) {
          hadCollision = true;

          let dx = itemB.placedScreenPos.sx - itemA.placedScreenPos.sx;
          let dy = itemB.placedScreenPos.sy - itemA.placedScreenPos.sy;
          const dist = Math.hypot(dx, dy);

          if (dist < 1e-3) {
            // Dokładne pokrycie - rozsuwamy poziomo i pionowo
            dx = 1;
            dy = 0.5;
          } else {
            dx /= dist;
            dy /= dist;
          }

          const overlapAmount =
            Math.max(itemA.width, itemB.width) / 2 +
            Math.max(itemA.height, itemB.height) / 2 +
            padding -
            dist;
          const shift = Math.max(4, overlapAmount / 2 + 2);

          itemA.placedScreenPos.sx -= dx * shift;
          itemA.placedScreenPos.sy -= dy * shift;
          itemB.placedScreenPos.sx += dx * shift;
          itemB.placedScreenPos.sy += dy * shift;
        }
      }
    }

    if (!hadCollision) break;
  }

  return placed;
}
