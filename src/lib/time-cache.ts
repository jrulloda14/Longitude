/** Small bounded LRU caches prevent long planning sessions retaining every query. */
export class TimeCache<K, V> {
  private readonly values = new Map<K, V>();
  constructor(private readonly limit: number) {}

  get(key: K): V | undefined {
    const value = this.values.get(key);
    if (value !== undefined) {
      this.values.delete(key);
      this.values.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): V {
    this.values.delete(key);
    this.values.set(key, value);
    if (this.values.size > this.limit) this.values.delete(this.values.keys().next().value!);
    return value;
  }
}
