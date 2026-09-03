/* Карта корпуса: планы этажей из aitumap. Ищет кабинет по номеру и показывает,
   где он находится — мини-картой в карточке пары и на весь экран. */
window.CampusMap = (function(){
"use strict";

var DATA=null, loading=null;
var KIND_COLOR={
  rooms:"#4c8dff", lab:"#a855f7", club:"#ec4899", office:"#14b8a6", hall:"#f59e0b",
  dining:"#f97316", library:"#eab308", wcs:"#64748b", techs:"#475569",
  stairs:"#22c55e", escapes:"#16a34a", gym:"#0ea5e9", other:"#94a3b8"
};
var SVGNS="http://www.w3.org/2000/svg";

function load(){
  if(DATA) return Promise.resolve(DATA);
  if(!loading) loading=fetch("map/floors.json").then(function(r){ return r.json(); })
    .then(function(d){ DATA=d; return d; });
  return loading;
}
/* тихо подгружаем данные, пока пользователь смотрит расписание */
if(window.requestIdleCallback) requestIdleCallback(function(){ load().catch(function(){}); });
else setTimeout(function(){ load().catch(function(){}); }, 2500);

function el(tag,cls,html){ var n=document.createElement(tag); if(cls)n.className=cls;
  if(html!=null)n.innerHTML=html; return n; }
function s(tag,attrs){ var n=document.createElementNS(SVGNS,tag);
  for(var k in attrs) if(attrs[k]!=null) n.setAttribute(k,attrs[k]); return n; }
function esc(x){ return String(x==null?"":x).replace(/[&<>"]/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }
function norm(x){ return String(x||"").toLowerCase().replace(/\s+/g,"").replace(/^c1\./,""); }
function color(k){ return KIND_COLOR[k]||KIND_COLOR.other; }

function bbox(poly){
  var x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  poly.forEach(function(p){ x1=Math.min(x1,p[0]); y1=Math.min(y1,p[1]);
                            x2=Math.max(x2,p[0]); y2=Math.max(y2,p[1]); });
  return {x:x1,y:y1,w:x2-x1,h:y2-y1,cx:(x1+x2)/2,cy:(y1+y2)/2};
}
/* поиск кабинета по номеру, названию или синониму */
function find(query){
  if(!DATA||!query) return null;
  var q=norm(query);
  for(var i=0;i<DATA.floors.length;i++){
    var f=DATA.floors[i];
    for(var j=0;j<f.rooms.length;j++){
      var r=f.rooms[j];
      if(norm(r.id)===q || norm(r.title)===q ||
         (r.alt||[]).some(function(a){ return norm(a)===q; })) return {room:r,floor:f};
    }
  }
  for(i=0;i<DATA.floors.length;i++){                 /* мягкое совпадение */
    var f2=DATA.floors[i];
    for(j=0;j<f2.rooms.length;j++)
      if(norm(f2.rooms[j].id).indexOf(q)>=0) return {room:f2.rooms[j],floor:f2};
  }
  return null;
}
function search(query,limit){
  if(!DATA) return [];
  var q=norm(query), out=[];
  DATA.floors.forEach(function(f){
    f.rooms.forEach(function(r){
      var hay=norm(r.id)+" "+norm(r.title)+" "+(r.alt||[]).map(norm).join(" ");
      if(!q || hay.indexOf(q)>=0) out.push({room:r,floor:f});
    });
  });
  out.sort(function(a,b){ return norm(a.room.id).indexOf(q)-norm(b.room.id).indexOf(q); });
  return out.slice(0,limit||40);
}
function label(r){ return r.title || r.id.replace(/^C1\./,""); }

/* ---------- отрисовка плана ---------- */
function drawFloor(floor, opts){
  opts=opts||{};
  var g=s("g",null);
  floor.shapes.forEach(function(sh){
    g.appendChild(s(sh.closed?"polygon":"polyline",{
      points:sh.p.map(function(p){return p.join(",");}).join(" "),
      "class":"mp-sh"+(sh.closed?" fill":"")}));
  });
  floor.rooms.forEach(function(r){
    var on=opts.highlight && r===opts.highlight;
    var p=s("polygon",{points:r.poly.map(function(q){return q.join(",");}).join(" "),
      "class":"mp-room"+(on?" hl":""), fill:color(r.kind)+(on?"":"33"),
      stroke:color(r.kind), "data-id":r.id});
    if(opts.onPick) p.addEventListener("click",function(e){ e.stopPropagation(); opts.onPick(r,floor); });
    g.appendChild(p);
  });
  if(opts.labels!==false){
    floor.rooms.forEach(function(r){
      var b=bbox(r.poly);
      if(b.w<14 && b.h<14 && !(opts.highlight===r)) return;
      var t=s("text",{x:b.cx, y:b.cy+1.4, "class":"mp-txt"+(opts.highlight===r?" hl":"")});
      t.textContent=r.id.replace(/^C1\.\d\./,"").replace(/^C1\./,"");
      g.appendChild(t);
    });
  }
  if(opts.highlight){
    var b2=bbox(opts.highlight.poly);
    var ring=s("circle",{cx:b2.cx, cy:b2.cy, r:Math.max(b2.w,b2.h)/2+5, "class":"mp-ring"});
    g.appendChild(ring);
  }
  return g;
}

/* ---------- мини-карта в карточке пары ---------- */
function mini(host, roomQuery){
  host.innerHTML='<div class="mp-load">Загружаю карту…</div>';
  load().then(function(){
    var hit=find(roomQuery);
    if(!hit){
      host.innerHTML='<div class="mp-none">Кабинета <b>'+esc(roomQuery)+
        "</b> нет на плане корпуса C1</div>";
      return;
    }
    var b=bbox(hit.room.poly);
    var pad=Math.max(b.w,b.h)*1.5+26;
    var vb=[b.cx-(b.w/2+pad), b.cy-(b.h/2+pad*0.62), b.w+pad*2, b.h+pad*1.24];
    var svg=s("svg",{viewBox:vb.join(" "), "class":"mp-svg",
      preserveAspectRatio:"xMidYMid slice"});
    svg.appendChild(drawFloor(hit.floor,{highlight:hit.room}));
    host.innerHTML="";
    host.appendChild(svg);
    var cap=el("button","mp-open",
      '<span>'+hit.floor.level+" этаж · "+esc(hit.room.id.replace(/^C1\./,""))+"</span>"+
      "<b>Открыть карту</b>");
    cap.onclick=function(){ open(roomQuery); };
    host.appendChild(cap);
    host.classList.add("ready");
  }).catch(function(e){
    host.innerHTML='<div class="mp-none">Карта недоступна</div>';
  });
}

/* ---------- карта на весь экран ---------- */
var view=null, state={floor:1, sel:null, vb:null};

function build(){
  if(view) return view;
  view=el("div","mapview");
  view.innerHTML=
    '<div class="mv-top">'+
      '<div class="mv-search"><input id="mvq" type="search" placeholder="Кабинет: 2.232P, актовый зал…" autocomplete="off"></div>'+
      '<div class="mv-floors" id="mvFloors"></div>'+
      '<button class="mv-x" id="mvClose" aria-label="Закрыть">'+
        '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'+
    "</div>"+
    '<div class="mv-body"><svg id="mvSvg"></svg>'+
      '<div class="mv-results" id="mvRes" hidden></div>'+
      '<div class="mv-info" id="mvInfo" hidden></div>'+
      '<div class="mv-hint">Колесо или щипок — масштаб, перетаскивание — сдвиг</div>'+
    "</div>";
  document.body.appendChild(view);

  view.querySelector("#mvClose").onclick=close;
  var q=view.querySelector("#mvq");
  q.addEventListener("input",function(){ results(q.value); });
  q.addEventListener("keydown",function(e){
    if(e.key==="Enter"){ var r=search(q.value,1)[0]; if(r) pick(r.room,r.floor,true); }
    if(e.key==="Escape"){ q.value=""; results(""); q.blur(); }
  });
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape" && view && view.classList.contains("open")) close();
  });
  panzoom(view.querySelector("#mvSvg"));
  window.addEventListener("resize",function(){
    if(view.classList.contains("open")) render(true);
  });
  return view;
}
function floorsBar(){
  var host=view.querySelector("#mvFloors"); host.innerHTML="";
  DATA.floors.forEach(function(f){
    var b=el("button",f.level===state.floor?"on":"",f.level+" этаж");
    b.onclick=function(){ state.floor=f.level; state.sel=null; render(true); };
    host.appendChild(b);
  });
}
/* приводим область просмотра к пропорциям экрана, чтобы не было пустых полей */
function fitAspect(box){
  var r=view.querySelector("#mvSvg").getBoundingClientRect();
  var ar=(r.width||1)/(r.height||1);
  var x=box[0], y=box[1], w=box[2], h=box[3];
  if(w/h > ar){ var nh=w/ar; y-=(nh-h)/2; h=nh; }
  else        { var nw=h*ar; x-=(nw-w)/2; w=nw; }
  return [x,y,w,h];
}
function render(fit){
  var svg=view.querySelector("#mvSvg");
  var f=DATA.floors.filter(function(x){ return x.level===state.floor; })[0];
  svg.innerHTML="";
  svg.appendChild(drawFloor(f,{highlight:state.sel, onPick:function(r){ pick(r,f,false); }}));
  floorsBar();
  if(fit){
    var vb=DATA.viewBox;
    if(state.sel){
      var b=bbox(state.sel.poly), pad=Math.max(b.w,b.h)*1.9+34;
      state.vb=fitAspect([b.cx-b.w/2-pad, b.cy-b.h/2-pad, b.w+pad*2, b.h+pad*2]);
    } else state.vb=fitAspect([vb[0]-8, vb[1]-8, vb[2]+16, vb[3]+16]);
    apply();
  }
  info();
}
function apply(){
  var svg=view.querySelector("#mvSvg");
  svg.setAttribute("viewBox", state.vb.join(" "));
}
function info(){
  var host=view.querySelector("#mvInfo");
  if(!state.sel){ host.hidden=true; return; }
  var r=state.sel;
  host.hidden=false;
  host.innerHTML='<b>'+esc(r.id.replace(/^C1\./,""))+"</b>"+
    (r.title?"<span>"+esc(r.title)+"</span>":"")+
    "<i>"+state.floor+" этаж · Главный корпус</i>";
}
function results(q){
  var host=view.querySelector("#mvRes");
  if(!q || !q.trim()){ host.hidden=true; return; }
  var list=search(q,24);
  host.hidden=false;
  if(!list.length){ host.innerHTML='<div class="mv-empty">Ничего не найдено</div>'; return; }
  host.innerHTML="";
  list.forEach(function(x){
    var b=el("button",null,
      '<b>'+esc(x.room.id.replace(/^C1\./,""))+"</b>"+
      (x.room.title?"<span>"+esc(x.room.title)+"</span>":"")+
      "<i>"+x.floor.level+" эт.</i>");
    b.onclick=function(){ pick(x.room,x.floor,true); host.hidden=true; };
    host.appendChild(b);
  });
}
function pick(room,floor,zoom){
  state.floor=floor.level; state.sel=room;
  render(!!zoom);
  if(!zoom){ info(); }
}
function panzoom(svg){
  svg.addEventListener("wheel",function(e){
    e.preventDefault();
    var r=svg.getBoundingClientRect();
    var mx=state.vb[0]+(e.clientX-r.left)/r.width*state.vb[2];
    var my=state.vb[1]+(e.clientY-r.top)/r.height*state.vb[3];
    var k=e.deltaY>0?1.15:1/1.15;
    var w=Math.max(24, Math.min(DATA.viewBox[2]*1.6, state.vb[2]*k));
    var sc=w/state.vb[2];
    state.vb=[mx-(mx-state.vb[0])*sc, my-(my-state.vb[1])*sc, w, state.vb[3]*sc];
    apply();
  },{passive:false});

  var drag=null, pinch=null;
  svg.addEventListener("pointerdown",function(e){
    drag={x:e.clientX,y:e.clientY,vb:state.vb.slice()};
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove",function(e){
    if(!drag) return;
    var r=svg.getBoundingClientRect();
    state.vb=[drag.vb[0]-(e.clientX-drag.x)/r.width*drag.vb[2],
              drag.vb[1]-(e.clientY-drag.y)/r.height*drag.vb[3], drag.vb[2], drag.vb[3]];
    apply();
  });
  svg.addEventListener("pointerup",function(){ drag=null; });
  svg.addEventListener("pointercancel",function(){ drag=null; });

  svg.addEventListener("touchmove",function(e){
    if(e.touches.length!==2) return;
    e.preventDefault();
    var a=e.touches[0], b=e.touches[1];
    var d=Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
    if(!pinch){ pinch={d:d, vb:state.vb.slice()}; return; }
    var k=pinch.d/d;
    var w=Math.max(24, Math.min(DATA.viewBox[2]*1.6, pinch.vb[2]*k));
    var cx=pinch.vb[0]+pinch.vb[2]/2, cy=pinch.vb[1]+pinch.vb[3]/2;
    var h=pinch.vb[3]*(w/pinch.vb[2]);
    state.vb=[cx-w/2, cy-h/2, w, h]; apply();
  },{passive:false});
  svg.addEventListener("touchend",function(){ pinch=null; drag=null; });
}
function open(roomQuery){
  load().then(function(){
    build();
    var hit=roomQuery?find(roomQuery):null;
    state.sel=hit?hit.room:null;
    state.floor=hit?hit.floor.level:(state.floor||1);
    view.classList.add("open");
    document.body.classList.add("locked");
    var q=view.querySelector("#mvq");
    q.value=""; view.querySelector("#mvRes").hidden=true;
    render(true);
    if(!hit && roomQuery){
      var host=view.querySelector("#mvInfo");
      host.hidden=false;
      host.innerHTML='<b>'+esc(roomQuery)+"</b><span>нет на плане корпуса C1</span>";
    }
  });
}
function close(){
  if(!view) return;
  view.classList.remove("open");
  document.body.classList.remove("locked");
}

return {open:open, close:close, mini:mini, load:load, find:find};
})();
