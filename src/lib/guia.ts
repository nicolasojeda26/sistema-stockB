/**
 * Contenido de la guía del sistema. Se usa en dos lugares:
 * - la ayuda corta de cada pantalla (barra "Cómo se usa esta pantalla"), que busca la sección por la ruta;
 * - la página /guia, con todo el manual, casos de uso, preguntas frecuentes y glosario.
 * Sin dependencias de servidor: lo importan componentes de cliente.
 */
import type { Permiso } from './permisos'

/** Quién usa la sección: alguno de estos permisos. Sin lista = todo el personal. */
export type Acceso = Permiso[]

export type SeccionGuia = {
  id: string
  grupo: string
  titulo: string
  /** Rutas donde aparece la ayuda. `*` es un tramo cualquiera (un número de venta, por ejemplo). */
  rutas: string[]
  acceso?: Acceso
  /** Quién la usa, en palabras. */
  quien: string
  resumen: string
  pasos?: string[]
  consejos?: string[]
  /** "Si pasa esto → hacé esto". */
  problemas?: [string, string][]
  /** Otras secciones relacionadas (ids). */
  ver?: string[]
}

export const GRUPOS = ['Empezar', 'Ventas y caja', 'Área técnica', 'Mercadería', 'Compras y gastos', 'Administración', 'Configuración'] as const

