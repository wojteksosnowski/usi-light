declare module 'rbush' {
  interface BBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }

  export default class RBush<T = BBox> {
    constructor(maxEntries?: number);
    all(): T[];
    search(bbox: BBox): T[];
    collides(bbox: BBox): boolean;
    load(data: T[]): this;
    insert(item: T): this;
    remove(item: T, equalsFn?: (a: T, b: T) => boolean): this;
    clear(): this;
    toBBox(item: T): BBox;
    toJSON(): unknown;
    fromJSON(data: unknown): this;
  }
}
