# Post-mortem: sessões "notty zombie" em equipamentos de rede (VTY presa)

**Data:** 2026-06-29
**Produto:** CorpSSH (cliente SSH desktop)
**Componentes afetados:** `src/main/sshManager.ts`, `src/main/ipcHandlers.ts`
**Equipamentos no escopo:** MikroTik, Huawei VRP, OLTs (gear com poucas linhas VTY)

---

## 1. Resumo executivo

Sessões SSH para equipamentos de rede legados ficavam **penduradas como logins sem terminal ("notty")** mesmo depois do terminal ter sido fechado. Cada zumbi desses ocupa uma linha VTY. Como esses equipamentos têm poucas linhas (Huawei VRP ~5), os zumbis se acumulavam reconexão após reconexão até **esgotar as linhas e trancar o acesso de todo mundo**.

Foram identificados **dois cenários distintos** com causas e soluções diferentes:

| Cenário | Causa | Resolvível no app? |
|---|---|---|
| **Fechamento gracioso** (fecha app/aba, sai do shell, device derruba por exec-timeout) | App fechava só o canal de shell e deixava o transporte SSH vivo (keepalive segurava) | ✅ **Sim — corrigido** |
| **Queda abrupta** (power loss, queda de rede/VPN, sleep) | Nenhum lado consegue avisar o equipamento que a sessão morreu | ❌ **Não — é físico, mitigação é no equipamento** |

---

## 2. O erro (causa raiz)

Uma conexão SSH tem **duas camadas**:

1. **Transporte** — o túnel TCP autenticado (o "cano").
2. **Canal de shell** — o terminal interativo que roda dentro do cano.

O código fechava **apenas o canal** quando o terminal terminava (`stream.on('close')`), mas **mantinha o transporte aberto**. Pior: o `keepaliveInterval` ficava sondando o cano para mantê-lo vivo.

Do ponto de vista do equipamento, sobrava uma **sessão SSH autenticada, sem shell, sem tty** — um login "notty" — ocupando uma linha VTY. O equipamento só largaria essa linha pelo timeout dele próprio.

**Trecho problemático (antes):**

```ts
stream.on('close', () => {
  // ...
  emitClosed(sessionId)
  activeConnections.delete(sessionId)   // limpa só o registro local
  // o transporte (conn.client) continua VIVO -> notty zumbi no device
})
```

---

## 3. O que foi consertado

O fix derruba o **transporte inteiro** quando o canal de shell fecha, além de cobrir os caminhos de erro de canal e de falha ao abrir shell.

**Mudanças em `src/main/sshManager.ts`:**

- **`stream.on('close')`** agora chama `conn.client.end()` — derruba o transporte completo (dispara `emitClosed` + `notifySessionClosed` + teardown de port-forwards + `endJumps` + remoção do registro). Sem cano, o equipamento solta a linha VTY imediatamente.
- **`stream.on('error')`** novo — reset de canal no meio da sessão também derruba o transporte.
- **Falha ao abrir shell** (`client.shell` retorna erro) — derruba o transporte antes de propagar o erro, para não deixar um login sem shell.
- **Watchdog de órfão** (`SHELL_WATCHDOG_MS = 30000`) — uma conexão marcada como `'shell'` que autentica mas **nunca recebe um canal** (renderer travou, IPC perdido, corrida) é reapada em 30s.
- **Classificação de propósito** (`ConnectionPurpose = 'shell' | 'carrier'`) — conexões "carrier" (viewer VNC, túneis/forwards) que legitimamente nunca abrem shell ficam **isentas** do watchdog. Em `ipcHandlers.ts`, a conexão de framebuffer do VNC passou a ser criada como `'carrier'`.

### Evidência (teste em hardware real — MikroTik)

Reproduzido contra a MikroTik real, usando `/user active print` da própria MikroTik como oráculo:

```
1) shell aberto                       -> MikroTik mostra 2 sessões (probe + vítima)
2) fecha SÓ o canal (transporte vivo) -> ainda 2   🧟 ZUMBI reproduzido (comportamento ANTIGO)
3) derruba o transporte (o fix)       -> volta para 1  ✅ linha VTY liberada
```

