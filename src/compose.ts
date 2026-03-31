import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext'
import { getHangAmount } from './hang.js'
import { prepareHyphenatedWords } from './hyphenate.js'
import { knuthPlassBreak } from './knuth-plass.js'
import { computeLineMetrics } from './line-metrics.js'
import { getMeasureCtx, parseFontSize } from './measure.js'
import {
  DEFAULT_CONFIG,
  type JustifiedLine,
  type JustifyConfig,
  type JustifyResult,
} from './types.js'

interface LineAnalysis {
  wordGaps: number
  letterCount: number
  spaceWidth: number
  textWidth: number
  textSegments: string[]
}

function analyzeLine(
  lineText: string,
  lineWidth: number,
  font: string,
): LineAnalysis {
  const trimmed = lineText.replace(/\s+$/, '')
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0)
  const wordGaps = Math.max(0, words.length - 1)
  const letterCount = words.reduce((sum, w) => sum + [...w].length, 0)

  const ctx = getMeasureCtx()
  ctx.font = font
  const textWidth = ctx.measureText(words.join('')).width
  const spaceWidth = Math.max(0, lineWidth - textWidth)

  return { wordGaps, letterCount, spaceWidth, textWidth, textSegments: words }
}

function distributeSlack(
  slack: number,
  textWidth: number,
  spaceWidth: number,
  wordGaps: number,
  letterCount: number,
  config: JustifyConfig,
): { wordGapPx: number; letterSpacingPx: number; glyphScale: number } {
  const m = computeLineMetrics(
    textWidth,
    spaceWidth,
    wordGaps,
    letterCount,
    config,
  )

  let remaining = slack - (m.desiredWidth - (textWidth + spaceWidth))

  // 1. Word Spacing (bounded)
  let wordGapPx = m.desiredGap
  if (wordGaps > 0 && m.normalGap > 0) {
    const idealGap = m.desiredGap + remaining / wordGaps
    wordGapPx = Math.max(m.minGap, Math.min(m.maxGap, idealGap))
    remaining -= (wordGapPx - m.desiredGap) * wordGaps
  }

  // 2. Letter Spacing (bounded)
  let letterSpacingPx = m.desiredLetterPx
  if (Math.abs(remaining) > 0.5 && letterCount > 1) {
    const idealLs = m.desiredLetterPx + remaining / (letterCount - 1)
    letterSpacingPx = Math.max(m.minLetterPx, Math.min(m.maxLetterPx, idealLs))
    remaining -= (letterSpacingPx - m.desiredLetterPx) * (letterCount - 1)
  }

  // 3. Glyph Scaling (bounded)
  let glyphScale = m.desiredScale
  if (Math.abs(remaining) > 0.5 && textWidth > 0) {
    const idealScale = m.desiredScale + remaining / textWidth
    glyphScale = Math.max(m.minScale, Math.min(m.maxScale, idealScale))
    remaining -= (glyphScale - m.desiredScale) * textWidth
  }

  // 4. Overflow into word spacing (unbounded max)
  if (Math.abs(remaining) > 0.5 && wordGaps > 0) {
    wordGapPx = Math.max(m.minGap, wordGapPx + remaining / wordGaps)
  }

  // Final clamp: letter spacing
  letterSpacingPx = Math.max(
    m.minLetterPx,
    Math.min(m.maxLetterPx, letterSpacingPx),
  )

  return { wordGapPx, letterSpacingPx, glyphScale }
}

export interface ComposeOptions {
  text: string
  font: string
  containerWidth: number
  config?: Partial<JustifyConfig>
}

