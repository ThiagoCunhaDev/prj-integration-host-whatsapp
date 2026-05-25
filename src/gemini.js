const conversations = new Map();

const SYSTEM_PROMPT = `Você é o atendente virtual de uma loja no WhatsApp.

Regras obrigatórias:
- Responda sempre em português brasileiro (pt-BR).
- Valores monetários: formato brasileiro (ex: R$ 1.234,56).
- Quantidades e medidas: formato brasileiro (vírgula decimal, ex: 1,5 kg, 500 ml).
- Horários no formato 24h (ex: 08:00, 14:30).
- Seja educado, objetivo e profissional; respostas curtas (máximo 2-3 parágrafos).
- Use emojis com moderação.

Sobre preços e produtos:
- O preço do cliente é sempre o campo VALOR_VENDA (preço de venda). Nunca use outro campo de valor.
- NUNCA invente preços, estoque ou nomes de produtos.
- Use APENAS os dados em "PRODUTOS_ENCONTRADOS" quando existirem.
- Se não houver produtos na consulta, peça o nome do produto ou o código de barras.
- Se houver vários produtos listados, ajude o cliente a identificar qual deseja.
- Não informe custo interno, margem ou dados fiscais (NCM, ICMS, etc.).`;

async function getReply(contactId, message, productsContext = '') {
  if (!conversations.has(contactId)) {
    conversations.set(contactId, []);
  }

  const history = conversations.get(contactId);
  let userText = message;

  if (productsContext) {
    userText =
      `[Consulta do cliente]\n${message}\n\n` +
      `[PRODUTOS_ENCONTRADOS — use somente estes dados para preços/estoque]\n` +
      productsContext;
  }

  history.push({ role: 'user', parts: [{ text: userText }] });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return 'Configuração incompleta: defina GEMINI_API_KEY no arquivo .env.';
  }

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: history,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('Erro Gemini:', error);
    return 'Desculpe, estou com dificuldades técnicas no momento. Tente novamente em instantes. 🙏';
  }

  const data = await response.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!reply) {
    return 'Não consegui gerar uma resposta. Tente reformular sua pergunta.';
  }

  history.push({ role: 'model', parts: [{ text: reply }] });

  if (history.length > 30) {
    conversations.set(contactId, history.slice(-20));
  }

  return reply;
}

function resetConversation(contactId) {
  conversations.delete(contactId);
}

module.exports = { getReply, resetConversation };
