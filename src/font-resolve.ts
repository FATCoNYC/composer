import type { InlineStyle } from './types.js'

/** User-configurable font map for inline styles */
export interface FontMap {
  bold?: string
  italic?: string
  boldItalic?: string
  code?: string
}

/**
 * Derives a concrete CSS font string from a base font, an inline style,
 * and an optional user-provided font map.
 *
 * Resolution order: fontMap override → style.font escape hatch → auto-derived.
 */
export function resolveFont(
  baseFont: string,
  style: InlineStyle,
  fontMap?: FontMap,
): string {
  if (style.font) return style.font

  // Check font map first
  if (fontMap) {
    if (style.bold && style.italic && fontMap.boldItalic)
      return applyFontSize(fontMap.boldItalic, style.fontSize)
    if (style.bold && style.italic && fontMap.bold)
      return applyFontSize(`italic ${fontMap.bold}`, style.fontSize)
    if (style.bold && fontMap.bold)
      return applyFontSize(fontMap.bold, style.fontSize)
    if (style.italic && fontMap.italic)
      return applyFontSize(fontMap.italic, style.fontSize)
    if (style.code && fontMap.code)
      return applyFontSize(fontMap.code, style.fontSize)
  }

  return deriveFont(baseFont, style)
}

/**
 * Reads the browser's computed fonts for bold, italic, and code
 * by creating temporary styled elements inside a container.
 *
 * This picks up whatever the page's CSS defines for these elements.
 */
export function resolveFontsFromCSS(
  container: HTMLElement,
  baseFont: string,
): FontMap {
  const map: FontMap = {}

  const probe = (tag: string, parentTag?: string): string | undefined => {
    const wrapper = document.createElement(parentTag || 'div')
    wrapper.style.font = baseFont
    wrapper.style.position = 'absolute'
    wrapper.style.visibility = 'hidden'
    container.appendChild(wrapper)

    const el = document.createElement(tag)
    el.textContent = 'X'
    wrapper.appendChild(el)

    const computed = getComputedStyle(el)
    const font = computed.font
    container.removeChild(wrapper)
    return font || undefined
  }

  map.bold = probe('strong')
  map.italic = probe('em')
  map.code = probe('code')

  // Bold italic: <em> inside <strong>
  const biWrapper = document.createElement('div')
  biWrapper.style.font = baseFont
  biWrapper.style.position = 'absolute'
  biWrapper.style.visibility = 'hidden'
  container.appendChild(biWrapper)
  const strong = document.createElement('strong')
  const em = document.createElement('em')
  em.textContent = 'X'
  strong.appendChild(em)
  biWrapper.appendChild(strong)
  map.boldItalic = getComputedStyle(em).font || undefined
  container.removeChild(biWrapper)

  return map
}

function applyFontSize(font: string, fontSize?: number): string {
  if (!fontSize) return font
  return font.replace(/[\d.]+\s*(px|pt|em|rem|%)/, `${fontSize}px`)
}

/**
 * Auto-derives a font string by parsing the base font and applying style flags.
 */
function deriveFont(baseFont: string, style: InlineStyle): string {
  const match = baseFont.match(
    /^((?:italic|oblique)\s+)?(?:(small-caps)\s+)?(?:(bold|[1-9]00)\s+)?([\d.]+(?:px|pt|em|rem|%))\s*(.+)$/i,
  )

  if (!match) {
    return applySimple(baseFont, style)
  }

  let fontStyle = (match[1] || '').trim()
  const variant = (match[2] || '').trim()
  let weight = (match[3] || '').trim()
  let size = match[4]
  let family = match[5]

  if (style.code) {
    family = 'Menlo, Consolas, monospace'
    const sizeNum = Number.parseFloat(size)
    const unit = size.replace(/[\d.]+/, '')
    size = `${Math.round(sizeNum * 0.85 * 10) / 10}${unit}`
  }

  if (style.bold) {
    weight = 'bold'
  }

  if (style.italic) {
    fontStyle = 'italic'
  }

  if (style.fontSize) {
    size = `${style.fontSize}px`
  }

  const parts = [fontStyle, variant, weight, size, family].filter(Boolean)
  return parts.join(' ')
}

function applySimple(baseFont: string, style: InlineStyle): string {
  let font = baseFont

  if (style.code) {
    const sizeMatch = font.match(/([\d.]+)(px|pt|em|rem|%)/)
    if (sizeMatch) {
      const scaled =
        Math.round(Number.parseFloat(sizeMatch[1]) * 0.85 * 10) / 10
      font = `${scaled}${sizeMatch[2]} Menlo, Consolas, monospace`
    } else {
      font = '14px Menlo, Consolas, monospace'
    }
  }

  if (style.bold && !font.includes('bold')) {
    font = `bold ${font}`
  }

  if (style.italic && !font.includes('italic')) {
    font = `italic ${font}`
  }

  if (style.fontSize) {
    font = font.replace(/[\d.]+\s*(px|pt|em|rem|%)/, `${style.fontSize}px`)
  }

  return font
}
