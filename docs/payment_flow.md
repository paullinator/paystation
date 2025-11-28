# Payment Flow Execution

This document describes the code execution flow for collecting payments, including support for partial payments and cross-currency transactions. See `architecture.md` for schema definitions and interfaces.

## Example Scenario

**Transaction:** $100 USD
**Payment 1:** $70 USD via Stripe card (full payment)
**Payment 2:** $30 USD via Bitcoin (attempted, but only $3 received - partial)
**Payment 3:** $27 USD via Bitcoin (remaining amount, full payment)

---

## Timeline of Execution

### T0: Transaction Creation

**Trigger:** Merchant enters $100 amount and creates transaction

**Code Flow:**
```
merchant-gui/TransactionScreen.tsx
  └─> POST /api/transactions
      └─> server/routes/transactions.ts::createTransaction()
          └─> server/db/couch.ts::transactionsDb.insert()
```

**Database Entry Created:**
```typescript
Transaction {
  _id: "txn_abc123",
  merchantId: "merchant_xyz",
  storeId: "store_123",
  deviceId: "device_456",
  receiptNumber: "R-001",
  requestedAmount: "100.00",
  requestedCurrency: { type: 'fiat', currencyCode: 'USD' },
  tax: "0.00",
  status: 'pending',
  createdAt: T0
}
```

**State:** Transaction created, $100 USD owed, $0 paid

---

### T1: First Payment Initiated ($70 USD via Credit Card)

**Trigger:** Merchant selects "Split Payment" → $70 via Stripe card

**Code Flow:**
```
merchant-gui/PaymentScreen.tsx
  └─> POST /api/transactions/txn_abc123/payments
      └─> server/routes/payments.ts::createPayment()
          ├─> server/db/couch.ts::transactionsDb.get('txn_abc123')
          │   └─> Validate: transaction exists, status is 'pending'
          ├─> server/processors/registry.ts::getProcessor('stripe')
          │   └─> processor-stripe/StripeProcessor.ts::createPayment()
          │       ├─> Validate: requestedAmount <= remaining owed
          │       ├─> Calculate: collectionAmount = requestedAmount (same currency)
          │       ├─> exchangeRate = '1'
          │       └─> Return PaymentResult
          ├─> server/db/couch.ts::paymentsDb.insert()
          └─> server/ws/websocket.ts::broadcast('transaction:updated', txn_abc123)
```

**Database Entry Created:**
```typescript
Payment {
  _id: "pay_001",
  transactionId: "txn_abc123",
  merchantId: "merchant_xyz",
  storeId: "store_123",
  processorId: "stripe",
  method: "card_present",
  requestedAmount: "70.00",
  requestedCurrency: { type: 'fiat', currencyCode: 'USD' },
  collectionAmount: "70.00",
  collectionCurrency: { type: 'fiat', currencyCode: 'USD' },
  paidRequestedAmount: "0.00",  // Not yet paid
  paidCollectionAmount: "0.00",
  exchangeRate: "1",
  isPartialPayment: false,
  status: 'pending',
  createdAt: T1
}
```

**Code Flow (Card Payment Processing):**

**Step 1: Server creates payment intent**
```
server/routes/payments.ts::createPayment()
  └─> processor-stripe/StripeProcessor.ts::createPayment()
      └─> Stripe API (server-side)::createPaymentIntent()
          └─> Returns: PaymentResult with processorData (opaque ProcessorUiData)
              └─> processorData: {
                    data: {
                      clientSecret: "pi_xxx_secret_yyy",
                      paymentIntentId: "pi_xxx",
                      amount: "70.00",
                      currency: "usd"
                    },
                    launchConditions: {
                      paymentStatuses: ['pending'],
                      requiredCapabilities: ['nfc'],
                      allowedContexts: ['merchant-gui'],
                      requiredPlatforms: ['ios', 'android']
                    },
                    metadata: {
                      requiresUserInteraction: true,
                      canAutoLaunch: true,
                      estimatedDuration: 30
                    }
                  }
```

