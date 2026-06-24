'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'

interface Props {
  audioUrl: string | null
  loading: boolean
  error: string | null
  onTimeUpdate: (time: number) => void
  onPlayPause?: (playing: boolean) => void
}

export default function WaveformPlayer({ audioUrl, loading, error, onTimeUpdate, onPlayPause }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [wsReady, setWsReady] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#93C5FD',
      progressColor: '#2563EB',
      height: 80,
      barWidth: 2,
      barGap: 1,
    })
    wsRef.current = ws

    ws.on('ready', () => setWsReady(true))
    ws.on('error', (e) => { console.error('[WaveSurfer error]', e); setWsError(String(e)) })
    ws.on('timeupdate', (t) => {
      setCurrentTime(t)
      onTimeUpdate(t)
    })
    ws.on('finish', () => { setPlaying(false); onPlayPause?.(false) })
    ws.on('decode', (d) => setDuration(d))

    return () => { ws.destroy(); wsRef.current = null }
  }, [])

  useEffect(() => {
    console.log('[WaveformPlayer] audioUrl changed:', audioUrl ? audioUrl.substring(0, 80) + '...' : null, '| wsRef:', !!wsRef.current)
    if (!wsRef.current || !audioUrl) { setWsReady(false); return }
    setWsReady(false)
    setWsError(null)
    setPlaying(false)
    setCurrentTime(0)
    wsRef.current.load(audioUrl).catch((e: unknown) => {
      console.error('[WaveSurfer load error]', e)
      setWsError(String(e))
    })
  }, [audioUrl])

  const togglePlay = useCallback(() => {
    if (!wsRef.current || !wsReady) return
    wsRef.current.playPause()
    const nowPlaying = wsRef.current.isPlaying()
    setPlaying(nowPlaying)
    onPlayPause?.(nowPlaying)
  }, [wsReady, onPlayPause])

  const seek = useCallback((delta: number) => {
    if (!wsRef.current || !wsReady) return
    wsRef.current.skip(delta)
  }, [wsReady])

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v)
    wsRef.current?.setVolume(v)
  }, [])

  // Expose togglePlay for keyboard shortcut
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__wavesurferTogglePlay = togglePlay
  }, [togglePlay])

  function fmt(t: number) {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const displayError = error ?? wsError

  if (!audioUrl && !loading && !displayError) {
    return (
      <div className="flex items-center justify-center h-32 bg-gray-100 rounded-lg text-sm text-gray-400">
        Chọn một item để xem waveform
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {loading && <div className="h-20 flex items-center justify-center text-gray-400 text-sm">Đang tải audio...</div>}
      {displayError && !loading && (
        <div className="h-20 flex items-center justify-center text-amber-600 text-sm bg-amber-50 rounded">
          {displayError}
        </div>
      )}
      <div ref={containerRef} className={loading || displayError ? 'hidden' : ''} />
      {audioUrl && !loading && (
        <audio controls src={audioUrl} className="w-full mt-2" style={{height: 32}} onError={(e) => console.error('[native audio error]', e)} onCanPlay={() => console.log('[native audio] canplay OK')} />
      )}
      {!displayError && (
        <div className="flex items-center gap-3 mt-3">
          <button onClick={() => seek(-5)} className="text-gray-500 hover:text-gray-700 text-xs">−5s</button>
          <button
            onClick={togglePlay}
            disabled={!wsReady}
            className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40"
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button onClick={() => seek(5)} className="text-gray-500 hover:text-gray-700 text-xs">+5s</button>
          <span className="text-xs text-gray-500 tabular-nums">
            {fmt(currentTime)} / {fmt(duration)}
          </span>
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            className="w-20 ml-auto"
          />
          <span className="text-xs text-gray-400">🔊</span>
        </div>
      )}
    </div>
  )
}
