/**
 * Column-breaking algorithm — determines optimal places to split a stream
 * of justified lines across multiple columns.
 *
 * Analogous to TeX's page-breaking algorithm, adapted for multi-column layout.
 */

import type { ColumnConfig, JustifiedLine } from './types.js'

/** A line annotated with its paragraph membership for break-cost evaluation */
export interface AnnotatedLine {
  line: JustifiedLine
  /** Index of the paragraph this line belongs to */
  paragraphIndex: number
  /** Position of this line within its paragraph (0-based) */
  lineInParagraph: number
  /** Total lines in this line's paragraph */
  paragraphLineCount: number
}

/** A column break point: the index in the annotated line stream where a new column starts */
export interface ColumnBreak {
  /** Start index (inclusive) in the annotated lines array */
  startIndex: number
  /** End index (exclusive) in the annotated lines array */
  endIndex: number
}

/**
 * Breaks a stream of annotated lines into columns.
 *
 * For `balanced` mode, binary searches for the minimum column height
 * that fits all text, breaking mid-paragraph when needed.
 *
 * For `fill-first` mode, fills each column to maxHeight.
 */
export function breakIntoColumns(
  lines: AnnotatedLine[],
  columnCount: number,
  lineHeight: number,
  maxHeight: number,
  config: ColumnConfig,
): ColumnBreak[] {
  if (lines.length === 0) return []
  if (columnCount <= 1) {
    return [{ startIndex: 0, endIndex: lines.length }]
  }

  if (config.columnBalance === 'balanced') {
    return balancedBreak(lines, columnCount, lineHeight, config)
  }

  return fillFirstBreak(lines, columnCount, lineHeight, maxHeight, config)
}

/**
 * Balanced mode: binary search for the minimum column height that fits
 * all lines in N columns, breaking mid-paragraph as needed.
 */
function balancedBreak(
  lines: AnnotatedLine[],
  columnCount: number,
  lineHeight: number,
  config: ColumnConfig,
): ColumnBreak[] {
  const minLines = Math.max(config.columnOrphans, config.columnWidows, 1)
  let lo = minLines * lineHeight
  let hi = computeColumnHeight(lines, 0, lines.length, lineHeight)

  let bestBreaks: ColumnBreak[] = [{ startIndex: 0, endIndex: lines.length }]

  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2
    const attempt = tryFill(lines, columnCount, lineHeight, mid, config)

    if (attempt !== null) {
      bestBreaks = attempt
      hi = mid
    } else {
      lo = mid
    }

    if (hi - lo < 0.5) break
  }

  return bestBreaks
}

/**
 * Fill-first mode: greedily fill each column to maxHeight.
 */
function fillFirstBreak(
  lines: AnnotatedLine[],
  columnCount: number,
  lineHeight: number,
  maxHeight: number,
  config: ColumnConfig,
): ColumnBreak[] {
  const result = tryFill(lines, columnCount, lineHeight, maxHeight, config)
  if (result !== null) return result

  // Fallback: allow overflow in the last column
  const breaks: ColumnBreak[] = []
  let cursor = 0
  for (let col = 0; col < columnCount; col++) {
    const start = cursor
    if (col === columnCount - 1) {
      breaks.push({ startIndex: start, endIndex: lines.length })
      break
    }
    const maxLines = Math.floor(maxHeight / lineHeight)
    cursor = Math.min(cursor + maxLines, lines.length)
    breaks.push({ startIndex: start, endIndex: cursor })
    if (cursor >= lines.length) break
  }

  return breaks
}

/**
 * Attempts to fill columnCount columns at the given target height.
 * Returns break points if successful, null if text doesn't fit.
 *
 * Fills each column as close to targetHeight as possible, then picks
 * the best break point near that fill level using a cost model:
 * - Between paragraphs: free (0 cost)
 * - Mid-paragraph: columnBreakPenalty
 * - Orphan/widow violations: heavy penalty
 */
/**
 * Computes the actual rendered height of a range of lines,
 * accounting for extra paragraph spacing after paragraph-ending lines.
 */
function computeColumnHeight(
  lines: AnnotatedLine[],
  start: number,
  end: number,
  lineHeight: number,
): number {
  let height = 0
  for (let i = start; i < end; i++) {
    if (lines[i].line.isLastLine && i < end - 1) {
      height += lineHeight * 2 // paragraph gap
    } else {
      height += lineHeight
    }
  }
  return height
}

