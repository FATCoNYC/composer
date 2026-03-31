import { computeDemerits, ragDemerits, singleWordDemerits } from './demerits.js'
import type { HyphenatedWord } from './hyphenate.js'
import { computeLineMetrics } from './line-metrics.js'
import type {
  JustifyConfig,
  ResolvedRun,
  StyledHyphenatedWord,
} from './types.js'

type Box = {
  type: 'box'
  width: number
  text: string
  letterCount: number
  runs?: ResolvedRun[]
}
type Glue = { type: 'glue'; width: number }
type Penalty = {
  type: 'penalty'
  width: number
  cost: number
  flagged: boolean
}
type Item = Box | Glue | Penalty

interface KPNode {
  itemIndex: number
  totalDemerits: number
  consecutiveHyphens: number
  lineIndex: number
  previous: KPNode | null
}

export interface KPWord {
  text: string
  width: number
  letterCount: number
  runs?: ResolvedRun[]
}

export interface KPLine {
  words: KPWord[]
  textWidth: number
  naturalSpaceWidth: number
  wordGaps: number
  letterCount: number
  endsWithHyphen: boolean
}

const HYPHEN_PENALTY_COST = 50
const CONSECUTIVE_HYPHEN_PENALTY = 3000

function buildStyledItems(
  hWords: StyledHyphenatedWord[],
  spaceWidth: number,
  hyphenWidth: number,
): Item[] {
  const items: Item[] = []

  for (let w = 0; w < hWords.length; w++) {
    const hw = hWords[w]

    if (hw.syllables.length <= 1) {
      items.push({
        type: 'box',
        width: hw.width,
        text: hw.text,
        letterCount: hw.letterCount,
        runs: hw.runs,
      })
    } else {
      for (let s = 0; s < hw.syllables.length; s++) {
        items.push({
          type: 'box',
          width: hw.syllableWidths[s],
          text: hw.syllables[s].map((r) => r.text).join(''),
          letterCount: hw.syllables[s].reduce(
            (sum, r) => sum + r.letterCount,
            0,
          ),
          runs: hw.syllables[s],
        })
        if (s < hw.syllables.length - 1) {
          items.push({
            type: 'penalty',
            width: hyphenWidth,
            cost: HYPHEN_PENALTY_COST,
            flagged: true,
          })
        }
      }
    }

    if (w < hWords.length - 1) {
      items.push({ type: 'glue', width: spaceWidth })
    }
  }

  return items
}

function buildItems(
  hWords: HyphenatedWord[],
  spaceWidth: number,
  hyphenWidth: number,
): Item[] {
  const items: Item[] = []

  for (let w = 0; w < hWords.length; w++) {
    const hw = hWords[w]

    if (hw.syllables.length <= 1) {
      items.push({
        type: 'box',
        width: hw.width,
        text: hw.text,
        letterCount: hw.letterCount,
      })
    } else {
      for (let s = 0; s < hw.syllables.length; s++) {
        items.push({
          type: 'box',
          width: hw.syllableWidths[s],
          text: hw.syllables[s],
          letterCount: [...hw.syllables[s]].length,
        })
        if (s < hw.syllables.length - 1) {
          items.push({
            type: 'penalty',
            width: hyphenWidth,
            cost: HYPHEN_PENALTY_COST,
            flagged: true,
          })
        }
      }
    }

    if (w < hWords.length - 1) {
      items.push({ type: 'glue', width: spaceWidth })
    }
  }

  return items
}

/**
 * Computes how much a line needs to stretch or shrink to fit.
 *
 * Uses a two-tier model for compression: the ratio within the word-spacing
 * range stays linear (0 to -1), but once compression spills into letter
 * spacing and glyph scaling territory, the ratio inflates by a multiplier.
 * This makes the KP algorithm strongly prefer hyphenating over glyph squishing.
 */
