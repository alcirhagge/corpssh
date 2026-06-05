import { useEffect, useState } from 'react'
import { Download, X, RefreshCw, CheckCircle } from 'lucide-react'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; percent: number; bytesPerSecond: number }
  | { phase: 'ready'; version: string }

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
      window.api.updater.onAvailable((info) => {
        setState({ phase: 'available', version: info.version })
        setDismissed(false)
      }),
      window.api.updater.onProgress((p) =>
        setState({ phase: 'downloading', percent: p.percent, bytesPerSecond: p.bytesPerSecond })
      ),
      window.api.updater.onDownloaded((info) => {
        setState({ phase: 'ready', version: info.version })
        setDismissed(false)
      }),
      window.api.updater.onChecking(() => {}),
      window.api.updater.onNotAvailable(() => {}),
      window.api.updater.onError(() => setState({ phase: 'idle' }))
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  if (dismissed || state.phase === 'idle') return null

  return (
    <div
      className="fixed bottom-7 right-5 z-50 rounded-xl shadow-2xl animate-fade-in"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        width: 300
      }}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          {state.phase === 'downloading'
            ? <RefreshCw size={13} className="animate-spin" style={{ color: 'var(--accent)' }} />
            : state.phase === 'ready'
            ? <CheckCircle size={13} style={{ color: 'var(--success)' }} />
            : <Download size={13} style={{ color: 'var(--accent)' }} />
          }
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {state.phase === 'available' && 'Nova versao disponivel'}
            {state.phase === 'downloading' && 'Baixando atualizacao...'}
            {state.phase === 'ready' && 'Atualizado'}
          </span>
        </div>
        {state.phase !== 'downloading' && (
          <button
            onClick={() => setDismissed(true)}
            className="flex items-center justify-center w-5 h-5 rounded"
            style={{ color: 'var(--text-muted)', background: 'none' }}
          >
            <X size={11} />
          </button>
        )}
      </div>

      <div className="px-4 pb-3">
        {state.phase === 'available' && (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Versao {state.version} sera baixada em background e instalada automaticamente ao fechar o app.
          </p>
        )}

        {state.phase === 'downloading' && (
          <>
            <div className="rounded-full overflow-hidden mb-1" style={{ height: 3, background: 'var(--bg-active)' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${state.percent}%`, background: 'var(--accent)', transition: 'width 0.3s' }}
              />
            </div>
            <div className="flex justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{state.percent}%</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatSpeed(state.bytesPerSecond)}</span>
            </div>
          </>
        )}

        {state.phase === 'ready' && (
          <>
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              Versao {state.version} pronta. O app vai atualizar automaticamente ao fechar.
            </p>
            <button
              onClick={() => window.api.updater.install()}
              className="w-full py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Reiniciar agora
            </button>
          </>
        )}
      </div>
    </div>
  )
}
