# CorpSSH

Cliente SSH corporativo desktop com interface moderna, suporte a múltiplas conexões simultâneas, browser SFTP, sistema de logs e integração com servidores de logging externos.

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
- Terminal interativo completo com suporte a cores, scroll e busca (Ctrl+F)
- Múltiplas conexões simultâneas em abas
- Autenticação por senha, chave privada (.pem, .key, ed25519) ou agente SSH
- Reconexão automática

**Gerenciamento de hosts**
- Dashboard visual com visualização em grid ou lista
- Grupos e pastas para organizar servidores
- Cores e ícones personalizados por servidor
- Busca rápida por nome, host ou usuário

**SFTP**
- Browser de arquivos integrado por sessão
- Upload, download e exclusão de arquivos
- Navegação por pastas com breadcrumb

**Logs e auditoria**
- Registro de todos os eventos de conexão (connect, disconnect, erros)
- Log completo de cada sessão SSH — output do terminal e comandos digitados
- Visualização de sessões históricas com busca
- Exportação de logs em CSV
- Integração com servidores de logging externos:
  - Graylog (GELF HTTP)
  - Grafana Loki
  - Elasticsearch
  - Syslog (UDP RFC5424)

**Export / Import**
- Exporta lista de servidores e grupos para XML
- Importa de arquivo XML (merge, sem sobrescrever dados existentes)

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
| Framework desktop | Electron 28 |
| UI | React 18 + TypeScript |
| Build | electron-vite + Vite 5 |
| Terminal | xterm.js |
| SSH | ssh2 |
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
├── main/               # Processo principal Electron (Node.js)
│   ├── index.ts        # Entry point, auto-updater
│   ├── ipcHandlers.ts  # Handlers IPC
│   ├── sshManager.ts   # Gerenciamento de conexões SSH
│   ├── logger.ts       # Log de eventos
│   ├── sessionLogger.ts# Log de sessões (terminal completo)
│   ├── remoteLogger.ts # Envio para Graylog/Loki/Syslog/ES
│   ├── xmlManager.ts   # Export/Import XML
│   └── store.ts        # Persistência local (JSON)
├── preload/
│   └── index.ts        # Bridge IPC segura (contextBridge)
└── renderer/           # App React
    └── src/
        ├── components/
        │   ├── Dashboard/   # HostDashboard, HostForm, HostCard
        │   ├── Terminal/    # TerminalPane, TabBar
        │   ├── SFTP/        # SFTPBrowser
        │   ├── Logs/        # LogsPanel (eventos + sessões + remote)
        │   ├── Export/      # ExportPanel
        │   ├── Dialogs/     # SettingsPanel
        │   └── Layout/      # TitleBar, Sidebar, StatusBar
        ├── store/           # Zustand global store
        ├── styles/          # CSS variables (dark/light themes)
        └── types.ts         # TypeScript types
```

---

## Dados locais

O app salva todos os dados em `~/.corpssh/`:

```
~/.corpssh/
├── data.json         # Servidores, grupos, chaves, configurações
├── events.json       # Log de eventos de conexão
└── sessions/
    ├── {id}.log      # Log completo de cada sessão SSH
    └── {id}.json     # Metadados da sessão
```

---

## Licença

MIT — veja [LICENSE](./LICENSE)
