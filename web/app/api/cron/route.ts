import { NextResponse } from "next/server"
import { fetchTWStock } from "../../../lib/data"
import { runAllStrategies } from "../../../lib/simulator"

export const runtime = "nodejs"
export const maxDuration = 60

async function persistToKV(key: string, data: unknown) {
  if (!process.env.KV_REST_API_URL) return
  try {
    await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      body: JSON.stringify(data),
    })
  } catch {
    console.warn("KV persist failed")
  }
}

export async function GET() {
  try {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 180)

    const data = await fetchTWStock("2330", start.toISOString().split("T")[0], end.toISOString().split("T")[0])
    const results = runAllStrategies(data)

    await persistToKV("signals:2330", {
      date: new Date().toISOString().split("T")[0],
      results,
    })

    return NextResponse.json({ ok: true, strategies: results.length })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
