import { db } from '@/lib/db'
import { requerirAdmin, requerirUsuario } from '@/lib/dal'
import { depositosPara } from '@/lib/depositos'
import { Encabezado } from '@/components/ui'
import { OperacionStock } from './operacion'

const TITULOS = {
  ingreso: {
    titulo: 'Ingreso de mercadería',
    detalle: 'Escaneá lo que llegó: cada lectura suma una unidad. Si un producto no existe, lo das de alta acá mismo.',
  },
  transferencia: {
    titulo: 'Transferencia',
    detalle: 'Mové mercadería de un depósito o sucursal a otro. Sale de uno y entra en el otro en el mismo momento.',
  },
  ajuste: {
    titulo: 'Ajuste de stock',
    detalle: 'Para corregir el stock por recuento, rotura o pérdida. Queda registrado quién lo hizo y por qué.',
  },
} as const

/** Página compartida por ingreso, transferencia y ajuste. */
export async function PaginaOperacion({ tipo, articulo = null }: { tipo: keyof typeof TITULOS; articulo?: number | null }) {
  const u = tipo === 'ajuste' ? await requerirAdmin() : await requerirUsuario()
  const [depositos, categorias] = await Promise.all([
    depositosPara(u),
    tipo === 'ingreso' ? db()<{ id: number; nombre: string }[]>`select id, nombre from categorias where activa order by lower(nombre)` : [],
  ])
  return (
    <>
      <Encabezado titulo={TITULOS[tipo].titulo} detalle={TITULOS[tipo].detalle} />
      <OperacionStock tipo={tipo} depositos={depositos} categorias={categorias} usuarioId={u.id} articuloInicial={articulo} />
    </>
  )
}
