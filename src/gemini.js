// Histórico de conversas por contato (IA regenerativa)
const conversations = new Map();

const SYSTEM_PROMPT = `Você é um assistente virtual de atendimento ao cliente via WhatsApp.

Regras:
- Responda sempre em português brasileiro.
- Seja educado, objetivo e profissional.
- Respostas curtas e diretas (máximo 2-3 parágrafos), adequadas para leitura no celular.
- Use emojis com moderação para tornar a conversa amigável.
- Mantenha o contexto da conversa para não repetir perguntas.
- Se não souber a resposta, diga que vai verificar e retornar.
- Valores monetários em R$ (formato brasileiro: R$ 1.234,56).
- Horários no formato 24h (ex: 08:00, 14:30).`;

async function getReply(contactId, message) {
  if (!conversations.has(contactId)) {
    conversations.set(contactId, []);
  }

  const history = conversations.get(contactId);
  history.push({ role: 'user', parts: [{ text: message }] });

  const apiKey = process.env.GEMINI_API_KEY;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

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
  const reply = data.candidates[0].content.parts[0].text;

  history.push({ role: 'model', parts: [{ text: reply }] });

  // Limita histórico por contato (últimas 30 mensagens)
  if (history.length > 30) {
    conversations.set(contactId, history.slice(-20));
  }

  return reply;
}

function resetConversation(contactId) {
  conversations.delete(contactId);
}

module.exports = { getReply, resetConversation };
