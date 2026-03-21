import { type BottleWithZone } from '@/lib/types'
import { getBottlePhotoEntries } from '@/lib/bottlePhotos'

const CARD_W = 1080
const CARD_H = 1350
const PAD = 64

const COLORS = {
  bg: '#171513',
  text: '#F7F4EF',
  muted: '#A09A93',
  accent: '#B8860B',
  accentLight: '#D4A843',
  separator: 'rgba(255,255,255,0.06)',
  photoBg: '#1e1b19',
  starEmpty: '#3a3530',
}

const QPR_LABELS: Record<number, string> = { 1: 'Cher', 2: 'Correct', 3: 'Pepite' }

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, radius: number) {
  ctx.save()
  drawRoundedRect(ctx, x, y, w, h, radius)
  ctx.clip()

  const imgRatio = img.width / img.height
  const boxRatio = w / h
  let sx = 0, sy = 0, sw = img.width, sh = img.height
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio
    sx = (img.width - sw) / 2
  } else {
    sh = img.width / boxRatio
    sy = (img.height - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
  ctx.restore()
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2
    const method = i === 0 ? 'moveTo' : 'lineTo'
    ctx[method](cx + size * Math.cos(angle), cy + size * Math.sin(angle))
  }
  ctx.closePath()
}

/** Draw a star: 'full' = filled, 'half' = left half filled, 'empty' = outline only */
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, fill: 'full' | 'half' | 'empty') {
  // Draw empty star background
  ctx.fillStyle = COLORS.starEmpty
  starPath(ctx, cx, cy, size)
  ctx.fill()

  if (fill === 'full') {
    ctx.fillStyle = COLORS.accent
    starPath(ctx, cx, cy, size)
    ctx.fill()
  } else if (fill === 'half') {
    ctx.save()
    ctx.beginPath()
    ctx.rect(cx - size, cy - size, size, size * 2)
    ctx.clip()
    ctx.fillStyle = COLORS.accent
    starPath(ctx, cx, cy, size)
    ctx.fill()
    ctx.restore()
  }
}

