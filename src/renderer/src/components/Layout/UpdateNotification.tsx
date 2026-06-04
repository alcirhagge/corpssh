import { useEffect, useState } from 'react'
import { Download, X, RefreshCw, CheckCircle } from 'lucide-react'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; percent: number; bytesPerSecond: number }
  | { phase: 'downloaded'; version: string }
  | { phase: 'error'; message: string }

function formatSpeed(bps: number): string {
  if (bps > 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`
  if (bps > 1_000) return `${(bps / 1_000).toFixed(0)} KB/s`
  return `${bps} B/s`
}

export default function UpdateNotification() {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsubs = [
      window.api.updater.onChecking(() => setState({ phase: 'checking' })),
      window.api.updater.onAvailable((info) => {
        setState({ phase: 'available', version: info.version })
        setDismissed(false)
      }),
      window.api.updater.onNotAvailable(() => setState({ phase: 'idle' })),
      window.api.updater.onProgress((p) =>
        setState({ phase: 'downloading', percent: p.percent, bytesPerSecond: p.bytesPerSecond })
      ),
      window.api.updater.onDownloaded((info) => {
        setState({ phase: 'downloaded', version: info.version })
        setDismissed(false)
      }),
      window.api.updater.onError((msg) => setState({ phase: 'error', message: msg }))
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  if (dismissed || state.phase === 'idle' || state.phase === 'checking') return null

  return (
    <div
      className="fixed bottom-8 right-5 z-50 rounded-xl shadow-2xl animate-fade-in"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        width: 320
      }}
    >
      <div className="flex items-start justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          {state.phase === 'downloading' ? (
            <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
          ) : state.phase === 'downloaded' ? (
            <CheckCircle size={14} style={{ color: 'var(--success)' }} />
          ) : state.phase === 'error' ? (
            <X size={14} style={{ color: 'var(--error)' }} />
          ) : (
            <Download size={14} style={{ color: 'var(--accent)' }} />
          )}
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {state.phase === 'available' && 'Atualização disponivel'}
            {state.phase === 'downloading' && 'Baixando atualização...'}
            {state.phase === 'downloaded' && 'Pronto para instalar'}
            {state.phase === 'error' && 'Erro na atualização'}
          </span>
        </div>
        {state.phase !== 'downloading' && (
          <button
            onClick={() => setDismissed(true)}
            className="flex items-center justify-center w-5 h-5 rounded"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={11} />
          </button>
        )}
      </div>

      <div className="px-4 pb-3">
        {state.phase === 'available' && (
          <>
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              Versao {state.version} esta disponivel. O download vai comecar automaticamente.
            </p>
          </>
        )}

        {state.phase === 'downloading' && (
          <>
            <div
              className="rounded-full overflow-hidden mb-1.5"
              style={{ height: 4, background: 'var(--bg-active)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${state.percent}%`, background: 'var(--accent)' }}
              />
            </div>
            <div className="flex justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {state.percent}%
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {formatSpeed(state.bytesPerSecond)}
              </span>
            </div>
          </>
        )}

        {state.phase === 'downloaded' && (
          <>
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              Versao {state.version} baixada. Reinicie para aplicar.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => window.api.updater.install()}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Reiniciar e instalar
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{
                  background: 'var(--bg-input)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)'
                }}
              >
                Depois
              </button>
            </div>
          </>
        )}

        {state.phase === 'error' && (
          <p className="text-xs" style={{ color: 'var(--error)' }}>
            {state.message}
          </p>
        )}
      </div>
    </div>
  )
}
