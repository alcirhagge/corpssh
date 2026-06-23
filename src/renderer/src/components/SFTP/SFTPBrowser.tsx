import { useState, useEffect, useCallback } from 'react'
import { Folder, File, RefreshCw, ArrowLeft, ArrowRight, FolderOpen, AlertCircle } from 'lucide-react'
import type { Tab } from '../../types'

interface PaneEntry {
  name: string
  type: 'file' | 'directory'
  size: number
  modifyTime: number
}

interface SFTPBrowserProps {
  tab: Tab
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '—'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const getParent = (p: string): string | null => {
  if (p.includes('\\')) {
    const normalized = p.replace(/\\+$/, '')
    const idx = normalized.lastIndexOf('\\')
    if (idx < 0) return null
    const parent = normalized.slice(0, idx + 1)
    if (parent.toLowerCase() === normalized.toLowerCase() + '\\') return null
    return parent
  }
  const parts = p.split('/').filter(Boolean)
  if (parts.length === 0) return null
  return '/' + parts.slice(0, -1).join('/')
}

const joinPath = (base: string, name: string): string => {
  if (base.includes('\\')) {
    return base.replace(/\\+$/, '') + '\\' + name
  }
  return (base === '/' ? '' : base) + '/' + name
}

const sortEntries = (list: PaneEntry[]) =>
  [...list].sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1
    if (b.type === 'directory' && a.type !== 'directory') return 1
    return a.name.localeCompare(b.name)
  })

