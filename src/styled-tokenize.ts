import { type FontMap, resolveFont } from './font-resolve.js'
import type { ResolvedRun, StyledRun, StyledWord } from './types.js'

/**
 * Converts an array of StyledRuns (a paragraph) into StyledWords
 * by splitting on whitespace, resolving fonts, and measuring each run.
 *
 * A single word can span multiple style runs (e.g., "**wor**ld" →
 * two runs in one word).
 */
export function tokenizeRuns(
  runs: StyledRun[],
  baseFont: string,
  ctx: CanvasRenderingContext2D,
  fontMap?: FontMap,
): StyledWord[] {
  const words: StyledWord[] = []
  let currentRuns: ResolvedRun[] = []

  for (const run of runs) {
    const font = resolveFont(baseFont, run.style, fontMap)
    const parts = run.text.split(/(\s+)/)

    for (const part of parts) {
      if (/^\s+$/.test(part)) {
        // Whitespace — emit current word if non-empty
        if (currentRuns.length > 0) {
          words.push(buildWord(currentRuns))
          currentRuns = []
        }
        continue
      }

      if (part === '') continue

      ctx.font = font
      const width = ctx.measureText(part).width

      currentRuns.push({
        text: part,
        font,
        width,
        letterCount: [...part].length,
        style: run.style,
      })
    }
  }

  // Emit final word
  if (currentRuns.length > 0) {
    words.push(buildWord(currentRuns))
  }

  return words
}

function buildWord(runs: ResolvedRun[]): StyledWord {
  return {
    runs,
    width: runs.reduce((sum, r) => sum + r.width, 0),
    letterCount: runs.reduce((sum, r) => sum + r.letterCount, 0),
    text: runs.map((r) => r.text).join(''),
  }
}
