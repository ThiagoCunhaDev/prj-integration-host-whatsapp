# WhatsApp Bot — Atendente Virtual da Loja

Bot de atendimento ao cliente via WhatsApp com consulta de preços em tempo real no banco Firebird (tabela `PRODUTOS`) e IA generativa (Google Gemini) para conversas gerais.

---

## Visao geral do projeto

O bot atua como atendente virtual de uma loja de suplementos. O cliente envia mensagem pelo WhatsApp e o bot:

1. Identifica se a mensagem contém uma busca por produto (nome, trecho do nome ou codigo de barras).
2. Consulta a tabela `PRODUTOS` no Firebird via `Conexao.ini`.
3. Retorna nome, preco (`VALOR_VENDA`) e estoque formatados em pt-BR (R$, virgula decimal).
4. Para mensagens genericas (saudacao, duvida geral), encaminha para a IA Gemini, que nunca inventa precos.

---

## Requisitos do ambiente

| Item | Versao/Detalhe |
|------|----------------|
| Node.js | 18+ (testado com 22.22.0) |
| Firebird | Servidor ativo com acesso a porta 3050 (ou a porta do `Conexao.ini`) |
| Banco `.FDB` | Caminho definido em `RETAGUARDA` no `Conexao.ini` |
| Chave Gemini | Gratuita em https://aistudio.google.com/apikey |
| Sistema | Windows 10+ (testado) / Linux / macOS |

---

## Estrutura de arquivos

```
prj-integration-host-whatsapp/
├── Conexao.ini              # Configuracao do banco Firebird (IP, porta, path .FDB)
├── .env                     # Chave da API Gemini + credenciais Firebird (opcional)
├── .gitignore               # Ignora node_modules, .env, .wwebjs_auth, logs, etc.
├── sinonimos.json.example   # Modelo de sinonimos personalizaveis
├── sinonimos.json           # (opcional) Sinonimos extras para busca aproximada
├── package.json
├── package-lock.json
├── fbclient.dll             # DLL do Firebird (necessario no Windows se nao instalado globalmente)
├── src/
│   ├── index.js             # Entry point: WhatsApp + startup
│   ├── handler.js           # Orquestrador: decide se busca produto ou chama IA
│   ├── products.js          # Busca na tabela PRODUTOS (Firebird) + formatacao
│   ├── synonyms.js          # Expansao de sinonimos, typos e busca aproximada
│   ├── database.js          # Conexao e queries ao Firebird (node-firebird)
│   ├── config.js            # Leitura do Conexao.ini e resolucao de caminhos
│   ├── format.js            # Formatacao pt-BR (moeda, quantidade, normalizacao de texto)
│   └── gemini.js            # Integracao com Google Gemini (prompt + historico)
└── README.md                # Este arquivo
```

---

## Instalacao e execucao

```bash
cd "c:\suplementos host\bot\prj-integration-host-whatsapp"
npm install
npm start
```

Na primeira execucao, o Puppeteer baixa o Chromium automaticamente (~150 MB).

---

## Configuracao

### Conexao.ini

Deve estar na **raiz do projeto** (mesma pasta do `package.json`). O bot le a secao `[CONEXAO]`:

```ini
[CONEXAO]
IP_SERVIDOR=127.0.0.1
PORTA=3050
RETAGUARDA=c:\tsd\host\HOST.FDB
```

- `IP_SERVIDOR` — endereco do servidor Firebird.
- `PORTA` — porta TCP do Firebird (padrao 3050).
- `RETAGUARDA` — caminho absoluto do arquivo `.FDB` no servidor.
- Linhas que comecam com `*` sao ignoradas (servem como caminhos alternativos comentados).
- O parser esta em `src/config.js` (funcao `parseIniSection`).

### .env

```
GEMINI_API_KEY=sua-chave-aqui
FIREBIRD_USER=SYSDBA
FIREBIRD_PASSWORD=masterkey
```

- `GEMINI_API_KEY` — obrigatorio para respostas da IA.
- `FIREBIRD_USER` / `FIREBIRD_PASSWORD` — opcionais; padrao SYSDBA/masterkey.
- O `.env` esta no `.gitignore` e **nunca deve ser commitado**.

