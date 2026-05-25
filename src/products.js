const { query } = require('./database');
const { formatMoney, formatQuantity, normalizeText } = require('./format');
const { expandSearchTerms } = require('./synonyms');

const MAX_RESULTS = 8;
const BROAD_FETCH_LIMIT = 40;

const STOPWORDS = new Set([
  'a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'um', 'uma', 'uns', 'umas', 'por', 'para', 'com', 'sem', 'ao', 'aos', 'as', 'os',
  'que', 'qual', 'quais', 'quanto', 'quanta', 'quantos', 'quantas',
  'preco', 'preço', 'valor', 'custa', 'custo', 'tem', 'ter', 'esta', 'está',
  'oi', 'ola', 'olá', 'bom', 'dia', 'tarde', 'noite', 'porfavor', 'favor',
  'produto', 'produtos', 'item', 'loja', 'vende', 'vendem', 'quero', 'saber',
  'ver', 'verificar', 'consultar', 'buscar', 'achar', 'encontrar', 'disponivel',
  'disponível', 'estoque', 'codigo', 'código', 'cod', 'barra', 'barras',
]);

const PRODUCT_FIELDS = `
  ID_PRODUTO,
  PRODUTO,
  DESCRICAO_COMPRA,
  BARRAS,
  GTIN,
  REFERENCIA,
  ESTOQUE,
  VALOR_VENDA,
  UNIDADE_COMECIAL,
  STATUS
`;

function extractBarcode(message) {
  const digits = message.replace(/\D/g, '');
  if (digits.length >= 8 && digits.length <= 14) {
    if (/^\d+$/.test(message.trim()) || digits.length === message.replace(/\s/g, '').length) {
      return digits;
    }
  }
  const inline = message.match(/\b(\d{8,14})\b/);
  return inline ? inline[1] : null;
}

function extractSearchTerms(message) {
  const barcode = extractBarcode(message);
  if (barcode) return { barcode, terms: [] };

  const normalized = normalizeText(message);
  const terms = normalized
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  const unique = [...new Set(terms)];
  return { barcode: null, terms: unique };
}

function getProductText(row) {
  return normalizeText(`${row.produto || ''} ${row.descricao_compra || ''}`);
}

function buildVariantCondition(variant) {
  return '(PRODUTO CONTAINING ? OR DESCRICAO_COMPRA CONTAINING ?)';
}

/** Um grupo = OR entre sinônimos; vários grupos = AND entre conceitos */
function buildWhereFromGroups(termGroups, joiner) {
  const blocks = [];
  const params = [];

  for (const variants of termGroups) {
    const parts = [];
    for (const variant of variants) {
      parts.push(buildVariantCondition(variant));
      params.push(variant, variant);
    }
    if (parts.length > 0) {
      blocks.push(`(${parts.join(' OR ')})`);
    }
  }

  if (blocks.length === 0) return { clause: '', params: [] };
  return { clause: blocks.join(` ${joiner} `), params };
}

async function runProductQuery(whereClause, params, limit = MAX_RESULTS) {
  if (!whereClause) return [];

  const sql = `
    SELECT FIRST ${limit} ${PRODUCT_FIELDS}
    FROM PRODUTOS
    WHERE ${whereClause}
    ORDER BY PRODUTO
  `;

  return query(sql, params);
}

function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const id = row.id_produto;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function scoreProduct(row, termGroups) {
  const text = getProductText(row);
  let score = 0;

  for (const variants of termGroups) {
    let best = 0;
    for (const variant of variants) {
      if (!text.includes(variant)) continue;
      if (text === variant) best = Math.max(best, 30);
      else if (` ${text} `.includes(` ${variant} `)) best = Math.max(best, 20);
      else best = Math.max(best, 10);
    }
    score += best;
  }

  return score;
}

function rankProducts(rows, termGroups) {
  return [...rows]
    .sort((a, b) => scoreProduct(b, termGroups) - scoreProduct(a, termGroups))
    .slice(0, MAX_RESULTS);
}

/** Busca estrita: cada palavra (ou sinônimo) deve aparecer */
async function searchStrict(termGroups) {
  const { clause, params } = buildWhereFromGroups(termGroups, 'AND');
  const rows = await runProductQuery(clause, params);
  return rankProducts(dedupeById(rows), termGroups);
}

