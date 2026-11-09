import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { coincide } from "@/lib/busqueda";
import { requerirUsuario } from "@/lib/dal";
import { formatoEntero, formatoPesos } from "@/lib/formato";
import {
  BotonLink,
  Encabezado,
  Etiqueta,
  Input,
  Select,
  Stock,
  Tarjeta,
  Vacio,
  tablaCls as t,
} from "@/components/ui";

export const metadata: Metadata = { title: "Productos" };

const POR_PAGINA = 50;

type Fila = {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string | null;
  precio: number;
  stock: number;
  stock_minimo: number;
  activo: boolean;
  articulo_id: number | null;
  articulo: string | null;
  talle: string | null;
  color: string | null;
};

export default async function ProductosPage(props: PageProps<"/productos">) {
  const u = await requerirUsuario();
  const sp = await props.searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const categoria = Number(sp.categoria) || null;
  const estado = typeof sp.estado === "string" ? sp.estado : "activos";
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const sql = db();

  // Escaneo directo: si el texto es exactamente un código, abrir ese producto.
  if (q) {
    const [exacto] = await sql<
      { id: number }[]
    >`select id from productos where lower(codigo) = lower(${q})`;
    if (exacto) redirect(`/productos/${exacto.id}`);
  }

  // La vendedora ve el stock de su sucursal; la administradora, el total.
  const filtroStock =
    u.rol === "admin"
      ? sql``
      : sql`and s.deposito_id in (select id from depositos where sucursal_id = ${u.sucursal_id})`;
  const where = sql`
    where true
    ${q ? sql`and ${coincide(sql, q)}` : sql``}
    ${categoria ? sql`and p.categoria_id = ${categoria}` : sql``}
    ${estado === "inactivos" ? sql`and not p.activo` : estado === "todos" ? sql`` : sql`and p.activo`}`;
  const bajo = estado === "stock-bajo";

  const [filas, [{ total }], categorias] = await Promise.all([
    sql<Fila[]>`
      select * from (
        select p.id, p.codigo, p.nombre, c.nombre as categoria, p.precio, p.stock_minimo, p.activo,
          p.articulo_id, a.nombre as articulo, p.talle, p.color, p.orden_talle,
          coalesce((select sum(s.cantidad) from stock s where s.producto_id = p.id ${filtroStock}), 0)::int as stock
        from productos p left join categorias c on c.id = p.categoria_id left join articulos a on a.id = p.articulo_id
        ${where}
      ) x
      ${bajo ? sql`where stock <= stock_minimo` : sql``}
      order by lower(coalesce(articulo, nombre)), articulo_id nulls first, lower(coalesce(color, '')), orden_talle, lower(nombre)
      limit ${POR_PAGINA} offset ${(pagina - 1) * POR_PAGINA}`,
    sql<{ total: number }[]>`
      select count(*)::int as total from (
        select p.stock_minimo,
          coalesce((select sum(s.cantidad) from stock s where s.producto_id = p.id ${filtroStock}), 0) as stock
        from productos p ${where}
      ) x ${bajo ? sql`where stock <= stock_minimo` : sql``}`,
    sql<
      { id: number; nombre: string }[]
    >`select id, nombre from categorias where activa order by lower(nombre)`,
  ]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const enlace = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (categoria) p.set("categoria", String(categoria));
    if (estado !== "activos") p.set("estado", estado);
    if (n > 1) p.set("pagina", String(n));
    return `/productos${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <Encabezado
        titulo="Productos"
        detalle={`${formatoEntero(total)} producto${total === 1 ? "" : "s"}${u.rol === "vendedora" ? `, con el stock de ${u.sucursal_nombre}` : ", con el stock de todas las sucursales"}`}
        acciones={
          u.rol === "admin" && (
            <>
              <a
                href={`/productos/exportar?${new URLSearchParams({ ...(q ? { q } : {}), ...(categoria ? { categoria: String(categoria) } : {}), estado })}`}
                className="inline-flex h-10 items-center rounded-lg border border-linea bg-papel px-4 text-sm font-semibold shadow-xs hover:bg-fondo"
              >
                Bajar Excel
              </a>
              <BotonLink href="/productos/nuevo" variante="secundario">
                Producto suelto
              </BotonLink>
              <BotonLink href="/articulos/nuevo">
                Nuevo producto con variantes
              </BotonLink>
            </>
          )
        }
      />

      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px_170px_auto]">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Escaneá el código o buscá por nombre"
          autoFocus
          aria-label="Buscar"
        />
        <Select
          name="categoria"
          defaultValue={categoria ?? ""}
          aria-label="Categoría"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
        <Select name="estado" defaultValue={estado} aria-label="Estado">
          <option value="activos">Activos</option>
          <option value="stock-bajo">Stock bajo</option>
          <option value="inactivos">Dados de baja</option>
          <option value="todos">Todos</option>
        </Select>
        <button className="h-10 rounded-lg bg-tinta px-5 text-sm font-semibold text-white hover:bg-tinta/90">
          Buscar
        </button>
      </form>

      <Tarjeta className="overflow-hidden">
        {filas.length === 0 ? (
          q || categoria || estado !== "activos" ? (
            <Vacio
              accion={
                <BotonLink variante="secundario" href="/productos">
                  Ver todos los productos
                </BotonLink>
              }
            >
              No hay productos que coincidan con la búsqueda.
            </Vacio>
          ) : (
            <Vacio
              accion={
                u.rol === "admin" && (
                  <>
                    <BotonLink href="/importar">Importar desde Dux</BotonLink>
                    <BotonLink variante="secundario" href="/productos/nuevo">
                      Cargar uno a mano
                    </BotonLink>
                  </>
                )
              }
            >
              Todavía no hay productos cargados.
            </Vacio>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={`${t.th} hidden sm:table-cell`}>Código</th>
                  <th className={t.th}>Producto</th>
                  <th className={`${t.th} hidden md:table-cell`}>Categoría</th>
                  <th className={`${t.th} text-right`}>Precio</th>
                  <th className={`${t.th} text-right`}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p, i) => {
                  const variante = p.articulo_id !== null;
                  const primeraDelArticulo =
                    variante && filas[i - 1]?.articulo_id !== p.articulo_id;
                  const grupo = primeraDelArticulo
                    ? filas.filter((x) => x.articulo_id === p.articulo_id)
                    : [];
                  return (
                    <Fragment key={p.id}>
                      {primeraDelArticulo && (
                        <tr className="border-t border-linea bg-fondo/50">
                          <td className={`${t.td} hidden sm:table-cell`} />
                          <td className={t.td} colSpan={2}>
                            <Link
                              href={`/articulos/${p.articulo_id}`}
                              className="font-semibold hover:text-marca hover:underline"
                            >
                              {p.articulo}
                            </Link>
                            <span className="ml-2 text-xs text-tinta-suave">
                              {[
                                ...new Set(
                                  grupo.map((x) => x.talle).filter(Boolean),
                                ),
                              ].join(" ")}
                              {grupo.some((x) => x.color)
                                ? `, ${[...new Set(grupo.map((x) => x.color).filter(Boolean))].length} colores`
                                : ""}
                            </span>
                          </td>
                          <td className={`${t.td} hidden md:table-cell`} />
                          <td
                            className={`${t.td} num text-right text-xs font-semibold text-tinta-suave`}
                          >
                            {formatoEntero(
                              grupo.reduce((a, x) => a + x.stock, 0),
                            )}{" "}
                            u.
                          </td>
                        </tr>
                      )}
                      <tr className="hover:bg-fondo/60">
                        <td
                          className={`${t.td} hidden font-mono text-xs text-tinta-suave sm:table-cell`}
                        >
                          {p.codigo}
                        </td>
                        <td className={variante ? `${t.td} pl-8` : t.td}>
                          <Link
                            href={`/productos/${p.id}`}
                            className="font-medium hover:text-marca hover:underline"
                          >
                            {variante
                              ? [p.color, p.talle].filter(Boolean).join(" · ")
                              : p.nombre}
                          </Link>
                          {!p.activo && (
                            <span className="ml-2">
                              <Etiqueta tono="apagado">De baja</Etiqueta>
                            </span>
                          )}
                          <span className="mt-0.5 block font-mono text-xs text-apagado sm:hidden">
                            {p.codigo}
                          </span>
                        </td>
                        <td
                          className={`${t.td} hidden text-tinta-suave md:table-cell`}
                        >
                          {p.categoria ?? "—"}
                        </td>
                        <td
                          className={`${t.td} num text-right font-semibold whitespace-nowrap`}
                        >
                          {formatoPesos(p.precio)}
                        </td>
                        <td className={`${t.td} text-right`}>
                          <Stock cantidad={p.stock} minimo={p.stock_minimo} />
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {paginas > 1 && (
        <nav
          className="mt-4 flex items-center justify-between text-sm"
          aria-label="Páginas"
        >
          <span className="text-tinta-suave">
            Página {pagina} de {paginas}
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <BotonLink variante="secundario" href={enlace(pagina - 1)}>
                Anterior
              </BotonLink>
            )}
            {pagina < paginas && (
              <BotonLink variante="secundario" href={enlace(pagina + 1)}>
                Siguiente
              </BotonLink>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
