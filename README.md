# @fatconyc/pretext-composer

A paragraph composer that is better than inDesign's with proper justification, optical margins/hanging punctuation, editorial rags, multi-column layout, and inline markdown styling. Built on [@chenglou/pretext](https://github.com/chenglou/pretext).

## Install

```bash
pnpm add @fatconyc/pretext-composer
```

## Quick Start

```ts
import { compose, renderToDOM } from '@fatconyc/pretext-composer'

const result = compose({
  text: 'Your paragraph text here...',
  font: '16px Georgia',
  containerWidth: 480,
})

renderToDOM({
  container: document.getElementById('output'),
  result,
  font: '16px Georgia',
  containerWidth: 480,
})
```

### With Markdown

```ts
const result = compose({
  text: 'Typography is the **art and technique** of arranging type.',
  font: '16px Georgia',
  containerWidth: 480,
  markdown: true,
})
```

Bold, italic, inline code, and links are parsed and rendered with per-run font resolution. Custom fonts can be provided:

```ts
const result = compose({
  text: 'Hello **world** and `code`',
  font: '16px Georgia',
  containerWidth: 480,
  markdown: true,
  fonts: {
    bold: 'bold 16px Georgia',
    italic: 'italic 16px Georgia',
    code: '14px "Fira Code", monospace',
  },
})
```

Or derive fonts from your page's CSS automatically:

```ts
import { resolveFontsFromCSS } from '@fatconyc/pretext-composer'

const fonts = resolveFontsFromCSS(document.body, '16px Georgia')
```

### Multi-Column Layout

```ts
import { composeColumns, renderColumnsToDOM } from '@fatconyc/pretext-composer'

// Pure computation — pass column widths directly, no DOM needed
const result = composeColumns({
  text: 'Long text...',
  font: '16px Georgia',
  columns: [300, 300],       // array of column widths in px
  markdown: true,
  config: {
    columnGap: 24,
    columnBalance: 'balanced', // or 'fill-first'
    columnOrphans: 2,
    columnWidows: 2,
  },
})

// Or read column geometry from a CSS grid element
const result = composeColumns({
  text: 'Long text...',
  font: '16px Georgia',
  columns: document.querySelector('.grid-container'),
})

// Render into a grid container
renderColumnsToDOM({
  container: document.querySelector('.grid-container'),
  result,
  font: '16px Georgia',
})
```

## API

### `compose(options): JustifyResult`

Runs the composition engine on a block of text. Respects paragraph breaks (`\n`).

```ts
interface ComposeOptions {
  text: string           // The text to compose
  font: string           // CSS font shorthand (e.g., "16px Georgia")
  containerWidth: number // Container width in pixels
  config?: Partial<JustifyConfig>
  markdown?: boolean     // Parse text as markdown with inline styling
  fonts?: FontMap        // Custom fonts for bold/italic/code
}
```

Returns a `JustifyResult` with per-line data:

```ts
interface JustifyResult {
  lines: JustifiedLine[] // Per-line adjustment data
  totalHeight: number    // Total height of the composed text
  lineHeight: number     // Computed line height in pixels
  gridIncrement: number  // Active baseline grid increment
}

interface JustifiedLine {
  segments: string[]          // Words on this line
  styledSegments?: StyledSegment[] // Styled runs per word (when markdown is used)
  isLastLine: boolean         // Last line of a paragraph
  wordGapPx: number           // Exact pixel gap between words
  letterSpacingPx: number     // Letter spacing adjustment in px
  glyphScale: number          // Horizontal glyph scale (1 = normal)
  y: number                   // Y position
  hangLeft: number            // Left hanging punctuation offset in px
  hangRight: number           // Right hanging punctuation offset in px
}
```

### `composeColumns(options): ColumnResult`

Composes text across multiple columns with optimal column breaking.

