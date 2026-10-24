# JUGAYGANA en un dominio propio (Vercel)

Esta carpeta NO tiene una copia de la página: la página de JUGAYGANA vive en el servidor de PICA ROJA
(`public/js/lobby.js`, datos en `public/data/jugaygana-*.json`, imágenes en `public/images/jugaygana/`) porque usa el login,
el saldo, la Carga rápida, los retiros y la apertura de juegos del servidor. Vercel sólo muestra esa página con TU dominio:

- `/` (la raíz del dominio) abre la página de JUGAYGANA (`https://picaroja.com/?jg=1`).
- Todo lo demás (`/api/...`, `/js/...`, imágenes, Socket.IO) se pide a `https://picaroja.com` por detrás.

Cualquier cambio que se haga en el repo aparece solo en los dos dominios (no hay que volver a subir esta carpeta).

## Cómo subirla
1. En vercel.com → Add New → Project → importar el repo y elegir como "Root Directory" la carpeta `jugaygana-vercel`
   (o subir sólo esta carpeta con `vercel deploy`). Framework: "Other". Sin build.
2. Settings → Domains → agregar tu dominio y apuntar el DNS como indica Vercel.

## A tener en cuenta
- La cuenta es la MISMA que en picaroja.com, pero el teléfono guarda la sesión por dominio: en el dominio nuevo hay que entrar una vez.
- Las notificaciones y la app instalada quedan asociadas al dominio desde donde se instalen.
- El chat en vivo funciona, pero por Vercel puede tardar unos segundos más en actualizarse (Vercel no reenvía la conexión permanente
  y se usa la alternativa por consultas).
