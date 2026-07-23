export interface StockInfo {
  symbol: string
  name: string
  sector: string
}

// 常用台股清單（約 100 檔），作為初始顯示
export const COMMON_STOCKS: StockInfo[] = [
  { symbol: "2330", name: "台積電", sector: "半導體" },
  { symbol: "2454", name: "聯發科", sector: "半導體" },
  { symbol: "2317", name: "鴻海", sector: "電子零組件" },
  { symbol: "2308", name: "台達電", sector: "電子零組件" },
  { symbol: "2412", name: "中華電", sector: "通訊" },
  { symbol: "2881", name: "富邦金", sector: "金融" },
  { symbol: "2882", name: "國泰金", sector: "金融" },
  { symbol: "2886", name: "兆豐金", sector: "金融" },
  { symbol: "2891", name: "中信金", sector: "金融" },
  { symbol: "2002", name: "中鋼", sector: "鋼鐵" },
  { symbol: "1301", name: "台塑", sector: "石化" },
  { symbol: "1303", name: "南亞", sector: "石化" },
  { symbol: "1326", name: "台化", sector: "石化" },
  { symbol: "1216", name: "統一", sector: "食品" },
  { symbol: "3711", name: "日月光投控", sector: "半導體" },
  { symbol: "2382", name: "廣達", sector: "電腦週邊" },
  { symbol: "2357", name: "華碩", sector: "電腦週邊" },
  { symbol: "2376", name: "技嘉", sector: "電腦週邊" },
  { symbol: "3231", name: "緯創", sector: "電腦週邊" },
  { symbol: "3034", name: "聯詠", sector: "半導體" },
  { symbol: "3661", name: "世芯-KY", sector: "半導體" },
  { symbol: "3443", name: "創意", sector: "半導體" },
  { symbol: "8299", name: "群聯", sector: "半導體" },
  { symbol: "6239", name: "力成", sector: "半導體" },
  { symbol: "3037", name: "欣興", sector: "半導體" },
  { symbol: "2409", name: "友達", sector: "面板" },
  { symbol: "3481", name: "群創", sector: "面板" },
  { symbol: "2327", name: "國巨", sector: "電子零組件" },
  { symbol: "4904", name: "遠傳", sector: "通訊" },
  { symbol: "3045", name: "台灣大", sector: "通訊" },
  { symbol: "2884", name: "玉山金", sector: "金融" },
  { symbol: "5880", name: "合庫金", sector: "金融" },
  { symbol: "6505", name: "台塑化", sector: "石化" },
  { symbol: "2603", name: "長榮", sector: "航運" },
  { symbol: "2609", name: "陽明", sector: "航運" },
  { symbol: "2618", name: "長榮航", sector: "航運" },
  { symbol: "2610", name: "華航", sector: "航運" },
  { symbol: "1101", name: "台泥", sector: "水泥" },
  { symbol: "1504", name: "東元", sector: "機電" },
  { symbol: "1519", name: "華城", sector: "重電" },
  { symbol: "1513", name: "中興電", sector: "重電" },
  { symbol: "2912", name: "統一超", sector: "流通" },
  { symbol: "2356", name: "英業達", sector: "電腦週邊" },
  { symbol: "2377", name: "微星", sector: "電腦週邊" },
  { symbol: "2353", name: "宏碁", sector: "電腦週邊" },
  { symbol: "3023", name: "信邦", sector: "電子零組件" },
  { symbol: "2492", name: "華新科", sector: "電子零組件" },
  { symbol: "6525", name: "捷敏-KY", sector: "半導體" },
  { symbol: "2834", name: "臺企銀", sector: "金融" },
  { symbol: "0050", name: "元大台灣50", sector: "ETF" },
  { symbol: "0056", name: "元大高股息", sector: "ETF" },
  { symbol: "00878", name: "國泰永續高股息", sector: "ETF" },
  { symbol: "00919", name: "群益台灣精選高息", sector: "ETF" },
  { symbol: "00929", name: "復華台灣科技優息", sector: "ETF" },
  { symbol: "00940", name: "元大台灣價值高息", sector: "ETF" },
]

export const SECTORS = Array.from(new Set(COMMON_STOCKS.map(s => s.sector)))

let cachedAllStocks: StockInfo[] | null = null
let lastFetch = 0

export async function getAllTWSEStocks(): Promise<StockInfo[]> {
  if (cachedAllStocks && Date.now() - lastFetch < 3600000) return cachedAllStocks
  try {
    const res = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
    const data = await res.json()
    if (!Array.isArray(data)) throw new Error("Invalid response")
    cachedAllStocks = data.map((s: any) => ({
      symbol: String(s.Code).padStart(4, "0"),
      name: s.Name ?? "",
      sector: s.Sector ?? "",
    })).filter((s: StockInfo) => s.symbol && /^\d{4}$/.test(s.symbol))
    lastFetch = Date.now()
    return cachedAllStocks
  } catch {
    return COMMON_STOCKS
  }
}

export async function searchStocks(query: string, sector?: string): Promise<StockInfo[]> {
  const all = await getAllTWSEStocks()
  const q = query.toLowerCase()
  let filtered = all
  if (q) {
    filtered = filtered.filter(s => s.symbol.includes(q) || s.name.toLowerCase().includes(q))
  }
  if (sector) {
    filtered = filtered.filter(s => s.sector === sector)
  }
  return filtered.slice(0, 50)
}
