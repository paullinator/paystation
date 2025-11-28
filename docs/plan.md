# Paystation MVP Implementation Plan

## Goal

Build an MVP that supports:
- **Stripe payments** with Tap to Pay (card present payments)
- **Bitcoin payment template** with QR code display for crypto payments
- **Merchant terminal app** (merchant-gui) for processing payments
- **Admin web portal** (admin-gui) for configuration

---

## Phase 1: Core Infrastructure & Database Setup

### Step 1.1: Database Schema & Types

**Files to create/modify:**
- `src/common/types.ts` - Shared types (Currency, DeviceCapability, etc.)
- `src/server/types/db.ts` - Database document types
- `src/server/db/couch.ts` - CouchDB connection and database initialization

**Tasks:**
1. Define `Currency` type (fiat and crypto support)
2. Define `DeviceCapability` enum
3. Create typed document interfaces:
   - `UserDoc`, `MerchantDoc`, `StoreDoc`, `DeviceDoc`
   - `ProcessorConfigDoc`, `TransactionDoc`, `PaymentDoc`
4. Implement UUID generation utility with base58 encoding
5. Update `couch.ts` to:
   - Create all required databases
   - Add database initialization function
   - Add helper functions for each database (insert, get, update, find)

**Validation:**
- Run `yarn setup` to initialize databases
- Verify all databases are created in CouchDB
- Test UUID generation produces valid IDs

---

### Step 1.2: Basic REST API Routes

**Files to create:**
- `src/server/routes/merchants.ts`
- `src/server/routes/stores.ts`
- `src/server/routes/devices.ts`
- `src/server/routes/processors.ts`
- `src/server/middleware/withAuth.ts` - JWT authentication middleware (stub for now)

**Tasks:**
1. Create Express route handlers for:
   - `GET/POST /api/merchants`
   - `GET/PUT/DELETE /api/merchants/:id`
   - `GET/POST /api/merchants/:merchantId/stores`
   - `GET/PUT/DELETE /api/stores/:id`
   - `GET/POST /api/stores/:storeId/devices`
   - `DELETE /api/devices/:id`
   - `GET /api/processors` - List available processor plugins
   - `GET/POST /api/merchants/:merchantId/processors`
   - `PUT/DELETE /api/merchants/:merchantId/processors/:processorId`
2. Add basic validation and error handling
3. Integrate routes into main server (`src/server/index.ts`)

**Validation:**
- Test all endpoints with curl/Postman
- Verify data is saved to CouchDB correctly
- Check error handling for invalid inputs

---

### Step 1.3: WebSocket Server

**Files to create:**
- `src/server/ws/websocket.ts` - WebSocket server implementation
- `src/server/ws/types.ts` - WebSocket message types

**Tasks:**
1. Set up WebSocket server alongside Express
2. Implement connection management
3. Implement channel subscription system:
   - `{ type: 'subscribe', channel: 'store:{storeId}' }`
   - `{ type: 'subscribe', channel: 'transaction:{transactionId}' }`
4. Implement broadcast function for server-to-client messages
5. Add connection cleanup on disconnect

**Validation:**
- Test WebSocket connection from client
- Test subscription to channels
- Test broadcast messages are received

---

## Phase 2: Processor Plugin System

### Step 2.1: Processor Plugin Interface

**Files to create:**
- `src/common/types/processorPlugin.ts` - Processor plugin interfaces

**Tasks:**
1. Define `ProcessorPlugin` interface:
   - `id`, `displayName`, `supportedMethods`
   - `initialize()`, `createPayment()`, `capturePayment()`, `refundPayment()`
   - `checkPaymentStatus?()`, `getSupportedCurrencies()`, `getExchangeRate?()`
   - `getClientConfig()`
2. Define `PaymentMethod` interface
3. Define `CreatePaymentRequest` interface
4. Define `PaymentResult` interface with `ProcessorUiData`
5. Define `ProcessorUiData` and `UiLaunchConditions` interfaces
6. Define `ExchangeQuote` interface

**Validation:**
- TypeScript compilation succeeds
- All interfaces are properly exported

---

### Step 2.2: Processor Plugin Registry

**Files to create:**
- `src/server/processors/registry.ts` - Plugin loader and registry
- `src/server/processors/types.ts` - Re-export processor types

**Tasks:**
1. Create plugin registry that:
   - Loads processor plugins from `processor-*/` directories
   - Stores processors by ID
   - Provides `getProcessor(id)` function
2. Add plugin discovery mechanism
3. Add plugin initialization on server start

