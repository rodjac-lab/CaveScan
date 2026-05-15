import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Zone } from '@/lib/types'

let cachedZones: Zone[] | null = null

async function loadZones(): Promise<{ data: Zone[]; error: string | null }> {
  const { data, error } = await supabase
    .from('zones')
    .select('*')
    .order('position', { ascending: true })

  return {
    data: data || [],
    error: error?.message || null,
  }
}

export function useZones(): {
  zones: Zone[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
} {
  const [zones, setZones] = useState<Zone[]>(() => cachedZones ?? [])
  const [loading, setLoading] = useState(() => !cachedZones)
  const [error, setError] = useState<string | null>(null)

  const fetchZones = useCallback(async (): Promise<void> => {
    const result = await loadZones()
    if (!result.error) {
      setZones(result.data)
      cachedZones = result.data
    }
    setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function fetchInitialZones(): Promise<void> {
      const result = await loadZones()
      if (isCancelled) return

      if (!result.error) {
        setZones(result.data)
        cachedZones = result.data
      }
      setError(result.error && !cachedZones ? result.error : null)
      setLoading(false)
    }

    void fetchInitialZones()

    return () => {
      isCancelled = true
    }
  }, [])

  return { zones, loading, error, refetch: fetchZones }
}
