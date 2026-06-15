import { useEffect, useMemo, useState } from 'react'
import './App.css'

type PricePoint = {
  low?: number
  mid?: number
  high?: number
  market?: number
  directLow?: number
}

type PokemonCard = {
  id: string
  name: string
  supertype?: string
  subtypes?: string[]
  hp?: string
  types?: string[]
  rarity?: string
  number?: string
  artist?: string
  set: {
    id: string
    name: string
    series?: string
    printedTotal?: number
    total?: number
    releaseDate?: string
  }
  images: {
    small: string
    large: string
  }
  tcgplayer?: {
    url?: string
    updatedAt?: string
    prices?: Record<string, PricePoint>
  }
  cardmarket?: {
    url?: string
    updatedAt?: string
    prices?: {
      averageSellPrice?: number
      lowPrice?: number
      trendPrice?: number
      avg1?: number
      avg7?: number
      avg30?: number
    }
  }
  attacks?: Array<{ name: string; damage?: string; text?: string }>
}

type CollectionStatus = 'Keep' | 'Trade' | 'Sell' | 'Wishlist'

type CollectionItem = {
  card: PokemonCard
  status: CollectionStatus
  quantity: number
  condition: 'Mint' | 'Near Mint' | 'Light Play' | 'Played'
  addedAt: string
}

const API_BASE = 'https://api.pokemontcg.io/v2/cards'
const STORAGE_KEY = 'avaokemon.collection.v1'
const statuses: CollectionStatus[] = ['Keep', 'Trade', 'Sell', 'Wishlist']

const featuredSearches = ['Pikachu', 'Charizard', 'Eevee', 'Mewtwo']

