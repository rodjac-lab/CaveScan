import { describe, expect, it, vi } from 'vitest'
import {
  buildRawExtractionFromPrefill,
  createPendingBatchItem,
  findNextEditableBatchIndex,
  hasWinePrefill,
  toAddBottleBatchProgressItems,
  toBatchItemData,
} from '@/lib/addBottleFlow'
import type { BatchItemData } from '@/components/BatchItemForm'

vi.stubGlobal('URL', {
  createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
  revokeObjectURL: vi.fn(),
})

function makeFile(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' })
}

describe('addBottleFlow helpers', () => {
  it('detects meaningful prefill data', () => {
    expect(hasWinePrefill(null)).toBe(false)
    expect(hasWinePrefill({ region: 'Bourgogne' })).toBe(false)
    expect(hasWinePrefill({ domaine: 'Domaine Test' })).toBe(true)
    expect(hasWinePrefill({ millesime: 2020 })).toBe(true)
  })

  it('creates extracted batch item data', () => {
    const item = toBatchItemData(makeFile('front.jpg'), {
      domaine: 'Foillard',
      appellation: 'Morgon',
      millesime: 2022,
      couleur: 'rouge',
      purchase_price: 24,
    }, 0)

    expect(item.extractionStatus).toBe('extracted')
    expect(item.domaine).toBe('Foillard')
    expect(item.millesime).toBe('2022')
    expect(item.couleur).toBe('rouge')
    expect(item.purchasePrice).toBe('24')
    expect(item.photoPreview).toBe('blob:front.jpg')
  })

  it('creates pending batch item data', () => {
    const item = createPendingBatchItem(makeFile('pending.jpg'), 2)

    expect(item.extractionStatus).toBe('pending')
    expect(item.quantity).toBe(1)
    expect(item.volumeL).toBe('0.75')
    expect(item.photoPreview).toBe('blob:pending.jpg')
  })

  it('builds raw extraction from prefill', () => {
    const extraction = buildRawExtractionFromPrefill({
      domaine: 'Rayas',
      millesime: 1998,
      couleur: 'rouge',
    })

    expect(extraction.domaine).toBe('Rayas')
    expect(extraction.millesime).toBe(1998)
    expect(extraction.couleur).toBe('rouge')
    expect(extraction.confidence).toBe(0)
  })

  it('maps batch progress items', () => {
    const items = [
      {
        id: '1',
        photoPreview: 'blob:1',
        extractionStatus: 'error',
        extractionError: 'OCR failed',
        domaine: 'Domaine',
        appellation: 'AOC',
      },
    ] as BatchItemData[]

    expect(toAddBottleBatchProgressItems(items)).toEqual([
      {
        id: '1',
        photoPreview: 'blob:1',
        status: 'error',
        error: 'OCR failed',
        domaine: 'Domaine',
        appellation: 'AOC',
      },
    ])
  })

  it('finds next editable batch item with wrap-around', () => {
    const items = [
      { saved: true, skipped: false },
      { saved: false, skipped: false },
      { saved: false, skipped: true },
      { saved: false, skipped: false },
    ] as BatchItemData[]

    expect(findNextEditableBatchIndex(items, 1)).toBe(3)
    expect(findNextEditableBatchIndex(items, 3)).toBe(1)
  })
})
