/**
 * Simple In-Memory Cache Manager
 *
 * Caches responses to reduce database queries during high load
 * Implements TTL-based expiration and size limits
 */

class Cache {
  constructor(maxSize = 1000, defaultTTL = 60000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.store = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };
  }

  set(key, value, ttl = this.defaultTTL) {
    // Evict oldest entry if at capacity
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      this.store.delete(firstKey);
    }

    const entry = {
      value,
      expiresAt: Date.now() + ttl,
    };

    this.store.set(key, entry);
    this.stats.sets++;
    return value;
  }

  get(key) {
    const entry = this.store.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    const deleted = this.store.delete(key);
    if (deleted) this.stats.deletes++;
    return deleted;
  }

  clear() {
    const size = this.store.size;
    this.store.clear();
    this.stats.deletes += size;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.store.size,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) + '%' : '0%',
    };
  }
}

module.exports = { Cache };
