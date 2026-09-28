# Third-party notices

Original Aurex code is copyright © 2026 Oorjit Sethi; all rights are reserved unless separately licensed. No general open-source license is granted for the original code at this time.

## Vendored source

**JSON for Modern C++ (nlohmann/json), version 3.11.3**

- Author: Niels Lohmann and contributors
- Source: https://github.com/nlohmann/json/tree/v3.11.3
- License: MIT
- Vendored file: `engine/vendor/json.hpp`
- Full license: [`engine/vendor/LICENSE.nlohmann-json`](engine/vendor/LICENSE.nlohmann-json)

The vendored header retains its upstream notices. Its MIT license applies to that component independently of Aurex's original code.

## Installed dependencies

React, React DOM, TypeScript, Vite, Lucide, FastAPI, Uvicorn, Pydantic, and their dependencies are installed by package managers rather than vendored here. See `web/package-lock.json` and `backend/requirements.lock.txt` for the exact dependency inventory; each package retains its own distributed license and notices.

## Fonts

The interface requests **DM Sans** and **Manrope** through Google Fonts. They are distributed under the SIL Open Font License by their respective authors. Font files are not included in this repository, and the interface falls back to system fonts when unavailable.
