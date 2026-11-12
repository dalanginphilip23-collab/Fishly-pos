# Fishly Poppers POS

React + Tailwind (Vite) client, Node + Express API, MySQL.

## Setup

1. Create the database: `mysql -u root -p < server/schema.sql`
2. API: `cd server && cp .env.example .env`, then fill in the database values and set:
   - `JWT_SECRET` to a random string of at least 32 characters.
   - `ADMIN_PIN` to a PIN of at least 8 characters for the first administrator account.
   - `CLIENT_URL` to the public client origin in production.
3. Install and seed: `npm install && npm run migrate && npm run seed && npm run dev`
4. Client: `cd client && npm install && npm run build` for production, or `npm run dev` for local development. Open http://localhost:5173.

The seed creates a single administrator account (`admin` by default, or `ADMIN_USERNAME`). Existing users are never reset by starting or seeding again. Cashiers are created from **Staff** after signing in.

## Security and launch notes

- Do not use the old `cashier` / `0000` account; it is no longer created.
- MySQL must be configured for `+08:00`; the API also sets the session timezone on every connection.
- Reports and receipt dates use Asia/Manila.
- Receipt photos and expense receipts are served only to signed-in administrators.
- Uploaded files are stored in `server/uploads/photos` and `server/uploads/receipts`; back up both directories with the database.
- Existing databases should run `npm run migrate` before `npm run seed`.

## Daily workflow

- **One shared workspace:** every account starts at **Register** and uses the same navigation. There is no separate admin dashboard or extra admin PIN. Use **Register → review order → payment**, then **Receipts** to find or print a sale.
- **School workflow:** sign in and record sales directly. No shift opening, cash drawer setup, or shift closing is needed.
- **Manage:** products, purchases, stock, customers, and staff are accessible from the same sidebar. **Overview** shows sales, expenses, profit, and quick actions. Expand **Detailed reports & expense history** for the full breakdown. Moving between pages keeps the current cart.
- **Register:** group cards combine flavors; stock is shared across combinations, so overselling a shared ingredient is prevented. Payments do not require an open shift. Discounts and cash support centavos. GCash records a reference and requires the cashier to confirm the amount was received in the merchant account.
- **Receipts / Orders:** review completed and refunded sales, print receipts, and issue full refunds with optional restocking.
- **Inventory:** receive purchases, optionally mark them as paid (which creates one linked expense), manage suppliers, and review stock movements.
- **Stock control:** add, remove, waste, or count stock. Opening counts set the exact quantity.
- **Products:** manage prices, stock, photos, and combo contents. Combos never store their own stock.
- **Staff:** administrators manage accounts and PINs. Every person has their own account; PIN changes invalidate other sessions.
- **Analytics:** total sales, expenses, net profit, best sellers, selling-price breakdown, daily sales, and exports. Expenses can be voided (never deleted) and imports are previewed before recording.

## Development checks

```powershell
cd client
npm run build
cd ../server
npm test
```

## Structure

The API routes handle HTTP requests, `validation.js` centralizes input and payment rules, `transaction.js` manages connection/commit/rollback cleanup, and `xlsx.js` writes Excel exports. Checkout locks product rows and consolidates duplicate products before checking inventory. The client shares authentication/cart state through contexts and uses reusable modal, icon, and receipt components.
