import { describe, it, expect } from 'vitest';
import { classifyWalGap } from './wal-monitor.js';

describe('classifyWalGap', () => {
  it('should return ok for < 1 MB', () => {
    expect(classifyWalGap(512 * 1024)).toBe('ok');
    expect(classifyWalGap(1024 * 1024 - 1)).toBe('ok');
  });

  it('should return warning for 1-10 MB', () => {
    expect(classifyWalGap(1024 * 1024)).toBe('warning');
    expect(classifyWalGap(5 * 1024 * 1024)).toBe('warning');
    expect(classifyWalGap(10 * 1024 * 1024 - 1)).toBe('warning');
  });

  it('should return warning for 10-50 MB', () => {
    expect(classifyWalGap(10 * 1024 * 1024)).toBe('warning');
    expect(classifyWalGap(25 * 1024 * 1024)).toBe('warning');
  });

  it('should return critical for >= 50 MB', () => {
    expect(classifyWalGap(50 * 1024 * 1024)).toBe('critical');
    expect(classifyWalGap(77.5 * 1024 * 1024)).toBe('critical'); // Sep 2026 incident value
  });

  it('should handle zero gap', () => {
    expect(classifyWalGap(0)).toBe('ok');
  });
});
