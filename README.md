# YouTube ID Scraper and JSDoc

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Un scraper para encontrar IDs de YouTube a partir de listas de canciones, usando Puppeteer Extra en modo stealth para evitar detección.

## Características

- Búsqueda de IDs de videos en YouTube
- Configuración flexible de delays y reintentos
- Soporte para múltiples user agents
- Guardado automático de progreso
- Estadísticas detalladas

## Instalación

```bash
npm install
```

Uso
1. Prepara un archivo `songs.json` con formato:
```json
{
  "songs": [
    {
            "title": "Rapper's Delight",
            "artist": "The Sugarhill Gang",
            "year": 1979,
            "album": "Sugarhill Gang",
            "tag": ["Hip-Hop", "Old School Rap"]
        },
        {
            "title": "The Message",
            "artist": "Grandmaster Flash & The Furious Five",
            "year": 1982,
            "album": "The Message",
            "tag": ["Hip-Hop", "Conscious Rap"]
        },
        {
            "title": "Planet Rock",
            "artist": "Afrika Bambaataa & The Soul Sonic Force",
            "year": 1982,
            "album": "Planet Rock: The Album",
            "tag": ["Electro", "Hip-Hop"]
        }
    ]
}
```

2. Ejecutar el scraper:
```js
node getYouTubeIds.js
```
3. Los resultados se guardarán en `songs_with_ids.json`

Edita las constantes al inicio del archivo para ajustar:

`maxRetries`: Número de reintentos por canción

`requestDelay`: Rango de tiempo entre requests (ms)

`maxParallelPages`: Número de páginas paralelas

`userAgents`: Lista de user agents para rotar

Genera documentación con:
```bash
npm run docs
```

Limitaciones
+ Depende de la estructura actual de YouTube
+ Puede requerir ajustes si YouTube cambia su HTML

Las contribuciones son bienvenidas. Por favor haga su issue primero para discutir los cambios.

Licencia
MIT
