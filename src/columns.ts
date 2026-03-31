/**
 * Multi-column composition — orchestrates line breaking and column breaking
 * across CSS grid columns.
 */

import { type AnnotatedLine, breakIntoColumns } from './column-break.js'
import { compose } from './compose.js'
import type { FontMap } from './font-resolve.js'
import { readGridColumns } from './grid.js'
import { parseFontSize } from './measure.js'
import {
  type ColumnConfig,
  type ColumnData,
  type ColumnResult,
  DEFAULT_COLUMN_CONFIG,
  DEFAULT_CONFIG,
  type JustifiedLine,
  type JustifyConfig,
} from './types.js'

export interface ColumnComposeOptions {
  /** Text to compose across columns */
  text: string
  /** CSS font string (e.g. "16px Georgia") */
  font: string
  /**
   * Column widths in pixels. Pass an array directly, or pass a CSS grid
   * container element and widths will be read from it.
   */
  columns: number[] | HTMLElement
  /** Configuration (extends JustifyConfig with column-specific settings) */
  config?: Partial<ColumnConfig>
  /** When true, parse `text` as markdown and apply inline styles */
  markdown?: boolean
  /** Font overrides for bold, italic, code styles */
  fonts?: FontMap
  /** Maximum column height in pixels for fill-first mode. */
  columnHeight?: number
}

/**
 * Composes text across multiple columns using the paragraph composer.
 *
 * Accepts column widths as a numeric array (pure computation, no DOM needed)
 * or as a CSS grid container element (reads widths from DOM).
 */
export function composeColumns(options: ColumnComposeOptions): ColumnResult {
  const justifyConfig: JustifyConfig = { ...DEFAULT_CONFIG, ...options.config }
  const columnConfig: ColumnConfig = {
    ...justifyConfig,
    ...DEFAULT_COLUMN_CONFIG,
    ...options.config,
  }

  const { font, text, markdown, fonts, columnHeight } = options

  // Resolve column widths and gap
  let columnWidths: number[]
  let resolvedGap: number

  if (Array.isArray(options.columns)) {
    columnWidths = options.columns
    resolvedGap = columnConfig.columnGap === 'auto' ? 0 : columnConfig.columnGap
  } else {
    const grid = readGridColumns(options.columns)
    columnWidths = grid.widths
    resolvedGap =
      columnConfig.columnGap === 'auto' ? grid.gap : columnConfig.columnGap
  }

  // Cap column count
  const columnCount = Math.min(columnWidths.length, columnConfig.maxColumns)
  columnWidths = columnWidths.slice(0, columnCount)

  const fontSize = parseFontSize(font)
  const lineHeight = fontSize * (justifyConfig.autoLeading / 100)

  // Compose all text at the first column's width (uniform for now)
  const width = columnWidths[0]
  const result = compose({
    text,
    font,
    containerWidth: width,
    config: justifyConfig,
    markdown,
    fonts,
  })

  // Annotate lines with paragraph membership
  const annotated = annotateLines(result.lines)

  // For fill-first, use provided height or container height; for balanced, totalHeight is fine
  const maxHeight = columnHeight ?? result.totalHeight

  // Break into columns
  const breaks = breakIntoColumns(
    annotated,
    columnCount,
    lineHeight,
    maxHeight,
    columnConfig,
  )

  // Assemble with consistent baseline across all columns
  return assembleResult(
    annotated,
    breaks,
    columnWidths,
    columnCount,
    resolvedGap,
    lineHeight,
  )
}

/**
 * Annotates a flat line array with paragraph membership info,
 * needed by the column-breaking algorithm.
 */
function annotateLines(lines: JustifiedLine[]): AnnotatedLine[] {
  const annotated: AnnotatedLine[] = []
  const paraGroups: JustifiedLine[][] = []
  let currentGroup: JustifiedLine[] = []

  for (const line of lines) {
    currentGroup.push(line)
    if (line.isLastLine) {
      paraGroups.push(currentGroup)
      currentGroup = []
    }
  }
  if (currentGroup.length > 0) {
    paraGroups.push(currentGroup)
  }

  let paraIndex = 0
  for (const group of paraGroups) {
    for (let i = 0; i < group.length; i++) {
      annotated.push({
        line: group[i],
        paragraphIndex: paraIndex,
        lineInParagraph: i,
        paragraphLineCount: group.length,
      })
    }
    paraIndex++
  }

  return annotated
}

/**
 * Assembles the final ColumnResult from break points and annotated lines.
 * All columns share the same baseline grid — Y positions are computed
 * from 0 within each column using the same lineHeight.
 */
function assembleResult(
  annotated: AnnotatedLine[],
  breaks: { startIndex: number; endIndex: number }[],
  columnWidths: number[],
  columnCount: number,
  gap: number,
  lineHeight: number,
): ColumnResult {
  const columns: ColumnData[] = []
  let x = 0

  for (let col = 0; col < columnCount; col++) {
    const brk = breaks[col]
    if (!brk || brk.startIndex >= brk.endIndex) {
      columns.push({ lines: [], width: columnWidths[col], x, height: 0 })
      x += columnWidths[col] + gap
      continue
    }

    const colLines: JustifiedLine[] = []
    let currentY = 0

    for (let i = brk.startIndex; i < brk.endIndex; i++) {
      const annotatedLine = annotated[i]
      colLines.push({ ...annotatedLine.line, y: currentY })

      // Paragraph spacing: extra line height after last line of a paragraph
      if (annotatedLine.line.isLastLine && i < brk.endIndex - 1) {
        currentY += lineHeight * 2
      } else {
        currentY += lineHeight
      }
    }

    columns.push({
      lines: colLines,
      width: columnWidths[col],
      x,
      height: currentY,
    })

    x += columnWidths[col] + gap
  }

  const totalHeight = Math.max(...columns.map((c) => c.height), 0)

  return {
    columns,
    totalHeight,
    columnWidths,
    columnGap: gap,
    lineHeight,
  }
}
