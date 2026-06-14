# Damai Search Export Tool

Standalone browser-assisted exporter for Damai search results.

This tool is intentionally separate from the CitySense app runtime:

- it does not read the project `.env`;
- it does not modify the root `package.json`;
- it uses its own `config.json`;
- it uses a dedicated browser profile under this folder by default;
- it does not read, print, or store browser cookies.

## Setup

```bash
cd tools/damai-search
npm run init
```

Edit `config.json` if needed:

```json
{
  "city": "上海",
  "keyword": "",
  "pages": 3,
  "pageSize": 30,
  "outputDir": "./output",
  "userDataDir": "./.browser-profile"
}
```

## Run

```bash
cd tools/damai-search
npm start
```

The script opens a real Edge/Chrome window. If Damai shows a captcha, complete it in that browser window, then press Enter in the terminal. The script then fetches the configured search pages from inside the browser context and writes a JSON file to `output/`.

You can also run without creating `config.json`:

```bash
node damai-search.mjs --city 上海 --pages 3 --pageSize 30
```

## Output

The exported JSON shape is:

```json
{
  "source": "damai-browser-assisted",
  "generatedAt": "2026-06-14T00:00:00.000Z",
  "query": {
    "city": "上海",
    "keyword": "",
    "pages": 3,
    "pageSize": 30,
    "order": 0
  },
  "count": 90,
  "items": [
    {
      "id": "damai-916569133122",
      "source": "damai",
      "sourceId": "916569133122",
      "sourceUrl": "https://detail.damai.cn/item.htm?id=916569133122",
      "title": "外滩2小时",
      "city": "上海",
      "venueName": "外滩",
      "showTime": "2026.06.14-06.30",
      "priceText": "299",
      "category": "",
      "imageUrl": "https://...",
      "showStatus": "",
      "description": ""
    }
  ]
}
```

