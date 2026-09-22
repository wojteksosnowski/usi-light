/**
 * useWmsStatusStore.ts
 *
 * Status pobierania per usługa WMS (idle/loading/error/ready), zasilany przez `onStatusChange`
 * callbacki `WmsTileManager` instancji zarejestrowanych w `registerGeoLayers.ts`. Używany do
 * renderowania ikon statusu przy nazwach usług w sidebarze (spinner/wykrzyknik/checkmark).
 */

import { create } from 'zustand';
import { WmsLayerStatus } from '../renderers/wmsTileManager';

export type WmsServiceKey = 'orthophoto' | 'kiut' | 'bdot' | 'mpzp';

interface WmsStatusState {
  statuses: Record<WmsServiceKey, WmsLayerStatus>;
  setStatus: (key: WmsServiceKey, status: WmsLayerStatus) => void;
}

export const useWmsStatusStore = create<WmsStatusState>((set) => ({
  statuses: {
    orthophoto: 'idle',
    kiut: 'idle',
    bdot: 'idle',
    mpzp: 'idle',
  },
  setStatus: (key, status) =>
    set((state) => ({ statuses: { ...state.statuses, [key]: status } })),
}));