function adjustmentRatio(
  textWidth: number,
  naturalSpaceWidth: number,
  wordGaps: number,
  letterCount: number,
  containerWidth: number,
  config: JustifyConfig,
): number {
  const m = computeLineMetrics(
    textWidth,
    naturalSpaceWidth,
    wordGaps,
    letterCount,
    config,
  )
  const slack = containerWidth - m.desiredWidth
  if (Math.abs(slack) < 0.5) return 0

  if (slack > 0) {
    const maxStretch = m.maxWidth - m.desiredWidth
    if (maxStretch > 0.5) return slack / maxStretch
    // No stretchability (e.g. single hyphen fragment, no word gaps).
    // Return a fill-based ratio so KP can evaluate the trade-off
    // rather than returning Infinity which blocks all hyphenation.
    const fill = m.desiredWidth / containerWidth
    if (fill > 0.5) return 2.0 // moderate penalty — fragment fills OK
    if (fill > 0.3) return 3.5 // expensive — fragment is short
    return 5.0 // very expensive — fragment barely fills the line
  }

  // Compression: compute how much word spacing alone can absorb
  const letterSlots = Math.max(0, letterCount - 1)
  const wordOnlyMinWidth =
    textWidth * m.desiredScale +
    m.minGap * wordGaps +
    m.desiredLetterPx * letterSlots
  const wordOnlyShrink = m.desiredWidth - wordOnlyMinWidth

  if (wordOnlyShrink > 0.5 && slack >= -wordOnlyShrink) {
    // Compression fits within word spacing alone — normal ratio
    return slack / wordOnlyShrink
  }

  // Compression needs letter spacing or glyph scaling — inflate the ratio
  // so KP strongly penalizes this vs hyphenating
  const fullShrink = m.desiredWidth - m.minWidth
  if (fullShrink < 0.5) return -Infinity
  const baseRatio = slack / fullShrink
  // Boost: ratio beyond word-spacing range is multiplied by 2.5
  // so demerits (which cube the ratio) become much steeper
  return baseRatio * 2.5
}

function extractLine(
  items: Item[],
  startIdx: number,
  endIdx: number,
  brokeAtHyphen: boolean,
  spaceWidth: number,
  ctx: CanvasRenderingContext2D,
): KPLine {
  const words: { text: string; width: number; letterCount: number }[] = []
  let currentWord = ''
  let currentLetters = 0
  let totalTextWidth = 0
  let wordGaps = 0
  let totalLetters = 0

  let i = startIdx
  while (i < endIdx && items[i].type === 'glue') i++

  for (; i < endIdx; i++) {
    const item = items[i]
    if (item.type === 'box') {
      currentWord += item.text
      currentLetters += item.letterCount
    } else if (item.type === 'glue') {
      if (currentWord) {
        const measuredWidth = ctx.measureText(currentWord).width
        words.push({
          text: currentWord,
          width: measuredWidth,
          letterCount: currentLetters,
        })
        totalTextWidth += measuredWidth
        totalLetters += currentLetters
        currentWord = ''
        currentLetters = 0
        wordGaps++
      }
    }
  }

  if (currentWord) {
    if (brokeAtHyphen) currentWord += '-'
    const measuredWidth = ctx.measureText(currentWord).width
    words.push({
      text: currentWord,
      width: measuredWidth,
      letterCount: currentLetters,
    })
    totalTextWidth += measuredWidth
    totalLetters += currentLetters
  }

  wordGaps = Math.max(0, words.length - 1)

  return {
    words,
    textWidth: totalTextWidth,
    naturalSpaceWidth: spaceWidth * wordGaps,
    wordGaps,
    letterCount: totalLetters,
    endsWithHyphen: brokeAtHyphen,
  }
}

