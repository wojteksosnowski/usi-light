import React from 'react';
import { Modifier, ModifierType } from '../../types/modifiers';
import { GlobalIndexOption } from './modifierIndexOptions';

export interface ModifierFieldContext {
  availableEdges: GlobalIndexOption[];
  availableVertices: GlobalIndexOption[];
}

export interface ModifierFieldsProps<M extends Modifier> {
  modifier: M;
  onChange: (patch: Partial<M>) => void;
  context: ModifierFieldContext;
}

export interface ModifierDescriptor<M extends Modifier = Modifier> {
  type: M['type'];
  title: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  accentVar: string;
  createDefault: () => M;
  renderFields: React.ComponentType<ModifierFieldsProps<M>>;
  /** Zwięzłe podsumowanie modyfikatora (np. do quick-listy w ToolsGroup) — jedyne miejsce z logiką formatowania per typ. */
  formatSummary: (modifier: M) => string;
}

// Rzutowane na typ generyczny wewnątrz — każdy wpis w modifierDescriptors.tsx jest wciąż w pełni
// typowany dla swojego konkretnego Modifier, tylko wspólna mapa jest heterogeniczna.
export type ModifierDescriptorMap = Record<ModifierType, ModifierDescriptor<any>>;
