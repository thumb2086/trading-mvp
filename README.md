# Trading MVP — 即時股市資料 × 多決策模型競技場

本專案提供：
- **即時股市資料**：台股 (TWSE/TPEx MIS) 與美股 (Yahoo) 即時報價，批次更新
- **多決策模型競技**：16+ 個固定技術策略 + JEV 風格決策模型 (open-alternative-jev / so1) 在真實市場資料下回測比較
- **Web 介面**：Next.js 本機儀表板，含市場總覽、決策競技場、K 線與策略比較

## 啟動 Web
```bat
start-web.bat
```
或
```bash
cd web && npm install && npm run dev
```
開啟 http://localhost:3000

## Python 競技場 CLI
```bash
python run_arena.py --symbol 2330 --market TW --days 90
python run_arena.py --symbol AAPL --market US --days 90 --heuristic
python run_arena.py --symbol 2330 --days 180 --start 2026-01-01 --end 2026-06-30
```

參數：
- `--market` TW / US / auto
- `--start` / `--end` YYYY-MM-DD 指定模擬區間（模型僅能使用該時間點前的資料）
- `--heuristic` 不用 LLM，純 CPU 啟發式
- `--jev-every N` JEV 決策間隔（根 K 線），越小交易越頻繁但越慢

## 模型資源使用
- **JEV (so1)**：使用 PyTorch + Transformers，預設 `Qwen/Qwen2.5-0.5B-Instruct`
  - 有 CUDA GPU 會自動加速；否則 CPU（約 10–30 秒/次決策）
  - 可用 `--jev-model` 指定更大模型（需更多 VRAM）
- **Heuristic**：純 CPU，毫秒級，無 GPU 需求
- **固定策略**：純 NumPy/Pandas，CPU

## 因果設計（避免未來資訊洩漏）
- 回測時 JEV 每次決策僅接收 `df.iloc[:i+1]`（當下及以前的資料）
- 狀態文件 (RSI、均線、報酬) 全部由過去資料計算
- 固定策略訊號以滾動視窗產生，不使用未來 K 線

## 目錄
- `data/realtime.py` — 即時報價與 OHLCV
- `strategies/decision/` — JEV 決策模型與狀態文件
- `strategies/fixed/` — 固定技術策略
- `engine/simulator.py` — 回測引擎
- `web/` — Next.js 前端