export default function SFTPBrowser({ tab }: SFTPBrowserProps) {
  const [remotePath, setRemotePath] = useState('/')
  const [remoteEntries, setRemoteEntries] = useState<PaneEntry[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [selectedRemote, setSelectedRemote] = useState<PaneEntry | null>(null)

  const [localPath, setLocalPath] = useState('')
  const [localEntries, setLocalEntries] = useState<PaneEntry[]>([])
  const [localLoading, setLocalLoading] = useState(false)
  const [selectedLocal, setSelectedLocal] = useState<PaneEntry | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [transferMsg, setTransferMsg] = useState('')

  // Remote files currently open for inline editing (each save re-uploads).
  const [editing, setEditing] = useState<Set<string>>(new Set())

  const loadRemote = useCallback(async (path: string) => {
    if (!tab.sessionId) return
    setRemoteLoading(true)
    setError(null)
    setSelectedRemote(null)
    try {
      const list = await window.api.sftp.list(tab.sessionId, path)
      setRemoteEntries(sortEntries(list as PaneEntry[]))
      setRemotePath(path)
    } catch (e: any) {
      setError(`Server: ${e.message}`)
    } finally {
      setRemoteLoading(false)
    }
  }, [tab.sessionId])

  const loadLocal = useCallback(async (path: string) => {
    setLocalLoading(true)
    setSelectedLocal(null)
    try {
      const list = await window.api.local.list(path)
      setLocalEntries(sortEntries(list as PaneEntry[]))
      setLocalPath(path)
    } catch (e: any) {
      setError(`Local: ${e.message}`)
    } finally {
      setLocalLoading(false)
    }
  }, [])

  useEffect(() => {
    // Open the server pane at the user's home dir (writable) instead of '/'
    if (tab.sessionId) {
      window.api.sftp.home(tab.sessionId)
        .then((h) => loadRemote(h || '/'))
        .catch(() => loadRemote('/'))
    }
    window.api.local.homedir().then((home) => loadLocal(home))
  }, [loadRemote, loadLocal, tab.sessionId])

  // A remote file open for editing re-uploaded on save → flash a confirmation.
  useEffect(() => {
    const off = window.api.sftp.onEditSync(({ remotePath: rp }) => {
      const base = rp.split('/').pop() || rp
      setTransferMsg(`Saved ${base} → server`)
      setTimeout(() => setTransferMsg(''), 2500)
      // If the saved file lives in the open folder, refresh sizes/timestamps.
      if (getParent(rp) === remotePath) loadRemote(remotePath)
    })
    return () => { off() }
  }, [remotePath, loadRemote])

  // Open a remote file for inline editing: download → default editor → watch+sync.
  const editRemoteFile = async (entry: PaneEntry) => {
    if (!tab.sessionId || entry.type !== 'file') return
    const full = joinPath(remotePath, entry.name)
    try {
      await window.api.sftp.editRemote(tab.sessionId, full)
      setEditing((prev) => new Set(prev).add(full))
      setTransferMsg(`Editing ${entry.name} — saves sync to server`)
      setTimeout(() => setTransferMsg(''), 3000)
    } catch (e: any) {
      setError(`Edit: ${e.message}`)
    }
  }

  // Drop files/folders from the OS file manager straight onto the SERVER pane.
  const handleDropToRemote = async (paths: string[]) => {
    if (!tab.sessionId || paths.length === 0) return
    setTransferring(true)
    setError(null)
    try {
      for (const src of paths) {
        const base = src.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || src
        setTransferMsg(`Uploading ${base}…`)
        await window.api.sftp.uploadDirect(tab.sessionId, src, joinPath(remotePath, base))
      }
      setTransferMsg(`Uploaded ${paths.length} item${paths.length === 1 ? '' : 's'}`)
      setTimeout(() => setTransferMsg(''), 2500)
      loadRemote(remotePath)
    } catch (e: any) {
      setError(`Upload: ${e.message}`)
    } finally {
      setTransferring(false)
    }
  }

  const handleUpload = async () => {
    if (!selectedLocal || !tab.sessionId) return
    const isDir = selectedLocal.type === 'directory'
    setTransferring(true)
    setTransferMsg(`Uploading ${isDir ? 'folder ' : ''}${selectedLocal.name}…`)
    setError(null)
    try {
      const src = joinPath(localPath, selectedLocal.name)
      const dst = joinPath(remotePath, selectedLocal.name)
      await window.api.sftp.uploadDirect(tab.sessionId, src, dst)
      setTransferMsg(`${selectedLocal.name} uploaded`)
      setTimeout(() => setTransferMsg(''), 2500)
      loadRemote(remotePath)
    } catch (e: any) {
      setError(`Upload: ${e.message}`)
    } finally {
      setTransferring(false)
    }
  }

  const handleDownload = async () => {
    if (!selectedRemote || !tab.sessionId) return
    const isDir = selectedRemote.type === 'directory'
    setTransferring(true)
    setTransferMsg(`Downloading ${isDir ? 'folder ' : ''}${selectedRemote.name}…`)
    setError(null)
    try {
      const src = joinPath(remotePath, selectedRemote.name)
      const dst = joinPath(localPath, selectedRemote.name)
      await window.api.sftp.downloadDirect(tab.sessionId, src, dst)
      setTransferMsg(`${selectedRemote.name} downloaded`)
      setTimeout(() => setTransferMsg(''), 2500)
      loadLocal(localPath)
    } catch (e: any) {
      setError(`Download: ${e.message}`)
    } finally {
      setTransferring(false)
    }
  }

  const uploadReady = !!selectedLocal && !transferring
  const downloadReady = !!selectedRemote && !transferring

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-app)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}
      >
        <FolderOpen size={14} style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          SFTP — {tab.serverName}
        </span>
        {transferMsg && (
          <span className="text-xs" style={{ color: 'var(--success)', marginLeft: 8 }}>
            {transferMsg}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-xs flex-shrink-0"
          style={{ background: 'var(--error-subtle)', color: 'var(--error)' }}
        >
          <AlertCircle size={12} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} style={{ color: 'var(--error)' }}>×</button>
        </div>
      )}

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Local pane */}
        <FilePane
          title="LOCAL"
          path={localPath}
          entries={localEntries}
          loading={localLoading}
          selected={selectedLocal}
          onNavigate={loadLocal}
          onSelect={(e) => setSelectedLocal((prev) => prev?.name === e.name ? null : e)}
          onParent={() => { const p = getParent(localPath); if (p) loadLocal(p) }}
          canGoParent={!!getParent(localPath)}
          onRefresh={() => loadLocal(localPath)}
          currentPath={localPath}
        />

        {/* Transfer buttons */}
        <div
          className="flex flex-col items-center justify-center gap-3"
          style={{
            width: 54, flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-surface)'
          }}
        >
          <button
            onClick={handleUpload}
            disabled={!uploadReady}
            title="Upload file/folder to server →"
            className="flex items-center justify-center rounded-lg"
            style={{
              width: 34, height: 34,
              background: uploadReady ? 'var(--accent)' : 'var(--bg-elevated)',
              color: uploadReady ? '#fff' : 'var(--text-muted)',
              opacity: transferring ? 0.5 : 1,
              transition: 'all 0.15s',
              cursor: uploadReady ? 'pointer' : 'not-allowed'
            }}
          >
            <ArrowRight size={16} />
          </button>
          <button
            onClick={handleDownload}
            disabled={!downloadReady}
            title="← Download file/folder from server"
            className="flex items-center justify-center rounded-lg"
            style={{
              width: 34, height: 34,
              background: downloadReady ? 'var(--accent)' : 'var(--bg-elevated)',
              color: downloadReady ? '#fff' : 'var(--text-muted)',
              opacity: transferring ? 0.5 : 1,
              transition: 'all 0.15s',
              cursor: downloadReady ? 'pointer' : 'not-allowed'
            }}
          >
            <ArrowLeft size={16} />
          </button>
        </div>

        {/* Remote pane */}
        <FilePane
          title="SERVER"
          path={remotePath}
          entries={remoteEntries}
          loading={remoteLoading}
          selected={selectedRemote}
          onNavigate={loadRemote}
          onSelect={(e) => setSelectedRemote((prev) => prev?.name === e.name ? null : e)}
          onParent={() => {
            const parts = remotePath.split('/').filter(Boolean)
            if (parts.length > 0) loadRemote('/' + parts.slice(0, -1).join('/') || '/')
          }}
          canGoParent={remotePath !== '/'}
          onRefresh={() => loadRemote(remotePath)}
          currentPath={remotePath}
          onOpenFile={editRemoteFile}
          onDropFiles={handleDropToRemote}
          editingPaths={editing}
        />
      </div>
    </div>
  )
}

