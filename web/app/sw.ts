import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // Navigation preload is OFF on purpose. With it on, the SW issues a second
  // parallel request for each navigation; on /auth/callback that double-consumes
  // the single-use OAuth `code`, so the second exchange fails and re-login after
  // logout broke with a 500. Auth routes below are also NetworkOnly so the SW
  // never caches or serves them — they must always hit the network fresh.
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ url }) =>
        url.pathname === "/login" || url.pathname.startsWith("/auth"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

// Phase 5 will add: self.addEventListener("push", ...) here
