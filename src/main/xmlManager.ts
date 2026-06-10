import type { ServerRecord, GroupRecord } from './store'
import { sealWithPassword, openWithPassword, type SealedBlob } from './crypto'

export function exportToXML(servers: ServerRecord[], groups: GroupRecord[]): string {
  const groupsXml = groups.map((g) =>
    `    <Group id="${esc(g.id)}" name="${esc(g.name)}" color="${esc(g.color ?? '')}" />`
  ).join('\n')

  const serversXml = servers.map((s) =>
    `    <Server\n` +
    `      id="${esc(s.id)}" name="${esc(s.name)}" host="${esc(s.host)}" port="${s.port}"\n` +
    `      username="${esc(s.username)}" authMethod="${esc(s.authMethod)}"\n` +
    `      groupId="${esc(s.groupId ?? '')}" color="${esc(s.color ?? '')}"\n` +
    `      tags="${esc((s.tags ?? []).join(','))}" notes="${esc(s.notes ?? '')}" />`
  ).join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- CorpSSH Export - ${new Date().toISOString()} -->`,
    '<CorpSSH version="1.0">',
    '  <Groups>',
    groupsXml || '    <!-- no groups -->',
    '  </Groups>',
    '  <Servers>',
    serversXml || '    <!-- no servers -->',
    '  </Servers>',
    '</CorpSSH>'
  ].join('\n')
}

export function exportToXMLWithCredentials(servers: ServerRecord[], groups: GroupRecord[]): string {
  const groupsXml = groups.map((g) =>
    `    <Group id="${esc(g.id)}" name="${esc(g.name)}" color="${esc(g.color ?? '')}" />`
  ).join('\n')

  const serversXml = servers.map((s) =>
    `    <Server\n` +
    `      id="${esc(s.id)}" name="${esc(s.name)}" host="${esc(s.host)}" port="${s.port}"\n` +
    `      username="${esc(s.username)}" authMethod="${esc(s.authMethod)}"\n` +
    `      password="${esc(s.password ?? '')}"\n` +
    `      privateKeyPath="${esc(s.privateKeyPath ?? '')}"\n` +
    `      passphrase="${esc(s.passphrase ?? '')}"\n` +
    `      groupId="${esc(s.groupId ?? '')}" color="${esc(s.color ?? '')}"\n` +
    `      tags="${esc((s.tags ?? []).join(','))}" notes="${esc(s.notes ?? '')}" />`
  ).join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- CorpSSH Export WITH CREDENTIALS - ${new Date().toISOString()} -->`,
    `<!-- AVISO: Este arquivo contém senhas em texto puro. Guarde com segurança. -->`,
    '<CorpSSH version="1.0" includesCredentials="true">',
    '  <Groups>',
    groupsXml || '    <!-- no groups -->',
    '  </Groups>',
    '  <Servers>',
    serversXml || '    <!-- no servers -->',
    '  </Servers>',
    '</CorpSSH>'
  ].join('\n')
}

// ─── Encrypted envelope ──────────────────────────────────────────────────────
// "Export with credentials" no longer writes plaintext secrets. The credential-
// bearing XML is sealed with a user password (scrypt + AES-256-GCM) and wrapped
// in a small <CorpSSHEncrypted> envelope. Importing requires the same password,
// so leaking the file does not leak credentials.
const ENCRYPTED_ROOT = 'CorpSSHEncrypted'

export function isEncryptedXML(xml: string): boolean {
  return xml.includes(`<${ENCRYPTED_ROOT}`)
}

export function encryptXMLEnvelope(innerXml: string, password: string): string {
  const blob = sealWithPassword(innerXml, password)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- CorpSSH Encrypted Export - ${new Date().toISOString()} -->`,
    '<!-- Arquivo criptografado. Importe no CorpSSH usando a senha definida na exportacao. -->',
    `<${ENCRYPTED_ROOT} version="1.0" kdf="scrypt" cipher="aes-256-gcm"`,
    `  salt="${blob.salt}" iv="${blob.iv}" tag="${blob.tag}">${blob.data}</${ENCRYPTED_ROOT}>`
  ].join('\n')
}

// Decrypt an envelope back to the inner XML. Throws on wrong password / corruption.
export function decryptXMLEnvelope(xml: string, password: string): string {
  const m = xml.match(/<CorpSSHEncrypted\s([^>]*?)>([\s\S]*?)<\/CorpSSHEncrypted>/)
  if (!m) throw new Error('Arquivo criptografado invalido')
  const attrs = parseAttrs(m[1])
  const data = m[2].trim()
  if (!attrs.salt || !attrs.iv || !attrs.tag || !data) {
    throw new Error('Arquivo criptografado incompleto')
  }
  const blob: SealedBlob = { salt: attrs.salt, iv: attrs.iv, tag: attrs.tag, data }
  try {
    return openWithPassword(blob, password)
  } catch {
    throw new Error('Senha incorreta ou arquivo corrompido')
  }
}

export interface ImportResult {
  servers: ServerRecord[]
  groups: GroupRecord[]
}

export function importFromXML(xmlContent: string): ImportResult {
  const groups: GroupRecord[] = []
  const servers: ServerRecord[] = []

  // Parse Groups
  const groupMatches = xmlContent.matchAll(/<Group\s([^/]*?)\/>/gs)
  for (const match of groupMatches) {
    const attrs = parseAttrs(match[1])
    if (attrs.id && attrs.name) {
      groups.push({ id: attrs.id, name: attrs.name, color: attrs.color || undefined })
    }
  }

  // Parse Servers
  const serverMatches = xmlContent.matchAll(/<Server\s([^/]*?)\/>/gs)
  for (const match of serverMatches) {
    const attrs = parseAttrs(match[1])
    if (attrs.id && attrs.host) {
      servers.push({
        id: attrs.id,
        name: attrs.name || attrs.host,
        host: attrs.host,
        port: parseInt(attrs.port ?? '22') || 22,
        username: attrs.username || '',
        authMethod: (attrs.authMethod as any) || 'password',
        password: attrs.password || undefined,
        privateKeyPath: attrs.privateKeyPath || undefined,
        passphrase: attrs.passphrase || undefined,
        groupId: attrs.groupId || undefined,
        color: attrs.color || undefined,
        tags: attrs.tags ? attrs.tags.split(',').filter(Boolean) : [],
        notes: attrs.notes || undefined
      })
    }
  }

  return { servers, groups }
}

function parseAttrs(attrsStr: string): Record<string, string> {
  const result: Record<string, string> = {}
  const re = /(\w+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrsStr)) !== null) {
    result[m[1]] = unesc(m[2])
  }
  return result
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function unesc(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}
