export const MAX_REQUEST_ATTEMPTS = 3;

const retryDelays = [5000, 10000, 20000, 40000, 60000];

export function retryDelay(attempt: number): number {
  return retryDelays[Math.min(attempt, retryDelays.length - 1)];
}

export function shouldRetry(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

export function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}
