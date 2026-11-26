const NodeCache = require('node-cache');

const batchCache = new NodeCache({ stdTTL: 15, checkperiod: 0, useClones: false });
const BATCH_CACHE_PREFIX = 'batches:';

function invalidateBatchCache() {
  for (const key of batchCache.keys()) {
    if (key.startsWith(BATCH_CACHE_PREFIX)) batchCache.del(key);
  }
}

module.exports = { batchCache, BATCH_CACHE_PREFIX, invalidateBatchCache };
