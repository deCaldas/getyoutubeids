/**
 * @module YouTubeScraper
 * @description Módulo para buscar IDs de YouTube a partir de canciones usando Puppeteer Extra con modo stealth.
 * Lee canciones desde un archivo JSON y guarda los resultados con los IDs encontrados.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');

/**
 * Configuración del scraper
 * @typedef {Object} ScraperConfig
 * @property {string} inputFile - Archivo JSON de entrada con las canciones
 * @property {string} outputFile - Archivo JSON de salida con los resultados
 * @property {number} maxRetries - Número máximo de reintentos por canción
 * @property {Object} requestDelay - Rango de delay entre requests (ms)
 * @property {number} requestDelay.min - Mínimo delay entre requests
 * @property {number} requestDelay.max - Máximo delay entre requests
 * @property {number} timeout - Timeout para operaciones de Puppeteer (ms)
 * @property {number} maxParallelPages - Número máximo de páginas paralelas
 * @property {Array<string>} userAgents - Lista de user agents para rotar
 * @property {Array<string>} proxies - Lista de proxies (opcional)
 */

/** @type {ScraperConfig} */
const CONFIG = {
  inputFile: 'songs.json',
  outputFile: 'songs_with_ids.json',
  maxRetries: 2,
  requestDelay: { min: 3000, max: 7000 },
  timeout: 40000,
  maxParallelPages: 2,
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0'
  ],
  proxies: []
};

puppeteer.use(StealthPlugin());

/**
 * Clase principal para el scraping de IDs de YouTube
 * @class
 */
class YouTubeScraper {
  constructor() {
    /**
     * Instancia del navegador Puppeteer
     * @type {puppeteer.Browser}
     */
    this.browser = null;
    
    /**
     * Estadísticas del scraping
     * @type {Object}
     * @property {number} success - Canciones procesadas con éxito
     * @property {number} failed - Canciones que fallaron después de reintentos
     * @property {number} retries - Reintentos totales realizados
     * @property {number} skipped - Canciones saltadas (ya tenían ID)
     */
    this.stats = {
      success: 0,
      failed: 0,
      retries: 0,
      skipped: 0
    };
  }

  /**
   * Inicializa el navegador Puppeteer
   * @async
   * @returns {Promise<void>}
   */
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

  /**
   * Busca el ID de YouTube para una canción
   * @async
   * @param {Object} song - Canción a buscar
   * @param {string} song.title - Título de la canción
   * @param {string} song.artist - Artista de la canción
   * @returns {Promise<?string>} ID del video de YouTube o null si no se encuentra
   */
  async scrapeSong(page, song) {
    const searchQuery = `${song.title} ${song.artist} official`;
    try {
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/'
      });

      await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}&sp=EgIQAQ%253D%253D`, {
        waitUntil: 'networkidle2',
        timeout: CONFIG.timeout
      });

      await page.waitForSelector('ytd-video-renderer, ytd-rich-item-renderer', { timeout: 15000 });

      const videoId = await page.evaluate(() => {
        const firstResult = document.querySelector('ytd-video-renderer a#video-title') || 
                          document.querySelector('ytd-rich-item-renderer a#video-title');
        
        if (firstResult?.href) {
          const match = firstResult.href.match(/v=([^&]+)/);
          if (match) return match[1];
        }

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

  /**
   * Procesa una lista de canciones para encontrar sus IDs en YouTube
   * @async
   * @param {Array<Object>} songs - Lista de canciones a procesar
   * @returns {Promise<void>}
   */
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

      if (index % 10 === 0) {
        await this.savePartialResults(songs);
      }
    }

    await Promise.all(pages.map(page => page.close()));
  }

  /**
   * Guarda resultados parciales en un archivo temporal
   * @async
   * @param {Array<Object>} data - Datos a guardar
   * @returns {Promise<void>}
   */
  async savePartialResults(data) {
    const tempFile = `${CONFIG.outputFile}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
  }

  /**
   * Guarda los resultados finales
   * @async
   * @param {Array<Object>} data - Datos a guardar
   * @returns {Promise<void>}
   */
  async saveResults(data) {
    await fs.writeFile(CONFIG.outputFile, JSON.stringify(data, null, 2));
  }

  /**
   * Selecciona un user agent aleatorio de la configuración
   * @returns {string} User agent aleatorio
   */
  getRandomUserAgent() {
    return CONFIG.userAgents[Math.floor(Math.random() * CONFIG.userAgents.length)];
  }

  /**
   * Espera un tiempo aleatorio entre requests
   * @async
   * @returns {Promise<void>}
   */
  async randomDelay() {
    const delay = Math.random() * (CONFIG.requestDelay.max - CONFIG.requestDelay.min) + CONFIG.requestDelay.min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Cierra el navegador Puppeteer
   * @async
   * @returns {Promise<void>}
   */
  async close() {
    if (this.browser) await this.browser.close();
  }
}

/**
 * Función principal que ejecuta el scraping
 * @async
 * @returns {Promise<void>}
 */
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