**Validation:**
- Registry can load and retrieve processors
- Missing processors return undefined gracefully

---

### Step 2.3: Stripe Processor Plugin

**Files to create:**
- `processor-stripe/package.json` - Stripe processor package
- `processor-stripe/src/StripeProcessor.ts` - Main processor implementation
- `processor-stripe/src/index.ts` - Plugin exports
- `processor-stripe/tsconfig.json` - TypeScript config

**Tasks:**
1. Create Stripe processor that:
   - Implements `ProcessorPlugin` interface
   - Supports `card_present` payment method
   - Uses Stripe API to create PaymentIntents
   - Returns `PaymentResult` with `processorData` containing:
     - `clientSecret` for Stripe SDK
     - `paymentIntentId`
     - Launch conditions (NFC required, iOS/Android only)
2. Add Stripe SDK dependency
3. Implement `createPayment()` to create PaymentIntent
4. Implement `capturePayment()` to verify payment status
5. Implement `getSupportedCurrencies()` for fiat currencies
6. Export `processor` object

**Validation:**
- Processor can be loaded by registry
- `createPayment()` creates Stripe PaymentIntent
- Returns valid `PaymentResult` with opaque `processorData`

---

### Step 2.4: Bitcoin Processor Template

**Files to create:**
- `processor-bitcoin/package.json` - Bitcoin processor package
- `processor-bitcoin/src/BitcoinProcessor.ts` - Main processor implementation
- `processor-bitcoin/src/index.ts` - Plugin exports
- `processor-bitcoin/tsconfig.json` - TypeScript config

**Tasks:**
1. Create Bitcoin processor template that:
   - Implements `ProcessorPlugin` interface
   - Supports `crypto_btc` payment method
   - Generates Bitcoin payment addresses (stubbed for MVP)
   - Returns `PaymentResult` with `processorData` containing:
     - `qrCode` string
     - `paymentAddress`
     - `expectedAmount`
     - Launch conditions (any platform, merchant-gui or customer-gui)
2. Implement `getExchangeRate()` to fetch BTC/USD rate (stubbed)
3. Implement `checkPaymentStatus()` to check blockchain (stubbed for MVP)
4. Export `processor` object

**Validation:**
- Processor can be loaded by registry
- `createPayment()` generates payment address and QR code
- Returns valid `PaymentResult` with opaque `processorData`

---

## Phase 3: Processor UI System

### Step 3.1: Processor UI Export Interfaces

**Files to modify:**
- `src/common/types/processorPlugin.ts` - Add UI export interfaces

**Tasks:**
1. Define `ProcessorUiExports` interface
2. Define `ProcessorAdminUi` interface
3. Define `ProcessorPaymentUi` interface
4. Define `ProcessorPaymentProps` interface
5. Define `ProcessorPaymentCallbacks` interface
6. Define `ProcessorConfigProps` interface

**Validation:**
- All interfaces compile correctly
- Interfaces are properly exported

---

### Step 3.2: Stripe Payment UI Component

**Files to create:**
- `processor-stripe/src/StripePaymentComponent.tsx` - Payment UI component
- `processor-stripe/src/StripeConfigComponent.tsx` - Admin config UI component

**Tasks:**
1. Create `StripePaymentComponent` that:
   - Receives `ProcessorPaymentProps`
   - Extracts `clientSecret` from opaque `processorData.data`
   - Uses Stripe React Native SDK to initialize payment sheet
   - Presents Tap to Pay interface
   - Calls `callbacks.onPaymentComplete()` on success
   - Calls `callbacks.onPaymentFailed()` on error
2. Create `StripeConfigComponent` for admin-gui:
   - Form to enter Stripe API keys
   - Test connection button
   - Save/cancel handlers
3. Export `uiExports` object with:
   - `adminUi` with `ConfigComponent`
   - `paymentUi` with `PaymentComponent` and launch conditions

**Validation:**
- Component can extract data from `processorData`
- Component renders correctly
- Callbacks are called appropriately

---

### Step 3.3: Bitcoin Payment UI Component

**Files to create:**
- `processor-bitcoin/src/BitcoinPaymentComponent.tsx` - Payment UI component
- `processor-bitcoin/src/BitcoinConfigComponent.tsx` - Admin config UI component

**Tasks:**
1. Create `BitcoinPaymentComponent` that:
   - Receives `ProcessorPaymentProps`
   - Extracts `qrCode`, `paymentAddress`, `expectedAmount` from opaque `processorData.data`
   - Displays QR code using react-native-qrcode-svg
   - Shows payment address and amount
   - Handles cancel callback
