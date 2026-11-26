import fs from 'node:fs'
import path from 'node:path'
const f = path.join(process.cwd(), 'data', 'db.json')
if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('database reset — will reseed on next start') }
else console.log('nothing to reset')
