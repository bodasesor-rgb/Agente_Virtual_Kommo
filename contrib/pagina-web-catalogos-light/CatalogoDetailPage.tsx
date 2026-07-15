import { useEffect } from "react";
import CityLink from "../components/CityLink";
import CatalogEmbed from "../components/CatalogEmbed";
import { CATALOGO_CATEGORIES, getCatalogoBySlug } from "../data/catalogos-embeds";
import NotFound from "./not-found";

const Link = CityLink;
const WA =
  "https://api.whatsapp.com/send/?phone=5215540080373&text=" +
  encodeURIComponent("Hola, me interesa cotizar a partir de sus catálogos 2026.");

export default function CatalogoDetailPage({ slug }: { slug: string }) {
  const catalog = getCatalogoBySlug(slug);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!catalog) {
      document.title = "Catálogo no encontrado | Bodasesor";
      return;
    }
    document.title = `${catalog.title} | Catálogos Bodasesor`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        `Catálogo ${catalog.title} de Bodasesor 2026. Cotiza banquetes, barras, mobiliario y más por WhatsApp.`,
      );
    }
  }, [catalog]);

  if (!catalog) return <NotFound />;

  const categoryLabel =
    CATALOGO_CATEGORIES.find((c) => c.id === catalog.category)?.label || catalog.category;

  return (
    <div className="min-h-screen bg-white">
      <section className="bg-[#162040] text-white py-12 md:py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <nav className="flex flex-wrap items-center gap-2 text-xs text-white/60 font-serif mb-6">
            <Link href="/" className="hover:text-white transition-colors">
              Inicio
            </Link>
            <span>/</span>
            <Link href="/catalogos" className="hover:text-white transition-colors">
              Catálogos
            </Link>
            <span>/</span>
            <span className="text-white/90">{catalog.title}</span>
          </nav>
          <p className="text-[#f5efe8]/80 text-xs uppercase tracking-wide font-serif mb-2">
            {categoryLabel}
          </p>
          <h1 className="text-3xl md:text-5xl font-serif font-bold mb-4">{catalog.title}</h1>
          {catalog.services?.length > 0 && (
            <p className="text-[#f5efe8] font-serif text-base md:text-lg max-w-3xl mb-8">
              {catalog.services.join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <a
              href={WA}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#0d6849] hover:bg-[#0a5740] text-white px-6 py-3 rounded-lg font-bold font-serif transition-colors"
            >
              Cotizar por WhatsApp
            </a>
            <Link
              href={catalog.relatedHref}
              className="inline-flex items-center px-6 py-3 rounded-lg border border-white/30 text-white text-sm font-serif hover:bg-white/10 transition-colors"
            >
              Ver servicio
            </Link>
            <Link
              href="/catalogos"
              className="inline-flex items-center px-6 py-3 rounded-lg border border-white/30 text-white text-sm font-serif hover:bg-white/10 transition-colors"
            >
              Todos los catálogos
            </Link>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Sin eager: Gamma ~600KB+ solo al hacer clic → página mucho más liviana */}
        <CatalogEmbed catalog={catalog} mode="click" minHeight={720} />
        <p className="mt-4 text-center text-sm text-gray-500 font-serif">
          Vista segura en bodasesor.com — el catálogo visual se carga solo si lo pides.
        </p>
      </div>

      <section className="bg-[#162040] py-14 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white font-serif mb-4">
            ¿Te gusta este catálogo?
          </h2>
          <p className="text-[#f5efe8] font-serif mb-8">
            Cotiza sin compromiso. Respuesta en menos de 2 horas.
          </p>
          <a
            href={WA}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#0d6849] hover:bg-[#0a5740] text-white px-10 py-4 rounded-xl font-bold font-serif text-lg transition-colors"
          >
            Cotizar por WhatsApp
          </a>
        </div>
      </section>
    </div>
  );
}
