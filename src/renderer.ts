import { getFontMetrics, getMeasureCtx } from './measure.js'
import type {
  ColumnResult,
  JustifyResult,
  ResolvedRun,
  StyledSegment,
} from './types.js'

export interface RenderOptions {
  container: HTMLElement
  result: JustifyResult
  font: string
  containerWidth: number
  singleWordJustification?: 'left' | 'full' | 'right' | 'center'
  lastLineAlignment?: 'left' | 'right' | 'center' | 'full'
  textMode?: 'justify' | 'rag'
  showGuides?: boolean
  onTextChange?: (newText: string) => void
}

function alignmentFor(mode: string): string {
  switch (mode) {
    case 'right':
      return 'right'
    case 'center':
      return 'center'
    case 'full':
      return 'justify'
    default:
      return 'left'
  }
}

export function renderToDOM(options: RenderOptions): void {
  const {
    container,
    result,
    font,
    containerWidth,
    singleWordJustification = 'left',
    lastLineAlignment = 'left',
    textMode = 'justify',
    showGuides = false,
    onTextChange,
  } = options

  container.innerHTML = ''

  const wrapper = document.createElement('div')
  wrapper.style.position = 'relative'
  wrapper.style.width = `${containerWidth}px`
  wrapper.style.height = `${result.totalHeight}px`
  wrapper.style.overflow = 'visible'
  wrapper.style.font = font

  for (const line of result.lines) {
    const lineDiv = document.createElement('div')
    lineDiv.style.position = 'absolute'
    lineDiv.style.top = `${line.y}px`
    lineDiv.style.left = `${-line.hangLeft}px`
    lineDiv.style.width = `${containerWidth}px`
    lineDiv.style.whiteSpace = 'nowrap'
    lineDiv.style.overflow = 'visible'
    lineDiv.style.height = `${result.lineHeight}px`
    lineDiv.style.lineHeight = `${result.lineHeight}px`

    if (line.glyphScale !== 1) {
      lineDiv.style.transform = `scaleX(${line.glyphScale})`
      lineDiv.style.transformOrigin = 'left'
    }

    if (line.letterSpacingPx !== 0) {
      lineDiv.style.letterSpacing = `${line.letterSpacingPx}px`
    }

    const isRag = textMode === 'rag'
    const incompleteAlign = isRag
      ? lastLineAlignment
      : line.isLastLine
        ? lastLineAlignment
        : singleWordJustification
    const isIncomplete =
      (isRag || line.isLastLine || line.segments.length <= 1) &&
      incompleteAlign !== 'full'

    // Compute word-spacing: the extra px beyond the natural space character width
    if (!isIncomplete && line.segments.length > 1) {
      const ctx = getMeasureCtx()
      ctx.font = line.styledSegments
        ? line.styledSegments[0]?.runs[0]?.font || font
        : font
      const naturalSpace = ctx.measureText(' ').width
      lineDiv.style.wordSpacing = `${line.wordGapPx - naturalSpace}px`
    }

    if (!isIncomplete) {
      if (line.styledSegments) {
        renderStyledWords(lineDiv, line.styledSegments)
      } else {
        lineDiv.textContent = line.segments.join(' ')
      }
    } else {
      if (line.styledSegments) {
        if (incompleteAlign === 'right' || incompleteAlign === 'center') {
          const wrapSpan = document.createElement('span')
          wrapSpan.style.display = 'inline-block'
          renderStyledWords(wrapSpan, line.styledSegments)
          const ctx = document.createElement('canvas').getContext('2d')
          let textW = 0
          if (ctx) {
            for (const seg of line.styledSegments) {
              for (const run of seg.runs) {
                ctx.font = run.font
                textW += ctx.measureText(run.text).width
              }
              textW += ctx.measureText(' ').width // inter-word space
            }
          }
          if (incompleteAlign === 'right') {
            wrapSpan.style.marginLeft = `${containerWidth - textW + line.hangLeft}px`
          } else {
            wrapSpan.style.marginLeft = `${(containerWidth - textW + line.hangLeft) / 2}px`
          }
          lineDiv.appendChild(wrapSpan)
        } else {
          lineDiv.style.textAlign = alignmentFor(incompleteAlign)
          renderStyledWords(lineDiv, line.styledSegments)
        }
      } else {
        const text = line.segments.join(' ')
        if (incompleteAlign === 'right' || incompleteAlign === 'center') {
          const span = document.createElement('span')
          span.textContent = text
          span.style.display = 'inline-block'
          const ctx = getMeasureCtx()
          ctx.font = font
          const textW = ctx.measureText(text).width
          if (incompleteAlign === 'right') {
            span.style.marginLeft = `${containerWidth - textW + line.hangLeft}px`
          } else {
            span.style.marginLeft = `${(containerWidth - textW + line.hangLeft) / 2}px`
          }
          lineDiv.appendChild(span)
        } else {
          lineDiv.style.textAlign = alignmentFor(incompleteAlign)
          lineDiv.textContent = text
        }
      }
    }

    wrapper.appendChild(lineDiv)
  }

  // Copy handler: join lines into paragraphs so paste gives flowing text
  wrapper.addEventListener('copy', (e) => {
    e.preventDefault()
    const parts: string[] = []
    for (const line of result.lines) {
      const lineText = line.styledSegments
        ? line.styledSegments
            .map((seg) => seg.runs.map((r) => r.text).join(''))
            .join(' ')
        : line.segments.join(' ')
      if (parts.length > 0) {
        const prevLine = result.lines[parts.length - 1]
        // Previous line ended a paragraph — start a new one
        if (prevLine?.isLastLine) {
          parts.push(`\n\n${lineText}`)
        } else {
          parts.push(` ${lineText}`)
        }
      } else {
        parts.push(lineText)
      }
    }
    e.clipboardData?.setData('text/plain', parts.join(''))
  })

  container.appendChild(wrapper)

  if (onTextChange) {
    setupInlineEditing(wrapper, result, containerWidth, font, onTextChange)
  }

  if (showGuides) {
    renderGuides(container, containerWidth, result, font)
  }
}

