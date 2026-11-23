# Garage Sale · Locos por el Hardware

Catálogo web (no es e-commerce) para listar los productos de review/usados de Locos por el Hardware.
El visitante ve fotos, specs y precio, guarda favoritos y toca **"Me interesa"**: la web le arma un
mensaje listo y le abre el Instagram de Locos (o WhatsApp, si se configura) para coordinar la venta.

- **Stack:** Angular 21, 100 % estático (sin backend, sin base de datos).
- **Peso:** ~45 KB transferidos. Se puede hostear gratis en cualquier hosting estático.

## Panel de administración

Entrando a `<url-de-la-web>/#admin` se abre un panel para **agregar, editar, eliminar y reordenar productos**,
cambiar su estado (disponible / reservado / vendido) y **subir fotos** (se achican a 1200 px y se convierten a WebP
en el navegador). Los cambios se acumulan y se suben todos juntos con **Publicar cambios**: el panel hace un único
commit en el repo y GitHub Pages republica la web sola en 1 o 2 minutos.

No hay backend: el panel habla directo con la API de GitHub. Para conectarlo hace falta, una sola vez:

1. Crear una clave en https://github.com/settings/personal-access-tokens/new (*fine-grained token*).
2. *Repository access* → *Only select repositories* → elegir el repo de la web.
3. *Permissions* → *Repository permissions* → *Contents*: **Read and write**. Nada más.
4. Abrir `/#admin`, completar usuario, repo y rama, y pegar la clave.

La clave queda guardada en ese navegador (usarlo solo en una compu propia; *Desconectar* la borra). Si vence o se
filtra, se revoca desde la misma página de GitHub y se genera otra. Para que el formulario venga pre-completado,
cargá `github.owner` / `github.repo` / `github.branch` en `public/data/config.json`.

Si el catálogo se modifica desde otro lado (otro navegador o la web de GitHub) mientras editás, el panel no pisa
esos cambios: avisa y pide recargar.

## Cómo editar los productos (sin tocar código)

Todo vive en dos archivos JSON:

| Archivo | Qué tiene |
|---|---|
| `public/data/products.json` | La lista de productos |
| `public/data/config.json` | Usuario de Instagram/TikTok/Facebook, WhatsApp, zona, envíos, texto del mensaje |

Ejemplo de producto:

```json
{
  "id": "rk-r99-halo",
  "name": "Teclado Royal Kludge RK R99 Halo Inalámbrico",
  "brand": "Royal Kludge",
  "category": "Teclados",
  "origin": "Nuevo de review",
  "condition": "Completo, como nuevo",
  "price": 130000,
  "status": "disponible",
  "images": ["images/products/rk-r99-1.webp", "images/products/rk-r99-2.webp"],
  "highlights": ["Inalámbrico", "Formato 96%"],
  "specs": [{ "label": "Conexión", "value": "2.4 GHz / Bluetooth / USB-C" }],
  "description": "Texto libre.",
  "reviewUrl": "https://youtube.com/..."
}
```

- `status`: `disponible`, `reservado` o `vendido` (los vendidos quedan grisados y van al final).
- `category`: texto libre; las pestañas de filtro se generan solas (Teclados, Auriculares, Mouses…).
- `images`: subí las fotos a `public/images/products/` (ideal `.webp` o `.jpg`, ~1200 px de ancho).
  Sin fotos se muestra un placeholder.
- `whatsapp` en `config.json`: número en formato internacional sin `+` (ej. `5491112345678`). Vacío = se oculta el botón.

Una vez publicado en GitHub, se puede editar el JSON **desde la web de GitHub** (ícono del lápiz) y
la página se actualiza sola en ~1 minuto.

## Correr localmente

```bash
npm install
npm start        # http://localhost:4200
npm run build    # genera dist/garage-sale/browser
```

## Publicar gratis

### Opción A — GitHub Pages (recomendada: gratis, y cada cambio se publica solo)

1. Crear una cuenta en github.com y un repositorio nuevo (público), ej. `garage-sale`.
2. Subir este proyecto:
   ```bash
   git init
   git add .
   git commit -m "Garage sale inicial"
   git branch -M main
   git remote add origin https://github.com/<usuario>/garage-sale.git
   git push -u origin main
   ```
3. En el repo: **Settings → Pages → Source: GitHub Actions**.
4. El workflow `.github/workflows/deploy.yml` construye y publica. La URL queda tipo
   `https://<usuario>.github.io/garage-sale/`.

### Opción B — Netlify Drop (sin Git, en 1 minuto)

1. `npm run build`
2. Entrar a https://app.netlify.com/drop y arrastrar la carpeta `dist/garage-sale/browser`.
3. Te da una URL `https://<nombre>.netlify.app`. Para actualizar, volvés a arrastrar la carpeta.

### Opción C — Cloudflare Pages / Vercel

Conectar el repo de GitHub. Build command: `npx ng build` · Output: `dist/garage-sale/browser`.

> El `<base href="./">` es relativo, así que el sitio funciona igual en cualquiera de estos hosts
> o en un subdirectorio, sin configurar nada.
