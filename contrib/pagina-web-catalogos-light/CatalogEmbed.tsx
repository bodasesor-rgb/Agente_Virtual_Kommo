import { useEffect, useRef, useState } from "react";

type CatalogoEmbedData = {
  title: string;
  provider: string;
  embedSrc: string;
};

type LoadMode = "click" | "lazy" | "eager";

/**
 * Embed de catálogo — Gamma/Canva pesan ~600KB+ por iframe.
 * Por defecto: click-to-load (no pide el recurso externo hasta que el usuario lo pide).
 * Nunca enlazamos a gamma.app / canva edit.
 */
export default function CatalogEmbed({
  catalog,
  mode,
  eager = false,
  minHeight,
}: {
  catalog: CatalogoEmbedData;
  /** click = poster + botón (recomendado). lazy = IntersectionObserver. eager = inmediato. */
  mode?: LoadMode;
  /** @deprecated usa mode="eager" */
  eager?: boolean;
  minHeight?: number;
}) {
  const resolvedMode: LoadMode = mode ?? (eager ? "eager" : "click");
  const ref = useRef<HTMLDivElement>(null);
  const height = minHeight ?? (catalog.provider === "canva" ? 640 : 720);
  const [activated, setActivated] = useState(resolvedMode === "eager");
  const [inView, setInView] = useState(resolvedMode === "eager");

  useEffect(() => {
    if (resolvedMode !== "lazy" || activated) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [resolvedMode, activated]);

  const showIframe =
    activated || (resolvedMode === "lazy" && inView) || resolvedMode === "eager";

  return (
    <div
      ref={ref}
      className="w-full bg-[#f5efe8] rounded-xl overflow-hidden border border-[#162040]/10"
    >
      {showIframe ? (
        <iframe
          src={catalog.embedSrc}
          title={`Catálogo ${catalog.title} | Bodasesor`}
          className="w-full border-0"
          style={{ height }}
          allow="fullscreen"
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
        />
      ) : (
        <button
          type="button"
          onClick={() => setActivated(true)}
          className="group relative flex w-full flex-col items-center justify-center gap-4 px-6 py-14 text-center transition-colors hover:bg-[#ebe3d8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#162040] focus-visible:ring-offset-2"
          style={{ minHeight: Math.min(height, 320) }}
          aria-label={`Cargar catálogo visual de ${catalog.title}`}
        >
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#162040] text-white shadow-sm transition-transform group-hover:scale-105">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5L8 5.5Z" fill="currentColor" />
            </svg>
          </span>
          <span className="max-w-md">
            <span className="block font-serif text-lg font-bold text-[#162040] md:text-xl">
              Ver catálogo visual
            </span>
            <span className="mt-1 block font-serif text-sm text-[#162040]/65">
              {catalog.title} — se carga al tocar (contenido externo bajo demanda)
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
