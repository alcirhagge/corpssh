// mRemoteNG importer.
//
// mRemoteNG stores its connections in a nested `confCons.xml`:
//   <mrng:Connections EncryptionEngine="AES" BlockCipherMode="GCM"
//                     KdfIterations="1000" FullFileEncryption="false" ...>
//     <Node Name="Folder" Type="Container" ...>
//       <Node Name="Web" Type="Connection" Hostname="10.0.0.1"
//             Protocol="SSH2" Port="22" Username="root" Password="<b64>" />
//     </Node>
//   </mrng:Connections>
//
// Per-field passwords are AES-256-GCM, with the key derived via
// PBKDF2-HMAC-SHA1(password, salt, iterations). The first 16 bytes of the
// base64 blob are BOTH the KDF salt and the GCM nonce; the last 16 bytes are
// the auth tag. The default password (when the user never set a custom one) is
// the literal "mR3m". We map the result onto CorpSSH's ServerRecord/GroupRecord.
import { randomUUID } from 'crypto'
import * as crypto from 'crypto'
import type { ServerRecord, GroupRecord } from './store'

export const MREMOTENG_DEFAULT_PASSWORD = 'mR3m'

// Thrown when a non-empty password field cannot be decrypted with the supplied
// password. The IPC layer turns this into a "needs password" prompt.
export class MremotengPasswordError extends Error {
  constructor(message = 'Senha do mRemoteNG incorreta') {
    super(message)
    this.name = 'MremotengPasswordError'
  }
}

export interface MremotengImportResult {
  servers: ServerRecord[]
  groups: GroupRecord[]
  /** Connections skipped because their protocol is unsupported (Telnet, RAW, …). */
  skipped: number
}

type SupportedProtocol = 'ssh' | 'rdp' | 'vnc'
const DEFAULT_PORT: Record<SupportedProtocol, number> = { ssh: 22, rdp: 3389, vnc: 5900 }

// Decrypt one mRemoteNG GCM-encrypted field. Returns '' for empty input.
// Throws MremotengPasswordError on auth-tag mismatch (wrong password).
export function decryptMremotengField(b64: string, password: string, iterations: number): string {
  const value = (b64 ?? '').trim()
  if (!value) return ''

  let data: Buffer
  try {
    data = Buffer.from(value, 'base64')
  } catch {
    throw new MremotengPasswordError('Campo de senha inválido')
  }
  // Layout: salt(16) | nonce(16) | ciphertext(N) | authTag(16). The salt is also
  // the GCM associated data. Key = PBKDF2-HMAC-SHA1(password, salt, iterations).
  if (data.length < 48) throw new MremotengPasswordError('Campo de senha truncado')

  const salt = data.subarray(0, 16)
  const nonce = data.subarray(16, 32)
  const rest = data.subarray(32)
  const tag = rest.subarray(rest.length - 16)
  const ciphertext = rest.subarray(0, rest.length - 16)
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha1')

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 })
    decipher.setAAD(salt)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // Bad auth tag = wrong password (or corrupt blob).
    throw new MremotengPasswordError()
  }
}

function mapProtocol(raw: string | undefined): SupportedProtocol | null {
  switch ((raw ?? '').toLowerCase()) {
    case 'ssh1':
    case 'ssh2':
      return 'ssh'
    case 'rdp':
      return 'rdp'
    case 'vnc':
      return 'vnc'
    default:
      return null // Telnet, Rlogin, RAW, HTTP/S, ICA, PowerShell, … not supported
  }
}

function parseAttrs(attrsStr: string): Record<string, string> {
  const result: Record<string, string> = {}
  const re = /([\w:-]+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrsStr)) !== null) {
    result[m[1]] = unescapeXml(m[2])
  }
  return result
}

function unescapeXml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

// Parse a mRemoteNG confCons.xml into CorpSSH records. `password` decrypts the
// per-field secrets (default "mR3m"). Throws MremotengPasswordError when a
// non-empty secret won't decrypt, so the caller can re-prompt.
export function parseMremotengXml(xml: string, password: string): MremotengImportResult {
  // Read crypto params + full-file-encryption flag from the root element.
  const rootMatch = xml.match(/<(?:\w+:)?Connections\b([^>]*)>/)
  const rootAttrs = rootMatch ? parseAttrs(rootMatch[1]) : {}

  if ((rootAttrs.FullFileEncryption ?? '').toLowerCase() === 'true') {
    throw new Error(
      'Arquivo com "Encrypt entire file" não é suportado. No mRemoteNG, desmarque a criptografia de arquivo inteiro e exporte novamente.'
    )
  }
  const cipherMode = (rootAttrs.BlockCipherMode || 'GCM').toUpperCase()
  if (cipherMode !== 'GCM') {
    throw new Error(
      `Modo de cifra "${cipherMode}" não suportado (apenas GCM). Reexporte do mRemoteNG atual ou remova as senhas.`
    )
  }
  const iterations = parseInt(rootAttrs.KdfIterations ?? '1000', 10) || 1000

  const servers: ServerRecord[] = []
  const groups: GroupRecord[] = []
  let skipped = 0

  // Walk Node open/close/self-close tokens in document order, tracking the
  // container stack so each connection lands under its parent folder.
  const stack: string[] = [] // group ids of open containers
  const tokenRe = /<Node\b([^>]*?)(\/?)>|<\/Node>/g
  let token: RegExpExecArray | null

  while ((token = tokenRe.exec(xml)) !== null) {
    if (token[0] === '</Node>') {
      stack.pop()
      continue
    }
    const attrs = parseAttrs(token[1])
    const selfClose = token[2] === '/'
    const type = (attrs.Type ?? '').toLowerCase()

    if (type === 'container') {
      const id = randomUUID()
      groups.push({ id, name: attrs.Name || 'Folder' })
      if (!selfClose) stack.push(id)
      continue
    }

    // Treat anything else with a Hostname as a connection.
    const protocol = mapProtocol(attrs.Protocol)
    if (!protocol) {
      if (attrs.Hostname) skipped++
      continue
    }

    const secret = decryptMremotengField(attrs.Password ?? '', password, iterations)
    const port = parseInt(attrs.Port ?? '', 10) || DEFAULT_PORT[protocol]
    const groupId = stack.length ? stack[stack.length - 1] : undefined

    const server: ServerRecord = {
      id: randomUUID(),
      name: attrs.Name || attrs.Hostname || 'host',
      host: attrs.Hostname || '',
      port,
      username: attrs.Username || '',
      protocol,
      authMethod: 'password',
      groupId,
      notes: attrs.Descr || undefined
    }
    if (secret) {
      if (protocol === 'vnc') server.vncPassword = secret
      else server.password = secret
    }
    if (protocol === 'rdp' && attrs.Domain) server.rdpDomain = attrs.Domain

    if (server.host) servers.push(server)
  }

  // Drop empty folders so the import doesn't litter the group list.
  const usedGroupIds = new Set(servers.map((s) => s.groupId).filter(Boolean) as string[])
  const prunedGroups = groups.filter((g) => usedGroupIds.has(g.id))

  return { servers, groups: prunedGroups, skipped }
}
