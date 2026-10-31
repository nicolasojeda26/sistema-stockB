# Sistema de stock y ventas

Sistema de stock y ventas multisucursal y multidepósito, con factura electrónica de ARCA. Lo hace Litoral Dev para Belen.

**Stack:** Next.js 16 (App Router, Server Actions), Postgres en Supabase y deploy en Vercel. El acceso es con usuario y contraseña propios (sin email). Las sesiones van en una cookie firmada y los permisos se controlan en el servidor.

## Avance

| Etapa | Estado |
| --- | --- |
| 1. Base y productos: sucursales, depósitos, usuarios, categorías, productos e importación desde Dux | Lista |
| 2. Stock: ingreso de mercadería, transferencias, ajustes | Pendiente |
| 3. Caja y ventas: venta, cobro con varias formas de pago, caja diaria, tickets | Pendiente |
| 4. Facturación ARCA y reportes | Pendiente |
| 5. Pruebas en sucursal y capacitación | Pendiente |

## Puesta en marcha

1. **Base:** creá un proyecto en Supabase y copiá la cadena de conexión en modo *Transaction pooler* (puerto 6543).
2. **Variables:** copiá `.env.example` a `.env.local` y completá `DATABASE_URL` y `SESSION_SECRET`.
3. **Instalar y crear las tablas:**
   ```bash
   npm install
   npm run db:migrate
   npm run crear-admin -- belen "Belen" unaContraseñaSegura
   npm run dev
   ```
4. **Vercel:** importá el repo y cargá `DATABASE_URL` y `SESSION_SECRET` en *Environment Variables*. Cada vez que haya una migración nueva, corré `npm run db:migrate` contra la base de producción.

Para probar con datos de ejemplo en una base vacía: `npm run db:demo`. Crea dos sucursales, 12 productos y los usuarios `belen`, `sofia` y `camila`, todos con la contraseña `demo1234`.

## Roles

- **Administradora:** ve todas las sucursales y maneja sucursales, depósitos, usuarios, categorías, productos, precios e importación.
- **Vendedora:** trabaja en su sucursal. En la etapa 1 consulta productos, precios y stock (de su sucursal y del resto). Desde la etapa 2 también carga mercadería, y desde la 3 vende y cobra.

## Importación desde Dux

En **Importar desde Dux** se sube el Excel (`.xlsx` o `.xls`) o un CSV.

- **Columnas:** el sistema detecta solo la fila de títulos y las columnas (código de barras, código interno, descripción, rubro, costo, precio de venta y stock). Se pueden corregir a mano antes de confirmar.
- **Códigos:** si un producto no tiene código de barras, se usa el código interno.
- **Productos existentes:** los que ya están (mismo código, sin importar mayúsculas) se actualizan. Si el costo o el precio vienen vacíos, no se pisan los anteriores.
- **Stock:** queda igual al de la planilla en el depósito elegido. La diferencia se registra como movimiento de *carga inicial*.
- **Velocidad:** se importa en lotes de 400 filas. 1.200 productos tardan menos de un segundo con la base local.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm test` | Pruebas. Con `TEST_DATABASE_URL` también corre las de base de datos (borran y recrean el esquema de esa base, ¡usar una de prueba!) |
| `npm run lint` / `npm run typecheck` | Revisión de código y de tipos |
| `npm run db:migrate` | Aplica las migraciones pendientes de `db/migrations` |
| `npm run crear-admin -- usuario "Nombre" clave` | Crea o resetea una administradora |
