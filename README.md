# AvaOkeMon

A mobile-first Pokemon card vault for searching cards, checking market signals, scanning card photos for text clues, and managing a personal collection.

## Features

- Search Pokemon cards by name, set, or collector number using the Pokemon TCG API.
- View card art, rarity, set, attacks, and available TCGplayer/Cardmarket price signals.
- Scan or upload a card photo with browser OCR and search from detected text.
- Add cards to a local collection with quantity, condition, and status: Keep, Trade, Sell, Wishlist.
- Track estimated collection value locally in the browser.

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

## Notes

The scanner is a lightweight helper, not a grading or authentication tool. Confirm card variants, condition, and market value before selling or trading.
