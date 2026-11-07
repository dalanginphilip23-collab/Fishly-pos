# Fishly Poppers POS

React + Tailwind (Vite) client, Node + Express API, MySQL.

## Setup

1. Create the database: `mysql -u root -p < server/schema.sql`
2. API: `cd server && cp .env.example .env` (fill in DB values and JWT_SECRET), then
   `npm install && npm run seed && npm run dev`
3. Client: `cd client && npm install && npm run dev` and open http://localhost:5173

Logins after seeding: `admin` / `1234` and `cashier` / `0000`. Change these PINs before real use.
Menu prices in `schema.sql` are placeholders; edit them on the Menu page.

## Workspace flow

### Appearance

Use the sun/moon button on the login page or workspace navigation to switch between light and dark mode. The app initially follows the device preference and saves manual changes in this browser. Typography uses Inter with system-font fallbacks. Page and dialog transitions respect the device's reduced-motion setting; receipt previews and printed receipts stay white with black text.

Admins open directly on **Analytics**, with **Products & stock** and **Orders** navigation. They manage pricing, stock, daily expenses, and profit reports. The register and checkout API are cashier-only.

Cashiers open on **Register** and can review **Receipts**. The register header has an **Admin** button. It opens the full admin workspace in the same session without a second login, with the admin sidebar and the same management access as an administrator. The **Register** link in the admin sidebar returns to the cashier view.

### Product stock and photos

In **Products & stock**, select **Add product** or **Edit product** to open the product dialog. Set Stock on hand to the current available quantity and click **Save changes**. Upload, change or remove a photo in the same dialog. Unit cost is optional and feeds the estimated cost of goods and gross profit shown in Analytics and Excel exports. Photos support JPG, PNG and WebP up to 5 MB and appear on cashier menu cards. Use **Refresh menu** on an already-open register to load changes. Inventory summary cards filter low-stock, sold-out and hidden items.

**Analytics → Best sellers** shows the top five products by quantity sold for the selected dates, with photos and sales before discounts. Rankings exclude cancelled sales and group by product ID, so renaming a product does not split its sales history. Click Refresh after cashier sales to update the rankings.

### Excel export

On **Analytics**, choose a date or date range, then select **Export to Excel**. The `.xlsx` workbook contains a summary, sales, sold items, expenses, daily sales, and inventory. Item costs and stock value use each product’s unit cost, and the summary shows estimated cost of goods and gross profit. Net profit remains total sales minus recorded expenses. Cashiers can export the same report from the admin workspace.

Run `npm run migrate` in `server` for existing databases to add photo support. Uploaded files are stored in `server/uploads/photos` and served through `/api/uploads/photos`; include that directory alongside the database in backups. Preserve this directory when deploying. Photos are public menu assets, while uploading and modifying products require a signed-in staff account.

- **Register:** the menu is grouped by category so flavors share one card, and each card states exactly what is included. **Poppers only (5 pcs)** opens Regular, Spicy, and Barbecue; **Poppers with rice (5 pcs)** opens the same flavors with rice; **Poppers with rice + drink** is the combo meal. **Pastillas** opens Coffee, Milo, and Oreo. Search by flavor or product, add available stock, then take payment for a dine-in sale. Payment completes the sale immediately and deducts stock. Discounts and cash support centavos. GCash requires the cashier to confirm receipt in the merchant account; this is manual recording, not a payment gateway integration.
- **Receipts:** review today's sales and reprint receipts. There is no kitchen queue or preparation-status workflow.
- **Products & stock (admin mode):** search inventory, edit selling prices and stock, upload photos, hide items, and add products.
- **Sales & profit (admin mode):** review total sales, total expenses and net profit by date. Sales are after discounts; cancelled sales are excluded.

## End-of-day profit

When selling is finished, open **Analytics** and enter today's expense amount. A note is optional; no materials list or per-product cost setup is needed. You can enter the daily total once, or add separate expense amounts. Each entry is added to today's expenses, so do not enter both a total and its individual costs.

**Net profit = total sales − total recorded expenses.** Example: ₱1,000 sales − ₱400 expenses = ₱600 profit. Expenses greater than sales display a net loss. Include all of the day's costs in your expense amount for a complete result.

Reports default to today. Use From/To to review a previous day or a date range. New expense entries always belong to today, and saving returns the report to today's updated totals. Historical item-cost columns are preserved but are not used or deducted in this calculation.

## Development checks

```powershell
cd client
npm run build
cd ../server
npm test
```

Set `JWT_SECRET` to a strong random value before starting the API (the example placeholder is rejected). New orders use globally increasing numbers such as `FP-000123`; existing numbers are preserved. Configure MySQL's session/server timezone consistently with your store's business day; report date defaults use Asia/Manila.

## Structure

The API routes handle HTTP requests, `validation.js` centralizes input and payment rules, `transaction.js` manages connection/commit/rollback cleanup, and `xlsx.js` writes dependency-free Excel exports. Checkout locks product rows and consolidates duplicate products before checking inventory. The client shares authentication/cart state through contexts and uses reusable modal, icon, and receipt components.

For a live smoke check, create a cash sale with a fractional price, confirm change and stock deduction, and reprint its receipt from Receipts. The saved sale should be dine-in and completed immediately. Test two registers buying the last unit concurrently; only one should succeed.
