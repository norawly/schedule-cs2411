(function(){
"use strict";

/* ---------- константы ---------- */
var S      = window.SCHEDULE || {days:{}, subjects:{}};
var KEYS   = ["mon","tue","wed","thu","fri","sat","sun"];
var SHORT  = {mon:"Пн",tue:"Вт",wed:"Ср",thu:"Чт",fri:"Пт",sat:"Сб",sun:"Вс"};
var FULL   = {mon:"Понедельник",tue:"Вторник",wed:"Среда",thu:"Четверг",fri:"Пятница",sat:"Суббота",sun:"Воскресенье"};
var TYPE   = {lecture:"Лекция",practice:"Практика",lab:"Лаб. работа",seminar:"Семинар"};

/* тип занятия → цвет. Онлайн-пары — отдельные цвета и пунктирная рамка */
var KIND = {
  "lecture":         {c:"#4f6ef7", label:"Лекция"},
  "practice":        {c:"#10b981", label:"Практика"},
  "lecture-online":  {c:"#a855f7", label:"Лекция · онлайн"},
  "practice-online": {c:"#f59e0b", label:"Практика · онлайн"}
};
var PX_PER_HOUR = 88;
var PAD = 10;            /* воздух сверху и снизу сетки */

/* ---------- утилиты ---------- */
function $(id){ return document.getElementById(id); }
function el(tag,cls,html){ var n=document.createElement(tag); if(cls)n.className=cls; if(html!=null)n.innerHTML=html; return n; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }
function mins(t){ var p=String(t||"0:0").split(":"); return (+p[0])*60+(+p[1]||0); }
function nowMin(){ var d=new Date(); return d.getHours()*60+d.getMinutes(); }
function dayKey(d){ return KEYS[(d.getDay()+6)%7]; }
function items(k){ return ((S.days&&S.days[k])||[]).slice().sort(function(a,b){return mins(a.start)-mins(b.start);}); }
function kindKey(it){ return (it.type==="lecture"?"lecture":"practice") + (it.online?"-online":""); }
function kindOf(it){ return KIND[kindKey(it)] || KIND.practice; }
function typeLabel(it){ return (TYPE[it.type]||it.type||"Занятие") + (it.online?" · онлайн":""); }
function place(it){ return it.online ? "Онлайн" : (it.room || ""); }
function shortSub(name){ return (S.subjects&&S.subjects[name]) || ""; }
function plural(n,a,b,c){ var x=n%10,y=n%100; return n+" "+(x===1&&y!==11?a:(x>=2&&x<=4&&(y<12||y>14)?b:c)); }
function dur(m){
  var d=Math.floor(m/1440), h=Math.floor(m%1440/60), r=m%60;
  if(d) return d+" д"+(h?" "+h+" ч":"");
  if(h) return h+" ч"+(r?" "+r+" м":"");
  return r+" мин";
}
function hhmm(m){ var h=Math.floor(m/60), r=m%60; return (h<10?"0":"")+h+":"+(r<10?"0":"")+r; }

var today = dayKey(new Date());

/* даты текущей недели: понедельник — воскресенье */
var WEEK_DATES = (function(){
  var d=new Date(), off=(d.getDay()+6)%7, mon=new Date(d);
  mon.setDate(d.getDate()-off); mon.setHours(0,0,0,0);
  var out={};
  KEYS.forEach(function(k,i){ var x=new Date(mon); x.setDate(mon.getDate()+i); out[k]=x; });
  return out;
})();
function dnum(k){ return WEEK_DATES[k].getDate(); }

/* границы календарной сетки — по самым ранним и поздним парам недели */
var lo=24*60, hi=0;
KEYS.forEach(function(k){ items(k).forEach(function(it){
  lo=Math.min(lo,mins(it.start)); hi=Math.max(hi,mins(it.end)); }); });
if(lo>hi){ lo=9*60; hi=18*60; }
var GRID_START = Math.floor(lo/60)*60;
var GRID_END   = Math.ceil(hi/60)*60;
var GRID_MIN   = GRID_END-GRID_START;
var GRID_H     = GRID_MIN/60*PX_PER_HOUR;
function y(m){ return PAD + (m-GRID_START)/GRID_MIN*GRID_H; }

/* раскладка пересекающихся пар по колонкам-дорожкам */
function pack(arr){
  var res=arr.map(function(it){ return {it:it,s:mins(it.start),e:mins(it.end),lane:0,lanes:1}; });
  var cluster=[], end=-1;
  function flush(){
    var n=0; cluster.forEach(function(x){ n=Math.max(n,x.lane+1); });
    cluster.forEach(function(x){ x.lanes=n; });
    cluster=[];
  }
  res.forEach(function(ev){
    if(cluster.length && ev.s>=end){ flush(); end=-1; }
    var used={}; cluster.forEach(function(x){ if(x.e>ev.s) used[x.lane]=1; });
    var l=0; while(used[l]) l++;
    ev.lane=l; cluster.push(ev); end=Math.max(end,ev.e);
  });
  if(cluster.length) flush();
  return res;
}

/* ---------- шапка ---------- */
(function head(){
  $("mark").textContent = (S.group||"CS").replace(/[^A-Za-zА-Яа-я0-9]/g,"").slice(0,2).toUpperCase();
  $("gname").innerHTML = '<span class="wide">Расписание </span>' + esc(S.group||"");
  $("gmeta").innerHTML = (S.year?'<span class="wide">'+esc(S.year)+' · </span>':"") + esc(S.period||"");
  $("foot").innerHTML = (S.updated?"Обновлено "+esc(S.updated)+" · ":"") + "сверяйтесь с официальным расписанием";
})();

/* ---------- легенда ---------- */
(function legend(){
  var host=$("legend"), used={};
  KEYS.forEach(function(k){ items(k).forEach(function(it){ used[kindKey(it)]=1; }); });
  Object.keys(KIND).forEach(function(key){
    if(!used[key]) return;
    var n=el("div","lg"+(key.indexOf("online")>0?" dash":""),"<i></i>"+esc(KIND[key].label));
    n.style.setProperty("--c",KIND[key].c);
    host.appendChild(n);
  });
})();

/* ---------- календарь: десктоп ---------- */
var visible = KEYS.filter(function(k){ return items(k).length || k===today; });

function buildWeek(){
  var head=$("weekHead"), gutter=$("gutter"), cols=$("cols");
  var week=$("week");
  week.style.setProperty("--cols",visible.length);
  week.style.setProperty("--gutter","56px");
  head.innerHTML=""; gutter.innerHTML=""; cols.innerHTML="";
  head.appendChild(el("div","gh"));

  visible.forEach(function(k){
    var n=items(k).length;
    var h=el("div","dh"+(k===today?" today":"")+((k==="sat"||k==="sun")?" weekend":""),
      '<div class="dow">'+SHORT[k]+'<b>'+dnum(k)+"</b></div>"+
      '<div class="cnt">'+(n?plural(n,"пара","пары","пар"):"свободно")+"</div>");
    head.appendChild(h);
  });

  gutter.style.height = (GRID_H+PAD*2)+"px";
  for(var m=GRID_START;m<=GRID_END;m+=60){
    var t=el("div","hr",hhmm(m)); t.style.top=y(m)+"px"; gutter.appendChild(t);
  }

  var lines=el("div","lines");
  for(var q=GRID_START;q<=GRID_END;q+=30){
    var ln=el("div","ln"+(q%60?" half":"")); ln.style.top=y(q)+"px"; lines.appendChild(ln);
  }
  cols.style.height=(GRID_H+PAD*2)+"px";
  cols.appendChild(lines);

  var delay=0;
  visible.forEach(function(k){
    var col=el("div","col"+(k===today?" today":"")+((k==="sat"||k==="sun")?" weekend":""));
    var arr=items(k), packed=pack(arr);

    /* окна между парами */
    for(var i=1;i<arr.length;i++){
      var g=mins(arr[i].start)-mins(arr[i-1].end);
      if(g>=45){
        var band=el("div","gapband",'<span>окно '+dur(g)+"</span>");
        band.style.top=y(mins(arr[i-1].end))+2+"px";
        band.style.height=Math.max(0,y(mins(arr[i].start))-y(mins(arr[i-1].end))-4)+"px";
        col.appendChild(band);
      }
    }

    packed.forEach(function(ev){
      var it=ev.it, kd=kindOf(it), h=y(ev.e)-y(ev.s);
      var b=el("button","ev"+(it.online?" online":"")+(h<46?" compact":"")+(h<70?" tight":""));
      b.style.setProperty("--c",kd.c);
      b.style.top=y(ev.s)+1+"px";
      b.style.height=Math.max(24,h-3)+"px";
      b.style.left="calc("+(ev.lane/ev.lanes*100)+"% + 4px)";
      b.style.width="calc("+(100/ev.lanes)+"% - 8px)";
      b.style.setProperty("--d",(delay+=22)+"ms");
      b.innerHTML =
        '<div class="et">'+esc(it.start)+"–"+esc(it.end)+
          (shortSub(it.subject)?'<span class="tag">'+esc(shortSub(it.subject))+"</span>":"")+"</div>"+
        '<div class="es">'+esc(it.subject)+"</div>"+
        '<div class="er">'+(it.online?"🖥 Онлайн":"📍 "+esc(it.room||"—"))+"</div>";
      b.onclick=function(){ openSheet(it,k); };
      col.appendChild(b);
    });

    cols.appendChild(col);
  });
}

function drawNowLine(){
  var old=document.querySelector(".nowline"); if(old) old.remove();
  var idx=visible.indexOf(today); if(idx<0) return;
  var n=nowMin(); if(n<GRID_START||n>GRID_END) return;
  var col=$("cols").querySelectorAll(".col")[idx]; if(!col) return;
  var line=el("div","nowline"); line.style.top=y(n)+"px"; col.appendChild(line);
}

/* ---------- мобильный вид: страницы-дни ---------- */
function buildMobile(){
  var tabs=$("dayTabs"), pager=$("pager");
  tabs.innerHTML=""; pager.innerHTML="";

  KEYS.forEach(function(k){
    var n=items(k).length;
    var b=el("button",(k===today?"today":""),
      '<span class="d">'+SHORT[k]+'</span><span class="c">'+(n?n:"—")+"</span>");
    b.type="button"; b.dataset.key=k; b.setAttribute("role","tab");
    b.onclick=function(){ goPage(KEYS.indexOf(k),true); };
    tabs.appendChild(b);

    var page=el("div","page"); page.dataset.key=k;
    page.appendChild(el("h2",null,FULL[k]+' <span class="dnum">'+dnum(k)+"</span>"));
    var arr=items(k);
    page.appendChild(el("div","psub",
      k===today ? "сегодня" + (arr.length?" · "+plural(arr.length,"пара","пары","пар"):"")
                : (arr.length? plural(arr.length,"пара","пары","пар")+" · "+arr[0].start+"–"+arr[arr.length-1].end : "выходной")));

    if(!arr.length){
      page.appendChild(el("div","free","<b>🌤</b><span>Пар нет — свободный день</span>"));
    }else{
      var rows=el("div","rows"), d=0;
      arr.forEach(function(it,i){
        if(i){
          var g=mins(it.start)-mins(arr[i-1].end);
          if(g>=45) rows.appendChild(el("div","mgap","окно "+dur(g)));
        }
        var kd=kindOf(it);
        var r=el("button","row");
        r.style.setProperty("--c",kd.c);
        r.style.setProperty("--d",(d+=35)+"ms");
        r.dataset.day=k; r.dataset.start=it.start;
        r.innerHTML =
          '<span class="rt"><b>'+esc(it.start)+"</b><i>"+esc(it.end)+"</i></span>"+
          '<span class="rb">'+
            '<span class="rs">'+esc(it.subject)+"</span>"+
            '<span class="rm"><span class="kind">'+esc(TYPE[it.type]||"Занятие")+"</span>"+
              (place(it)?'<span class="dot">·</span><span>'+esc(place(it))+"</span>":"")+
              (it.teacher?'<span class="dot">·</span><span>'+esc(it.teacher)+"</span>":"")+
            "</span>"+
          "</span>";
        r.onclick=function(){ openSheet(it,k); };
        rows.appendChild(r);
      });
      page.appendChild(rows);
    }
    pager.appendChild(page);
  });

  pager.addEventListener("scroll",function(){
    clearTimeout(pager._t);
    pager._t=setTimeout(function(){
      var i=Math.round(pager.scrollLeft/pager.clientWidth);
      markTab(i);
    },60);
  },{passive:true});
}

function markTab(i){
  var tabs=$("dayTabs").children;
  for(var j=0;j<tabs.length;j++) tabs[j].setAttribute("aria-selected", j===i?"true":"false");
  var t=tabs[i]; if(t && t.scrollIntoView) t.scrollIntoView({inline:"center",block:"nearest",behavior:"smooth"});
}
function goPage(i,smooth){
  var pager=$("pager");
  pager.scrollTo({left:i*pager.clientWidth, behavior:smooth?"smooth":"auto"});
  markTab(i);
}

/* ---------- статус: сейчас / следующая ---------- */
function renderStatus(){
  var host=$("status"), n=nowMin(), arr=items(today), cur=null, next=null, inMin=0, when="";
  for(var i=0;i<arr.length;i++){
    if(n>=mins(arr[i].start)&&n<mins(arr[i].end)){ cur=arr[i]; break; }
    if(mins(arr[i].start)>n){ next=arr[i]; inMin=mins(arr[i].start)-n; break; }
  }
  if(!cur&&!next){
    for(var d=1;d<=7&&!next;d++){
      var k=KEYS[(KEYS.indexOf(today)+d)%7], a=items(k);
      if(a.length){ next=a[0]; inMin=(1440-n)+(d-1)*1440+mins(a[0].start);
                    when = d===1?"завтра":FULL[k].toLowerCase(); }
    }
  }
  if(!cur&&!next){ host.innerHTML=""; return; }

  var it=cur||next, kd=kindOf(it);
  host.className="status"+(cur?" live":"");
  host.style.setProperty("--c",kd.c);
  host.innerHTML =
    '<div class="beat"></div>'+
    '<div class="txt">'+
      '<div class="lbl">'+(cur?"Сейчас идёт":"Следующая пара")+"</div>"+
      '<div class="val">'+esc(it.subject)+"</div>"+
      '<div class="sub">'+esc(
        (when?when+", ":"")+it.start+"–"+it.end+" · "+typeLabel(it)+(place(it)?" · "+place(it):"")
      )+"</div>"+
    "</div>"+
    '<div class="cd">'+(cur? "ещё "+dur(mins(it.end)-n) : "через "+dur(inMin))+"</div>";
  host.onclick=function(){ openSheet(it, cur?today:null); };
}

/* ---------- карточка занятия ---------- */
var ICON={
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin:'<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5.2 7-5.2s5.8 1.6 7 5.2"/>',
  hash:'<path d="M5 9h14M5 15h14M10 4l-1.5 16M15.5 4L14 20"/>',
  net:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'
};
function field(icon,k,v,sub){
  return '<div class="frow"><div class="fi"><svg viewBox="0 0 24 24">'+icon+'</svg></div>'+
    '<div><div class="fk">'+esc(k)+'</div><div class="fv">'+esc(v)+
    (sub?"<small>"+esc(sub)+"</small>":"")+'</div></div></div>';
}
function openSheet(it,dk){
  var kd=kindOf(it), sheet=$("sheet"), len=mins(it.end)-mins(it.start);
  sheet.style.setProperty("--c",kd.c);
  sheet.innerHTML =
    '<div class="sh">'+
      '<button class="close" aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'+
      '<div class="kindrow">'+
        '<span class="badge">'+esc(typeLabel(it))+"</span>"+
        (shortSub(it.subject)?'<span class="badge ghost">'+esc(shortSub(it.subject))+"</span>":"")+
        (dk?'<span class="badge code">'+esc(FULL[dk])+"</span>":"")+
      "</div>"+
      "<h3>"+esc(it.subject)+"</h3>"+
    "</div>"+
    '<div class="sb">'+
      field(ICON.clock,"Время",it.start+" – "+it.end,dur(len))+
      (it.online
        ? field(ICON.net,"Формат","Онлайн","Ссылку смотри в системе университета")
        : field(ICON.pin,"Кабинет",it.room||"—",[it.building,it.note].filter(Boolean).join(" · ")))+
      field(ICON.user,"Преподаватель",it.teacher||"Не назначен")+
      (it.code?field(ICON.hash,"Код курса",it.code):"")+
    "</div>";
  sheet.querySelector(".close").onclick=closeSheet;
  sheet.classList.add("open");
  $("backdrop").classList.add("open");
  document.body.style.overflow="hidden";
}
function closeSheet(){
  $("sheet").classList.remove("open");
  $("backdrop").classList.remove("open");
  document.body.style.overflow="";
}
$("backdrop").onclick=closeSheet;
document.addEventListener("keydown",function(e){ if(e.key==="Escape") closeSheet(); });

/* ---------- тема ---------- */
(function theme(){
  var btn=$("themeBtn");
  var SUN='<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>';
  var MOON='<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z"/>';
  function apply(v){
    if(v) document.documentElement.setAttribute("data-theme",v);
    else document.documentElement.removeAttribute("data-theme");
    var dark = v ? v==="dark" : matchMedia("(prefers-color-scheme:dark)").matches;
    btn.innerHTML='<svg viewBox="0 0 24 24">'+(dark?SUN:MOON)+"</svg>";
    var meta=document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute("content", dark?"#080a0f":"#f2f4f9");
  }
  var saved=null;
  try{ saved=localStorage.getItem("theme"); }catch(e){}
  apply(saved);
  btn.onclick=function(){
    var dark = document.documentElement.getAttribute("data-theme")
      ? document.documentElement.getAttribute("data-theme")==="dark"
      : matchMedia("(prefers-color-scheme:dark)").matches;
    var v = dark?"light":"dark";
    try{ localStorage.setItem("theme",v); }catch(e){}
    apply(v);
  };
})();

/* ---------- «Сегодня» ---------- */
$("todayBtn").onclick=function(){
  goPage(KEYS.indexOf(today),true);
  var col=$("cols").querySelectorAll(".col")[visible.indexOf(today)];
  if(col && col.animate) col.animate(
    [{filter:"brightness(1.35)"},{filter:"none"}], {duration:900, easing:"ease-out"});
};

/* ---------- запуск ---------- */
buildWeek();
buildMobile();
renderStatus();
drawNowLine();
goPage(KEYS.indexOf(today),false);
$("todayBtn").querySelector(".tt").textContent =
  new Date().toLocaleDateString("ru-RU",{day:"numeric",month:"short"}).replace(".","");

function tick(){
  var t=dayKey(new Date());
  if(t!==today){ today=t; visible=KEYS.filter(function(k){return items(k).length||k===today;});
                 buildWeek(); buildMobile(); goPage(KEYS.indexOf(today),false); }
  renderStatus(); drawNowLine();
  document.querySelectorAll(".ev,.row").forEach(function(n){ n.classList.remove("live","past"); });
  var n=nowMin(), idx=visible.indexOf(today);
  if(idx>=0){
    var col=$("cols").querySelectorAll(".col")[idx];
    if(col) markState(col.querySelectorAll(".ev"), items(today), n);
  }
  var page=$("pager").querySelector('.page[data-key="'+today+'"]');
  if(page) markState(page.querySelectorAll(".row"), items(today), n);
}
function markState(nodes,arr,n){
  var k=0;
  for(var i=0;i<nodes.length;i++){
    var it=arr[k++]; if(!it) break;
    if(n>=mins(it.end)) nodes[i].classList.add("past");
    else if(n>=mins(it.start)) nodes[i].classList.add("live");
  }
}
tick();
setInterval(tick,30000);
document.addEventListener("visibilitychange",function(){ if(!document.hidden) tick(); });
window.addEventListener("resize",function(){
  clearTimeout(window._rz);
  window._rz=setTimeout(function(){ goPage(KEYS.indexOf(today),false); drawNowLine(); },150);
});

if("serviceWorker" in navigator){
  window.addEventListener("load",function(){ navigator.serviceWorker.register("/sw.js"); });
}
})();
