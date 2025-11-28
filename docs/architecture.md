# Paystation Architectural Plan

## Overview

Paystation is a modular, multi-tenant point-of-sale system with:

- **Server**: Node.js with Express, serverlet, WebSocket support
- **Frontends**: React Native (iOS/Android/Web/Electron)
- **Databases**: CouchDB (primary), ClickHouse (analytics)
- **Plugin Architecture**:
  - Payment processors (server-side plugins)
  - UI plugins (client-side, Jenkins-like modularity for merchant-gui/customer-gui)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                            CLIENTS                              │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   admin-gui     │  merchant-gui   │      customer-gui           │
│   (Web Only)    │  (RN: iOS/And/  │      (RN: iOS/And/Web)      │
│                 │   Web/Electron) │                             │
│                 ├─────────────────┴─────────────────────────────┤
│                 │         UI PLUGINS (standalone packages)      │
│                 │  ┌───────────┐ ┌───────────┐ ┌───────────┐    │
│                 │  │cardreader1│ │cardreader2│ │ displayQr │    │
│                 │  └───────────┘ └───────────┘ └───────────┘    │
└────────┬────────┴────────────────────┬──────────────────────────┘
         │ HTTP (CRUD)                 │ WebSocket (real-time)
         ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                            SERVER                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   REST API   │  │  WebSocket   │  │  Processor Plugins   │   │
│  │  (serverlet) │  │   Server     │  │  ┌────────┐┌───────┐ │   │
│  └──────────────┘  └──────────────┘  │  │ Stripe ││Bitcoin│ │   │
│                                      │  └────────┘└───────┘ │   │
│                                      └──────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
┌─────────────────┐             ┌─────────────────┐
│    CouchDB      │             │   ClickHouse    │
│  (Primary DB)   │             │   (Analytics)   │
└─────────────────┘             └─────────────────┘
```

### Directory Structure

```
paystation/
├── common/           # Shared types, cleaners, utilities
├── server/           # Backend server
├── admin-gui/        # Admin web portal (React)
├── merchant-gui/     # Merchant terminal app (React Native)
├── customer-gui/     # Customer display app (React Native)
├── displayQr/        # UI plugin: QR code display (standalone)
├── cardreader1/      # UI plugin: Card reader vendor 1
├── cardreader2/      # UI plugin: Card reader vendor 2
├── processor-stripe/ # Server plugin: Stripe processor
└── processor-bitcoin/# Server plugin: Bitcoin processor (template)
```

---

## 2. CouchDB Schema Design

### Database Structure

| Database | Purpose |
|----------|---------|
| `paystation_settings` | Global config, API keys, replication |
| `paystation_users` | Admin portal users (superadmin, merchant admins) |
| `paystation_merchants` | Merchant business entities |
| `paystation_stores` | Physical/logical locations per merchant |
| `paystation_devices` | Connected terminals with auth keys |
| `paystation_processors` | Payment processor configs per merchant |
| `paystation_transactions` | Sales/orders |
| `paystation_payments` | Individual payment records |

### ID Format Convention (Typed UUIDs)

All document IDs are **randomly generated UUIDs** with a type prefix for clarity and debuggability:

```
{type}_{base58_uuid}
```

- **Type prefix**: Indicates the document type (e.g., `user`, `merchant`, `store`)
- **Base58 UUID**: 128-bit cryptographically random value encoded in base58 (22 characters)

Examples:
- `user_5HueCGU8rMjxEXxiPuD5BDku`
- `merchant_4K8bxLh2wJvMNkfGqQzPeR`
- `txn_7NzqM3kpAw9JvfHbYcXs6T`
- `pay_2FjKm8sL5nRvQwZxCbEa3Y`

```typescript
// UUID generation utility
import { base58 } from 'base-x'
import { randomBytes } from 'crypto'

const bs58 = base58('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz')

function generateUuid(prefix: string): string {
  const bytes = randomBytes(16)  // 128 bits of randomness
  return `${prefix}_${bs58.encode(bytes)}`
}

// Usage
const userId = generateUuid('user')        // user_5HueCGU8rMjxEXxiPuD5BDku
const merchantId = generateUuid('merchant')// merchant_4K8bxLh2wJvMNkfGqQzPeR
```

### Document Schemas

**Currency Types** (shared types in `common/types.ts`)

```typescript
// Currency type - supports both fiat and crypto currencies
// Crypto currencies require chainId and optionally assetId for multi-chain support
export type FiatCurrency = {
  type: 'fiat';
  currencyCode: string;  // ISO 4217 code (e.g., 'USD', 'EUR')
};

export type CryptoCurrency = {
  type: 'crypto';
  chainId: string;       // Blockchain identifier (e.g., 'ethereum', 'bitcoin', 'polygon')
  assetId: string | null; // Token contract address or null for native chain currency
};

