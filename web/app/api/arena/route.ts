import { NextResponse } from "next/server"
import { spawnSync } from "child_process"
import path from "path"
import fs from "fs"

export const runtime = "nodejs"
export const maxDuration = 300

function projectRoot() {
  return path.resolve(process.cwd(), "..")
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get("symbol") || "2330").trim()
  const days = parseInt(searchParams.get("days") || "60")
  const heuristic = searchParams.get("heuristic") === "1" || searchParams.get("heuristic") === "true"
  const jevModel = searchParams.get("jevModel") || ""
  const every = parseInt(searchParams.get("every") || "5")

  const root = projectRoot()
  const args = ["run_arena.py", "--symbol", symbol, "--days", String(days)]
  if (heuristic) args.push("--heuristic")
  if (jevModel) args.push("--jev-model", jevModel)
  args.push("--jev-every", String(every))

  try {
    const result = spawnSync("python", args, {
      cwd: root,
      timeout: 290000,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    })
    if (result.error) {
      return NextResponse.json({ error: String(result.error) }, { status: 500 })
    }
    if (result.status !== 0) {
      return NextResponse.json(
        { error: "arena failed", stderr: result.stderr, stdout: result.stdout },
        { status: 500 }
      )
    }

    const outPath = path.join(root, "experiments", "arena", `${symbol}_arena.json`)
    if (!fs.existsSync(outPath)) {
      return NextResponse.json({ error: "no output file", stdout: result.stdout }, { status: 500 })
    }
    const raw = fs.readFileSync(outPath, "utf8")
    const json = JSON.parse(raw)
    return NextResponse.json({ ok: true, ...json, stdout: result.stdout })
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
