import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Zone } from '@/lib/types'

export function useZones(): {
  zones: Zone[]
  loading: boolean
  error: string | null
} {
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchZones(): Promise<void> {
      const { data, error: fetchError } = await supabase
        .from('zones')
        .select('*')
        .order('position', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setZones(data || [])
      }
      setLoading(false)
    }

    fetchZones()
  }, [])

  return { zones, loading, error }
}
