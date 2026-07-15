import { useEffect, useMemo, useState } from "react";
import CityLink from "../components/CityLink";
import CatalogEmbed from "../components/CatalogEmbed";
import {
  CATALOGO_CATEGORIES,
  CATALOGOS,
  getCatalogoPagePath,
} from "../data/catalogos-embeds";

const Link = CityLink;
const WA =
  "https://api.whatsapp.com/send/?phone=5215540080373&text=" +
  encodeURIComponent("Hola, me interesa cotizar a partir de sus catálogos 2026.");

const btnPrimary =
  "px-4 py-2.5 rounded-lg bg-[#162040] hover:bg-[#1a2a52] text-white text-sm font-bold font-serif transition-colors";
const btnSecondary =
  "px-4 py-2.5 rounded-lg border border-[#162040]/20 text-[#162040] text-sm font-serif hover:bg-[#f5efe8] transition-colors";

export default function CatalogosPage() {
  const [category, setCategory] = useState("todos");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Catálogos 2026 | Bodasesor";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "Explora los catálogos 2026 de Bodasesor: banquetes, barras, mobiliario, audio e iluminación y más. Cotiza por WhatsApp.",
      );
    }
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const exists = CATALOGOS.some((c) => c.slug === hash);
    if (exists) {
      setOpenSlug(hash);
      const cat = CATALOGOS.find((c) => c.slug === hash);
      if (cat) setCategory(cat.category);
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  const filtered = useMemo(() => {
    if (category === "todos") return CATALOGOS;
    return CATALOGOS.filter((c) => c.category === category);
  }, [category]);

  return (
    <div className="min-h-screen bg-white">
      <section className="bg-[#162040] text-white py-14 md:py-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <nav className="flex items-center justify-center gap-2 text-xs text-white/60 font-serif mb-6">
            <Link href="/" className="hover:text-white transition-colors">
              Inicio
            </Link>
            <span>/</span>
            <span className="text-white/90">Catálogos</span>
          </nav>
          <h1 className="text-3xl md:text-5xl font-serif font-bold mb-4">Catálogos Bodasesor 2026</h1>
          <p className="text-[#f5efe8] font-serif text-base md:text-lg max-w-2xl mx-auto mb-8">
            {CATALOGOS.length} catálogos de banquetes, barras, mobiliario y producción. Un catálogo por servicio — sin
            duplicados.
          </p>
          <a
            href={WA}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#0d6849] hover:bg-[#0a5740] text-white px-7 py-3.5 rounded-lg font-bold font-serif transition-colors"
          >
            Cotizar por WhatsApp
          </a>
        </div>
      </section>

      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setCategory("todos")}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-serif transition-colors ${
              category === "todos" ? "bg-[#162040] text-white" : "bg-[#f5efe8] text-[#162040] hover:bg-[#ebe3d8]"
            }`}
          >
            Todos ({CATALOGOS.length})
          </button>
          {CATALOGO_CATEGORIES.map((cat) => {
            const count = CATALOGOS.filter((c) => c.category === cat.id).length;
            if (!count) return null;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-serif transition-colors ${
                  category === cat.id ? "bg-[#162040] text-white" : "bg-[#f5efe8] text-[#162040] hover:bg-[#ebe3d8]"
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-5">
        {filtered.map((catalog) => {
          const isOpen = openSlug === catalog.slug;
          const pagePath = getCatalogoPagePath(catalog.slug);
          return (
            <article
              key={catalog.id}
              id={catalog.slug}
              className="border border-[#162040]/10 rounded-2xl overflow-hidden scroll-mt-28"
            >
              <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4 justify-between bg-white">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-[#162040]/50 font-serif mb-1">
                    {CATALOGO_CATEGORIES.find((c) => c.id === catalog.category)?.label || catalog.category}
                  </p>
                  <h2 className="text-xl md:text-2xl font-serif font-bold text-[#162040]">{catalog.title}</h2>
                  {catalog.services?.length > 0 && (
                    <p className="text-sm text-gray-600 font-serif mt-1 line-clamp-2">{catalog.services.join(" · ")}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenSlug(isOpen ? null : catalog.slug);
                      if (!isOpen) {
                        history.replaceState(null, "", `#${catalog.slug}`);
                      }
                    }}
                    className={btnPrimary}
                  >
                    {isOpen ? "Ocultar catálogo" : "Ver catálogo"}
                  </button>
                  <a
                    href={pagePath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={btnSecondary}
                  >
                    Abrir en nueva pestaña
                  </a>
                  <Link href={catalog.relatedHref} className={btnSecondary}>
                    Ver servicio
                  </Link>
                </div>
              </div>
              {isOpen && (
                <div className="px-4 pb-5 md:px-6 md:pb-6">
                  {/* El usuario ya pulsó "Ver catálogo": cargar al estar visible, no los 38 de golpe */}
                  <CatalogEmbed catalog={catalog} mode="lazy" />
                </div>
              )}
            </article>
          );
        })}
      </div>

      <section className="bg-[#162040] py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white font-serif mb-4">
            ¿Listo para cotizar tu evento?
          </h2>
          <p className="text-[#f5efe8] font-serif text-lg mb-8">
            Elige un catálogo y escríbenos. Respuesta en menos de 2 horas.
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
