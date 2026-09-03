/* Редактор карты корпуса. Данные: public/map/floors.json (импорт из aitumap). */
(function(){
"use strict";

/* ---------- типы помещений ---------- */
var KINDS = {
  rooms:   {label:"Аудитория",     color:"#4c8dff"},
  lab:     {label:"Лаборатория",   color:"#a855f7"},
  club:    {label:"Клуб",          color:"#ec4899"},
  office:  {label:"Кабинет/офис",  color:"#14b8a6"},
  hall:    {label:"Зал",           color:"#f59e0b"},
  dining:  {label:"Столовая",      color:"#f97316"},
  library: {label:"Библиотека",    color:"#eab308"},
  wcs:     {label:"Санузел",       color:"#64748b"},
  techs:   {label:"Техническое",   color:"#475569"},
  stairs:  {label:"Лестница",      color:"#22c55e"},
  escapes: {label:"Выход",         color:"#16a34a"},
  gym:     {label:"Спортзал",      color:"#0ea5e9"},
  other:   {label:"Другое",        color:"#94a3b8"}
};
function kindOf(k){ return KINDS[k] || KINDS.other; }
var FLOOR_GAP = 78;   /* расстояние между этажами в 3D */
var ROOM_H = 16;      /* высота стен */

/* ---------- состояние ---------- */
var S = {data:null, floor:1, sel:null, selZone:null, tool:"select", view:"both", dirty:false,
         undo:[], draft:null, vb:null};

var $  = function(id){ return document.getElementById(id); };
var SVGNS = "http://www.w3.org/2000/svg";
function svg(tag, attrs){
  var n=document.createElementNS(SVGNS,tag);
  for(var k in attrs) if(attrs[k]!=null) n.setAttribute(k,attrs[k]);
  return n;
}
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }
function floor(){ return S.data.floors.filter(function(f){ return f.level===S.floor; })[0]; }
function allRooms(){ return S.data.floors.reduce(function(a,f){
  return a.concat(f.rooms.map(function(r){ return {r:r,f:f}; })); },[]); }
function centroid(poly){
  var x=0,y=0; poly.forEach(function(p){ x+=p[0]; y+=p[1]; });
  return [x/poly.length, y/poly.length];
}
function area(poly){
  var a=0; for(var i=0,j=poly.length-1;i<poly.length;j=i++)
    a += (poly[j][0]+poly[i][0])*(poly[j][1]-poly[i][1]);
  return Math.abs(a/2);
}
function toast(msg, err){
  var t=$("toast"); if(!t){ t=document.createElement("div"); t.id="toast"; document.body.appendChild(t); }
  t.className="toast on"+(err?" err":""); t.textContent=msg;
  clearTimeout(t._t); t._t=setTimeout(function(){ t.className="toast"+(err?" err":""); },2200);
}
function markDirty(){ S.dirty=true; $("dirty").textContent="есть несохранённые правки"; }
function snapshot(){
  S.undo.push(JSON.stringify(S.data));
  if(S.undo.length>60) S.undo.shift();
}

/* ---------- загрузка ---------- */
fetch("/map/floors.json").then(function(r){ return r.json(); }).then(function(d){
  S.data=d;
  S.vb={x:0,y:0,w:d.viewBox[2],h:d.viewBox[3]};
  buildFloors(); fitPlan(); renderAll(); init3D();
  if(window.ResizeObserver) new ResizeObserver(function(){ fitAspect(); })
    .observe(document.getElementById("planPane"));
}).catch(function(e){ toast("Не удалось загрузить floors.json: "+e.message,true); });

function buildFloors(){
  var host=$("floors"); host.innerHTML="";
  S.data.floors.forEach(function(f){
    var b=document.createElement("button");
    b.className="f"+(f.level===S.floor?" on":""); b.textContent=f.level+" этаж";
    b.onclick=function(){ S.floor=f.level; S.sel=null; buildFloors(); renderAll(); rebuild3D(); };
    host.appendChild(b);
  });
}
function renderAll(){ renderList(); renderPlan(); renderProps(); renderFromSchedule(); }

/* кабинеты, которые реально нужны по расписанию */
function scheduleRooms(){
  var S2=window.SCHEDULE; if(!S2||!S2.days) return [];
  var set={};
  Object.keys(S2.days).forEach(function(k){
    (S2.days[k]||[]).forEach(function(it){ if(!it.online && it.room) set[it.room]=1; });
  });
  return Object.keys(set).sort();
}
function findRoom(id){
  var q=String(id).trim().toLowerCase();
  for(var i=0;i<S.data.floors.length;i++){
    var f=S.data.floors[i];
    for(var j=0;j<f.rooms.length;j++){
      var r=f.rooms[j];
      if(r.id.toLowerCase()===q) return {r:r,f:f};
      if((r.title||"").toLowerCase()===q) return {r:r,f:f};
      if((r.alt||[]).some(function(a){ return a.toLowerCase()===q; })) return {r:r,f:f};
    }
  }
  return null;
}
function renderFromSchedule(){
  var host=$("fromSched"); if(!host) return;
  var list=scheduleRooms();
  if(!list.length){ host.innerHTML=""; return; }
  var miss=list.filter(function(id){ return !findRoom(id); });
  host.innerHTML="<h4>Из расписания"+(miss.length?" · нет на карте: "+miss.length:" · все на месте")+
    '</h4><div class="chips">'+
    list.map(function(id){
      var hit=findRoom(id);
      return '<span class="chip'+(hit?"":" miss")+'" data-id="'+esc(id)+'">'+
        esc(id.replace(/^C1\./,""))+"</span>";
    }).join("")+"</div>";
  [].forEach.call(host.querySelectorAll(".chip"),function(c){
    c.onclick=function(){
      var id=c.dataset.id, hit=findRoom(id);
      if(hit){ S.floor=hit.f.level; buildFloors(); select(hit.r,true); rebuild3D(); }
      else if(confirm("Кабинета "+id+" нет на карте. Создать заготовку в центре этажа "+S.floor+"?")){
        var vb=S.data.viewBox, cx=vb[2]/2, cy=vb[3]/2;
        snapshot();
        var r={id:id,title:"",alt:[],kind:"rooms",
          poly:[[cx-14,cy-9],[cx+14,cy-9],[cx+14,cy+9],[cx-14,cy+9]]};
        floor().rooms.push(r); markDirty(); select(r,true); rebuild3D();
        toast("Создан "+id+" — двигай и меняй форму");
      }
    };
  });
}

/* ---------- список ---------- */
function renderList(){
  var q=($("q").value||"").trim().toLowerCase();
  var f=floor(), rows=f.rooms.filter(function(r){
    if(!q) return true;
    return (r.id+" "+(r.title||"")+" "+(r.alt||[]).join(" ")).toLowerCase().indexOf(q)>=0;
  });
  $("counts").textContent = rows.length+" из "+f.rooms.length+" · всего "+
    S.data.floors.reduce(function(n,x){ return n+x.rooms.length; },0);
  var host=$("list"); host.innerHTML="";
  rows.sort(function(a,b){ return a.id.localeCompare(b.id,"ru",{numeric:true}); });
  rows.forEach(function(r){
    var d=document.createElement("div");
    d.className="item"+(S.sel===r?" on":"");
    d.innerHTML='<i style="background:'+kindOf(r.kind).color+'"></i>'+
      '<span class="rid">'+esc(r.id)+"</span>"+
      (r.title?'<span class="rt">'+esc(r.title)+"</span>":"");
    d.onclick=function(){ select(r,true); };
    host.appendChild(d);
  });
}
$("q").oninput=renderList;

/* ---------- план ---------- */
var plan=$("plan"), gShapes=$("shapes"), gRooms=$("rooms"), gHandles=$("handles"), gGhost=$("ghost");
function applyVB(){ plan.setAttribute("viewBox",S.vb.x+" "+S.vb.y+" "+S.vb.w+" "+S.vb.h); }
/* весь этаж целиком в панель */
function fitPlan(){
  var w=plan.clientWidth||1, h=plan.clientHeight||1, vb=S.data.viewBox;
  var k=Math.max(vb[2]/w, vb[3]/h)*1.04;
  S.vb.w=w*k; S.vb.h=h*k;
  S.vb.x=vb[2]/2-S.vb.w/2; S.vb.y=vb[3]/2-S.vb.h/2;
  applyVB();
}
/* при изменении размера панели держим пропорции */
function fitAspect(){
  var w=plan.clientWidth||1, h=plan.clientHeight||1;
  var cx=S.vb.x+S.vb.w/2, cy=S.vb.y+S.vb.h/2;
  S.vb.h=S.vb.w*(h/w);
  S.vb.x=cx-S.vb.w/2; S.vb.y=cy-S.vb.h/2;
  applyVB(); renderPlan();
}

function renderPlan(){
  applyVB();
  var f=floor();
  gShapes.innerHTML=""; gRooms.innerHTML=""; gHandles.innerHTML="";
  /* контур здания */
  (S.data.common && S.data.common.building || []).forEach(function(b){
    gShapes.appendChild(svg("path",{d:b.d, transform:b.t, "class":"bg"}));
  });
  /* зоны: стены, техпомещения, санузлы, лестницы, выходы */
  (f.zones||[]).forEach(function(z,i){
    var el=svg(z.closed?"polygon":"polyline",{
      points:z.p.map(function(p){return p.join(",");}).join(" "),
      "class":"sh z-"+(z.k||"walls")+(S.selZone===z?" zsel":"")});
    el.addEventListener("pointerdown",function(e){
      if(S.tool!=="select") return;
      e.stopPropagation(); S.sel=null; S.selZone=z; renderAll();
    });
    gShapes.appendChild(el);
  });
  /* иконки: санузлы, лестницы, выходы */
  (f.icons||[]).forEach(function(ic){
    var g=svg("g",{"class":"ic i-"+(ic.k||"")});
    ic.paths.forEach(function(pp){ g.appendChild(svg("path",{d:pp.d, transform:pp.t})); });
    gShapes.appendChild(g);
  });
  /* крупные подписи блоков */
  (S.data.common && S.data.common.labels || []).forEach(function(l){
    gShapes.appendChild(svg("path",{d:l.d, transform:l.t, "class":"blk"}));
  });
  f.rooms.forEach(function(r){
    var c=kindOf(r.kind).color;
    var el=svg("polygon",{points:r.poly.map(function(p){return p.join(",");}).join(" "),
      "class":"room"+(S.sel===r?" sel":""), fill:c+(S.sel===r?"cc":"55"), stroke:c});
    el.addEventListener("pointerdown",function(e){ onRoomDown(e,r); });
    gRooms.appendChild(el);
    if(S.vb.w<420 || S.sel===r){
      var ct=centroid(r.poly);
      var t=svg("text",{x:ct[0], y:ct[1], "class":"rlabel",
        "font-size": Math.max(3, S.vb.w/170)});
      t.textContent=r.id.replace(/^C1\./,"");
      gRooms.appendChild(t);
    }
  });
  if(S.sel) drawHandles();
}
function drawHandles(){
  gHandles.innerHTML="";
  var r=S.sel, sz=S.vb.w/190;
  r.poly.forEach(function(p,i){
    var a=r.poly[(i+1)%r.poly.length];
    var m=svg("circle",{cx:(p[0]+a[0])/2, cy:(p[1]+a[1])/2, r:sz*0.7, "class":"mid"});
    m.addEventListener("pointerdown",function(e){
      e.stopPropagation(); snapshot();
      r.poly.splice(i+1,0,[(p[0]+a[0])/2,(p[1]+a[1])/2]);
      markDirty(); renderPlan(); rebuild3D();
    });
    gHandles.appendChild(m);
  });
  r.poly.forEach(function(p,i){
    var h=svg("circle",{cx:p[0], cy:p[1], r:sz, "class":"vh"});
    h.addEventListener("pointerdown",function(e){ onVertexDown(e,r,i); });
    gHandles.appendChild(h);
  });
}
function pt(e){
  var m=plan.getScreenCTM().inverse(), p=plan.createSVGPoint();
  p.x=e.clientX; p.y=e.clientY; p=p.matrixTransform(m);
  return [Math.round(p.x*100)/100, Math.round(p.y*100)/100];
}
function select(r,scroll){
  S.sel=r; S.selZone=null; renderList(); renderPlan(); renderProps(); highlight3D();
  if(scroll){
    var c=centroid(r.poly);
    if(c[0]<S.vb.x||c[0]>S.vb.x+S.vb.w||c[1]<S.vb.y||c[1]>S.vb.y+S.vb.h){
      S.vb.x=c[0]-S.vb.w/2; S.vb.y=c[1]-S.vb.h/2; applyVB(); renderPlan();
    }
  }
}

/* перетаскивание вершины */
function onVertexDown(e,r,i){
  e.stopPropagation(); e.preventDefault();
  if(e.altKey){
    if(r.poly.length>3){ snapshot(); r.poly.splice(i,1); markDirty(); renderPlan(); rebuild3D(); }
    return;
  }
  snapshot();
  var move=function(ev){ r.poly[i]=pt(ev); renderPlan(); };
  var up=function(){ window.removeEventListener("pointermove",move);
    window.removeEventListener("pointerup",up); markDirty(); rebuild3D(); };
  window.addEventListener("pointermove",move);
  window.addEventListener("pointerup",up);
}
/* перетаскивание комнаты целиком */
function onRoomDown(e,r){
  if(S.tool!=="select") return;
  e.stopPropagation();
  if(S.sel!==r){ select(r,false); return; }
  var start=pt(e), orig=r.poly.map(function(p){ return p.slice(); }), moved=false;
  snapshot();
  var move=function(ev){
    var p=pt(ev), dx=p[0]-start[0], dy=p[1]-start[1];
    if(Math.abs(dx)+Math.abs(dy)>0.3) moved=true;
    r.poly=orig.map(function(q){ return [Math.round((q[0]+dx)*100)/100,
                                         Math.round((q[1]+dy)*100)/100]; });
    renderPlan();
  };
  var up=function(){
    window.removeEventListener("pointermove",move); window.removeEventListener("pointerup",up);
    if(moved){ markDirty(); rebuild3D(); } else S.undo.pop();
  };
  window.addEventListener("pointermove",move);
  window.addEventListener("pointerup",up);
}

/* пан и зум */
plan.addEventListener("wheel",function(e){
  e.preventDefault();
  var p=pt(e), k=e.deltaY>0?1.12:1/1.12;
  var w=Math.min(S.data.viewBox[2]*2, Math.max(30,S.vb.w*k));
  var s=w/S.vb.w;
  S.vb.h*=s; S.vb.x=p[0]-(p[0]-S.vb.x)*s; S.vb.y=p[1]-(p[1]-S.vb.y)*s; S.vb.w=w;
  renderPlan();
},{passive:false});

plan.addEventListener("pointerdown",function(e){
  if(S.tool==="draw"){ draftPoint(pt(e)); return; }
  if(S.tool==="rect"){ rectStart(e); return; }
  if(e.target===plan||e.target.parentNode===gShapes){
    if(!e.shiftKey && S.sel){ S.sel=null; renderAll(); highlight3D(); }
    var s=pt(e), vb0={x:S.vb.x,y:S.vb.y};
    var move=function(ev){
      var m=plan.getScreenCTM().inverse(), p=plan.createSVGPoint();
      p.x=ev.clientX; p.y=ev.clientY; p=p.matrixTransform(m);
      S.vb.x=vb0.x+(s[0]-p.x); S.vb.y=vb0.y+(s[1]-p.y); applyVB();
    };
    var up=function(){ window.removeEventListener("pointermove",move);
      window.removeEventListener("pointerup",up); renderPlan(); };
    window.addEventListener("pointermove",move); window.addEventListener("pointerup",up);
  }
});

/* рисование нового кабинета */
function draftPoint(p){
  if(!S.draft) S.draft=[];
  S.draft.push(p); drawDraft();
}
function drawDraft(){
  gGhost.innerHTML="";
  if(!S.draft||!S.draft.length) return;
  gGhost.appendChild(svg("polygon",{points:S.draft.map(function(p){return p.join(",");}).join(" "),
    "class":"ghost"}));
  S.draft.forEach(function(p){ gGhost.appendChild(svg("circle",{cx:p[0],cy:p[1],
    r:S.vb.w/190, "class":"vh"})); });
}
function finishDraft(){
  if(S.draft && S.draft.length>=3){ addRoom(S.draft); }
  S.draft=null; gGhost.innerHTML=""; setTool("select");
}
function rectStart(e){
  var a=pt(e);
  var move=function(ev){
    var b=pt(ev);
    S.draft=[[a[0],a[1]],[b[0],a[1]],[b[0],b[1]],[a[0],b[1]]];
    drawDraft();
  };
  var up=function(){
    window.removeEventListener("pointermove",move); window.removeEventListener("pointerup",up);
    if(S.draft && area(S.draft)>1) addRoom(S.draft);
    S.draft=null; gGhost.innerHTML=""; setTool("select");
  };
  window.addEventListener("pointermove",move); window.addEventListener("pointerup",up);
}
function addRoom(poly){
  snapshot();
  var f=floor(), n=1, id;
  do { id="C1.1."+f.level+String(n).padStart(2,"0"); n++; }
  while(f.rooms.some(function(r){ return r.id===id; }));
  var r={id:id, title:"", alt:[], kind:"rooms", poly:poly.map(function(p){ return p.slice(); })};
  f.rooms.push(r); markDirty(); select(r,false); rebuild3D();
  toast("Кабинет добавлен — задай номер справа");
}

/* ---------- свойства ---------- */
var ZONE_KINDS=["walls","techs","wcs","stairs","escapes","gym","void","coworking-atameken","rooms"];
function renderProps(){
  var host=$("props");
  if(!S.sel && S.selZone){
    var z=S.selZone;
    host.innerHTML="<h3>Зона</h3>"+
      '<div class="field"><label>Тип зоны</label><select id="zKind">'+
        ZONE_KINDS.map(function(k){ return '<option value="'+k+'"'+(z.k===k?" selected":"")+">"+k+"</option>"; }).join("")+
      "</select></div>"+
      '<div class="field"><label>Замкнутая (заливка)</label>'+
        '<select id="zClosed"><option value="1"'+(z.closed?" selected":"")+'>да</option>'+
        '<option value="0"'+(z.closed?"":" selected")+'>нет</option></select></div>'+
      '<div class="rowbtn"><button class="btn sm danger" id="zDel">Удалить зону</button></div>'+
      '<div class="meta">точек: '+z.p.length+"</div>";
    $("zKind").onchange=function(){ snapshot(); z.k=this.value; markDirty(); renderPlan(); };
    $("zClosed").onchange=function(){ snapshot(); z.closed=this.value==="1"; markDirty(); renderPlan(); };
    $("zDel").onclick=function(){
      snapshot(); var f=floor(); f.zones.splice(f.zones.indexOf(z),1);
      S.selZone=null; markDirty(); renderAll();
    };
    return;
  }
  if(!S.sel){
    host.innerHTML='<div class="empty">Кабинет не выбран<br><br>'+
      'Клик по кабинету — выбрать<br>Перетаскивание — сдвинуть<br>'+
      'Точки на контуре — форма<br><span class="kbd">Alt</span>+клик по точке — удалить её<br>'+
      'Точка на середине ребра — добавить<br><br>'+
      '<span class="kbd">V</span> выбор · <span class="kbd">N</span> рисовать · '+
      '<span class="kbd">R</span> прямоугольник<br>'+
      '<span class="kbd">Enter</span> завершить · <span class="kbd">Esc</span> отмена<br>'+
      '<span class="kbd">Ctrl+Z</span> отменить · <span class="kbd">Ctrl+S</span> сохранить</div>';
    return;
  }
  var r=S.sel, c=centroid(r.poly);
  host.innerHTML=
    "<h3>Кабинет</h3>"+
    '<div class="field"><label>Номер (id)</label><input id="pId" value="'+esc(r.id)+'"></div>'+
    '<div class="field"><label>Название</label><input id="pTitle" value="'+esc(r.title||"")+
      '" placeholder="Кибер-лаборатория, IT-клуб…"></div>'+
    '<div class="field"><label>Другие названия (через запятую)</label>'+
      '<textarea id="pAlt" placeholder="ASSEMBLYHALL, актовый зал">'+esc((r.alt||[]).join(", "))+"</textarea></div>"+
    '<div class="field"><label>Тип</label><select id="pKind">'+
      Object.keys(KINDS).map(function(k){
        return '<option value="'+k+'"'+(r.kind===k?" selected":"")+">"+KINDS[k].label+"</option>"; }).join("")+
      "</select></div>"+
    '<div class="field"><label>Этаж</label><select id="pFloor">'+
      S.data.floors.map(function(f){
        return '<option value="'+f.level+'"'+(f.level===S.floor?" selected":"")+">"+f.level+" этаж</option>"; }).join("")+
      "</select></div>"+
    '<div class="rowbtn">'+
      '<button class="btn sm" id="pDup">Дублировать</button>'+
      '<button class="btn sm" id="pFit">Показать</button>'+
      '<button class="btn sm danger" id="pDel">Удалить</button>'+
    "</div>"+
    '<div class="meta">точек: '+r.poly.length+"<br>площадь: "+Math.round(area(r.poly))+
      " ед.<br>центр: "+c[0].toFixed(1)+", "+c[1].toFixed(1)+"</div>";

  $("pId").onchange=function(){ snapshot(); r.id=this.value.trim(); markDirty(); renderAll(); rebuild3D(); };
  $("pTitle").onchange=function(){ snapshot(); r.title=this.value.trim(); markDirty(); renderList(); };
  $("pAlt").onchange=function(){ snapshot();
    r.alt=this.value.split(",").map(function(x){ return x.trim(); }).filter(Boolean); markDirty(); };
  $("pKind").onchange=function(){ snapshot(); r.kind=this.value; markDirty(); renderAll(); rebuild3D(); };
  $("pFloor").onchange=function(){
    var to=+this.value; if(to===S.floor) return;
    snapshot();
    var f=floor(); f.rooms.splice(f.rooms.indexOf(r),1);
    S.data.floors.filter(function(x){ return x.level===to; })[0].rooms.push(r);
    markDirty(); S.floor=to; S.sel=r; buildFloors(); renderAll(); rebuild3D();
  };
  $("pDup").onclick=function(){
    snapshot();
    var copy=JSON.parse(JSON.stringify(r));
    copy.id=r.id+"-копия";
    copy.poly=copy.poly.map(function(p){ return [p[0]+6,p[1]+6]; });
    floor().rooms.push(copy); markDirty(); select(copy,false); rebuild3D();
  };
  $("pDel").onclick=function(){
    if(!confirm("Удалить "+r.id+"?")) return;
    snapshot();
    var f=floor(); f.rooms.splice(f.rooms.indexOf(r),1);
    S.sel=null; markDirty(); renderAll(); rebuild3D();
  };
  $("pFit").onclick=function(){
    var xs=r.poly.map(function(p){return p[0];}), ys=r.poly.map(function(p){return p[1];});
    var w=Math.max(30,(Math.max.apply(null,xs)-Math.min.apply(null,xs))*4);
    S.vb.w=w; S.vb.h=w*(plan.clientHeight/plan.clientWidth);
    S.vb.x=c[0]-S.vb.w/2; S.vb.y=c[1]-S.vb.h/2; renderPlan();
  };
}

/* ---------- инструменты, вид, горячие клавиши ---------- */
function setTool(t){
  S.tool=t;
  [].forEach.call(document.querySelectorAll(".t"),function(b){
    b.classList.toggle("on",b.dataset.tool===t); });
  plan.style.cursor = t==="select" ? "default" : "crosshair";
  $("hint").textContent = t==="draw" ? "Клики — вершины, Enter — завершить, Esc — отмена"
    : t==="rect" ? "Протяни прямоугольник"
    : "Колесо — зум, тянуть фон — панорама";
}
[].forEach.call(document.querySelectorAll(".t"),function(b){
  b.onclick=function(){ S.draft=null; gGhost.innerHTML=""; setTool(b.dataset.tool); }; });
function setView(v){
  S.view=v;
  $("stage").className="stage "+(v==="3d"?"three":v);
  [].forEach.call(document.querySelectorAll(".v"),function(b){
    b.classList.toggle("on",b.dataset.view===v); });
  setTimeout(resize3D,30);
}
[].forEach.call(document.querySelectorAll(".v"),function(b){
  b.onclick=function(){ setView(b.dataset.view); }; });

document.addEventListener("keydown",function(e){
  if(/input|textarea|select/i.test((e.target.tagName||""))) return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){ e.preventDefault(); save(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){ e.preventDefault(); undo(); return; }
  if(e.key==="v") setTool("select");
  if(e.key==="n") setTool("draw");
  if(e.key==="r") setTool("rect");
  if(e.key==="f"){ fitPlan(); renderPlan(); }
  if(e.key==="1") setView("both");
  if(e.key==="2") setView("plan");
  if(e.key==="3") setView("3d");
  if(e.key==="Enter"&&S.tool==="draw") finishDraft();
  if(e.key==="Escape"){ S.draft=null; gGhost.innerHTML=""; setTool("select"); }
  if((e.key==="Delete"||e.key==="Backspace")&&S.sel){
    snapshot(); var f=floor(); f.rooms.splice(f.rooms.indexOf(S.sel),1);
    S.sel=null; markDirty(); renderAll(); rebuild3D();
  }
});
function undo(){
  if(!S.undo.length) return toast("Отменять нечего");
  S.data=JSON.parse(S.undo.pop()); S.sel=null;
  buildFloors(); renderAll(); rebuild3D(); markDirty(); toast("Отменено");
}
$("undoBtn").onclick=undo;

/* ---------- сохранение ---------- */
function save(){
  fetch("/api/save",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(S.data)})
  .then(function(r){ return r.json(); })
  .then(function(j){
    if(j.ok){ S.dirty=false; $("dirty").textContent=""; toast("Сохранено: "+j.rooms+" кабинетов"); }
    else toast("Ошибка: "+j.error,true);
  })
  .catch(function(e){ toast("Сервер недоступен: "+e.message,true); });
}
$("saveBtn").onclick=save;
$("dlBtn").onclick=function(){
  var b=new Blob([JSON.stringify(S.data)],{type:"application/json"});
  var a=document.createElement("a");
  a.href=URL.createObjectURL(b); a.download="floors.json"; a.click();
};
window.addEventListener("beforeunload",function(e){
  if(S.dirty){ e.preventDefault(); e.returnValue=""; }
});