export const SECCIONES: SeccionGuia[] = [
  // ── Empezar ─────────────────────────────────────────────────────────────
  {
    id: 'primer-ingreso',
    grupo: 'Empezar',
    titulo: 'Entrar por primera vez',
    rutas: ['/activar', '/login'],
    quien: 'Todo el personal.',
    resumen:
      'Cada persona entra con su usuario y su contraseña. La primera vez (o si se olvidó la contraseña) entra con el código de acceso que le da Administración y crea su propia contraseña.',
    pasos: [
      'Pedile a Administración tu usuario y tu código de acceso (8 letras y números, por ejemplo K7QM-3XPA). Vence en 7 días.',
      'En la pantalla de entrada tocá «Entrá con tu código de acceso».',
      'Escribí tu usuario, el código y tu contraseña nueva dos veces (al menos 6 caracteres).',
      'Listo: desde ahora entrás con usuario y contraseña.',
    ],
    consejos: [
      'La contraseña es personal: todo lo que hacés queda registrado con tu nombre.',
      'Si usás una PC compartida, tocá «Salir» (abajo del menú) al terminar el turno.',
    ],
    problemas: [
      ['Me olvidé la contraseña', 'Pedile a Administración un código de acceso nuevo desde «Personal y permisos» y creá otra.'],
      ['Dice que el código venció o no sirve', 'Los códigos vencen a los 7 días. Pedí uno nuevo.'],
    ],
  },
  {
    id: 'inicio',
    grupo: 'Empezar',
    titulo: 'Inicio',
    rutas: ['/'],
    quien: 'Todo el personal.',
    resumen:
      'El resumen del día: lo vendido hoy, tu caja, los envíos que te llegan, los productos que quedaron en el mínimo y los avisos pendientes.',
    pasos: [
      'Mirá los avisos de arriba: envíos por recibir, cajas abiertas de días anteriores, pedidos sin atender.',
      'Tocá cualquier tarjeta para ir directo a resolverlo.',
      'En el menú, los números en verde son cosas que esperan algo de vos (reparaciones listas, envíos, entregas).',
    ],
    consejos: ['Arrancá el día acá: en un vistazo sabés qué hay que hacer antes de abrir la caja.'],
  },
  {
    id: 'menu',
    grupo: 'Empezar',
    titulo: 'El menú y los avisos',
    rutas: [],
    quien: 'Todo el personal.',
    resumen:
      'Cada persona ve solo lo que su rol le permite. Si falta una opción que necesitás, no es un error: pedile a Administración que te dé ese permiso.',
    pasos: [
      'En la computadora el menú está a la izquierda; en el celular, abajo (tocá «Más» para ver todo).',
      'Los números al lado de una opción son pendientes: reparaciones para entregar, envíos por recibir, entregas entre sucursales.',
      'Abajo del menú está tu nombre, tu rol y tu sucursal, el botón «Salir» y el selector de tema (claro u oscuro).',
    ],
    consejos: ['En cada pantalla, la barra «Cómo se usa esta pantalla» explica lo básico. Se puede abrir y cerrar cuando quieras.'],
  },

  // ── Ventas y caja ───────────────────────────────────────────────────────
  {
    id: 'vender',
    grupo: 'Ventas y caja',
    titulo: 'Vender',
    rutas: ['/vender'],
    acceso: ['vender'],
    quien: 'Vendedores y quien tenga el permiso «Vender y manejar la caja».',
    resumen:
      'El punto de venta: escaneás o buscás productos, elegís cómo paga el cliente (lista, transferencia o efectivo), cobrás y se imprime el ticket. También cobra reparaciones y hace cambios de producto.',
    pasos: [
      'Si es la primera venta del día, abrí la caja con el efectivo que hay para dar cambio.',
      'Escaneá el código de barras o escribí el nombre y elegí el producto. Cada lectura suma una unidad.',
      'Arriba del total elegí el precio según cómo paga: Lista (tarjeta), Transferencia o Efectivo.',
      'Si corresponde, poné un descuento en la línea o un descuento general (hasta el tope de tu rol).',
      'Tocá «Cobrar» o apretá F2. Elegí el medio de pago (con «+ Pagar con dos medios» se combinan) y confirmá.',
      'Al terminar, tocá «Ticket» para imprimirlo, «Facturar» si corresponde, o mandáselo por WhatsApp con su celular. Para regalo, desde la venta (en Ventas) se imprime el ticket de cambio, sin precios.',
    ],
    consejos: [
      'F2 abre el cobro desde cualquier lugar de la pantalla; Esc cierra la ventana de cobro.',
      'El precio en efectivo solo vale si todo se paga en efectivo; el de transferencia, si se paga con transferencia o efectivo. Si mezcla con tarjeta, va a precio de lista.',
      'Si un producto no hay en tu local, la búsqueda te muestra en qué otra sucursal hay. Podés venderlo igual: elegí de dónde sale y si te lo mandan o el cliente lo retira allá.',
      'Para vender a cuenta (fiado) o usar saldo a favor, primero elegí el cliente.',
      '«Apartar: la retira después» sirve para señas: cobrás la seña y el resto queda «A cuenta» del cliente.',
    ],
    problemas: [
      ['El código no aparece', 'Probá buscar por nombre. Si el producto no existe, pedí que lo carguen en Productos; si no tiene código, imprimile una etiqueta.'],
      ['No me deja poner ese descuento', 'Superaste el tope de tu rol. Pedí autorización a quien tenga «Descuentos sin tope» o a Administración.'],
      ['Me pide abrir la caja', 'Poné el efectivo inicial y abrila. Si te quedó abierta la de otro día, cerrala en Caja.'],
      ['Quedó en 0 el stock y el producto está', 'Vendé igual: el sistema lo permite y queda negativo. Avisá para que hagan un ajuste o un ingreso.'],
    ],
    ver: ['caja', 'cambios', 'cobrar-reparacion', 'venta-otra-sucursal'],
  },
  {
    id: 'cambios',
    grupo: 'Ventas y caja',
    titulo: 'Cambio de producto',
    rutas: [],
    acceso: ['vender'],
    quien: 'Vendedores.',
    resumen:
      'Cuando el cliente trae algo para cambiarlo por otra cosa. El sistema toma lo devuelto como parte de pago y calcula la diferencia.',
    pasos: [
      'En Vender tocá «Cambio de producto».',
      'Escaneá el ticket de cambio o escribí el número de venta.',
      'Marcá qué trae y cuántas unidades, y tocá «Usar en el cambio».',
      'Escaneá lo que se lleva. Si sale más caro, cobrá la diferencia; si sale más barato, elegís devolverle efectivo o dejarlo a favor (si hay cliente cargado).',
    ],
    consejos: ['Lo devuelto vuelve al stock de tu local automáticamente.'],
    ver: ['vender', 'devoluciones'],
  },
  {
    id: 'venta-otra-sucursal',
    grupo: 'Ventas y caja',
    titulo: 'Vender un producto de otra sucursal',
    rutas: [],
    acceso: ['vender'],
    quien: 'Vendedores.',
    resumen:
      'Si en tu local no hay, podés vender el stock de otra sucursal. La venta y la plata quedan en tu caja; el stock se descuenta de la sucursal de origen.',
    pasos: [
      'Buscá el producto en Vender. Debajo del nombre aparece en qué otras sucursales hay y cuántos.',
      'Agregalo y, en la línea, elegí la sucursal de origen.',
      'Elegí la entrega: «Lo mandan acá» (te lo envían a tu local) o «Retira allá» (el cliente lo busca en esa sucursal).',
      'Cobrá normalmente. La otra sucursal lo ve en «Entregas de ventas».',
    ],
    consejos: ['Llamá o escribile a la otra sucursal para avisarle, sobre todo si el cliente va a retirar en el momento.'],
    ver: ['entregas'],
  },
  {
    id: 'caja',
    grupo: 'Ventas y caja',
    titulo: 'Caja',
    rutas: ['/caja', '/caja/*'],
    acceso: ['vender'],
    quien: 'Vendedores (su caja). Administración ve todas.',
    resumen:
      'Cada persona abre su caja al empezar y la cierra al terminar. La caja suma el efectivo de las ventas y resta devoluciones, gastos y retiros, para que al cerrar sepas cuánto tiene que haber.',
    pasos: [
      'Abrir: en Vender, poné el efectivo inicial (lo que hay para dar cambio).',
      'Durante el día: si sacás o ponés plata que no es una venta, cargalo como «Ingreso o retiro de efectivo».',
      'Cerrar: contá los billetes, escribí el «Efectivo contado» y tocá «Cerrar caja».',
      'El sistema muestra si cerró justo, sobró o faltó.',
    ],
    consejos: [
      'Una caja cerrada no se reabre: cerrala solo cuando terminaste de vender.',
      'Los pagos con tarjeta y transferencia figuran en el resumen pero no en el efectivo que tiene que haber.',
    ],
    problemas: [
      ['Me quedó abierta la caja de ayer', 'Entrá a Caja, abrí la de ayer y cerrala con lo que contaste. Después abrí la de hoy.'],
      ['Me falta plata al cerrar', 'Revisá en el detalle de la caja si hubo una devolución en efectivo, un gasto o un retiro sin cargar.'],
    ],
    ver: ['gastos'],
  },
  {
    id: 'ventas',
    grupo: 'Ventas y caja',
    titulo: 'Ventas, devoluciones y anulaciones',
    rutas: ['/ventas', '/ventas/*'],
    acceso: ['vender', 'anular_ventas'],
    quien: 'Vendedores (las de su sucursal). Supervisión: corregir o anular por número de venta.',
    resumen:
      'El listado de ventas. En cada venta podés reimprimir el ticket, facturarla, registrar una devolución, marcar como retirada una venta apartada o anularla.',
    pasos: [
      'Buscá la venta por número (está en el ticket) o por fecha.',
      'Abrila para ver el detalle, los pagos y los comprobantes. Desde ahí reimprimís el ticket o el ticket de cambio.',
      'Devolución: «Devolver», elegí qué se devuelve y si la plata sale de tu caja o queda a favor del cliente.',
      'Anular (con permiso): anula la venta completa, devuelve el stock y descuenta la plata de la caja.',
    ],
    consejos: [
      'Si la venta estaba facturada, la devolución emite la nota de crédito. Si ARCA no respondió, aparece «Falta la nota de crédito · Emitir ahora».',
      'Una venta de otra sucursal anulada devuelve el stock al depósito de donde salió.',
    ],
    ver: ['cambios', 'facturacion'],
  },
  {
    id: 'devoluciones',
    grupo: 'Ventas y caja',
    titulo: 'Devolución de dinero',
    rutas: [],
    acceso: ['vender'],
    quien: 'Vendedores.',
    resumen: 'Cuando el cliente devuelve algo y no se lleva otra cosa. Si se lleva otra cosa, usá «Cambio de producto».',
    pasos: [
      'Abrí la venta en Ventas (número del ticket).',
      'Tocá «Devolver» y marcá los productos y cantidades.',
      'Elegí: la plata sale de tu caja, o queda como saldo a favor del cliente.',
    ],
    ver: ['ventas', 'cambios'],
  },
  {
    id: 'presupuestos',
    grupo: 'Ventas y caja',
    titulo: 'Presupuestos',
    rutas: ['/presupuestos', '/presupuestos/nuevo', '/presupuestos/*'],
    acceso: ['vender'],
    quien: 'Vendedores.',
    resumen: 'Una propuesta de precios para el cliente, con vigencia. Guardarla no toca el stock ni la caja.',
    pasos: [
      'Tocá «Nuevo presupuesto», elegí el cliente (o dejalo general) y agregá los productos.',
      'Poné descuentos, observaciones y hasta cuándo vale.',
      'Guardalo e imprimilo para dárselo al cliente.',
    ],
  },
  {
    id: 'clientes',
    grupo: 'Ventas y caja',
    titulo: 'Clientes y cuenta corriente',
    rutas: ['/clientes', '/clientes/nueva', '/clientes/*'],
    acceso: ['clientes'],
    quien: 'Quien tenga el permiso «Clientes y cuenta corriente».',
    resumen:
      'La ficha de cada cliente con sus compras y su cuenta corriente: lo que debe y lo que tiene a favor. Hace falta para vender a cuenta, dejar señas y facturar con datos.',
    pasos: [
      'Nuevo cliente: con el nombre alcanza; DNI o CUIT hace falta para facturarle a su nombre.',
      'En la ficha ves su saldo, sus compras y sus pagos.',
      'Cobrar una deuda o dejar una seña: «Suma a su favor». Cargarle algo: «Suma a lo que debe».',
      'Límite de cuenta corriente: hasta cuánto puede quedar debiendo (lo pone quien tenga «Límites de crédito y saldos»).',
    ],
    ver: ['vender'],
  },

  // ── Área técnica ────────────────────────────────────────────────────────
  {
    id: 'reparaciones',
    grupo: 'Área técnica',
    titulo: 'Reparaciones: el día a día',
    rutas: ['/reparaciones'],
    acceso: ['reparaciones'],
    quien: 'Vendedores y personal del área técnica de cada local.',
    resumen:
      'Todos los equipos recibidos para reparar, con su estado, técnico y presupuesto. Cada local repara lo suyo. El número del menú son los equipos listos o sin reparar que esperan que el cliente los retire.',
    pasos: [
      'Para recibir un equipo tocá «Recibir un equipo».',
      'Filtrá por estado o buscá por número, cliente, teléfono, equipo o IMEI.',
      'Abrí la reparación para informar estados, marcarla lista, avisar por WhatsApp o imprimir comprobantes.',
    ],
    consejos: [
      'Debajo de la fecha aparece «hace N días» en los que llevan 3 días o más sin terminar: revisalos.',
      '«Reporte» y «Configuración» (estados, precios, técnicos y cláusulas) están arriba.',
    ],
    ver: ['recibir-equipo', 'ficha-reparacion', 'cobrar-reparacion'],
  },
  {
    id: 'recibir-equipo',
    grupo: 'Área técnica',
    titulo: 'Recibir un equipo',
    rutas: ['/reparaciones/nueva'],
    acceso: ['reparaciones'],
    quien: 'Vendedores y personal del área técnica.',
    resumen:
      'Se cargan los datos del cliente y del equipo, la falla y cómo se recibe. Al guardar se imprime el comprobante de ingreso: hoja 1 con el detalle y hoja 2 con las cláusulas, original para el cliente y copia para el local.',
    pasos: [
      'Nombre, DNI y teléfono del cliente (el teléfono es para avisarle por WhatsApp).',
      'Marca y modelo, IMEI si se puede, tipo de reparación y qué le pasa.',
      '«Cómo se recibe»: rayas, golpes, si trae funda, chip o memoria. Queda en el comprobante y te cubre ante reclamos.',
      'Si el modelo y el tipo de reparación están en la lista de precios, el presupuesto se completa solo. Se puede cambiar a mano.',
      'Guardá: se abre la impresión. Hacé firmar las dos hojas al cliente y guardá la copia del local.',
    ],
    consejos: [
      'Si es un reingreso por garantía, entrá desde la reparación anterior con «Reingreso por garantía»: se copian los datos y queda vinculado.',
      'Dale al cliente el enlace de seguimiento (o mandáselo por WhatsApp) para que vea el estado sin llamar.',
    ],
    ver: ['ficha-reparacion', 'config-taller'],
  },
  {
    id: 'ficha-reparacion',
    grupo: 'Área técnica',
    titulo: 'Seguir una reparación',
    rutas: ['/reparaciones/*'],
    acceso: ['reparaciones'],
    quien: 'Vendedores y personal del área técnica.',
    resumen:
      'La ficha del equipo: estado actual, historial, técnico, garantía y comprobantes. Desde acá se informa cada paso y se avisa al cliente.',
    pasos: [
      '«Informar estado»: elegí el estado nuevo (por ejemplo «En revisión» o «Falta confirmar nuevo presupuesto») y el técnico. El cliente lo ve en su enlace.',
      '«Avisar por WhatsApp»: abre WhatsApp con el mensaje y el enlace de seguimiento ya escritos.',
      '«Está lista (reparada)»: poné cuánto se cobra, quién la reparó, el tipo de reparación y los días de garantía.',
      '«No se repara»: elegí el motivo (sin solución, no aceptó el presupuesto, sin repuesto, devolución) y, si corresponde, un cargo por revisión.',
      'Cuando el cliente la retira: si hay que cobrar, «Cobrar y entregar en la caja»; si no, «Entregar sin cobrar».',
    ],
    consejos: [
      'Las notas internas quedan en el historial pero el cliente no las ve.',
      'Comprobantes: ingreso (2 hojas), garantía amarilla (reparado) y entrega sin costo rosa (no se reparó). Todos salen con original y copia.',
    ],
    problemas: [
      ['El botón de WhatsApp no aparece', 'Falta el teléfono del cliente o está mal escrito. Editá la reparación y cargalo solo con números.'],
      ['El cliente volvió con el mismo problema', 'Abrí la reparación entregada y tocá «Reingreso por garantía».'],
    ],
    ver: ['cobrar-reparacion', 'recibir-equipo'],
  },
  {
    id: 'cobrar-reparacion',
    grupo: 'Área técnica',
    titulo: 'Cobrar y entregar una reparación',
    rutas: [],
    acceso: ['vender'],
    quien: 'Vendedores con caja abierta.',
    resumen:
      'La reparación se cobra en la caja como una venta más. Al cobrar queda entregada y se ofrece imprimir el comprobante de salida (garantía o entrega sin costo).',
    pasos: [
      'En Vender tocá «Cobrar reparación» y buscá el número (R-00012) o el nombre del cliente. También podés entrar desde la ficha con «Cobrar y entregar en la caja».',
      'Si hace falta, poné un descuento en la línea de la reparación (hasta el tope de reparaciones de tu rol).',
      'Podés sumar productos a la misma venta (por ejemplo, un vidrio templado).',
      'Cobrá. En la pantalla final tocá «Comprobante R-…» para imprimir la salida (garantía o entrega sin costo) y hacela firmar.',
    ],
    ver: ['ficha-reparacion'],
  },
  {
    id: 'config-taller',
    grupo: 'Área técnica',
    titulo: 'Configurar el área técnica',
    rutas: ['/reparaciones/configuracion'],
    acceso: ['reparaciones_config'],
    quien: 'Administración o quien tenga «Configurar el área técnica».',
    resumen: 'Los estados que se informan al cliente, la lista de precios de reparación, los técnicos y los textos (cláusulas) de los comprobantes.',
    pasos: [
      'Estados del taller: renombralos, cambiá el orden, desactivá los que no uses o agregá nuevos. Cada uno pertenece a una parte del proceso (en el local, en reparación o listo).',
      'Lista de precios: agregá modelo, tipo de reparación y precio. Para cargar muchos, copiá las tres columnas de Excel y pegalas.',
      'Técnicos: solo el nombre. No necesitan usuario.',
      'Comprobantes y garantía: los días de garantía por defecto y las cláusulas de cada comprobante (una por renglón).',
    ],
    consejos: ['Si un precio ya existe para ese modelo y tipo, pegarlo de nuevo lo actualiza.'],
  },
  {
    id: 'reporte-taller',
    grupo: 'Área técnica',
    titulo: 'Reporte del área técnica',
    rutas: ['/reparaciones/reporte'],
    acceso: ['reparaciones'],
    quien: 'Personal del área técnica; los importes cobrados solo con permiso de reportes.',
    resumen: 'Cuántos equipos entraron, cuántos se repararon, sin solución, no aceptados, devoluciones y reingresos por garantía, por técnico, por tipo y por sucursal.',
    pasos: ['Elegí las fechas y la sucursal.', 'Mirá «Por técnico» para ver quién reparó qué y cuántos volvieron por garantía.'],
  },

  // ── Mercadería ──────────────────────────────────────────────────────────
  {
    id: 'productos',
    grupo: 'Mercadería',
    titulo: 'Productos',
    rutas: ['/productos', '/productos/nuevo', '/productos/*'],
    quien: 'Todos los ven; crearlos y cambiar precios, con el permiso «Productos, precios y categorías».',
    resumen: 'El catálogo con precios (lista, transferencia y efectivo), código de barras, categoría y stock en cada sucursal.',
    pasos: [
      'Buscá por nombre o código (también escaneando), o filtrá por categoría y por «Stock bajo».',
      'Abrí un producto para ver el stock en cada depósito, sus movimientos y sus precios.',
      '«Nuevo producto» para uno suelto; «Nuevo producto con variantes» para fundas y accesorios con modelo y color.',
    ],
    consejos: [
      'El stock se carga después, con un ingreso de mercadería (o importando desde Dux).',
      'Stock mínimo: cuando queda eso o menos, aparece en Inicio para reponer.',
      'Si el producto no tiene precio de transferencia o efectivo propio, se calcula con el % de Ajustes del negocio.',
    ],
    ver: ['variantes', 'precios', 'etiquetas'],
  },
  {
    id: 'variantes',
    grupo: 'Mercadería',
    titulo: 'Productos con variantes (modelo y color)',
    rutas: ['/articulos/nuevo', '/articulos/*'],
    acceso: ['productos'],
    quien: 'Quien carga productos.',
    resumen: 'Cargás el artículo una sola vez (por ejemplo «Funda silicona») y el sistema crea cada modelo y color con su código y su stock.',
    pasos: [
      'Nombre del artículo, sin modelo ni color.',
      'Elegí los modelos de celular (de las listas de Ajustes o escribiendo nuevos) y los colores.',
      'Poné el precio y el costo para todas; después se puede cambiar alguna en particular.',
    ],
    consejos: ['Al cambiar el nombre del artículo se renombran todas las variantes.'],
  },
  {
    id: 'ingreso',
    grupo: 'Mercadería',
    titulo: 'Ingreso de mercadería',
    rutas: ['/mercaderia/ingreso'],
    acceso: ['ingreso'],
    quien: 'Depósito y quien tenga «Ingreso de mercadería».',
    resumen: 'Cargar la mercadería que llega (de un proveedor o de donde sea) a un depósito. Suma stock.',
    pasos: ['Elegí el depósito.', 'Escaneá cada unidad o escribí la cantidad.', 'Revisá la lista y confirmá.'],
    consejos: ['Si viene con factura de proveedor, cargala en Compras: además de sumar stock, actualiza costos y la cuenta del proveedor.'],
    ver: ['compras'],
  },
  {
    id: 'pedidos',
    grupo: 'Mercadería',
    titulo: 'Pedidos al depósito',
    rutas: ['/pedidos', '/pedidos/nuevo'],
    acceso: ['pedidos', 'envios'],
    quien: 'Locales: piden. Depósito: atiende y arma el envío.',
    resumen: 'El local pide lo que le falta; el depósito lo ve, arma el envío y lo manda. El pedido queda pendiente, enviado en parte o completo.',
    pasos: [
      'Local: «Hacer un pedido», buscá los productos (se ve cuánto hay en el depósito) y poné cantidades. Podés dejar una nota («urgente para el sábado»).',
      'Depósito: abrí el pedido y tocá «Armar envío». Se completa con lo pedido; ajustá según lo que hay.',
      'El local recibe la mercadería en Envíos.',
    ],
    ver: ['envios'],
  },
  {
    id: 'envios',
    grupo: 'Mercadería',
    titulo: 'Envíos',
    rutas: ['/envios', '/envios/nuevo', '/envios/*'],
    quien: 'Depósito: manda. Locales: reciben y cuentan.',
    resumen:
      'La mercadería que viaja entre el depósito y las sucursales. Lo que se manda sale del stock de origen y queda «en camino» hasta que la sucursal lo cuenta y confirma que llegó.',
    pasos: [
      'Mandar (depósito): «Armar envío», elegí destino y productos, confirmá.',
      'Recibir (local): abrí el envío en camino y contá lo que llegó: escaneá cada unidad o escribí cuántas contaste. Si de algo no llegó nada, poné 0.',
      'Confirmá. Si coincide, entra al stock de tu local. Si no, queda «con diferencias».',
      'Diferencias (supervisión): decidí si lo faltante se perdió o vuelve al depósito.',
    ],
    consejos: ['Contá antes de acomodar en la vidriera: es la única forma de saber si llegó todo.'],
    ver: ['pedidos'],
  },
  {
    id: 'entregas',
    grupo: 'Mercadería',
    titulo: 'Entregas de ventas entre sucursales',
    rutas: ['/entregas'],
    acceso: ['vender', 'envios'],
    quien: 'Vendedores y depósito.',
    resumen: 'Productos vendidos en una sucursal que salen de otra: los que hay que mandar, los que van a retirar y los que están en camino.',
    pasos: [
      'Sucursal de origen: cuando lo mandás, «Ya lo mandamos»; si el cliente lo retiró ahí, «Ya lo retiró».',
      'Sucursal que vendió: cuando llega y se lo das al cliente, «Llegó y se entregó».',
    ],
    ver: ['venta-otra-sucursal'],
  },
  {
    id: 'transferencias',
    grupo: 'Mercadería',
    titulo: 'Transferencias directas',
    rutas: ['/mercaderia/transferencia'],
    acceso: ['transferencias'],
    quien: 'Supervisión y Administración.',
    resumen: 'Mover stock de un depósito a otro al instante, sin envío ni conteo. Para correcciones o movimientos internos.',
    pasos: ['Elegí depósito de origen y de destino.', 'Agregá productos y cantidades.', 'Confirmá: el stock se mueve en el momento.'],
    consejos: ['Para mandar mercadería a un local, mejor usar Envíos: el local cuenta lo que llega y quedan registradas las diferencias.'],
  },
  {
    id: 'ajustes-stock',
    grupo: 'Mercadería',
    titulo: 'Ajustes de stock',
    rutas: ['/mercaderia/ajuste'],
    acceso: ['ajustes_stock'],
    quien: 'Quien tenga «Ajustes de stock».',
    resumen: 'Corregir el stock después de un recuento, una rotura o una pérdida. Queda registrado con el motivo.',
    pasos: [
      'Elegí el depósito y el motivo: Recuento, Rotura, Pérdida o robo, u Otro.',
      'Recuento: poné lo que contaste y el sistema calcula la diferencia. Rotura o pérdida: poné cuántas descontar. Otro: la diferencia (negativa para restar).',
      'Revisá y confirmá. Queda en Movimientos con el motivo y tu nombre.',
    ],
    consejos: ['Para un recuento completo de un local, es más rápido importar la planilla desde «Importar desde Dux».'],
  },
  {
    id: 'movimientos',
    grupo: 'Mercadería',
    titulo: 'Movimientos de mercadería',
    rutas: ['/mercaderia', '/mercaderia/*'],
    quien: 'Todo el personal.',
    resumen: 'El historial de todo lo que entró y salió del stock: ventas, ingresos, envíos, ajustes, devoluciones. Sirve para saber por qué un número no cierra.',
    pasos: ['Filtrá por sucursal, tipo de movimiento o fechas.', 'Cada fila muestra el depósito, las unidades y quién lo hizo.'],
  },
  {
    id: 'etiquetas',
    grupo: 'Mercadería',
    titulo: 'Etiquetas',
    rutas: ['/etiquetas'],
    quien: 'Todo el personal.',
    resumen: 'Imprimir etiquetas con código de barras, nombre y precio. Para productos que no traen código o para remarcar precios.',
    pasos: ['Agregá los productos y cuántas etiquetas de cada uno.', 'Elegí el ancho del papel.', 'Imprimí con escala 100 % y sin márgenes extra.'],
  },

  // ── Compras y gastos ────────────────────────────────────────────────────
  {
    id: 'compras',
    grupo: 'Compras y gastos',
    titulo: 'Compras y proveedores',
    rutas: ['/compras', '/compras/nueva', '/compras/*', '/proveedores', '/proveedores/nuevo', '/proveedores/*'],
    acceso: ['compras'],
    quien: 'Administración y quien tenga «Compras y proveedores».',
    resumen: 'Cargar la factura del proveedor: la mercadería entra al stock, se actualizan los costos y queda la deuda en su cuenta corriente.',
    pasos: [
      'Elegí el proveedor y el depósito donde entra.',
      'Escaneá cada producto o cargá por modelo y color. El costo viene con el último que pagaste: corregilo si cambió.',
      'Poné percepciones y el total de la factura.',
      'Si pagaste una parte, poné cuánto: el resto queda en la cuenta del proveedor.',
    ],
    consejos: ['Con costos al día, los reportes de margen y el valor del stock son reales.'],
  },
  {
    id: 'gastos',
    grupo: 'Compras y gastos',
    titulo: 'Gastos',
    rutas: ['/gastos'],
    quien: 'Vendedores: gastos pagados con su caja. Administración: todos los gastos.',
    resumen: 'Registrar lo que se paga (limpieza, flete, comida, servicios). Si sale de la caja, se descuenta del efectivo.',
    pasos: [
      'Elegí la categoría, el importe y una descripción.',
      'Marcá «Sale de mi caja» si lo pagaste con la plata de la caja (tenés que tener la caja abierta).',
      'Guardá. Administración puede anularlo si se cargó mal.',
    ],
    ver: ['caja'],
  },

  // ── Administración ──────────────────────────────────────────────────────
  {
    id: 'reportes',
    grupo: 'Administración',
    titulo: 'Reportes',
    rutas: ['/reportes'],
    acceso: ['reportes'],
    quien: 'Administración y quien tenga «Reportes y comprobantes».',
    resumen: 'Ventas por día, por sucursal, por vendedor y por medio de pago, más vendidos, ticket promedio, productos sin ventas y valor del stock (a costo y a precio de venta). Todo se baja a Excel.',
    pasos: ['Elegí el período y la sucursal.', 'Revisá cada bloque y bajá el Excel si necesitás el detalle.'],
  },
  {
    id: 'comprobantes',
    grupo: 'Administración',
    titulo: 'Comprobantes',
    rutas: ['/comprobantes'],
    acceso: ['reportes'],
    quien: 'Administración.',
    resumen: 'Facturas y notas de crédito emitidas en ARCA. Las notas de crédito restan en los totales.',
    pasos: ['Filtrá por fechas, punto de venta y ambiente (producción, homologación o simulación).', 'Abrí un comprobante para reimprimirlo.'],
  },
  {
    id: 'precios',
    grupo: 'Administración',
    titulo: 'Actualizar precios',
    rutas: ['/precios'],
    acceso: ['productos'],
    quien: 'Quien tenga «Productos, precios y categorías».',
    resumen: 'Subir o bajar los precios de venta por porcentaje, de una categoría o de todo. Antes de aplicar ves cómo quedan.',
    pasos: [
      'Elegí la categoría (o todas) y el porcentaje. Negativo para bajar (por ejemplo -10).',
      'Elegí el redondeo ($100, $500, $1.000 o sin redondear).',
      'Revisá la vista previa y aplicá. Abajo queda el historial de cambios.',
    ],
    consejos: ['Después de un aumento, imprimí etiquetas nuevas para la vidriera.'],
  },
  {
    id: 'categorias',
    grupo: 'Administración',
    titulo: 'Categorías',
    rutas: ['/categorias'],
    acceso: ['productos'],
    quien: 'Quien tenga «Productos, precios y categorías».',
    resumen: 'Agrupan los productos para buscarlos, filtrarlos, subir precios por grupo y ver reportes.',
  },
  {
    id: 'solicitudes',
    grupo: 'Administración',
    titulo: 'Ayuda y solicitudes',
    rutas: ['/solicitudes'],
    quien: 'Todo el personal pide; Administración responde.',
    resumen: 'Para pedir ayuda, un informe o sugerir una mejora al sistema. Queda registrado y ves la respuesta acá mismo.',
    pasos: ['Elegí el tipo (ayuda, informe o mejora).', 'Poné un asunto corto y el detalle: qué querías hacer, qué pasó y en qué pantalla.', 'Revisá acá la respuesta.'],
  },

  // ── Configuración ───────────────────────────────────────────────────────
  {
    id: 'personal',
    grupo: 'Configuración',
    titulo: 'Personal, roles y permisos',
    rutas: ['/usuarios'],
    acceso: ['personal'],
    quien: 'Administración.',
    resumen:
      'Quién trabaja en cada sucursal, con qué rol y qué puede hacer. Cada rol tiene permisos y topes de descuento; a una persona se le pueden dar permisos extra o quitar algunos sin crear otro rol.',
    pasos: [
      '«Sumar a alguien»: nombre, usuario, rol y dónde trabaja. Se genera un código de acceso (vence en 7 días) para que cree su contraseña.',
      '«Mover» pasa a alguien a otra sucursal en un paso; «Editar» cambia rol, datos y permisos. Rige al instante.',
      'Roles: «Editar rol» para tildar o destildar permisos y fijar los descuentos máximos (productos y reparaciones).',
      'Permisos de una persona: al editarla, abrí «Permisos de esta persona» y tildá o destildá. Lo que difiere del rol queda marcado (agregado) o (quitado).',
      'Descuento propio: dejalo vacío para usar el del rol, o poné uno distinto para esa persona.',
      'Dar de baja: al editarla, destildá «Puede entrar al sistema». Ya no entra, pero su historial queda.',
      'Si alguien olvidó la contraseña, generale un código de acceso nuevo.',
    ],
    consejos: [
      'Ejemplo: Lisandro es Supervisor y además maneja el depósito → rol Supervisor y, en sus permisos, tildar «Atender pedidos y mandar envíos».',
      'Los permisos marcados «todas las sucursales» (reportes, compras, configuración) solo se pueden dar a roles que trabajan en todas las sucursales.',
    ],
  },
  {
    id: 'sucursales',
    grupo: 'Configuración',
    titulo: 'Sucursales y depósitos',
    rutas: ['/sucursales'],
    acceso: ['configuracion'],
    quien: 'Administración.',
    resumen: 'Cada sucursal tiene un depósito principal, del que se descuentan sus ventas. Se pueden sumar depósitos extra o centrales.',
    pasos: ['«Nueva sucursal»: nombre, dirección y tipo (local a la calle, ventas online o depósito central).', 'Sumá depósitos si hace falta y elegí cuál es el principal con «Hacer principal».'],
  },
  {
    id: 'importar',
    grupo: 'Configuración',
    titulo: 'Importar desde Dux o Excel',
    rutas: ['/importar'],
    acceso: ['configuracion'],
    quien: 'Administración.',
    resumen: 'Subir el Excel de Dux (stock por depósito, lista de precios) o cualquier planilla con código y nombre. Primero ves una vista previa; nada se guarda hasta que confirmás.',
    pasos: [
      'Subí el archivo (.xlsx, .xls o .csv).',
      'Revisá qué columna corresponde a cada dato y a qué depósito va el stock de cada columna.',
      'Mirá la vista previa y las filas que no se van a importar.',
      'Confirmá.',
    ],
    consejos: ['Ojo: importar stock reemplaza el stock actual de ese depósito por el de la planilla.'],
  },
  {
    id: 'ajustes',
    grupo: 'Configuración',
    titulo: 'Ajustes del negocio',
    rutas: ['/ajustes'],
    acceso: ['configuracion'],
    quien: 'Administración.',
    resumen: 'Nombre y logo, color de marca, ticket (ancho y texto al pie), porcentajes de transferencia y efectivo, listas de modelos y colores, y categorías de gastos.',
  },
  {
    id: 'facturacion',
    grupo: 'Configuración',
    titulo: 'Facturación ARCA',
    rutas: ['/facturacion'],
    acceso: ['facturacion'],
    quien: 'Administración.',
    resumen: 'Datos fiscales, certificado y puntos de venta para emitir facturas y notas de crédito electrónicas.',
    pasos: [
      'Datos del negocio como figuran en ARCA.',
      'Certificado y puntos de venta de cada sucursal.',
      'Modo: desactivada, simulación (para practicar), homologación (pruebas con ARCA) o producción; y si se factura automáticamente a consumidor final.',
    ],
    consejos: ['Hoy está desactivada: las ventas no se informan a ARCA hasta que Administración la active.'],
  },
]