export type Currency = FiatCurrency | CryptoCurrency;
```

**Users** (`paystation_users`)

```typescript
{
  _id: string,              // user_{uuid} e.g., user_5HueCGU8rMjxEXxiPuD5BDku
  email: string,
  passwordHash: string,
  role: 'superadmin' | 'merchant_admin',
  merchantId?: string,      // merchant_{uuid}, null for superadmin
  status: 'active' | 'suspended',
  createdAt: Date,
  updatedAt: Date
}
// Indexes: email, merchantId, role
```

**Merchants** (`paystation_merchants`)

```typescript
{
  _id: string,              // merchant_{uuid}
  name: string,
  contactEmail: string,
  settings: {
    defaultCurrency: Currency,
    timezone: string
  },
  status: 'active' | 'suspended' | 'inactive',
  createdAt: Date,
  updatedAt: Date
}
// Indexes: status, contactEmail
```

**Stores** (`paystation_stores`)

```typescript
{
  _id: string,              // store_{uuid}
  merchantId: string,       // merchant_{uuid}
  name: string,
  address?: Address,
  timezone: string,
  currency: Currency,
  taxRate: number,
  status: 'active' | 'inactive',
  createdAt: Date,
  updatedAt: Date
}
// Indexes: merchantId, merchantId+status
```

**Device Capabilities** (shared type in `common/types.ts`)

```typescript
// Device capability enum - prevents typos and ensures type safety
export type DeviceCapability =
  | 'nfc'                      // NFC card reading support
  | 'printer'                  // Receipt printing capability
  | 'qr_display'               // Can display QR codes
  | 'create_transactions'  // Can initiate transactions (merchant terminal)
  | 'bluetooth'                // Bluetooth connectivity
  | 'camera'                   // Camera for scanning
  | 'barcode_scanner'          // Barcode scanning capability
```

**Devices** (`paystation_devices`)

```typescript
{
  _id: string,              // device_{uuid}
  merchantId: string,       // merchant_{uuid}
  storeId: string,          // store_{uuid}
  name: string,
  authKeyHash: string,      // hashed auth key
  capabilities: DeviceCapability[],
  status: 'active' | 'inactive',
  lastSeenAt?: Date,
  createdAt: Date
}
// Indexes: merchantId+storeId, authKeyHash (for lookup)
```

**Design Rationale:**

1. **Device registration is required** (even though availability is ephemeral):
   - **Security**: Auth keys must be pre-registered to prevent unauthorized access
   - **Audit trail**: Transactions reference `deviceId` - stable IDs needed for historical records
   - **Configuration**: Store-specific device settings (name, permissions) persist
   - **Availability is ephemeral**: Tracked via WebSocket presence, not DB status
     - `lastSeenAt` updated on connect/disconnect
     - `status` is for admin enable/disable, not online/offline

**ProcessorConfigs** (`paystation_processors`)

```typescript
{
  _id: string,              // procconfig_{uuid}
  merchantId: string,       // merchant_{uuid}
  processorId: string,      // 'stripe', 'bitcoin', etc.
  displayName: string,
  credentials: object,      // encrypted processor-specific creds
  enabledMethods: string[], // ['card_present', 'card_not_present']
  settings: object,         // processor-specific settings
  status: 'active' | 'inactive',
  createdAt: Date,
  updatedAt: Date
}
// Indexes: merchantId, merchantId+processorId, merchantId+status
```

**Transactions** (`paystation_transactions`)

```typescript
{
  _id: string,              // txn_{uuid}
  merchantId: string,       // merchant_{uuid}
  storeId: string,          // store_{uuid}
  deviceId: string,         // device_{uuid}
  receiptNumber: string,

  // Requested amounts (what merchant wants to collect)
  requestedAmount: string,  // decimal string - total amount needed to complete transaction
  requestedCurrency: Currency,  // merchant's preferred currency
  tax: string,              // decimal string in requested currency

  items?: SaleItem[],       // future: product line items (amounts as decimal strings)
  status: 'pending' | 'completed' | 'voided' | 'refunded',
  customerEmail?: string,
  notes?: string,
  createdAt: Date,
  completedAt?: Date
}
// Indexes: merchantId+createdAt, storeId+createdAt, receiptNumber, status+createdAt

// Note: Total paid amount is derived from payments:
//   sum(payments.filter(p => p.status === 'captured').map(p => p.paidRequestedAmount))
// Transaction is complete when total paid >= requestedAmount
```

**Payments** (`paystation_payments`)

Payments track both what was requested and what was actually collected, supporting cross-currency payments and partial payments. Transaction totals are derived from payments to avoid race conditions.

```typescript
{
  _id: string,              // pay_{uuid}
  transactionId: string,    // txn_{uuid}
  merchantId: string,       // merchant_{uuid}
  storeId: string,          // store_{uuid}
  processorId: string,      // processor plugin id (e.g., 'stripe', 'bitcoin')
  method: string,           // 'card_present', 'crypto_btc', etc.

  // Requested (portion of transaction this payment covers)
  requestedAmount: string,  // decimal string - portion of transaction in requestedCurrency
  requestedCurrency: Currency,  // Must match transaction.requestedCurrency

  // Collection (what we expect to collect in the payment currency)
  collectionAmount: string,  // decimal string - expected amount in collectionCurrency
  collectionCurrency: Currency,  // Currency to collect (may differ from requestedCurrency)

  // Paid (what was actually received)
  paidRequestedAmount: string,  // decimal string - actual paid in requestedCurrency
  paidCollectionAmount: string,  // decimal string - actual paid in collectionCurrency

  // Exchange rate: collectionAmount * exchangeRate = requestedAmount
  // Always present: '1' if currencies are the same, otherwise the conversion rate
  exchangeRate: string,    // decimal string

  // Indicates if this payment was partial
  isPartialPayment: boolean,  // true if paidRequestedAmount < requestedAmount

  status: 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded',
  processorTransactionId?: string,
  processorResponse?: object,
  errorMessage?: string,
  createdAt: Date,
  processedAt?: Date
}
// Indexes: transactionId, merchantId+createdAt, processorId+status

