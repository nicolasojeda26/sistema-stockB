# Sistema de stock y ventas

Sistema de stock y ventas multisucursal y multidepósito, con factura electrónica de ARCA. Lo hace Litoral Dev para Belen.

**Stack:** Next.js 16 (App Router, Server Actions), Postgres en Supabase y deploy en Vercel. El acceso es con usuario y contraseña propios (sin email). Las sesiones van en una cookie firmada y los permisos se controlan en el servidor.

## Avance

| Etapa | Estado |
| --- | --- |
| 1. Base y productos: sucursales, depósitos, usuarios, categorías, productos e importación desde Dux | Lista |
| 2. Stock: ingreso de mercadería, transferencias, ajustes, movimientos, precios masivos y etiquetas | Lista |
| 3. Caja y ventas: venta, cobro con varias formas de pago, caja diaria, tickets | Lista |
| 4. Facturación ARCA y reportes | Lista (falta cargar los datos fiscales y el certificado reales) |
| 5. Pruebas en sucursal y capacitación | Pendiente |

## Puesta en marcha

1. **Base:** creá un proyecto en Supabase y copiá la cadena de conexión en modo *Session pooler* (puerto 5432; el modo transacción, 6543, cuelga consultas con este driver y el sistema lo cambia solo).
2. **Variables:** copiá `.env.example` a `.env.local` y completá `DATABASE_URL`, `SESSION_SECRET` y `CLAVE_CIFRADO`.
3. **Instalar y crear las tablas:**
   ```bash
   npm install
   npm run db:migrate
   npm run crear-admin -- belen "Belen" unaContraseñaSegura
   npm run dev
   ```
4. **Vercel:** importá el repo (la región São Paulo `gru1` ya viene en `vercel.json`). Dos formas de darle la base:
   - **Integración de Supabase** (Vercel → Integrations → Supabase, vinculando el proyecto): deja `POSTGRES_URL` y el sistema la usa sola. Si no cargás `SESSION_SECRET` / `CLAVE_CIFRADO`, el sistema genera claves al azar la primera vez y las guarda en la tabla `secretos`. Sirve para pruebas; para producción conviene cargarlas como variables (así la clave que cifra el certificado de ARCA no vive en la misma base).
   - **A mano:** cargá `DATABASE_URL`, `SESSION_SECRET` y `CLAVE_CIFRADO` en *Environment Variables*. Cada vez que haya una migración nueva, corré `npm run db:migrate` contra la base de producción.

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

## Mercadería (etapa 2)

- **Ingreso:** cada lectura del escáner suma una unidad. Si el código no existe, el producto se da de alta ahí mismo; para los que no traen código hay un botón **Generar**, que crea un EAN-13 interno que empieza con 20. La lista se guarda en el navegador por si se recarga la página. Al confirmar, se pueden imprimir las etiquetas de lo que entró.
- **Transferencia:** sale de un depósito y entra en otro en la misma operación. Si se manda más de lo que figura, avisa, pero deja hacerlo: el stock de origen queda en negativo.
- **Ajuste (solo administradoras):**
  - *Recuento:* se carga lo contado y el sistema registra la diferencia.
  - *Rotura* y *Pérdida o robo:* descuentan unidades.
  - *Otro:* suma o resta la cantidad que se cargue.
- **Permisos:** la vendedora carga mercadería en los depósitos de su sucursal y transfiere desde ellos. En Movimientos ve solo lo que toca a su sucursal.
- **Actualizar precios:** aplica un porcentaje a una categoría o a todo, con redondeo hacia arriba y vista previa antes de confirmar. Un trigger guarda cada cambio de precio en `cambios_precio`, con quién lo hizo y desde dónde (edición, importación o actualización masiva).
- **Etiquetas:** imprime en hoja A4 (3 × 8) o en impresora de etiquetas de 50 × 25 mm. Usa EAN-13 si el código es válido y CODE128 en los demás casos.

## Caja y ventas (etapa 3)

- **Caja:** cada usuario abre su caja con el efectivo inicial; las administradoras eligen en qué sucursal. Mientras está abierta se pueden registrar ingresos y retiros de efectivo, con su motivo. Al cerrarla se carga lo contado y queda guardado lo que tenía que haber y la diferencia. El resumen se puede imprimir.
- **Vender:**
  - Cada lectura del escáner suma una unidad; también se puede buscar por nombre.
  - Se pueden cambiar cantidades y hacer descuentos por producto o generales. Cada vendedora tiene un tope de descuento (en Usuarios); las administradoras, no.
  - El carrito se guarda en el navegador y se vacía apenas se registra la venta, así una recarga no la cobra dos veces.
- **Cobrar (F2):**
  - Medios: efectivo, transferencia, débito y crédito (con cuotas). Se pueden combinar.
  - En efectivo sugiere billetes y calcula el vuelto.
  - El servidor recalcula todo con los precios actuales: si alguno cambió, avisa antes de cobrar.
  - La venta descuenta stock del depósito principal de la sucursal. Puede quedar en negativo: la prenda está en la mano.
