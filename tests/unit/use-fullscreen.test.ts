/**
 * Unit tests for useFullscreen (V1.1 native fullscreen).
 *
 * jsdom doesn't implement the Fullscreen API, so `requestFullscreen` /
 * `exitFullscreen` are stubbed per-test and `document.fullscreenElement`
 * is patched directly to simulate the browser's actual state (including
 * exiting via the native Esc key, which only fires `fullscreenchange`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFullscreen } from '@/features/reader/hooks/use-fullscreen';

function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    value: el,
    configurable: true,
  });
}

describe('useFullscreen', () => {
  let el: HTMLDivElement;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
    setFullscreenElement(null);
  });

  it('starts with isFullscreen false', () => {
    const { result } = renderHook(() => useFullscreen({ current: el }));
    expect(result.current.isFullscreen).toBe(false);
  });

  it('enterFullscreen requests fullscreen on the target element', () => {
    el.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useFullscreen({ current: el }));
    act(() => result.current.enterFullscreen());
    expect(el.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('exitFullscreen calls document.exitFullscreen only when currently fullscreen', () => {
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useFullscreen({ current: el }));

    // Not fullscreen yet — exitFullscreen should be a no-op.
    act(() => result.current.exitFullscreen());
    expect(document.exitFullscreen).not.toHaveBeenCalled();

    setFullscreenElement(el);
    act(() => result.current.exitFullscreen());
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('syncs isFullscreen from native fullscreenchange events (e.g. Esc key)', () => {
    const { result } = renderHook(() => useFullscreen({ current: el }));
    expect(result.current.isFullscreen).toBe(false);

    setFullscreenElement(el);
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.isFullscreen).toBe(true);

    // Native Esc exit: browser clears fullscreenElement and fires the event
    // without our code ever calling exitFullscreen().
    setFullscreenElement(null);
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.isFullscreen).toBe(false);
  });

  it('toggleFullscreen enters when not fullscreen and exits when fullscreen', () => {
    el.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useFullscreen({ current: el }));

    act(() => result.current.toggleFullscreen());
    expect(el.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(document.exitFullscreen).not.toHaveBeenCalled();

    setFullscreenElement(el);
    act(() => result.current.toggleFullscreen());
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });
});
