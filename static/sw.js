// 최소한의 서비스 워커: PWA 설치 조건 충족용. 오프라인 캐싱은 하지 않는다(실시간 시세 데이터가 필요한 앱이므로).
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { self.clients.claim(); });
self.addEventListener("fetch", () => {});
