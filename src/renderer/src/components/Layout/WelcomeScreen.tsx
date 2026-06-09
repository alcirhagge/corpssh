import { Terminal, Plus, Server, Key, Wifi } from 'lucide-react'

interface WelcomeScreenProps {
  serverCount: number
  onAddServer: () => void
}

export default function WelcomeScreen({ serverCount, onAddServer }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6" style={{ background: 'var(--bg-app)' }}>
      {/* Logo */}
      <div className="flex flex-col items-center gap-4">
        <div
          className="flex items-center justify-center w-20 h-20 rounded-3xl shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)',
          }}
        >
          <Terminal size={40} color="white" strokeWidth={1.5} />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            CorpSSH
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Corporate SSH client
          </p>
        </div>
      </div>

      {/* Stats */}
      {serverCount > 0 && (
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full text-xs"
          style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}
        >
          <Server size={12} />
          {serverCount} server{serverCount !== 1 ? 's' : ''} configured
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 w-64">
        <ActionCard
          icon={<Wifi size={18} />}
          title="Connect to a Server"
          description="Double-click a server in the sidebar"
          color="var(--accent)"
        />
        <ActionCard
          icon={<Plus size={18} />}
          title="Add Server"
          description="Set up a new SSH connection"
          color="var(--success)"
          onClick={onAddServer}
          clickable
        />
        <ActionCard
          icon={<Key size={18} />}
          title="SSH Keys"
          description="Manage your authentication keys"
          color="var(--purple)"
        />
      </div>

      {/* Hint */}
      <p className="text-xs text-center" style={{ color: 'var(--text-muted)', maxWidth: 300 }}>
        Tip: Double-click a server to connect,<br />
        or right-click for more options.
      </p>
    </div>
  )
}

function ActionCard({
  icon, title, description, color, onClick, clickable
}: {
  icon: React.ReactNode
  title: string
  description: string
  color: string
  onClick?: () => void
  clickable?: boolean
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        cursor: clickable ? 'pointer' : 'default'
      }}
      onMouseEnter={e => clickable && (e.currentTarget.style.borderColor = color)}
      onMouseLeave={e => clickable && (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div
        className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
        style={{ background: `${color}22`, color }}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{description}</p>
      </div>
    </div>
  )
}