```ts
interface ColumnComposeOptions {
  text: string
  font: string
  columns: number[] | HTMLElement // Column widths array or CSS grid element
  config?: Partial<ColumnConfig>
  markdown?: boolean
  fonts?: FontMap
  columnHeight?: number   // Max column height for fill-first mode
}

interface ColumnConfig extends JustifyConfig {
  columnBreakPenalty: number    // Cost of mid-paragraph breaks (default: 100)
  columnBalance: 'balanced' | 'fill-first'
  columnOrphans: number         // Min lines at column top (default: 2)
  columnWidows: number          // Min lines at column bottom (default: 2)
  columnGap: number | 'auto'   // Gap in px, or 'auto' to read from CSS grid
  maxColumns: number            // Cap column count (default: Infinity)
}
```

### `renderToDOM(options)` / `renderColumnsToDOM(options)`

Renders justified text into a DOM container.

```ts
interface RenderOptions {
  container: HTMLElement
  result: JustifyResult
  font: string
  containerWidth: number
  lastLineAlignment?: 'left' | 'right' | 'center' | 'full'
  singleWordJustification?: 'left' | 'full' | 'right' | 'center'
  textMode?: 'justify' | 'rag'
  showGuides?: boolean
  onTextChange?: (newText: string) => void
}
```

## Configuration

All settings mirror InDesign's Justification panel. Each spacing axis has `min`, `desired`, and `max` values.

```ts
import { compose, DEFAULT_CONFIG } from '@fatconyc/pretext-composer'

const result = compose({
  text: '...',
  font: '16px Georgia',
  containerWidth: 480,
  config: {
    // Word spacing (100% = normal space width)
    wordSpacing: { min: 75, desired: 85, max: 110 },

    // Letter spacing (0% = normal)
    letterSpacing: { min: -2, desired: 0, max: 4 },

    // Glyph scaling (100% = no scaling)
    glyphScaling: { min: 98, desired: 100, max: 102 },

    // Auto leading as % of font size
    autoLeading: 120,

    // Line breaking algorithm
    composer: 'paragraph', // 'paragraph' (Knuth-Plass) | 'greedy'

    // Text mode
    textMode: 'justify', // 'justify' | 'rag'

    // How to align the last line of a paragraph
    lastLineAlignment: 'left', // 'left' | 'right' | 'center' | 'full'

    // How to handle lines with a single word
    singleWordJustification: 'left', // 'left' | 'right' | 'center' | 'full'

    // Hanging punctuation (Optical Margin Alignment)
    opticalAlignment: false,

    // Prevent single-word last lines
    avoidWidows: true,

    // Baseline grid snap (0 = disabled)
    baselineGrid: 0,

    // Replace straight quotes/dashes/ellipses with typographic equivalents
    typographersQuotes: true,

    // Hyphenation (false to disable)
    hyphenation: {
      minWordLength: 5,
      afterFirst: 4,
      beforeLast: 3,
      maxConsecutive: 2,
    },
  },
})
```

## How Justification Works

### Pipeline

```
Text/Markdown → Typographer's Quotes → Hyphenation → Line Breaking → Justification → Render
                                             │               │
                                     (styled runs     (styled runs
                                      preserved)       preserved)
```

1. **Markdown parsing** (optional): Converts markdown to styled runs using micromark + mdast-util-from-markdown
2. **Typographer's quotes**: Straight quotes, dashes, and ellipses are replaced with curly quotes, em/en dashes, and ellipsis characters
3. **Hyphenation**: Soft hyphens are inserted at valid break points using language-aware rules. Punctuation is stripped before dictionary lookup and reattached to syllables. Hard hyphens in compound words (e.g., "line-spacing") are treated as free (zero-cost) break points, always preferred over soft hyphens.
4. **Line breaking**: Knuth-Plass evaluates all possible break points across the paragraph to minimize overall "badness," or greedy breaks line-by-line. A two-tier adjustment ratio penalizes glyph compression more steeply than word spacing changes, preferring hyphenation over squishing.
5. **Justification**: Distributes slack across word spacing, letter spacing, and glyph scaling
6. **Column breaking** (optional): Balanced or fill-first distribution across columns with orphan/widow constraints
7. **Rendering**: DOM spans with `marginRight` for word gaps, CSS `letter-spacing`, and `transform: scaleX()` for glyph scaling. Styled text renders nested spans with per-run fonts.

### Justification Priority

When a line needs to be stretched or compressed, adjustments are applied in this order:

