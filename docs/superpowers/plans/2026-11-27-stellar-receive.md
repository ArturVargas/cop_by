# Recibir: QR y compartir cuenta

Scope approved in chat: add a local QR and native sharing to the existing Stellar Recibir screen. Preserve copy, full address, issuer and Testnet warnings. No payment amount or external QR service.

- [x] QR: encode the exact G address as an accessible SVG, four-module quiet zone, responsive at 320px. Load the panel only when Recibir opens. Unit tests cover accessible metadata and account replacement.
- [ ] Sharing: native text share includes account and network; unsupported platforms copy the account; cancellation remains silent and failures are actionable. Preserve existing Copiar cuenta behavior.
- [ ] Verification: unit suite, type-check, QR decode, mobile/desktop, share/cancel/error/copy fallback and account changes. Commit each change, push, build Cloudflare, deploy and verify live assets.
