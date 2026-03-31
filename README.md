# @fatconyc/pretext-composer

A paragraph composer that is better than inDesign's with proper justification, optical margins/hanging punctuation, and editorial rags. Built on [@chenglou/pretext](https://github.com/chenglou/pretext).

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
Text → Typographer's Quotes → Hyphenation → Line Breaking → Justification → Render
```

1. **Typographer's quotes**: Straight quotes, dashes, and ellipses are replaced with curly quotes, em/en dashes, and ellipsis characters (if enabled)
2. **Hyphenation**: Soft hyphens are inserted at valid break points using language-aware rules
3. **Line breaking**: Knuth-Plass evaluates all possible break points across the paragraph to minimize overall "badness," or greedy breaks line-by-line
4. **Justification**: Distributes slack across word spacing, letter spacing, and glyph scaling
5. **Rendering**: DOM spans with `marginRight` for word gaps, CSS `letter-spacing`, and `transform: scaleX()` for glyph scaling

### Justification Priority

When a line needs to be stretched or compressed, adjustments are applied in this order:

1. **Word spacing** — adjusted first (most natural, least visible)
2. **Letter spacing** — adjusted if word spacing hits its bounds
3. **Glyph scaling** — adjusted as a last resort within bounds
4. **Overflow** — any remaining slack goes back into word spacing

### Constraint Priority (what overrides what)

When constraints conflict, this is the override order:

1. **Minimum word spacing always wins** — words will never be closer than `wordSpacing.min` % of a normal space. If a line can't fit at minimum word spacing, glyph scaling is compressed further (even below `glyphScaling.min`) to make it fit.
2. **No overflow** — lines never extend past the container width. The glyph scale absorbs whatever is needed.
3. **Glyph scaling min is a preference, not a hard limit** — under normal conditions it's respected, but minimum word spacing takes priority.
4. **Letter spacing bounds are respected** within the justification cascade, but the final scaleX recalculation may produce slightly different effective values.

### Optical Margin Alignment

When `opticalAlignment` is enabled, punctuation at line edges hangs outside the text block so letter edges create a cleaner visual alignment. This is what InDesign calls "Optical Margin Alignment."

Characters that hang fully (100% of width): `"` `"` `'` `'` `"` `'` `-` `–` `—` `.` `,`

Characters that hang partially (50%): `:` `;` `!` `?` `…`

### Line Breaking

Two composers are available:

- **`'paragraph'`** (default) — Knuth-Plass optimal line breaking. Considers all possible break points across the entire paragraph to minimize overall "badness." Produces the best results. Required for rag mode.
- **`'greedy'`** — Single-line-at-a-time breaking via pretext. Faster, matches browser behavior. Does not support rag tuning.

### Rag Mode

When `textMode: 'rag'`, lines are broken optimally but not justified — word gaps use natural spacing. Rag mode requires the `'paragraph'` composer because it uses Knuth-Plass to optimize line break positions for even or dramatic rag shapes.

## Known Limitations

- **Canvas vs DOM measurement**: Text width is measured via canvas `measureText()`, but rendered in DOM spans. Sub-pixel differences between the two can cause lines to be slightly under- or over-filled (typically < 1px).
- **Greedy composer + rag**: The greedy composer does not support rag tuning (`ragBalance`, `ragShortLine`, `ragStyle`). These settings only affect the paragraph composer.
- **Hyphenation language**: Currently hardcoded to English (`en-us`). Other languages are not yet supported.
- **Font loading**: `compose()` measures text immediately. If the font hasn't loaded yet, measurements will use a fallback font. Ensure fonts are loaded before calling `compose()`.
- **No multi-column support**: The engine composes a single text block. Multi-column layout should be built on top by splitting `JustifyResult.lines` across columns.

## Playground

An interactive playground is included for experimenting with all settings:

```bash
pnpm run playground
```

Then open `http://localhost:3000`. Features:
- Live sliders for all justification parameters
- Alignment toolbar (Left / Center / Right / Full)
- Composer toggle (Knuth-Plass / Greedy)
- Rag mode with balance controls
- Browser comparison mode
- Inline text editing (click to edit, click away to re-compose)
- Visual guides: margin lines and baseline grid
- Optical Margin Alignment toggle
- Typographer's quotes toggle
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
