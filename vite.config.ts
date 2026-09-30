import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({plugins:[react(),VitePWA({registerType:"autoUpdate",injectRegister:"auto",manifestFilename:"manifest.webmanifest",includeAssets:["pwa-192.png","pwa-512.png"],manifest:{name:"DOG",short_name:"DOG",description:"DOG",id:"/",start_url:"/",scope:"/",lang:"en",dir:"ltr",display:"standalone",orientation:"portrait",theme_color:"#080808",background_color:"#080808",categories:["productivity","utilities"],icons:[{src:"/pwa-192.png",sizes:"192x192",type:"image/png",purpose:"any"},{src:"/pwa-512.png",sizes:"512x512",type:"image/png",purpose:"any maskable"}]},workbox:{cleanupOutdatedCaches:true,navigateFallback:"/index.html"}})]});