export interface ColumnRenderOptions {
  /** CSS grid container element to render into */
  container: HTMLElement
  /** Result from composeColumns() */
  result: ColumnResult
  /** CSS font string */
  font: string
  singleWordJustification?: 'left' | 'full' | 'right' | 'center'
  lastLineAlignment?: 'left' | 'right' | 'center' | 'full'
  textMode?: 'justify' | 'rag'
  showGuides?: boolean
}

/**
 * Renders a multi-column composition result into a CSS grid container.
 * Creates a child element for each column, then renders lines into each.
 * Guides are rendered once across the full container, not per-column.
 */
export function renderColumnsToDOM(options: ColumnRenderOptions): void {
  const {
    container,
    result,
    font,
    singleWordJustification = 'left',
    lastLineAlignment = 'left',
    textMode = 'justify',
    showGuides = false,
  } = options

  container.innerHTML = ''
  container.style.position = 'relative'

  for (const col of result.columns) {
    const colDiv = document.createElement('div')
    colDiv.style.position = 'relative'
    colDiv.style.width = `${col.width}px`
    colDiv.style.height = `${result.totalHeight}px`

    const colResult: JustifyResult = {
      lines: col.lines,
      totalHeight: col.height,
      lineHeight: result.lineHeight,
      gridIncrement: result.lineHeight,
    }

    // Render lines without per-column guides
    renderToDOM({
      container: colDiv,
      result: colResult,
      font,
      containerWidth: col.width,
      singleWordJustification,
      lastLineAlignment,
      textMode,
      showGuides: false,
    })

    container.appendChild(colDiv)
  }

  if (showGuides) {
    renderColumnGuides(container, result, font)
  }
}

/**
 * Renders guides on the column container's parent (the outer wrapper),
 * matching non-columns renderGuides exactly: edge-to-edge vertically
 * and horizontally, with padding-aware positioning.
 */