function tryFill(
  lines: AnnotatedLine[],
  columnCount: number,
  lineHeight: number,
  targetHeight: number,
  config: ColumnConfig,
): ColumnBreak[] | null {
  if (targetHeight < lineHeight) return null

  const breaks: ColumnBreak[] = []
  let cursor = 0

  for (let col = 0; col < columnCount; col++) {
    const start = cursor

    if (cursor >= lines.length) break

    if (col === columnCount - 1) {
      // Last column takes everything remaining — check it fits
      const remainingHeight = computeColumnHeight(
        lines,
        cursor,
        lines.length,
        lineHeight,
      )
      if (remainingHeight > targetHeight + 0.5) return null
      breaks.push({ startIndex: start, endIndex: lines.length })
      cursor = lines.length
      break
    }

    // Walk forward to find idealEnd: the last line that fits within targetHeight
    let idealEnd = start
    let height = 0
    for (let i = start; i < lines.length; i++) {
      const lineH =
        lines[i].line.isLastLine && i < lines.length - 1
          ? lineHeight * 2
          : lineHeight
      if (height + lineH > targetHeight + 0.5) break
      height += lineH
      idealEnd = i + 1
    }

    if (idealEnd <= start) idealEnd = start + 1 // at least one line

    // Search backward from idealEnd for the best break
    const minEnd = start + Math.max(config.columnOrphans, 1)
    let bestEnd = Math.min(idealEnd, lines.length)
    let bestScore = Number.POSITIVE_INFINITY

    for (let end = bestEnd; end >= minEnd; end--) {
      const breakCost = evaluateBreakCost(lines, start, end, config)
      const distanceFromIdeal = idealEnd - end

      const score = distanceFromIdeal * 500 + breakCost

      if (score < bestScore) {
        bestScore = score
        bestEnd = end
      }
    }

    breaks.push({ startIndex: start, endIndex: bestEnd })
    cursor = bestEnd
  }

  if (cursor < lines.length) return null

  return breaks
}

/**
 * Evaluates the cost of breaking a column at a given point.
 */
function evaluateBreakCost(
  lines: AnnotatedLine[],
  start: number,
  end: number,
  config: ColumnConfig,
): number {
  if (end - start === 0) return Number.POSITIVE_INFINITY
  if (end >= lines.length) return 0 // end of text

  const lastLine = lines[end - 1]
  const nextLine = lines[end]

  // Break between paragraphs — free
  if (lastLine.paragraphIndex !== nextLine.paragraphIndex) {
    return 0
  }

  // Mid-paragraph break
  let cost = config.columnBreakPenalty

  // Widow: too few lines of this paragraph continuing in the NEXT column
  const linesLeftInParagraph =
    nextLine.paragraphLineCount - nextLine.lineInParagraph
  if (linesLeftInParagraph < config.columnWidows) {
    cost += 10000
  }

  // Orphan: too few lines of this paragraph at the bottom of THIS column
  // (only if paragraph started in a previous column — i.e. continued from before)
  const firstLineInCol = lines[start]
  if (
    firstLineInCol.paragraphIndex === lastLine.paragraphIndex &&
    firstLineInCol.lineInParagraph > 0
  ) {
    // Paragraph continued from previous column
    const linesOfParaInCol =
      lastLine.lineInParagraph - firstLineInCol.lineInParagraph + 1
    if (linesOfParaInCol < config.columnOrphans) {
      cost += 10000
    }
  }

  // Orphan at bottom: paragraph started in this column but too few lines before break
  if (
    firstLineInCol.paragraphIndex !== lastLine.paragraphIndex ||
    firstLineInCol.lineInParagraph === 0
  ) {
    // Find where this paragraph starts in the column
    let paraStartInCol = end - 1
    while (
      paraStartInCol > start &&
      lines[paraStartInCol - 1].paragraphIndex === lastLine.paragraphIndex
    ) {
      paraStartInCol--
    }
    const linesAtBottom = end - paraStartInCol
    if (
      linesAtBottom < config.columnWidows &&
      linesAtBottom < lastLine.paragraphLineCount
    ) {
      cost += 10000
    }
  }

  return cost
}
