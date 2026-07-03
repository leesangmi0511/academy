// ROUTETOP service worker — v3 (자동 업데이트)
// 변경점: 화면(HTML)은 항상 네트워크 우선 → 새로고침만으로 최신본. 새 SW 활성화 시 옛 캐시 삭제 + 열린 앱 강제 새로고침.
var SW_VERSION = 'rt-sw-v3';

self.addEventListener('install', function(e){ self.skipWaiting(); });

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){ return Promise.all(keys.map(function(k){ return caches.delete(k); })); }) // 옛 캐시 모두 삭제
      .then(function(){ return self.clients.claim(); })
      .then(function(){ return self.clients.matchAll({type:'window'}); })
      .then(function(cs){ cs.forEach(function(c){ try{ c.navigate(c.url); }catch(_e){} }); }) // 열린 앱 자동 새로고침 → 최신 화면
  );
});

// 페이지(내비게이션) 요청은 항상 네트워크 우선 → 새로고침하면 항상 최신 index.html
self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method === 'GET' && req.mode === 'navigate'){
    e.respondWith(
      fetch(req, {cache:'no-store'}).catch(function(){ return caches.match(req); })
    );
  }
  // 그 외 요청(Firebase, CDN 등)은 그대로 통과
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window'}).then(function(c){
    for(var i=0;i<c.length;i++){ if('focus' in c[i]) return c[i].focus(); }
    return self.clients.openWindow('/academy/');
  }));
});