// Validation rules:
// 1. payment.requestedCurrency === transaction.requestedCurrency
// 2. payment.requestedAmount <= (transaction.requestedAmount - sum of other payments' paidRequestedAmount)
// 3. exchangeRate === '1' if collectionCurrency === requestedCurrency, otherwise > '0'
// 4. collectionAmount * exchangeRate ≈ requestedAmount
// 5. paidCollectionAmount * exchangeRate ≈ paidRequestedAmount
// 6. isPartialPayment = (paidRequestedAmount < requestedAmount)
```

---

## 3. Plugin Interfaces

### 3.1 Payment Processor Plugin Interface (Server-Side)

Location: Standalone packages (e.g., `/processor-stripe/`, `/processor-bitcoin/`)

```typescript
// ProcessorPlugin interface (server-side)
interface ProcessorPlugin {
  id: string;                    // 'stripe', 'bitcoin'
  displayName: string;
  supportedMethods: PaymentMethod[];

  // Lifecycle
  initialize(config: ProcessorConfig): Promise<void>;

  // Currency support
  getSupportedCurrencies(): Currency[];                    // currencies this processor can collect
  getExchangeRate?(from: Currency, to: Currency): Promise<ExchangeQuote>;  // optional: get current rate

  // Payment operations
  createPayment(request: CreatePaymentRequest): Promise<PaymentResult>;
  capturePayment(paymentId: string): Promise<PaymentResult>;
  refundPayment(paymentId: string, amount?: string): Promise<RefundResult>;

  // Status polling (for async methods like crypto)
  // Returns PaymentResult with updated paidRequestedAmount, paidCollectionAmount, and isPartialPayment
  checkPaymentStatus?(paymentId: string): Promise<PaymentResult>;

  // UI requirements
  getClientConfig(): ClientProcessorConfig;  // safe config for frontend
}

interface PaymentMethod {
  id: string;                 // 'card_present', 'crypto_btc'
  displayName: string;
  collectsCurrency: Currency;   // currency this method collects
}

// Request to create a payment
interface CreatePaymentRequest {
  transactionId: string;      // txn_{uuid}
  method: string;             // payment method id

  // What the merchant wants
  requestedAmount: string;    // decimal string
  requestedCurrency: Currency;  // merchant's currency

  // For cross-currency: processor determines collection currency from method
  // Processor returns the exchange rate and collected amount in PaymentResult
}

// Result from payment creation/status check
interface PaymentResult {
  paymentId: string;        // pay_{uuid}
  status: 'pending' | 'authorized' | 'captured' | 'failed';

  // What was requested
  requestedAmount: string;
  requestedCurrency: Currency;

  // What we expect to collect
  collectionAmount: string;
  collectionCurrency: Currency;

  // What was actually paid (updated when payment received)
  paidRequestedAmount: string;  // Actual paid in requestedCurrency
  paidCollectionAmount: string;  // Actual paid in collectionCurrency

  // Exchange rate: collectionAmount * exchangeRate = requestedAmount
  // Always present: '1' if currencies are the same, otherwise the conversion rate
  exchangeRate: string;

  // Indicates if payment was partial
  isPartialPayment: boolean;  // true if paidRequestedAmount < requestedAmount

  // Processor-specific data for UI (e.g., QR code, payment address)
  // This opaque object is passed to the processor's payment UI component
  processorData?: ProcessorUiData;

  errorMessage?: string;
}

// Opaque data structure passed between processor backend and UI
// The processor backend creates this object, and the UI component receives it
// The structure is processor-specific and opaque to the core system
interface ProcessorUiData {
  // Opaque data blob - structure defined by processor plugin
  // UI components receive this and interpret it according to processor's contract
  data: Record<string, unknown>;

  // Optional: UI launch conditions (when the UI should be shown)
  launchConditions?: UiLaunchConditions;

  // Optional: Metadata for UI rendering
  metadata?: {
    requiresUserInteraction?: boolean;  // true if UI needs user input
    canAutoLaunch?: boolean;            // true if UI can launch automatically
    estimatedDuration?: number;         // estimated seconds for completion
  };
}

// Conditions that determine when processor UI can be launched
interface UiLaunchConditions {
  // UI can be launched when payment status is one of these
  paymentStatuses?: ('pending' | 'authorized' | 'captured' | 'failed')[];

  // UI can be launched when transaction status is one of these
  transactionStatuses?: ('pending' | 'completed' | 'voided' | 'refunded')[];

  // UI requires specific device capabilities
  requiredCapabilities?: DeviceCapability[];

  // UI requires specific platform (if not specified, all platforms supported)
  requiredPlatforms?: ('ios' | 'android' | 'web' | 'electron')[];

  // UI can only be launched in specific GUI contexts
  allowedContexts?: ('merchant-gui' | 'customer-gui')[];
}

// Exchange rate quote (for display before payment)
interface ExchangeQuote {
  fromCurrency: Currency;
  toCurrency: Currency;
  rate: string;               // decimal string
  validUntil: Date;           // quote expiration
}
```

#### Processor UI Exports (Client-Side)

Processor plugins can export UI components for both admin configuration and payment flows. These UI components are bundled with the processor plugin and imported at build time by the respective GUI applications.

**Key Concepts:**
- Processor plugins export separate UI components for admin-gui and merchant-gui/customer-gui
- UI components receive opaque `ProcessorUiData` objects from the processor backend
- The structure of `ProcessorUiData` is defined by each processor plugin (opaque to core system)
- UI launch conditions determine when components can be displayed
- Data flows: Backend → `ProcessorUiData` → UI Component → Callbacks → Backend

```typescript
// Processor UI Exports interface (client-side)
interface ProcessorUiExports {
  // Metadata
  processorId: string;        // Must match ProcessorPlugin.id
  displayName: string;
  version: string;

