# CorpSSH

Cliente de acesso remoto desktop (SSH, SFTP, RDP e VNC) com interface moderna: terminal multi-aba com split panes, túneis SSH, cofre de credenciais, snippets, logs/auditoria com envio para servidores externos e sincronização opcional em nuvem.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/github/v/release/alcirhagge/corpssh)

---

## Download

Acesse a [última release](https://github.com/alcirhagge/corpssh/releases/latest) e baixe o instalador para sua plataforma.

| Plataforma | Arquivo |
|---|---|
| Windows | `CorpSSH-x.x.x-setup.exe` |
| macOS | `CorpSSH-x.x.x.dmg` |
| Linux | `CorpSSH-x.x.x.AppImage` |

---

## Instalação no Windows (aviso do SmartScreen)

O instalador **não é assinado com um certificado comercial** (cert de code signing custa dinheiro). Por isso, na primeira execução o Windows SmartScreen mostra um aviso azul — *"O Windows protegeu o seu PC"*. Isso acontece com **qualquer** aplicativo sem certificado pago e **não significa** que o app é malicioso: o código-fonte é aberto e está inteiro neste repositório.

Para instalar mesmo assim:

1. Clique em **Mais informações**
2. Clique em **Executar assim mesmo**

### Verificar a integridade do download (opcional)

Cada release publica o arquivo `SHA256SUMS-windows.txt`. Para conferir que o instalador não foi adulterado, rode no PowerShell:

```powershell
Get-FileHash .\CorpSSH-x.x.x-setup.exe -Algorithm SHA256
```

O hash exibido deve ser igual ao que está em `SHA256SUMS-windows.txt`.

---

## Funcionalidades

**Conexões SSH**
- Terminal interativo completo (xterm.js) com cores, scroll e busca (Ctrl+F)
- Múltiplas conexões simultâneas em abas, split panes (2 / 2x2) com Alt+drag para reorganizar
- Autenticação por senha, chave privada (.pem, .key, ed25519) ou agente SSH
- ProxyJump (host de salto reaproveitado por SSH e VNC)
- Verificação de host key (known_hosts, TOFU) e reconexão automática
- Histórico de comandos

**Túneis SSH**
- Local (-L), remoto (-R) e dinâmico/SOCKS5 (-D), presos à sessão

**SFTP**
- Browser de arquivos integrado por sessão
- Upload, download e exclusão de arquivos
- Navegação por pastas com breadcrumb

**RDP**
- Dispara o cliente nativo do SO (mstsc no Windows, xfreerdp no Linux/macOS) a partir de um .rdp gerado

**VNC**
- Viewer noVNC embutido via bridge WebSocket
- Conexão direta ou tunelada por uma sessão SSH viva (alcança hosts só-loopback, ex.: wayvnc num bastion)

**Gerenciamento de hosts**
- Dashboard em grid ou tabela configurável (colunas ordenáveis, múltiplas views)
- Grupos e pastas para organizar servidores
- Cores e ícones personalizados por servidor
- Busca rápida por nome, host ou usuário

**Cofre e Snippets**
- Cofre local de credenciais e chaves, protegido pelo safeStorage do SO
- Snippets de comandos reutilizáveis

**Logs e auditoria**
- Registro de todos os eventos de conexão (connect, disconnect, erros)
- Transcript append-only de cada sessão SSH (sobrevive a clear e a apps full-screen)
- Visualização de sessões históricas com busca
- Exportação de logs em CSV
- Integração com servidores de logging externos:
  - Graylog (GELF HTTP)
  - Grafana Loki
  - Elasticsearch
  - Syslog (UDP RFC5424)

**Export / Import**
- Exporta servidores, grupos e credenciais para XML (segredos selados com scrypt + AES-256-GCM)
- Importa de arquivo XML (merge, sem sobrescrever dados existentes)
- Importa do mRemoteNG

**Sincronização em nuvem (opcional)**
- Replica servidores/grupos/credenciais entre dispositivos via Supabase
- Segredos selados fim-a-fim: o servidor só vê ciphertext
- Last-write-wins; não propaga deleções (nunca remove dado)

**Atualização automática**
- Detecta novas versões automaticamente via GitHub Releases
- Download em background
- Instalação silenciosa ao fechar o app (sem janela de instalador)

**Interface**
- Temas dark e light
- Seletor de fonte para o terminal (JetBrains Mono, Cascadia Code, Fira Code, etc.)
- Custom titlebar (frameless)
- Dados salvos localmente em `~/.corpssh/`

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework desktop | Electron 42 |
| UI | React 18 + TypeScript |
| Build | electron-vite + Vite 5 |
| Terminal | xterm.js |
| SSH / SFTP | ssh2 |
| VNC | ws + @novnc/novnc |
| RDP | cliente nativo do SO (mstsc / xfreerdp) |
| Criptografia | scrypt + AES-256-GCM (Node crypto) + safeStorage |
| Cloud sync | @supabase/supabase-js |
| Estilos | Tailwind CSS |
| Estado | Zustand |
| Auto-update | electron-updater |

---

## Desenvolvimento

```bash
# Clonar
git clone https://github.com/alcirhagge/corpssh.git
cd corpssh

# Instalar dependências
npm install

# Rodar em modo dev (hot reload)
npm run dev

# Build de produção
npm run build

# Gerar instalador
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

---

## Release

Novas versões são publicadas automaticamente via GitHub Actions ao criar uma tag:

```bash
# Atualiza a versão no package.json, depois:
git add package.json
git commit -m "bump to vX.X.X"
git tag vX.X.X
git push origin main vX.X.X
# GitHub Actions builda para Windows, macOS e Linux e publica a release
```

---

## Estrutura do projeto

```
src/
├── main/                 # Processo principal Electron (Node.js) — tudo que toca rede/disco/credenciais
│   ├── index.ts          # Entry point, janela frameless, deep link corpssh://, auto-updater
│   ├── ipcHandlers.ts    # Handlers IPC (fronteira de confiança)
│   ├── sshManager.ts     # Conexões SSH/SFTP/shell/exec
│   ├── portForward.ts    # Túneis -L / -R / -D
│   ├── rdpManager.ts     # Gera .rdp e dispara o cliente RDP do SO
│   ├── vncManager.ts     # Bridge WebSocket noVNC <-> VNC (direta ou via SSH)
│   ├── knownHosts.ts     # Verificação de host key
│   ├── commandHistory.ts # Histórico de comandos
│   ├── crypto.ts         # Selagem portável scrypt + AES-256-GCM
│   ├── cloudClient.ts    # Login Supabase
│   ├── cloudSync.ts      # Sync last-write-wins com segredos selados
│   ├── logger.ts         # Log de eventos
│   ├── sessionLogger.ts  # Transcript append-only das sessões
│   ├── remoteLogger.ts   # Envio para Graylog/Loki/Syslog/ES
│   ├── xmlManager.ts     # Export/Import XML
│   ├── mremoteng.ts      # Import do mRemoteNG
│   └── store.ts          # Persistência local (JSON + safeStorage)
├── preload/
│   └── index.ts          # Bridge IPC segura (contextBridge -> window.api)
└── renderer/             # App React
    └── src/
        ├── components/   # Por feature: Dashboard, Terminal, SFTP, Tunnels, Vault,
        │                 # Snippets, Cloud, Logs, Export, Dialogs, Layout
        ├── store/        # Zustand global store
        ├── styles/       # CSS variables (dark/light themes)
        └── types.ts      # TypeScript types
```

---

## Dados locais

O app salva todos os dados em `~/.corpssh/`:

```
~/.corpssh/
├── data.json         # Servidores, grupos, chaves, configurações
├── events.json       # Log de eventos de conexão
├── known_hosts.json  # Host keys aceitas (TOFU)
├── command_history.json
└── sessions/
    ├── {id}.log      # Log completo de cada sessão SSH
    └── {id}.json     # Metadados da sessão
```

---

## Licença

MIT — veja [LICENSE](./LICENSE)