1. **Word spacing** -- adjusted first (most natural, least visible)
2. **Letter spacing** -- adjusted if word spacing hits its bounds
3. **Glyph scaling** -- adjusted as a last resort within bounds
4. **Overflow** -- any remaining slack goes back into word spacing

### Optical Margin Alignment

When `opticalAlignment` is enabled, punctuation at line edges hangs outside the text block so letter edges create a cleaner visual alignment. This is what InDesign calls "Optical Margin Alignment."

Characters that hang fully (100% of width): `"` `"` `'` `'` `"` `'` `-` `--` `---` `.` `,`

Characters that hang partially (50%): `:` `;` `!` `?` `...`

### Line Breaking

Two composers are available:

- **`'paragraph'`** (default) -- Knuth-Plass optimal line breaking. Considers all possible break points across the entire paragraph to minimize overall "badness." Produces the best results. Required for rag mode and markdown styling.
- **`'greedy'`** -- Single-line-at-a-time breaking via pretext. Faster, matches browser behavior. Does not support rag tuning or styled text.

### Column Breaking

Two modes are available:

- **`'balanced'`** (default) -- Binary searches for the minimum column height where all text fits, breaking mid-paragraph as needed. Distance from ideal fill dominates the cost model, with paragraph boundaries as tiebreakers.
- **`'fill-first'`** -- Fills each column to the specified `columnHeight` before overflowing to the next. Respects orphan/widow constraints.

## Known Limitations

- **Canvas vs DOM measurement**: Text width is measured via canvas `measureText()`, but rendered in DOM spans. Sub-pixel differences between the two can cause lines to be slightly under- or over-filled (typically < 1px).
- **Greedy composer + markdown/rag**: The greedy composer does not support styled text or rag tuning.
- **Hyphenation language**: Currently hardcoded to English (`en-us`). Other languages are not yet supported.
- **Font loading**: `compose()` measures text immediately. If the font hasn't loaded yet, measurements will use a fallback font. Ensure fonts are loaded before calling `compose()`.
- **Markdown scope**: Inline styles are supported (`**bold**`, `*italic*`, `` `code` ``, `[links](url)`). Block-level elements not yet supported: lists (ordered/unordered), blockquotes, tables, images, horizontal rules, and code blocks. Headings are treated as bold paragraphs with scaled font size.

## Playground

An interactive playground is included for experimenting with all settings:

```bash
pnpm run playground
```

Then open `http://localhost:3000`. Features:
- Markdown text editor with live preview
- Multi-column layout with balanced/fill-first controls
- Live sliders for all justification parameters
- Alignment toolbar (Left / Center / Right / Full)
- Composer toggle (Knuth-Plass / Greedy)
- Rag mode with balance controls
- Browser comparison mode
- Visual guides: margin lines and baseline grid
- Optical Margin Alignment toggle
- Typographer's quotes toggle
- Hyphenation controls

## Custom Rendering

`compose()` returns plain data, so you can build your own renderer for any framework or target (React, Vue, Canvas, SVG, etc.):

```ts
const result = compose({ text, font, containerWidth, markdown: true })

for (const line of result.lines) {
  // line.segments — array of words (plain text)
  // line.styledSegments — array of styled word data (when markdown is used)
  // line.wordGapPx — exact gap between each word
  // line.letterSpacingPx — letter spacing to apply
  // line.glyphScale — horizontal scale factor
  // line.hangLeft / line.hangRight — optical margin offsets
  // line.y — vertical position

  if (line.styledSegments) {
    for (const seg of line.styledSegments) {
      for (const run of seg.runs) {
        // run.text — text content
        // run.font — resolved CSS font string
        // run.style — { bold?, italic?, code?, href? }
      }
    }
  }
}
```

## Built On

- [@chenglou/pretext](https://github.com/chenglou/pretext) -- Fast, reflow-free text measurement and line breaking
- [hyphen](https://github.com/ytiurin/hyphen) -- Language-aware automatic hyphenation
- [micromark](https://github.com/micromark/micromark) + [mdast-util-from-markdown](https://github.com/syntax-tree/mdast-util-from-markdown) -- Markdown parsing
