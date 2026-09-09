export const SHARE_V2_BUILDING_DEFAULTS = {
  category: 'building' as const,
  elevation: 0.0,
  firstFloorHeight: 3.0,
  typicalFloorHeight: 3.0,
  hWindowBottom: 0.85,
  isCityCentre: false,
  buildingType: 'residential' as const,
  isIncluded: true,
  transform: { tx: 0, ty: 0, rotationDeg: 0 },
};

/** Assigns `value` onto `out[key]` unless it's undefined or deep-equal to `def`. */
export function omitIfDefault<T extends object, K extends keyof T>(
  out: T,
  key: K,
  value: T[K] | undefined,
  def: T[K]
): void {
  if (value === undefined) return;
  const isDefault =
    typeof def === 'object' && def !== null
      ? JSON.stringify(value) === JSON.stringify(def)
      : value === def;
  if (!isDefault) out[key] = value;
}
