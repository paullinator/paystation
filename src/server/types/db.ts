import {
  asArray,
  asBoolean,
  asDate,
  asNumber,
  asObject,
  asOptional,
  asString,
  asUnknown,
  asValue
} from 'cleaners'

// ============================================================================
// Vendors Database
// ============================================================================

export const asAddress = asObject({
  street: asString,
  city: asString,
  state: asString,
  zipCode: asString,
  country: asString
})

export const asDbVendor = asObject({
  _id: asString,
  _rev: asOptional(asString),
  name: asString,
  email: asString,
  phone: asString,
  address: asAddress,
  status: asValue('active', 'suspended', 'inactive'),
  createdAt: asDate,
  updatedAt: asDate
})

// ============================================================================
// Stores Database
// ============================================================================

export const asStoreSettings = asObject({
  timezone: asString,
  currency: asString,
  taxRate: asNumber
})

export const asDbStore = asObject({
  _id: asString,
  _rev: asOptional(asString),
  vendorId: asString,
  name: asString,
  address: asAddress,
  phone: asString,
  status: asValue('active', 'inactive'),
  settings: asStoreSettings,
  createdAt: asDate,
  updatedAt: asDate
})

// ============================================================================
// Items Database
// ============================================================================

export const asDbItem = asObject({
  _id: asString,
  _rev: asOptional(asString),
  vendorId: asString,
  storeId: asOptional(asString, null),
  sku: asString,
  name: asString,
  description: asString,
  category: asString,
  price: asNumber,
  cost: asNumber,
  taxable: asBoolean,
  trackInventory: asBoolean,
  status: asValue('active', 'inactive'),
  metadata: asOptional(asUnknown, {}),
  createdAt: asDate,
  updatedAt: asDate
})

// ============================================================================
// Inventory Database
// ============================================================================

export const asDbInventory = asObject({
  _id: asString,
  _rev: asOptional(asString),
  itemId: asString,
  storeId: asString,
  quantity: asNumber,
  reorderLevel: asNumber,
  reorderQuantity: asNumber,
  lastRestocked: asDate,
  updatedAt: asDate
})

// ============================================================================
// Sales Database
// ============================================================================

export const asSaleItem = asObject({
  itemId: asString,
  name: asString,
  quantity: asNumber,
  price: asNumber,
  cost: asNumber,
  tax: asNumber,
  subtotal: asNumber
})

export const asDbSale = asObject({
  _id: asString,
  _rev: asOptional(asString),
  vendorId: asString,
  storeId: asString,
  receiptNumber: asString,
  items: asArray(asSaleItem),
  subtotal: asNumber,
  tax: asNumber,
  total: asNumber,
  paymentStatus: asValue('pending', 'completed', 'refunded', 'failed'),
  cashierId: asOptional(asString),
  customerEmail: asOptional(asString),
  notes: asOptional(asString),
  createdAt: asDate,
  completedAt: asOptional(asDate)
})

// ============================================================================
// Payments Database
// ============================================================================

export const asDbPayment = asObject({
  _id: asString,
  _rev: asOptional(asString),
  saleId: asString,
  vendorId: asString,
  storeId: asString,
  amount: asNumber,
  method: asValue('cash', 'card', 'mobile', 'crypto', 'other'),
  processor: asString,
  processorData: asOptional(asUnknown, {}),
  status: asValue('pending', 'authorized', 'captured', 'failed', 'refunded'),
  transactionId: asOptional(asString),
  errorMessage: asOptional(asString),
  metadata: asOptional(asUnknown, {}),
  createdAt: asDate,
  processedAt: asOptional(asDate)
})

// ============================================================================
// Settings Database
// ============================================================================

export const asDbSettings = asObject({
  dummySettings: asString
})

// ============================================================================
// Type Exports
// ============================================================================

export type Address = ReturnType<typeof asAddress>
export type DbVendor = ReturnType<typeof asDbVendor>
export type StoreSettings = ReturnType<typeof asStoreSettings>
export type DbStore = ReturnType<typeof asDbStore>
export type DbItem = ReturnType<typeof asDbItem>
export type DbInventory = ReturnType<typeof asDbInventory>
export type SaleItem = ReturnType<typeof asSaleItem>
export type DbSale = ReturnType<typeof asDbSale>
export type DbPayment = ReturnType<typeof asDbPayment>
export type DbSettings = ReturnType<typeof asDbSettings>