  // Admin configuration UI (for admin-gui)
  adminUi?: ProcessorAdminUi;

  // Payment UI components (for merchant-gui and customer-gui)
  paymentUi?: ProcessorPaymentUi;
}

// Admin UI interface for processor configuration
interface ProcessorAdminUi {
  // React component for configuration UI
  ConfigComponent: React.ComponentType<ProcessorConfigProps>;

  // Optional: Validation function to check if config is valid before saving
  validateConfig?: (config: Record<string, unknown>) => Promise<ValidationResult>;

  // Optional: Settings component for advanced configuration
  SettingsComponent?: React.ComponentType<ProcessorSettingsProps>;
}

// Payment UI interface for payment flows
interface ProcessorPaymentUi {
  // Payment display component (rendered during payment collection)
  // This component receives ProcessorUiData from the backend
  PaymentComponent: React.ComponentType<ProcessorPaymentProps>;

  // Optional: Customer-facing display component (for customer-gui)
  CustomerDisplayComponent?: React.ComponentType<ProcessorCustomerDisplayProps>;

  // Optional: Method selection component (custom UI for choosing payment method)
  MethodSelectorComponent?: React.ComponentType<ProcessorMethodSelectorProps>;

  // Launch conditions for when payment UI can be shown
  launchConditions: UiLaunchConditions;
}

// Props passed to payment component
interface ProcessorPaymentProps {
  // Payment context
  payment: {
    id: string;             // pay_{uuid}
    method: string;
    processorId: string;

    // What merchant requested
    requestedAmount: string;
    requestedCurrency: Currency;

    // What we expect to collect
    collectionAmount: string;
    collectionCurrency: Currency;

    // What was actually paid (updated when payment received)
    paidRequestedAmount: string;
    paidCollectionAmount: string;

    exchangeRate: string;
    isPartialPayment: boolean;
    status: 'pending' | 'authorized' | 'captured' | 'failed';
  };

  // Opaque processor data (structure defined by processor plugin)
  processorData: ProcessorUiData;

  // Callbacks for UI to communicate with backend
  callbacks: ProcessorPaymentCallbacks;

  // Theme for consistent styling
  theme: Theme;

  // API client for making requests (if UI needs to call backend directly)
  api: {
    // Update payment status
    updatePaymentStatus: (paymentId: string, status: string, data?: Record<string, unknown>) => Promise<void>;
    // Send custom data back to processor backend
    sendProcessorData: (paymentId: string, data: Record<string, unknown>) => Promise<void>;
  };
}

// Callbacks that payment UI components can use to communicate with backend
interface ProcessorPaymentCallbacks {
  // Called when payment is successfully completed
  onPaymentComplete: (result: PaymentResult) => void;

  // Called when payment fails
  onPaymentFailed: (error: Error) => void;

  // Called when user cancels payment
  onCancel: () => void;

  // Called when UI needs to update payment status (e.g., user interaction required)
  onStatusUpdate?: (status: string, data?: Record<string, unknown>) => void;

  // Called when UI needs to send custom data to processor backend
  onDataUpdate?: (data: Record<string, unknown>) => void;
}

// Props for customer-facing display component
interface ProcessorCustomerDisplayProps {
  // Current transaction state
  transaction?: {
    requestedAmount: string;
    requestedCurrency: Currency;
    paidAmount?: string;
    paidCurrency: Currency;
    status: string;
  };

  // Opaque processor data for display
  processorData: ProcessorUiData;

  // Theme
  theme: Theme;
}

// Props for method selector component
interface ProcessorMethodSelectorProps {
  // Available payment methods for this processor
  methods: PaymentMethod[];

  // Selected method (if any)
  selectedMethod?: string;

  // Callback when method is selected
  onMethodSelect: (methodId: string) => void;

  // Theme
  theme: Theme;
}
```

#### Processor Plugin Export Pattern

Processor plugins export two separate objects:
1. **Server-side processor** - Payment processing logic (required)
2. **UI exports** - Admin and payment UI components (optional)

```typescript
// /processor-stripe/index.ts - Example processor plugin entry point

import { ProcessorPlugin } from '@paystation/server/types'
import { ProcessorUiExports } from '@paystation/common/types'
import { StripeProcessor } from './StripeProcessor'
import { StripeConfigComponent } from './StripeConfigComponent'
import { StripePaymentComponent } from './StripePaymentComponent'

// ============================================
// SERVER-SIDE EXPORTS (required)
// ============================================

