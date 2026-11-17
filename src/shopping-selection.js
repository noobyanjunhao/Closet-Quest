export function initialShoppingCategory(ideas,savedCategory){
  // Reuse a preference only when it addresses a gap in the current outfit.
  return ideas.some(idea=>idea.category===savedCategory)?savedCategory:ideas[0]?.category||'Top';
}
