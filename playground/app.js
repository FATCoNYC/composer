import {
  compose,
  composeColumns,
  getFontMetrics,
  parseMarkdownToRuns,
  renderColumnsToDOM,
  renderToDOM,
} from './bundle.js'
import sampleTexts from './samples.js'

const $ = (id) => document.getElementById(id)

$('randomTextBtn').addEventListener('click', () => {
  if (!sampleTexts.length) return
  const pick = sampleTexts[Math.floor(Math.random() * sampleTexts.length)]
  $('textInput').value = pick
  update()
})

// Wire up slider value displays
const sliders = [
  'containerWidth',
  'wsMin',
  'wsDesired',
  'wsMax',
  'lsMin',
  'lsDesired',
  'lsMax',
  'gsMin',
  'gsDesired',
  'gsMax',
  'autoLeading',
  'baselineGrid',
  'hMinWord',
  'hAfterFirst',
  'hBeforeLast',
  'hMaxConsec',
  'ragShortLine',
]

for (const id of sliders) {
  const input = $(id)
  const display = $(`${id}Val`)
  input.addEventListener('input', () => {
    if (id === 'autoLeading' || id === 'ragShortLine')
      display.textContent = `${input.value}%`
    else if (id === 'baselineGrid')
      display.textContent = input.value === '0' ? 'off' : `${input.value}px`
    else display.textContent = input.value
    update()
  })
}

$('textInput').addEventListener('input', update)
$('markdownEnabled').addEventListener('change', update)
$('columnsEnabled').addEventListener('change', () => {
  $('columnControls').style.display = $('columnsEnabled').checked ? '' : 'none'
  update()
})
$('columnCount').addEventListener('input', () => {
  $('columnCountVal').textContent = $('columnCount').value
  update()
})
$('columnGap').addEventListener('input', () => {
  $('columnGapVal').textContent = `${$('columnGap').value}px`
  update()
})
let columnBalance = 'balanced'
for (const btn of $('columnBalanceBar').querySelectorAll('button')) {
  btn.addEventListener('click', () => {
    $('columnBalanceBar').querySelector('.active')?.classList.remove('active')
    btn.classList.add('active')
    columnBalance = btn.dataset.balance
    update()
  })
}
$('fontSize').addEventListener('input', update)
$('fontFamily').addEventListener('input', update)
$('singleWord').addEventListener('change', update)
$('showGuides').addEventListener('change', update)
$('avoidWidows').addEventListener('change', update)
$('opticalAlignment').addEventListener('change', update)
$('smartQuotes').addEventListener('change', update)
$('hyphenEnabled').addEventListener('change', update)

// Alignment bar
let lastLineAlign = 'left'
const fullBtn = $('alignmentBar').querySelector('[data-align="full"]')

function updateRagLabel() {
  const ragBtn = $('ragBtn')
  if (lastLineAlign === 'left') ragBtn.textContent = 'Rag Right'
  else if (lastLineAlign === 'right') ragBtn.textContent = 'Rag Left'
  else ragBtn.textContent = 'Rag'
}

function updateFullState() {
  const isRag = textMode === 'rag'
  fullBtn.disabled = isRag
  fullBtn.style.opacity = isRag ? '0.3' : ''
  fullBtn.style.cursor = isRag ? 'default' : 'pointer'
}

function setAlignment(align) {
  $('alignmentBar').querySelector('.active')?.classList.remove('active')
  $('alignmentBar')
    .querySelector(`[data-align="${align}"]`)
    .classList.add('active')
  lastLineAlign = align
  updateRagLabel()
  update()
}

for (const btn of $('alignmentBar').querySelectorAll('button')) {
  btn.addEventListener('click', () => {
    if (btn.disabled) return
    setAlignment(btn.dataset.align)
  })
}

// Render toggle (Composer / Browser)
let useBrowser = false
for (const btn of $('renderBar').querySelectorAll('button')) {
  btn.addEventListener('click', () => {
    $('renderBar').querySelector('.active')?.classList.remove('active')
    btn.classList.add('active')
    useBrowser = btn.dataset.render === 'browser'
    $('ragControls').style.display =
      !useBrowser && textMode === 'rag' ? '' : 'none'
    $('composerBar').style.display = useBrowser ? 'none' : ''
    $('justificationCard').style.display =
      !useBrowser && textMode === 'justify' ? '' : 'none'
    $('composerOnlyTypography').style.display = useBrowser ? 'none' : ''
    $('hyphenDetails').style.display = useBrowser ? 'none' : ''
    updateFullState()
    update()
  })
}