function processLine(
  segments: string[],
  textWidth: number,
  spaceWidth: number,
  wordGaps: number,
  letterCount: number,
  isLastLine: boolean,
  y: number,
  containerWidth: number,
  font: string,
  config: JustifyConfig,
): JustifiedLine {
  let hangLeft = 0
  let hangRight = 0
  if (config.opticalAlignment && segments.length > 0) {
    const firstChar = [...segments[0]][0]
    const lastChar = [...segments[segments.length - 1]].at(-1)
    if (firstChar) hangLeft = getHangAmount(firstChar, font)
    if (lastChar) hangRight = getHangAmount(lastChar, font)
  }

  const lineWidth = textWidth + spaceWidth

  if (config.textMode === 'rag') {
    const baseGap = wordGaps > 0 ? spaceWidth / wordGaps : 0
    return {
      segments,
      isLastLine,
      wordGapPx: baseGap,
      letterSpacingPx: 0,
      glyphScale: 1,
      y,
      hangLeft,
      hangRight,
    }
  }

  const totalHang = hangLeft + hangRight
  const slackBuffer = totalHang > 0 ? 0 : 0.5
  const effectiveSlack = containerWidth - slackBuffer - lineWidth

  if (wordGaps === 0) {
    const gsMin = config.glyphScaling.min / 100
    const gsMax = config.glyphScaling.max / 100
    let glyphScale = config.glyphScaling.desired / 100
    let letterSpacingPx = 0

    if (textWidth > containerWidth) {
      glyphScale = Math.max(gsMin, containerWidth / textWidth)
    } else if (!isLastLine && config.singleWordJustification === 'full') {
      const avgCharWidth = letterCount > 0 ? textWidth / letterCount : 0
      const minLsPx = (config.letterSpacing.min / 100) * avgCharWidth
      const maxLsPx = (config.letterSpacing.max / 100) * avgCharWidth
      if (letterCount > 1) {
        letterSpacingPx = Math.max(
          minLsPx,
          Math.min(maxLsPx, effectiveSlack / (letterCount - 1)),
        )
      }
    }

    glyphScale = Math.max(gsMin, Math.min(gsMax, glyphScale))
    return {
      segments,
      isLastLine,
      wordGapPx: 0,
      letterSpacingPx,
      glyphScale,
      y,
      hangLeft,
      hangRight,
    }
  }

  const shouldJustify = !isLastLine || config.lastLineAlignment === 'full'

  if (!shouldJustify) {
    const baseGap = spaceWidth / wordGaps
    return {
      segments,
      isLastLine,
      wordGapPx: baseGap,
      letterSpacingPx: 0,
      glyphScale: 1,
      y,
      hangLeft,
      hangRight,
    }
  }

  let { wordGapPx, letterSpacingPx, glyphScale } = distributeSlack(
    effectiveSlack,
    textWidth,
    spaceWidth,
    wordGaps,
    letterCount,
    config,
  )

  const minScale = config.glyphScaling.min / 100
  const maxScale = config.glyphScaling.max / 100
  glyphScale = Math.max(minScale, Math.min(maxScale, glyphScale))

  // Recalculate wordGapPx so the *scaled* total (renderer applies scaleX
  // to the entire line) equals the target width exactly.
  if (wordGaps > 0) {
    const targetWidth = containerWidth + totalHang - slackBuffer
    const totalLetterSpacing = letterSpacingPx * Math.max(0, letterCount - 1)
    const exactGap =
      (targetWidth / glyphScale - textWidth - totalLetterSpacing) / wordGaps
    const normalGap = spaceWidth / wordGaps
    const minGap = normalGap * (config.wordSpacing.min / 100)

    if (exactGap >= minGap) {
      wordGapPx = exactGap
    } else {
      // Enforce minGap by solving for glyphScale instead.
      // glyphScale absorbs the difference — a slightly more compressed
      // line is preferable to collapsed word spacing.
      wordGapPx = minGap
      const unscaledWidth = textWidth + totalLetterSpacing + minGap * wordGaps
      glyphScale = targetWidth / unscaledWidth
    }
  }

  return {
    segments,
    isLastLine,
    wordGapPx,
    letterSpacingPx,
    glyphScale,
    y,
    hangLeft,
    hangRight,
  }
}

