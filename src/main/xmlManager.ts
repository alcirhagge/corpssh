import * as fs from 'fs'
import type { ServerRecord, GroupRecord } from './store'

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
