/**
 * Konwersja liczby całkowitej na cyfry rzymskie (np. 1 -> I, 4 -> IV, 5 -> V, 9 -> IX, 14 -> XIV)
 */
export function toRomanNumeral(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return '';
  const n = Math.floor(num);
  const romanMap: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];

  let result = '';
  let rest = n;
  for (const [val, letter] of romanMap) {
    while (rest >= val) {
      result += letter;
      rest -= val;
    }
  }
  return result;
}

export interface BuildingFloorCalculation {
  storeysCount: number; // Liczba pełnych kondygnacji (N >= 1)
  storeysRoman: string; // Liczba kondygnacji w cyfrach rzymskich (np. "IV")
  firstFloorH: number; // Wysokość parteru H1
  typicalFloorH: number; // Wysokość kondygnacji typowej Ht
  storeysHeightSum: number; // H1 + (N - 1) * Ht
  atticHeight: number; // Wysokość attyki: max(0, H_total - storeysHeightSum)
  intervals: {
    index: number; // 0, 1, 2...
    label: string; // "I", "II", ...
    hBottom: number;
    hTop: number;
    storyHeight: number;
    isFirst: boolean;
    isLastStory: boolean;
  }[];
}

/**
 * Wylicza automatyczną liczbę kondygnacji oraz wysokość attyki:
 * - N = 1 + floor((H_total - H1) / Ht) dla H_total > H1
 * - H_attyka = H_total - (H1 + (N - 1) * Ht)
 */
export function calculateBuildingFloors(
  totalHeight: number,
  firstFloorH: number = 3.0,
  typicalFloorH: number = 3.0,
  elevation: number = 0.0,
  explicitStoreysCount?: number
): BuildingFloorCalculation {
  const hTot = Math.max(0.5, totalHeight || 15.0);
  const h1 = Math.max(1.0, firstFloorH || 3.0);
  const ht = Math.max(1.0, typicalFloorH || 3.0);

  let storeysCount = explicitStoreysCount && explicitStoreysCount > 0 ? explicitStoreysCount : 1;
  if (!explicitStoreysCount || explicitStoreysCount <= 0) {
    if (hTot > h1) {
      const rawUpperStoreys = Math.floor((hTot - h1) / ht);
      storeysCount = 1 + Math.max(0, rawUpperStoreys);
    } else {
      storeysCount = 1;
    }
  }

  const storeysHeightSum = Number((h1 + (storeysCount - 1) * ht).toFixed(2));
  const rawAttic = Number((hTot - storeysHeightSum).toFixed(2));
  const atticHeight = Math.max(0, rawAttic);

  const intervals: BuildingFloorCalculation['intervals'] = [];
  let curr = elevation;
  const targetTop = Number((elevation + hTot).toFixed(2));

  for (let i = 0; i < storeysCount; i++) {
    const isFirst = i === 0;
    const isLastStory = i === storeysCount - 1;
    const nominalH = isFirst ? h1 : ht;
    
    let next: number;
    if (isLastStory) {
      next = targetTop;
    } else {
      next = Number(Math.min(targetTop, curr + nominalH).toFixed(2));
    }

    const storyH = Number((next - curr).toFixed(2));

    intervals.push({
      index: i,
      label: toRomanNumeral(i + 1),
      hBottom: Number(curr.toFixed(2)),
      hTop: next,
      storyHeight: storyH,
      isFirst,
      isLastStory,
    });

    curr = next;
  }

  return {
    storeysCount,
    storeysRoman: toRomanNumeral(storeysCount),
    firstFloorH: h1,
    typicalFloorH: ht,
    storeysHeightSum,
    atticHeight,
    intervals,
  };
}
