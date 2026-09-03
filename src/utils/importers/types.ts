import { BuildingLoop, Point2D } from '../../types/geometry';
import { CrsDetectionResult } from '../geoTransform';

export interface DocumentMetadata {
  crs?: CrsDetectionResult;
  unitInfo?: {
    unit: string;
    scale: number;
    unitName: string;
    source: string;
  };
  sourceFormat: string;
  importedAt: Date;
  rawStats?: Record<string, unknown>;
}

export interface SceneDocument {
  buildings: BuildingLoop[];
  metadata: DocumentMetadata;
}

export interface GeometryImporter<TInput, TOptions = unknown> {
  readonly formatName: string;
  canHandle(input: unknown): input is TInput;
  import(input: TInput, options?: TOptions): Promise<SceneDocument> | SceneDocument;
}
