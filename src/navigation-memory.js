// Keep a tab's place in the journey. Apply only when navigation actually commits.
export function createNavigationMemory(initial = 'Closet') {
  let current = initial;
  const visited = new Set([initial]), positions = new Map();
  const point = value => Number.isFinite(value) ? Math.max(0, value) : 0;
  return {
    get current() { return current; },
    move(destination, position = {}) {
      if (destination === current) return { changed: false };
      positions.set(current, { x: point(position.x), y: point(position.y) });
      const returning = visited.has(destination);
      current = destination;
      visited.add(destination);
      return { changed: true, returning, position: positions.get(destination) || { x: 0, y: 0 } };
    },
  };
}
