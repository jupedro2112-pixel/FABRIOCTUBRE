# JUGAYGANA en un dominio propio (Vercel) — PRUEBA

Esta carpeta tiene sólo 2 archivos: esta explicación y `vercel.json`. No hay una copia de la página:
la página de JUGAYGANA vive en el servidor de PICA ROJA (login, saldo, Carga rápida, retiros y juegos).
Vercel sólo la muestra con OTRO dominio: todo lo que se pide al dominio de Vercel se reenvía al servidor.

- `/` (la raíz del dominio) abre la página de JUGAYGANA.
- Todo lo demás (`/api/...`, `/js/...`, imágenes, chat) se pide al servidor por detrás.
- Cualquier cambio que se haga en el servidor aparece solo en el dominio (no hay que volver a subir esta carpeta).

**Hoy apunta al servidor de PRUEBA (`fabrioctubre.onrender.com`)**, que es donde están las páginas de marca.
⚠️ Ese servidor usa la MISMA base de datos que producción: las cuentas, el saldo y las cargas son REALES.

---

## 1. Subirla a Vercel (5 minutos)

**Opción A — desde la web (con GitHub):**
1. Crear un repositorio nuevo en GitHub (puede ser privado) y subir estos 2 archivos (`vercel.json` y `README.md`).
2. Entrar a vercel.com → **Add New → Project** → importar ese repositorio.
3. Framework Preset: **Other**. Build Command: vacío. Output Directory: vacío. → **Deploy**.
4. Vercel te da un dominio del estilo `jugaygana-prueba.vercel.app`. Anotalo.

**Opción B — desde la computadora (sin GitHub):**
1. Tener Node instalado y correr `npm i -g vercel`.
2. Descomprimir el zip, entrar a la carpeta y correr `vercel --prod`.
3. Responder las preguntas (nombre del proyecto, sin build). Al final te da el dominio `….vercel.app`.

## 2. Avisarle al panel cuál es el dominio de JUGAYGANA

En el panel de PICA ROJA del servidor de prueba (`fabrioctubre.onrender.com/adminprivado2026`):
**Configuración → 🌐 Dominios de las marcas → JUGAYGANA** → pegar el dominio SIN `https://`
(ej. `jugaygana-prueba.vercel.app`) → **Guardar**.

El servidor lo toma en hasta 5 minutos. Desde ese momento:
- el servidor acepta pedidos que vienen de ese dominio;
- en ese dominio **no hay registro ni inicio de sesión**: sólo se entra desde la app de PICA ROJA;
- en ese dominio **no se puede cerrar sesión** y la sesión se renueva sola (30 días desde la última visita).

## 3. Probarlo

1. Abrir la app de PICA ROJA (la del servidor de prueba) con una cuenta.
2. Elegir **JUGAYGANA** (en el selector de plataforma o en el botón de arriba).
   La app genera un pase de un solo uso y te lleva al dominio de Vercel **ya logueado**, sin escribir clave.
3. Abrir el dominio de Vercel directo, en otro navegador o en una ventana privada: tiene que aparecer
   el cartel **"Entrá desde la app de PICA ROJA"**, sin formulario de login ni de registro.

Si algo no anda, revisar primero que el dominio esté bien escrito en el paso 2 y que hayan pasado los 5 minutos.

## 4. Ponerle un dominio propio (cuando lo tengas)

1. Vercel → el proyecto → **Settings → Domains** → agregar el dominio (ej. `jugaygana.net`) y configurar el DNS como indica Vercel.
2. En el panel (paso 2) cambiar el dominio de JUGAYGANA por el nuevo.

## 5. Pasarlo a producción (más adelante)

Cuando producción (`picaroja.com`) tenga las páginas de marca, cambiar en `vercel.json` las dos apariciones de
`fabrioctubre.onrender.com` por `picaroja.com`, volver a subir y cargar el dominio en el panel de producción.

## A tener en cuenta

- Es la MISMA cuenta de 1girox que en PICA ROJA: mismo usuario, saldo, cargas y retiros.
- El chat funciona, pero por Vercel puede tardar unos segundos más (Vercel no reenvía la conexión permanente
  y se usa la alternativa por consultas).
- Para probar está perfecto. Para producción con mucha gente conviene apuntar el dominio DIRECTO al servidor
  (sin Vercel en el medio): por Vercel todos los clientes llegan con la misma IP y los límites por IP del servidor
  podrían frenar a varios a la vez.
- No hay claves ni datos de clientes en estos archivos.
