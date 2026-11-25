# Garage Sale · Locos por el Hardware

Catálogo web (no es e-commerce) para listar los productos de review/usados de Locos por el Hardware.
El visitante ve fotos, specs y precio, guarda favoritos y toca **"Me interesa"**: la web le arma un
mensaje listo y le abre el Instagram de Locos (o WhatsApp, si se configura) para coordinar la venta.

- **Stack:** Angular 21, 100 % estático (sin backend, sin base de datos).
- **Peso:** ~45 KB transferidos. Se puede hostear gratis en cualquier hosting estático.

## Panel de administración

En `<url-de-la-web>/#admin` hay un panel para **agregar, editar, eliminar y reordenar productos**, cambiar su estado
(disponible / reservado / vendido) y **subir fotos** (se achican a 1200 px y se convierten a WebP en el navegador).
Los cambios se acumulan y se suben todos juntos con **Publicar cambios**: el panel hace un único commit en el repo y
Cloudflare Pages republica la web sola en 1 o 2 minutos.

### Quién puede entrar

- Se entra con **"Ingresar con GitHub"** (link "Ingresar" en el footer, o directamente `/#admin`).
- Sin sesión, `/#admin` redirige a `/#login`. Después de ingresar vuelve solo al panel.
- **Son admins los colaboradores del repo con permiso de escritura.** Para sumar o quitar uno:
  repo → *Settings → Collaborators → Add people*. No hay otra lista que mantener.
- Una cuenta que no es colaboradora ve "Esta cuenta no es administradora" y no puede publicar: GitHub rechaza
  sus cambios aunque fuerce la entrada al panel.
- Los admins logueados ven un botón **Panel** arriba a la derecha de la web.
- La sesión dura ~6 meses por navegador (se renueva sola); *Salir* la cierra.

### Ingreso de administradores (configuración, una sola vez)

Son dos piezas gratuitas: una **GitHub App** (da el login y limita el acceso a este repo) y un **Cloudflare Worker**
(`worker/index.js`, guarda el secreto de la app, que no puede estar en la web pública).

**1. Crear la GitHub App** — https://github.com/settings/apps/new

| Campo | Valor |
|---|---|
| GitHub App name | `Garage Sale Locos` (cualquiera libre) |
| Homepage URL | `https://locosporelhardware.pages.dev/` |
| Redirect URI (antes "Callback URL") | `https://locosporelhardware.pages.dev/` y, con *Add redirect URI*, `http://localhost:4200/` para probar local. Sin *wildcard matching* |
| Expire user authorization tokens | ✔ (dejar marcado) |
| Request user authorization (OAuth) during installation | sin marcar |
| Webhook → Active | **desmarcar** |
| Repository permissions → Contents | **Read and write** (el resto sin acceso) |
| Where can this GitHub App be installed? | *Only on this account*. Si un colaborador no puede autorizar la app al ingresar, hacerla pública (*Advanced → Make public*): publicar sigue exigiendo permiso de escritura en el repo |

Después de crearla:
- Copiar el **Client ID**.
- *Generate a new client secret* y copiarlo (se muestra una sola vez).
- En el menú de la app, *Install App* → tu cuenta → *Only select repositories* → `locos_x_el_hard_sale`.

**2. Crear el Worker** — https://dash.cloudflare.com (cuenta gratis)

1. *Workers & Pages → Create → Create Worker* → nombre `garage-sale-auth` → *Deploy*.
2. *Edit code*: borrar todo, pegar el contenido de `worker/index.js` y *Deploy*.
3. *Settings → Variables and Secrets* → agregar:
   - `GITHUB_CLIENT_ID` (Text) = el Client ID
   - `GITHUB_CLIENT_SECRET` (**Secret**) = el client secret
   - `ALLOWED_ORIGINS` (Text) = `https://locosporelhardware.pages.dev,http://localhost:4200`
4. Copiar la URL del Worker (tipo `https://garage-sale-auth.<tu-subdominio>.workers.dev`).

**3. Conectar la web** — en `public/data/config.json`:

```json
"auth": {
  "clientId": "Iv23li…",
  "workerUrl": "https://garage-sale-auth.<tu-subdominio>.workers.dev"
}
```

Commit + push y listo. El Client ID y la URL del Worker son públicos a propósito; el único secreto está en Cloudflare.

### Contador de "Me interesa" (opcional)

El panel muestra cuántas veces tocaron **Me interesa** en cada producto. Es anónimo: solo se envía el id del
producto, una vez por producto, por navegador y por día. Lo guarda el mismo Worker en Cloudflare KV (gratis):

1. Cloudflare → *Storage & Databases → KV* → *Create* → nombre `garage-sale-interest`.
2. En el Worker → *Settings → Bindings → Add → KV namespace* → Variable name `INTEREST`, elegir ese namespace.
3. En el Worker → *Settings → Variables and Secrets* → agregar `GITHUB_REPO` (Text) = `luciogarcia97/locos_x_el_hard_sale`.
4. *Edit code* → pegar el `worker/index.js` actualizado → *Deploy*.

Los totales solo los puede ver un admin: el Worker le pregunta a GitHub si esa cuenta puede escribir en el repo.
Si el contador no está configurado, la web funciona igual y el panel simplemente no muestra la columna.

### Otros detalles

- **Link por producto**: cada producto tiene su dirección (`…/#p/<id>`) y un botón *Compartir*. Si se abre
  desde la web, el botón *atrás* del celular cierra el detalle.
- **Vendidos**: al marcar un producto como vendido, el panel guarda la fecha (`soldAt`) y la web lo oculta a los
  15 días. Se cambia con `hideSoldAfterDays` en `config.json`.
- **Vista previa al compartir** (WhatsApp, redes): `public/images/og.jpg`, 1200×630.

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

## Publicación (Cloudflare Pages)

La web vive en https://locosporelhardware.pages.dev/ y se republica sola con cada push a `main`.
Configuración, una sola vez: Cloudflare → *Workers & Pages → Create → Pages → Connect to Git* → este repo.

| Campo | Valor |
|---|---|
| Project name | `locosporelhardware` (define la URL) |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npx ng build` |
| Build output directory | `dist/garage-sale/browser` |
| Variable `NODE_VERSION` | `22` |

> El `<base href="./">` es relativo, así que el sitio funciona igual en cualquiera de estos hosts
> o en un subdirectorio, sin configurar nada.
