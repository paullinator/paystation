import {
  asReplicatorSetupDocument,
  type DatabaseSetup,
  makeMangoIndex,
  syncedDocument
} from 'edge-server-tools'
import nano from 'nano'

import { serverConfig } from '../serverConfig'
import type {
  DbInventory,
  DbItem,
  DbPayment,
  DbSale,
  DbSettings,
  DbStore,
  DbVendor
} from '../types/db'
import { asApiKeys } from '../types/types'

// Attach to the database:
const { couchUri } = serverConfig

export const apiKeysSyncDoc = syncedDocument('apikeys', asApiKeys)
export const settingsReplication = syncedDocument(
  'replication',
  asReplicatorSetupDocument
)

// ============================================================================
// Settings Database
// ============================================================================

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

// ============================================================================
// Vendors Database
// ============================================================================

export const vendorsDatabaseSetup: DatabaseSetup = {
  name: 'paystation_vendors',

  documents: {
    '_design/email': makeMangoIndex('email', ['email']),
    '_design/status': makeMangoIndex('status', ['status'])
  }
}

// ============================================================================
// Stores Database
// ============================================================================

export const storesDatabaseSetup: DatabaseSetup = {
  name: 'paystation_stores',

  documents: {
    '_design/vendorId': makeMangoIndex('vendorId', ['vendorId']),
    '_design/vendorId_status': makeMangoIndex('vendorId_status', [
      'vendorId',
      'status'
    ])
  }
}

// ============================================================================
// Items Database
// ============================================================================

export const itemsDatabaseSetup: DatabaseSetup = {
  name: 'paystation_items',

  documents: {
    '_design/vendorId_status': makeMangoIndex('vendorId_status', [
      'vendorId',
      'status'
    ]),
    '_design/storeId_status': makeMangoIndex('storeId_status', [
      'storeId',
      'status'
    ]),
    '_design/sku': makeMangoIndex('sku', ['sku']),
    '_design/category_status': makeMangoIndex('category_status', [
      'category',
      'status'
    ])
  }
}

// ============================================================================
// Inventory Database
// ============================================================================

export const inventoryDatabaseSetup: DatabaseSetup = {
  name: 'paystation_inventory',

  documents: {
    '_design/itemId_storeId': makeMangoIndex('itemId_storeId', [
      'itemId',
      'storeId'
    ]),
    '_design/storeId_quantity': makeMangoIndex('storeId_quantity', [
      'storeId',
      'quantity'
    ])
  }
}

// ============================================================================
// Sales Database
// ============================================================================

export const salesDatabaseSetup: DatabaseSetup = {
  name: 'paystation_sales',

  documents: {
    '_design/vendorId_createdAt': makeMangoIndex('vendorId_createdAt', [
      'vendorId',
      'createdAt'
    ]),
    '_design/storeId_createdAt': makeMangoIndex('storeId_createdAt', [
      'storeId',
      'createdAt'
    ]),
    '_design/receiptNumber': makeMangoIndex('receiptNumber', ['receiptNumber']),
    '_design/paymentStatus_createdAt': makeMangoIndex(
      'paymentStatus_createdAt',
      ['paymentStatus', 'createdAt']
    ),
    '_design/customerEmail': makeMangoIndex('customerEmail', ['customerEmail'])
  }
}

// ============================================================================
// Payments Database
// ============================================================================

export const paymentsDatabaseSetup: DatabaseSetup = {
  name: 'paystation_payments',

  documents: {
    '_design/saleId': makeMangoIndex('saleId', ['saleId']),
    '_design/vendorId_createdAt': makeMangoIndex('vendorId_createdAt', [
      'vendorId',
      'createdAt'
    ]),
    '_design/storeId_createdAt': makeMangoIndex('storeId_createdAt', [
      'storeId',
      'createdAt'
    ]),
    '_design/processor_status': makeMangoIndex('processor_status', [
      'processor',
      'status'
    ]),
    '_design/transactionId': makeMangoIndex('transactionId', ['transactionId'])
  }
}

// ============================================================================
// Database Connection Exports
// ============================================================================

export const dbSettings: nano.DocumentScope<DbSettings> = nano(couchUri).db.use(
  settingsDatabaseSetup.name
)

export const dbVendors: nano.DocumentScope<DbVendor> = nano(couchUri).db.use(
  vendorsDatabaseSetup.name
)

export const dbStores: nano.DocumentScope<DbStore> = nano(couchUri).db.use(
  storesDatabaseSetup.name
)

export const dbItems: nano.DocumentScope<DbItem> = nano(couchUri).db.use(
  itemsDatabaseSetup.name
)

export const dbInventory: nano.DocumentScope<DbInventory> = nano(
  couchUri
).db.use(inventoryDatabaseSetup.name)

export const dbSales: nano.DocumentScope<DbSale> = nano(couchUri).db.use(
  salesDatabaseSetup.name
)

export const dbPayments: nano.DocumentScope<DbPayment> = nano(couchUri).db.use(
  paymentsDatabaseSetup.name
)