**Step 2: GUI receives PaymentResult and launches processor payment UI**
```
merchant-gui/PaymentScreen.tsx
  └─> Receives PaymentResult from server
      └─> merchant-gui/payments/ProcessorPaymentHost.tsx
          ├─> Check: canLaunchPaymentUi(processorId, payment, capabilities, platform, context)
          ├─> Get: processor-stripe/uiExports.paymentUi.PaymentComponent
          └─> Render: StripePaymentComponent
              ├─> Extract opaque data from processorData.data
              │   └─> { clientSecret, paymentIntentId, amount, currency }
              ├─> Initialize Stripe payment sheet with clientSecret
              ├─> Present payment sheet (Tap to Pay)
              │   └─> [User taps card]
              │   └─> Stripe SDK::handlePaymentResult()
              └─> callbacks.onPaymentComplete()
                  └─> POST /api/payments/pay_001/confirm
                      └─> server/routes/payments.ts::confirmPayment('pay_001')
                          ├─> processor-stripe/StripeProcessor.ts::confirmPayment()
                          │   └─> Stripe API::retrievePaymentIntent()
                          │       └─> Verify payment status
                          ├─> server/db/couch.ts::paymentsDb.update()
                          └─> server/ws/websocket.ts::broadcast('payment:status', pay_001)
```

**Alternative: Webhook-based flow (if using Stripe webhooks)**
```
Stripe API (external)
  └─> POST /api/webhooks/stripe
      └─> server/routes/webhooks.ts::handleStripeWebhook()
          ├─> Verify webhook signature
          ├─> processor-stripe/StripeProcessor.ts::handleWebhook()
          │   └─> Update payment based on webhook event
          ├─> server/db/couch.ts::paymentsDb.update()
          └─> server/ws/websocket.ts::broadcast('payment:status', pay_001)
```

**Database Entry Updated:**
```typescript
Payment {
  _id: "pay_001",
  // ... existing fields ...
  paidRequestedAmount: "70.00",  // Updated
  paidCollectionAmount: "70.00",  // Updated
  isPartialPayment: false,
  status: 'captured',  // Updated
  processedAt: T1,
  processorTransactionId: "pi_xxx"  // Stripe payment intent ID
}
```

**State:** Payment 1 complete, $70 paid, $30 remaining

---

### T2: Second Payment Initiated (Bitcoin QR for $30)

**Trigger:** Merchant selects "Pay Remaining $30" → Bitcoin payment method

**Code Flow:**
```
merchant-gui/PaymentScreen.tsx
  └─> POST /api/transactions/txn_abc123/payments
      └─> server/routes/payments.ts::createPayment()
          ├─> server/db/couch.ts::transactionsDb.get('txn_abc123')
          ├─> Calculate remaining owed:
          │   └─> server/payments/utils.ts::getRemainingOwed('txn_abc123')
          │       └─> Query: paymentsDb.find({ transactionId: 'txn_abc123', status: 'captured' })
          │       └─> Sum: paidRequestedAmount = 70.00
          │       └─> Return: 100.00 - 70.00 = 30.00
          ├─> server/processors/registry.ts::getProcessor('bitcoin')
          │   └─> processor-bitcoin/BitcoinProcessor.ts::createPayment()
          │       ├─> processor-bitcoin/BitcoinProcessor.ts::getExchangeRate()
          │       │   └─> External API::getBTCPrice() → 100000 USD/BTC
          │       ├─> Calculate: collectionAmount = 30.00 / 100000 = 0.0003 BTC
          │       ├─> exchangeRate = "100000"
          │       ├─> Generate: payment address, QR code data
          │       └─> Return PaymentResult with processorData
          ├─> server/db/couch.ts::paymentsDb.insert()
          └─> server/ws/websocket.ts::broadcast('payment:status', pay_002)
```

**Database Entry Created:**
```typescript
Payment {
  _id: "pay_002",
  transactionId: "txn_abc123",
  merchantId: "merchant_xyz",
  storeId: "store_123",
  processorId: "bitcoin",
  method: "crypto_btc",
  requestedAmount: "30.00",
  requestedCurrency: { type: 'fiat', currencyCode: 'USD' },
  collectionAmount: "0.0003",
  collectionCurrency: { type: 'crypto', chainId: 'bitcoin', assetId: null },
  paidRequestedAmount: "0.00",  // Not yet paid
  paidCollectionAmount: "0.00",
  exchangeRate: "100000",
  isPartialPayment: false,
  status: 'pending',
  processorData: {
    qrCode: "...",
    paymentAddress: "bc1q...",
    expectedAmount: "0.0003"
  },
  createdAt: T2
}
```