// Mode toggle (Justify / Rag)
let textMode = 'justify'
const greedyBtn = $('composerBar').querySelector('[data-composer="greedy"]')

function updateGreedyState() {
  const isRag = textMode === 'rag'
  greedyBtn.disabled = isRag
  greedyBtn.style.opacity = isRag ? '0.3' : ''
  greedyBtn.style.cursor = isRag ? 'default' : 'pointer'
  if (isRag && composer === 'greedy') {
    composer = 'paragraph'
    $('composerBar').querySelector('.active')?.classList.remove('active')
    $('composerBar')
      .querySelector('[data-composer="paragraph"]')
      .classList.add('active')
  }
}

for (const btn of $('modeBar').querySelectorAll('button')) {
  btn.addEventListener('click', () => {
    $('modeBar').querySelector('.active')?.classList.remove('active')
    btn.classList.add('active')
    textMode = btn.dataset.mode
    $('ragControls').style.display = textMode === 'rag' ? '' : 'none'
    $('justificationCard').style.display = textMode === 'justify' ? '' : 'none'
    updateFullState()
    updateGreedyState()
    if (lastLineAlign === 'full' && textMode !== 'justify') {
      setAlignment('left')
    }
    update()
  })
}

// Composer toggle
let composer = 'paragraph'
for (const btn of $('composerBar').querySelectorAll('button')) {
  btn.addEventListener('click', () => {
    if (btn.disabled) return
    $('composerBar').querySelector('.active')?.classList.remove('active')
    btn.classList.add('active')
    composer = btn.dataset.composer
    update()
  })
}

