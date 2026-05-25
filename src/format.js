function formatMoney(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatQuantity(value, unit) {
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  const formatted = n.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
  const u = (unit || '').trim();
  return u ? `${formatted} ${u}` : formatted;
}

function normalizeText(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

module.exports = { formatMoney, formatQuantity, normalizeText };
