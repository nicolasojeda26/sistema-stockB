'use client'

import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input } from '@/components/ui'
import { anular } from '../actions'

export function AnularVenta({ ventaId }: { ventaId: number }) {
  return (
    <FormAccion accion={anular} className="space-y-3 p-5">
      {(_, enviando) => (
        <>
          <p className="text-sm text-tinta-suave">Devuelve el stock y la saca de los totales. Si estaba facturada, se emite la nota de crédito. Queda registrado quién la anuló.</p>
          <input type="hidden" name="id" value={ventaId} />
          <Campo etiqueta="Motivo">
            <Input name="motivo" placeholder="Ej.: se cobró dos veces" required maxLength={200} />
          </Campo>
          <Boton
            type="submit"
            variante="peligro"
            disabled={enviando}
            className="w-full"
            onClick={(e) => {
              if (!confirm(`¿Anular la venta N.º ${ventaId}?`)) e.preventDefault()
            }}
          >
            Anular venta
          </Boton>
        </>
      )}
    </FormAccion>
  )
}