2. Create `BitcoinConfigComponent` for admin-gui:
   - Simple form for Bitcoin processor settings
   - Exchange rate API configuration (optional)
3. Export `uiExports` object with:
   - `adminUi` with `ConfigComponent`
   - `paymentUi` with `PaymentComponent` and launch conditions

**Validation:**
- Component displays QR code correctly
- Component extracts data from `processorData`
- QR code is scannable

---

### Step 3.4: Processor UI Registry (Merchant-GUI)

**Files to create:**
- `merchant-gui/src/processors/registry.ts` - Processor UI registry

**Tasks:**
1. Import `uiExports` from processor plugins:
   - `@paystation/processor-stripe`
   - `@paystation/processor-bitcoin`
2. Create registry functions:
   - `getProcessorUi(processorId)`
   - `getProcessorPaymentUi(processorId)`
   - `getProcessorAdminUi(processorId)`
   - `canLaunchPaymentUi(processorId, payment, capabilities, platform, context)`
3. Implement launch condition checking logic

**Validation:**
- Registry can retrieve processor UIs
- Launch condition checking works correctly

---

### Step 3.5: ProcessorPaymentHost Component

**Files to create:**
- `merchant-gui/src/payments/ProcessorPaymentHost.tsx` - Host component for processor UIs

**Tasks:**
1. Create component that:
   - Receives payment and processorData as props
   - Checks launch conditions using registry
   - Retrieves processor's `PaymentComponent`
   - Renders processor UI component with:
     - Payment context
     - Opaque `processorData`
     - Callbacks (onPaymentComplete, onPaymentFailed, onCancel)
     - Theme
     - API client
2. Handle missing processor UI gracefully
3. Handle launch condition failures

**Validation:**
- Component renders processor UI correctly
- Callbacks are passed through properly
- Error handling works

---

## Phase 4: Authentication

### Step 4.1: User Authentication (Admin Portal)

**Files to create/modify:**
- `src/server/routes/auth.ts` - Authentication routes
- `src/server/middleware/withAuth.ts` - JWT authentication middleware
- `src/server/util/jwt.ts` - JWT token generation/verification

**Tasks:**
1. Implement JWT token generation and verification
2. Create `POST /api/auth/login` endpoint:
   - Validate email/password
   - Check user in database
   - Generate JWT token
   - Return token and user info
3. Create `POST /api/auth/logout` endpoint (optional for MVP)
4. Update `withAuth` middleware to:
   - Extract JWT from Authorization header
   - Verify token
   - Attach user to request object
5. Protect admin routes with `withAuth` middleware

**Validation:**
- Login endpoint returns valid JWT
- Protected routes require valid token
- Invalid tokens are rejected

---

### Step 4.2: Device Authentication

**Files to modify:**
- `src/server/routes/auth.ts` - Add device auth endpoint
- `src/server/routes/devices.ts` - Add device key generation

**Tasks:**
1. Create `POST /api/devices/:id/regenerate-key` endpoint:
   - Generate random auth key
   - Hash and store in device document
   - Return plaintext key (one-time display)
2. Create `POST /api/auth/device` endpoint:
   - Accept `authKey`, `capabilities`, `appType`
   - Look up device by hashed auth key
   - Verify device exists and is active
   - Update device with capabilities and `lastSeenAt`
   - Generate device JWT token
   - Return token and device config (merchantId, storeId, processors)
3. Create device JWT payload structure

**Validation:**
- Device key generation works
- Device authentication returns valid JWT
- Device config includes correct merchant/store info

---

## Phase 5: Transaction & Payment Flow

### Step 5.1: Transaction Creation

**Files to create:**
- `src/server/routes/transactions.ts` - Transaction routes
- `src/server/payments/utils.ts` - Payment utility functions

**Tasks:**
1. Create `POST /api/transactions` endpoint:
   - Accept transaction data (merchantId, storeId, deviceId, requestedAmount, requestedCurrency)
   - Generate receipt number
   - Create transaction document with status 'pending'
   - Return transaction document
2. Create `GET /api/transactions/:id` endpoint
3. Add validation for transaction creation
4. Implement receipt number generation

**Validation:**
- Transactions are created in database
- Receipt numbers are unique
- Validation rejects invalid data

---

### Step 5.2: Payment Initiation

**Files to create/modify:**
- `src/server/routes/payments.ts` - Payment routes
- `src/server/payments/utils.ts` - Add remaining amount calculation

