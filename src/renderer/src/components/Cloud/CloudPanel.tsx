import { useEffect, useRef, useState } from 'react'
import { Cloud, CloudOff, LogIn, UserPlus, LogOut, Mail, CheckCircle, XCircle, RefreshCw, FolderSync, KeyRound } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

interface CloudStatus {
  configured: boolean
  signedIn: boolean
  email?: string
  userId?: string
}

const fieldStyle: React.CSSProperties = {
  background: 'var(--bg-app)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13
}

export default function CloudPanel() {
  const [status, setStatus] = useState<CloudStatus | null>(null)
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [newPass, setNewPass] = useState('')
  const [newPass2, setNewPass2] = useState('')
  const [forgotMode, setForgotMode] = useState(false) // OTP recovery step
  const [otp, setOtp] = useState('')
  const cloudRecovery = useAppStore((s) => s.cloudRecovery)
  const setCloudRecovery = useAppStore((s) => s.setCloudRecovery)
  const autoSynced = useRef(false)

  const clean = (m: string) => m?.replace(/^Error invoking remote method '[^']+': Error: /, '') ?? 'Falha'

  const doSync = async (silent = false) => {
    if (!silent) { setError(''); setInfo('') }
    setBusy(true)
    try {
      const r = await window.api.cloud.sync()
      setInfo(`Sincronizado: ${r.pushed} enviado(s), ${r.pulled} baixado(s).`)
    } catch (e: any) { if (!silent) setError(clean(e.message)) }
    finally { setBusy(false) }
  }

  const refresh = async (): Promise<CloudStatus> => {
    const s = (await window.api.cloud.status()) as CloudStatus
    setStatus(s)
    return s
  }

  useEffect(() => {
    refresh().then((s) => {
      // "Logged in → synced": auto-sync once on open when already signed in.
      if (s.signedIn && !autoSynced.current) { autoSynced.current = true; doSync(true) }
    })
  }, [])

  const submit = async () => {
    setError(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'signUp') {
        const r = await window.api.cloud.signUp(email.trim(), password)
        if (r.needsConfirmation) {
          setInfo(`Conta criada. Confirme o e-mail enviado para ${r.email} e depois entre.`)
          setBusy(false)
          return
        }
      } else {
        await window.api.cloud.signIn(email.trim(), password)
      }
      setPassword('')
      const s = await refresh()
      if (s.signedIn) { autoSynced.current = true; await doSync() }
    } catch (e: any) {
      setError(clean(e.message))
    } finally { setBusy(false) }
  }

  const signOut = async () => {
    setBusy(true); setError(''); setInfo('')
    try { await window.api.cloud.signOut(); autoSynced.current = false; await refresh() }
    catch (e: any) { setError(clean(e.message)) }
    finally { setBusy(false) }
  }

  const applyRecovery = async () => {
    if (!cloudRecovery) return
    setError(''); setInfo('')
    if (newPass.length < 6) { setError('Senha muito curta (mínimo 6 caracteres).'); return }
    if (newPass !== newPass2) { setError('As senhas não coincidem.'); return }
    setBusy(true)
    try {
      await window.api.cloud.applyRecovery(cloudRecovery.access_token, cloudRecovery.refresh_token, newPass)
      setCloudRecovery(null); setNewPass(''); setNewPass2('')
      setInfo('Senha redefinida. Você já está conectado.')
      autoSynced.current = true
      await refresh(); await doSync()
    } catch (e: any) { setError(clean(e.message)) } finally { setBusy(false) }
  }

  // Step 1: send the recovery code to the email.
  const sendResetCode = async () => {
    if (!email.trim()) { setError('Digite seu e-mail para receber o código.'); return }
    setError(''); setInfo(''); setBusy(true)
    try {
      await window.api.cloud.resetPassword(email.trim())
      setForgotMode(true)
      setInfo(`Código enviado para ${email.trim()}. Verifique seu e-mail.`)
    } catch (e: any) { setError(clean(e.message)) } finally { setBusy(false) }
  }

  // Step 2: verify the code and set the new password (logs the user in).
  const submitRecovery = async () => {
    setError(''); setInfo('')
    if (!otp.trim()) { setError('Digite o código do e-mail.'); return }
    if (newPass.length < 6) { setError('Senha muito curta (mínimo 6 caracteres).'); return }
    if (newPass !== newPass2) { setError('As senhas não coincidem.'); return }
    setBusy(true)
    try {
      await window.api.cloud.verifyRecovery(email.trim(), otp.trim(), newPass)
      setForgotMode(false); setOtp(''); setNewPass(''); setNewPass2(''); setPassword('')
      setInfo('Senha redefinida. Você já está conectado.')
      autoSynced.current = true
      const s = await refresh()
      if (s.signedIn) await doSync()
    } catch (e: any) { setError(clean(e.message)) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-1 overflow-y-auto p-6" style={{ background: 'var(--bg-app)', justifyContent: 'center', alignItems: 'flex-start' }}>
      <div style={{ width: '100%', maxWidth: 460, marginTop: 24 }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)' }}>
            <Cloud size={20} />
          </div>
          <div>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: 18 }}>Nuvem</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Opcional. Entre na sua conta e seus hosts ficam salvos e sincronizados entre dispositivos.
            </p>
          </div>
        </div>

        {/* Password recovery (from the corpssh:// email deep link) */}
        {cloudRecovery && (
          <div className="flex flex-col gap-2.5 p-4 rounded-xl mt-6" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent)' }}>
            <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>
              <KeyRound size={16} style={{ color: 'var(--accent)' }} /> Definir nova senha
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Link de recuperação confirmado. Escolha sua nova senha.</p>
            <input type="password" autoFocus value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Nova senha (mín. 6)"
              className="px-2.5 py-2 rounded-lg" style={fieldStyle} />
            <input type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} placeholder="Confirmar nova senha"
              onKeyDown={(e) => { if (e.key === 'Enter') applyRecovery() }}
              className="px-2.5 py-2 rounded-lg" style={fieldStyle} />
            <button onClick={applyRecovery} disabled={busy || !newPass} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-medium"
              style={{ background: 'var(--accent)', color: '#fff', fontSize: 13, opacity: (busy || !newPass) ? 0.6 : 1 }}>
              {busy ? <RefreshCw size={13} className="animate-spin" /> : <KeyRound size={13} />} Salvar nova senha
            </button>
          </div>
        )}

        {!cloudRecovery && status && !status.configured && (
          <div className="flex items-center gap-2 mt-5 px-3 py-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13 }}>
            <CloudOff size={16} /> Nuvem não configurada nesta build.
          </div>
        )}

        {/* Signed in */}
        {!cloudRecovery && status?.configured && status.signedIn && (
          <div className="flex flex-col gap-4 mt-6">
            <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'var(--success-subtle)', color: 'var(--success)' }}>
                <CheckCircle size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: 14 }}>Conectado</p>
                <p className="truncate" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{status.email}</p>
              </div>
              <button onClick={signOut} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium"
                style={{ background: 'var(--bg-app)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 13 }}>
                <LogOut size={14} /> Sair
              </button>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)' }}>
                <FolderSync size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold" style={{ color: 'var(--text-primary)', fontSize: 14 }}>Sincronização</p>
                <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Hosts, grupos, cofre e chaves.</p>
              </div>
              <button onClick={() => doSync()} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium"
                style={{ background: 'var(--accent)', color: '#fff', fontSize: 13, opacity: busy ? 0.6 : 1 }}>
                {busy ? <RefreshCw size={13} className="animate-spin" /> : <FolderSync size={14} />} Sincronizar agora
              </button>
            </div>
          </div>
        )}

        {/* Signed out — auth form */}
        {!cloudRecovery && status?.configured && !status.signedIn && !forgotMode && (
          <div className="flex flex-col gap-3 mt-6">
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', width: 'fit-content' }}>
              <ModeBtn active={mode === 'signIn'} onClick={() => { setMode('signIn'); setError(''); setInfo('') }} icon={<LogIn size={13} />} label="Entrar" />
              <ModeBtn active={mode === 'signUp'} onClick={() => { setMode('signUp'); setError(''); setInfo('') }} icon={<UserPlus size={13} />} label="Criar conta" />
            </div>

            <div className="flex flex-col gap-2.5 p-4 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <Field icon={<Mail size={14} />}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" autoFocus
                  className="flex-1 bg-transparent outline-none" style={{ color: 'var(--text-primary)', fontSize: 13 }} />
              </Field>
              <Field>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="senha"
                  onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                  className="flex-1 bg-transparent outline-none" style={{ color: 'var(--text-primary)', fontSize: 13 }} />
              </Field>
              <button onClick={submit} disabled={busy || !email || !password}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-medium mt-1"
                style={{ background: 'var(--accent)', color: '#fff', fontSize: 13, opacity: (busy || !email || !password) ? 0.6 : 1 }}>
                {busy ? <RefreshCw size={13} className="animate-spin" /> : (mode === 'signUp' ? <UserPlus size={13} /> : <LogIn size={13} />)}
                {mode === 'signUp' ? 'Criar conta' : 'Entrar'}
              </button>
              {mode === 'signIn' && (
                <button onClick={sendResetCode} disabled={busy} className="self-start"
                  style={{ background: 'none', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline' }}>
                  Esqueci minha senha
                </button>
              )}
            </div>
          </div>
        )}

        {/* Forgot password — OTP recovery */}
        {!cloudRecovery && status?.configured && !status.signedIn && forgotMode && (
          <div className="flex flex-col gap-2.5 p-4 rounded-xl mt-6" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent)' }}>
            <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>
              <KeyRound size={16} style={{ color: 'var(--accent)' }} /> Redefinir senha
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Digite o código que enviamos para <b>{email.trim()}</b> e escolha uma nova senha.</p>
            <input type="text" inputMode="numeric" autoFocus value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Código do e-mail"
              className="px-2.5 py-2 rounded-lg" style={fieldStyle} />
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Nova senha (mín. 6)"
              className="px-2.5 py-2 rounded-lg" style={fieldStyle} />
            <input type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} placeholder="Confirmar nova senha"
              onKeyDown={(e) => { if (e.key === 'Enter') submitRecovery() }}
              className="px-2.5 py-2 rounded-lg" style={fieldStyle} />
            <div className="flex items-center gap-2">
              <button onClick={submitRecovery} disabled={busy || !otp || !newPass} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-medium"
                style={{ background: 'var(--accent)', color: '#fff', fontSize: 13, opacity: (busy || !otp || !newPass) ? 0.6 : 1 }}>
                {busy ? <RefreshCw size={13} className="animate-spin" /> : <KeyRound size={13} />} Redefinir senha
              </button>
              <button onClick={() => { setForgotMode(false); setOtp(''); setNewPass(''); setNewPass2(''); setError(''); setInfo('') }}
                className="px-3 py-2 rounded-lg" style={{ background: 'var(--bg-app)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 13 }}>
                Voltar
              </button>
            </div>
            <button onClick={sendResetCode} disabled={busy} className="self-start"
              style={{ background: 'none', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline' }}>
              Reenviar código
            </button>
          </div>
        )}

        {info && (
          <div className="flex items-center gap-2 mt-4 px-3 py-2.5 rounded-lg" style={{ background: 'var(--success-subtle)', color: 'var(--success)', fontSize: 13 }}>
            <CheckCircle size={15} /> {info}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 mt-4 px-3 py-2.5 rounded-lg" style={{ background: 'var(--error-subtle)', color: 'var(--error)', fontSize: 13 }}>
            <XCircle size={15} /> {error}
          </div>
        )}
      </div>
    </div>
  )
}

function ModeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium"
      style={{ background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--text-secondary)', fontSize: 12.5 }}>
      {icon} {label}
    </button>
  )
}

function Field({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
      {icon && <span style={{ color: 'var(--text-muted)' }}>{icon}</span>}
      {children}
    </div>
  )
}
