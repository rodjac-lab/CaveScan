import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { parseVivinoZip } from './vivinoImport'

async function buildZipFile(files: Record<string, string>, name = 'vivino_data.zip'): Promise<File> {
  const zip = new JSZip()

  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content)
  }

  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const blob = new Blob([arrayBuffer], { type: 'application/zip' }) as Blob & { name: string }
  blob.name = name
  return blob as File
}

describe('parseVivinoZip', () => {
  it('rebuilds cellar and confident tastings from a nested Vivino export', async () => {
    const cellarCsv = [
      'Winery,Wine name,Vintage,Region,Country,Regional wine style,Average rating,Wine type,Link to wine,User cellar count',
      'Chartogne-Taillet,Sainte Anne,2021,Champagne,France,Champagne,4.2,Sparkling,https://vivino.example/w/1,2',
      'La Giribaldina,Ros,2023,Piemonte,Italy,Piemonte Rose,3.9,Rose,https://vivino.example/w/2,1',
    ].join('\n')

    const fullWineCsv = [
      'Winery,Wine name,Vintage,Region,Country,Regional wine style,Average rating,Scan date,Scan/Review Location,Your rating,Your review,Personal Note,Wine type,Drinking Window,Link to wine,Label image',
      [
        'Chartogne-Taillet',
        'Sainte Anne',
        '2021',
        'Champagne',
        'France',
        'Champagne',
        '4.2',
        '2026-03-01 20:00:00',
        'Paris',
        '4',
        'Precise et salin',
        '',
        'Sparkling',
        '',
        'https://vivino.example/w/1',
        'https://images.vivino.com/labels/chartogne.jpg',
      ].join(','),
      [
        'La Giribaldina',
        'Ros',
        '2023',
        'Piemonte',
        'Italy',
        'Piemonte Rose',
        '3.9',
        '2026-03-02 19:00:00',
        '',
        '',
        '',
        '',
        'Rose',
        '',
        'https://vivino.example/w/2',
        '',
      ].join(','),
    ].join('\n')

    const pricesCsv = [
      'Winery,Wine name,Vintage,Region,Country,Regional wine style,Average rating,Scan date,Scan/Review Location,Your rating,Your review,Personal Note,Wine type,Drinking Window,Link to wine,Label image,Wine price',
      'Chartogne-Taillet,Sainte Anne,2021,Champagne,France,Champagne,4.2,2026-03-01 20:00:00,Paris,4,Precise et salin,,Sparkling,,https://vivino.example/w/1,https://images.vivino.com/labels/chartogne.jpg,42.50',
    ].join('\n')

    const file = await buildZipFile({
      'vivino_data/cellar.csv': cellarCsv,
      'vivino_data/full_wine_list.csv': fullWineCsv,
      'vivino_data/user_prices.csv': pricesCsv,
    })

    const preview = await parseVivinoZip(file)
    const chartogne = preview.cellar.find((row) => row.domaine === 'Chartogne-Taillet')

    expect(preview.summary).toEqual({
      cellarReferences: 2,
      cellarBottles: 3,
      tastingEntries: 1,
      priceEntries: 1,
    })
    expect(chartogne?.labelImage).toBe('https://images.vivino.com/labels/chartogne.jpg')
    expect(preview.tastings).toHaveLength(1)
    expect(preview.tastings[0]).toMatchObject({
      domaine: 'Chartogne-Taillet',
      rating: 4,
      purchasePrice: 42.5,
      labelImage: 'https://images.vivino.com/labels/chartogne.jpg',
    })
  })

  it('rejects archives that do not contain the core Vivino csv files', async () => {
    const file = await buildZipFile({
      'vivino_data/user_profile.csv': 'name\nCelestin',
    })

    await expect(parseVivinoZip(file)).rejects.toThrow(
      'Export Vivino invalide: impossible de trouver cellar.csv ou full_wine_list.csv',
    )
  })
})