function FilePane({
  title, path, entries, loading, selected,
  onNavigate, onSelect, onParent, canGoParent, onRefresh, currentPath,
  onOpenFile, onDropFiles, editingPaths
}: {
  title: string
  path: string
  entries: PaneEntry[]
  loading: boolean
  selected: PaneEntry | null
  onNavigate: (path: string) => void
  onSelect: (entry: PaneEntry) => void
  onParent: () => void
  canGoParent: boolean
  onRefresh: () => void
  currentPath: string
  /** Open a file (double-click) — server pane only, edits sync back. */
  onOpenFile?: (entry: PaneEntry) => void
  /** Receive OS-dragged file/folder paths dropped onto the pane. */
  onDropFiles?: (paths: string[]) => void
  /** Remote full paths currently open for editing (shows a live badge). */
  editingPaths?: Set<string>
}) {
  const displayPath = path.length > 32 ? '…' + path.slice(-30) : path
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!onDropFiles) return
    // Electron exposes the real filesystem path on dropped File objects.
    const paths = Array.from(e.dataTransfer.files).map((f) => (f as File & { path: string }).path).filter(Boolean)
    if (paths.length) onDropFiles(paths)
  }

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden relative"
      style={{ minWidth: 0, outline: dragOver ? '2px dashed var(--accent)' : 'none', outlineOffset: -2 }}
      onDragOver={onDropFiles ? (e) => { e.preventDefault(); setDragOver(true) } : undefined}
      onDragLeave={onDropFiles ? () => setDragOver(false) : undefined}
      onDrop={onDropFiles ? handleDrop : undefined}
    >
      {dragOver && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
          style={{ background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}
        >
          Drop to upload here
        </div>
      )}
      {/* Toolbar */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0"
        style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span
          className="text-xs font-bold"
          style={{ color: 'var(--text-muted)', letterSpacing: '0.07em', marginRight: 2 }}
        >
          {title}
        </span>
        <button
          onClick={onParent}
          disabled={!canGoParent}
          className="flex items-center justify-center w-6 h-6 rounded"
          style={{
            color: canGoParent ? 'var(--text-secondary)' : 'var(--text-muted)',
            cursor: canGoParent ? 'pointer' : 'default',
            background: 'transparent'
          }}
          title="Go up"
        >
          <ArrowLeft size={12} />
        </button>
        <button
          onClick={onRefresh}
          className="flex items-center justify-center w-6 h-6 rounded"
          style={{ color: 'var(--text-secondary)', background: 'transparent' }}
          title="Refresh"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
        <span
          className="truncate text-xs flex-1"
          style={{ color: 'var(--text-secondary)', fontSize: 11 }}
          title={path}
        >
          {displayPath}
        </span>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-24" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={14} className="animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center h-24">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Empty folder</span>
          </div>
        ) : (
          entries.map((entry) => {
            const isDir = entry.type === 'directory'
            const isSelected = selected?.name === entry.name

            return (
              <div
                key={entry.name}
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
                style={{
                  background: isSelected ? 'var(--accent-subtle)' : 'transparent',
                  borderLeft: `2px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                  transition: 'background 0.08s'
                }}
                onClick={() => onSelect(entry)}
                onDoubleClick={() => {
                  if (isDir) onNavigate(joinPath(currentPath, entry.name))
                  else if (onOpenFile) onOpenFile(entry)
                }}
                title={isDir
                  ? 'Click to select · double-click to open'
                  : onOpenFile ? 'Double-click to edit (saves sync to server)' : entry.name}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ color: isDir ? 'var(--warning)' : 'var(--text-muted)', flexShrink: 0 }}>
                  {isDir ? <Folder size={13} /> : <File size={13} />}
                </span>
                <span
                  className="truncate flex-1 text-xs"
                  style={{ color: 'var(--text-primary)' }}
                  title={entry.name}
                >
                  {entry.name}
                </span>
                {!isDir && editingPaths?.has(joinPath(currentPath, entry.name)) && (
                  <span
                    className="flex-shrink-0 text-xs px-1 rounded"
                    style={{ background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: 9, fontWeight: 700 }}
                    title="Open in editor — saves sync back"
                  >
                    EDIT
                  </span>
                )}
                {!isDir && (
                  <span className="flex-shrink-0 text-xs" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                    {formatSize(entry.size)}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Status bar */}
      <div
        className="flex items-center gap-2 px-2 py-1 text-xs flex-shrink-0"
        style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
      >
        <span>{entries.length} item{entries.length !== 1 ? 's' : ''}</span>
        {selected && (
          <>
            <span>·</span>
            <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{selected.name}</span>
          </>
        )}
      </div>
    </div>
  )
}
