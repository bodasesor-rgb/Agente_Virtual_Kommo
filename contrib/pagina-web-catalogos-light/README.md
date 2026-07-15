# Catálogos más livianos (Pagina-Web-Bodasesor)

Apply on https://github.com/bodasesor-rgb/Pagina-Web-Bodasesor

Issue: https://github.com/bodasesor-rgb/Pagina-Web-Bodasesor/issues/40

```bash
cd Pagina-Web-Bodasesor
git checkout -b cursor/catalogos-lighter-gamma-fd12
git apply path/to/0001-perf-catalogos-click-to-load-para-embeds-Gamma-y-sin.patch
# Or copy:
#   CatalogEmbed.tsx → src/components/
#   CatalogoDetailPage.tsx → src/pages/
#   CatalogosPage.tsx → src/pages/
#   index.html → root
git add -A && git commit -m "perf(catalogos): click-to-load Gamma"
git push -u origin HEAD
```

What changes:
- Detail pages no longer eager-load Gamma (~600KB+)
- Click "Ver catálogo visual" to load the embed
- Non-home routes skip hero image preload/download