// Server-side processor implementation
export const processor: ProcessorPlugin = {
  id: 'stripe',
  displayName: 'Stripe',
  supportedMethods: [
    {
      id: 'card_present',
      displayName: 'Tap to Pay',
      collectsCurrency: { type: 'fiat', currencyCode: 'USD' },
    },
    // ... more methods
  ],
  initialize: async (config) => { /* ... */ },
  getSupportedCurrencies: () => [/* ... */],
  createPayment: async (request) => {
    // Create payment intent with Stripe API
    const paymentIntent = await stripe.paymentIntents.create({
      amount: parseFloat(request.requestedAmount) * 100, // cents
      currency: request.requestedCurrency.currencyCode.toLowerCase(),
    });

    // Return PaymentResult with opaque processorData
    return {
      paymentId: request.paymentId,
      status: 'pending',
      requestedAmount: request.requestedAmount,
      requestedCurrency: request.requestedCurrency,
      collectionAmount: request.requestedAmount,
      collectionCurrency: request.requestedCurrency,
      paidRequestedAmount: '0.00',
      paidCollectionAmount: '0.00',
      exchangeRate: '1',
      isPartialPayment: false,
      // Opaque data passed to UI component
      processorData: {
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: request.requestedAmount,
          currency: request.requestedCurrency.currencyCode,
        },
        launchConditions: {
          paymentStatuses: ['pending'],
          requiredCapabilities: ['nfc'], // Tap to Pay requires NFC
          allowedContexts: ['merchant-gui'],
        },
        metadata: {
          requiresUserInteraction: true,
          canAutoLaunch: true,
          estimatedDuration: 30, // seconds
        },
      },
    };
  },
  // ... other methods
}

// ============================================
// CLIENT-SIDE UI EXPORTS (optional)
// ============================================

// Unified UI exports for admin and payment interfaces
export const uiExports: ProcessorUiExports = {
  processorId: 'stripe',
  displayName: 'Stripe',
  version: '1.0.0',

  // Admin configuration UI
  adminUi: {
  ConfigComponent: StripeConfigComponent,
  validateConfig: async (config) => {
    // Validate API keys, etc.
    return { valid: true }
    },
  },

  // Payment UI components
  paymentUi: {
    PaymentComponent: StripePaymentComponent,
    launchConditions: {
      paymentStatuses: ['pending'],
      requiredCapabilities: ['nfc'],
      allowedContexts: ['merchant-gui'],
      requiredPlatforms: ['ios', 'android'], // Tap to Pay only on mobile
    },
  },
}
```

**Export Structure:**
- **Server-side**: `export const processor: ProcessorPlugin` (required)
- **Client-side UI**: `export const uiExports: ProcessorUiExports` (optional)

**Note**: If `uiExports` is not provided, the system will:
- Use a generic configuration form for admin-gui (if no `adminUi`)
- Require external UI plugins for payment flows (if no `paymentUi`)

#### Admin-GUI Integration with Processor UI

The admin-gui imports processor plugins at build time and uses their `uiExports.adminUi` exports to render custom configuration interfaces:

```typescript
// admin-gui/src/processors/registry.ts

import { uiExports as stripeUi } from '@paystation/processor-stripe'
import { uiExports as bitcoinUi } from '@paystation/processor-bitcoin'
import type { ProcessorUiExports } from '@paystation/common/types'

// Registry of processor UI exports
const processorUis: Record<string, ProcessorUiExports | undefined> = {
  stripe: stripeUi,
  bitcoin: bitcoinUi,
  // Processors without uiExports will be undefined
}

export function getProcessorUi(processorId: string): ProcessorUiExports | undefined {
  return processorUis[processorId]
}

export function getProcessorAdminUi(processorId: string) {
  return processorUis[processorId]?.adminUi
}

export function hasProcessorAdminUi(processorId: string): boolean {
  return processorUis[processorId]?.adminUi !== undefined
}
```

```typescript
// admin-gui/src/processors/ProcessorConfigPage.tsx

import React from 'react'
import { getProcessorAdminUi } from './registry'
import { GenericProcessorConfig } from './GenericProcessorConfig'

interface ProcessorConfigPageProps {
  merchantId: string
  processorId: string
  existingConfig?: ProcessorConfig
  onSave: (config: ProcessorConfig) => Promise<void>
  onCancel: () => void
}

export const ProcessorConfigPage: React.FC<ProcessorConfigPageProps> = ({
  merchantId,
  processorId,
  existingConfig,
  onSave,
  onCancel,
}) => {
  const adminUi = getProcessorAdminUi(processorId)

  // Use custom config UI if available
  if (adminUi) {
    const { ConfigComponent } = adminUi
    return (
      <ConfigComponent
        existingConfig={existingConfig}
        merchantId={merchantId}
        onSave={onSave}
        onCancel={onCancel}
        api={{
          saveConfig: async (config) => {
            const response = await fetch(`/api/merchants/${merchantId}/processors`, {
              method: existingConfig ? 'PUT' : 'POST',
              body: JSON.stringify(config),
            })
            return response.json()
          },
          testConnection: async (config) => {
            const response = await fetch(`/api/processors/${processorId}/test`, {
              method: 'POST',
              body: JSON.stringify(config),
            })
            return response.json()
          },
        }}
      />
    )
  }

  // Fallback to generic configuration form
  return (
    <GenericProcessorConfig
      processorId={processorId}
      existingConfig={existingConfig}
      onSave={onSave}
      onCancel={onCancel}
    />
  )
}
```

#### Merchant-GUI Integration with Processor Payment UI

The merchant-gui imports processor plugins at build time and uses their `uiExports.paymentUi` exports to render payment interfaces:

```typescript
// merchant-gui/src/processors/registry.ts

import { uiExports as stripeUi } from '@paystation/processor-stripe'
import { uiExports as bitcoinUi } from '@paystation/processor-bitcoin'
import type { ProcessorUiExports } from '@paystation/common/types'

// Registry of processor UI exports
const processorUis: Record<string, ProcessorUiExports | undefined> = {
  stripe: stripeUi,
  bitcoin: bitcoinUi,
}

export function getProcessorPaymentUi(processorId: string) {
  return processorUis[processorId]?.paymentUi
}

