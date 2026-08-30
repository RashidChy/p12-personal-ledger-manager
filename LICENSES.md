# Third-party licences

LofiStack Hackathon 2026 · Team BinaryBros (LSH26-T008) · Problem P12

Every dependency, asset and data file used by this project is listed below with its
licence and source. **No AGPL, GPL, LGPL, MPL, SSPL, other copyleft/weak-copyleft,
non-commercial or personal-use-only licence is used anywhere in this project**, and no
employer or client code is included.

The project's own source code is released under the MIT licence (see `LICENSE`).

## Licence audit summary

The committed `package-lock.json` contains 320 package records excluding the root
project (direct + transitive, runtime + build-time). Every record has a `license` field,
and those fields were inventoried as follows:

| Licence | Packages | Permitted |
| --- | --- | --- |
| MIT | 269 | yes |
| Apache-2.0 | 21 | yes |
| ISC | 14 | yes |
| BSD-2-Clause | 9 | yes |
| BSD-3-Clause | 3 | yes |
| MIT-0 | 1 | yes |
| Python-2.0 | 1 | yes |
| BlueOak-1.0.0 | 1 | yes |
| CC-BY-4.0 | 1 | yes (attribution is included below) |
| GPL / LGPL / AGPL / MPL / SSPL / non-commercial | **0** | — |

Reproduce the audit at any time with:

```bash
node -e "const l=require('./package-lock.json'); const p=Object.entries(l.packages).filter(([k])=>k); const c={}; for(const[,v]of p)c[v.license]=(c[v.license]||0)+1; console.log(p.length,c)"
```

## Runtime dependencies (shipped to the browser)

| Package | Version | Licence | Source |
| --- | --- | --- | --- |
| react | 18.3.1 | MIT | https://github.com/facebook/react |
| react-dom | 18.3.1 | MIT | https://github.com/facebook/react |
| scheduler | 0.23.2 | MIT | https://github.com/facebook/react (transitive) |
| loose-envify | 1.4.0 | MIT | https://github.com/zertosh/loose-envify (transitive) |
| js-tokens | 4.0.0 | MIT | https://github.com/lydell/js-tokens (transitive) |
| tesseract.js | 7.0.0 | Apache-2.0 | https://github.com/naptha/tesseract.js |
| tesseract.js-core | 7.0.0 | Apache-2.0 | https://github.com/naptha/tesseract.js-core |
| bmp-js | 0.1.0 | MIT | https://github.com/shaozilee/bmp-js (transitive) |
| idb-keyval | 6.3.0 | Apache-2.0 | https://github.com/jakearchibald/idb-keyval (transitive) |
| is-url | 1.2.4 | MIT | https://github.com/segmentio/is-url (transitive) |
| node-fetch | 2.7.0 | MIT | https://github.com/node-fetch/node-fetch (transitive, Node-only path) |
| whatwg-url | 5.0.0 | MIT | https://github.com/jsdom/whatwg-url (transitive) |
| tr46 | 0.0.3 | MIT | https://github.com/Sebmaster/tr46.js (transitive) |
| webidl-conversions | 3.0.1 | BSD-2-Clause | https://github.com/jsdom/webidl-conversions (transitive) |
| opencollective-postinstall | 2.0.3 | MIT | https://github.com/opencollective/opencollective-postinstall (transitive) |
| regenerator-runtime | 0.13.11 | MIT | https://github.com/facebook/regenerator (transitive) |
| wasm-feature-detect | 1.9.0 | Apache-2.0 | https://github.com/GoogleChromeLabs/wasm-feature-detect (transitive) |
| zlibjs | 0.3.1 | MIT | https://github.com/imaya/zlib.js (transitive) |

**Tesseract.js licence verification (required by the problem statement):** the licence
of `tesseract.js@7.0.0` was checked at install time with `npm view tesseract.js license`
and in the installed package's `package.json` — both report **Apache-2.0**, which is a
permissive licence that allows commercial use, modification, distribution and
assignment. Its WebAssembly core `tesseract.js-core@7.0.0` is also Apache-2.0. The
upstream Tesseract OCR engine it compiles is Apache-2.0 as well.

## Build and test tooling (not shipped to the browser)

