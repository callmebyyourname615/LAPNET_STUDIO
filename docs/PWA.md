# LAPNet Studio Portal desktop app

The Portal is installable as an online PWA. The manifest launches `/dashboard` in a separate `standalone` window, with a stable app identity, name, theme and 192/512 px icons. Portal and Document share the install button in their header. Login, sessions, CSRF and resource permissions use the existing APIs.

## Install

1. Open the normal Portal address, for example `http://localhost:5173`, and sign in.
2. Select **ຕິດຕັ້ງແອັບ** in the header. When Chrome/Edge provides an install prompt, the button opens it directly. Otherwise, the button explains installation through the browser menu/address-bar icon. Browser promotion may require prior engagement and is unavailable in private browsing.
3. Confirm in the browser, then open **LAPNet Studio Portal** from the operating system's application launcher. The install action is hidden in the standalone window.

Safari on supported Macs also offers **File → Add to Dock**. Use the same hostname and port that you normally use; `localhost`, `127.0.0.1` and different ports are separate app origins.

This app needs a running web server, API and database. Local loopback development works over HTTP; a remote deployment needs HTTPS for browser install promotion. Installing the PWA does not start the local development servers automatically.

No service worker or offline document cache is introduced. Installation alone does not provide offline access; user data and document downloads continue to require the server. Service workers are optional for modern browser installability, and were omitted because this feature only needs an online desktop window.

## Implementation and verification

- `public/manifest.webmanifest`: application identity, start URL, scope and standalone display.
- `public/icons/app-icon.svg`: source artwork for the checked-in 192/512 PNG icons.
- `index.html` and `.figma/make/site.json`: manifest, theme, touch icon and favicon.
- `InstallAppProvider`: captures the native event before authentication completes, tracks standalone/install state and cleans up listeners.
- `InstallAppButton`: consumes each native prompt once, handles cancellation/failure and offers keyboard-accessible fallback help.

`pnpm build:web` includes the manifest/icons in `dist`; the existing web container copies that directory. No new package or backend endpoint is required.

Playwright checks cover native Chrome manifest/installability validation in a temporary regular browser profile, prompt flow simulations, cancellation, errors, focus return, responsive headers, standalone detection, login protection and absence of offline data caches. Results: `output/playwright/pwa-browser-results.json`. OS installation/launch and production HTTPS deployment have not been performed by the agent.

References: [Chrome install criteria](https://web.dev/articles/install-criteria), [MDN installability and optional service workers](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Safari web apps on Mac](https://support.apple.com/en-gb/104996).
