import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BottleInsertRecord } from '@/lib/bottleWrites'
import type { Bottle } from '@/lib/types'

const existingRows: Array<Pick<Bottle, 'id' | 'domaine' | 'cuvee' | 'appellation' | 'millesime' | 'status' | 'raw_extraction' | 'photo_url'>> = []
const insertedRecords: BottleInsertRecord[] = []
const labelInvocations: Array<{ bottleId: string; imageUrl: string }> = []
const tagCalls: string[] = []
const embeddingCalls: string[] = []

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(async () => ({ data: existingRows, error: null })),
    })),
    functions: {
      invoke: vi.fn(async (_name: string, options: { body: { bottleId: string; imageUrl: string } }) => {
        labelInvocations.push(options.body)
        return { data: { photoUrl: `https://cdn.test/${options.body.bottleId}.jpg` }, error: null }
      }),
    },
  },
}))

vi.mock('@/lib/bottleWrites', () => ({
  insertBottle: vi.fn(async (record: BottleInsertRecord) => {
    insertedRecords.push(record)
    return { id: `bottle-${insertedRecords.length}` }
  }),
}))

vi.mock('@/lib/tastingMemories', () => ({
  extractAndSaveTags: vi.fn((bottle: { id: string }) => {
    tagCalls.push(bottle.id)
  }),
}))

vi.mock('@/lib/semanticMemory', () => ({
  generateAndSaveEmbedding: vi.fn((bottle: { id: string }) => {
    embeddingCalls.push(bottle.id)
  }),
}))

import { importVivinoPreview } from './vivinoImport'

beforeEach(() => {
  existingRows.length = 0
  insertedRecords.length = 0
  labelInvocations.length = 0
  tagCalls.length = 0
  embeddingCalls.length = 0
})

describe('importVivinoPreview', () => {
  it('enriches an already imported cellar bottle with a missing label photo on reimport', async () => {
    existingRows.push({
      id: 'existing-1',
      domaine: 'Chartogne-Taillet',
      cuvee: 'Sainte Anne',
      appellation: 'Champagne',
      millesime: 2021,
      status: 'in_stock',
      photo_url: null,
      raw_extraction: {
        import_meta: {
          platform: 'vivino',
          dataset: 'cellar',
          source_ref: 'vivino:cellar:link:https://vivino.example/w/1',
        },
      },
    })

    const result = await importVivinoPreview({
      sourceFileName: 'vivino.zip',
      cellar: [
        {
          sourceRef: 'vivino:cellar:link:https://vivino.example/w/1',
          domaine: 'Chartogne-Taillet',
          cuvee: 'Sainte Anne',
          appellation: 'Champagne',
          country: 'France',
          region: 'Champagne',
          couleur: 'bulles',
          millesime: 2021,
          quantity: 2,
          averageRating: 4.2,
          regionalWineStyle: 'Champagne',
          link: 'https://vivino.example/w/1',
          labelImage: 'https://images.vivino.com/labels/chartogne.jpg',
        },
      ],
      tastings: [],
      summary: {
        cellarReferences: 1,
        cellarBottles: 2,
        tastingEntries: 0,
        priceEntries: 0,
      },
    })

    expect(result).toEqual({
      importedCellarReferences: 0,
      importedCellarBottles: 0,
      importedTastings: 0,
      importedLabelPhotos: 1,
      alreadyPresent: 1,
    })
    expect(insertedRecords).toHaveLength(0)
    expect(labelInvocations).toEqual([
      {
        bottleId: 'existing-1',
        imageUrl: 'https://images.vivino.com/labels/chartogne.jpg',
      },
    ])
  })

  it('imports confident tastings and triggers post-processing only for new tasting records', async () => {
    const result = await importVivinoPreview({
      sourceFileName: 'vivino.zip',
      cellar: [],
      tastings: [
        {
          sourceRef: 'vivino:tasting:link:https://vivino.example/w/9:2026-03-01:norating:notext',
          domaine: 'Rodolfo Cosini',
          cuvee: 'Brunello',
          appellation: 'Brunello di Montalcino',
          country: 'Italy',
          region: 'Toscana',
          couleur: 'rouge',
          millesime: 2020,
          rating: 4,
          tastingNote: 'Jeune et fruité',
          reviewLocation: 'Rome',
          drunkAt: '2026-03-01T20:00:00.000Z',
          purchasePrice: 54,
          averageRating: 4.3,
          regionalWineStyle: 'Brunello',
          link: 'https://vivino.example/w/9',
          labelImage: 'https://images.vivino.com/labels/cosini.jpg',
        },
      ],
      summary: {
        cellarReferences: 0,
        cellarBottles: 0,
        tastingEntries: 1,
        priceEntries: 1,
      },
    })

    expect(result).toEqual({
      importedCellarReferences: 0,
      importedCellarBottles: 0,
      importedTastings: 1,
      importedLabelPhotos: 1,
      alreadyPresent: 0,
    })
    expect(insertedRecords).toHaveLength(1)
    expect(insertedRecords[0]).toMatchObject({
      status: 'drunk',
      domaine: 'Rodolfo Cosini',
      tasting_note: 'Jeune et fruité',
      rating: 4,
    })
    expect(tagCalls).toEqual(['bottle-1'])
    expect(embeddingCalls).toEqual(['bottle-1'])
    expect(labelInvocations).toEqual([
      {
        bottleId: 'bottle-1',
        imageUrl: 'https://images.vivino.com/labels/cosini.jpg',
      },
    ])
  })
})
