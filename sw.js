self.addEventListener('install',function(e){self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim());});
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window'}).then(function(c){
    for(var i=0;i<c.length;i++){if('focus' in c[i])return c[i].focus();}
    return self.clients.openWindow('/academy/');
  }));
});