export function knuthPlassBreak(
  hWords: HyphenatedWord[],
  spaceWidth: number,
  containerWidth: number,
  config: JustifyConfig,
  hyphenWidth: number,
  ctx: CanvasRenderingContext2D,
): KPLine[] {
  if (hWords.length === 0) return []

  const items = buildItems(hWords, spaceWidth, hyphenWidth)
  const n = items.length

  const breakPositions: number[] = [0]
  for (let i = 0; i < n; i++) {
    if (items[i].type === 'glue') breakPositions.push(i + 1)
    else if (items[i].type === 'penalty') breakPositions.push(i)
  }
  breakPositions.push(n)

  const best = new Map<number, KPNode>()
  best.set(0, {
    itemIndex: 0,
    totalDemerits: 0,
    consecutiveHyphens: 0,
    lineIndex: 0,
    previous: null,
  })

  const maxConsecutive = config.hyphenation
    ? (config.hyphenation as { maxConsecutive: number }).maxConsecutive
    : 0

  for (const startPos of breakPositions) {
    const node = best.get(startPos)
    if (!node) continue

    let textWidth = 0
    let letterCount = 0
    let wordGaps = 0
    let naturalSpaceWidth = 0

    let actualStart = startPos
    if (actualStart < n && items[actualStart].type === 'penalty') actualStart++
    if (actualStart < n && items[actualStart].type === 'glue') actualStart++

    for (let i = actualStart; i < n; i++) {
      const item = items[i]

      if (item.type === 'box') {
        textWidth += item.width
        letterCount += item.letterCount
      } else if (item.type === 'glue') {
        wordGaps++
        naturalSpaceWidth += item.width
      } else if (item.type === 'penalty') {
        let d: number
        if (config.textMode === 'rag') {
          const lw = textWidth + item.width + naturalSpaceWidth
          if (lw > containerWidth * 1.01) continue
          d =
            ragDemerits(
              lw,
              containerWidth,
              config.ragBalance,
              config.ragStyle,
              config.ragShortLine,
              node.lineIndex,
            ) + item.cost
        } else {
          const r = adjustmentRatio(
            textWidth + item.width,
            naturalSpaceWidth,
            wordGaps,
            letterCount,
            containerWidth,
            config,
          )
          d = computeDemerits(r) + item.cost
        }

        if (item.flagged && node.consecutiveHyphens > 0)
          d += CONSECUTIVE_HYPHEN_PENALTY
        if (
          maxConsecutive > 0 &&
          item.flagged &&
          node.consecutiveHyphens >= maxConsecutive
        )
          d = Infinity

        if (d < Infinity) {
          const totalDemerits = node.totalDemerits + d
          const existing = best.get(i)
          if (!existing || totalDemerits < existing.totalDemerits) {
            best.set(i, {
              itemIndex: i,
              totalDemerits,
              consecutiveHyphens: item.flagged
                ? node.consecutiveHyphens + 1
                : 0,
              lineIndex: node.lineIndex + 1,
              previous: node,
            })
          }
        }
        continue
      }

      if (item.type === 'glue' || i === n - 1) {
        const isLastLine = i === n - 1
        const breakIdx = item.type === 'glue' ? i + 1 : n
        const lineGaps = item.type === 'glue' ? wordGaps - 1 : wordGaps
        const lineSpaceWidth =
          item.type === 'glue'
            ? naturalSpaceWidth - item.width
            : naturalSpaceWidth

        if (isLastLine) {
          if (textWidth + lineSpaceWidth > containerWidth * 1.01) continue
          const totalDemerits = node.totalDemerits
          const existing = best.get(n)
          if (!existing || totalDemerits < existing.totalDemerits) {
            best.set(n, {
              itemIndex: n,
              totalDemerits,
              consecutiveHyphens: 0,
              lineIndex: node.lineIndex + 1,
              previous: node,
            })
          }
        } else {
          let d: number
          const lineWidth = textWidth + lineSpaceWidth

          if (config.textMode === 'rag') {
            if (lineWidth > containerWidth * 1.01) break
            d = ragDemerits(
              lineWidth,
              containerWidth,
              config.ragBalance,
              config.ragStyle,
              config.ragShortLine,
              node.lineIndex,
            )
          } else if (lineGaps <= 0) {
            d = singleWordDemerits(textWidth, containerWidth)
          } else {
            const r = adjustmentRatio(
              textWidth,
              lineSpaceWidth,
              lineGaps,
              letterCount,
              containerWidth,
              config,
            )
            d = computeDemerits(r)
            if (d === Infinity) {
              if (r < -2) break
              continue
            }
          }

          const totalDemerits = node.totalDemerits + d
          const existing = best.get(breakIdx)
          if (!existing || totalDemerits < existing.totalDemerits) {
            best.set(breakIdx, {
              itemIndex: breakIdx,
              totalDemerits,
              consecutiveHyphens: 0,
              lineIndex: node.lineIndex + 1,
              previous: node,
            })
          }
        }
      }
    }
  }

  // Trace back
  const endNode = best.get(n)
  if (!endNode) {
    const allWords = hWords.map((w) => ({
      text: w.text,
      width: w.width,
      letterCount: w.letterCount,
    }))
    return [
      {
        words: allWords,
        textWidth: allWords.reduce((s, w) => s + w.width, 0),
        naturalSpaceWidth: spaceWidth * Math.max(0, allWords.length - 1),
        wordGaps: Math.max(0, allWords.length - 1),
        letterCount: allWords.reduce((s, w) => s + w.letterCount, 0),
        endsWithHyphen: false,
      },
    ]
  }

  const breaks: { idx: number; isHyphen: boolean }[] = []
  let cur: KPNode | null = endNode
  while (cur) {
    const isHyphen =
      cur.itemIndex < n && items[cur.itemIndex]?.type === 'penalty'
    breaks.unshift({ idx: cur.itemIndex, isHyphen })
    cur = cur.previous
  }

  const lines: KPLine[] = []
  for (let b = 0; b < breaks.length - 1; b++) {
    const line = extractLine(
      items,
      breaks[b].idx,
      breaks[b + 1].idx,
      breaks[b + 1].isHyphen,
      spaceWidth,
      ctx,
    )
    lines.push(line)
  }

  return lines
}

