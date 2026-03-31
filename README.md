# pretext-composer

InDesign-quality text justification and composition for the web, built on [@chenglou/pretext](https://github.com/chenglou/pretext).

Brings professional typographic controls to the browser that have been trapped in desktop publishing tools for decades: fine-grained word spacing, letter spacing, glyph scaling, optical margin alignment (hanging punctuation), and paragraph-aware composition.

## Install

```bash
pnpm add pretext-composer
```

## Quick Start

```ts
import { compose, renderToDOM } from 'pretext-composer'

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

## API

### `compose(options): JustifyResult`

Runs the composition engine on a block of text. Respects paragraph breaks (`\n`).

```ts
interface ComposeOptions {
  text: string           // The text to compose
  font: string           // CSS font shorthand (e.g., "16px Georgia")
  containerWidth: number // Container width in pixels
  config?: Partial<JustifyConfig>
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
  segments: string[]     // Words on this line
  isLastLine: boolean    // Last line of a paragraph
  wordGapPx: number      // Exact pixel gap between words
  letterSpacingPx: number // Letter spacing adjustment in px
  glyphScale: number     // Horizontal glyph scale (1 = normal)
  y: number              // Y position
  hangLeft: number       // Left hanging punctuation offset in px
  hangRight: number      // Right hanging punctuation offset in px
}
```

### `renderToDOM(options)`

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
  showGuides?: boolean   // Debug overlays for margins and baseline grid
  onTextChange?: (newText: string) => void // Enables inline editing
}
```

## Configuration

All settings mirror InDesign's Justification panel. Each spacing axis has `min`, `desired`, and `max` values.

```ts
import { compose, DEFAULT_CONFIG } from 'pretext-composer'

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
    autoLeading: 125,

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

    // Hyphenation (false to disable)
    hyphenation: {
      minWordLength: 5,
      afterFirst: 4,
      beforeLast: 3,
      maxConsecutive: 2,
      hyphenationZone: 0,
    },
  },
})
```

### Optical Margin Alignment

When `opticalAlignment` is enabled, punctuation at line edges hangs outside the text block so letter edges create a cleaner visual alignment. This is what InDesign calls "Optical Margin Alignment."

Characters that hang fully (100% of width): `"` `"` `'` `'` `"` `'` `-` `–` `—` `.` `,`

Characters that hang partially (50%): `:` `;` `!` `?` `…`

### Justification Priority

When a line needs to be stretched or compressed to fill the container width, adjustments are applied in priority order:

1. **Word spacing** — adjusted first (most natural)
2. **Letter spacing** — adjusted if word spacing hits its bounds
3. **Glyph scaling** — adjusted last resort within bounds
4. **Overflow** — any remaining slack goes back into word spacing to guarantee full justification

### Line Breaking

Two composers are available:

- **`'paragraph'`** (default) — Knuth-Plass optimal line breaking. Considers all possible break points across the entire paragraph to minimize overall "badness." Produces the best results.
- **`'greedy'`** — Single-line-at-a-time breaking via pretext. Faster, matches browser behavior.

## Playground

An interactive playground is included for experimenting with all settings:

```bash
pnpm run playground
```

Then open `http://localhost:3000`. Features:
- Live sliders for all justification parameters
- Alignment toolbar (Left / Center / Right / Full)
- Composer toggle (Paragraph / Greedy)
- Rag mode with balance controls
- Inline text editing (click to edit, click away to re-compose)
- Visual guides: margin lines and baseline grid
- Optical Margin Alignment toggle
- Smart quotes toggle
- Hyphenation controls

## Custom Rendering

`compose()` returns plain data, so you can build your own renderer for any framework or target (React, Vue, Canvas, SVG, etc.):

```ts
const result = compose({ text, font, containerWidth })

for (const line of result.lines) {
  // line.segments — array of words
  // line.wordGapPx — exact gap between each word
  // line.letterSpacingPx — letter spacing to apply
  // line.glyphScale — horizontal scale factor
  // line.hangLeft / line.hangRight — optical margin offsets
  // line.y — vertical position
}
```

## Built On

- [@chenglou/pretext](https://github.com/chenglou/pretext) — Fast, reflow-free text measurement and line breaking
- [hyphen](https://github.com/ytiurin/hyphen) — Language-aware automatic hyphenation
