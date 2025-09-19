import { asObject, asString } from 'cleaners'

export const asDbSettings = asObject({
  dummySettings: asString
})

export const asDbTransaction = asObject({
  merchantId: asString
})

export type DbSettings = ReturnType<typeof asDbSettings>
export type DbTransaction = ReturnType<typeof asDbTransaction>