/**
 * Extracts a styled line from items, merging adjacent runs with the same font
 * and measuring per-run instead of with a single ctx.measureText().
 */
function extractStyledLine(
  items: Item[],
  startIdx: number,
  endIdx: number,
  brokeAtHyphen: boolean,
  spaceWidth: number,
  ctx: CanvasRenderingContext2D,
): KPLine {
  const words: KPWord[] = []
  let currentRuns: ResolvedRun[] = []
  let currentText = ''
  let currentLetters = 0
  let totalTextWidth = 0
  let wordGaps = 0
  let totalLetters = 0

  let i = startIdx
  while (i < endIdx && items[i].type === 'glue') i++

  for (; i < endIdx; i++) {
    const item = items[i]
    if (item.type === 'box') {
      currentText += item.text
      currentLetters += item.letterCount
      if (item.runs) {
        currentRuns.push(...item.runs)
      }
    } else if (item.type === 'glue') {
      if (currentText) {
        const merged = mergeAdjacentRuns(currentRuns)
        const width = sumRunWidths(merged, ctx)
        words.push({
          text: currentText,
          width,
          letterCount: currentLetters,
          runs: merged,
        })
        totalTextWidth += width
        totalLetters += currentLetters
        currentText = ''
        currentLetters = 0
        currentRuns = []
        wordGaps++
      }
    }
  }

  if (currentText) {
    if (brokeAtHyphen) {
      currentText += '-'
      // Hyphen inherits the font of the last run
      if (currentRuns.length > 0) {
        const lastRun = currentRuns[currentRuns.length - 1]
        ctx.font = lastRun.font
        currentRuns.push({
          text: '-',
          font: lastRun.font,
          width: ctx.measureText('-').width,
          letterCount: 1,
          style: lastRun.style,
        })
      }
    }
    const merged = mergeAdjacentRuns(currentRuns)
    const width = sumRunWidths(merged, ctx)
    words.push({
      text: currentText,
      width,
      letterCount: currentLetters,
      runs: merged,
    })
    totalTextWidth += width
    totalLetters += currentLetters
  }

  wordGaps = Math.max(0, words.length - 1)

  return {
    words,
    textWidth: totalTextWidth,
    naturalSpaceWidth: spaceWidth * wordGaps,
    wordGaps,
    letterCount: totalLetters,
    endsWithHyphen: brokeAtHyphen,
  }
}

