import { useEffect, useState } from 'react'
import { registerToastHandler, type ToastMessage } from '@/lib/toast'

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    registerToastHandler((msg) => setToasts((prev) => [...prev, msg]))
    return () => { registerToastHandler(null) }
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1))
    }, 4000)
    return () => clearTimeout(timer)
  }, [toasts])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-[calc(env(safe-area-inset-top)+12px)] left-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-[var(--radius-sm)] px-4 py-3 text-sm font-medium shadow-lg animate-[slideDown_0.2s_ease-out] ${
            t.type === 'error'
              ? 'bg-red-900/90 text-red-100 border border-red-700/50'
              : 'bg-green-900/90 text-green-100 border border-green-700/50'
          }`}
          onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
