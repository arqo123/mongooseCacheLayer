import { Aggregate, Mongoose } from 'mongoose';
import { AggregationResult, SpeedGooseCacheOperationContext, SpeedGooseCacheOperationParams } from './types/types';
import { getResultsFromCache, refreshTtlForCachedResult, setKeyInResultsCaches } from './utils/cacheClientUtils';
import { isCachingEnabled } from './utils/commonUtils';
import { prepareAggregateOperationParams } from './utils/queryUtils';

export const addCachingToAggregate = (mongoose: Mongoose): void => {
    /**
     * Caches given aggregation operation.
     */
    mongoose.Aggregate.prototype.cachePipeline = function <R>(params: SpeedGooseCacheOperationParams = {}): Promise<Aggregate<R>> {
        return isCachingEnabled() ? execAggregationWithCache<R>(this, params) : this.exec();
    };
};

const execAggregationWithCache = async <R>(aggregation: Aggregate<R>, context: SpeedGooseCacheOperationContext): Promise<Aggregate<R>> => {
    prepareAggregateOperationParams(aggregation, context);

    context?.debug(`Reading cache for key`, context.cacheKey);
    const cachedValue = (await getResultsFromCache(context.cacheKey)) as AggregationResult;

    if (cachedValue) {
        context?.debug(`Returning cache for key`, context.cacheKey);
        if (context.shouldRefreshTtlOnRead) {
            context?.debug(`Refreshing ttl for key`, context.cacheKey);

            setTimeout(() => {
                refreshTtlForCachedResult(context.cacheKey, context.ttl, cachedValue);
            }, 0);
        }
        return cachedValue as Aggregate<R>;
    }

    context?.debug(`Key didn't exists in cache, fetching value from database`, context.cacheKey);
    const result = (await aggregation.exec()) as AggregationResult;

    if (result) {
        await setKeyInResultsCaches(context, result, aggregation._model);

        return result as Aggregate<R>;
    }
};
