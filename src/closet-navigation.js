// Scroll only the shelf, never the surrounding page.
export function revealOnShelf({left, width, itemLeft, itemWidth}) {
  if (itemLeft < left) return Math.max(0, itemLeft);
  if (itemLeft + itemWidth > left + width) return Math.max(0, itemLeft + itemWidth - width);
  return left;
}

export function nextShelfPage({position, viewport, content}) {
  const maximum = Math.max(0, content - viewport);
  return position >= maximum - 2 ? 0 : Math.min(maximum, position + Math.max(120, viewport * 0.8));
}

export function savedShelfPosition(value) {
  return typeof value === 'number' ? {top:Math.max(0,value),left:0} :
    {top:Math.max(0,Number(value?.top)||0),left:Math.max(0,Number(value?.left)||0)};
}
