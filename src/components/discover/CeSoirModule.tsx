import { CeSoirChatView } from '@/components/discover/CeSoirChatView'
import { useAuth } from '@/hooks/useAuth'
import { useCeSoirChatFlow } from '@/hooks/useCeSoirChatFlow'
import { Loader2 } from 'lucide-react'

function CeSoirModuleInner({ userId }: { userId: string | null }) {
  const chat = useCeSoirChatFlow(userId)

  return <CeSoirChatView {...chat} />
}

export default function CeSoirModule() {
  const { session, loading } = useAuth()
  const userId = session?.user.id ?? null

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </div>
    )
  }

  return <CeSoirModuleInner key={userId ?? 'anonymous'} userId={userId} />
}
