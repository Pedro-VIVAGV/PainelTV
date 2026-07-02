# Painel de Acompanhamento — VIVA

Painel para TV com visão rápida de tarefas atrasadas e eventos, alimentado pelo Notion
(`[DB] Tarefas Gerais` e `[DB] Eventos Gerais`). Feito para rodar como página estática
(ex: GitHub Pages), com atualização automática dos dados via GitHub Actions.

## Estrutura

```
index.html              painel (abas: Visão Geral / Atrasadas / Semana)
css/style.css            visual (baseado no escritorio-os-v2.html)
js/auth.js                portão de senha
js/app.js                 renderização e filtros
data/dados.json           snapshot consumido pelo painel (gerado automaticamente)
data/historico.json       contagens da última sincronização (usado para as setas de tendência)
scripts/sync-notion.mjs   script Node que busca as tarefas/eventos no Notion
.github/workflows/        Action que roda o script a cada 15 min e commita o resultado
```

## 1. Rodar localmente

Abra `index.html` direto no navegador (ou sirva a pasta com qualquer servidor
estático). A senha padrão é **`viva2026`** — troque em [`js/auth.js`](js/auth.js)
(instruções no topo do arquivo).

O painel já vem com dados de exemplo em `data/dados.json` para você visualizar o
layout antes de conectar ao Notion de verdade.

## 2. Conectar ao Notion (dados reais)

1. Crie uma integração interna em https://www.notion.so/my-integrations (só
   precisa de permissão de **leitura**).
2. Copie o "Internal Integration Secret" (começa com `secret_` ou `ntn_`).
3. Nas databases **[DB] Tarefas Gerais** e **[DB] Eventos Gerais**, abra o menu
   "..." → **Conectar a** → selecione a integração criada.
4. Rode localmente para testar (a sintaxe muda conforme o terminal):

   **PowerShell (padrão no Windows):**
   ```powershell
   $env:NOTION_TOKEN = "seu_token_aqui"
   node scripts/sync-notion.mjs
   ```

   **Git Bash / macOS / Linux:**
   ```bash
   NOTION_TOKEN=seu_token_aqui node scripts/sync-notion.mjs
   ```
   (rodar `VAR=valor comando` tudo na mesma linha só funciona em bash — no
   PowerShell isso dá erro de sintaxe, que é provavelmente o erro que você viu.)

   Isso atualiza `data/dados.json` (e `data/historico.json`, usado para as
   setas de tendência) com os dados reais do Notion.

## 3. Publicar no GitHub Pages com atualização automática

1. Crie um repositório no GitHub e suba esta pasta.
2. Em **Settings → Secrets and variables → Actions**, adicione o secret
   `NOTION_TOKEN` com o token da integração.
3. Em **Settings → Pages**, ative o Pages a partir da branch `main` (pasta raiz).
4. O workflow `.github/workflows/sync-notion.yml` já roda a cada 15 minutos e
   também pode ser disparado manualmente pela aba **Actions**.

### Atualização automática confiável (recomendado)

O agendamento nativo do GitHub (`schedule`) é "melhor esforço": pode atrasar
muito ou simplesmente não disparar, principalmente em repositórios novos. Para
garantir que a sincronização rode pontualmente a cada 15 minutos, use um serviço
de cron externo gratuito para disparar o workflow via `repository_dispatch`:

1. Gere um **fine-grained Personal Access Token** em
   https://github.com/settings/tokens?type=beta com acesso **apenas a este
   repositório** e permissão de leitura/escrita em **Contents** (ou **Actions**).
2. Crie uma conta grátis em https://cron-job.org (não pede cartão).
3. Crie um novo cronjob com:
   - **URL:** `https://api.github.com/repos/Pedro-VIVAGV/PainelTV/dispatches`
   - **Método/Request:** `POST`
   - **Intervalo:** a cada 15 minutos
   - **Headers:**
     - `Authorization: Bearer SEU_TOKEN_AQUI`
     - `Accept: application/vnd.github+json`
   - **Corpo (body):** `{"event_type":"sincronizar"}`
4. Salve. A cada disparo, o cron-job.org aciona o workflow, que sincroniza o
   Notion e publica os dados — de forma pontual e confiável.

> O agendamento nativo continua ativo como rede de segurança; os dois podem
> coexistir sem problema.

### Sobre a senha

A proteção em `js/auth.js` é um portão simples do lado do cliente — evita acesso
casual, mas não é segurança de verdade (o hash pode ser quebrado por quem tiver
acesso ao código-fonte da página, e `data/dados.json` fica acessível diretamente
pela URL mesmo sem digitar a senha). Se os dados forem sensíveis, prefira:
- repositório **privado** + GitHub Pages (disponível em planos pagos do GitHub), ou
- publicar atrás de um serviço com autenticação de verdade (Cloudflare Access,
  Vercel com proteção por senha, etc.).

## Personalização

- **Setores** exibidos: Marketing, Produção, Cotação, Atendimento, Comercial,
  Planejamento (Diretoria é ocultada — ajustável em `SETORES_CONHECIDOS` no
  script e `SETORES_OCULTOS` em `js/app.js`).
- **Pessoas** são carregadas diretamente dos usuários do workspace do Notion —
  todo mundo aparece, mesmo quem está sem tarefas pendentes no momento.
- Uma tarefa é considerada **atrasada** conforme a própria fórmula do Notion
  "Status Atividade" (quando o valor contém "ATRASADA") — assim o painel bate
  exatamente com o que o Notion mostra.
- As setas de tendência (▲/▼) comparam a contagem atual com a da última
  sincronização, guardada em `data/historico.json`.
