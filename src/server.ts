import { buildApp } from './app.js'
import { env } from './config/env.js'
import { startScheduler } from './jobs/scheduler.js'

const RESET  = '\x1b[0m'
const BOLD   = '\x1b[1m'
const DIM    = '\x1b[2m'
const GREEN  = '\x1b[32m'
const CYAN   = '\x1b[36m'
const YELLOW = '\x1b[33m'
const BLUE   = '\x1b[34m'
const WHITE  = '\x1b[97m'

function banner(port: number) {
  const line = '─'.repeat(48)
  console.log('')
  console.log(`${CYAN}${BOLD}  ╔${line}╗${RESET}`)
  console.log(`${CYAN}${BOLD}  ║${RESET}${BOLD}${WHITE}           💰  MoneyWise API  v1.1.0          ${RESET}${CYAN}${BOLD}║${RESET}`)
  console.log(`${CYAN}${BOLD}  ╚${line}╝${RESET}`)
  console.log('')
  console.log(`${GREEN}  ✓${RESET} ${BOLD}Serveur${RESET}       ${WHITE}http://0.0.0.0:${port}${RESET}`)
  console.log(`${GREEN}  ✓${RESET} ${BOLD}Documentation${RESET} ${CYAN}http://localhost:${port}/docs${RESET}`)
  console.log(`${GREEN}  ✓${RESET} ${BOLD}Health check${RESET}  ${DIM}http://localhost:${port}/health${RESET}`)
  console.log(`${GREEN}  ✓${RESET} ${BOLD}Environnement${RESET} ${YELLOW}${env.NODE_ENV}${RESET}`)
  console.log('')
  console.log(`${DIM}  Prêt à recevoir des requêtes 🚀${RESET}`)
  console.log('')
}

async function main() {
  const app = await buildApp()

  try {
    await app.listen({ port: env.PORT, host: env.HOST })
    startScheduler(app.prisma)
    banner(env.PORT)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
