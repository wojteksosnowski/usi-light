import { Point2D } from '../../types/geometry';

/**
 * Affine Matrix 2D representation:
 * [ a, c, e ]   [ m00, m01, m02 ]   [ x ]
 * [ b, d, f ] = [ m10, m11, m12 ] * [ y ]
 * [ 0, 0, 1 ]   [   0,   0,   1 ]   [ 1 ]
 *
 * Compatible with Canvas 2D ctx.setTransform(a, b, c, d, e, f) and SVG matrix(a, b, c, d, e, f).
 */
export interface AffineMatrix2D {
  readonly a: number; // scaleX * cos
  readonly b: number; // scaleX * sin (or skewY)
  readonly c: number; // -scaleY * sin (or skewX)
  readonly d: number; // scaleY * cos
  readonly e: number; // translateX
  readonly f: number; // translateY
}

export const IDENTITY_MATRIX: AffineMatrix2D = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
};

/**
 * Creates a matrix representing: Translation -> Camera Rotation -> Scale (with flipped Y for CAD coords).
 *
 * Camera rotated CCW by angle `rot` (e.g. aligned with a world vector at angle `rot`) projects world (wx, wy)
 * such that vectors at angle `rot` become horizontal (angle 0°) on screen:
 * sx = panX + scale * ( wx * cos(rot) + wy * sin(rot) )
 * sy = panY - scale * ( -wx * sin(rot) + wy * cos(rot) ) = panY + scale * wx * sin(rot) - scale * wy * cos(rot)
 *
 * Matrix equation:
 * sx = a * wx + c * wy + e
 * sy = b * wx + d * wy + f
 *
 * Where:
 * a = scale * cos(rot)
 * b = scale * sin(rot)
 * c = scale * sin(rot)
 * d = -scale * cos(rot)
 * e = panX
 * f = panY
 */
export function createViewportMatrix(
  panX: number,
  panY: number,
  scale: number,
  rotationDeg: number = 0
): AffineMatrix2D {
  const rotRad = (rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  return {
    a: scale * cosR,
    b: scale * sinR,
    c: scale * sinR,
    d: -scale * cosR,
    e: panX,
    f: panY,
  };
}

/**
 * Returns the render context's precomputed viewport matrix, falling back to building one
 * from viewState/rotation for contexts that don't carry it.
 */
export function resolveViewportMatrix(
  rc: { viewportMatrix?: AffineMatrix2D },
  viewState: { panX: number; panY: number; scale: number },
  viewRotationDeg: number
): AffineMatrix2D {
  return rc.viewportMatrix || createViewportMatrix(viewState.panX, viewState.panY, viewState.scale, viewRotationDeg);
}

/**
 * Inverts an affine matrix 2D.
 */
export function invertAffineMatrix(m: AffineMatrix2D): AffineMatrix2D {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) {
    return IDENTITY_MATRIX;
  }
  const invDet = 1.0 / det;

  return {
    a: m.d * invDet,
    b: -m.b * invDet,
    c: -m.c * invDet,
    d: m.a * invDet,
    e: (m.c * m.f - m.d * m.e) * invDet,
    f: (m.b * m.e - m.a * m.f) * invDet,
  };
}

/**
 * Multiplies two affine matrices: result = m1 * m2
 */
export function multiplyAffineMatrices(m1: AffineMatrix2D, m2: AffineMatrix2D): AffineMatrix2D {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

/**
 * Transforms a 2D point using an affine matrix.
 */
export function transformPoint(m: AffineMatrix2D, x: number, y: number, out?: Point2D): Point2D {
  const tx = m.a * x + m.c * y + m.e;
  const ty = m.b * x + m.d * y + m.f;
  if (out) {
    out.x = tx;
    out.y = ty;
    return out;
  }
  return { x: tx, y: ty };
}

/**
 * Batch-transforms a flat Float32Array [x0, y0, x1, y1, ...] in place or into an output array.
 */
export function transformPointsFlat(
  m: AffineMatrix2D,
  inFlat: Float32Array | number[],
  outFlat?: Float32Array
): Float32Array {
  const count = inFlat.length;
  const out = outFlat || new Float32Array(count);
  const a = m.a;
  const b = m.b;
  const c = m.c;
  const d = m.d;
  const e = m.e;
  const f = m.f;

  for (let i = 0; i < count; i += 2) {
    const x = inFlat[i];
    const y = inFlat[i + 1];
    out[i] = a * x + c * y + e;
    out[i + 1] = b * x + d * y + f;
  }
  return out;
}

/**
 * Sets the 2D transformation directly to CanvasRenderingContext2D.
 */
export function applyMatrixToContext(m: AffineMatrix2D, ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
}