function App() {
  const [query, setQuery] = useState('Pikachu')
  const [cards, setCards] = useState<PokemonCard[]>([])
  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null)
  const [collection, setCollection] = useState<CollectionItem[]>(() => loadCollection())
  const [collectionFilter, setCollectionFilter] = useState<'All' | CollectionStatus>('All')
  const [isSearching, setIsSearching] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [scanText, setScanText] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void searchCards('Pikachu')
    // We only want the playful default search on first launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection))
  }, [collection])

  const collectionValue = useMemo(
    () => collection.reduce((sum, item) => sum + getBestPrice(item.card) * item.quantity, 0),
    [collection],
  )

  const filteredCollection = useMemo(() => {
    if (collectionFilter === 'All') return collection
    return collection.filter((item) => item.status === collectionFilter)
  }, [collection, collectionFilter])

  async function searchCards(searchTerm = query) {
    const cleanQuery = searchTerm.trim()
    if (!cleanQuery) return

    setIsSearching(true)
    setMessage('')
    try {
      const apiQuery = buildApiQuery(cleanQuery)
      const response = await fetch(
        `${API_BASE}?q=${encodeURIComponent(apiQuery)}&orderBy=-set.releaseDate&pageSize=24`,
      )

      if (!response.ok) {
        throw new Error('The card database was busy. Try again in a moment.')
      }

      const payload = (await response.json()) as { data: PokemonCard[] }
      setCards(payload.data)
      setSelectedCard(payload.data[0] ?? null)
      setQuery(cleanQuery)

      if (!payload.data.length) {
        setMessage('No cards found. Try a Pokemon name, set name, or collector number.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Search failed. Please try again.')
    } finally {
      setIsSearching(false)
    }
  }

  async function scanCardImage(file: File) {
    setIsScanning(true)
    setMessage('Reading your card image. This can take a few seconds on mobile.')
    const imageData = await readFileAsDataUrl(file)
    setScanPreview(imageData)

    try {
      const Tesseract = await import('tesseract.js')
      const result = await Tesseract.recognize(imageData, 'eng')
      const text = result.data.text.trim()
      setScanText(text)
      const guess = extractCardSearch(text, file.name)

      if (!guess) {
        setMessage('I could not read enough text from that photo. Try a brighter, straighter card picture or search manually.')
        return
      }

      setMessage(`I spotted clues for “${guess}”. Searching the card database now.`)
      await searchCards(guess)
    } catch {
      const fallback = extractCardSearch('', file.name)
      if (fallback) {
        setMessage(`OCR had trouble, but the file name gave me “${fallback}”. Searching that instead.`)
        await searchCards(fallback)
      } else {
        setMessage('The scan could not be processed in this browser. You can still search by name or collector number.')
      }
    } finally {
      setIsScanning(false)
    }
  }

  function addToCollection(card: PokemonCard, status: CollectionStatus = 'Keep') {
    setCollection((current) => {
      const existing = current.find((item) => item.card.id === card.id)
      if (existing) {
        return current.map((item) =>
          item.card.id === card.id ? { ...item, quantity: item.quantity + 1, status } : item,
        )
      }

      return [
        {
          card,
          status,
          quantity: 1,
          condition: 'Near Mint',
          addedAt: new Date().toISOString(),
        },
        ...current,
      ]
    })
    setMessage(`${card.name} joined your collection.`)
  }

  function updateCollectionItem(cardId: string, updates: Partial<CollectionItem>) {
    setCollection((current) =>
      current.map((item) => (item.card.id === cardId ? { ...item, ...updates } : item)),
    )
  }

  function removeFromCollection(cardId: string) {
    setCollection((current) => current.filter((item) => item.card.id !== cardId))
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">AvaOkeMon card vault</span>
          <h1>Catch prices. Track trades. Build your dream binder.</h1>
          <p>
            Search Pokemon cards, peek at market values, scan card photos for clues, and sort your
            collection into keep, trade, sell, and wishlist piles.
          </p>
        </div>

        <div className="hero-card" aria-label="Collection summary">
          <div className="sparkle">✦</div>
          <span>Vault value</span>
          <strong>{formatCurrency(collectionValue)}</strong>
          <small>{collection.reduce((sum, item) => sum + item.quantity, 0)} cards tracked</small>
        </div>
      </section>

      <section className="search-panel" aria-label="Search Pokemon cards">
        <form
          className="search-box"
          onSubmit={(event) => {
            event.preventDefault()
            void searchCards()
          }}
        >
          <label htmlFor="card-search">Find a card</label>
          <div>
            <input
              id="card-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pikachu, Charizard, Base Set, 4/102..."
            />
            <button type="submit" disabled={isSearching}>
              {isSearching ? 'Hunting' : 'Search'}
            </button>
          </div>
        </form>

        <div className="quick-row" aria-label="Quick searches">
          {featuredSearches.map((term) => (
            <button key={term} type="button" onClick={() => void searchCards(term)}>
              {term}
            </button>
          ))}
        </div>

        <label className="scan-drop">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void scanCardImage(file)
              event.currentTarget.value = ''
            }}
          />
          <span>{isScanning ? 'Scanning card...' : 'Scan or upload a card photo'}</span>
          <small>Best with bright light and the card filling the frame.</small>
        </label>

        {message && <p className="message">{message}</p>}
      </section>

      <section className="results-layout">
        <div className="card-grid" aria-label="Search results">
          {cards.map((card) => (
            <button
              className={`result-card ${selectedCard?.id === card.id ? 'active' : ''}`}
              key={card.id}
              type="button"
              onClick={() => setSelectedCard(card)}
            >
              <img src={card.images.small} alt={card.name} loading="lazy" />
              <span>{card.name}</span>
              <small>{card.set.name}</small>
              <strong>{formatCurrency(getBestPrice(card))}</strong>
            </button>
          ))}
        </div>

        <aside className="detail-panel" aria-label="Selected card details">
          {selectedCard ? (
            <CardDetail card={selectedCard} onAdd={addToCollection} />
          ) : (
            <div className="empty-state">Search for a card to see details and values.</div>
          )}
        </aside>
      </section>

      <section className="scanner-panel" aria-label="Scanner notes">
        <div>
          <span className="eyebrow">Scan lab</span>
          <h2>Photo lookup clues</h2>
          <p>
            The scanner reads visible text from your card and searches the closest match. It is a
            helpful sidekick, not a professional grader, so confirm variants before trading or selling.
          </p>
        </div>
        {scanPreview ? <img src={scanPreview} alt="Uploaded card preview" /> : <div className="scan-placeholder">No scan yet</div>}
        {scanText && <pre>{scanText.slice(0, 420)}</pre>}
      </section>

      <section className="collection-panel" aria-label="Personal collection">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your binder</span>
            <h2>Collection manager</h2>
          </div>
          <select
            value={collectionFilter}
            onChange={(event) => setCollectionFilter(event.target.value as 'All' | CollectionStatus)}
            aria-label="Filter collection"
          >
            <option>All</option>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>

        {filteredCollection.length ? (
          <div className="collection-list">
            {filteredCollection.map((item) => (
              <article className="collection-item" key={item.card.id}>
                <img src={item.card.images.small} alt={item.card.name} loading="lazy" />
                <div>
                  <h3>{item.card.name}</h3>
                  <p>{item.card.set.name} · #{item.card.number ?? 'N/A'} · {formatCurrency(getBestPrice(item.card))}</p>
                  <div className="collection-controls">
                    <select
                      value={item.status}
                      onChange={(event) =>
                        updateCollectionItem(item.card.id, { status: event.target.value as CollectionStatus })
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                    <select
                      value={item.condition}
                      onChange={(event) =>
                        updateCollectionItem(item.card.id, {
                          condition: event.target.value as CollectionItem['condition'],
                        })
                      }
                    >
                      <option>Mint</option>
                      <option>Near Mint</option>
                      <option>Light Play</option>
                      <option>Played</option>
                    </select>
                    <input
                      aria-label={`Quantity for ${item.card.name}`}
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) =>
                        updateCollectionItem(item.card.id, {
                          quantity: Math.max(1, Number(event.target.value)),
                        })
                      }
                    />
                    <button type="button" onClick={() => removeFromCollection(item.card.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">Your binder is waiting for its first catch.</div>
        )}
      </section>
    </main>
  )
}

function CardDetail({ card, onAdd }: { card: PokemonCard; onAdd: (card: PokemonCard, status?: CollectionStatus) => void }) {
  const prices = flattenPrices(card)

  return (
    <article className="card-detail-card">
      <img src={card.images.large} alt={card.name} />
      <div className="detail-copy">
        <span className="eyebrow">{card.rarity ?? 'Pokemon card'}</span>
        <h2>{card.name}</h2>
        <p>{card.set.name} · {card.set.series} · #{card.number ?? 'N/A'}</p>
        <div className="value-chip">Best market signal {formatCurrency(getBestPrice(card))}</div>

        <dl className="facts">
          <div><dt>Type</dt><dd>{card.types?.join(', ') ?? card.supertype ?? 'Unknown'}</dd></div>
          <div><dt>HP</dt><dd>{card.hp ?? 'N/A'}</dd></div>
          <div><dt>Released</dt><dd>{card.set.releaseDate ?? 'Unknown'}</dd></div>
          <div><dt>Artist</dt><dd>{card.artist ?? 'Unknown'}</dd></div>
        </dl>

        {card.attacks?.length ? (
          <div className="attack-box">
            <strong>{card.attacks[0].name} {card.attacks[0].damage}</strong>
            <span>{card.attacks[0].text}</span>
          </div>
        ) : null}

        <div className="price-list">
          {prices.map((price) => (
            <span key={price.label}>{price.label}: <strong>{formatCurrency(price.value)}</strong></span>
          ))}
        </div>

        <div className="action-row">
          {statuses.map((status) => (
            <button key={status} type="button" onClick={() => onAdd(card, status)}>
              {status}
            </button>
          ))}
        </div>

        {(card.tcgplayer?.url || card.cardmarket?.url) && (
          <a className="market-link" href={card.tcgplayer?.url ?? card.cardmarket?.url} target="_blank" rel="noreferrer">
            Open market listing
          </a>
        )}
      </div>
    </article>
  )
}

function buildApiQuery(searchTerm: string) {
  const trimmed = searchTerm.trim()
  if (/^\d+\/?\d*$/.test(trimmed)) return `number:${trimmed.replace('/', '')}`
  const safe = trimmed.replace(/["\\]/g, '').split(/\s+/).filter(Boolean).slice(0, 4).join(' ')
  const nameAndNumber = safe.match(/^(.+)\s+(\d{1,3})$/)
  if (nameAndNumber) return `name:*${nameAndNumber[1]}* number:${nameAndNumber[2]}`
  if (safe.toLowerCase().startsWith('set:')) return `set.name:*${safe.slice(4).trim()}*`
  return `name:*${safe}*`
}

function flattenPrices(card: PokemonCard) {
  const prices: Array<{ label: string; value?: number }> = []

  Object.entries(card.tcgplayer?.prices ?? {}).forEach(([variant, price]) => {
    prices.push({ label: `${humanize(variant)} market`, value: price.market ?? price.mid ?? price.low })
  })

  if (card.cardmarket?.prices) {
    prices.push({ label: 'Cardmarket trend', value: card.cardmarket.prices.trendPrice })
    prices.push({ label: 'Cardmarket average', value: card.cardmarket.prices.averageSellPrice })
  }

  return prices.filter((price) => typeof price.value === 'number').slice(0, 6)
}

function getBestPrice(card: PokemonCard) {
  const tcgPrices = Object.values(card.tcgplayer?.prices ?? {})
    .map((price) => price.market ?? price.mid ?? price.low)
    .filter((price): price is number => typeof price === 'number')

  if (tcgPrices.length) return Math.max(...tcgPrices)

  const market = card.cardmarket?.prices
  return market?.trendPrice ?? market?.averageSellPrice ?? market?.lowPrice ?? 0
}

function formatCurrency(value: number | undefined) {
  if (!value) return 'No price yet'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function humanize(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
}

function loadCollection(): CollectionItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? (JSON.parse(saved) as CollectionItem[]) : []
  } catch {
    return []
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function extractCardSearch(text: string, fileName: string) {
  const combined = `${text}\n${fileName}`
    .replace(/[^a-zA-Z0-9#/\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const collectorNumber = combined.match(/(?:#|\b)(\d{1,3})\s*\/\s*\d{1,3}/)?.[1]
  const titleCaseWords = combined.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2}\b/g)
  const ignored = new Set(['Pokemon', 'Pokémon', 'Basic', 'Stage', 'Trainer', 'Energy', 'Evolves'])
  const likelyName = titleCaseWords?.find((word) => !ignored.has(word.split(' ')[0]))

  if (likelyName && collectorNumber) return `${likelyName} ${collectorNumber}`
  return likelyName ?? collectorNumber ?? ''
}

export default App