function update() {
  const text = $('textInput').value
  const font = `${$('fontSize').value}px ${$('fontFamily').value}`
  const containerWidth = parseInt($('containerWidth').value, 10)

  const config = {
    wordSpacing: {
      min: parseInt($('wsMin').value, 10),
      desired: parseInt($('wsDesired').value, 10),
      max: parseInt($('wsMax').value, 10),
    },
    letterSpacing: {
      min: parseInt($('lsMin').value, 10),
      desired: parseInt($('lsDesired').value, 10),
      max: parseInt($('lsMax').value, 10),
    },
    glyphScaling: {
      min: parseInt($('gsMin').value, 10),
      desired: parseInt($('gsDesired').value, 10),
      max: parseInt($('gsMax').value, 10),
    },
    autoLeading: parseInt($('autoLeading').value, 10),
    singleWordJustification: $('singleWord').value,
    lastLineAlignment: lastLineAlign,
    avoidWidows: $('avoidWidows').checked,
    opticalAlignment: $('opticalAlignment').checked,
    typographersQuotes: $('smartQuotes').checked,
    baselineGrid: parseInt($('baselineGrid').value, 10),
    composer,
    hyphenation: $('hyphenEnabled').checked
      ? {
          minWordLength: parseInt($('hMinWord').value, 10),
          afterFirst: parseInt($('hAfterFirst').value, 10),
          beforeLast: parseInt($('hBeforeLast').value, 10),
          maxConsecutive: parseInt($('hMaxConsec').value, 10),
        }
      : false,
    textMode,
    ragStyle: 'long-short',
    ragBalance: 80,
    ragShortLine: parseInt($('ragShortLine').value, 10),
  }

  try {
    if (useBrowser) {
      // Pure CSS rendering for comparison
      const out = $('output')
      out.innerHTML = ''
      out.style.position = 'relative'
      const div = document.createElement('div')
      div.style.width = `${containerWidth}px`
      div.style.font = font
      div.style.lineHeight = `${parseInt($('autoLeading').value, 10) / 100}`
      if (textMode === 'justify') {
        div.style.textAlign = 'justify'
        div.style.textAlignLast =
          lastLineAlign === 'full' ? 'justify' : lastLineAlign
      } else {
        div.style.textAlign = lastLineAlign === 'full' ? 'left' : lastLineAlign
      }
      if ($('hyphenEnabled').checked) {
        div.style.hyphens = 'auto'
        div.lang = 'en'
      }
      if ($('markdownEnabled').checked) {
        const fontSize = parseInt($('fontSize').value, 10)
        const paras = parseMarkdownToRuns(text, fontSize)
        div.innerHTML = paras
          .map(
            (runs) =>
              '<p style="margin:0 0 ' +
              div.style.lineHeight +
              'em 0">' +
              runs
                .map((r) => {
                  let html = r.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
                  if (r.style.code)
                    html =
                      '<code style="font-size:0.85em;font-family:Menlo,Consolas,monospace;background:rgba(128,128,128,0.12);border-radius:3px">' +
                      html +
                      '</code>'
                  if (r.style.bold) html = `<strong>${html}</strong>`
                  if (r.style.italic) html = `<em>${html}</em>`
                  if (r.style.href)
                    html =
                      '<a href="' +
                      r.style.href +
                      '" style="color:inherit;text-decoration:underline">' +
                      html +
                      '</a>'
                  return html
                })
                .join('') +
              '</p>',
          )
          .join('')
      } else {
        div.textContent = text
      }
      out.appendChild(div)
      if ($('showGuides').checked) {
        const pad = getComputedStyle(out).paddingLeft
        const padTop = getComputedStyle(out).paddingTop
        const guideBase =
          'position:absolute;top:0;bottom:0;width:1px;pointer-events:none;z-index:0;'
        const leftGuide = document.createElement('div')
        leftGuide.style.cssText = `${guideBase}left:${pad};border-left:1.5px solid rgba(255,0,0,0.35);`
        const rightGuide = document.createElement('div')
        rightGuide.style.cssText = `${guideBase}left:calc(${pad} + ${containerWidth}px);border-left:1.5px solid rgba(255,0,0,0.1);`
        out.appendChild(leftGuide)
        out.appendChild(rightGuide)
        // Baseline grid: match composer's renderGuides exactly
        const bFontSize = parseInt($('fontSize').value, 10)
        const leading = parseInt($('autoLeading').value, 10) / 100
        const lineHeightPx = bFontSize * leading
        const grid = parseInt($('baselineGrid').value, 10)
        const gi = grid > 0 ? grid : lineHeightPx
        const metrics = getFontMetrics(font)
        const emHeight = metrics.ascent + metrics.descent
        const halfLeading = (lineHeightPx - emHeight) / 2
        const baselineOffset = halfLeading + metrics.ascent
        const gridOverlay = document.createElement('div')
        gridOverlay.style.cssText = `position:absolute;top:calc(${padTop} - ${gi * 2}px + ${baselineOffset}px);left:0;right:0;bottom:0;pointer-events:none;z-index:0;background:repeating-linear-gradient(to bottom, transparent 0px, transparent ${gi - 1}px, rgba(135,206,235,0.5) ${gi - 1}px, rgba(135,206,235,0.5) ${gi}px);`
        out.appendChild(gridOverlay)
      }
    } else if ($('columnsEnabled').checked) {
      const colCount = parseInt($('columnCount').value, 10)
      const colGap = parseInt($('columnGap').value, 10)
      const colWidth = Math.floor(
        (containerWidth - colGap * (colCount - 1)) / colCount,
      )

      const avoidWO = $('avoidWidows').checked
      const outStyle = getComputedStyle($('output'))
      const outputHeight =
        $('output').clientHeight -
        parseFloat(outStyle.paddingTop) -
        parseFloat(outStyle.paddingBottom)

      // Pure computation — pass column widths directly, no DOM needed
      const colResult = composeColumns({
        text,
        font,
        columns: Array(colCount).fill(colWidth),
        config: {
          ...config,
          columnBalance,
          columnGap: colGap,
          columnOrphans: avoidWO ? 2 : 1,
          columnWidows: avoidWO ? 2 : 1,
        },
        markdown: $('markdownEnabled').checked,
        columnHeight: columnBalance === 'fill-first' ? outputHeight : undefined,
      })

      // Render into a grid container
      const out = $('output')
      out.innerHTML = ''
      const gridContainer = document.createElement('div')
      gridContainer.style.display = 'grid'
      gridContainer.style.gridTemplateColumns = Array(colCount)
        .fill(`${colWidth}px`)
        .join(' ')
      gridContainer.style.columnGap = `${colGap}px`
      gridContainer.style.width = `${containerWidth}px`
      out.appendChild(gridContainer)

      renderColumnsToDOM({
        container: gridContainer,
        result: colResult,
        font,
        singleWordJustification: config.singleWordJustification,
        lastLineAlignment: lastLineAlign,
        textMode,
        showGuides: $('showGuides').checked,
      })
    } else {
      const result = compose({
        text,
        font,
        containerWidth,
        config,
        markdown: $('markdownEnabled').checked,
      })
      renderToDOM({
        container: $('output'),
        result,
        font,
        containerWidth,
        singleWordJustification: config.singleWordJustification,
        lastLineAlignment: lastLineAlign,
        textMode,
        showGuides: $('showGuides').checked,
      })
    }
  } catch (e) {
    $('output').textContent = `Error: ${e.message}`
  }
}

// Initial render
update()
