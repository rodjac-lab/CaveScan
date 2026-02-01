import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { BottleWithZone } from '@/lib/types'

const BOTTLES_SELECT_QUERY = `*, zone:zones(*)`

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
    const { data, error: fetchError } = await supabase
      .from('bottles')
      .select(BOTTLES_SELECT_QUERY)
      .eq('status', 'in_stock')
      .order('added_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setBottles(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchBottles()
  }, [fetchBottles])

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
        .limit(10)

      setBottles(data || [])
      setLoading(false)
    }
    fetchRecentlyDrunk()
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
