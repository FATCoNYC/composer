import { hyphenateSync } from 'hyphen/en'
import type {
  HyphenationConfig,
  ResolvedRun,
  StyledHyphenatedWord,
  StyledWord,
} from './types.js'

const SOFT_HYPHEN = '\u00AD'

/**
 * Hyphenate a word using the hyphen library, then filter break points
 * based on InDesign-style rules (afterFirst, beforeLast, minWordLength).
 *
 * Returns an array of syllable fragments. E.g., "beautiful" → ["beau", "ti", "ful"]
 */
// Punctuation that can appear at the edges of a word token
const LEADING_PUNCT = /^[\u201C\u201D\u2018\u2019"'(\[{]+/
const TRAILING_PUNCT = /[.,;:!?\u2014\u2013\u2026\u201C\u201D\u2018\u2019"')\]}]+$/

export function hyphenateWord(
  word: string,
  config: HyphenationConfig,
): string[] {
  // Strip any existing soft hyphens
  const clean = word.replace(/\u00AD/g, '')

  // Separate leading/trailing punctuation so the hyphenation library
  // sees a clean dictionary word (e.g. "arrangement," → "arrangement")
  const leadMatch = clean.match(LEADING_PUNCT)
  const trailMatch = clean.match(TRAILING_PUNCT)
  const leading = leadMatch ? leadMatch[0] : ''
  const trailing = trailMatch ? trailMatch[0] : ''
  const core = clean.slice(leading.length, clean.length - (trailing.length || 0))

  if ([...core].length < config.minWordLength) {
    return [word]
  }

  // Get all possible hyphenation points from the library
  const hyphenated = hyphenateSync(core, {
    hyphenChar: SOFT_HYPHEN,
    minWordLength: config.minWordLength,
  }) as string

  const parts = hyphenated.split(SOFT_HYPHEN)
  if (parts.length <= 1) return [word]

  // Filter based on afterFirst / beforeLast rules
  const filtered: string[] = []
  let charsSoFar = 0

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    // Characters after the break point = everything from this part onward
    const charsAfterBreak = [...core].length - charsSoFar

    const canBreakHere =
      i > 0 && // can't break before the first part
      charsSoFar >= config.afterFirst && // enough chars before
      charsAfterBreak >= config.beforeLast // enough chars after

    if (canBreakHere || i === 0) {
      filtered.push(part)
    } else {
      // Merge with previous part
      filtered[filtered.length - 1] += part
    }

    charsSoFar += [...part].length
  }

  if (filtered.length <= 1) return [word]

  // Reattach punctuation to first/last syllables
  if (leading) filtered[0] = leading + filtered[0]
  if (trailing) filtered[filtered.length - 1] += trailing

  return filtered
}

export interface HyphenatedWord {
  /** Full word text */
  text: string
  /** Syllable fragments — break opportunities between each */
  syllables: string[]
  /** Width of the full word */
  width: number
  /** Widths of each syllable */
  syllableWidths: number[]
  /** Letter count */
  letterCount: number
}

/**
 * Prepare a paragraph's words with hyphenation data.
 */
export function prepareHyphenatedWords(
  words: string[],
  font: string,
  config: HyphenationConfig,
  ctx: CanvasRenderingContext2D,
): HyphenatedWord[] {
  ctx.font = font

  return words.map((word) => {
    const syllables = hyphenateWord(word, config)
    const syllableWidths = syllables.map((s) => ctx.measureText(s).width)

    return {
      text: word,
      syllables,
      width: ctx.measureText(word).width,
      syllableWidths,
      letterCount: [...word].length,
    }
  })
}

/**
 * Prepare styled words with hyphenation data.
 *
 * Hyphenates the plain text, then maps syllable boundaries back to
 * the styled runs so each syllable carries its own ResolvedRun[].
 */
export function prepareStyledHyphenatedWords(
  words: StyledWord[],
  config: HyphenationConfig,
  ctx: CanvasRenderingContext2D,
): StyledHyphenatedWord[] {
  return words.map((word) => {
    const syllableTexts = hyphenateWord(word.text, config)

    if (syllableTexts.length <= 1) {
      // No hyphenation — syllable = full word runs
      const syllableWidth = word.runs.reduce((s, r) => s + r.width, 0)
      return {
        text: word.text,
        syllables: [word.runs],
        syllableWidths: [syllableWidth],
        width: word.width,
        letterCount: word.letterCount,
        runs: word.runs,
      }
    }

    // Map syllable boundaries to runs using a dual-cursor walk
    const syllables = mapSyllablesToRuns(syllableTexts, word.runs, ctx)
    const syllableWidths = syllables.map((runs) =>
      runs.reduce((s, r) => s + r.width, 0),
    )

    return {
      text: word.text,
      syllables,
      syllableWidths,
      width: word.width,
      letterCount: word.letterCount,
      runs: word.runs,
    }
  })
}

/**
 * Maps syllable text boundaries back to styled runs.
 * A syllable boundary may fall mid-run, requiring the run to be split.
 */
function mapSyllablesToRuns(
  syllableTexts: string[],
  runs: ResolvedRun[],
  ctx: CanvasRenderingContext2D,
): ResolvedRun[][] {
  const result: ResolvedRun[][] = []
  let runIdx = 0
  let charInRun = 0 // character offset within current run

  for (const sylText of syllableTexts) {
    const sylRuns: ResolvedRun[] = []
    let sylCharsLeft = [...sylText].length

    while (sylCharsLeft > 0 && runIdx < runs.length) {
      const run = runs[runIdx]
      const runChars = [...run.text]
      const availableInRun = runChars.length - charInRun

      if (availableInRun <= sylCharsLeft) {
        // Take the rest of this run
        const text = runChars.slice(charInRun).join('')
        ctx.font = run.font
        sylRuns.push({
          text,
          font: run.font,
          width: ctx.measureText(text).width,
          letterCount: [...text].length,
          style: run.style,
        })
        sylCharsLeft -= availableInRun
        runIdx++
        charInRun = 0
      } else {
        // Take part of this run
        const text = runChars
          .slice(charInRun, charInRun + sylCharsLeft)
          .join('')
        ctx.font = run.font
        sylRuns.push({
          text,
          font: run.font,
          width: ctx.measureText(text).width,
          letterCount: [...text].length,
          style: run.style,
        })
        charInRun += sylCharsLeft
        sylCharsLeft = 0
      }
    }

    result.push(sylRuns)
  }

  return result
}