**UI Flow:**
```
merchant-gui/PaymentScreen.tsx
  └─> merchant-gui/payments/ProcessorPaymentHost.tsx
      ├─> Check: canLaunchPaymentUi('bitcoin', payment, capabilities, platform, 'merchant-gui')
      ├─> Get: processor-bitcoin/uiExports.paymentUi.PaymentComponent
      └─> Render: BitcoinPaymentComponent
          ├─> Extract opaque data from processorData.data
          │   └─> { qrCode, paymentAddress, expectedAmount }
          └─> Display QR code with 0.0003 BTC
```

**State:** QR code displayed, waiting for customer to send 0.0003 BTC

---

### T3: Customer Sends Partial Payment (0.00003 BTC = $3)

**Trigger:** Customer scans QR and sends only 0.00003 BTC instead of 0.0003 BTC

**Code Flow (Blockchain Monitoring):**
```
processor-bitcoin/BitcoinProcessor.ts::startMonitoring()
  └─> [Background job polling blockchain]
      └─> External API::checkBitcoinAddress('bc1q...')
          └─> Detected: 0.00003 BTC received (expected 0.0003 BTC)
          └─> processor-bitcoin/BitcoinProcessor.ts::checkPaymentStatus('pay_002')
              └─> server/routes/payments.ts::checkPaymentStatus('pay_002')
                  ├─> server/db/couch.ts::paymentsDb.get('pay_002')
                  ├─> processor-bitcoin/BitcoinProcessor.ts::checkPaymentStatus()
                  │   ├─> Calculate: paidCollectionAmount = 0.00003
                  │   ├─> Calculate: paidRequestedAmount = 0.00003 * 100000 = 3.00
                  │   ├─> Calculate: isPartialPayment = (3.00 < 30.00) = true
                  │   └─> Return PaymentResult
                  ├─> server/payments/reconciliation.ts::reconcilePayment('pay_002')
                  │   ├─> Update payment with actual amounts
                  │   ├─> Check if partial payment
                  │   └─> If partial, create new payment for remainder
                  ├─> server/db/couch.ts::paymentsDb.update('pay_002')
                  └─> server/ws/websocket.ts::broadcast('payment:status', pay_002)
```

**Database Entry Updated:**
```typescript
Payment {
  _id: "pay_002",
  // ... existing fields ...
  paidRequestedAmount: "3.00",  // Updated: actual paid in USD
  paidCollectionAmount: "0.00003",  // Updated: actual paid in BTC
  isPartialPayment: true,  // Updated: partial payment detected
  status: 'captured',  // Updated: payment received (even though partial)
  processedAt: T3,
  processorResponse: {
    receivedAmount: "0.00003",
    expectedAmount: "0.0003",
    underpayment: true
  }
}
```

**Code Flow (Remainder Calculation):**
```
server/payments/reconciliation.ts::reconcilePayment('pay_002')
  ├─> Calculate shortfall:
  │   └─> shortfall = requestedAmount - paidRequestedAmount
  │   └─> shortfall = 30.00 - 3.00 = 27.00 USD
  ├─> Check transaction status:
  │   └─> server/payments/utils.ts::getRemainingOwed('txn_abc123')
  │       └─> Sum all captured payments: 70.00 + 3.00 = 73.00
  │       └─> Remaining: 100.00 - 73.00 = 27.00
  └─> If shortfall > 0:
      └─> server/routes/payments.ts::createPayment()
          └─> [Creates Payment 3 for remaining $27]
```

**State:** Payment 2 partial ($3 received), $27 still owed

---

### T4: Third Payment Initiated (Remaining $27 in Bitcoin)

**Trigger:** System automatically creates new payment request for remainder

**Code Flow:**
```
server/payments/reconciliation.ts::reconcilePayment('pay_002')
  └─> server/routes/payments.ts::createPayment()
      ├─> server/db/couch.ts::transactionsDb.get('txn_abc123')
      ├─> server/payments/utils.ts::getRemainingOwed('txn_abc123')
      │   └─> Returns: 27.00 USD
      ├─> server/processors/registry.ts::getProcessor('bitcoin')
      │   └─> processor-bitcoin/BitcoinProcessor.ts::createPayment()
      │       ├─> processor-bitcoin/BitcoinProcessor.ts::getExchangeRate()
      │       │   └─> External API::getBTCPrice() → 100000 USD/BTC (may have changed)
      │       ├─> Calculate: collectionAmount = 27.00 / 100000 = 0.00027 BTC
      │       ├─> exchangeRate = "100000" (or new rate if changed)
      │       ├─> Generate: new payment address, QR code data
      │       └─> Return PaymentResult
      ├─> server/db/couch.ts::paymentsDb.insert()
      └─> server/ws/websocket.ts::broadcast('payment:status', pay_003)
```