function applyTypographersQuotes(text: string): string {
  return (
    text
      // Double quotes
      .replace(/"(\S)/g, '\u201C$1')
      .replace(/(\S)"/g, '$1\u201D')
      .replace(/"\s/g, '\u201D ')
      .replace(/\s"/g, ' \u201C')
      .replace(/^"/g, '\u201C')
      // Single quotes / apostrophes
      .replace(/'(\S)/g, '\u2018$1')
      .replace(/(\S)'/g, '$1\u2019')
      .replace(/'\s/g, '\u2019 ')
      .replace(/\s'/g, ' \u2018')
      .replace(/^'/g, '\u2018')
      // Dashes
      .replace(/---/g, '\u2014')
      .replace(/--/g, '\u2013')
      // Ellipsis
      .replace(/\.\.\./g, '\u2026')
  )
}

export function compose(options: ComposeOptions): JustifyResult {
  const config: JustifyConfig = { ...DEFAULT_CONFIG, ...options.config }
  const { font, containerWidth } = options
  const text = config.typographersQuotes
    ? applyTypographersQuotes(options.text)
    : options.text

  const fontSize = parseFontSize(font)
  const lineHeight = fontSize * (config.autoLeading / 100)
  const grid = config.baselineGrid > 0 ? config.baselineGrid : 0
  const snapToGrid = (v: number) => (grid > 0 ? Math.ceil(v / grid) * grid : v)

  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0)
  const justifiedLines: JustifiedLine[] = []
  let currentY = 0

  const ctx = getMeasureCtx()
  ctx.font = font
  const spaceCharWidth = ctx.measureText(' ').width

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx]

    if (config.composer === 'paragraph') {
      const words = para.split(/\s+/).filter((w) => w.length > 0)
      const hyphenConfig = config.hyphenation || undefined
      const hyphenWidth = ctx.measureText('-').width

      const hWords = hyphenConfig
        ? prepareHyphenatedWords(words, font, hyphenConfig, ctx)
        : words.map((w) => ({
            text: w,
            syllables: [w],
            width: ctx.measureText(w).width,
            syllableWidths: [ctx.measureText(w).width],
            letterCount: [...w].length,
          }))

      const kpLines = knuthPlassBreak(
        hWords,
        spaceCharWidth,
        containerWidth,
        config,
        hyphenWidth,
        ctx,
      )

      if (config.avoidWidows && kpLines.length >= 2) {
        const lastLine = kpLines[kpLines.length - 1]
        const prevLine = kpLines[kpLines.length - 2]
        if (lastLine.words.length === 1 && prevLine.words.length >= 2) {
          const moved = prevLine.words.pop()
          if (!moved) continue
          prevLine.textWidth -= moved.width
          prevLine.wordGaps = Math.max(0, prevLine.words.length - 1)
          prevLine.naturalSpaceWidth = spaceCharWidth * prevLine.wordGaps
          prevLine.letterCount -= moved.letterCount
          lastLine.words.unshift(moved)
          lastLine.textWidth += moved.width
          lastLine.wordGaps = Math.max(0, lastLine.words.length - 1)
          lastLine.naturalSpaceWidth = spaceCharWidth * lastLine.wordGaps
          lastLine.letterCount += moved.letterCount
        }
      }

      for (let i = 0; i < kpLines.length; i++) {
        const kpLine = kpLines[i]
        const isLastLine = i === kpLines.length - 1
        justifiedLines.push(
          processLine(
            kpLine.words.map((w) => w.text),
            kpLine.textWidth,
            kpLine.naturalSpaceWidth,
            kpLine.wordGaps,
            kpLine.letterCount,
            isLastLine,
            currentY,
            containerWidth,
            font,
            config,
          ),
        )
        currentY = snapToGrid(currentY + lineHeight)
      }
    } else {
      const prepared = prepareWithSegments(para, font)
      const layoutResult = layoutWithLines(prepared, containerWidth, lineHeight)

      for (let i = 0; i < layoutResult.lines.length; i++) {
        const line = layoutResult.lines[i]
        const isLastLine = i === layoutResult.lines.length - 1
        const analysis = analyzeLine(line.text, line.width, font)
        justifiedLines.push(
          processLine(
            analysis.textSegments,
            analysis.textWidth,
            analysis.spaceWidth,
            analysis.wordGaps,
            analysis.letterCount,
            isLastLine,
            currentY,
            containerWidth,
            font,
            config,
          ),
        )
        currentY = snapToGrid(currentY + lineHeight)
      }
    }

    if (pIdx < paragraphs.length - 1) {
      currentY = snapToGrid(currentY + lineHeight)
    }
  }

  return {
    lines: justifiedLines,
    totalHeight: currentY,
    lineHeight,
    gridIncrement: grid > 0 ? grid : lineHeight,
  }
}
