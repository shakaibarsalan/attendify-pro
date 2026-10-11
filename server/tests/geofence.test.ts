import { describe, it, expect } from 'vitest';
import { haversineDistance, isValidCoordinate } from '../src/utils/geo.js';

describe('haversineDistance', () => {
  it('returns 0 for same point', () => {
    expect(haversineDistance(0, 0, 0, 0)).toBe(0);
  });

  it('calculates known distance correctly', () => {
    const d = haversineDistance(40.7128, -74.006, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(3_900_000);
    expect(d).toBeLessThan(4_000_000);
  });

  it('handles small distances', () => {
    const d = haversineDistance(0, 0, 0, 0.001);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it('is symmetric', () => {
    const d1 = haversineDistance(10, 20, 30, 40);
    const d2 = haversineDistance(30, 40, 10, 20);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.01);
  });

  it('works across antimeridian', () => {
    const d = haversineDistance(0, 179.9, 0, -179.9);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(50000);
  });
});

describe('isValidCoordinate', () => {
  it('accepts valid coordinates', () => {
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(90, 180)).toBe(true);
    expect(isValidCoordinate(-90, -180)).toBe(true);
    expect(isValidCoordinate(45.5, -73.5)).toBe(true);
  });

  it('rejects invalid latitudes', () => {
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(-91, 0)).toBe(false);
  });

  it('rejects invalid longitudes', () => {
    expect(isValidCoordinate(0, 181)).toBe(false);
    expect(isValidCoordinate(0, -181)).toBe(false);
  });
});