**Database Entry Created:**
```typescript
Payment {
  _id: "pay_003",
  transactionId: "txn_abc123",
  merchantId: "merchant_xyz",
  storeId: "store_123",
  processorId: "bitcoin",
  method: "crypto_btc",
  requestedAmount: "27.00",
  requestedCurrency: { type: 'fiat', currencyCode: 'USD' },
  collectionAmount: "0.00027",
  collectionCurrency: { type: 'crypto', chainId: 'bitcoin', assetId: null },
  paidRequestedAmount: "0.00",
  paidCollectionAmount: "0.00",
  exchangeRate: "100000",
  isPartialPayment: false,
  status: 'pending',
  processorData: {
    qrCode: "...",
    paymentAddress: "bc1q...",  // New address
    expectedAmount: "0.00027"
  },
  createdAt: T4
}
```

**UI Flow:**
```
server/ws/websocket.ts::broadcast('payment:status', pay_003)
  └─> merchant-gui/WebSocketListener.tsx
      └─> merchant-gui/PaymentScreen.tsx::onPaymentStatusUpdate()
          └─> merchant-gui/payments/ProcessorPaymentHost.tsx
              └─> BitcoinPaymentComponent (already rendered)
                  └─> Receives updated processorData via props
                      └─> Display new QR code with 0.00027 BTC
```

**State:** New QR code displayed, requesting remaining 0.00027 BTC

---

### T5: Customer Pays Remaining Amount (0.00027 BTC = $27)

**Trigger:** Customer sends 0.00027 BTC

**Code Flow:**
```
processor-bitcoin/BitcoinProcessor.ts::startMonitoring()
  └─> [Background job polling blockchain]
      └─> External API::checkBitcoinAddress('bc1q...')
          └─> Detected: 0.00027 BTC received (full amount)
          └─> processor-bitcoin/BitcoinProcessor.ts::checkPaymentStatus('pay_003')
              └─> server/routes/payments.ts::checkPaymentStatus('pay_003')
                  ├─> server/db/couch.ts::paymentsDb.get('pay_003')
                  ├─> processor-bitcoin/BitcoinProcessor.ts::checkPaymentStatus()
                  │   ├─> Calculate: paidCollectionAmount = 0.00027
                  │   ├─> Calculate: paidRequestedAmount = 0.00027 * 100000 = 27.00
                  │   ├─> Calculate: isPartialPayment = (27.00 < 27.00) = false
                  │   └─> Return PaymentResult
                  ├─> server/payments/reconciliation.ts::reconcilePayment('pay_003')
                  │   ├─> Update payment with actual amounts
                  │   ├─> Check transaction completion
                  │   └─> Update transaction status if complete
                  ├─> server/db/couch.ts::paymentsDb.update('pay_003')
                  ├─> server/db/couch.ts::transactionsDb.update('txn_abc123')
                  └─> server/ws/websocket.ts::broadcast('payment:status', pay_003)
                      └─> server/ws/websocket.ts::broadcast('transaction:updated', txn_abc123)
```

**Database Entry Updated:**
```typescript
Payment {
  _id: "pay_003",
  // ... existing fields ...
  paidRequestedAmount: "27.00",  // Updated
  paidCollectionAmount: "0.00027",  // Updated
  isPartialPayment: false,
  status: 'captured',  // Updated
  processedAt: T5
}
```

**Transaction Completion Check:**
```
server/payments/reconciliation.ts::reconcilePayment('pay_003')
  └─> server/payments/utils.ts::checkTransactionCompletion('txn_abc123')
      ├─> Query: paymentsDb.find({ transactionId: 'txn_abc123', status: 'captured' })
      ├─> Sum: paidRequestedAmount = 70.00 + 3.00 + 27.00 = 100.00
      ├─> Compare: 100.00 >= 100.00 (transaction.requestedAmount)
      └─> Return: isComplete = true
```

**Database Entry Updated:**
```typescript
Transaction {
  _id: "txn_abc123",
  // ... existing fields ...
  status: 'completed',  // Updated
  completedAt: T5  // Updated
}
```

