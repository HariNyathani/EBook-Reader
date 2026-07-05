'use client';

/**
 * TypographyPanel — typography control panel (ISD §11.G, §11.M).
 *
 * Provides controls for:
 *   - Font family (serif / sans / monospace / dyslexic)
 *   - Font size (+/− within min/max)
 *   - Line height (slider)
 *   - Page margin (slider)
 *   - Justify (start / justify)
 *
 * Each control mutates reader-store. The useReaderEngine hook subscribes
 * to the typography slice and forwards changes to the engine via
 * `setStyles`. Persistence is wired in Phase 12 (local-first, then
 * cloud).
 *
 * The component is "dumb" — presentational, all state in reader-store.
 */

import { useReaderStore } from '@/store/reader-store';
import {
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_STEP,
  MARGIN_MAX,
  MARGIN_MIN,
  MARGIN_STEP,
} from '../constants';
import { cn } from '@/lib/utils/cn';

function round(value: number, step: number): number {
  // Round to the nearest step. Avoids floating-point drift on sliders.
  return Math.round(value / step) * step;
}

export function TypographyPanel() {
  const fontFamily = useReaderStore((s) => s.fontFamily);
  const fontSize = useReaderStore((s) => s.fontSize);
  const lineHeight = useReaderStore((s) => s.lineHeight);
  const margin = useReaderStore((s) => s.margin);
  const textAlign = useReaderStore((s) => s.textAlign);

  const setFontFamily = useReaderStore((s) => s.setFontFamily);
  const setFontSize = useReaderStore((s) => s.setFontSize);
  const setLineHeight = useReaderStore((s) => s.setLineHeight);
  const setMargin = useReaderStore((s) => s.setMargin);
  const setTextAlign = useReaderStore((s) => s.setTextAlign);

  return (
    <div className="space-y-5">
      {/* Font family */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Font
        </legend>
        <div role="radiogroup" aria-label="Font family" className="grid grid-cols-2 gap-2">
          {FONT_FAMILY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={fontFamily === opt.value}
              onClick={() => setFontFamily(opt.value)}
              className={cn(
                'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                fontFamily === opt.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              <span style={{ fontFamily: opt.value }}>{opt.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* Font size */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Font size
        </legend>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Decrease font size"
            onClick={() => setFontSize(Math.max(FONT_SIZE_MIN, fontSize - FONT_SIZE_STEP))}
            className="h-8 w-8 rounded-md border border-gray-200 bg-white text-lg font-medium hover:bg-gray-50"
          >
            −
          </button>
          <div className="flex-1">
            <input
              type="range"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={FONT_SIZE_STEP}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.currentTarget.value))}
              aria-label="Font size in pixels"
              className="w-full"
            />
          </div>
          <button
            type="button"
            aria-label="Increase font size"
            onClick={() => setFontSize(Math.min(FONT_SIZE_MAX, fontSize + FONT_SIZE_STEP))}
            className="h-8 w-8 rounded-md border border-gray-200 bg-white text-lg font-medium hover:bg-gray-50"
          >
            +
          </button>
          <span className="w-10 text-right text-xs text-gray-500">{fontSize}px</span>
        </div>
      </fieldset>

      {/* Line height */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Line height
        </legend>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={LINE_HEIGHT_MIN}
            max={LINE_HEIGHT_MAX}
            step={LINE_HEIGHT_STEP}
            value={lineHeight}
            onChange={(e) => setLineHeight(round(Number(e.currentTarget.value), LINE_HEIGHT_STEP))}
            aria-label="Line height"
            className="flex-1"
          />
          <span className="w-12 text-right text-xs text-gray-500">{lineHeight.toFixed(1)}</span>
        </div>
      </fieldset>

      {/* Margin */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Page margin
        </legend>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={MARGIN_MIN}
            max={MARGIN_MAX}
            step={MARGIN_STEP}
            value={margin}
            onChange={(e) => setMargin(Number(e.currentTarget.value))}
            aria-label="Page margin percentage"
            className="flex-1"
          />
          <span className="w-12 text-right text-xs text-gray-500">{margin}%</span>
        </div>
      </fieldset>

      {/* Justify */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Alignment
        </legend>
        <div role="radiogroup" aria-label="Text alignment" className="flex gap-2">
          {(
            [
              { value: 'start', label: 'Left' },
              { value: 'justify', label: 'Justify' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={textAlign === opt.value}
              onClick={() => setTextAlign(opt.value)}
              className={cn(
                'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                textAlign === opt.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
