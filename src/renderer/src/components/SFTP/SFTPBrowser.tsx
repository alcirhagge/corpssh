import { useState, useEffect, useCallback } from 'react'
import {
  Folder, File, Upload, Download, Trash2, RefreshCw,
  ChevronRight, Home, ArrowLeft, FolderOpen
} from 'lucide-react'
import type { Tab, SFTPEntry } from '../../types'

interface SFTPBrowserProps {
  tab: Tab
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export default function SFTPBrowser({ tab }: SFTPBrowserProps) {
  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries] = useState<SFTPEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<string[]>(['/'])

  const loadDirectory = useCallback(async (path: string) => {
    if (!tab.sessionId) return
    setLoading(true)
    setError(null)
    setSelected(new Set())
    try {
      const list = await window.api.sftp.list(tab.sessionId, path)
      setEntries(list)
      setCurrentPath(path)
    } catch (e: any) {
      setError(e.message || 'Erro ao listar diretório')
    } finally {
      setLoading(false)
    }
  }, [tab.sessionId])

  useEffect(() => {
    loadDirectory('/')
  }, [loadDirectory])

  const navigateTo = (path: string) => {
    setHistory(prev => [...prev, currentPath])
    loadDirectory(path)
  }

  const navigateBack = () => {
    const prev = history[history.length - 1]
    if (prev) {
      setHistory(h => h.slice(0, -1))
      loadDirectory(prev)
    }
  }

  const pathParts = currentPath.split('/').filter(Boolean)

  const handleDownload = async (entry: SFTPEntry) => {
    if (!tab.sessionId || entry.type === 'directory') return
    const remotePath = `${currentPath}/${entry.name}`.replace('//', '/')
    try {
      await window.api.sftp.download(tab.sessionId, remotePath)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleUpload = async () => {
    if (!tab.sessionId) return
    try {
      await window.api.sftp.upload(tab.sessionId, currentPath)
      loadDirectory(currentPath)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleDelete = async (entry: SFTPEntry) => {
    if (!tab.sessionId) return
    const remotePath = `${currentPath}/${entry.name}`.replace('//', '/')
    try {
      await window.api.sftp.delete(tab.sessionId, remotePath, entry.type === 'directory')
      loadDirectory(currentPath)
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-app)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}
      >
        <button
          onClick={navigateBack}
          disabled={history.length <= 1}
          className="flex items-center justify-center w-7 h-7 rounded"
          style={{
            color: history.length <= 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
            cursor: history.length <= 1 ? 'not-allowed' : 'pointer'
          }}
          onMouseEnter={e => history.length > 1 && (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <ArrowLeft size={14} />
        </button>

        <button
          onClick={() => loadDirectory(currentPath)}
          className="flex items-center justify-center w-7 h-7 rounded"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          <button
            onClick={() => navigateTo('/')}
            className="flex items-center justify-center w-6 h-6 rounded"
            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
          >
            <Home size={12} />
          </button>
          {pathParts.map((part, i) => {
            const path = '/' + pathParts.slice(0, i + 1).join('/')
            return (
              <div key={path} className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />
                <button
                  onClick={() => navigateTo(path)}
                  className="text-xs px-1 rounded hover:underline"
                  style={{ color: i === pathParts.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                >
                  {part}
                </button>
              </div>
            )
          })}
        </div>

        <button
          onClick={handleUpload}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs"
          style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent-subtle)'; e.currentTarget.style.color = 'var(--accent)' }}
        >
          <Upload size={12} />
          Upload
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 text-xs" style={{ background: 'var(--error-subtle)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 gap-2" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--text-muted)' }}>
            <FolderOpen size={24} />
            <span className="text-sm">Pasta vazia</span>
          </div>
        ) : (
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {['Nome', 'Tamanho', 'Modificado', ''].map(h => (
                  <th
                    key={h}
                    className="text-left px-3 py-2 text-xs font-medium"
                    style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <SFTPRow
                  key={entry.name}
                  entry={entry}
                  onOpen={() => {
                    if (entry.type === 'directory') {
                      const newPath = `${currentPath}/${entry.name}`.replace('//', '/')
                      navigateTo(newPath)
                    }
                  }}
                  onDownload={() => handleDownload(entry)}
                  onDelete={() => handleDelete(entry)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Status bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 text-xs"
        style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        <span>{entries.length} item{entries.length !== 1 ? 's' : ''}</span>
        <span>{currentPath}</span>
      </div>
    </div>
  )
}

function SFTPRow({
  entry, onOpen, onDownload, onDelete
}: {
  entry: SFTPEntry
  onOpen: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const isDir = entry.type === 'directory'

  return (
    <tr
      className="cursor-pointer"
      style={{
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        borderBottom: '1px solid var(--border-subtle)',
        transition: 'background 0.1s'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onOpen}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span style={{ color: isDir ? 'var(--warning)' : 'var(--text-muted)' }}>
            {isDir ? <Folder size={14} /> : <File size={14} />}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
            {entry.name}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {isDir ? '—' : formatSize(entry.size)}
      </td>
      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {formatDate(entry.modifyTime)}
      </td>
      <td className="px-3 py-2">
        {hovered && (
          <div className="flex items-center gap-1 justify-end">
            {!isDir && (
              <ActionBtn onClick={onDownload} title="Download" color="var(--accent)">
                <Download size={12} />
              </ActionBtn>
            )}
            <ActionBtn onClick={onDelete} title="Excluir" color="var(--error)">
              <Trash2 size={12} />
            </ActionBtn>
          </div>
        )}
      </td>
    </tr>
  )
}

function ActionBtn({ children, onClick, title, color }: {
  children: React.ReactNode; onClick: () => void; title: string; color: string
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      title={title}
      className="flex items-center justify-center w-6 h-6 rounded"
      style={{ color, background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  )
}
