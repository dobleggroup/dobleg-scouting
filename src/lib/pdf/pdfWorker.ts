// La URL del worker la resuelve Vite en build. Se pasa a `extractPdfItems` desde la
// UI; los tests corren sin worker (pdfjs cae al fake worker en Node).
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

export default workerSrc as string
