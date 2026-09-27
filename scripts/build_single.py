#!/usr/bin/env python3
"""
Genera un único HTML autocontenido (CSS y JS en línea) en dist/sala-3d.html.
Útil para compartir el configurador como un solo archivo o abrirlo sin servidor.

    python3 scripts/build_single.py            # HTML completo
    python3 scripts/build_single.py --fragment # sin <html>/<head>/<body> (para incrustar)
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODULES = ['js/config.js', 'js/textures.js', 'js/info.js', 'js/main.js']   # orden de dependencias


def bundle_js():
    parts = []
    for rel in MODULES:
        src = (ROOT / rel).read_text(encoding='utf-8')
        src = re.sub(r"^import \{[^}]*\} from '\./[^']+';\n", '', src, flags=re.M)  # imports locales
        src = re.sub(r'^export (const|function|let|class) ', r'\1 ', src, flags=re.M)
        parts.append(f'/* ── {rel} ── */\n{src}')
    return '\n'.join(parts)


def main():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'css/styles.css').read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="css/styles.css">', f'<style>\n{css}</style>')
    # En el archivo único three.js se carga del CDN (los módulos locales no se abren con doble clic)
    html = html.replace('"three":"./vendor/three/build/three.module.min.js","three/addons/":"./vendor/three/examples/jsm/"',
                        '"three":"https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.min.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/"')
    html = html.replace('<link rel="icon" href="favicon.svg" type="image/svg+xml">', '')
    html = html.replace('<script type="module" src="js/main.js"></script>', f'<script type="module">\n{bundle_js()}</script>')
    if '--fragment' in sys.argv:
        head = re.search(r'<head>(.*)</head>', html, re.S).group(1)
        head = re.sub(r'<meta charset[^>]*>\n|<meta name="viewport"[^>]*>\n', '', head)
        body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
        html = head.strip() + '\n' + body.strip() + '\n'
    out = ROOT / 'dist' / ('sala-3d.fragment.html' if '--fragment' in sys.argv else 'sala-3d.html')
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding='utf-8')
    print(f'OK → {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
