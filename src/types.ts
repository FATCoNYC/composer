export interface SpacingRange {
  /** Minimum allowed value (percentage) */
  min: number
  /** Desired/ideal value (percentage) */
  desired: number
  /** Maximum allowed value (percentage) */
  max: number
}

export interface JustifyConfig {
  /**
   * How much space between words. 100% = normal space width.
   * Default: { min: 75, desired: 85, max: 110 }
   */
  wordSpacing: SpacingRange

  /**
   * How much space between letters. 0% = normal letter spacing.
   * Default: { min: -2, desired: 0, max: 4 }
   */
  letterSpacing: SpacingRange

  /**
   * Horizontal scaling of glyphs. 100% = no scaling.
   * Default: { min: 98, desired: 100, max: 102 }
   */
  glyphScaling: SpacingRange

  /** Auto leading as percentage of font size. Default: 120 */
  autoLeading: number

  /** How to handle lines with a single word. Default: 'left' */
  singleWordJustification: 'left' | 'full' | 'right' | 'center'

  /** Alignment of incomplete lines (last line of paragraph). Default: 'left' */
  lastLineAlignment: 'left' | 'right' | 'center' | 'full'

  /**
   * Text mode.
   * - 'justify': Lines are stretched/compressed to fill the container width
   * - 'rag': Lines break optimally for balanced lengths but are not justified
   * Default: 'justify'
   */
  textMode: 'justify' | 'rag'

  /** Prevent single-word last lines in paragraphs. Default: true */
  avoidWidows: boolean

  /**
   * Rag style. Only applies when textMode is 'rag'.
   * - 'even': Minimize variance in line lengths (all lines similar width)
   * - 'long-short': Alternating long (~95%) and short (~shortTarget%) lines
   * Default: 'even'
   */
  ragStyle: 'even' | 'long-short'

  /**
   * How aggressively to balance ragged line lengths (0-100).
   * 0 = natural/greedy rag, 100 = perfectly balanced lines.
   * Only applies when textMode is 'rag'. Default: 50
   */
  ragBalance: number

  /**
   * Target width for short lines as percentage of container (60-95).
   * Only applies when ragStyle is 'long-short'. Default: 75
   */
  ragShortLine: number

  /**
   * Optical Margin Alignment (hanging punctuation).
   * When enabled, punctuation at line edges hangs outside the text block.
   * Default: false
   */
  opticalAlignment: boolean

  /**
   * Baseline grid increment in pixels. When set, all line Y positions
   * snap to multiples of this value. Set to 0 to disable.
   * Default: 0 (disabled — lines use autoLeading)
   */
  baselineGrid: number

  /**
   * Line breaking algorithm.
   * - 'greedy': Fast, single-line-at-a-time (browser default)
   * - 'paragraph': Knuth-Plass optimal paragraph composition (InDesign-style)
   * Default: 'paragraph'
   */
  composer: 'greedy' | 'paragraph'

  /**
   * Replace straight quotes, dashes, and ellipses with typographic equivalents.
   * " → \u201C/\u201D, ' → \u2018/\u2019, -- → \u2013, --- → \u2014, ... → \u2026
   * Default: true
   */
  typographersQuotes: boolean

  /** Hyphenation settings. Set to false to disable. */
  hyphenation: false | HyphenationConfig
}

export interface HyphenationConfig {
  /** Minimum word length to hyphenate. Default: 5 */
  minWordLength: number
  /** Minimum characters before a hyphen. Default: 4 (InDesign: "After First") */
  afterFirst: number
  /** Minimum characters after a hyphen. Default: 3 (InDesign: "Before Last") */
  beforeLast: number
  /** Maximum consecutive hyphenated lines. 0 = unlimited. Default: 2 */
  maxConsecutive: number
}

export const DEFAULT_CONFIG: JustifyConfig = {
  wordSpacing: { min: 75, desired: 85, max: 110 },
  letterSpacing: { min: -2, desired: 0, max: 4 },
  glyphScaling: { min: 98, desired: 100, max: 102 },
  autoLeading: 133,
  singleWordJustification: 'left',
  lastLineAlignment: 'left',
  textMode: 'justify',
  avoidWidows: true,
  ragStyle: 'even',
  ragBalance: 50,
  ragShortLine: 75,
  opticalAlignment: false,
  baselineGrid: 0,
  composer: 'paragraph',
  typographersQuotes: true,
  hyphenation: {
    minWordLength: 5,
    afterFirst: 4,
    beforeLast: 3,
    maxConsecutive: 2,
  },
}

