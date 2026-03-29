export interface ToastMessage {
  id: number
  text: string
  type: 'error' | 'success'
}

let toastId = 0
let addToastFn: ((msg: ToastMessage) => void) | null = null

export function registerToastHandler(handler: ((msg: ToastMessage) => void) | null) {
  addToastFn = handler
}

export function showToast(text: string, type: 'error' | 'success' = 'error') {
  addToastFn?.({ id: ++toastId, text, type })
}
