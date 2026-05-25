const { getReply } = require('./gemini');
const {
  searchProducts,
  formatProductsReply,
  formatProductsContext,
  extractSearchTerms,
} = require('./products');

async function handleCustomerMessage(contactId, message) {
  const { barcode, terms } = extractSearchTerms(message);
  const hasSearchIntent = barcode || terms.length > 0;

  if (!hasSearchIntent) {
    return getReply(contactId, message);
  }

  let products = [];
  try {
    products = await searchProducts(message);
  } catch (error) {
    console.error('Erro ao consultar produtos:', error.message);
    return (
      'Não consegui consultar o cadastro de produtos no momento. ' +
      'Verifique se o servidor Firebird está ativo e o Conexao.ini está correto.'
    );
  }

  const directReply = formatProductsReply(products);
  if (directReply) {
    return directReply;
  }

  const context = formatProductsContext(products);
  return getReply(
    contactId,
    message,
    context ||
      '(Nenhum produto encontrado para os termos informados. Peça nome ou código de barras.)'
  );
}

module.exports = { handleCustomerMessage };
