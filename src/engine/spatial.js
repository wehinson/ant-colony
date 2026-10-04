// A tick-local spatial index. Stable ordering keeps indexed and exhaustive
// targeting identical. It contains references, never a second simulation state.
export class SpatialIndex {
  constructor(items, size = 4) {
    this.size = size;
    this.buckets = new Map();
    this.entries = new Map();
    items.forEach((item, order) => {
      this.entries.set(item.id, { item, order, key: null });
      this.update(item);
    });
  }
  key(p) {
    return `${Math.floor(p.x / this.size)},${Math.floor(p.y / this.size)}`;
  }
  update(item) {
    const entry = this.entries.get(item.id);
    if (!entry) return;
    const key = this.key(item);
    if (entry.key === key) return;
    if (entry.key !== null) this.buckets.get(entry.key)?.delete(entry);
    if (!this.buckets.has(key)) this.buckets.set(key, new Set());
    this.buckets.get(key).add(entry);
    entry.key = key;
  }
  query(p, radius) {
    const found = [];
    for (
      let y = Math.floor((p.y - radius) / this.size);
      y <= Math.floor((p.y + radius) / this.size);
      y++
    )
      for (
        let x = Math.floor((p.x - radius) / this.size);
        x <= Math.floor((p.x + radius) / this.size);
        x++
      )
        for (const entry of this.buckets.get(`${x},${y}`) || [])
          if (Math.hypot(entry.item.x - p.x, entry.item.y - p.y) <= radius)
            found.push(entry);
    return found.sort((a, b) => a.order - b.order).map((e) => e.item);
  }
}
