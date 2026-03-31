import { getFontMetrics } from './measure.js'
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

    if (!isIncomplete) {
      if (line.styledSegments) {
        renderStyledWords(lineDiv, line.styledSegments, line.wordGapPx)
      } else {
        for (let w = 0; w < line.segments.length; w++) {
          const span = document.createElement('span')
          span.textContent = line.segments[w]
          if (w < line.segments.length - 1) {
            span.style.marginRight = `${line.wordGapPx}px`
          }
          lineDiv.appendChild(span)
        }
      }
    } else {
      if (line.styledSegments) {
        if (incompleteAlign === 'right' || incompleteAlign === 'center') {
          const wrapSpan = document.createElement('span')
          wrapSpan.style.display = 'inline-block'
          renderStyledWords(wrapSpan, line.styledSegments, -1)
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
          renderStyledWords(lineDiv, line.styledSegments, -1)
        }
      } else {
        const text = line.segments.join(' ')
        if (incompleteAlign === 'right' || incompleteAlign === 'center') {
          const span = document.createElement('span')
          span.textContent = text
          span.style.display = 'inline-block'
          const ctx = document.createElement('canvas').getContext('2d')!
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
 * Renders styled word segments into a parent element.
 * Each word gets a wrapper span; each run within gets its own styled span.
 * @param gapPx - word gap in pixels, or -1 to use natural spaces
 */
function renderStyledWords(
  parent: HTMLElement,
  segments: StyledSegment[],
  gapPx: number,
): void {
  for (let w = 0; w < segments.length; w++) {
    const seg = segments[w]
    const wordSpan = document.createElement('span')

    if (gapPx >= 0 && w < segments.length - 1) {
      wordSpan.style.marginRight = `${gapPx}px`
    } else if (gapPx < 0 && w < segments.length - 1) {
      // Natural space for incomplete lines
      const spaceSpan = document.createElement('span')
      spaceSpan.textContent = ' '
      // Append space after this word span below
      renderRunSpans(wordSpan, seg.runs)
      parent.appendChild(wordSpan)
      parent.appendChild(spaceSpan)
      continue
    }

    renderRunSpans(wordSpan, seg.runs)
    parent.appendChild(wordSpan)
  }
}

function renderRunSpans(parent: HTMLElement, runs: ResolvedRun[]): void {
  for (const run of runs) {
    if (run.style.href) {
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
      if (run.style.code) {
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