/** Wrap text with variable width per line (for L-layout). Returns array of lines. */
function wrapTextVariable(ctx: CanvasRenderingContext2D, text: string, getMaxWidth: (lineIndex: number) => number, maxLines: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    const maxW = getMaxWidth(lines.length)
    if (ctx.measureText(test).width > maxW && current) {
      lines.push(current)
      current = word
      if (lines.length >= maxLines) {
        lines[lines.length - 1] += '...'
        return lines
      }
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

/** Draw a line of text justified to fill maxWidth. Last line is left-aligned. */
function drawJustifiedLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, isLastLine: boolean) {
  if (isLastLine) {
    ctx.fillText(text, x, y)
    return
  }
  const words = text.split(' ')
  if (words.length <= 1) {
    ctx.fillText(text, x, y)
    return
  }
  const textWidthNoSpaces = words.reduce((sum, w) => sum + ctx.measureText(w).width, 0)
  const totalSpace = maxWidth - textWidthNoSpaces
  const spaceWidth = totalSpace / (words.length - 1)

  let curX = x
  for (let i = 0; i < words.length; i++) {
    ctx.fillText(words[i], curX, y)
    curX += ctx.measureText(words[i]).width + spaceWidth
  }
}

async function collectPhotos(bottle: BottleWithZone): Promise<HTMLImageElement[]> {
  const entries = getBottlePhotoEntries(bottle).slice(0, 2)
  const results = await Promise.allSettled(entries.map((e) => loadImage(e.url)))
  return results
    .filter((r): r is PromiseFulfilledResult<HTMLImageElement> => r.status === 'fulfilled')
    .map((r) => r.value)
}

function drawHeader(ctx: CanvasRenderingContext2D, bottle: BottleWithZone): number {
  let cursorY = 44

  // Brand — CELESTIN
  ctx.font = '16px "Playfair Display", serif'
  ctx.fillStyle = COLORS.accent
  ctx.globalAlpha = 0.7
  ctx.letterSpacing = '5px'
  ctx.fillText('CELESTIN', PAD, cursorY + 16)
  ctx.globalAlpha = 1.0
  ctx.letterSpacing = '0px'

  // Date — top right
  const drunkDate = bottle.drunk_at ? new Date(bottle.drunk_at) : new Date(bottle.added_at)
  const dateStr = drunkDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  ctx.font = '15px "DM Sans", sans-serif'
  ctx.fillStyle = COLORS.muted
  const dateW = ctx.measureText(dateStr).width
  ctx.fillText(dateStr, CARD_W - PAD - dateW, cursorY + 16)

  cursorY = 100

  // Wine name
  const wineName = bottle.domaine || bottle.appellation || 'Vin'
  ctx.font = '700 48px "Playfair Display", serif'
  ctx.fillStyle = COLORS.text
  const nameLines = wrapTextVariable(ctx, wineName, () => CARD_W - PAD * 2, 2)
  for (const line of nameLines) {
    ctx.fillText(line, PAD, cursorY + 48)
    cursorY += 54
  }

  // Wine details line
  cursorY += 8
  const detailParts: string[] = []
  if (bottle.cuvee) detailParts.push(bottle.cuvee)
  if (bottle.appellation && bottle.domaine) detailParts.push(bottle.appellation)
  if (bottle.millesime) detailParts.push(String(bottle.millesime))
  if (bottle.couleur) {
    const colorLabel = bottle.couleur === 'rose' ? 'Rosé' : bottle.couleur === 'bulles' ? 'Bulles' : bottle.couleur.charAt(0).toUpperCase() + bottle.couleur.slice(1)
    detailParts.push(colorLabel)
  }

  let detailX = PAD
  for (let i = 0; i < detailParts.length; i++) {
    const isFirst = i === 0 && !!bottle.cuvee
    ctx.fillStyle = isFirst ? COLORS.accentLight : COLORS.muted
    ctx.font = isFirst ? 'italic 20px "DM Sans", sans-serif' : '20px "DM Sans", sans-serif'
    ctx.fillText(detailParts[i], detailX, cursorY + 20)
    detailX += ctx.measureText(detailParts[i]).width
    if (i < detailParts.length - 1) {
      ctx.fillStyle = COLORS.muted
      ctx.font = '20px "DM Sans", sans-serif'
      ctx.fillText(' \u00B7 ', detailX, cursorY + 20)
      detailX += ctx.measureText(' \u00B7 ').width
    }
  }

  cursorY += 52
  return cursorY
}

function drawStars(ctx: CanvasRenderingContext2D, bottle: BottleWithZone, cursorY: number): number {
  if (!bottle.rating) return cursorY

  const starSize = 13
  const starGap = 34
  for (let i = 0; i < 5; i++) {
    const starVal = i + 1
    const fill = bottle.rating! >= starVal ? 'full' : bottle.rating! >= starVal - 0.5 ? 'half' : 'empty'
    drawStar(ctx, PAD + 14 + i * starGap, cursorY + 14, starSize, fill)
  }

  if (bottle.qpr && QPR_LABELS[bottle.qpr]) {
    ctx.font = '600 15px "DM Sans", sans-serif'
    ctx.fillStyle = COLORS.accent
    ctx.letterSpacing = '2px'
    ctx.fillText(QPR_LABELS[bottle.qpr].toUpperCase(), PAD + 5 * starGap + 16, cursorY + 20)
    ctx.letterSpacing = '0px'
  }

  return cursorY + 44
}

function drawTastingNote(ctx: CanvasRenderingContext2D, note: string, cursorY: number, getMaxWidth: (lineIndex: number) => number, maxLines: number): number {
  // Opening quote mark
  ctx.font = '400 100px "Playfair Display", serif'
  ctx.fillStyle = COLORS.accent
  ctx.globalAlpha = 0.25
  ctx.fillText('\u201C', PAD - 24, cursorY + 20)
  ctx.globalAlpha = 1.0

  // Note text — justified, variable width
  ctx.font = 'italic 32px "Playfair Display", serif'
  ctx.fillStyle = COLORS.text
  const noteLines = wrapTextVariable(ctx, note, getMaxWidth, maxLines)
  for (let i = 0; i < noteLines.length; i++) {
    const maxW = getMaxWidth(i)
    const isLast = i === noteLines.length - 1
    drawJustifiedLine(ctx, noteLines[i], PAD, cursorY + 48, maxW, isLast)
    cursorY += 48
  }

  return cursorY
}

function drawFooter(ctx: CanvasRenderingContext2D) {
  const footerY = CARD_H - 100
  ctx.strokeStyle = COLORS.separator
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, footerY)
  ctx.lineTo(CARD_W - PAD, footerY)
  ctx.stroke()

  ctx.font = '18px "DM Sans", sans-serif'
  ctx.fillStyle = COLORS.accent
  ctx.letterSpacing = '1px'
  ctx.fillText('mycelestin.com', PAD, footerY + 36)
  ctx.letterSpacing = '0px'

  ctx.font = '14px "DM Sans", sans-serif'
  ctx.fillStyle = COLORS.muted
  ctx.fillText('Ton sommelier IA personnel', PAD, footerY + 56)
}

