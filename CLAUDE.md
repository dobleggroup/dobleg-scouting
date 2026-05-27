# Scout Platform

Plataforma de scouting de fútbol con datos de Google Sheets.

## Ejecutar el proyecto

```bash
npm install    # Instalar dependencias
npm run dev    # Servidor de desarrollo (http://localhost:5173)
```

## Build para producción

```bash
npm run build    # Compila TypeScript y genera bundle
npm run preview  # Previsualiza el build
```

## Stack

- React 18 + TypeScript
- Vite 7
- Tailwind CSS
- Recharts (gráficos)
- PapaParse (CSV)
- jsPDF + html2canvas (exportar PDF)

## Estructura

- `src/pages/` - Páginas principales (Scouting Externo/Interno, Seguimiento, Comparación)
- `src/components/` - Componentes UI
- `src/context/DataContext.tsx` - Carga y provee datos de jugadores
- `src/constants/scoring.ts` - URLs de Google Sheets y configuración de métricas
- `src/services/csvService.ts` - Parseo de CSV

## Datos

Los datos vienen de Google Sheets publicados como CSV. Las URLs están en `src/constants/scoring.ts`.
En desarrollo, Vite usa un proxy (`/sheets-proxy`) para evitar CORS.

---

## Flujo GPS — Datos físicos de jugadores Doble G Sports Group

Esta carpeta también se usa para **procesar datos GPS de rendimiento físico** de los jugadores representados por la agencia Doble G Sports Group. El usuario puede pegar/adjuntar PDFs, imágenes, capturas de pantalla, o texto con datos GPS de partidos y el objetivo es **extraer los datos y enviarlos a Google Sheets**.

### Google Sheet destino

- **Spreadsheet:** https://docs.google.com/spreadsheets/d/1gXhmqIc_joFkiQ1brie4-xHX43W8fqn2f6tqV04rx9s/edit?gid=1233910424#gid=1233910424
- **Hoja:** `GPS_Data` (gid=1233910424)
- **Apps Script URL:** `https://script.google.com/macros/s/AKfycbzbUpCqY5ZVAR75LuFhn123K3ymaFFzVZHlfwV7ekRKYupcH03znpuJ19fMwmTtbIgZ/exec`

### Cómo enviar datos a la hoja

Hacer un POST al Apps Script URL con body JSON:

```json
{
  "rows": [
    {
      "fecha": "2026-05-03",
      "jugador": "Gianluca Prestianni",
      "equipo": "Feyenoord",
      "rival": "Ajax",
      "resultado": "2-1",
      "competencia": "Eredivisie",
      "minutos": 90,
      "distanciaTotal": 10500,
      "mtsMin": 116.7,
      "dist16_21": 850,
      "dist21_24": 320,
      "distOver24": 95,
      "hsr": 415,
      "velMax": 32.1,
      "sprints": 22,
      "aiPercent": 12.3,
      "accOver2": 45,
      "decOver2": 42,
      "accOver3": 12,
      "decOver3": 10,
      "accOver4": 3,
      "decOver4": 2,
      "playerLoad": 980,
      "rhieBouts": 6,
      "uploadedAt": "2026-05-04T10:30:00Z"
    }
  ]
}
```

### Columnas de la hoja GPS_Data (25)

| # | Columna | Campo JSON | Descripción |
|---|---------|-----------|-------------|
| 1 | Fecha | `fecha` | YYYY-MM-DD |
| 2 | Jugador | `jugador` | Nombre completo |
| 3 | Equipo | `equipo` | Equipo del jugador |
| 4 | Rival | `rival` | Equipo contrario |
| 5 | Resultado | `resultado` | Ej: "2-1" |
| 6 | Competencia | `competencia` | Liga/torneo |
| 7 | Minutos | `minutos` | Minutos jugados |
| 8 | Distancia (m) | `distanciaTotal` | Metros totales recorridos |
| 9 | Mts/min | `mtsMin` | Metros por minuto |
| 10 | Dist 16-21 km/h | `dist16_21` | Metros en zona 16-21 km/h |
| 11 | Dist 21-24 km/h | `dist21_24` | Metros en zona 21-24 km/h |
| 12 | Dist >24 km/h | `distOver24` | Metros a más de 24 km/h |
| 13 | HSR >21 km/h | `hsr` | High Speed Running (dist >21 km/h) |
| 14 | Vel Max (km/h) | `velMax` | Velocidad máxima |
| 15 | Sprints | `sprints` | Cantidad de sprints |
| 16 | % Alta Intensidad | `aiPercent` | % distancia a alta intensidad |
| 17 | Acc >2 m/s | `accOver2` | Aceleraciones >2 m/s² |
| 18 | Dec >2 m/s | `decOver2` | Desaceleraciones >2 m/s² |
| 19 | Acc >3 m/s² | `accOver3` | Aceleraciones >3 m/s² |
| 20 | Dec >3 m/s² | `decOver3` | Desaceleraciones >3 m/s² |
| 21 | Acc >4 m/s | `accOver4` | Aceleraciones >4 m/s² |
| 22 | Dec >4 m/s | `decOver4` | Desaceleraciones >4 m/s² |
| 23 | Player Load | `playerLoad` | Carga total del jugador |
| 24 | RHIE Bouts | `rhieBouts` | Repeated High Intensity Efforts |
| 25 | Subido | `uploadedAt` | Timestamp ISO de subida |

