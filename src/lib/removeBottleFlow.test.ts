import { describe, expect, it } from 'vitest'
import { findNextUnsavedIndex, getBatchExtractionCurrentIndex, toBatchProgressItems } from '@/lib/removeBottleFlow'
import type { BatchItem, BatchSession } from '@/lib/batchSessionStore'

function makeItem(id: string, patch: Partial<BatchItem> = {}): BatchItem {
  return {
    id,
    photoFile: new File(['x'], `${id}.jpg`),
    photoUri: `blob:${id}`,
    extraction: null,
    matchedBottleId: null,
    primaryMatch: null,
    alternatives: [],
    matchType: null,
    processedAt: null,
    ignored: false,
    error: null,
    extractionStatus: 'pending',
    saved: false,
    ...patch,
  }
}

describe('removeBottleFlow helpers', () => {
  it('maps batch progress items', () => {
    const session = {
      id: 'batch-1',
      createdAt: '2026-04-10T12:00:00.000Z',
      label: 'Rafale',
      status: 'processing',
      items: [makeItem('1', { extractionStatus: 'extracting' })],
    } as BatchSession

    expect(toBatchProgressItems(session)).toEqual([
      {
        id: '1',
        photoPreview: 'blob:1',
        status: 'extracting',
        error: undefined,
        domaine: undefined,
        appellation: undefined,
      },
    ])
  })

  it('finds current extraction index', () => {
    const session = {
      id: 'batch-1',
      createdAt: '2026-04-10T12:00:00.000Z',
      label: 'Rafale',
      status: 'processing',
      items: [makeItem('1'), makeItem('2', { extractionStatus: 'extracting' }), makeItem('3')],
    } as BatchSession

    expect(getBatchExtractionCurrentIndex(session)).toBe(1)
  })

  it('wraps to next unsaved item', () => {
    const items = [
      makeItem('1', { saved: true }),
      makeItem('2', { saved: false }),
      makeItem('3', { ignored: true }),
      makeItem('4', { saved: false }),
    ]

    expect(findNextUnsavedIndex(1, items)).toBe(3)
    expect(findNextUnsavedIndex(3, items)).toBe(1)
  })

  it('returns null when everything is done', () => {
    const items = [
      makeItem('1', { saved: true }),
      makeItem('2', { ignored: true }),
    ]

    expect(findNextUnsavedIndex(0, items)).toBeNull()
  })
})