### sinonimos.json (opcional)

Copie `sinonimos.json.example` para `sinonimos.json` e adicione termos especificos da loja:

```json
{
  "grupos": [
    ["max titanium", "maxtitanium", "max"],
    ["integral medica", "integralmedica", "darkness"]
  ],
  "mapeamentos": {
    "vit c": ["vitamina c", "ascorbico", "acido ascorbico"],
    "d3": ["vitamina d", "vitamina d3", "colecalciferol"]
  }
}
```

O bot carrega esse arquivo uma vez na subida. Para recarregar, reinicie o processo.

---

## Como cada modulo funciona

### src/index.js — Entry point

- Carrega `.env` via `dotenv`.
- Cria o client `whatsapp-web.js` com `LocalAuth` (sessao persistida em `.wwebjs_auth/`).
- Na funcao `startup()`: verifica `Conexao.ini`, testa conexao Firebird, inicializa o WhatsApp.
- Escuta evento `message` e delega para `handler.js`.
- Ignora mensagens de grupo (`@g.us`), status broadcast e mensagens proprias (`fromMe`).
- Comando `/reset` limpa o historico de conversa da IA para aquele contato.

### src/handler.js — Orquestrador

- Recebe `contactId` e `message`.
- Usa `extractSearchTerms()` para detectar se ha intencao de busca (codigo de barras ou palavras-chave).
- Se **tem intencao de busca**: chama `searchProducts()` no Firebird.
  - Se encontrou produtos: monta resposta formatada diretamente (`formatProductsReply`).
  - Se nao encontrou: passa contexto vazio para o Gemini, que pede ao cliente mais detalhes.
- Se **nao tem intencao de busca** (ex.: "oi", "qual o horario?"): envia direto para o Gemini.

### src/products.js — Busca de produtos

**Campos consultados na tabela `PRODUTOS`:**
`ID_PRODUTO`, `PRODUTO`, `DESCRICAO_COMPRA`, `BARRAS`, `GTIN`, `REFERENCIA`, `ESTOQUE`, `VALOR_VENDA`, `UNIDADE_COMECIAL`, `STATUS`.

**O preco exibido ao cliente e sempre `VALOR_VENDA`.** Nenhum outro campo de valor (custo, atacado, margem, etc.) e exposto.

**Busca por codigo de barras:**
- Detecta sequencias de 8 a 14 digitos.
- Consulta `BARRAS`, `GTIN`, `BARRAS_CX`, `REFERENCIA` e `ID_PRODUTO`.

**Busca por nome (texto):**
- Remove stopwords (artigos, preposicoes, palavras como "preco", "quanto custa", etc.) — lista completa em `STOPWORDS`.
- Expande cada termo com sinonimos via `synonyms.js`.
- Usa `CONTAINING` do Firebird (case-insensitive, sem problemas com charset).
- Estrategia em 3 niveis com fallback:
  1. **Estrita (AND):** todos os termos (com sinonimos) devem aparecer.
  2. **Por conceito:** busca cada grupo de sinonimos separadamente e une resultados.
  3. **Ampla (OR):** qualquer sinonimo de qualquer termo, ranqueado por relevancia.
- Ranking: pontuacao por match exato (30), palavra inteira (20) ou substring (10).
- Limite: ate 8 resultados exibidos (`MAX_RESULTS`), busca ampla traz ate 40 (`BROAD_FETCH_LIMIT`).

**Formatacao da resposta:**
- 1 produto: ficha completa.
- 2 a 8: lista numerada.
- 8+: avisa que ha mais e pede nome mais especifico.
- Produtos inativos sao sinalizados (`STATUS` = INATIVO/BLOQUEADO/CANCELADO).

### src/synonyms.js — Sinonimos e correcao de typos

- `DEFAULT_GROUPS`: grupos de sinonimos embutidos (whey/wpc/wpi, creatina/creatine, etc.).
- `DEFAULT_TYPOS`: mapeamento de erros de digitacao comuns (protina -> proteina, whei -> whey).
- `expandTerm(term)`: retorna array de ate 8 variantes para um termo.
- `expandSearchTerms(terms)`: retorna array de arrays (um grupo OR por conceito).
- Carrega `sinonimos.json` da raiz do projeto se existir (formato descrito acima).
- Match por prefixo: "prot" encontra "proteina" e vice-versa (termos com 3+ caracteres).