export function canLaunchPaymentUi(
  processorId: string,
  payment: Payment,
  deviceCapabilities: DeviceCapability[],
  platform: 'ios' | 'android' | 'web' | 'electron',
  context: 'merchant-gui' | 'customer-gui'
): boolean {
  const paymentUi = getProcessorPaymentUi(processorId)
  if (!paymentUi) return false

  const conditions = paymentUi.launchConditions

  // Check payment status
  if (conditions.paymentStatuses && !conditions.paymentStatuses.includes(payment.status)) {
    return false
  }

  // Check device capabilities
  if (conditions.requiredCapabilities) {
    const hasAllCapabilities = conditions.requiredCapabilities.every(cap =>
      deviceCapabilities.includes(cap)
    )
    if (!hasAllCapabilities) return false
  }

  // Check platform
  if (conditions.requiredPlatforms && !conditions.requiredPlatforms.includes(platform)) {
    return false
  }

  // Check context
  if (conditions.allowedContexts && !conditions.allowedContexts.includes(context)) {
    return false
  }

  return true
}
```

```typescript
// merchant-gui/src/payments/ProcessorPaymentHost.tsx

import React from 'react'
import { View, Text } from 'react-native'
import { getProcessorPaymentUi, canLaunchPaymentUi } from '../processors/registry'
import { useTheme } from '../themes/ThemeContext'
import type { Payment, PaymentResult } from '@paystation/common/types'

interface ProcessorPaymentHostProps {
  payment: Payment
  processorData: ProcessorUiData
  deviceCapabilities: DeviceCapability[]
  platform: 'ios' | 'android' | 'web' | 'electron'
  onPaymentComplete: (result: PaymentResult) => void
  onPaymentFailed: (error: Error) => void
  onCancel: () => void
}

export const ProcessorPaymentHost: React.FC<ProcessorPaymentHostProps> = ({
  payment,
  processorData,
  deviceCapabilities,
  platform,
  onPaymentComplete,
  onPaymentFailed,
  onCancel,
}) => {
  const theme = useTheme()
  const paymentUi = getProcessorPaymentUi(payment.processorId)

  // Check if UI can be launched
  if (!paymentUi || !canLaunchPaymentUi(
    payment.processorId,
    payment,
    deviceCapabilities,
    platform,
    'merchant-gui'
  )) {
    return (
      <View>
        <Text>Payment UI not available for processor: {payment.processorId}</Text>
      </View>
    )
  }

  const { PaymentComponent } = paymentUi

  return (
    <PaymentComponent
      payment={{
        id: payment._id,
        method: payment.method,
        processorId: payment.processorId,
        requestedAmount: payment.requestedAmount,
        requestedCurrency: payment.requestedCurrency,
        collectionAmount: payment.collectionAmount,
        collectionCurrency: payment.collectionCurrency,
        paidRequestedAmount: payment.paidRequestedAmount,
        paidCollectionAmount: payment.paidCollectionAmount,
        exchangeRate: payment.exchangeRate,
        isPartialPayment: payment.isPartialPayment,
        status: payment.status,
      }}
      processorData={processorData}
      callbacks={{
        onPaymentComplete,
        onPaymentFailed,
        onCancel,
        onStatusUpdate: async (status, data) => {
          // Update payment status via API
          await fetch(`/api/payments/${payment._id}/status`, {
            method: 'POST',
            body: JSON.stringify({ status, data }),
          })
        },
        onDataUpdate: async (data) => {
          // Send custom data to processor backend
          await fetch(`/api/payments/${payment._id}/processor-data`, {
            method: 'POST',
            body: JSON.stringify(data),
          })
        },
      }}
      theme={theme}
      api={{
        updatePaymentStatus: async (paymentId, status, data) => {
          const response = await fetch(`/api/payments/${paymentId}/status`, {
            method: 'POST',
            body: JSON.stringify({ status, data }),
          })
          return response.json()
        },
        sendProcessorData: async (paymentId, data) => {
          const response = await fetch(`/api/payments/${paymentId}/processor-data`, {
            method: 'POST',
            body: JSON.stringify(data),
          })
          return response.json()
        },
      }}
    />
  )
}
```

#### Example: Stripe Payment Component

This example shows how a processor payment component receives and uses opaque `ProcessorUiData`:

```typescript
// processor-stripe/StripePaymentComponent.tsx

import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { useStripe } from '@stripe/stripe-react-native'
import type { ProcessorPaymentProps } from '@paystation/common/types'