- **Ticket:** en `/ticket/[id]`, para impresora térmica de 58 u 80 mm. Lleva el nombre del negocio y el pie que se cargan en Ajustes del negocio. También se puede mandar el detalle por WhatsApp. No es una factura: eso llega en la etapa 4.
- **Ventas:** listado por fechas, sucursal, vendedora y medio, con total y ticket promedio. Las administradoras pueden anular una venta: se devuelve el stock y deja de sumar en la caja.

## Facturación electrónica y reportes (etapa 4)

**Facturación ARCA (`/facturacion`):**

1. Cargar los datos fiscales: CUIT, razón social, condición frente al IVA, domicilio, IIBB e inicio de actividades.
2. Cargar un punto de venta por sucursal. Se crea en ARCA del tipo *Factura electrónica – Web Services*.
3. Certificado:
   - El sistema genera la clave privada (queda cifrada en la base con `CLAVE_CIFRADO`) y el pedido `.csr`.
   - El `.csr` se sube a ARCA: en *WSASS* para homologación, o en *Administración de Certificados Digitales* para producción, con la relación al servicio de facturación electrónica.
   - El `.crt` que devuelve ARCA se carga en la misma pantalla.
   - Con «Probar conexión» se verifica todo.
4. Elegir el modo de facturación:

| Modo | Qué hace |
| --- | --- |
| Desactivada | Solo emite tickets |
| Simulación | Emite comprobantes de práctica sin ARCA, con la leyenda «sin validez» |
| Homologación | Factura contra el ARCA de pruebas |
| Producción | Factura en serio |

Además, se puede activar **facturar cada venta automáticamente** a consumidor final.

**Cómo se arman los comprobantes:**
- **Tipo:** A, B o C según la condición del emisor y del cliente: el monotributista y el exento emiten C; el inscripto emite A a otro inscripto y B al resto.
- **IVA:** en A y B se informa el 21 % sobre los precios con IVA incluido. La B muestra el *IVA contenido* (Ley 27.743).
- **Condición del cliente:** se informa siempre `CondicionIVAReceptorId`, que ARCA exige desde el 1/12/2026.
- **Identificar al consumidor final:** desde $10.000.000 (RG 5700/2025, configurable) hay que pedir DNI o CUIT.
- **Comprobante:** se imprime en `/comprobante/[id]`, en formato térmico o A4, con QR (RG 4892) y CAE.

**Notas de crédito:** al **anular** una venta facturada se emite la nota de crédito por el total; si ARCA no la autoriza, la venta no se anula. Las **devoluciones** parciales devuelven stock y plata desde la caja de quien la hace, y emiten la nota de crédito por lo devuelto. Si ARCA falla, la devolución queda hecha y la nota se reintenta desde la venta.

**Técnica:**
- La numeración usa un bloqueo por punto de venta y tipo, y siempre pide el último número a ARCA (`FECompUltimoAutorizado`).
- El token del WSAA se guarda unas 12 horas en `arca_credenciales`.
- Los rechazos quedan registrados con el mensaje de ARCA.
- Los servidores de ARCA usan claves viejas: las conexiones bajan el nivel de seguridad de OpenSSL solo para ellos.
- Los tests usan un servidor que imita a ARCA (`tests/arca.test.ts`). Contra la homologación real se comprobó que el servidor responde (`FEDummy`) y que el WSAA lee la firma CMS.

**Comprobantes (`/comprobantes`):** listado por fechas y punto de venta, con totales de neto, IVA y total (las notas de crédito restan) y un Excel para el contador.

**Reportes (`/reportes`):**
- Lo vendido neto de devoluciones, en cantidad de ventas y ticket promedio.
- Ventas por día, sucursal, vendedora y medio de pago.
- Productos más vendidos y productos con stock sin ventas en 60 días.
- Valor del stock a costo y a precio de venta.
- Todo se baja en un Excel con una hoja por tema.

## Detalles generales

- **Búsqueda:** por varias palabras en cualquier orden y sin importar acentos ni mayúsculas («remera negra», «panuelo»). Usa índices `pg_trgm` y la función `normalizar` de la base.
- **Inicio:**
  - Para la administradora: lo vendido hoy por sucursal, los productos para reponer (en el mínimo o debajo, por sucursal) y las cajas abiertas, con aviso si alguna quedó abierta de un día anterior.
  - Para la vendedora: lo de su sucursal y su caja.
- **Cajas olvidadas:** la administradora puede cerrar la caja de otra persona desde su detalle, y queda registrado quién la cerró.
- **Seguridad:** después de 5 intentos fallidos, ese usuario queda bloqueado 15 minutos. Si una administradora le cambia la contraseña, se desbloquea.
- **Marca:** el nombre del negocio (Ajustes del negocio) aparece en el menú, en el login y en los tickets.
- **Excel de productos:** con el stock de cada depósito, respetando los filtros del listado.
- **Instalar como app:** el sistema se puede instalar en la PC o la tablet de la caja (tiene manifest e íconos).
- **Pantallas especiales:** de carga, de error y de página no encontrada, en español.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm test` | Pruebas. Con `TEST_DATABASE_URL` también corre las de base de datos (borran y recrean el esquema de esa base, ¡usar una de prueba!) |
| `npm run lint` / `npm run typecheck` | Revisión de código y de tipos |
| `npm run db:migrate` | Aplica las migraciones pendientes de `db/migrations` |
| `npm run crear-admin -- usuario "Nombre" clave` | Crea o resetea una administradora |