| Package | Version | Licence | Source |
| --- | --- | --- | --- |
| vite | 5.4.x | MIT | https://github.com/vitejs/vite |
| @vitejs/plugin-react | 4.3.x | MIT | https://github.com/vitejs/vite-plugin-react |
| typescript | 5.6.x | Apache-2.0 | https://github.com/microsoft/TypeScript |
| vitest | 2.1.x | MIT | https://github.com/vitest-dev/vitest |
| jsdom | 25.0.x | MIT | https://github.com/jsdom/jsdom |
| eslint | 9.x | MIT | https://github.com/eslint/eslint |
| @eslint/js | 9.x | MIT | https://github.com/eslint/eslint |
| typescript-eslint | 8.x | MIT | https://github.com/typescript-eslint/typescript-eslint |
| eslint-plugin-react-hooks | 5.x | MIT | https://github.com/facebook/react |
| @types/react, @types/react-dom | 18.3.x | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| caniuse-lite (transitive) | 1.0.x | CC-BY-4.0 | https://github.com/browserslist/caniuse-lite — permissive, attribution given here |
| argparse (transitive) | 2.0.1 | Python-2.0 | https://github.com/nodeca/argparse — permissive |
| minimatch (transitive) | 10.x | BlueOak-1.0.0 | https://github.com/isaacs/minimatch — permissive |
| @csstools/color-helpers (transitive) | 5.1.0 | MIT-0 | https://github.com/csstools/postcss-plugins — permissive |

## Data, models and assets

| Asset | Licence / rights | Source |
| --- | --- | --- |
| Official P12 fixture (`public/data/fixtures/P12.json`, `src/data/P12.fixture.json`) | Provided by the hackathon organisers for this event; stored unmodified | https://live.hackathon.lofistack.com/api/fixtures/P12?teamId=LSH26-T008 |
| English OCR model (`public/ocr/lang/eng.traineddata` and `eng.traineddata.gz`) | Apache-2.0 | https://github.com/tesseract-ocr/tessdata_fast (compressed copy served by https://tessdata.projectnaptha.com/4.0.0_fast/) |
| Tesseract worker + WASM core (`public/ocr/worker.min.js`, `public/ocr/core/*`) | Apache-2.0 | copied at build time from the installed `tesseract.js` / `tesseract.js-core` packages |
| Sample receipt images (`public/sample-receipts/*.png`) | Original work of this team, MIT | generated by `scripts/make-sample-receipts.py`; entirely synthetic, no real receipt, no personal data |
| Favicon (`public/favicon.svg`) | Original work of this team, MIT | hand-written SVG, no third-party icon set |
| Fonts | None bundled | The UI uses system font stacks only (`system-ui`, `-apple-system`, `Segoe UI`, Roboto, Helvetica, Arial). No web font is downloaded or embedded. DejaVu fonts are used only by the development-time receipt generator on the developer's machine, not shipped. |
| Icons | None bundled | The few glyphs used (`৳`, `🧾`, `✓`, `!`, `×`) are Unicode characters rendered by the system font, not an icon library. |
| CSS framework / UI template | None | `src/styles.css` is hand-written for this project; no template, theme or component library was used. |
| Charting library | None | Category and progress visualisations are plain CSS bars with ARIA `meter` semantics. |

## Development-only tooling on the developer machine

| Tool | Licence | Note |
| --- | --- | --- |
| Pillow (Python) | HPND / MIT-CMU style (permissive) | used only by `scripts/make-sample-receipts.py` to generate the synthetic demo receipts; not a project dependency and not shipped |
| DejaVu fonts | DejaVu licence (permissive, Bitstream Vera derived) | used only to rasterise the synthetic demo receipts; not shipped |

## AI tools

OpenAI Codex was used for architecture, implementation, refactoring, tests, review and
documentation. The team reviewed its output and verified it through automated tests,
TypeScript, ESLint, production builds and browser walkthroughs. The structured disclosure
is also recorded in `evaluation-manifest.json`.

## Original-work statement

All application source code in this repository was written for this hackathon by
Team BinaryBros with AI assistance (permitted by the event rules). No code was copied
from articles, blogs, Stack Overflow answers or third-party repositories without a
verified permissive licence. No employer or client code is included. No asset lacking
commercial reuse rights is included.
