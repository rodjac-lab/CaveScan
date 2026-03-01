import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fileToBase64 } from '@/lib/image'
import { type WineExtraction } from '@/lib/types'
import {
  createBatchSession,
} from '@/lib/batchSessionStore'

type Intent = 'encaver' | 'deguster'

function FlashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function GalleryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

export default function Scanner() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputCameraRef = useRef<HTMLInputElement>(null)

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const [flashSupported, setFlashSupported] = useState(false)
  const [intent, setIntent] = useState<Intent>('encaver')
  const [processing, setProcessing] = useState(false)

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)
      }

      // Check flash support
      const track = stream.getVideoTracks()[0]
      const capabilities = track.getCapabilities?.()
      if (capabilities && 'torch' in capabilities) {
        setFlashSupported(true)
      }
    } catch {
      setCameraError(true)
    }
  }, [])

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  // Toggle flash
  const toggleFlash = async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    try {
      await track.applyConstraints({ advanced: [{ torch: !flashOn } as MediaTrackConstraintSet] })
      setFlashOn(!flashOn)
    } catch {
      // Flash toggle failed
    }
  }

  // Close scanner
  const handleClose = () => {
    stopCamera()
    navigate(-1)
  }

  // Process a single photo with OCR
  const processPhoto = async (file: File) => {
    setProcessing(true)

    try {
      const base64 = await fileToBase64(file)
      const { data, error } = await supabase.functions.invoke('extract-wine', {
        body: { image_base64: base64 },
      })

      if (error) throw error

      const extraction = data as WineExtraction

      stopCamera()

      if (intent === 'encaver') {
        navigate('/add', {
          state: {
            prefillExtraction: extraction,
            prefillPhotoFile: file,
          },
        })
      } else {
        navigate('/remove', {
          state: {
            prefillExtraction: extraction,
            prefillPhotoFile: file,
          },
        })
      }
    } catch {
      // OCR failed - navigate with just the photo
      stopCamera()

      if (intent === 'encaver') {
        navigate('/add', {
          state: {
            prefillExtraction: null,
            prefillPhotoFile: file,
          },
        })
      } else {
        navigate('/remove', {
          state: {
            prefillExtraction: null,
            prefillPhotoFile: file,
          },
        })
      }
    }
  }

  // Capture frame from video
  const handleShutter = async () => {
    if (!videoRef.current || !canvasRef.current || processing) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    )
    if (!blob) return

    const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' })
    await processPhoto(file)
  }

  // Handle camera file input (mobile fallback via capture="environment")
  const handleCameraFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await processPhoto(file)
  }

  // Handle gallery file selection
  const handleGallerySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Save files BEFORE clearing the input (clearing can empty the FileList)
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const savedFiles = Array.from(fileList)
    e.target.value = ''

    if (savedFiles.length === 1) {
      await processPhoto(savedFiles[0])
      return
    }

    // Multiple files - batch mode
    const selectedFiles = savedFiles.slice(0, 12)

    if (intent === 'encaver') {
      // Send all files to AddBottle for batch entry
      stopCamera()
      navigate('/add', {
        state: {
          prefillBatchFiles: selectedFiles,
        },
      })
    } else {
      // Create batch session for tasting
      stopCamera()
      createBatchSession(selectedFiles)
      navigate('/remove')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden file input for gallery */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleGallerySelect}
        className="hidden"
      />

      {/* Hidden file input for camera (mobile fallback) */}
      <input
        ref={fileInputCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraFileSelect}
        className="hidden"
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-[env(safe-area-inset-top)] py-3">
        <button
          onClick={handleClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 backdrop-blur text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {flashSupported && (
          <button
            onClick={toggleFlash}
            className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur transition-colors ${
              flashOn ? 'bg-yellow-400/80 text-black' : 'bg-black/50 text-white'
            }`}
          >
            <FlashIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Camera / Fallback */}
      <div className="flex-1 relative overflow-hidden">
        {cameraError ? (
          /* Fallback: no camera access (HTTP or permission denied) */
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8">
            <p className="text-center text-white/60 text-xs mb-2">
              Cam{"é"}ra indisponible (HTTPS requis sur mobile)
            </p>

            <button
              onClick={() => fileInputCameraRef.current?.click()}
              className="flex h-14 w-full max-w-[260px] items-center justify-center gap-3 rounded-[var(--radius)] bg-white/10 backdrop-blur text-white border border-white/10"
            >
              <CameraIcon className="h-5 w-5" />
              <span className="text-sm font-medium">Prendre une photo</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-14 w-full max-w-[260px] items-center justify-center gap-3 rounded-[var(--radius)] bg-white/10 backdrop-blur text-white border border-white/10"
            >
              <GalleryIcon className="h-5 w-5" />
              <span className="text-sm font-medium">Choisir dans la galerie</span>
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />

            {/* Frame guide overlay */}
            {cameraReady && !processing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-[72%] aspect-[3/4]">
                  <div className="scanner-frame-corner top-left" />
                  <div className="scanner-frame-corner top-right" />
                  <div className="scanner-frame-corner bottom-left" />
                  <div className="scanner-frame-corner bottom-right" />
                  <p className="absolute -bottom-8 left-0 right-0 text-center text-white/60 text-[12px] font-medium">
                    {"Cadrez l'étiquette"}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Processing overlay — above both camera and fallback */}
        {processing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-10">
            <Loader2 className="h-10 w-10 animate-spin text-[var(--accent)] mb-3" />
            <p className="text-white/90 text-sm font-medium">Analyse en cours...</p>
            <p className="text-white/40 text-xs mt-1">Lecture de l'étiquette par l'IA...</p>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex-shrink-0 bg-black pb-[env(safe-area-inset-bottom)]">
        {/* Intent pills */}
        <div className="flex items-center justify-center gap-3 py-3">
          <button
            onClick={() => setIntent('encaver')}
            className={`intent-pill ${intent === 'encaver' ? 'intent-pill-active' : 'intent-pill-inactive'}`}
          >
            Encaver
          </button>
          <button
            onClick={() => setIntent('deguster')}
            className={`intent-pill ${intent === 'deguster' ? 'intent-pill-active' : 'intent-pill-inactive'}`}
          >
            {"Déguster"}
          </button>
        </div>

        {/* Manual entry link */}
        {intent === 'encaver' && !processing && (
          <div className="flex justify-center -mt-1 pb-2">
            <button
              onClick={() => { stopCamera(); navigate('/add') }}
              className="text-[11px] text-white/40 font-medium"
            >
              Saisie manuelle →
            </button>
          </div>
        )}

        {/* Camera controls */}
        <div className="flex items-center justify-around px-8 pb-4">
          {/* Gallery thumbnail */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-white/20 bg-white/10 text-white"
          >
            <GalleryIcon className="h-5 w-5" />
          </button>

          {/* Shutter / Camera fallback */}
          {cameraReady ? (
            <button
              onClick={handleShutter}
              disabled={processing}
              className="shutter-btn disabled:opacity-40"
            />
          ) : cameraError ? (
            <button
              onClick={() => fileInputCameraRef.current?.click()}
              className="shutter-btn disabled:opacity-40"
            />
          ) : (
            <div className="shutter-btn opacity-40" />
          )}

          {/* Spacer for symmetry */}
          <div className="h-11 w-11" />
        </div>
      </div>
    </div>
  )
}
