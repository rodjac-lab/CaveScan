import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Zone } from '@/lib/types'

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
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchZones = useCallback(async (): Promise<void> => {
    const result = await loadZones()
    setZones(result.data)
    setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function fetchInitialZones(): Promise<void> {
      const result = await loadZones()
      if (isCancelled) return

      setZones(result.data)
      setError(result.error)
      setLoading(false)
    }

    void fetchInitialZones()

    return () => {
      isCancelled = true
    }
  }, [])

  return { zones, loading, error, refetch: fetchZones }
}
