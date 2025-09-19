/**
 * Mostly copied from https://github.com/EdgeApp/edge-autobot-server/blob/master/src/server/indexEngine.ts
 */

import cron from 'node-cron'

import { snooze } from '../common/utils'
import type {
  Autobot,
  AutobotEngineConfig,
  AutobotFrequency
} from './types/autobotTypes'

const frequencyToMs: Record<AutobotFrequency, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  once: 0
}

const createEngineLoop = async (
  botId: string,
  engineConfig: AutobotEngineConfig
): Promise<void> => {
  const { engine } = engineConfig
  const log = (...args: unknown[]): void => {
    const now = new Date().toISOString()
    const date = now.slice(5)
    const label =
      'cron' in engineConfig ? engineConfig.cron : engineConfig.frequency
    console.log(`${date}:${botId}:${label}: ${args.join(' ')}`)
  }

  if ('cron' in engineConfig) {
    const cronExpr = engineConfig.cron
    // Cron-based scheduling takes precedence
    const task = cron.schedule(cronExpr, async () => {
      try {
        await engine({ log })
      } catch (err: unknown) {
        log(`Engine '${engineConfig.cron}' failed to run for ${botId}`, err)
      }
    })

    await task.start()
  } else {
    // Frequency-based scheduling as a fallback
    const frequency = engineConfig.frequency
    const delayMs =
      typeof frequency === 'number'
        ? frequency * 1000
        : frequencyToMs[frequency]
    while (true) {
      const startTime = Date.now()
      try {
        log(`Run engine ${botId}`)
        await engine({ log })
      } catch (err) {
        log(
          `Engine '${engineConfig.frequency}' failed to run for ${botId}`,
          err
        )
      }
      const timeSinceStart = Date.now() - startTime
      const timeToWait = Math.max(0, delayMs - timeSinceStart)
      log(
        `Engine '${engineConfig.frequency}' for ${botId} waiting ${timeToWait}ms`
      )
      if (frequency === 'once') {
        break
      }
      await snooze(timeToWait)
    }
  }
}

const main = (): void => {
  const autobots: Autobot[] = []
  for (const autobot of autobots) {
    const { botId, engines } = autobot
    if (engines == null) continue

    for (const engine of engines) {
      createEngineLoop(botId, engine).catch((e: unknown) => {
        console.error(`${botId}: Engine failed to initialize schedule`, e)
      })
    }
  }
}

main()
