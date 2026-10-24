/* Plug real data into Bhoomi Lens.
 *
 * Key: "District|State" exactly as shown in the app (e.g. "Pune|Maharashtra").
 * price  : your observed market land price, INR per sq ft (e.g. from IGR registrations, broker surveys)
 * circle : official guidance value / circle rate, INR per sq ft
 *
 * Districts with an override are tagged "Your data" in the detail card, and the
 * forecast, risk and scoring engine runs on top of your numbers.
 *
 * Example:
 * window.BL_OVERRIDES = {
 *   "Pune|Maharashtra": { price: 9800, circle: 5200 },
 *   "Raigarh|Maharashtra": { price: 2400 }
 * };
 */
window.BL_OVERRIDES = {};
