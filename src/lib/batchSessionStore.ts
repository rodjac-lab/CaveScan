import { useSyncExternalStore } from 'react'
import type { BottleWithZone, WineExtraction } from '@/lib/types'

export type BatchSessionStatus = 'processing' | 'ready' | 'done'
export type BatchMatchType = 'in_cave' | 'not_in_cave' | 'unresolved' | null

export interface BatchItem {
  id: string
  photoFile: File
  photoUri: string
  extraction: WineExtraction | null
  matchedBottleId: string | null
  primaryMatch: BottleWithZone | null
  alternatives: BottleWithZone[]
  matchType: BatchMatchType
  processedAt: string | null
  ignored: boolean
  error: string | null
}

export interface BatchSession {
  id: string
  createdAt: string
  label: string
  status: BatchSessionStatus
  items: BatchItem[]
}

type Store = {
  session: BatchSession | null
}

const store: Store = {
  session: null,
}

const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function formatSessionLabel(date: Date): string {
  return `Rafale du ${date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`
}

export function subscribeBatchSession(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getBatchSessionSnapshot(): BatchSession | null {
  return store.session
}

export function useBatchSession(): BatchSession | null {
  return useSyncExternalStore(subscribeBatchSession, getBatchSessionSnapshot, getBatchSessionSnapshot)
}

export function getActiveBatchSession(): BatchSession | null {
  return store.session
}

export function createBatchSession(files: File[]): BatchSession {
  clearBatchSession()

  const now = new Date()
  const session: BatchSession = {
    id: `batch-${now.getTime()}`,
    createdAt: now.toISOString(),
    label: formatSessionLabel(now),
    status: 'processing',
    items: files.map((file, index) => ({
      id: `batch-item-${now.getTime()}-${index}`,
      photoFile: file,
      photoUri: URL.createObjectURL(file),
      extraction: null,
      matchedBottleId: null,
      primaryMatch: null,
      alternatives: [],
      matchType: null,
      processedAt: null,
      ignored: false,
      error: null,
    })),
  }

  store.session = session
  emit()
  return session
}

export function setBatchSessionStatus(sessionId: string, status: BatchSessionStatus) {
  if (!store.session || store.session.id !== sessionId) return
  store.session = { ...store.session, status }
  emit()
}

export function updateBatchItem(sessionId: string, itemId: string, patch: Partial<BatchItem>) {
  if (!store.session || store.session.id !== sessionId) return

  store.session = {
    ...store.session,
    items: store.session.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
  }
  emit()
}

export function markBatchSessionDone(sessionId: string) {
  if (!store.session || store.session.id !== sessionId) return
  store.session = { ...store.session, status: 'done' }
  emit()
}

export function clearBatchSession() {
  if (store.session) {
    store.session.items.forEach((item) => URL.revokeObjectURL(item.photoUri))
  }
  store.session = null
  emit()
}
