import { describe, it, expect, vi } from 'vitest';
import { checkIsMobile } from './useIsMobile';

describe('checkIsMobile', () => {
  it('zwraca false dla szerokiego ekranu desktop bez wskaźnika coarse', () => {
    const mockWindow = {
      innerWidth: 1024,
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
      })),
    } as any;

    expect(checkIsMobile(768, mockWindow)).toBe(false);
  });

  it('zwraca true dla ekranu o szerokości <= 768px', () => {
    const mockWindow = {
      innerWidth: 500,
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
      })),
    } as any;

    expect(checkIsMobile(768, mockWindow)).toBe(true);
  });

  it('zwraca true dla urządzeń z ekranem dotykowym pointer: coarse', () => {
    const mockWindow = {
      innerWidth: 1200,
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('pointer: coarse'),
        media: query,
      })),
    } as any;

    expect(checkIsMobile(768, mockWindow)).toBe(true);
  });

  it('zwraca false gdy brak obiektu window (SSR)', () => {
    expect(checkIsMobile(768, null)).toBe(false);
  });
});
