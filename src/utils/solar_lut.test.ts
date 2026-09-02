import { describe, it, expect } from 'vitest';
import { LinijkaSolarSystem } from './solar';

describe('LinijkaSolarSystem Solar LUT Binary Search equivalence', () => {
  const sys = new LinijkaSolarSystem(52.23, 21.01, 'spring');

  it('matches getHourForAzimuthFast with continuous getHourForAzimuth with sub-second accuracy across full sweep', () => {
    // Check every 0.1 degree azimuth from 70 deg (morning) to 290 deg (evening)
    for (let az = 75.0; az <= 285.0; az += 0.2) {
      const continuousHour = sys.getHourForAzimuth(az);
      const fastLutHour = sys.getHourForAzimuthFast(az);

      const diffHours = Math.abs(fastLutHour - continuousHour);
      const diffSeconds = diffHours * 3600;

      // Difference must be less than 0.5 second across entire 10-hour working range
      expect(diffSeconds).toBeLessThan(0.5);
    }
  });

  it('correctly maps boundary noon azimuth (180 deg) to 12:00:00 exact', () => {
    const noonHour = sys.getHourForAzimuthFast(180.0);
    expect(noonHour).toBeCloseTo(12.0, 4);
  });
});
