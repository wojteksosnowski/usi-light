import {
  createDefaultBayWindowModifier,
  createDefaultCornerCutModifier,
  createDefaultDonutModifier,
  createDefaultGateModifier,
  createDefaultStoryOffsetModifier,
  createDefaultTerraceModifier,
  createDefaultZoneOffsetModifier,
} from '../../types/modifiers';
import { SetbackPenthouseIcon } from '../icons/SetbackPenthouseIcon';
import { BayWindowIcon, TerraceIcon, DonutIcon, ZoneBufferIcon, ChamferIcon, GatePassageIcon } from '../common/CustomCadIcons';
import { ModifierDescriptorMap } from './modifierDescriptorTypes';
import { StoryOffsetFields } from './panels/StoryOffsetFields';
import { ZoneOffsetFields } from './panels/ZoneOffsetFields';
import { BayWindowFields } from './panels/BayWindowFields';
import { TerraceFields } from './panels/TerraceFields';
import { DonutFields } from './panels/DonutFields';
import { CornerCutFields } from './panels/CornerCutFields';
import { GateFields } from './panels/GateFields';

function formatSigned(value: number): string {
  return value > 0 ? `+${value}m` : `${value}m`;
}

/** Sufiks zakresu kondygnacji współdzielony przez modyfikatory operujące na StoryRangeSelector. */
function formatStoriesSuffix(storiesCount: number): string {
  if (storiesCount === 0) return '(całość)';
  return storiesCount < 0 ? `(${storiesCount} góra)` : `(+${storiesCount} dół)`;
}

/**
 * Jedyne źródło prawdy dla wyglądu (tytuł/ikona/kolor akcentu), domyślnych wartości,
 * pól sterujących i zwięzłego podsumowania (formatSummary) każdego typu modyfikatora.
 * Używane przez BuildingModifiersPanel oraz przez pasek narzędzi (ToolsGroup.tsx) — żadne
 * z tych miejsc nie definiuje własnych literałów domyślnych ani własnego mapowania
 * typ→tytuł/kolor/podsumowanie. Zob. .claude/skills/modifier-architecture-guide/SKILL.md.
 */
export const MODIFIER_DESCRIPTORS: ModifierDescriptorMap = {
  story_offset: {
    type: 'story_offset',
    title: 'Uskok kondygnacji',
    Icon: SetbackPenthouseIcon,
    accentVar: 'var(--accent-purple)',
    createDefault: createDefaultStoryOffsetModifier,
    renderFields: StoryOffsetFields,
    formatSummary: (m) => `${formatSigned(m.distance)} ${formatStoriesSuffix(m.storiesCount)}`,
  },
  zone_offset: {
    type: 'zone_offset',
    title: 'Strefa (obszar)',
    Icon: ZoneBufferIcon,
    accentVar: 'var(--accent-cyan)',
    createDefault: createDefaultZoneOffsetModifier,
    renderFields: ZoneOffsetFields,
    formatSummary: (m) => formatSigned(m.distance),
  },
  bay_window: {
    type: 'bay_window',
    title: 'Wykusz (Bay Window)',
    Icon: BayWindowIcon,
    accentVar: 'var(--accent-yellow)',
    createDefault: createDefaultBayWindowModifier,
    renderFields: BayWindowFields,
    formatSummary: (m) => `(${m.width}m × ${formatSigned(m.projection)})`,
  },
  terrace: {
    type: 'terrace',
    title: 'Taras (uskok krawędzi)',
    Icon: TerraceIcon,
    accentVar: 'var(--accent-orange)',
    createDefault: createDefaultTerraceModifier,
    renderFields: TerraceFields,
    formatSummary: (m) => `${m.depth}m ${formatStoriesSuffix(m.storiesCount)}`,
  },
  donut: {
    type: 'donut',
    title: 'Donat (otwór/patio)',
    Icon: DonutIcon,
    accentVar: 'var(--accent-emerald-light)',
    createDefault: createDefaultDonutModifier,
    renderFields: DonutFields,
    formatSummary: (m) => `${m.offset}m ${formatStoriesSuffix(m.storiesCount)}`,
  },
  corner_cut: {
    type: 'corner_cut',
    title: 'Ścięcie narożnika',
    Icon: ChamferIcon,
    accentVar: 'var(--accent-cyan-light)',
    createDefault: createDefaultCornerCutModifier,
    renderFields: CornerCutFields,
    formatSummary: (m) => `d=${m.depth}m ${formatStoriesSuffix(m.storiesCount)}`,
  },
  gate: {
    type: 'gate',
    title: 'Brama (prześwit)',
    Icon: GatePassageIcon,
    accentVar: 'var(--accent-emerald)',
    createDefault: createDefaultGateModifier,
    renderFields: GateFields,
    formatSummary: (m) => `a=${m.width}m ${formatStoriesSuffix(m.storiesCount)}`,
  },
};

/** Modyfikatory bryły budynku (Grupa 2 w toolbarze): uskok, taras, donat, wykusz, sciecie, brama */
export const TOOLBAR_BUILDING_MODIFIER_TYPES = [
  'story_offset',
  'terrace',
  'donut',
  'gate',
  'bay_window',
  'corner_cut',
] as const;

/** Modyfikator bufora/strefy (Grupa 3 w toolbarze) */
export const TOOLBAR_BUFFER_MODIFIER_TYPE = 'zone_offset' as const;
