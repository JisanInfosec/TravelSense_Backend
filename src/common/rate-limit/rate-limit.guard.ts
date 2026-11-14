import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

const RATE_LIMIT_OPTIONS = Symbol('rate-limit-options');
const GLOBAL_LIMIT = 300;
const GLOBAL_WINDOW_MS = 60_000;

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_OPTIONS, options);

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitResult extends Bucket {
  allowed: boolean;
  limit: number;
}

function clientAddress(request: Request) {
  const forwarded = request.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (
    value?.split(',')[0]?.trim() ||
    request.ip ||
    request.socket.remoteAddress ||
    'unknown'
  );
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private operations = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const address = clientAddress(request);
    const now = Date.now();

    const global = this.consume(
      `global:${address}`,
      GLOBAL_LIMIT,
      GLOBAL_WINDOW_MS,
      now,
    );
    if (!global.allowed) this.reject(response, global, now);

    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_OPTIONS,
      [context.getHandler(), context.getClass()],
    );
    const result = options
      ? this.consume(
          `route:${context.getClass().name}:${context.getHandler().name}:${address}`,
          options.limit,
          options.windowMs,
          now,
        )
      : global;

    this.setHeaders(response, result, now);
    if (!result.allowed) this.reject(response, result, now);

    this.operations += 1;
    if (this.operations % 500 === 0) this.removeExpired(now);
    return true;
  }

  private consume(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): RateLimitResult {
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }

    const allowed = bucket.count < limit;
    if (allowed) bucket.count += 1;
    return { ...bucket, allowed, limit };
  }

  private reject(
    response: Response,
    result: RateLimitResult,
    now: number,
  ): never {
    this.setHeaders(response, result, now);
    throw new HttpException(
      'Too many requests. Please try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private setHeaders(response: Response, result: RateLimitResult, now: number) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - now) / 1000));
    response.setHeader('RateLimit-Limit', result.limit);
    response.setHeader(
      'RateLimit-Remaining',
      Math.max(0, result.limit - result.count),
    );
    response.setHeader('RateLimit-Reset', Math.ceil(result.resetAt / 1000));
    if (!result.allowed) response.setHeader('Retry-After', retryAfter);
  }

  private removeExpired(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
