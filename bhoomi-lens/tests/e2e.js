/* End-to-end UI scenarios in jsdom with a MapLibre stub. Setup: npm i jsdom@24, then: node bhoomi-lens/tests/e2e.js */
const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('path').join('/home/user/app','index.html'),'utf8').replace(/<script[^>]*><\/script>/g,'');
const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/'});
const w=dom.window;
const errs=[];w.addEventListener('error',e=>errs.push(e.message));
// maplibre stub
w.eval(`
class LB{constructor(a,b){this.e=false;if(a)this.extend(a)}extend(p){this.e=true;return this}isEmpty(){return !this.e}}
class Src{constructor(d){this.d=d}setData(d){this.d=d}}
class M{constructor(o){this.h={};this.srcs={};this.layers={};window.__map=this;this.doubleClickZoom={disable(){},enable(){}};this._c=document.createElement('canvas');setTimeout(()=>this.fire('load'),0)}
 addControl(){} on(ev,a,b){const k=b?ev+':'+a:ev;(this.h[k]=this.h[k]||[]).push(b||a)} fire(k,e){(this.h[k]||[]).forEach(f=>f(e||{}))}
 addSource(id,s){this.srcs[id]=new Src(s.data)} getSource(id){return this.srcs[id]} addLayer(l){this.layers[l.id]=l}
 setFeatureState(){} getStyle(){return {layers:[{id:'water',type:'fill'},{id:'place',type:'symbol'}]}} getLayer(id){return this.layers[id]} getBounds(){return {getWest:()=>78.2,getEast:()=>78.7,getNorth:()=>17.6,getSouth:()=>17.2}} setStyle(){} setPaintProperty(){} setLayoutProperty(){} setFilter(){} getCanvas(){return this._c} flyTo(){} fitBounds(){} easeTo(){} getZoom(){return window.__z||5}
 queryRenderedFeatures(p,o){return (o&&o.layers&&o.layers.includes('verified'))?[]:[{id:5,properties:{id:5}}]}}
class Mk{constructor(o){this.el=(o&&o.element)||document.createElement('div')}setLngLat(){return this}addTo(){return this}remove(){} getElement(){return this.el}}
class Pp{setLngLat(){return this}setHTML(){return this}addTo(){return this}remove(){} isOpen(){return true}}
window.maplibregl={Map:M,Marker:Mk,Popup:Pp,LngLatBounds:LB,NavigationControl:class{},ScaleControl:class{}};
window.performance=window.performance||{now:()=>Date.now()};
window.open=()=>({document:{write(){},close(){}}});
URL.createObjectURL=()=>'blob:x';URL.revokeObjectURL=()=>{};
`);
for(const f of ['data/districts.js','data/states.js','data/overrides.js','js/data.js','data/projects.js','data/verified.js','data/tn_villages.js','data/evidence.js','data/backtest.js','js/engine.js','js/charts.js','js/app.js']){
 try{w.eval(fs.readFileSync(require('path').join('/home/user/app',f),'utf8'))}catch(e){console.log('LOAD ERR',f,e.stack);process.exit(1)}}