/* ---------- 3D ---------- */
var R={}, meshes=[];
function init3D(){
  var canvas=$("gl");
  R.scene=new THREE.Scene();
  R.scene.background=new THREE.Color(0x0b0d11);
  R.camera=new THREE.PerspectiveCamera(42,1,1,6000);
  R.camera.position.set(120,720,880);
  R.renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true});
  R.renderer.setPixelRatio(Math.min(2,devicePixelRatio));
  R.controls=new THREE.OrbitControls(R.camera,canvas);
  R.controls.enableDamping=true; R.controls.dampingFactor=.08;
  R.controls.target.set(0,26,0); R.controls.maxDistance=2600; R.controls.minDistance=60;
  R.scene.add(new THREE.AmbientLight(0xffffff,.75));
  var dir=new THREE.DirectionalLight(0xffffff,.75); dir.position.set(300,600,400);
  R.scene.add(dir);
  R.root=new THREE.Group(); R.scene.add(R.root);
  R.ray=new THREE.Raycaster(); R.mouse=new THREE.Vector2();
  canvas.addEventListener("click",pick3D);
  $("allFloors").onchange=function(){ rebuild3D(); fitCamera(); };
  $("showLabels").onchange=rebuild3D;
  $("resetCam").onclick=fitCamera;
  window.addEventListener("resize",resize3D);
  resize3D(); rebuild3D(); fitCamera();
  (function loop(){ requestAnimationFrame(loop); R.controls.update(); R.renderer.render(R.scene,R.camera); })();
}
/* камера охватывает всю сцену */
function fitCamera(){
  if(!R.root) return;
  var box=new THREE.Box3().setFromObject(R.root);
  if(box.isEmpty()) return;
  var size=box.getSize(new THREE.Vector3()), c=box.getCenter(new THREE.Vector3());
  var maxDim=Math.max(size.x,size.y,size.z);
  var fit=maxDim/(2*Math.tan(R.camera.fov*Math.PI/360));
  var dist=fit*(R.camera.aspect<1 ? 1.5/Math.max(.45,R.camera.aspect) : 1.08);
  var dir=new THREE.Vector3(0.15,0.85,1).normalize();
  R.camera.position.copy(c).add(dir.multiplyScalar(dist));
  R.camera.near=dist/100; R.camera.far=dist*8; R.camera.updateProjectionMatrix();
  R.controls.target.copy(c); R.controls.update();
}
function resize3D(){
  if(!R.renderer) return;
  var c=$("gl"), w=c.clientWidth||1, h=c.clientHeight||1;
  R.renderer.setSize(w,h,false);
  R.camera.aspect=w/h; R.camera.updateProjectionMatrix();
}
function labelSprite(text,color){
  var cv=document.createElement("canvas"); cv.width=256; cv.height=64;
  var g=cv.getContext("2d");
  g.fillStyle="rgba(12,14,19,.82)"; g.roundRect ? (g.beginPath(),g.roundRect(0,0,256,64,14),g.fill())
                                                : g.fillRect(0,0,256,64);
  g.font="bold 30px ui-monospace, monospace"; g.fillStyle=color||"#e8eaef";
  g.textAlign="center"; g.textBaseline="middle"; g.fillText(text,128,34);
  var tx=new THREE.CanvasTexture(cv);
  var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tx,depthTest:false,transparent:true}));
  sp.scale.set(46,11.5,1);
  return sp;
}
function rebuild3D(){
  if(!R.root) return;
  while(R.root.children.length) R.root.remove(R.root.children[0]);
  meshes=[];
  var vb=S.data.viewBox, cx=vb[2]/2, cy=vb[3]/2;
  var showAll=$("allFloors").checked, labels=$("showLabels").checked;

  S.data.floors.forEach(function(f){
    if(!showAll && f.level!==S.floor) return;
    var base=(f.level-1)*FLOOR_GAP, dim=f.level!==S.floor;
    var g=new THREE.Group(); g.position.y=base;

    /* плита этажа */
    var slabShape=new THREE.Shape([
      new THREE.Vector2(-cx,-cy), new THREE.Vector2(cx,-cy),
      new THREE.Vector2(cx,cy),   new THREE.Vector2(-cx,cy)]);
    var slab=new THREE.Mesh(new THREE.ExtrudeGeometry(slabShape,{depth:1.4,bevelEnabled:false}),
      new THREE.MeshLambertMaterial({color:0x171b22,transparent:true,opacity:dim?.12:.7}));
    slab.rotation.x=-Math.PI/2; slab.position.y=-1.4;
    g.add(slab);

    f.rooms.forEach(function(r){
      var shape=new THREE.Shape(r.poly.map(function(p){
        return new THREE.Vector2(p[0]-cx, cy-p[1]); }));
      var geo=new THREE.ExtrudeGeometry(shape,{depth:ROOM_H,bevelEnabled:false});
      var col=new THREE.Color(kindOf(r.kind).color);
      var mat=new THREE.MeshLambertMaterial({color:col,transparent:true,
        opacity: dim?.10:(S.sel===r?1:.82)});
      var m=new THREE.Mesh(geo,mat);
      m.rotation.x=-Math.PI/2;
      m.userData={room:r,floor:f};
      g.add(m); meshes.push(m);

      var edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({color:S.sel===r?0xffffff:0x000000,
          transparent:true,opacity:dim?.05:(S.sel===r?.95:.3)}));
      edges.rotation.x=-Math.PI/2; g.add(edges);

      if(labels && !dim && (S.sel===r || r.poly.length && area(r.poly)>140)){
        var c=centroid(r.poly);
        var sp=labelSprite(r.id.replace(/^C1\./,""), S.sel===r?"#fff":"#c9d1de");
        sp.position.set(c[0]-cx, ROOM_H+5, cy-c[1]);
        g.add(sp);
      }
    });
    R.root.add(g);
  });
}
function highlight3D(){ rebuild3D(); }
function pick3D(e){
  var c=$("gl"), b=c.getBoundingClientRect();
  R.mouse.x=((e.clientX-b.left)/b.width)*2-1;
  R.mouse.y=-((e.clientY-b.top)/b.height)*2+1;
  R.ray.setFromCamera(R.mouse,R.camera);
  var hit=R.ray.intersectObjects(meshes,false)[0];
  if(!hit) return;
  var d=hit.object.userData;
  if(d.floor.level!==S.floor){ S.floor=d.floor.level; buildFloors(); }
  select(d.room,true);
}

setTool("select"); setView("both");

/* доступ из консоли для отладки */
window.MAPEDITOR={state:S, three:R, rebuild:rebuild3D, fit:fitCamera, save:save};
})();
