# FoodWise Pro v22 — Voice Inventory + Smart Planner Images

## Conversational inventory voice control

Tap the main voice button and say something like:

- `inventory mein dal add kar do`
- `add rice to inventory`
- `naya item inventory mein add karo`

FoodWise keeps the microphone conversation going and asks for:

1. food name (when not already present in the command),
2. quantity,
3. Fridge / Freezer / Pantry,
4. expiry or best-before (`30 din`, `next week`, or `default`),
5. approximate cost (`skip` is allowed),
6. final `haan / nahi` confirmation.

Food category and sensible shelf-life/storage suggestions are inferred from common foods. The user remains in control because nothing is committed until the final voice confirmation.

Examples of quantity speech: `1 kilo`, `500 gram`, `2 packets`, `6 pieces`, `aadha kilo`.

## Smart meal names

The inventory-only planner now recognizes common finished dishes rather than showing only raw ingredient concatenations. Examples:

- Dal + Rice → **Dal Chawal**
- Rajma + Rice → **Rajma Chawal**
- Chole + Rice → **Chole Rice**
- Dahi + Rice → **Curd Rice**
- Paneer + Rice → **Paneer Rice Bowl**
- Vegetables + Rice → **Veg Pulao**
- Oats + Banana → **Banana Oats Bowl**
- Egg + Bread → **Egg Toast**
- Paneer + Bread → **Paneer Sandwich**

## Planner meal images

When Cloudflare Workers AI is configured, `/api/meal-image` generates a photorealistic image of the finished meal from its inventory ingredients and caches it in GridFS in cloud mode.

Without Cloudflare, known recipes use local assets. Dal Chawal uses an online Wikimedia Commons CC BY-SA fallback; see `ASSET_ATTRIBUTION.md`.

## Existing voice commands kept

- `inventory kholo`
- `planner kholo`
- `show consumed items`
- `auto plan`
- `cooking for 3`
- `dark mode` / `light mode`
- `download excel report`

Browser note: Web Speech Recognition support is best in current Chrome/Edge. Microphone permission is required.