**State:** Transaction complete, all $100 paid

---

## Final Database State

### Transaction
```typescript
{
  _id: "txn_abc123",
  requestedAmount: "100.00",
  requestedCurrency: { type: 'fiat', currencyCode: 'USD' },
  status: 'completed',
  createdAt: T0,
  completedAt: T5
}
```

### Payments (3 total)

**Payment 1: $70 USD via card**
```typescript
{
  _id: "pay_001",
  transactionId: "txn_abc123",
  requestedAmount: "70.00",
  collectionAmount: "70.00",
  paidRequestedAmount: "70.00",
  paidCollectionAmount: "70.00",
  exchangeRate: "1",
  isPartialPayment: false,
  status: 'captured'
}
```

**Payment 2: $3 USD via Bitcoin (partial)**
```typescript
{
  _id: "pay_002",
  transactionId: "txn_abc123",
  requestedAmount: "30.00",  // Was trying to pay $30
  collectionAmount: "0.0003",
  paidRequestedAmount: "3.00",  // Only got $3
  paidCollectionAmount: "0.00003",
  exchangeRate: "100000",
  isPartialPayment: true,  // Partial payment
  status: 'captured'
}
```

**Payment 3: $27 USD via Bitcoin (remaining)**
```typescript
{
  _id: "pay_003",
  transactionId: "txn_abc123",
  requestedAmount: "27.00",
  collectionAmount: "0.00027",
  paidRequestedAmount: "27.00",
  paidCollectionAmount: "0.00027",
  exchangeRate: "100000",
  isPartialPayment: false,
  status: 'captured'
}
```

---

## Server-GUI Payment Collection Pattern

The payment collection flow follows a **server-initiated, GUI-executed** pattern with processor UI components:

### Pattern Overview

1. **Server creates payment intent** - Processor plugin (running on server) creates payment request with processor API
2. **Server returns PaymentResult** - Contains `processorData` (opaque `ProcessorUiData`) with UI configuration
3. **GUI checks launch conditions** - Merchant-gui validates that processor payment UI can be launched (capabilities, platform, context)
4. **GUI renders processor UI component** - Processor's bundled payment UI component receives opaque `processorData`
5. **UI component extracts data** - Component interprets opaque data structure (defined by processor plugin)
6. **UI collects payment** - Component uses processor SDK or displays payment interface
7. **UI communicates back** - Component calls callbacks (onPaymentComplete, onPaymentFailed) or uses API
8. **Server updates payment** - Server processor verifies and updates payment record

### Card Payments (Stripe Example)

**Server Side:**
- Processor creates Stripe PaymentIntent via Stripe API
- Returns `PaymentResult` with opaque `processorData` containing:
  - `data.clientSecret` - Stripe payment intent client secret
  - `data.paymentIntentId` - Payment intent ID
  - `launchConditions` - UI launch requirements (NFC, iOS/Android, merchant-gui)
- Payment status remains 'pending' until confirmed

**Client Side:**
- Receives `PaymentResult` with opaque `processorData`
- `ProcessorPaymentHost` checks launch conditions (capabilities, platform, context)
- Renders `StripePaymentComponent` from processor's `uiExports.paymentUi`
- Component extracts `clientSecret` from opaque `processorData.data`
- Component uses Stripe SDK with `clientSecret` to initiate Tap to Pay
- Native iOS/Android module handles card tap
- Component calls `callbacks.onPaymentComplete()` with result
- Host sends confirmation to server: `POST /api/payments/:id/confirm`

**Why this pattern:**
- Server maintains control of payment credentials (API keys never exposed to client)
- Processor UI components are bundled with processor plugin (no external dependencies)
- Opaque data structure allows processors to pass any data needed by their UI
- Launch conditions ensure UI only renders when requirements are met
- Native SDKs provide secure, PCI-compliant card handling
- Server can verify payment status independently (webhooks or API polling)

### Crypto Payments (Bitcoin Example)

**Server Side:**
- Processor generates payment address and calculates required amount
- Returns `PaymentResult` with opaque `processorData` containing:
  - `data.qrCode` - QR code content string
  - `data.paymentAddress` - Bitcoin address
  - `data.expectedAmount` - Expected BTC amount
  - `launchConditions` - UI launch requirements (any platform, merchant-gui or customer-gui)
- Server polls blockchain (or receives webhook) to detect payments
- Server updates payment when transaction detected

