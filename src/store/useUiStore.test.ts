import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from './useUiStore';
import { useWfsStore } from '../modules/wfs-import/store/useWfsStore';

describe('useUiStore - viewMode2D auto-sync invertColors', () => {
  beforeEach(() => {
    useUiStore.setState({ viewMode2D: 'cad' });
    useWfsStore.setState({
      geoOverlayInvertColors: true,
      kiutInvertColors: true,
      bdotInvertColors: true,
      mpzpInvertColors: true,
    });
  });

  it('automatycznie wyłącza odwracanie kolorów przy przełączeniu na Masterplan White', () => {
    useUiStore.getState().setViewMode2D('masterplan_white');

    expect(useUiStore.getState().viewMode2D).toBe('masterplan_white');
    expect(useWfsStore.getState().geoOverlayInvertColors).toBe(false);
    expect(useWfsStore.getState().kiutInvertColors).toBe(false);
    expect(useWfsStore.getState().bdotInvertColors).toBe(false);
    expect(useWfsStore.getState().mpzpInvertColors).toBe(false);
  });

  it('automatycznie włącza odwracanie kolorów przy przełączeniu z powrotem na CAD', () => {
    useUiStore.getState().setViewMode2D('masterplan_white');
    expect(useWfsStore.getState().geoOverlayInvertColors).toBe(false);

    useUiStore.getState().setViewMode2D('cad');
    expect(useUiStore.getState().viewMode2D).toBe('cad');
    expect(useWfsStore.getState().geoOverlayInvertColors).toBe(true);
    expect(useWfsStore.getState().kiutInvertColors).toBe(true);
    expect(useWfsStore.getState().bdotInvertColors).toBe(true);
    expect(useWfsStore.getState().mpzpInvertColors).toBe(true);
  });

  it('toggleViewMode2D poprawnie synchronizuje odwracanie kolorów', () => {
    useUiStore.getState().toggleViewMode2D(); // cad -> masterplan_white
    expect(useUiStore.getState().viewMode2D).toBe('masterplan_white');
    expect(useWfsStore.getState().geoOverlayInvertColors).toBe(false);
    expect(useWfsStore.getState().mpzpInvertColors).toBe(false);

    useUiStore.getState().toggleViewMode2D(); // masterplan_white -> cad
    expect(useUiStore.getState().viewMode2D).toBe('cad');
    expect(useWfsStore.getState().geoOverlayInvertColors).toBe(true);
    expect(useWfsStore.getState().mpzpInvertColors).toBe(true);
  });

  it('poprawnie przełącza i ustawia isMobileShowcasePreview', () => {
    expect(useUiStore.getState().isMobileShowcasePreview).toBe(false);

    useUiStore.getState().setMobileShowcasePreview(true);
    expect(useUiStore.getState().isMobileShowcasePreview).toBe(true);

    useUiStore.getState().toggleMobileShowcasePreview();
    expect(useUiStore.getState().isMobileShowcasePreview).toBe(false);

    useUiStore.getState().toggleMobileShowcasePreview();
    expect(useUiStore.getState().isMobileShowcasePreview).toBe(true);
  });
});
