# WhatsApp Bot com IA (Gemini)

Bot de atendimento ao cliente via WhatsApp usando IA generativa gratuita (Google Gemini).

## Como funciona

1. O bot conecta ao WhatsApp Web via QR Code
2. Quando um cliente envia mensagem, a IA responde automaticamente
3. Mantém contexto da conversa por contato (IA regenerativa)
4. Ignora mensagens de grupo (responde apenas no privado)

## Requisitos

- Node.js 18+
- Chave gratuita do Google Gemini (https://aistudio.google.com/apikey)

## Instalação

```bash
npm install
```

## Configuração

Edite o `.env` com sua chave:

```
GEMINI_API_KEY=sua-chave-aqui
```

## Uso

```bash
npm start
```

Escaneie o QR Code que aparece no terminal com seu WhatsApp (Configurações > Dispositivos conectados > Conectar dispositivo).

## Comandos do cliente

- `/reset` — Reinicia a conversa com o bot

## Estrutura

```
├── src/
│   ├── index.js    # Conexão WhatsApp + lógica de mensagens
│   └── gemini.js   # Integração com IA (Gemini)
├── .env            # Chave da API
└── package.json
```