**Client Side:**
- Receives `PaymentResult` with opaque `processorData`
- `ProcessorPaymentHost` checks launch conditions
- Renders `BitcoinPaymentComponent` from processor's `uiExports.paymentUi`
- Component extracts `qrCode`, `paymentAddress`, `expectedAmount` from opaque `processorData.data`
- Component displays QR code using extracted data
- Customer scans QR and sends payment from their wallet
- Client receives WebSocket updates when server detects payment
- Component receives updated `processorData` via props and updates display

**Why this pattern:**
- Server monitors blockchain (more reliable than client polling)
- Server can detect partial payments and create follow-up payments
- Processor UI components are self-contained (no external UI plugins needed)
- Opaque data allows processors to pass any structure needed
- Launch conditions ensure UI renders in appropriate contexts

### API Endpoints for Payment Confirmation

**Card Payments:**
- `POST /api/payments/:id/confirm` - Client confirms payment after native SDK completion
  - Body: `{ paymentIntentId: string, status: 'succeeded' | 'failed' }`
  - Server verifies with processor API before updating

**Crypto Payments:**
- No client confirmation needed - server detects via blockchain monitoring
- Client receives WebSocket updates: `{ type: 'payment:status', paymentId, status, data }`

---

## Key Functions and Modules

### Server-Side

**Routes:**
- `server/routes/transactions.ts::createTransaction()` - Create new transaction
- `server/routes/payments.ts::createPayment()` - Initiate payment (returns PaymentResult with processorData)
- `server/routes/payments.ts::confirmPayment()` - Confirm payment after client-side collection (for card payments)
- `server/routes/payments.ts::checkPaymentStatus()` - Check payment status (for async payments like crypto)
- `server/routes/webhooks.ts::handleStripeWebhook()` - Handle processor webhooks (optional, for card payments)

**Payment Reconciliation:**
- `server/payments/reconciliation.ts::reconcilePayment()` - Update payment with actual amounts, detect partial payments
- `server/payments/utils.ts::getRemainingOwed()` - Calculate remaining amount owed on transaction
- `server/payments/utils.ts::checkTransactionCompletion()` - Check if transaction is complete

**Processors:**
- `server/processors/registry.ts::getProcessor()` - Get processor plugin by ID
- `processor-*/Processor.ts::createPayment()` - Create payment via processor
- `processor-*/Processor.ts::checkPaymentStatus()` - Check payment status (for async methods)
- `processor-*/Processor.ts::getExchangeRate()` - Get current exchange rate

**Database:**
- `server/db/couch.ts::transactionsDb.insert()` - Create transaction
- `server/db/couch.ts::transactionsDb.update()` - Update transaction
- `server/db/couch.ts::paymentsDb.insert()` - Create payment
- `server/db/couch.ts::paymentsDb.update()` - Update payment
- `server/db/couch.ts::paymentsDb.find()` - Query payments

**WebSocket:**
- `server/ws/websocket.ts::broadcast()` - Broadcast events to connected clients

### Client-Side

**Merchant GUI:**
- `merchant-gui/TransactionScreen.tsx` - Transaction creation UI
- `merchant-gui/PaymentScreen.tsx` - Payment selection and display
- `merchant-gui/payments/ProcessorPaymentHost.tsx` - Processor payment UI host
  - Checks launch conditions for processor UI
  - Renders processor's payment UI component
  - Passes opaque `processorData` to component
  - Handles callbacks from component
- `merchant-gui/processors/registry.ts` - Processor UI registry
  - Imports `uiExports` from processor plugins
  - Provides `getProcessorPaymentUi()` and `canLaunchPaymentUi()`
- `merchant-gui/WebSocketListener.tsx` - WebSocket event handler
- `merchant-gui/api/payments.ts::confirmPayment()` - Send payment confirmation to server

**Processor UI Components (bundled with processor plugins):**
- `processor-stripe/StripePaymentComponent.tsx` - Stripe payment UI
  - Extracts `clientSecret` from opaque `processorData.data`
  - Uses Stripe SDK with client secret
  - Calls native iOS/Android Tap to Pay module
  - Calls `callbacks.onPaymentComplete()` on success
- `processor-bitcoin/BitcoinPaymentComponent.tsx` - Bitcoin payment UI
  - Extracts `qrCode`, `paymentAddress` from opaque `processorData.data`
  - Displays QR code for customer scanning
  - Receives WebSocket updates for payment status