function renderColumnGuides(
  container: HTMLElement,
  result: ColumnResult,
  font: string,
): void {
  // Render on the parent wrapper so guides match the non-columns path
  // which renders on the #output container with its padding.
  const target = container.parentElement || container
  target.style.position = 'relative'

  const pad = getComputedStyle(target).paddingLeft
  const padTop = getComputedStyle(target).paddingTop
  const guideBase =
    'position:absolute;top:0;bottom:0;width:1px;pointer-events:none;z-index:0;'

  // Column edge guides — left edge solid, right edge faint
  let x = 0
  for (let i = 0; i < result.columns.length; i++) {
    const leftGuide = document.createElement('div')
    leftGuide.style.cssText = `${guideBase}left:calc(${pad} + ${x}px);border-left:1.5px solid rgba(255,0,0,0.35);`
    target.appendChild(leftGuide)

    const rightGuide = document.createElement('div')
    rightGuide.style.cssText = `${guideBase}left:calc(${pad} + ${x + result.columnWidths[i]}px);border-left:1.5px solid rgba(255,0,0,0.1);`
    target.appendChild(rightGuide)

    x += result.columnWidths[i] + result.columnGap
  }

  // Baseline grid — full edge-to-edge, matching non-columns exactly
  const gi = result.lineHeight
  const metrics = getFontMetrics(font)
  const emHeight = metrics.ascent + metrics.descent
  const halfLeading = (result.lineHeight - emHeight) / 2
  const baselineOffset = halfLeading + metrics.ascent

  const gridOverlay = document.createElement('div')
  gridOverlay.style.cssText = `position:absolute;top:calc(${padTop} - ${gi * 2}px + ${baselineOffset}px);left:0;right:0;bottom:0;pointer-events:none;z-index:0;background:repeating-linear-gradient(to bottom, transparent 0px, transparent ${gi - 1}px, rgba(135,206,235,0.5) ${gi - 1}px, rgba(135,206,235,0.5) ${gi}px);`
  target.appendChild(gridOverlay)
}

/**
 * Gets the href shared by all runs in a segment, or undefined if mixed/none.
 */
function segmentHref(seg: StyledSegment): string | undefined {
  const href = seg.runs[0]?.style.href
  if (!href) return undefined
  for (const run of seg.runs) {
    if (run.style.href !== href) return undefined
  }
  return href
}

/** Check if all runs in a segment are code */
function segmentIsCode(seg: StyledSegment): boolean {
  return seg.runs.length > 0 && seg.runs.every((r) => r.style.code)
}

/**
 * Renders styled word segments into a parent element.
 * Consecutive words sharing the same href are wrapped in a single <a> tag.
 * Spacing between words uses real space characters, controlled by the
 * parent's word-spacing CSS property.
 */
function renderStyledWords(
  parent: HTMLElement,
  segments: StyledSegment[],
): void {
  let w = 0
  while (w < segments.length) {
    // Space before this segment (between words)
    if (w > 0) parent.appendChild(document.createTextNode(' '))

    const href = segmentHref(segments[w])

    if (href) {
      // Group consecutive words with the same href under one <a>
      const a = document.createElement('a')
      a.href = href
      a.style.color = 'inherit'
      a.style.textDecoration = 'underline'

      let first = true
      while (w < segments.length && segmentHref(segments[w]) === href) {
        if (!first) a.appendChild(document.createTextNode(' '))
        first = false
        const wordSpan = document.createElement('span')
        renderRunSpans(wordSpan, segments[w].runs, true)
        a.appendChild(wordSpan)
        w++
      }
      parent.appendChild(a)
    } else if (segmentIsCode(segments[w])) {
      // Group consecutive code words under one <code>
      const code = document.createElement('code')
      code.style.backgroundColor = 'rgba(128,128,128,0.12)'
      code.style.borderRadius = '3px'
      code.style.boxDecorationBreak = 'clone'

      let first = true
      while (w < segments.length && segmentIsCode(segments[w])) {
        if (!first) code.appendChild(document.createTextNode(' '))
        first = false
        const wordSpan = document.createElement('span')
        renderRunSpans(wordSpan, segments[w].runs, false, true)
        code.appendChild(wordSpan)
        w++
      }
      parent.appendChild(code)
    } else {
      const wordSpan = document.createElement('span')
      renderRunSpans(wordSpan, segments[w].runs, false)
      parent.appendChild(wordSpan)
      w++
    }
  }
}

