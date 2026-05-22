require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { getReply, resetConversation } = require('./gemini');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('📱 Escaneie o QR Code abaixo com seu WhatsApp:');
  console.log('');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('');
  console.log('✅ Bot conectado e pronto para atender!');
  console.log('📩 Aguardando mensagens...');
  console.log('');
});

client.on('authenticated', () => {
  console.log('🔐 Autenticado com sucesso!');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação:', msg);
});

client.on('message', async (msg) => {
  // Ignora mensagens de grupo, status e do próprio bot
  if (msg.from.includes('@g.us')) return;
  if (msg.from === 'status@broadcast') return;
  if (msg.fromMe) return;

  const contact = await msg.getContact();
  const name = contact.pushname || 'Cliente';

  console.log(`💬 ${name} (${msg.from}): ${msg.body}`);

  // Comando para resetar conversa
  if (msg.body.toLowerCase() === '/reset') {
    resetConversation(msg.from);
    await msg.reply('🔄 Conversa reiniciada! Como posso ajudar?');
    return;
  }

  // Ignora mensagens vazias (mídia sem legenda, etc.)
  if (!msg.body || msg.body.trim() === '') return;

  try {
    const reply = await getReply(msg.from, msg.body);
    await msg.reply(reply);
    console.log(`🤖 Resposta enviada para ${name}`);
  } catch (error) {
    console.error('Erro ao responder:', error.message);
    await msg.reply('Desculpe, ocorreu um erro. Tente novamente em instantes. 🙏');
  }
});

client.on('disconnected', (reason) => {
  console.log('🔌 Bot desconectado:', reason);
});

console.log('🚀 Iniciando bot do WhatsApp...');
client.initialize();