### src/database.js — Firebird

- Usa `node-firebird` (pure JS, sem dependencia nativa).
- Conexao singleton com lazy attach (`getDb()`).
- `query(sql, params)`: retorna Promise com array de objetos (chaves lowercase).
- `testConnection()`: executa `SELECT 1 FROM RDB$DATABASE` para validar acesso.
- `close()`: desconecta (detach).

**Observacao importante:** durante os testes, `COALESCE(campo, '')` causava erro "Malformed string" em algumas colunas do Firebird. A solucao foi usar `CONTAINING` em vez de `LIKE UPPER(COALESCE(...))`.

### src/config.js — Conexao.ini

- `getAppDir()`: retorna pasta do executavel (quando empacotado com `pkg`) ou pasta do projeto.
- `findConexaoIni()`: procura `Conexao.ini` case-insensitive na pasta do bot.
- `loadConexao()`: le e retorna `{ host, port, database, user, password }`.

### src/format.js — Formatacao pt-BR

- `formatMoney(value)`: `R$ 1.234,56` via `toLocaleString('pt-BR')`.
- `formatQuantity(value, unit)`: `12,5 UN`.
- `normalizeText(text)`: remove acentos e converte para minusculo (para buscas).

### src/gemini.js — IA Generativa

- Modelo: `gemini-flash-latest` (gratuito, rapido).
- Prompt de sistema configura o bot como atendente de loja com regras:
  - Sempre pt-BR, formato brasileiro de moeda e medidas.
  - Nunca inventa precos; usa somente dados de `PRODUTOS_ENCONTRADOS`.
  - Nao expoe custo, margem ou dados fiscais.
- Historico por contato (`Map<contactId, messages[]>`), limitado a 30 mensagens (mantem as 20 mais recentes).
- Quando o handler passa contexto de produtos, o texto da mensagem e enriquecido com bloco `[PRODUTOS_ENCONTRADOS]`.

---

## Tabela PRODUTOS (Firebird)

A tabela consultada e `PRODUTOS`. Campos relevantes para o bot:

| Campo | Tipo | Uso no bot |
|-------|------|------------|
| `ID_PRODUTO` | INTEGER PK | Busca por codigo |
| `PRODUTO` | VARCHAR(120) | Nome para busca e exibicao |
| `DESCRICAO_COMPRA` | VARCHAR(120) | Nome alternativo (busca e exibicao) |
| `BARRAS` | VARCHAR(30) | Codigo de barras |
| `GTIN` | VARCHAR(14) | EAN/GTIN |
| `BARRAS_CX` | VARCHAR(30) | Codigo de barras da caixa |
| `REFERENCIA` | VARCHAR(100) | Referencia do fabricante |
| `ESTOQUE` | NUMERIC(18,4) | Estoque atual |
| `VALOR_VENDA` | NUMERIC(18,6) | **Preco exibido ao cliente** |
| `UNIDADE_COMECIAL` | VARCHAR(6) | Unidade (UN, KG, etc.) |
| `STATUS` | VARCHAR(30) | INATIVO/BLOQUEADO marca produto indisponivel |

Outros campos da tabela (NCM, ICMS, margem, custo, etc.) existem mas **nao sao expostos** ao cliente.

---

## Fluxo de uma mensagem

```
Cliente envia "whey protein"
        |
   index.js (evento 'message')
        |
   handler.js (extractSearchTerms -> {terms: ['whey', 'protein']})
        |
   products.js (expandSearchTerms -> [['whey','wpc','wpi',...], ['protein','proteina',...]])
        |
   searchStrict (AND entre grupos)
        |-- encontrou? -> formatProductsReply -> resposta direta
        |-- nao encontrou? -> searchBySingleGroups -> searchBroad -> ranking
        |
   Se nenhum produto: Gemini responde pedindo mais detalhes
```

---

## Problemas conhecidos e solucoes