/**
 * Renders individual run spans inside a word element.
 * When insideLink is true, runs skip <a> wrapping (parent is already an <a>).
 * When insideCode is true, runs skip <code> styling (parent is already a <code>).
 */
function renderRunSpans(
  parent: HTMLElement,
  runs: ResolvedRun[],
  insideLink: boolean,
  insideCode = false,
): void {
  for (const run of runs) {
    if (run.style.href && !insideLink) {
      const a = document.createElement('a')
      a.href = run.style.href
      a.textContent = run.text
      a.style.font = run.font
      a.style.color = 'inherit'
      a.style.textDecoration = 'underline'
      parent.appendChild(a)
    } else {
      const span = document.createElement('span')
      span.textContent = run.text
      span.style.font = run.font
      if (run.style.code && !insideCode) {
        span.style.backgroundColor = 'rgba(128,128,128,0.12)'
        span.style.borderRadius = '3px'
        span.style.boxDecorationBreak = 'clone'
      }
      parent.appendChild(span)
    }
  }
}

function setupInlineEditing(
  wrapper: HTMLElement,
  result: JustifyResult,
  containerWidth: number,
  font: string,
  onTextChange: (newText: string) => void,
): void {
  const paragraphs: string[] = []
  let currentPara: string[] = []
  for (const line of result.lines) {
    currentPara.push(line.segments.join(' '))
    if (line.isLastLine) {
      paragraphs.push(currentPara.join(' '))
      currentPara = []
    }
  }
  if (currentPara.length > 0) paragraphs.push(currentPara.join(' '))
  const fullText = paragraphs.join('\n\n')

  wrapper.style.cursor = 'text'
  wrapper.addEventListener('click', () => {
    const editor = document.createElement('div')
    editor.contentEditable = 'true'
    editor.innerText = fullText
    editor.style.width = `${containerWidth}px`
    editor.style.minHeight = `${result.totalHeight}px`
    editor.style.font = font
    editor.style.lineHeight = `${result.lineHeight}px`
    editor.style.outline = 'none'
    editor.style.whiteSpace = 'pre-wrap'
    editor.style.wordBreak = 'break-word'
    editor.spellcheck = false

    const container = wrapper.parentElement
    if (!container) return
    wrapper.style.display = 'none'
    container.insertBefore(editor, wrapper)
    editor.focus()

    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)

    editor.addEventListener('blur', () => {
      const newText = editor.innerText || ''
      editor.remove()
      wrapper.style.display = ''
      onTextChange(newText)
    })
  })
}

function renderGuides(
  container: HTMLElement,
  containerWidth: number,
  result: JustifyResult,
  font: string,
): void {
  container.style.position = 'relative'
  const pad = getComputedStyle(container).paddingLeft
  const guideBase =
    'position:absolute;top:0;bottom:0;width:1px;pointer-events:none;z-index:0;'

  const leftGuide = document.createElement('div')
  leftGuide.style.cssText = `${guideBase}left:${pad};border-left:1.5px solid rgba(255,0,0,0.35);`
  container.appendChild(leftGuide)

  const rightGuide = document.createElement('div')
  rightGuide.style.cssText = `${guideBase}left:calc(${pad} + ${containerWidth}px);border-left:1.5px solid rgba(255,0,0,0.1);`
  container.appendChild(rightGuide)

  const padTop = getComputedStyle(container).paddingTop
  const gi = result.gridIncrement
  const metrics = getFontMetrics(font)
  const emHeight = metrics.ascent + metrics.descent
  const halfLeading = (result.lineHeight - emHeight) / 2
  const baselineOffset = halfLeading + metrics.ascent

  const gridOverlay = document.createElement('div')
  gridOverlay.style.cssText = `position:absolute;top:calc(${padTop} - ${gi * 2}px + ${baselineOffset}px);left:0;right:0;bottom:0;pointer-events:none;z-index:0;background:repeating-linear-gradient(to bottom, transparent 0px, transparent ${gi - 1}px, rgba(135,206,235,0.5) ${gi - 1}px, rgba(135,206,235,0.5) ${gi}px);`
  container.appendChild(gridOverlay)
}