export const StripePaymentComponent: React.FC<ProcessorPaymentProps> = ({
  payment,
  processorData,
  callbacks,
  theme,
  api,
}) => {
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  // Extract opaque data from processorData
  // The structure is defined by the Stripe processor backend
  const { clientSecret, paymentIntentId, amount, currency } = processorData.data as {
    clientSecret: string
    paymentIntentId: string
    amount: string
    currency: string
  }

  useEffect(() => {
    // Initialize payment sheet with client secret from processor backend
    const initializePayment = async () => {
      try {
        const { error: initError } = await initPaymentSheet({
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: 'Paystation Merchant',
        })

        if (initError) {
          setError(initError.message)
          callbacks.onPaymentFailed(new Error(initError.message))
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize payment'
        setError(errorMessage)
        callbacks.onPaymentFailed(new Error(errorMessage))
      }
    }

    initializePayment()
  }, [clientSecret, initPaymentSheet])

  const handlePayment = async () => {
    setLoading(true)
    setError(undefined)

    try {
      // Present payment sheet (Tap to Pay on iOS/Android)
      const { error: presentError } = await presentPaymentSheet()

      if (presentError) {
        setError(presentError.message)
        callbacks.onPaymentFailed(new Error(presentError.message))
        return
      }

      // Payment succeeded - verify with backend
      const response = await api.updatePaymentStatus(payment.id, 'captured', {
        paymentIntentId,
      })

      // Notify parent component
      callbacks.onPaymentComplete({
        paymentId: payment.id,
        status: 'captured',
        requestedAmount: payment.requestedAmount,
        requestedCurrency: payment.requestedCurrency,
        collectionAmount: payment.collectionAmount,
        collectionCurrency: payment.collectionCurrency,
        paidRequestedAmount: payment.requestedAmount,
        paidCollectionAmount: payment.collectionAmount,
        exchangeRate: payment.exchangeRate,
        isPartialPayment: false,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Payment failed'
      setError(errorMessage)
      callbacks.onPaymentFailed(new Error(errorMessage))
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={{ padding: theme.rem(2) }}>
      <Text style={{ fontSize: theme.rem(1.5), fontWeight: 'bold' }}>
        Pay {currency} {amount}
      </Text>

      {error && (
        <Text style={{ color: 'red', marginTop: theme.rem(1) }}>{error}</Text>
      )}

      <TouchableOpacity
        onPress={handlePayment}
        disabled={loading}
        style={{
          marginTop: theme.rem(2),
          padding: theme.rem(1),
          backgroundColor: loading ? '#ccc' : '#007AFF',
          borderRadius: theme.rem(0.5),
        }}
      >
        <Text style={{ color: 'white', textAlign: 'center' }}>
          {loading ? 'Processing...' : 'Tap to Pay'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={callbacks.onCancel}
        style={{ marginTop: theme.rem(1) }}
      >
        <Text style={{ textAlign: 'center' }}>Cancel</Text>
      </TouchableOpacity>
    </View>
  )
}
```

#### Example: Bitcoin Payment Component

This example shows how a crypto processor uses opaque data for QR code display:

```typescript
// processor-bitcoin/BitcoinPaymentComponent.tsx

import React, { useEffect } from 'react'
import { View, Text } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import type { ProcessorPaymentProps } from '@paystation/common/types'

export const BitcoinPaymentComponent: React.FC<ProcessorPaymentProps> = ({
  payment,
  processorData,
  callbacks,
  theme,
}) => {
  // Extract opaque data from processorData
  // The structure is defined by the Bitcoin processor backend
  const { qrCode, paymentAddress, expectedAmount } = processorData.data as {
    qrCode: string
    paymentAddress: string
    expectedAmount: string
  }

  // Monitor payment status (processor backend polls blockchain)
  useEffect(() => {
    // The component receives WebSocket updates via parent component
    // When payment is detected, callbacks.onPaymentComplete is called
  }, [])

    return (
    <View style={{ padding: theme.rem(2), alignItems: 'center' }}>
      <Text style={{ fontSize: theme.rem(1.5), fontWeight: 'bold' }}>
        Pay {payment.collectionCurrency.chainId} {payment.collectionAmount}
      </Text>

      {payment.exchangeRate !== '1' && (
        <Text style={{ fontSize: theme.rem(1), color: theme.secondaryText }}>
          ≈ {payment.requestedCurrency.currencyCode} {payment.requestedAmount}
        </Text>
      )}

      <View style={{ marginTop: theme.rem(2), padding: theme.rem(1), backgroundColor: '#fff' }}>
        <QRCode value={qrCode} size={200} />
      </View>

      <Text style={{ marginTop: theme.rem(1), fontSize: theme.rem(0.75) }}>
        {paymentAddress}
      </Text>

      <Text style={{ marginTop: theme.rem(1), fontSize: theme.rem(0.75), color: theme.secondaryText }}>
        Send exactly {expectedAmount} BTC
      </Text>

      <TouchableOpacity
        onPress={callbacks.onCancel}
        style={{ marginTop: theme.rem(2) }}
      >
        <Text>Cancel</Text>
      </TouchableOpacity>
    </View>
  )
}
```

#### Example: Stripe Configuration Component

```typescript
// processor-stripe/StripeConfigComponent.tsx

import React, { useState } from 'react'
import type { ProcessorConfigProps } from '@paystation/common/types'

export const StripeConfigComponent: React.FC<ProcessorConfigProps> = ({
  existingConfig,
  merchantId,
  onSave,
  onCancel,
  api,
}) => {
  const [apiKey, setApiKey] = useState(existingConfig?.credentials?.apiKey || '')
  const [testMode, setTestMode] = useState(existingConfig?.settings?.testMode ?? true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const handleSave = async () => {
    setLoading(true)
    setError(undefined)

    try {
      const config: ProcessorConfig = {
        merchantId,
        processorId: 'stripe',
        displayName: 'Stripe',
        credentials: {
          apiKey, // In production, this should be encrypted
        },
        enabledMethods: ['card_present'],
        settings: {
          testMode,
        },
        status: 'active',
      }

      await api.saveConfig(config)
      await onSave(config)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2>Stripe Configuration</h2>

      <div>
        <label>API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk_test_..."
        />
      </div>

      <div>
        <label>
          <input
            type="checkbox"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
          />
          Test Mode
        </label>
      </div>

      {error && <div style={{ color: 'red' }}>{error}</div>}

      <div>
        <button onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
```

### 3.2 Processor UI Exports

Processor plugins export their own UI components directly. This approach provides:
- **Self-contained:** Processor and UI are bundled together
- **Type-safe:** UI components know the exact structure of `processorData`
- **Simpler deployment:** One package instead of multiple
- **Better encapsulation:** Processor controls its own UI

**Usage:**
- Processor exports `uiExports.paymentUi.PaymentComponent`
- Merchant-gui imports processor plugin and uses its UI component
- Component receives opaque `ProcessorUiData` from backend
- Component extracts data using known structure

---

## 4. API Endpoints

### REST API (HTTP)

**Authentication**

- `POST /api/auth/login` - Admin portal login
- `POST /api/auth/device` - Device auth key validation
- `POST /api/auth/logout` - Logout

**Merchants** (admin only)

- `GET/POST /api/merchants`
- `GET/PUT/DELETE /api/merchants/:id`

**Stores**

- `GET/POST /api/merchants/:merchantId/stores`
- `GET/PUT/DELETE /api/stores/:id`

**Devices**

- `GET/POST /api/stores/:storeId/devices`
- `POST /api/devices/:id/regenerate-key`
- `DELETE /api/devices/:id`

**Processors**

- `GET /api/processors` - List available processor plugins
- `GET/POST /api/merchants/:merchantId/processors` - Configured processors
- `PUT/DELETE /api/merchants/:merchantId/processors/:processorId`

**Transactions**

- `POST /api/transactions` - Create new transaction
- `GET /api/transactions/:id`
- `POST /api/transactions/:id/void`
- `POST /api/transactions/:id/refund`

**Payments**

- `POST /api/transactions/:transactionId/payments` - Initiate payment
- `GET /api/payments/:id`
- `POST /api/payments/:id/capture`

### WebSocket Events

**Client -> Server**

```typescript
{ type: 'subscribe', channel: 'store:{storeId}' }
{ type: 'subscribe', channel: 'transaction:{transactionId}' }
{ type: 'display:sync', storeId, displayState }
```

**Server -> Client**

```typescript
{ type: 'payment:status', paymentId, status, data }
{ type: 'transaction:updated', transactionId, transaction }
{ type: 'display:sync', storeId, displayState }
```

---

## 5. Authentication Flow

### Admin Portal (admin-gui)

1. User submits email/password to `POST /api/auth/login`
2. Server validates credentials, returns JWT token
3. Token stored in browser, sent in `Authorization` header

### Frontend Devices (merchant-gui, customer-gui)

1. Admin creates device in portal, receives one-time auth key display
2. User enters auth key in frontend app settings
3. App calls `POST /api/auth/device` with:
   - `authKey`: The device's authentication key
   - `capabilities`: `DeviceCapability[]` (e.g., `['nfc', 'printer', 'create_transactions']`)
   - `appType`: Optional hint (`'merchant-gui'` or `'customer-gui'`)
4. Server:
   - Validates auth key against `paystation_devices` database
   - Updates device record with provided capabilities and `lastSeenAt`
   - Returns device JWT + device config (merchantId, storeId, processors, enabled plugins)
5. App stores JWT, uses for all subsequent requests
6. Device availability tracked via WebSocket connection (ephemeral, not stored in DB)

---

## 6. MVP Implementation Phases

### Phase 1: Core Infrastructure

- [ ] Update CouchDB schema in `src/server/db/couch.ts`
- [ ] Create cleaner types in `src/server/types/db.ts`
- [ ] Implement basic REST routes (merchants, stores, devices)
- [ ] Add WebSocket server alongside Express

### Phase 2: Processor Plugin System

- [ ] Define processor plugin interface in `src/server/processors/types.ts`
- [ ] Implement plugin loader/registry
- [ ] Create Stripe processor plugin (Tap to Pay)
- [ ] Create Bitcoin template plugin (stubbed)

### Phase 3: Processor UI System

- [ ] Define processor UI export interfaces in `common/types/processorPlugin.ts`
- [ ] Create ProcessorPaymentHost component for merchant-gui
- [ ] Create processor UI registry and launch condition checking
- [ ] Implement processor UI exports for Stripe and Bitcoin processors

### Phase 4: Authentication

- [ ] User authentication (admin portal)
- [ ] Device authentication (auth keys)
- [ ] JWT middleware for routes

### Phase 5: Transaction Flow

- [ ] Transaction creation endpoint
- [ ] Payment initiation with processor routing
- [ ] Payment status updates via WebSocket
- [ ] Transaction completion/voiding

### Phase 6: merchant-gui MVP

- [ ] Simple amount entry screen
- [ ] Payment method selection (from configured processors)
- [ ] Stripe Tap to Pay integration using processor UI component
- [ ] Bitcoin payment UI using processor UI component
- [ ] Payment result screen

---

## 7. Key Files to Create/Modify

| File | Purpose |
|------|---------|
| `src/server/db/couch.ts` | Update with new schema |
| `src/server/types/db.ts` | Cleaner types for all documents |
| `common/types/processorPlugin.ts` | Processor plugin interface and UI exports |
| `processor-stripe/` | Stripe processor plugin with UI components |
| `processor-bitcoin/` | Bitcoin processor template with UI components |
| `merchant-gui/src/processors/` | Processor UI registry and host |
| `merchant-gui/src/payments/` | ProcessorPaymentHost component |
| `src/server/routes/` | REST API routes |
| `src/server/ws/` | WebSocket server |
