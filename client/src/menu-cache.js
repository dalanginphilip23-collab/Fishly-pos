// The menu is small and read-mostly. Show the last known menu instantly, then
// refresh it from the API so stock counts stay current. Checkout still validates
// live stock on the server, so a brief stale count cannot oversell.
let cached = null

export const readMenu = () => cached

export function saveMenu(products, categories) {
  cached = { products, categories }
}

export function clearMenu() {
  cached = null
}