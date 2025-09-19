import { asVerbosity } from './types'

const REFRESH_RATE = 5000

// Logging control
let verbosity = asVerbosity(process.env.PS_VERBOSE_LOG ?? 'info')

export const logger = {
  setVerbosity(argVerbosity: 'info' | 'warn' | 'error'): void {
    verbosity = asVerbosity(argVerbosity)
  },
  log: (...args: unknown[]): void => {
    if (verbosity === 'info') {
      console.log(...args)
    }
  },
  warn: (...args: unknown[]): void => {
    if (verbosity === 'warn' || verbosity === 'info') {
      console.warn(...args)
    }
  },
  error: (...args: unknown[]): void => {
    if (verbosity === 'error' || verbosity === 'warn' || verbosity === 'info') {
      console.error(...args)
    }
  }
}

export const snooze = async (ms: number): Promise<void> => {
  await new Promise((resolve: (value: unknown) => void) =>
    setTimeout(resolve, ms)
  )
}

export const retryFetch = async (
  request: RequestInfo,
  init?: RequestInit,
  maxRetries: number = 5
): Promise<Response> => {
  let retries = 0
  let err: unknown

  while (retries++ < maxRetries) {
    try {
      const response = await fetch(request, init)
      return response
    } catch (e) {
      err = e
      await snooze(REFRESH_RATE * retries)
    }
  }
  throw err
}
