import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Bottle, BottleWithZone } from '@/lib/types'

const BOTTLES_SELECT_QUERY = `*, zone:zones(*)`

// Module-level cache so prefetch can reuse hook data (avoids duplicate Supabase queries)
let cachedInStock: Bottle[] | null = null
let cachedDrunk: Bottle[] | null = null

export function getCachedBottles(): { inStock: Bottle[] | null; drunk: Bottle[] | null } {
  return { inStock: cachedInStock, drunk: cachedDrunk }
}

async function loadBottles(): Promise<{ data: BottleWithZone[]; error: string | null }> {
  const { data, error } = await supabase
    .from('bottles')
    .select(BOTTLES_SELECT_QUERY)
    .eq('status', 'in_stock')
    .order('added_at', { ascending: false })

  return {
    data: data || [],
    error: error?.message || null,
  }
}

async function loadBottle(id: string): Promise<{ data: BottleWithZone | null; error: string | null }> {
  const { data, error } = await supabase
    .from('bottles')
    .select(BOTTLES_SELECT_QUERY)
    .eq('id', id)
    .single()

  return {
    data,
    error: error?.message || null,
  }
}

export function useBottles(): {
  bottles: BottleWithZone[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
} {
  const [bottles, setBottles] = useState<BottleWithZone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBottles = useCallback(async () => {
    setLoading(true)
    const result = await loadBottles()
    setBottles(result.data)
    setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function fetchInitialBottles(): Promise<void> {
      const result = await loadBottles()
      if (isCancelled) return

      setBottles(result.data)
      setError(result.error)
      setLoading(false)
      cachedInStock = result.data
    }

    void fetchInitialBottles()

    return () => {
      isCancelled = true
    }
  }, [])

  return { bottles, loading, error, refetch: fetchBottles }
}

export function useRecentlyDrunk(): {
  bottles: BottleWithZone[]
  loading: boolean
} {
  const [bottles, setBottles] = useState<BottleWithZone[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRecentlyDrunk(): Promise<void> {
      const { data } = await supabase
        .from('bottles')
        .select(BOTTLES_SELECT_QUERY)
        .eq('status', 'drunk')
        .order('drunk_at', { ascending: false })
        .limit(30)

      const bottles = data || []
      setBottles(bottles)
      setLoading(false)
      cachedDrunk = bottles
    }
    fetchRecentlyDrunk()
  }, [])

  return { bottles, loading }
}

export function useDrunkBottles(): {
  bottles: BottleWithZone[]
  loading: boolean
} {
  const [bottles, setBottles] = useState<BottleWithZone[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDrunkBottles(): Promise<void> {
      const { data } = await supabase
        .from('bottles')
        .select(BOTTLES_SELECT_QUERY)
        .eq('status', 'drunk')
        .order('drunk_at', { ascending: false })

      setBottles(data || [])
      setLoading(false)
    }
    fetchDrunkBottles()
  }, [])

  return { bottles, loading }
}

export function useDomainesSuggestions(): string[] {
  const [domaines, setDomaines] = useState<string[]>([])

  useEffect(() => {
    async function fetchDomaines(): Promise<void> {
      const { data } = await supabase
        .from('bottles')
        .select('domaine')
        .not('domaine', 'is', null)
        .order('domaine')

      if (data) {
        const unique = [...new Set(data.map(d => d.domaine).filter(Boolean))] as string[]
        setDomaines(unique)
      }
    }
    fetchDomaines()
  }, [])

  return domaines
}

export function useBottle(id: string | undefined): {
  bottle: BottleWithZone | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
} {
  const [bottle, setBottle] = useState<BottleWithZone | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBottle = useCallback(async () => {
    if (!id) {
      setLoading(false)
      return
    }

    const result = await loadBottle(id)
    setBottle(result.data)
    setError(result.error)
  }, [id])

  useEffect(() => {
    let isCancelled = false

    async function fetchInitialBottle(): Promise<void> {
      if (!id) {
        setLoading(false)
        return
      }

      const result = await loadBottle(id)
      if (isCancelled) return

      setBottle(result.data)
      setError(result.error)
      setLoading(false)
    }

    void fetchInitialBottle()

    return () => {
      isCancelled = true
    }
  }, [id])

  return { bottle, loading, error, refetch: fetchBottle }
}

export function useAppellationsSuggestions(): string[] {
  const [appellations, setAppellations] = useState<string[]>([])

  useEffect(() => {
    async function fetchAppellations(): Promise<void> {
      const { data } = await supabase
        .from('bottles')
        .select('appellation')
        .not('appellation', 'is', null)
        .order('appellation')

      if (data) {
        const unique = [...new Set(data.map(d => d.appellation).filter(Boolean))] as string[]
        setAppellations(unique)
      }
    }
    fetchAppellations()
  }, [])

  return appellations
}