const step=(name,fn)=>{try{fn();console.log('ok',name)}catch(e){console.log('FAIL',name,e.stack.split('\n').slice(0,4).join(' | '))}};
setTimeout(()=>{
 const d=w.document,map=w.__map,click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 step('loaded',()=>{if(!w.BhoomiLens)throw new Error('no app')});
 step('layers',()=>{for(const b of d.querySelectorAll('#layerSeg button'))click(b)});
 step('tools',()=>{for(const b of d.querySelectorAll('#rail button[data-tool]')){click(b);if(!d.querySelector('#panelBody').innerHTML.length)throw new Error('empty '+b.dataset.tool)}});
 step('detail',()=>{map.fire('click',{lngLat:{lng:77,lat:28},point:{x:1,y:1}});const od=d.querySelector('#detailBody [data-act="open-d"]');if(!od)throw new Error('no district link on spot card');click(od);if(!d.querySelector('#detailBody h1'))throw new Error('no detail')});
 step('detail acts',()=>{for(const a of ['star','cmp','report'])click(d.querySelector(`#detailBody [data-act="${a}"]`))});
 step('radius',()=>{click(d.querySelector('#detailBody [data-act="radius"]'));if(!d.querySelector('#panelBody').textContent.includes('Median'))throw new Error('no area')});
 step('area csv',()=>click(d.querySelector('[data-act="area-csv"]')));
 step('draw poly',()=>{w.BhoomiLens.S.tool='draw';click(d.querySelector('[data-act="draw-mode"][data-mode="poly"]'));[[77,28],[77.5,28],[77.5,28.5]].forEach(p=>map.fire('click',{lngLat:{lng:p[0],lat:p[1]}}));map.fire('mousemove',{lngLat:{lng:77.2,lat:28.6}});map.fire('dblclick',{preventDefault(){}});});
 step('draw circle',()=>{click(d.querySelector('[data-act="draw-mode"][data-mode="circle"]'));map.fire('click',{lngLat:{lng:80,lat:13}});map.fire('mousemove',{lngLat:{lng:80.2,lat:13}});map.fire('click',{lngLat:{lng:80.2,lat:13}})});
 step('sim point',()=>{w.BhoomiLens.S.tool=null;click(d.querySelector('#rail [data-tool="simulate"]'));click(d.querySelector('[data-act="sim-type"][data-t="airport"]'));click(d.querySelector('[data-act="sim-place"]'));map.fire('click',{lngLat:{lng:78,lat:21}});if(!d.querySelector('#panelBody').textContent.includes('Most affected'))throw new Error('no sim')});
 step('sim line',()=>{click(d.querySelector('[data-act="sim-type"][data-t="metro"]'));click(d.querySelector('[data-act="sim-place"]'));map.fire('click',{lngLat:{lng:77,lat:28}});map.fire('mousemove',{lngLat:{lng:77.1,lat:28.1}});map.fire('click',{lngLat:{lng:77.2,lat:28.2}});click(d.querySelector('[data-act="sim-finish"]'));console.log('   userCats',w.BhoomiLens.S.userCats.length,'layer',w.BhoomiLens.S.layer)});
 step('sim ring',()=>{click(d.querySelector('[data-act="sim-type"][data-t="ring"]'));click(d.querySelector('[data-act="sim-place"]'));map.fire('click',{lngLat:{lng:75,lat:22}})});
 step('sim remove',()=>click(d.querySelector('[data-act="sim-remove"]')));
 step('sim clear',()=>click(d.querySelector('[data-act="sim-clear"]')));
 step('year',()=>{const y=d.querySelector('#year');y.value=2033;y.dispatchEvent(new w.Event('input'));y.value=2016;y.dispatchEvent(new w.Event('input'))});
 step('scenario',()=>{const s=d.querySelector('#scenario');s.value='bear';s.dispatchEvent(new w.Event('change'));const h=d.querySelector('#horizon');h.value='10';h.dispatchEvent(new w.Event('change'))});
 step('toggles',()=>['#btn3d','#btnSat','#btnHeat','#btnProj','#btnTint','#btnTint','#btnProj'].forEach(s=>click(d.querySelector(s))));
 step('year banner',()=>{const y=d.querySelector('#year');y.value=2031;y.dispatchEvent(new w.Event('input'));if(d.querySelector('#yearBanner').classList.contains('hidden'))throw new Error('no banner');click(d.querySelector('#yearReset'));if(!d.querySelector('#yearBanner').classList.contains('hidden'))throw new Error('banner stuck')});
 step('catalysts filter',()=>{click(d.querySelector('#rail [data-tool="catalysts"]'));const s=d.querySelector('#catType');s.value='airport';s.dispatchEvent(new w.Event('change',{bubbles:true}));click(d.querySelector('[data-act="fly-cat"]'))});
 step('screener',()=>{click(d.querySelector('#rail [data-tool="screener"]'));const s=d.querySelector('#scrSort');s.value='cheap';s.dispatchEvent(new w.Event('change',{bubbles:true}));click(d.querySelector('[data-act="csv"]'))});
 step('compare/watch',()=>{click(d.querySelector('#rail [data-tool="compare"]'));click(d.querySelector('#rail [data-tool="watchlist"]'));console.log('   ',d.querySelector('#panelBody').textContent.slice(0,120))});
 step('palette',()=>{click(d.querySelector('#searchBtn'));const i=d.querySelector('#paletteInput');i.value='pune';i.dispatchEvent(new w.Event('input'));i.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter'}))});
 step('keys',()=>{for(const k of ['2','d','Escape','s','Escape','c','Escape'])d.dispatchEvent(new w.KeyboardEvent('keydown',{key:k}))});
 step('quick area',()=>{click(d.querySelector('#rail [data-tool="draw"]'));const b=d.querySelector('[data-act="clear-area"]');if(b)click(b);click(d.querySelector('[data-act="quick-area"]'))});
 step('grid',()=>{w.__z=9;map.fire('moveend');});
 step('location click',()=>{w.__z=9;map.fire('click',{lngLat:{lng:78.35,lat:17.40},point:{x:1,y:1}});if(!d.querySelector('#detailBody').textContent.includes('Plot-level'))throw new Error('no loc');console.log('   ',d.querySelector('#detailBody').textContent.replace(/\s+/g,' ').slice(0,400))});
 step('loc radius',()=>click(d.querySelector('[data-act="loc-radius"][data-r="5"]')));
 step('verified popup',()=>{const v=d.querySelector('#detailBody [data-act="verified"]');if(v)click(v)});
 step('real chip',()=>{click(d.querySelector('#btnReal'));click(d.querySelector('#btnReal'))});
 step('method',()=>{click(d.querySelector('#rail [data-tool="method"]'));console.log('   ',d.querySelector('#panelBody').textContent.replace(/\s+/g,' ').slice(0,300))});
 step('radius slider',()=>{w.BhoomiLens.S.tool=null;click(d.querySelector('#rail [data-tool="draw"]'));click(d.querySelector('[data-act="set-radius"][data-r="25"]'));click(d.querySelector('[data-act="draw-mode"][data-mode="circle"]'));map.fire('mousemove',{lngLat:{lng:78,lat:17}});map.fire('click',{lngLat:{lng:78,lat:17}})});

 const ms=w.BhoomiLens.models;console.log('opp max',Math.max(...ms.map(m=>m.opp)),'min',Math.min(...ms.map(m=>m.opp)),'cats',w.BL.CATALYSTS.length);
 setTimeout(()=>{console.log('   grid cells',map.srcs.grid.d.features.length, 'layer',w.BhoomiLens.S.layer);console.log('errors',errs);process.exit(0)},600); return;
 const m=w.BhoomiLens.models; console.log('detail sample:',d.querySelector('#detailBody').textContent.replace(/\s+/g,' ').slice(0,300));
 process.exit(0)},300);