/** Merge adjacent runs that share the same font into single runs */
function mergeAdjacentRuns(runs: ResolvedRun[]): ResolvedRun[] {
  if (runs.length <= 1) return runs
  const merged: ResolvedRun[] = [{ ...runs[0] }]
  for (let i = 1; i < runs.length; i++) {
    const prev = merged[merged.length - 1]
    const cur = runs[i]
    if (prev.font === cur.font && prev.style.href === cur.style.href) {
      prev.text += cur.text
      prev.letterCount += cur.letterCount
      prev.width += cur.width // approximate; re-measured below
    } else {
      merged.push({ ...cur })
    }
  }
  return merged
}

/** Sum widths of runs, re-measuring merged runs for accuracy */
function sumRunWidths(
  runs: ResolvedRun[],
  ctx: CanvasRenderingContext2D,
): number {
  let total = 0
  for (const run of runs) {
    ctx.font = run.font
    run.width = ctx.measureText(run.text).width
    total += run.width
  }
  return total
}

/**
 * Knuth-Plass line breaking for styled text.
 * Same algorithm, but uses styled items and styled extraction.
 */
export function knuthPlassBreakStyled(
  hWords: StyledHyphenatedWord[],
  spaceWidth: number,
  containerWidth: number,
  config: JustifyConfig,
  hyphenWidth: number,
  ctx: CanvasRenderingContext2D,
): KPLine[] {
  if (hWords.length === 0) return []

  const items = buildStyledItems(hWords, spaceWidth, hyphenWidth)
  const n = items.length

  const breakPositions: number[] = [0]
  for (let i = 0; i < n; i++) {
    if (items[i].type === 'glue') breakPositions.push(i + 1)
    else if (items[i].type === 'penalty') breakPositions.push(i)
  }
  breakPositions.push(n)

  const best = new Map<number, KPNode>()
  best.set(0, {
    itemIndex: 0,
    totalDemerits: 0,
    consecutiveHyphens: 0,
    lineIndex: 0,
    previous: null,
  })

  const maxConsecutive = config.hyphenation
    ? (config.hyphenation as { maxConsecutive: number }).maxConsecutive
    : 0

  for (const startPos of breakPositions) {
    const node = best.get(startPos)
    if (!node) continue

    let textWidth = 0
    let letterCount = 0
    let wordGaps = 0
    let naturalSpaceWidth = 0

    let actualStart = startPos
    if (actualStart < n && items[actualStart].type === 'penalty') actualStart++
    if (actualStart < n && items[actualStart].type === 'glue') actualStart++

    for (let i = actualStart; i < n; i++) {
      const item = items[i]

      if (item.type === 'box') {
        textWidth += item.width
        letterCount += item.letterCount
      } else if (item.type === 'glue') {
        wordGaps++
        naturalSpaceWidth += item.width
      } else if (item.type === 'penalty') {
        let d: number
        if (config.textMode === 'rag') {
          const lw = textWidth + item.width + naturalSpaceWidth
          if (lw > containerWidth * 1.01) continue
          d =
            ragDemerits(
              lw,
              containerWidth,
              config.ragBalance,
              config.ragStyle,
              config.ragShortLine,
              node.lineIndex,
            ) + item.cost
        } else {
          const r = adjustmentRatio(
            textWidth + item.width,
            naturalSpaceWidth,
            wordGaps,
            letterCount,
            containerWidth,
            config,
          )
          d = computeDemerits(r) + item.cost
        }

        if (item.flagged && node.consecutiveHyphens > 0)
          d += CONSECUTIVE_HYPHEN_PENALTY
        if (
          maxConsecutive > 0 &&
          item.flagged &&
          node.consecutiveHyphens >= maxConsecutive
        )
          d = Infinity

        if (d < Infinity) {
          const totalDemerits = node.totalDemerits + d
          const existing = best.get(i)
          if (!existing || totalDemerits < existing.totalDemerits) {
            best.set(i, {
              itemIndex: i,
              totalDemerits,
              consecutiveHyphens: item.flagged
                ? node.consecutiveHyphens + 1
                : 0,
              lineIndex: node.lineIndex + 1,
              previous: node,
            })
          }
        }
        continue
      }

      if (item.type === 'glue' || i === n - 1) {
        const isLastLine = i === n - 1
        const breakIdx = item.type === 'glue' ? i + 1 : n
        const lineGaps = item.type === 'glue' ? wordGaps - 1 : wordGaps
        const lineSpaceWidth =
          item.type === 'glue'
            ? naturalSpaceWidth - item.width
            : naturalSpaceWidth

        if (isLastLine) {
          if (textWidth + lineSpaceWidth > containerWidth * 1.01) continue
          const totalDemerits = node.totalDemerits
          const existing = best.get(n)
          if (!existing || totalDemerits < existing.totalDemerits) {
            best.set(n, {
              itemIndex: n,
              totalDemerits,
              consecutiveHyphens: 0,
              lineIndex: node.lineIndex + 1,
              previous: node,
            })
          }
        } else {
          let d: number
          const lineWidth = textWidth + lineSpaceWidth

          if (config.textMode === 'rag') {
            if (lineWidth > containerWidth * 1.01) break
            d = ragDemerits(
              lineWidth,
              containerWidth,
              config.ragBalance,
              config.ragStyle,
              config.ragShortLine,
              node.lineIndex,
            )
          } else if (lineGaps <= 0) {
            d = singleWordDemerits(textWidth, containerWidth)
          } else {
            const r = adjustmentRatio(
              textWidth,
              lineSpaceWidth,
              lineGaps,
              letterCount,
              containerWidth,
              config,
            )
            d = computeDemerits(r)
            if (d === Infinity) {
              if (r < -2) break
              continue
            }
          }

          const totalDemerits = node.totalDemerits + d
          const existing = best.get(breakIdx)
          if (!existing || totalDemerits < existing.totalDemerits) {
            best.set(breakIdx, {
              itemIndex: breakIdx,
              totalDemerits,
              consecutiveHyphens: 0,
              lineIndex: node.lineIndex + 1,
              previous: node,
            })
          }
        }
      }
    }
  }

  // Trace back
  const endNode = best.get(n)
  if (!endNode) {
    const allWords: KPWord[] = hWords.map((w) => ({
      text: w.text,
      width: w.width,
      letterCount: w.letterCount,
      runs: w.runs,
    }))
    return [
      {
        words: allWords,
        textWidth: allWords.reduce((s, w) => s + w.width, 0),
        naturalSpaceWidth: spaceWidth * Math.max(0, allWords.length - 1),
        wordGaps: Math.max(0, allWords.length - 1),
        letterCount: allWords.reduce((s, w) => s + w.letterCount, 0),
        endsWithHyphen: false,
      },
    ]
  }

  const breaks: { idx: number; isHyphen: boolean }[] = []
  let cur: KPNode | null = endNode
  while (cur) {
    const isHyphen =
      cur.itemIndex < n && items[cur.itemIndex]?.type === 'penalty'
    breaks.unshift({ idx: cur.itemIndex, isHyphen })
    cur = cur.previous
  }

  const lines: KPLine[] = []
  for (let b = 0; b < breaks.length - 1; b++) {
    const line = extractStyledLine(
      items,
      breaks[b].idx,
      breaks[b + 1].idx,
      breaks[b + 1].isHyphen,
      spaceWidth,
      ctx,
    )
    lines.push(line)
  }

  return lines
}
