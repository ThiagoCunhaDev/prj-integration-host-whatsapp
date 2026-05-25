const fs = require('fs');
const path = require('path');
const { getAppDir } = require('./config');
const { normalizeText } = require('./format');

const MAX_VARIANTS_PER_TERM = 8;

/** Grupos padrão: qualquer termo do grupo expande para todos do grupo */
const DEFAULT_GROUPS = [
  ['whey', 'wpc', 'wpi', 'whey protein', 'proteina whey', 'isolado', 'concentrado'],
  ['proteina', 'protein', 'protena', 'albumina', 'caseina', 'whey', 'wpc'],
  ['creatina', 'creatine', 'monohidratada'],
  ['bcaa', 'amino', 'aminoacido', 'ramificados'],
  ['glutamina', 'glutamine', 'gluta'],
  ['colageno', 'collagen', 'colagen'],
  ['omega', 'oleo de peixe', 'fish oil', 'omega 3'],
  ['vitamina', 'vitamin', 'multi', 'multivitaminico', 'polivitaminico'],
  ['pre treino', 'pre-treino', 'preworkout', 'pre workout', 'estimulante'],
  ['termogenico', 'queimador', 'emagrecedor'],
  ['barra', 'barras', 'barra de proteina', 'snack'],
  ['maltodextrina', 'maltodextrina', 'carbo', 'carboidrato'],
  ['zma', 'zma', 'magnesio zinco'],
  ['cafeina', 'caffeine', 'cafeina'],
  ['coqueteleira', 'shakeira', 'garrafa'],
];

/** Correções de digitação comum (termo errado → termo de busca) */
const DEFAULT_TYPOS = {
  protina: 'proteina',
  protena: 'proteina',
  whei: 'whey',
  whe: 'whey',
  creatna: 'creatina',
  glutmina: 'glutamina',
  vitaminaa: 'vitamina',
  colgeno: 'colageno',
  suplemento: 'suplemento',
};

let cachedGroups = null;

function normalizeGroupTerms(group) {
  return [...new Set(group.map((t) => normalizeText(t).trim()).filter((t) => t.length >= 2))];
}

function loadSynonymGroups() {
  if (cachedGroups) return cachedGroups;

  const groups = DEFAULT_GROUPS.map(normalizeGroupTerms);

  const customPath = path.join(getAppDir(), 'sinonimos.json');
  if (fs.existsSync(customPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(customPath, 'utf8'));
      if (Array.isArray(raw.grupos)) {
        for (const g of raw.grupos) {
          if (Array.isArray(g) && g.length > 0) {
            groups.push(normalizeGroupTerms(g));
          }
        }
      }
      if (raw.mapeamentos && typeof raw.mapeamentos === 'object') {
        for (const [key, variants] of Object.entries(raw.mapeamentos)) {
          const merged = normalizeGroupTerms([key, ...(Array.isArray(variants) ? variants : [])]);
          if (merged.length > 0) groups.push(merged);
        }
      }
      console.log(`📖 Sinônimos extras carregados: ${customPath}`);
    } catch (error) {
      console.warn(`⚠️  Não foi possível ler sinonimos.json: ${error.message}`);
    }
  }

  cachedGroups = groups;
  return groups;
}

function termMatchesKeyword(term, keyword) {
  if (term === keyword) return true;
  if (term.length >= 3 && keyword.startsWith(term)) return true;
  if (keyword.length >= 3 && term.startsWith(keyword)) return true;
  return false;
}

/**
 * Expande um termo com sinônimos e correções de typo.
 * @returns {string[]}
 */
function applySynonymGroups(term, variants) {
  for (const group of loadSynonymGroups()) {
    const hit = group.some((keyword) => termMatchesKeyword(term, keyword));
    if (hit) {
      group.forEach((keyword) => variants.add(keyword));
    }
  }
}

function expandTerm(term) {
  const original = normalizeText(term);
  const variants = new Set([original]);

  let normalized = original;
  if (DEFAULT_TYPOS[normalized]) {
    normalized = DEFAULT_TYPOS[normalized];
    variants.add(normalized);
  }

  applySynonymGroups(original, variants);
  applySynonymGroups(normalized, variants);

  return [...variants].slice(0, MAX_VARIANTS_PER_TERM);
}

/**
 * Cada item do array é um grupo OR (sinônimos de um conceito).
 * @param {string[]} terms
 * @returns {string[][]}
 */
function expandSearchTerms(terms) {
  return terms.map((term) => expandTerm(term));
}

function clearSynonymCache() {
  cachedGroups = null;
}

module.exports = {
  expandTerm,
  expandSearchTerms,
  loadSynonymGroups,
  clearSynonymCache,
};