**Tasks:**
1. Create `POST /api/transactions/:transactionId/payments` endpoint:
   - Get transaction from database
   - Calculate remaining amount owed
   - Get processor from registry
   - Call `processor.createPayment()` with:
     - Transaction ID
     - Payment method
     - Requested amount and currency
   - Create payment document with status 'pending'
   - Return `PaymentResult` with `processorData`
2. Implement `getRemainingOwed()` function:
   - Query all captured payments for transaction
   - Sum `paidRequestedAmount`
   - Return `requestedAmount - sum`
3. Add validation:
   - Transaction exists and is pending
   - Payment amount <= remaining owed
   - Processor is configured for merchant

**Validation:**
- Payments are created correctly
- Remaining amount calculation is accurate
- Validation prevents overpayment

---

### Step 5.3: Payment Confirmation & Status Updates

**Files to modify:**
- `src/server/routes/payments.ts` - Add confirmation endpoint
- `src/server/payments/reconciliation.ts` - Payment reconciliation logic

**Tasks:**
1. Create `POST /api/payments/:id/confirm` endpoint:
   - Get payment from database
   - Get processor from registry
   - Call `processor.capturePayment()` or verify with processor API
   - Update payment document:
     - Set `paidRequestedAmount` and `paidCollectionAmount`
     - Update status to 'captured'
   - Call `reconcilePayment()` to check for partial payments
   - Broadcast WebSocket update
2. Create `GET /api/payments/:id` endpoint
3. Create `reconcilePayment()` function:
   - Update payment with actual amounts
   - Check if payment is partial
   - If partial, calculate shortfall
   - Check transaction completion
4. Create `checkTransactionCompletion()` function:
   - Sum all captured payments
   - Compare to transaction requestedAmount
   - Update transaction status to 'completed' if full amount paid

**Validation:**
- Payment confirmation updates database correctly
- Partial payments are detected
- Transaction completion is detected
- WebSocket updates are broadcast

---

### Step 5.4: WebSocket Integration

**Files to modify:**
- `src/server/routes/payments.ts` - Add WebSocket broadcasts
- `src/server/routes/transactions.ts` - Add WebSocket broadcasts

**Tasks:**
1. Broadcast `payment:status` events when:
   - Payment is created
   - Payment status changes
   - Payment is confirmed
2. Broadcast `transaction:updated` events when:
   - Transaction is created
   - Transaction status changes
   - Transaction is completed
3. Implement channel subscriptions for:
   - `store:{storeId}`
   - `transaction:{transactionId}`

**Validation:**
- WebSocket events are broadcast correctly
- Clients receive updates in real-time
- Subscriptions work properly

---

## Phase 6: Merchant-GUI MVP

### Step 6.1: Merchant-GUI Setup

**Files to create:**
- `merchant-gui/package.json` - React Native app package
- `merchant-gui/tsconfig.json` - TypeScript config
- `merchant-gui/src/index.tsx` - App entry point
- `merchant-gui/src/App.tsx` - Main app component

**Tasks:**
1. Set up React Native project structure
2. Install dependencies:
   - React Native
   - React Native Patina (theming)
   - React Native QR Code SVG
   - Stripe React Native SDK
   - WebSocket client
3. Set up navigation (React Navigation)
4. Set up theme context
5. Create basic app structure

**Validation:**
- App builds and runs
- Navigation works
- Theme is applied

---

### Step 6.2: Device Authentication Screen

**Files to create:**
- `merchant-gui/src/screens/DeviceAuthScreen.tsx`

**Tasks:**
1. Create screen that:
   - Prompts for device auth key
   - Collects device capabilities
   - Calls `POST /api/auth/device`
   - Stores JWT token
   - Navigates to main app on success
2. Add error handling
3. Add loading states

**Validation:**
- Device authentication works
- JWT is stored securely
- Navigation works after auth

---

### Step 6.3: Transaction Creation Screen

**Files to create:**
- `merchant-gui/src/screens/TransactionScreen.tsx`
- `merchant-gui/src/api/transactions.ts` - Transaction API client

**Tasks:**
1. Create screen that:
   - Allows entering amount
   - Shows currency
   - Creates transaction via API
   - Navigates to payment screen
2. Add amount input validation
3. Add loading and error states

**Validation:**
- Transactions are created successfully
- Navigation to payment screen works

---

### Step 6.4: Payment Method Selection Screen

**Files to create:**
- `merchant-gui/src/screens/PaymentMethodScreen.tsx`
- `merchant-gui/src/api/processors.ts` - Processor API client

**Tasks:**
1. Create screen that:
   - Fetches configured processors for merchant
   - Displays available payment methods
   - Allows selecting payment method
   - Navigates to payment screen with selected method
