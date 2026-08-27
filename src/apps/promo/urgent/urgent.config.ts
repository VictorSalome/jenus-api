// Configurações do modo urgente
export const URGENT_CONFIG = {
  enabled: true,
  discountThreshold: 50,      // 50% de desconto
  bypassCooldown: true,       // Ignora tempo entre mensagens
  keywords: ['error price', 'bug', 'glitch', 'preço errado', 'cupom bugado'],
  minPriceDrop: 0.5          // Preço caiu pela metade
};

export const isUrgent = (message: string, originalPrice?: number, currentPrice?: number): boolean => {
  if (!URGENT_CONFIG.enabled) return false;
  
  // Verifica keywords
  const hasUrgentKeyword = URGENT_CONFIG.keywords.some(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (hasUrgentKeyword) return true;
  
  // Verifica queda de preço drástica
  if (originalPrice && currentPrice && originalPrice > 0) {
    const discount = ((originalPrice - currentPrice) / originalPrice) * 100;
    if (discount >= URGENT_CONFIG.discountThreshold) return true;
    if (currentPrice / originalPrice <= URGENT_CONFIG.minPriceDrop) return true;
  }
  
  return false;
};