O passo 2 é o bug; o passo 3 é exatamente o que o fix faz (`conn.client.end()`). **Confirmado em ferro real, não em teoria.**

---

## 4. O que NÃO dá para consertar no app

O fix cobre **fechamento gracioso** — qualquer caso em que o nosso lado ou o equipamento consegue mandar um *close* (FIN) pela conexão.

**Queda abrupta não tem solução no app.** Se a máquina/caminho intermediário morre de repente (perda de energia, queda de rede/VPN, sleep do PC), **ninguém envia close para o equipamento**. Ele continua achando que a sessão está viva e segura a linha VTY até o **timeout dele próprio**.

Isso é uma limitação física, não um bug: não dá para um software avisar um equipamento a partir de uma máquina que acabou de morrer.

### Evidência (teste de queda abrupta — MikroTik)

Simulamos "power loss" cortando o tráfego entre o salto (VPS) e a MikroTik **sem enviar FIN/RST** (blackhole da conexão da vítima), e medimos a sessão na MikroTik durante o apagão por outro caminho:

```
COM VÍTIMA            -> 1 sessão
DURANTE apagão  +3s   -> 1 zumbi preso
                +15s  -> 1 zumbi preso
                +30s  -> 1 zumbi preso
                +60s  -> 1 zumbi preso
                +120s -> 1 zumbi preso     <- preso o apagão INTEIRO
VPS volta             -> 0 zumbi (~7s)     <- só limpou quando o caminho voltou (RST)
```

A linha VTY ficou **presa durante todo o apagão** (120s+ medidos) e só foi liberada quando a conectividade voltou. Em apagão prolongado real, fica presa até o equipamento voltar **ou** até o keepalive do próprio equipamento reapar (não disparou em 2 min na MikroTik testada).

---

## 5. Mitigação correta para a queda abrupta (lado-equipamento)

Ponto-chave: **idle-timeout ≠ detecção de peer morto.**

- **idle-timeout / exec-timeout** é timer de **inatividade de terminal** ("sem digitar por X min, desloga"). Não resolve o zumbi abrupto porque:
  1. Sessão **notty não está numa linha de terminal** → o timer de vty nem enxerga ela.
  2. Costuma ser **longo** (10–30 min).
  3. **Não sonda** o outro lado — só conta silêncio local.

- **O que reapa de fato** é **keepalive que sonda o peer** na camada de transporte:
  - **TCP keepalive**, ou
  - **SSH server keepalive** (`ClientAliveInterval` + `ClientAliveCountMax`, ou equivalente do vendor).
  - Manda probe a cada N seg; sem resposta M vezes → derruba. Reapa em ~N×M seg. **Vem desligado por padrão** em OLT/switch.

**Pegadinha relevante:** o `keepaliveInterval` que o CorpSSH configura é o **cliente sondando o servidor** (detecta *servidor* morto). Quando quem morre é o **cliente/caminho**, só o **keepalive do lado do equipamento** resolve.

### Recomendação por equipamento

- **Huawei VRP / OLT (poucas VTY — crítico):** habilitar keepalive de SSH server **curto** (ex.: interval 30s, count 3 → morto reapado em ~90s). Manter o idle-timeout existente, mas saber que ele **não** é a ferramenta para este caso.
- **MikroTik:** tolerável (aguenta muitas sessões, não trava em ~5 como o VRP), mas ainda vaza. Avaliar keepalive/idle se o acúmulo incomodar.

---

## 6. Conclusão

- O caso **comum** (fechamento gracioso) está **resolvido** no app — provado em hardware real.
- O caso de **queda abrupta** **não é resolvível no app** por natureza física; a mitigação é **keepalive no equipamento**, não idle-timeout.
- A partir do deploy do fix, os zumbis do dia a dia (fechar app/aba/sair do shell) deixam de acontecer. Os zumbis de queda abrupta dependem de configuração de keepalive nos equipamentos.

---
