import type { BottleWithZone } from '@/lib/types'
import {
  buildDrunkBottleInsertFromBottle,
  insertBottle,
  markBottleAsDrunk,
  updateBottleQuantity,
} from '@/lib/bottleWrites'

/**
 * Opens a bottle: decrements quantity if > 1 (+ creates a drunk row),
 * or marks the existing row as drunk if quantity === 1.
 * Returns the ID of the drunk bottle row.
 */
export async function openBottle(bottle: BottleWithZone): Promise<{ drunkBottleId: string }> {
  if ((bottle.quantity ?? 1) > 1) {
    const originalQuantity = bottle.quantity ?? 1
    const nextQuantity = originalQuantity - 1
    const drunkAt = new Date().toISOString()

    await updateBottleQuantity(bottle.id, nextQuantity)

    try {
      const newDrunk = await insertBottle(buildDrunkBottleInsertFromBottle(bottle, drunkAt))
      return { drunkBottleId: newDrunk.id }
    } catch (error) {
      await updateBottleQuantity(bottle.id, originalQuantity)
      throw error
    }
  }

  await markBottleAsDrunk(bottle.id, new Date().toISOString())
  return { drunkBottleId: bottle.id }
}
