const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');

// Configuración optimizada
const CONFIG = {
  inputFile: 'songs.json',
  outputFile: 'songs_with_ids.json',
  maxRetries: 2,
  requestDelay: { min: 3000, max: 7000 }, // Delay más largo
  timeout: 40000,
  maxParallelPages: 2, // Reducido para mayor estabilidad
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0'
  ],
  proxies: [] // Opcional: Agrega proxies si es necesario
};

puppeteer.use(StealthPlugin());

class YouTubeScraper {
  constructor() {
    this.browser = null;
    this.stats = {
      success: 0,
      failed: 0,
      retries: 0,
      skipped: 0
    };
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
  }

  async scrapeSong(page, song) {
    const searchQuery = `${song.title} ${song.artist} official`;
    try {
      // Navegación con headers simulados
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/'
      });

      await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}&sp=EgIQAQ%253D%253D`, {
        waitUntil: 'networkidle2',
        timeout: CONFIG.timeout
      });

      // Esperar a que los resultados se carguen
      await page.waitForSelector('ytd-video-renderer, ytd-rich-item-renderer', { timeout: 15000 });

      // Estrategia de búsqueda mejorada
      const videoId = await page.evaluate(() => {
        // 1. Intentar con el primer resultado
        const firstResult = document.querySelector('ytd-video-renderer a#video-title') || 
                          document.querySelector('ytd-rich-item-renderer a#video-title');
        
        if (firstResult?.href) {
          const match = firstResult.href.match(/v=([^&]+)/);
          if (match) return match[1];
        }

        // 2. Buscar en los enlaces de miniaturas
        const thumbLinks = document.querySelectorAll('ytd-thumbnail a');
        for (const link of thumbLinks) {
          const match = link.href?.match(/v=([^&]+)/);
          if (match) return match[1];
        }

        return null;
      });

      return videoId;
    } catch (error) {
      console.error(`Error en scraping: ${error.message}`);
      return null;
    }
  }

  async processSongs(songs) {
    const pages = await Promise.all(
      Array(CONFIG.maxParallelPages).fill().map(() => this.browser.newPage())
    );

    for (const [index, song] of songs.entries()) {
      if (song.youtubeId) {
        this.stats.skipped++;
        continue;
      }

      let retries = 0;
      let videoId = null;

      while (retries < CONFIG.maxRetries && !videoId) {
        const page = pages[index % CONFIG.maxParallelPages];
        try {
          // Configuración de página
          await page.setUserAgent(this.getRandomUserAgent());
          await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
          await page.setJavaScriptEnabled(true);

          videoId = await this.scrapeSong(page, song);

          if (videoId) {
            song.youtubeId = videoId;
            this.stats.success++;
            console.log(`✅ [${index + 1}/${songs.length}] ${song.title.slice(0, 30)}... - ${song.artist.slice(0, 20)}...: ${videoId}`);
          } else {
            this.stats.retries++;
            console.log(`⚠️ [${index + 1}/${songs.length}] Intento ${retries + 1} fallido para: ${song.title.slice(0, 30)}...`);
          }
        } catch (error) {
          console.error(`❌ Error crítico: ${error.message}`);
        }

        retries++;
        await this.randomDelay();
      }

      if (!videoId) {
        this.stats.failed++;
        song.failed = true;
      }

      // Guardar progreso cada 10 canciones
      if (index % 10 === 0) {
        await this.savePartialResults(songs);
      }
    }

    await Promise.all(pages.map(page => page.close()));
  }

  async savePartialResults(data) {
    const tempFile = `${CONFIG.outputFile}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
  }

  async saveResults(data) {
    await fs.writeFile(CONFIG.outputFile, JSON.stringify(data, null, 2));
  }

  getRandomUserAgent() {
    return CONFIG.userAgents[Math.floor(Math.random() * CONFIG.userAgents.length)];
  }

  async randomDelay() {
    const delay = Math.random() * (CONFIG.requestDelay.max - CONFIG.requestDelay.min) + CONFIG.requestDelay.min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async close() {
    if (this.browser) await this.browser.close();
  }
}

async function main() {
  const scraper = new YouTubeScraper();
  try {
    console.log('🚀 Iniciando scraping...');
    await scraper.init();

    const data = JSON.parse(await fs.readFile(CONFIG.inputFile, 'utf-8'));
    if (!data?.songs?.length) throw new Error('Archivo sin canciones');

    await scraper.processSongs(data.songs);
    await scraper.saveResults(data);

    console.log('\n📊 Resultados finales:');
    console.log(`✅ Éxitos: ${scraper.stats.success}`);
    console.log(`❌ Fallidos: ${scraper.stats.failed}`);
    console.log(`🔄 Reintentos: ${scraper.stats.retries}`);
    console.log(`⏩ Saltados: ${scraper.stats.skipped}`);

  } catch (error) {
    console.error('🔥 Error fatal:', error);
  } finally {
    await scraper.close();
  }
}

main();