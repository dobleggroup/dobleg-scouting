// Genera las imágenes fuente para @capacitor/assets: ícono y splash de la app
// con el símbolo de Doble G (logo-light, trazo blanco) sobre el fondo oscuro de
// la marca (#0a0a0a). Correr: node scripts/make-app-assets.mjs
import sharp from 'sharp'
import fs from 'fs'

const BG = { r: 10, g: 10, b: 10, alpha: 1 } // #0a0a0a
const LOGO = 'public/logo-light.png'
const OUT = 'assets'

fs.mkdirSync(OUT, { recursive: true })

async function resizedLogo(targetWidth) {
  return sharp(LOGO)
    .resize({ width: targetWidth, fit: 'inside' })
    .png()
    .toBuffer()
}

async function canvas(size, logoWidth) {
  const logo = await resizedLogo(logoWidth)
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer()
}

// ── Íconos ──────────────────────────────────────────────
// Foreground (adaptive): símbolo transparente en zona segura (~50% del lienzo).
const fg = await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: await resizedLogo(520), gravity: 'center' }])
  .png()
  .toBuffer()
fs.writeFileSync(`${OUT}/icon-foreground.png`, fg)

// Background sólido oscuro.
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } })
  .png()
  .toFile(`${OUT}/icon-background.png`)

// Ícono legacy (cuadrado): fondo + símbolo.
fs.writeFileSync(`${OUT}/icon-only.png`, await canvas(1024, 620))

// ── Splash ──────────────────────────────────────────────
fs.writeFileSync(`${OUT}/splash.png`, await canvas(2732, 760))
fs.writeFileSync(`${OUT}/splash-dark.png`, await canvas(2732, 760))

console.log('assets generados en /assets:', fs.readdirSync(OUT).join(', '))
