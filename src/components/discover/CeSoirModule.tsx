import { CeSoirChatView } from '@/components/discover/CeSoirChatView'
import { useCeSoirChatFlow } from '@/hooks/useCeSoirChatFlow'

export default function CeSoirModule() {
  const chat = useCeSoirChatFlow()

  return <CeSoirChatView {...chat} />
}