2. Show processor display names
3. Show supported methods per processor

**Validation:**
- Processors are fetched correctly
- Payment methods are displayed
- Selection works

---

### Step 6.5: Payment Screen

**Files to create:**
- `merchant-gui/src/screens/PaymentScreen.tsx`
- `merchant-gui/src/api/payments.ts` - Payment API client
- `merchant-gui/src/websocket/WebSocketClient.ts` - WebSocket client

**Tasks:**
1. Create screen that:
   - Calls `POST /api/transactions/:id/payments` to create payment
   - Receives `PaymentResult` with `processorData`
   - Renders `ProcessorPaymentHost` component
   - Handles payment completion/failure
   - Navigates to result screen
2. Set up WebSocket connection
3. Subscribe to payment and transaction channels
4. Handle WebSocket updates for payment status
5. Update UI when payment status changes

**Validation:**
- Payments are created successfully
- Processor UI components render
- Payment completion works
- WebSocket updates are received

---

### Step 6.6: Payment Result Screen

**Files to create:**
- `merchant-gui/src/screens/PaymentResultScreen.tsx`

**Tasks:**
1. Create screen that:
   - Shows payment result (success/failure)
   - Shows transaction summary
   - Allows creating new transaction
   - Allows viewing transaction details
2. Display payment amount and method
3. Show transaction status

**Validation:**
- Results are displayed correctly
- Navigation works

---

## Phase 7: Admin-GUI MVP

### Step 7.1: Admin-GUI Setup

**Files to create:**
- `admin-gui/package.json` - React web app package
- `admin-gui/tsconfig.json` - TypeScript config
- `admin-gui/src/index.tsx` - App entry point
- `admin-gui/src/App.tsx` - Main app component

**Tasks:**
1. Set up React web project
2. Install dependencies:
   - React
   - React Router
   - HTTP client (fetch or axios)
3. Set up routing
4. Create basic layout

**Validation:**
- App builds and runs
- Routing works

---

### Step 7.2: Login Screen

**Files to create:**
- `admin-gui/src/screens/LoginScreen.tsx`
- `admin-gui/src/api/auth.ts` - Auth API client

**Tasks:**
1. Create login screen:
   - Email/password form
   - Calls `POST /api/auth/login`
   - Stores JWT token
   - Navigates to dashboard
2. Add error handling

**Validation:**
- Login works
- JWT is stored
- Navigation works

---

### Step 7.3: Processor Configuration

**Files to create:**
- `admin-gui/src/screens/ProcessorConfigScreen.tsx`
- `admin-gui/src/processors/registry.ts` - Processor UI registry
- `admin-gui/src/api/processors.ts` - Processor API client

**Tasks:**
1. Create processor registry that imports `uiExports` from processors
2. Create configuration screen that:
   - Lists available processors
   - Allows adding/editing processor configs
   - Uses processor's `ConfigComponent` if available
   - Falls back to generic form if no custom UI
3. Implement save/delete functionality

**Validation:**
- Processors can be configured
- Custom config UIs render correctly
- Configurations are saved

---

## Testing & Validation

### Integration Testing

1. **End-to-end payment flow:**
   - Create transaction
   - Select payment method
   - Complete Stripe payment
   - Verify transaction completion

2. **Bitcoin payment flow:**
   - Create transaction
   - Select Bitcoin payment
   - Display QR code
   - Verify payment creation (stubbed)

3. **WebSocket updates:**
   - Verify real-time payment status updates
   - Verify transaction completion notifications

### MVP Checklist

- [ ] Stripe processor creates PaymentIntents
- [ ] Stripe payment UI component works on iOS/Android
- [ ] Bitcoin processor generates QR codes
- [ ] Bitcoin payment UI displays QR code correctly
- [ ] Transactions are created and tracked
- [ ] Payments are processed and recorded
- [ ] WebSocket updates work in real-time
- [ ] Admin can configure processors
- [ ] Device authentication works
- [ ] Merchant can process payments end-to-end

---

## Next Steps After MVP

1. **Bitcoin blockchain integration:**
   - Real blockchain monitoring
   - Payment detection
   - Partial payment handling

2. **Admin-GUI enhancements:**
   - Merchant management
   - Store management
   - Device management
   - Transaction history

3. **Customer-GUI:**
   - Customer-facing display
   - QR code scanning
   - Payment status display

4. **Additional features:**
   - Receipt printing
   - Refunds
   - Transaction voiding
   - Reporting and analytics

