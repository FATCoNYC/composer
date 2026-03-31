/**
 * CSS grid introspection — reads column geometry from a grid container element.
 */

export interface GridGeometry {
  /** Resolved column widths in pixels */
  widths: number[]
  /** Column gap in pixels */
  gap: number
}

/**
 * Reads column widths and gap from a CSS grid container.
 *
 * Uses `getComputedStyle` to read the resolved `gridTemplateColumns`
 * (which the browser always resolves to pixel values) and `columnGap`.
 */
export function readGridColumns(container: HTMLElement): GridGeometry {
  const style = getComputedStyle(container)

  // gridTemplateColumns is always resolved to px values by the browser,
  // e.g. "300px 300px 300px" even if the source uses fr/% units.
  const templateCols = style.gridTemplateColumns

  let widths: number[]
  if (templateCols && templateCols !== 'none') {
    widths = templateCols
      .split(/\s+/)
      .map((v) => Number.parseFloat(v))
      .filter((n) => !Number.isNaN(n) && n > 0)
  } else {
    // Fallback: measure child elements if grid template isn't explicit
    widths = Array.from(container.children).map(
      (child) => (child as HTMLElement).offsetWidth,
    )
  }

  if (widths.length === 0) {
    widths = [container.clientWidth]
  }

  // Read column gap (modern property first, then legacy fallback)
  const gapStr = style.columnGap || style.getPropertyValue('grid-column-gap')
  const gap = gapStr && gapStr !== 'normal' ? Number.parseFloat(gapStr) || 0 : 0

  return { widths, gap }
}
