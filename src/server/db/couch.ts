import {
  asReplicatorSetupDocument,
  type DatabaseSetup,
  makeMangoIndex,
  syncedDocument
} from 'edge-server-tools'
import nano from 'nano'

import { serverConfig } from '../serverConfig'
import type { DbSettings, DbTransaction } from '../types/db'
import { asApiKeys } from '../types/types'

// Attach to the database:
const { couchUri } = serverConfig

export const apiKeysSyncDoc = syncedDocument('apikeys', asApiKeys)
export const settingsReplication = syncedDocument(
  'replication',
  asReplicatorSetupDocument
)

export const settingsDatabaseSetup: DatabaseSetup = {
  name: 'paystation_settings',

  templates: {
    apikeys: {
      apiKeys: {
        xxxApiKeyExample: {
          apiKey: 'xxxApiKeyExample',
          email: 'xxx@example.com',
          status: 'active',
          createdAt: new Date().toISOString()
        }
      }
    },
    replication: {
      clusters: {
        wusa: {
          url: '',
          exclude: [],
          pullFrom: ['eusa'],
          pushTo: []
        },
        eusa: {
          url: '',
          exclude: [],
          pullFrom: ['wusa'],
          pushTo: []
        }
      }
    }
  },
  syncedDocuments: [settingsReplication]
}

export const transactionsDatabaseSetup: DatabaseSetup = {
  name: 'paystation_transactions',

  documents: {
    '_design/merchantId': makeMangoIndex('merchantId', ['merchantId'])
  }
}

export const dbSettings: nano.DocumentScope<DbSettings> = nano(couchUri).db.use(
  settingsDatabaseSetup.name
)

export const dbTransactions: nano.DocumentScope<DbTransaction> = nano(
  couchUri
).db.use(transactionsDatabaseSetup.name)