---

## Validation Rules Enforced

1. **Currency Matching:** `payment.requestedCurrency === transaction.requestedCurrency`
2. **Amount Validation:** `payment.requestedAmount <= remainingOwed`
3. **Exchange Rate:** `exchangeRate === '1'` if same currency, otherwise `> '0'`
4. **Amount Calculations:** `collectionAmount * exchangeRate ≈ requestedAmount`
5. **Partial Payment Detection:** `isPartialPayment = (paidRequestedAmount < requestedAmount)`
6. **Transaction Completion:** `sum(paidRequestedAmount) >= transaction.requestedAmount`

---

## Error Handling

- **Insufficient Payment:** Detected via `checkPaymentStatus()`, creates new payment for remainder
- **Overpayment:** Handled by processor (may refund excess or keep as tip)
- **Payment Timeout:** Payment status remains 'pending', can be cancelled or retried
- **Processor Failure:** Payment status set to 'failed', error message stored in `errorMessage` field
- **Network Issues:** WebSocket reconnection handles missed events, client polls for updates

---

## Opaque Data Passing Pattern

The processor backend and UI components communicate through opaque `ProcessorUiData` objects. This pattern allows processors to pass any data structure needed by their UI components without the core system needing to understand the structure.

### Data Flow

1. **Backend creates opaque data:**
   - Processor backend creates payment and generates processor-specific data
   - Data is wrapped in `ProcessorUiData` with structure:
     ```typescript
     {
       data: { /* processor-specific structure */ },
       launchConditions: { /* when UI can launch */ },
       metadata: { /* UI hints */ }
     }
     ```

2. **Data passed through system:**
   - `PaymentResult.processorData` contains the opaque `ProcessorUiData`
   - Core system treats it as opaque (doesn't inspect structure)
   - Data flows: Backend → API → GUI → Processor UI Component

3. **UI component extracts data:**
   - Processor's payment UI component receives `processorData` as prop
   - Component knows the structure (defined by processor plugin)
   - Component extracts needed fields: `const { clientSecret } = processorData.data`

4. **UI communicates back:**
   - Component uses extracted data (e.g., `clientSecret` for Stripe SDK)
   - Component calls callbacks: `callbacks.onPaymentComplete(result)`
   - Component can send custom data: `api.sendProcessorData(paymentId, customData)`

### Example: Stripe Opaque Data Structure

**Backend creates:**
```typescript
processorData: {
  data: {
    clientSecret: "pi_xxx_secret_yyy",
    paymentIntentId: "pi_xxx",
    amount: "70.00",
    currency: "usd"
  },
  launchConditions: {
    paymentStatuses: ['pending'],
    requiredCapabilities: ['nfc'],
    allowedContexts: ['merchant-gui'],
    requiredPlatforms: ['ios', 'android']
  }
}
```

**UI component extracts:**
```typescript
const { clientSecret, paymentIntentId } = processorData.data as {
  clientSecret: string
  paymentIntentId: string
  amount: string
  currency: string
}
```

### Example: Bitcoin Opaque Data Structure

**Backend creates:**
```typescript
processorData: {
  data: {
    qrCode: "bitcoin:bc1q...?amount=0.0003",
    paymentAddress: "bc1q...",
    expectedAmount: "0.0003"
  },
  launchConditions: {
    paymentStatuses: ['pending'],
    allowedContexts: ['merchant-gui', 'customer-gui']
  }
}
```

**UI component extracts:**
```typescript
const { qrCode, paymentAddress, expectedAmount } = processorData.data as {
  qrCode: string
  paymentAddress: string
  expectedAmount: string
}
```

### Benefits

- **Flexibility:** Each processor can define its own data structure
- **Type Safety:** UI components can type-cast to known structure
- **Encapsulation:** Core system doesn't need to know processor internals
- **Extensibility:** New processors can add new data fields without core changes

## WebSocket Events

**Client Subscriptions:**
- `{ type: 'subscribe', channel: 'transaction:txn_abc123' }`
- `{ type: 'subscribe', channel: 'store:store_123' }`

**Server Broadcasts:**
- `{ type: 'payment:status', paymentId: 'pay_002', status: 'captured', data: PaymentResult }`
- `{ type: 'transaction:updated', transactionId: 'txn_abc123', transaction: Transaction }`