/** Busca ampla: qualquer sinônimo de qualquer termo */
async function searchBroad(termGroups) {
  const allVariants = [...new Set(termGroups.flat())];
  if (allVariants.length === 0) return [];

  const { clause, params } = buildWhereFromGroups([allVariants], 'OR');
  const rows = await runProductQuery(clause, params, BROAD_FETCH_LIMIT);
  return rankProducts(dedupeById(rows), termGroups);
}

/** Busca por um único conceito (cada grupo separado), útil quando AND falha */
async function searchBySingleGroups(termGroups) {
  const merged = [];

  for (const variants of termGroups) {
    const { clause, params } = buildWhereFromGroups([variants], 'OR');
    const rows = await runProductQuery(clause, params, MAX_RESULTS);
    merged.push(...rows);
  }

  return rankProducts(dedupeById(merged), termGroups);
}

async function searchByBarcode(barcode) {
  const sql = `
    SELECT FIRST ${MAX_RESULTS} ${PRODUCT_FIELDS}
    FROM PRODUTOS
    WHERE BARRAS = ?
       OR GTIN = ?
       OR BARRAS_CX = ?
       OR REFERENCIA = ?
       OR CAST(ID_PRODUTO AS VARCHAR(20)) = ?
    ORDER BY PRODUTO
  `;
  const param = barcode.trim();
  return query(sql, [param, param, param, param, param]);
}

async function searchByTerms(terms) {
  if (terms.length === 0) return [];

  const termGroups = expandSearchTerms(terms);

  let results = await searchStrict(termGroups);
  if (results.length > 0) return results;

  results = await searchBySingleGroups(termGroups);
  if (results.length > 0) return results;

  results = await searchBroad(termGroups);
  return results;
}

async function searchProducts(message) {
  const { barcode, terms } = extractSearchTerms(message);

  if (barcode) {
    const byBarcode = await searchByBarcode(barcode);
    if (byBarcode.length > 0) return byBarcode;
  }

  if (terms.length > 0) {
    return searchByTerms(terms);
  }

  return [];
}

function getDisplayName(row) {
  return (row.descricao_compra || row.produto || 'Produto').trim();
}

function isInactive(row) {
  const status = (row.status || '').toUpperCase();
  return ['INATIVO', 'INATIVA', 'BLOQUEADO', 'BLOQUEADA', 'CANCELADO'].includes(status);
}

function formatProductBlock(row, index) {
  const name = getDisplayName(row);
  const lines = [];

  if (index != null) {
    lines.push(`*${index}. ${name}*`);
  } else {
    lines.push(`*${name}*`);
  }

  if (row.referencia) lines.push(`Referência: ${row.referencia}`);
  if (row.barras || row.gtin) {
    lines.push(`Código de barras: ${row.barras || row.gtin}`);
  }

  lines.push(`Preço: ${formatMoney(row.valor_venda)}`);

  const estoque = Number(row.estoque);
  if (!Number.isNaN(estoque)) {
    lines.push(`Estoque: ${formatQuantity(estoque, row.unidade_comecial)}`);
  }

  if (isInactive(row)) {
    lines.push('_Produto com status inativo no cadastro._');
  }

  return lines.join('\n');
}

function formatProductsReply(products) {
  if (products.length === 0) {
    return null;
  }

  if (products.length === 1) {
    return (
      'Encontrei este produto:\n\n' +
      formatProductBlock(products[0]) +
      '\n\nPosso ajudar com outro item?'
    );
  }

  const header =
    products.length >= MAX_RESULTS
      ? `Encontrei vários produtos (mostrando ${MAX_RESULTS}). Informe o nome com mais detalhes ou o código de barras:\n\n`
      : `Encontrei ${products.length} produtos:\n\n`;

  const body = products
    .map((row, i) => formatProductBlock(row, i + 1))
    .join('\n\n');

  return header + body + '\n\nQual deles você procura?';
}

function formatProductsContext(products) {
  if (products.length === 0) return '';

  return products
    .map((row) => {
      const name = getDisplayName(row);
      const parts = [
        `- ${name}`,
        `  Preço: ${formatMoney(row.valor_venda)}`,
      ];
      if (row.barras) parts.push(`  Barras: ${row.barras}`);
      if (row.referencia) parts.push(`  Ref: ${row.referencia}`);
      const estoque = Number(row.estoque);
      if (!Number.isNaN(estoque)) {
        parts.push(`  Estoque: ${formatQuantity(estoque, row.unidade_comecial)}`);
      }
      return parts.join('\n');
    })
    .join('\n');
}

module.exports = {
  searchProducts,
  formatProductsReply,
  formatProductsContext,
  extractSearchTerms,
};
