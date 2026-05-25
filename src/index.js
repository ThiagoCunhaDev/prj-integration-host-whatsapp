const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { findConexaoIni } = require('./config');
const { testConnection } = require('./database');
const { handleCustomerMessage } = require('./handler');
const { resetConversation } = require('./gemini');

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
  if (msg.from.includes('@g.us')) return;
  if (msg.from === 'status@broadcast') return;
  if (msg.fromMe) return;

  const contact = await msg.getContact();
  const name = contact.pushname || 'Cliente';

  console.log(`💬 ${name} (${msg.from}): ${msg.body}`);

  if (msg.body.toLowerCase() === '/reset') {
    resetConversation(msg.from);
    await msg.reply('🔄 Conversa reiniciada! Como posso ajudar?');
    return;
  }

  if (!msg.body || msg.body.trim() === '') return;

  try {
    const reply = await handleCustomerMessage(msg.from, msg.body);
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

async function startup() {
  console.log('🚀 Iniciando bot do WhatsApp (atendente virtual da loja)...');

  const iniPath = findConexaoIni();
  if (!iniPath) {
    console.warn('⚠️  Conexao.ini não encontrado — consulta de preços indisponível.');
  } else {
    console.log(`📄 Conexao.ini: ${iniPath}`);
    try {
      const db = await testConnection();
      console.log(`🗄️  Firebird OK — ${db.host}:${db.port} → ${db.database}`);
    } catch (error) {
      console.error('❌ Falha ao conectar no Firebird:', error.message);
      console.error('   O bot iniciará, mas consultas de produto podem falhar.');
    }
  }

  client.initialize();
}

startup();
