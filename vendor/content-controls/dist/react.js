'use client';
import{useCallback as n,useSyncExternalStore as r}from"react";function i(e){let t=n((o)=>e.subscribe(o),[e]);return r(t,e.getVersion,e.getVersion),e.getSnapshot()}export{i as useContentStore};
