import { HttpException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RateLimitGuard } from './rate-limit.guard.js';

function requestContext(address: string) {
  class TestController {}
  function testHandler() {}

  const request = {
    headers: { 'x-forwarded-for': address },
    socket: {},
  } as unknown as Request;
  const setHeader = vi.fn();
  const response = { setHeader } as unknown as Response;
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getClass: () => TestController,
    getHandler: () => testHandler,
  } as unknown as ExecutionContext;

  return { context, setHeader };
}

describe('RateLimitGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('enforces route limits and resets after the configured window', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({ limit: 2, windowMs: 1_000 }),
    } as unknown as Reflector;
    const guard = new RateLimitGuard(reflector);
    const { context, setHeader } = requestContext('203.0.113.10');

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);

    let error: unknown;
    try {
      guard.canActivate(context);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', 1);

    vi.advanceTimersByTime(1_001);
    expect(guard.canActivate(context)).toBe(true);
  });
});