export type CasoDeUso = { id: string; titulo: string; situacion: string; pasos: string[]; acceso?: Acceso }

export const CASOS: CasoDeUso[] = [
  {
    id: 'dia-local',
    titulo: 'Un día en el local, de punta a punta',
    situacion: 'Abrís el local a la mañana y lo cerrás a la noche.',
    acceso: ['vender'],
    pasos: [
      'Entrá al sistema y mirá Inicio: ¿hay envíos por recibir o reparaciones listas?',
      'Vender → abrí la caja con el efectivo del cambio.',
      'Si llegó un envío, contalo en Envíos antes de acomodar.',
      'Vendé durante el día (F2 para cobrar). Cargá los gastos pagados con la caja en Gastos.',
      'Antes de cerrar, revisá Reparaciones y Entregas de ventas por si quedó algo pendiente.',
      'Caja → contá los billetes y cerrá.',
    ],
  },
  {
    id: 'venta-mixta',
    titulo: 'El cliente paga una parte en efectivo y otra con tarjeta',
    situacion: 'Una funda y un cargador, $30.000; paga $10.000 en efectivo y el resto con débito.',
    acceso: ['vender'],
    pasos: [
      'Dejá el precio en «Lista» (al mezclar con tarjeta no corresponde el de efectivo).',
      'Cobrar (F2) → Efectivo, poné 10.000.',
      '«+ Pagar con dos medios» → Débito; el sistema completa lo que falta.',
      'Confirmá.',
    ],
  },
  {
    id: 'sena',
    titulo: 'El cliente deja una seña y retira después',
    situacion: 'Encarga un producto, deja $5.000 y paga el resto cuando lo busca.',
    acceso: ['vender'],
    pasos: [
      'Elegí el cliente (o crealo con el nombre).',
      'Agregá el producto y tocá Cobrar.',
      'Marcá «Apartar: la retira después».',
      'Efectivo 5.000 y el resto «A cuenta». Confirmá.',
      'Cuando viene: en Clientes cobrá la deuda; en la venta, «Marcar como retirada».',
    ],
  },
  {
    id: 'no-hay-en-local',
    titulo: 'No hay en mi local, pero sí en otra sucursal',
    situacion: 'El cliente quiere una funda que en San Lorenzo 960 no hay, pero en Av. Maipú 231 sí.',
    acceso: ['vender'],
    pasos: [
      'Buscala en Vender: debajo del nombre aparece «Av. Maipú 231 3» (sucursal y cantidad).',
      'Agregala y elegí origen «Av. Maipú 231».',
      'Si el cliente la busca allá: «Retira allá». Si te la mandan: «Lo mandan acá».',
      'Cobrá. Maipú la ve en Entregas de ventas y marca «Ya lo mandamos» o «Ya lo retiró».',
      'Si te la mandaron, cuando se la das al cliente marcá «Llegó y se entregó».',
    ],
  },
  {
    id: 'reparacion-completa',
    titulo: 'Una reparación, de la recepción a la entrega',
    situacion: 'Entra un Samsung A15 con la pantalla rota.',
    acceso: ['reparaciones'],
    pasos: [
      'Reparaciones → Recibir un equipo. Cargá cliente, DNI, teléfono, modelo, «Cambio de módulo» y cómo se recibe.',
      'Guardá, imprimí el ingreso (2 hojas, original y copia) y hacelo firmar.',
      'Mandale el enlace de seguimiento por WhatsApp.',
      'Cuando el técnico lo toma: Informar estado → «En proceso de reparación», técnico Matías.',
      'Terminado: «Está lista», precio, técnico y garantía (30 días). Avisale por WhatsApp.',
      'Cuando viene: Vender → Cobrar reparación → cobrá → imprimí la garantía (amarilla) y hacela firmar.',
    ],
  },
  {
    id: 'reparacion-no-acepta',
    titulo: 'El cliente no acepta el presupuesto',
    situacion: 'Revisaron el equipo, cuesta más de lo pensado y el cliente no quiere.',
    acceso: ['reparaciones'],
    pasos: [
      'Mientras esperás la respuesta: Informar estado → «Falta confirmar nuevo presupuesto».',
      'Si dice que no: «No se repara» → motivo «No aceptó el presupuesto». Si cobran revisión, poné el importe.',
      'Cuando lo retira: sin cargo, «Entregar sin cobrar»; con cargo, se cobra en la caja.',
      'Imprimí la entrega sin costo (rosa) y hacela firmar.',
    ],
  },
  {
    id: 'garantia',
    titulo: 'Vuelve un equipo por garantía',
    situacion: 'El cliente vuelve a los 10 días: el táctil falla otra vez.',
    acceso: ['reparaciones'],
    pasos: [
      'Buscá la reparación anterior (por nombre o teléfono) y abrila.',
      'Tocá «Reingreso por garantía»: se copian cliente y equipo, con presupuesto $0.',
      'Cargá la falla nueva y guardá. Queda vinculada y cuenta en el reporte del técnico.',
    ],
  },
  {
    id: 'cambio-talle',
    titulo: 'Cambio por otro modelo',
    situacion: 'Compró una funda para A15 y era para A25.',
    acceso: ['vender'],
    pasos: [
      'Vender → «Cambio de producto» → escaneá el ticket de cambio.',
      'Marcá la funda A15 y «Usar en el cambio».',
      'Escaneá la funda A25. Si cuesta lo mismo, confirmá sin cobrar; si no, cobrá o devolvé la diferencia.',
    ],
  },
  {
    id: 'reponer-local',
    titulo: 'Reponer el local desde el depósito',
    situacion: 'Se están terminando los vidrios templados.',
    acceso: ['pedidos', 'envios'],
    pasos: [
      'Local: Pedidos al depósito → Hacer un pedido → vidrios y cantidades.',
      'Depósito: abre el pedido → Armar envío → confirma.',
      'Local: cuando llega, Envíos → abrir → contar → confirmar.',
      'Si llegó menos, queda con diferencias y supervisión decide.',
    ],
  },
  {
    id: 'aumento',
    titulo: 'Aumento de precios del 8 %',
    situacion: 'El proveedor aumentó y querés subir la categoría «Cargadores».',
    acceso: ['productos'],
    pasos: [
      'Actualizar precios → categoría Cargadores → 8 % → redondeo $100.',
      'Revisá la vista previa y aplicá.',
      'Etiquetas → agregá los cargadores → imprimí para la vidriera.',
    ],
  },
  {
    id: 'persona-nueva',
    titulo: 'Entra una vendedora nueva',
    situacion: 'Empieza a trabajar en Catamarca 815.',
    acceso: ['personal'],
    pasos: [
      'Personal y permisos → «Sumar a alguien»: nombre, usuario, rol Vendedor/a, sucursal Catamarca 815.',
      'Pasale el usuario y el código de acceso que aparece.',
      'Ella entra con «Entrá con tu código de acceso» y crea su contraseña.',
      'Si necesita algo más (por ejemplo, clientes), tildalo en «Permisos de esta persona».',
    ],
  },
]

