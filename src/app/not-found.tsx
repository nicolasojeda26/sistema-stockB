import Link from 'next/link'

export default function NoEncontrado() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-marca">404</p>
        <h1 className="mt-1 text-xl font-semibold">No encontramos esa página</h1>
        <p className="mt-2 text-sm text-tinta-suave">Puede que el producto, la venta o el comprobante no exista o no sea de tu sucursal.</p>
        <Link href="/" className="mt-5 inline-flex h-10 items-center rounded-lg bg-marca px-4 text-sm font-medium text-white hover:bg-marca-oscura">
          Ir al inicio
        </Link>
      </div>
    </main>
  )
}
