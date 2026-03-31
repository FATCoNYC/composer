import { fromMarkdown } from 'mdast-util-from-markdown'
import type { InlineStyle, StyledRun } from './types.js'

type MdNode = ReturnType<typeof fromMarkdown>['children'][number]
type PhrasingNode = MdNode & { children?: PhrasingNode[]; value?: string }

/**
 * Parses a markdown string into an array of paragraphs,
 * where each paragraph is an array of StyledRuns.
 *
 * Supports: **bold**, *italic*, `code`, [links](url), and nested combinations.
 * Headings are treated as paragraphs with a fontSize derived from level.
 */
export function parseMarkdownToRuns(
  text: string,
  baseFontSize: number,
): StyledRun[][] {
  const tree = fromMarkdown(text)
  const paragraphs: StyledRun[][] = []

  for (const node of tree.children) {
    const runs = flattenBlock(node as PhrasingNode, {}, baseFontSize)
    if (runs.length > 0) {
      paragraphs.push(runs)
    }
  }

  return paragraphs
}

const HEADING_SCALES: Record<number, number> = {
  1: 2.0,
  2: 1.5,
  3: 1.25,
  4: 1.1,
  5: 1.0,
  6: 0.875,
}

function flattenBlock(
  node: PhrasingNode,
  parentStyle: InlineStyle,
  baseFontSize: number,
): StyledRun[] {
  const type = (node as { type: string }).type

  if (type === 'paragraph') {
    return flattenInline(node.children || [], parentStyle)
  }

  if (type === 'heading') {
    const level = (node as { depth?: number }).depth || 1
    const scale = HEADING_SCALES[level] || 1
    const headingStyle: InlineStyle = {
      ...parentStyle,
      fontSize: Math.round(baseFontSize * scale),
      bold: level <= 3 ? true : parentStyle.bold,
    }
    return flattenInline(node.children || [], headingStyle)
  }

  // For other block types (blockquote, list items), extract inline content
  if (node.children) {
    const runs: StyledRun[] = []
    for (const child of node.children) {
      runs.push(
        ...flattenBlock(child as PhrasingNode, parentStyle, baseFontSize),
      )
    }
    return runs
  }

  if (type === 'text' && node.value) {
    return [{ text: node.value, style: parentStyle }]
  }

  return []
}

function flattenInline(
  nodes: PhrasingNode[],
  parentStyle: InlineStyle,
): StyledRun[] {
  const runs: StyledRun[] = []

  for (const node of nodes) {
    const type = (node as { type: string }).type

    if (type === 'text') {
      if (node.value) {
        runs.push({ text: node.value, style: { ...parentStyle } })
      }
    } else if (type === 'strong') {
      const childStyle = { ...parentStyle, bold: true }
      runs.push(...flattenInline(node.children || [], childStyle))
    } else if (type === 'emphasis') {
      const childStyle = { ...parentStyle, italic: true }
      runs.push(...flattenInline(node.children || [], childStyle))
    } else if (type === 'inlineCode') {
      runs.push({
        text: node.value || '',
        style: { ...parentStyle, code: true },
      })
    } else if (type === 'link') {
      const url = (node as { url?: string }).url || ''
      const childStyle = { ...parentStyle, href: url }
      runs.push(...flattenInline(node.children || [], childStyle))
    } else if (type === 'delete') {
      // Strikethrough — pass through with parent style (renderer handles via CSS)
      runs.push(...flattenInline(node.children || [], parentStyle))
    } else if (node.children) {
      runs.push(...flattenInline(node.children, parentStyle))
    } else if (node.value) {
      runs.push({ text: node.value, style: { ...parentStyle } })
    }
  }

  return runs
}
