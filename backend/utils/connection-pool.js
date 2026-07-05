/**
 * Connection Pool Manager for Supabase
 *
 * Implements connection pooling and request queuing to handle
 * high concurrency without overwhelming the database
 */

const { EventEmitter } = require('events');

class ConnectionPool extends EventEmitter {
  constructor(maxConnections = 50, maxQueueSize = 1000) {
    super();
    this.maxConnections = maxConnections;
    this.maxQueueSize = maxQueueSize;
    this.activeConnections = 0;
    this.queue = [];
    this.stats = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      queuedRequests: 0,
      peakConnections: 0,
      avgWaitTime: 0,
    };
  }

  async acquire() {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const tryAcquire = () => {
        if (this.activeConnections < this.maxConnections) {
          this.activeConnections++;
          this.stats.peakConnections = Math.max(
            this.stats.peakConnections,
            this.activeConnections
          );

          const release = () => {
            this.activeConnections--;
            const waitTime = Date.now() - startTime;
            this.stats.avgWaitTime =
              (this.stats.avgWaitTime * this.stats.completedRequests + waitTime) /
              (this.stats.completedRequests + 1);
            this.processQueue();
          };

          resolve(release);
        } else if (this.queue.length < this.maxQueueSize) {
          this.queue.push({ resolve, reject, startTime });
          this.stats.queuedRequests++;
        } else {
          reject(new Error('Connection pool queue full'));
        }
      };

      tryAcquire();
    });
  }

  processQueue() {
    if (this.queue.length > 0 && this.activeConnections < this.maxConnections) {
      const { resolve } = this.queue.shift();
      this.stats.queuedRequests = Math.max(0, this.stats.queuedRequests - 1);
      this.acquire().then(resolve).catch(console.error);
    }
  }

  getStats() {
    return {
      ...this.stats,
      activeConnections: this.activeConnections,
      queueLength: this.queue.length,
      utilizationPercent: ((this.activeConnections / this.maxConnections) * 100).toFixed(2),
    };
  }

  recordRequest(success = true) {
    this.stats.totalRequests++;
    if (success) {
      this.stats.completedRequests++;
    } else {
      this.stats.failedRequests++;
    }
  }

  reset() {
    this.stats = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      queuedRequests: 0,
      peakConnections: 0,
      avgWaitTime: 0,
    };
  }
}

module.exports = { ConnectionPool };
