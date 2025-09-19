export interface AutobotEngineArgs {
  log: (...args: unknown[]) => void
}

export type AutobotEngine = (args: AutobotEngineArgs) => Promise<void>
export type AutobotFrequency =
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'once'
  | number

export type AutobotEngineConfig =
  | {
      frequency: AutobotFrequency
      engine: AutobotEngine
    }
  | {
      cron: string // Standard "* * * * *" style string; if provided, takes precedence over frequency
      engine: AutobotEngine
    }

export interface Autobot {
  botId: string
  engines?: AutobotEngineConfig[]
}