### Jugadores Doble G Sports Group (lista actualizada)

Cuando el usuario envíe datos GPS, **solo extraer datos de estos jugadores**. El matching debe ser case-insensitive y accent-insensitive (NFD normalization). Buscar por nombre completo, apellido solo, o formato "Inicial. Apellido".

| Clave corta | Nombre completo |
|-------------|----------------|
| J. Paradela | José Paradela |
| M. Palacios | Matías Palacios |
| M. Vera | Mauricio Vera |
| L. Orellano | Luca Orellano |
| A. Steimbach | Alexis Steimbach |
| M. Espindola | Matías Espíndola |
| J. Palacios | Julián Palacios |
| J. Farías | Juan Farías |
| S. Echeverría | Santiago Echeverría |
| A. Mulet | Agustín Mulet |
| A. Massaccesi | Agustín Massaccesi |
| I. Erquiaga | Iván Erquiaga |
| J. Díaz | Juan Ignacio Díaz |
| M. Kabalin | Matías Kabalin |
| G. Prestianni | Gianluca Prestianni |
| Gonzalo González | Gonzalo González |
| L. Minniti | Luciano Minniti |
| J. López | Julián López |
| D. Mastrángelo | Diego Mastrángelo |
| A. Melano | Agustín Melano |
| J. Postigo | Joaquin Postigo |
| C. Bravo | Claudio Bravo |
| Nicolás Leguizamón | Nicolás Leguizamón |
| M. Sanabria | Mario Sanabria |
| M. Enrique | Marcos Enrique |
| M. Isopi | Mauro Isopi |
| F. Paradela | Federico Paradela |
| F. Paradela | Francesco Paradela |
| T. Valdecantos Valle | Tomás Valdecantos |
| B. Centeno | Bruno Centeno |
| F. Lo Celso | Francesco Lo Celso |
| M. Carabajal | Mateo Carabajal |
| Nicolás Watson | Nicolás Watson |
| F. Watson | Franco Watson |
| Álvaro López | Álvaro López |
| P. Guajardo | Paolo Guajardo |
| J. Ginzo | J. Ginzo |

### Instrucciones para procesar datos GPS

Cuando el usuario adjunte un PDF, imagen, captura de pantalla, o texto con datos de GPS:

1. **Identificar el formato**: Catapult (tabla con columnas), OpenField (gráficos de barras), captura de FotMob/SofaScore, CSV, Excel, u otro formato.
2. **Extraer datos**: Leer las métricas disponibles del documento. No todos los documentos tienen las 25 métricas — completar con 0 lo que no esté disponible.
3. **Filtrar jugadores DG**: Solo procesar datos de jugadores que estén en la lista de arriba. Ignorar el resto.
4. **Pedir contexto faltante**: Si no se puede inferir del documento, preguntar al usuario: fecha del partido, equipo rival, resultado, competencia.
5. **Enviar a Google Sheets**: Hacer POST al Apps Script URL con el JSON estructurado.
6. **Confirmar**: Mostrar qué datos se enviaron (jugador, partido, métricas principales).

### Formatos conocidos de PDFs de GPS

**Catapult (tabla):** PDFs con tablas de datos. Página 1 tiene métricas locomotivas (distancia, velocidad, sprints). Página 4 tiene métricas mecánicas (aceleraciones, desaceleraciones, player load, RHIE).

**OpenField (gráficos):** PDFs con gráficos de barras por jugador. Métricas aparecen como valores en ejes Y con nombres de jugadores en eje X.

**Imágenes/capturas:** El usuario puede mandar screenshots de apps como FotMob, SofaScore, Catapult, etc. Leer los valores visibles y mapear a las columnas de la hoja.