export const PREGUNTAS: { p: string; r: string; acceso?: Acceso }[] = [
  { p: '¿Por qué no veo una opción que ve mi compañera?', r: 'Cada persona ve lo que su rol y sus permisos le dan. Pedile a Administración el permiso que te falta.' },
  { p: '¿Qué precio cobro: lista, transferencia o efectivo?', r: 'Lista para tarjeta (débito o crédito). Transferencia si paga todo con transferencia o efectivo. Efectivo si paga todo en efectivo. Si mezcla con tarjeta, va a lista.', acceso: ['vender'] },
  { p: '¿Hasta cuánto descuento puedo hacer?', r: 'Lo fija tu rol (un tope para productos y otro para reparaciones). Si necesitás más, pedí autorización.', acceso: ['vender'] },
  { p: '¿Puedo vender si el sistema dice stock 0?', r: 'Sí. El stock queda negativo y conviene avisar para que lo corrijan con un ingreso o un ajuste.', acceso: ['vender'] },
  { p: 'Me equivoqué en una venta, ¿qué hago?', r: 'Si el cliente sigue ahí, devolvé lo que corresponda desde la venta. Si está toda mal, pedí que la anulen (Supervisión o Administración).', acceso: ['vender'] },
  { p: '¿El cliente ve las notas internas de la reparación?', r: 'No. En el enlace de seguimiento solo ve el estado. Las notas quedan para el equipo.', acceso: ['reparaciones'] },
  { p: '¿Cómo le aviso al cliente que el equipo está listo?', r: 'En la ficha de la reparación, «Avisar por WhatsApp»: abre WhatsApp con el mensaje y el enlace ya escritos.', acceso: ['reparaciones'] },
  { p: '¿Se puede cambiar el texto de las cláusulas?', r: 'Sí, en Reparaciones → Configuración → Comprobantes y garantía (quien tenga ese permiso).', acceso: ['reparaciones'] },
  { p: 'Llegó un envío con menos cosas, ¿qué hago?', r: 'Contá lo que llegó de verdad y confirmá. Queda «con diferencias» y Supervisión decide si se perdió o vuelve.' },
  { p: '¿Funciona en el celular?', r: 'Sí. El menú queda abajo. Para vender con escáner conviene la PC del local, pero todo lo demás anda igual en el celular.' },
  { p: '¿Qué pasa si se corta internet?', r: 'El sistema necesita conexión. Anotá las ventas en papel y cargalas cuando vuelva (o usá los datos del celular).' },
  { p: 'Encontré un error o se me ocurre una mejora', r: 'Cargalo en «Ayuda y solicitudes» contando en qué pantalla y qué pasó. Queda registrado y ves la respuesta ahí.' },
]

