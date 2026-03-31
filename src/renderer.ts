import { getFontMetrics } from './measure.js'
import type { JustifyResult } from './types.js'

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
      for (let w = 0; w < line.segments.length; w++) {
        const span = document.createElement('span')
        span.textContent = line.segments[w]
        if (w < line.segments.length - 1) {
          span.style.marginRight = `${line.wordGapPx}px`
        }
        lineDiv.appendChild(span)
      }
    } else {
      const text = line.segments.join(' ')
      if (incompleteAlign === 'right' || incompleteAlign === 'center') {
        // For right/center, use a nested span so optical margins work
        // with the hang offset on the parent div
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
