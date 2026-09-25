import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MobileKioskOverlay } from './MobileKioskOverlay';

describe('MobileKioskOverlay', () => {
  it('renderuje napis swiatlo.app jako nakładkę', () => {
    const html = renderToStaticMarkup(<MobileKioskOverlay stepMinutes={1} intervalMs={100} />);
    expect(html).toContain('swiatlo.app');
    expect(html).toContain('position:fixed');
    expect(html).toContain('color:#000000');
    expect(html).toContain('font-weight:900');
  });
});