// ── Inline Styling Types ──

/** Visual style applied to a run of text */
export interface InlineStyle {
  bold?: boolean
  italic?: boolean
  code?: boolean
  /** Font size override in pixels */
  fontSize?: number
  /** Full CSS font override — takes precedence over bold/italic/code derivation */
  font?: string
  /** Link URL (used by renderer to create <a> tags) */
  href?: string
}

/** A contiguous run of text sharing the same style */
export interface StyledRun {
  text: string
  style: InlineStyle
}

/** A run resolved to a concrete CSS font string and measured */
export interface ResolvedRun {
  text: string
  font: string
  width: number
  letterCount: number
  style: InlineStyle
}

/** A word (whitespace-delimited) potentially spanning multiple style runs */
export interface StyledWord {
  runs: ResolvedRun[]
  width: number
  letterCount: number
  text: string
}

/** A styled word with hyphenation data */
export interface StyledHyphenatedWord {
  text: string
  /** Each syllable is an array of runs (a syllable can span a style boundary) */
  syllables: ResolvedRun[][]
  syllableWidths: number[]
  width: number
  letterCount: number
  runs: ResolvedRun[]
}

/** A word segment in a justified line, carrying style run info */
export interface StyledSegment {
  runs: ResolvedRun[]
  text: string
}

/** Per-line output from the justification engine */
export interface JustifiedLine {
  /** The text segments (words only, no spaces) for this line */
  segments: string[]
  /** Styled segments — present when markdown input was used */
  styledSegments?: StyledSegment[]
  /** Whether this is the last line of the paragraph */
  isLastLine: boolean
  /** Exact pixel gap to place between each word */
  wordGapPx: number
  /** Computed letter spacing in pixels */
  letterSpacingPx: number
  /** Computed glyph scale factor (1 = no scaling) */
  glyphScale: number
  /** Y position of this line */
  y: number
  /** Pixels to hang the first character outside the left margin (0 = none) */
  hangLeft: number
  /** Pixels to hang the last character outside the right margin (0 = none) */
  hangRight: number
}

/** Full result from justifying a paragraph */
export interface JustifyResult {
  lines: JustifiedLine[]
  totalHeight: number
  lineHeight: number
  /** The active baseline grid increment (same as lineHeight if grid is disabled) */
  gridIncrement: number
}

// ── Column Layout Types ──

export interface ColumnConfig extends JustifyConfig {
  /** Cost of breaking mid-paragraph across columns. Default: 100 */
  columnBreakPenalty: number
  /** Column balancing strategy. Default: 'balanced' */
  columnBalance: 'balanced' | 'fill-first'
  /** Minimum lines at the top of a column (prevents orphans). Default: 2 */
  columnOrphans: number
  /** Minimum lines at the bottom of a column (prevents widows). Default: 2 */
  columnWidows: number
  /** Column gap override in pixels, or 'auto' to read from CSS grid. Default: 'auto' */
  columnGap: number | 'auto'
  /** Maximum number of columns to use. Default: Infinity */
  maxColumns: number
}

export const DEFAULT_COLUMN_CONFIG: Omit<ColumnConfig, keyof JustifyConfig> = {
  columnBreakPenalty: 100,
  columnBalance: 'balanced',
  columnOrphans: 2,
  columnWidows: 2,
  columnGap: 'auto',
  maxColumns: Number.POSITIVE_INFINITY,
}

/** Data for a single column in a multi-column layout */
export interface ColumnData {
  /** Justified lines assigned to this column */
  lines: JustifiedLine[]
  /** Column width in pixels */
  width: number
  /** Horizontal offset from the left edge of the container */
  x: number
  /** Total content height of this column */
  height: number
}

/** Full result from multi-column composition */
export interface ColumnResult {
  /** Per-column data */
  columns: ColumnData[]
  /** Maximum column height (for sizing the container) */
  totalHeight: number
  /** Resolved column widths in pixels */
  columnWidths: number[]
  /** Resolved column gap in pixels */
  columnGap: number
  /** Computed line height (same as JustifyResult.lineHeight) */
  lineHeight: number
}
