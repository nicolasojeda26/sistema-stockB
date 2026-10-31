// Aplica en orden las migraciones de db/migrations que todavía no corrieron.
// Uso: npm run db:migrate   (lee DATABASE_URL de .env.local)
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

export async function migrar(url: string, log = console.log) {
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
  try {
    await sql`create table if not exists _migraciones (nombre text primary key, aplicada timestamptz not null default now())`
    const hechas = new Set((await sql`select nombre from _migraciones`).map((r) => r.nombre as string))
    const dir = join(process.cwd(), 'db', 'migrations')
    const archivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    for (const archivo of archivos) {
      if (hechas.has(archivo)) continue
      const texto = readFileSync(join(dir, archivo), 'utf8')
      await sql.begin(async (tx) => {
        await tx.unsafe(texto)
        await tx`insert into _migraciones (nombre) values (${archivo})`
      })
      log(`Aplicada ${archivo}`)
    }
  } finally {
    await sql.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Falta DATABASE_URL')
    process.exit(1)
  }
  migrar(url)
    .then(() => console.log('Base al día'))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
