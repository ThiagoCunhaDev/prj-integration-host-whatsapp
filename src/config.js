const fs = require('fs');
const path = require('path');

function getAppDir() {
  if (typeof process.pkg !== 'undefined') {
    return path.dirname(process.execPath);
  }
  return path.join(__dirname, '..');
}

function findConexaoIni() {
  const dir = getAppDir();
  const names = ['Conexao.ini', 'conexao.ini', 'CONEXAO.INI'];
  for (const name of names) {
    const filePath = path.join(dir, name);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function parseIniSection(content, sectionName) {
  const section = {};
  const lines = content.split(/\r?\n/);
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      inSection = sectionMatch[1].toUpperCase() === sectionName.toUpperCase();
      continue;
    }

    if (!inSection) continue;
    if (line.startsWith('*')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim().toUpperCase();
    const value = line.slice(eq + 1).trim();
    section[key] = value;
  }

  return section;
}

function loadConexao() {
  const iniPath = findConexaoIni();
  if (!iniPath) {
    throw new Error(
      'Arquivo Conexao.ini não encontrado na pasta do bot. Coloque Conexao.ini junto ao programa.'
    );
  }

  const content = fs.readFileSync(iniPath, 'utf8');
  const conexao = parseIniSection(content, 'CONEXAO');

  const host = conexao.IP_SERVIDOR;
  const port = parseInt(conexao.PORTA, 10);
  const database = conexao.RETAGUARDA;

  if (!host || !port || !database) {
    throw new Error(
      'Conexao.ini incompleto: informe IP_SERVIDOR, PORTA e RETAGUARDA na seção [CONEXAO].'
    );
  }

  return {
    iniPath,
    host,
    port,
    database,
    user: process.env.FIREBIRD_USER || 'SYSDBA',
    password: process.env.FIREBIRD_PASSWORD || 'masterkey',
  };
}

module.exports = { getAppDir, findConexaoIni, loadConexao };