| Problema | Causa | Solucao |
|----------|-------|---------|
| `authenticated` dispara mas `ready` nunca vem | Versao antiga do `whatsapp-web.js` | Usar `github:pedroslopez/whatsapp-web.js#main` (ja configurado) e limpar `.wwebjs_auth/` + `.wwebjs_cache/` |
| `Malformed string` no Firebird | Charset incompativel em `COALESCE(campo, '')` | Usar `CONTAINING` em vez de `LIKE UPPER(COALESCE(...))` (ja aplicado) |
| Bot nao responde mensagens | Mensagem enviada do mesmo WhatsApp conectado | Testar de **outro numero** (mensagens `fromMe` sao ignoradas) |
| Gemini retorna erro | `.env` sem `GEMINI_API_KEY` ou chave invalida | Verificar `.env` (nao `.env.log`) |
| QR Code nao aparece | Primeira execucao ou browser travado | Apagar `.wwebjs_auth/` e `.wwebjs_cache/`, reiniciar |
| Firebird connection refused | Servidor Firebird parado ou porta errada | Conferir `IP_SERVIDOR` e `PORTA` no `Conexao.ini` |

---

## Dependencias do projeto

```json
{
  "dotenv": "16.4.7",
  "node-firebird": "1.1.9",
  "qrcode-terminal": "0.12.0",
  "whatsapp-web.js": "github:pedroslopez/whatsapp-web.js#main"
}
```

- `whatsapp-web.js` — conecta ao WhatsApp Web via Puppeteer (Chromium headless).
- `node-firebird` — driver Firebird pure JS (sem dependencia nativa).
- `dotenv` — carrega `.env`.
- `qrcode-terminal` — exibe QR Code no terminal.

---

## Empacotamento como executavel (planejado, nao implementado)

A opcao discutida foi **pkg + Chromium ao lado + Inno Setup**:

1. `npx @yao-pkg/pkg . -t node22-win-x64 -o dist/whatsapp-bot.exe` — gera exe com Node embutido.
2. Copiar pasta Chromium de `node_modules/puppeteer-core/.local-chromium/` para `dist/chromium/`.
3. No codigo, usar `process.pkg` para detectar ambiente empacotado e apontar `executablePath` para `chromium/chrome.exe` (logica ja preparada em `config.js` via `getAppDir()`).
4. Inno Setup para criar instalador Windows.

**Nao foi implementado ainda.** O `src/config.js` ja tem `getAppDir()` que retorna `path.dirname(process.execPath)` quando empacotado com `pkg`.

**Importante:** a chave Gemini **nao deve ser embutida** no executavel (extraivel com ferramentas simples). Deve ficar no `.env` ao lado do exe ou em servidor intermediario.

---

## Proximos passos sugeridos

- [ ] Filtrar apenas produtos ativos na busca (`STATUS` diferente de INATIVO/BLOQUEADO).
- [ ] Personalizar o prompt da IA com nome e dados da loja (horario, endereco, etc.).
- [ ] Implementar empacotamento com `pkg` + script `npm run build:win`.
- [ ] Criar `setup.iss` (Inno Setup) para instalador Windows.
- [ ] Adicionar logging em arquivo (alem do console).
- [ ] Tratar reconexao automatica ao Firebird quando a conexao cai.
- [ ] Suporte a imagens de produtos (campo `FOTO` da tabela `PRODUTOS`).
- [ ] Ampliar dicionario de sinonimos com marcas e termos do cadastro real.
- [ ] Considerar API intermediaria para proteger a chave Gemini em distribuicao.

---

## Comandos do terminal para referencia rapida

```bash
# Instalar dependencias
npm install

# Iniciar o bot
npm start

# Testar conexao Firebird isoladamente
node -e "require('dotenv').config(); require('./src/database').testConnection().then(d=>console.log('OK',d)).catch(e=>console.error(e.message))"

# Testar busca de produtos
node -e "require('dotenv').config(); require('./src/products').searchProducts('whey').then(r=>console.log(r.length,'resultados')).catch(e=>console.error(e.message))"

# Testar expansao de sinonimos
node -e "console.log(require('./src/synonyms').expandSearchTerms(['whey']))"
```
