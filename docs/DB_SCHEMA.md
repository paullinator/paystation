# PayStation Database Schema

## Overview

PayStation uses CouchDB to store all point-of-sale data. The system is designed to support multiple vendors, each with multiple stores, items, sales transactions, and flexible payment processing.

## Database Architecture

All databases are prefixed with `paystation_` for easy identification and management.

### 1. paystation_vendors

Stores information about vendors/merchants who use the system.

**Document Structure:**
```typescript
{
  _id: string              // Unique vendor ID
  _rev: string            // CouchDB revision
  name: string            // Vendor business name
  email: string           // Primary contact email
  phone: string           // Contact phone number
  address: {
    street: string
    city: string
    state: string
    zipCode: string
    country: string
  }
  status: 'active' | 'suspended' | 'inactive'
  createdAt: string       // ISO 8601 date
  updatedAt: string       // ISO 8601 date
}
```

**Indexes:**
- `email` - For vendor lookup by email
- `status` - For filtering active vendors

### 2. paystation_stores

Stores information about physical or virtual store locations.

**Document Structure:**
```typescript
{
  _id: string              // Unique store ID
  _rev: string
  vendorId: string         // Foreign key to vendors
  name: string             // Store name/location
  address: {
    street: string
    city: string
    state: string
    zipCode: string
    country: string
  }
  phone: string
  status: 'active' | 'inactive'
  settings: {
    timezone: string
    currency: string
    taxRate: number        // Percentage
  }
  createdAt: string
  updatedAt: string
}
```

**Indexes:**
- `vendorId` - For querying all stores by vendor
- `vendorId, status` - For active stores by vendor

### 3. paystation_items

Product and service catalog.

**Document Structure:**
```typescript
{
  _id: string              // Unique item ID
  _rev: string
  vendorId: string         // Foreign key to vendors
  storeId: string          // Foreign key to stores (optional, null = all stores)
  sku: string              // Stock keeping unit
  name: string             // Item name
  description: string      // Item description
  category: string         // Product category
  price: number            // Base price in cents
  cost: number             // Cost to vendor in cents
  taxable: boolean         // Whether item is taxable
  trackInventory: boolean  // Whether to track stock
  status: 'active' | 'inactive'
  metadata: {              // Extensible metadata
    [key: string]: any
  }
  createdAt: string
  updatedAt: string
}
```

**Indexes:**
- `vendorId, status` - For active items by vendor
- `storeId, status` - For active items by store
- `sku` - For SKU lookup
- `category, status` - For browsing by category

### 4. paystation_inventory

Tracks inventory levels for items.

**Document Structure:**
```typescript
{
  _id: string              // Unique inventory record ID
  _rev: string
  itemId: string           // Foreign key to items
  storeId: string          // Foreign key to stores
  quantity: number         // Current stock quantity
  reorderLevel: number     // Minimum quantity before reorder
  reorderQuantity: number  // Quantity to reorder
  lastRestocked: string    // ISO 8601 date
  updatedAt: string
}
```

**Indexes:**
- `itemId, storeId` - For looking up inventory by item and store
- `storeId, quantity` - For low stock alerts

### 5. paystation_sales

Records of completed sales transactions.

**Document Structure:**
```typescript
{
  _id: string              // Unique sale ID
  _rev: string
  vendorId: string         // Foreign key to vendors
  storeId: string          // Foreign key to stores
  receiptNumber: string    // Human-readable receipt number
  items: Array<{
    itemId: string
    name: string           // Snapshot for historical accuracy
    quantity: number
    price: number          // Price at time of sale (cents)
    cost: number           // Cost at time of sale (cents)
    tax: number            // Tax amount (cents)
    subtotal: number       // quantity * price (cents)
  }>
  subtotal: number         // Sum of item subtotals (cents)
  tax: number              // Total tax (cents)
  total: number            // Final total (cents)
  paymentStatus: 'pending' | 'completed' | 'refunded' | 'failed'
  cashierId: string        // User who processed sale (optional)
  customerEmail: string    // Customer email (optional)
  notes: string            // Additional notes (optional)
  createdAt: string        // Sale timestamp
  completedAt: string      // When payment completed (optional)
}
```

**Indexes:**
- `vendorId, createdAt` - For vendor sales reports
- `storeId, createdAt` - For store sales reports
- `receiptNumber` - For receipt lookup
- `paymentStatus, createdAt` - For pending transactions
- `customerEmail` - For customer purchase history

### 6. paystation_payments

Payment records with plugin-based processing support.

**Document Structure:**
```typescript
{
  _id: string              // Unique payment ID
  _rev: string
  saleId: string           // Foreign key to sales
  vendorId: string         // Foreign key to vendors
  storeId: string          // Foreign key to stores
  amount: number           // Payment amount (cents)
  method: 'cash' | 'card' | 'mobile' | 'crypto' | 'other'
  processor: string        // Payment plugin name (e.g., 'stripe', 'edge')
  processorData: {         // Plugin-specific data
    [key: string]: any
  }
  status: 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded'
  transactionId: string    // External transaction ID (optional)
  errorMessage: string     // Error details if failed (optional)
  metadata: {              // Extensible metadata
    [key: string]: any
  }
  createdAt: string
  processedAt: string      // When payment was processed (optional)
}
```

**Indexes:**
- `saleId` - For looking up payments by sale
- `vendorId, createdAt` - For vendor payment reports
- `storeId, createdAt` - For store payment reports
- `processor, status` - For plugin-specific queries
- `transactionId` - For external transaction lookup

### 7. paystation_settings

System-wide and vendor-specific settings.

**Document Structure:**
```typescript
{
  _id: string              // Document ID (e.g., 'apikeys', 'replication')
  _rev: string
  // Variable structure based on document type
}
```

**Special Documents:**
- `apikeys` - API key management
- `replication` - Database replication configuration

## Payment Plugin Architecture

Payment processing uses a plugin architecture through the `processor` field in payment records. Each payment processor plugin should:

1. Register its name (e.g., 'stripe', 'edge', 'square')
2. Implement standard methods: `authorize()`, `capture()`, `refund()`
3. Store plugin-specific data in the `processorData` field
4. Update payment status appropriately

## Query Patterns

### Common Queries

1. **Get all active items for a vendor:**
   ```
   selector: { vendorId: "vendor123", status: "active" }
   use_index: "vendorId_status"
   ```

2. **Get sales for a store in date range:**
   ```
   selector: {
     storeId: "store456",
     createdAt: { $gte: "2025-01-01", $lte: "2025-01-31" }
   }
   use_index: "storeId_createdAt"
   ```

3. **Get low inventory items:**
   ```
   selector: {
     storeId: "store456",
     $expr: { $lt: ["$quantity", "$reorderLevel"] }
   }
   ```

4. **Get customer purchase history:**
   ```
   selector: { customerEmail: "customer@example.com" }
   use_index: "customerEmail"
   sort: [{ createdAt: "desc" }]
   ```

## Replication & Scaling

The system supports CouchDB's built-in replication for:
- Multi-region deployments
- Offline-first POS terminals
- Backup and disaster recovery

Replication configuration is stored in the `paystation_settings` database.

## Data Integrity

All database access must go through cleaners (validation functions) defined in `src/server/types/db.ts`. This ensures:
- Type safety
- Data validation
- Consistent data structure
- Prevention of corrupt data

## Migration Strategy

When schema changes are needed:
1. Create a new cleaner version
2. Add migration logic to handle old documents
3. Update indexes as needed
4. Test with existing data before deploying

