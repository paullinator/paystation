import { asValue } from 'cleaners'

export const asVerbosity = asValue('info', 'warn', 'error')
export type Verbosity = ReturnType<typeof asVerbosity>