export const ATAJOS: [string, string][] = [
  ['F2', 'Cobrar la venta (en Vender).'],
  ['Esc', 'Cerrar la ventana de cobro o las sugerencias de búsqueda.'],
  ['Enter', 'En la búsqueda de Vender, agrega el único resultado.'],
  ['Escáner', 'Cada lectura suma una unidad: en Vender, al contar un envío y en el ingreso de mercadería.'],
  ['Ctrl + P', 'Imprimir la pantalla actual (comprobantes, presupuestos, esta guía).'],
]

export const GLOSARIO: [string, string][] = [
  ['Depósito', 'Lugar donde hay stock. Cada sucursal tiene su depósito principal; el Depósito central abastece a todas.'],
  ['Stock mínimo', 'Cantidad a partir de la cual el producto aparece en Inicio para reponer.'],
  ['Precio de lista', 'El precio base, para pagos con tarjeta.'],
  ['Cuenta corriente', 'Lo que un cliente debe o tiene a favor. También existe para proveedores.'],
  ['Saldo a favor', 'Plata del cliente que quedó en el negocio (seña, devolución, vuelto) y se usa en la próxima compra.'],
  ['Apartada', 'Venta cobrada (o señada) que el cliente retira después.'],
  ['Envío', 'Mercadería que viaja entre depósitos y que el destino cuenta al recibir.'],
  ['Transferencia directa', 'Movimiento de stock entre depósitos sin envío ni conteo.'],
  ['Ajuste de stock', 'Corrección por recuento, rotura o pérdida.'],
  ['Entrega de venta', 'Producto vendido en una sucursal que sale de otra.'],
  ['Estado del taller', 'Paso de la reparación que se informa al cliente (En revisión, En proceso, Listo…).'],
  ['Enlace de seguimiento', 'Página pública donde el cliente ve el estado de su equipo sin llamar.'],
  ['Reingreso', 'Reparación que vuelve por garantía, vinculada a la anterior.'],
  ['Rol', 'Conjunto de permisos y topes de descuento (Vendedor/a, Supervisor, Encargado de depósito, Administración).'],
  ['Nota de crédito', 'Comprobante de ARCA que anula total o parcialmente una factura.'],
]

const tramos = (r: string) => r.split('/').filter(Boolean)

function coincide(patron: string, ruta: string[]) {
  const p = tramos(patron)
  return p.length === ruta.length && p.every((t, i) => t === '*' || t === ruta[i])
}

/** La sección de ayuda de una pantalla: primero la ruta exacta, después las de `*`. */
export function seccionDeRuta(pathname: string): SeccionGuia | undefined {
  const ruta = tramos(pathname)
  const exacta = SECCIONES.find((s) => s.rutas.some((r) => !r.includes('*') && coincide(r, ruta)))
  return exacta ?? SECCIONES.find((s) => s.rutas.some((r) => coincide(r, ruta)))
}

/** ¿Esta persona usa esto? Sin acceso definido, sí. */
export const puedeVerGuia = (acceso: Acceso | undefined, permisos: readonly string[]) => !acceso || acceso.some((p) => permisos.includes(p))