export async function generateShareCardImage(bottle: BottleWithZone): Promise<File | null> {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = CARD_W
    canvas.height = CARD_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Background
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, CARD_W, CARD_H)

    const photos = await collectPhotos(bottle)

    // Header: brand, date, wine name, details
    let cursorY = drawHeader(ctx, bottle)

    // Stars (above photo+text block)
    cursorY = drawStars(ctx, bottle, cursorY)

    const contentW = CARD_W - PAD * 2
    const footerReserved = 130 // space for footer

    if (photos.length >= 2) {
      // === 2 PHOTOS: portrait + bandeau ===
      const portraitW = 380
      const gap = 12
      const secondW = contentW - portraitW - gap
      const photoH = 520

      ctx.fillStyle = COLORS.photoBg
      drawRoundedRect(ctx, PAD, cursorY, portraitW, photoH, 14)
      ctx.fill()
      drawRoundedRect(ctx, PAD + portraitW + gap, cursorY, secondW, photoH, 14)
      ctx.fill()

      drawImageCover(ctx, photos[0], PAD, cursorY, portraitW, photoH, 14)
      drawImageCover(ctx, photos[1], PAD + portraitW + gap, cursorY, secondW, photoH, 14)

      cursorY += photoH + 32

      // Tasting note — full width below photos
      if (bottle.tasting_note) {
        const maxNoteLines = Math.floor((CARD_H - cursorY - footerReserved) / 48)
        cursorY = drawTastingNote(ctx, bottle.tasting_note, cursorY, () => contentW, Math.min(maxNoteLines, 6))
      }

    } else if (photos.length === 1) {
      // === 1 PHOTO: L-layout — photo right, text wraps around ===
      const photoW = 420
      const photoH = 560
      const photoGap = 40
      const photoX = CARD_W - PAD - photoW
      const photoY = cursorY

      // Draw photo
      ctx.fillStyle = COLORS.photoBg
      drawRoundedRect(ctx, photoX, photoY, photoW, photoH, 14)
      ctx.fill()
      drawImageCover(ctx, photos[0], photoX, photoY, photoW, photoH, 14)

      // Tasting note — L-layout wrap
      if (bottle.tasting_note) {
        const narrowWidth = contentW - photoW - photoGap // width next to photo
        const photoBottom = photoY + photoH
        const lineH = 48

        // Calculate which lines are narrow (next to photo) vs full width
        const getMaxWidth = (lineIndex: number) => {
          const lineY = cursorY + lineIndex * lineH
          return lineY < photoBottom ? narrowWidth : contentW
        }

        const maxNoteLines = Math.floor((CARD_H - cursorY - footerReserved) / lineH)
        cursorY = drawTastingNote(ctx, bottle.tasting_note, cursorY, getMaxWidth, maxNoteLines)
      }

    } else {
      // === 0 PHOTOS: text only ===
      if (bottle.tasting_note) {
        const maxNoteLines = Math.floor((CARD_H - cursorY - footerReserved) / 48)
        cursorY = drawTastingNote(ctx, bottle.tasting_note, cursorY, () => contentW, Math.min(maxNoteLines, 10))
      }
    }

    // Footer
    drawFooter(ctx)

    // Convert to file and release canvas memory
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    canvas.width = 0
    canvas.height = 0
    if (!blob) return null

    const safeName = (bottle.domaine || bottle.appellation || 'vin').replace(/[^a-zA-Z0-9]/g, '_')
    return new File([blob], `celestin_${safeName}.jpg`, { type: 'image/jpeg' })
  } catch {
    return null
  }
}
