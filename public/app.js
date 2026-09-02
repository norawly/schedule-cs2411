(function(){
"use strict";

/* ============ данные ============ */
var S     = window.SCHEDULE || {days:{}, subjects:{}};
var KEYS  = ["mon","tue","wed","thu","fri","sat"];        /* воскресенья в расписании нет */
var SHORT = {mon:"Пн",tue:"Вт",wed:"Ср",thu:"Чт",fri:"Пт",sat:"Сб"};
var FULL  = {mon:"Понедельник",tue:"Вторник",wed:"Среда",thu:"Четверг",fri:"Пятница",sat:"Суббота"};
var TYPE  = {lecture:"Лекция",practice:"Практика",lab:"Лаб. работа",seminar:"Семинар"};
var MON   = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
var MONF  = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];

var KIND = {
  "lecture":         {c:"#3b68e0", label:"Лекция"},
  "practice":        {c:"#1a9e5f", label:"Практика"},
  "lecture-online":  {c:"#7c5cf0", label:"Лекция онлайн"},
  "practice-online": {c:"#c97a10", label:"Практика онлайн"}
};

var HOUR = 84;            /* высота часа в календаре, px (уточняется под экран) */
var PAD  = 8;

/* ============ мелочи ============ */
function $(id){ return document.getElementById(id); }
function el(t,c,h){ var n=document.createElement(t); if(c)n.className=c; if(h!=null)n.innerHTML=h; return n; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }
function mins(t){ var p=String(t||"0:0").split(":"); return (+p[0])*60+(+p[1]||0); }
function hhmm(m){ var h=Math.floor(m/60)%24, r=m%60; return (h<10?"0":"")+h+":"+(r<10?"0":"")+r; }
function nowMin(){ var d=new Date(); return d.getHours()*60+d.getMinutes(); }
function plural(n,a,b,c){ var x=n%10,y=n%100; return n+" "+(x===1&&y!==11?a:(x>=2&&x<=4&&(y<12||y>14)?b:c)); }
function kindKey(it){ return (it.type==="lecture"?"lecture":"practice")+(it.online?"-online":""); }
function kindOf(it){ return KIND[kindKey(it)]||KIND.practice; }
function short(name){ return (S.subjects&&S.subjects[name])||""; }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function dur(m){
  var d=Math.floor(m/1440), h=Math.floor(m%1440/60), r=m%60;
  if(d) return d+" д "+h+" ч";
  if(h) return h+" ч"+(r?" "+r+" мин":"");
  return r+" мин";
}

/* ============ объединение одинаковых пар подряд + округление ============ */
function raw(k){ return ((S.days&&S.days[k])||[]).slice().sort(function(a,b){return mins(a.start)-mins(b.start);}); }
function same(a,b){
  return a.subject===b.subject && a.type===b.type && !!a.online===!!b.online &&
         (a.room||"")===(b.room||"") && (a.teacher||"")===(b.teacher||"");
}
var CACHE={};
function blocks(k){
  if(CACHE[k]) return CACHE[k];
  var arr=raw(k), out=[], cur=null;
  arr.forEach(function(it){
    if(cur && same(cur.last,it) && mins(it.start)-mins(cur.last.end)<=20){
      cur.parts.push(it); cur.last=it;
    }else{
      cur={it:it, last:it, parts:[it]}; out.push(cur);
    }
  });
  out.forEach(function(g,i){
    g.rs = mins(g.parts[0].start);                 /* реальное начало */
    g.re = mins(g.last.end);                       /* реальный конец  */
    g.s  = Math.floor(g.rs/60)*60;                 /* округлённые для показа */
    g.e  = Math.ceil(g.re/60)*60;
    if(i && g.s < out[i-1].e) g.s = out[i-1].e;    /* не наезжать на предыдущий */
  });
  CACHE[k]=out;
  return out;
}

/* границы сетки по всей неделе */
var lo=24*60, hi=0;
KEYS.forEach(function(k){ blocks(k).forEach(function(g){ lo=Math.min(lo,g.s); hi=Math.max(hi,g.e); }); });
if(lo>hi){ lo=9*60; hi=18*60; }
var G0=lo, G1=hi, GH=0;
function fitHour(){
  var hours=(G1-G0)/60;
  return Math.max(64,Math.min(92,Math.floor((window.innerHeight-268)/hours)));
}
HOUR=fitHour(); GH=(G1-G0)/60*HOUR;
function y(m){ return PAD+(m-G0)/60*HOUR; }

/* ============ календарные дни (много недель вперёд и назад) ============ */
var BACK=2, FWD=10;
var now0=new Date(); now0.setHours(0,0,0,0);
var monday=new Date(now0); monday.setDate(now0.getDate()-((now0.getDay()+6)%7));
var DAYS=[], TODAY=-1;
(function(){
  for(var w=-BACK; w<=FWD; w++)
    for(var i=0;i<6;i++){
      var d=new Date(monday); d.setDate(monday.getDate()+w*7+i);
      if(sameDay(d,now0)) TODAY=DAYS.length;
      DAYS.push({key:KEYS[i], date:d});
    }
})();
/* если сегодня воскресенье — «текущий» день это ближайший понедельник */
var CUR = TODAY>=0 ? TODAY : DAYS.findIndex(function(x){ return x.date>now0; });
if(CUR<0) CUR=0;
function isToday(i){ return i===TODAY; }
function fmtShort(d){ return d.getDate()+" "+MON[d.getMonth()]; }
function fmtLong(d){ return d.getDate()+" "+MONF[d.getMonth()]; }

/* ============ шапка ============ */
$("gname").innerHTML='<span class="wide">Расписание </span>'+esc(S.group||"");
$("gmeta").textContent=[S.year,S.period].filter(Boolean).join(" · ");
$("foot").innerHTML=(S.updated?"Обновлено "+esc(S.updated)+" · ":"")+"сверяйтесь с официальным расписанием";

/* легенда — компактная строка, без прокрутки */
(function(){
  var used={};
  KEYS.forEach(function(k){ raw(k).forEach(function(it){ used[kindKey(it)]=1; }); });
  $("legend").innerHTML = Object.keys(KIND).filter(function(x){return used[x];}).map(function(x){
    return '<span class="lg"><i style="background:'+KIND[x].c+'"></i>'+esc(KIND[x].label)+"</span>";
  }).join("");
})();

/* ============ календарь (десктоп): горизонтальная лента дней ============ */
var scroller=$("scroller"), grid=$("grid");

function buildWeek(){
  grid.innerHTML="";
  grid.style.setProperty("--n",DAYS.length);

  var g=el("div","gutcol");
  g.appendChild(el("div","dh gh"));
  var gb=el("div","gbody"); gb.style.height=(GH+PAD*2)+"px";
  for(var m=G0;m<=G1;m+=60){ var t=el("div","hr",hhmm(m)); t.style.top=y(m)+"px"; gb.appendChild(t); }
  g.appendChild(gb); grid.appendChild(g);

  DAYS.forEach(function(day,idx){
    var k=day.key, list=blocks(k);
    var col=el("div","col"+(isToday(idx)?" today":""));
    col.dataset.i=idx;

    var h=el("div","dh"+(isToday(idx)?" today":""),
      '<span class="dow">'+SHORT[k]+"</span>"+
      '<span class="dnum">'+day.date.getDate()+"</span>"+
      '<span class="dmon">'+MON[day.date.getMonth()]+"</span>");
    col.appendChild(h);

    var body=el("div","cbody");
    body.style.height=(GH+PAD*2)+"px";
    body.style.setProperty("--hour",HOUR+"px");
    body.style.setProperty("--top",PAD+"px");

    list.forEach(function(gr,i){
      if(i){
        var gap=gr.s-list[i-1].e;
        if(gap>=60){
          var band=el("div","gapband",'<span>окно '+dur(gap)+"</span>");
          band.style.top=y(list[i-1].e)+"px";
          band.style.height=(y(gr.s)-y(list[i-1].e))+"px";
          body.appendChild(band);
        }
      }
      var it=gr.it, kd=kindOf(it), hgt=y(gr.e)-y(gr.s);
      var b=el("button","ev"+(it.online?" online":"")+(hgt<74?" tight":""));
      b.style.setProperty("--c",kd.c);
      b.style.top=y(gr.s)+2+"px";
      b.style.height=(hgt-4)+"px";
      b.innerHTML =
        '<span class="ev-time">'+hhmm(gr.s)+" – "+hhmm(gr.e)+
          (gr.parts.length>1?'<b class="ev-n">'+gr.parts.length+" пары</b>":"")+"</span>"+
        '<span class="ev-sub">'+esc(it.subject)+"</span>"+
        '<span class="ev-room">'+(it.online?"Онлайн":esc(it.room||"—"))+"</span>";
      b.onclick=function(){ openCard(gr,day); };
      body.appendChild(b);
    });

    col.appendChild(body);
    grid.appendChild(col);
  });
  sizeCols();
}

function sizeCols(){
  var gut=56;
  var w=Math.max(120,Math.floor((scroller.clientWidth-gut)/6));
  var week=scroller.parentNode;
  grid.style.setProperty("--colw",w+"px");
  grid.style.setProperty("--gut",gut+"px");
  week.style.setProperty("--gut",gut+"px");
  return w;
}
function scrollToDay(i,smooth){
  var w=sizeCols();
  var start=Math.floor(i/6)*6;                 /* к началу недели этого дня */
  scroller.scrollTo({left:start*w, behavior:smooth?"smooth":"auto"});
}
function weekLabel(){
  var w=sizeCols(), first=Math.round(scroller.scrollLeft/w);
  first=Math.max(0,Math.min(DAYS.length-1,first));
  var a=DAYS[first].date, b=DAYS[Math.min(DAYS.length-1,first+5)].date;
  var same=a.getMonth()===b.getMonth();
  $("weekLabel").textContent = a.getDate()+(same?"":" "+MON[a.getMonth()])+" – "+b.getDate()+" "+MON[b.getMonth()];
  var wk=Math.floor(first/6)-BACK;
  $("weekHint").textContent = wk===0?"эта неделя":(wk===1?"следующая":(wk===-1?"прошлая":(wk>0?"+"+wk+" нед.":wk+" нед.")));
}
$("prevWeek").onclick=function(){ scroller.scrollBy({left:-6*sizeCols(),behavior:"smooth"}); };
$("nextWeek").onclick=function(){ scroller.scrollBy({left: 6*sizeCols(),behavior:"smooth"}); };
scroller.addEventListener("scroll",function(){
  clearTimeout(scroller._t); scroller._t=setTimeout(weekLabel,60);
},{passive:true});

function nowLine(){
  var old=grid.querySelector(".nowline"); if(old) old.remove();
  if(TODAY<0) return;
  var n=nowMin(); if(n<G0||n>G1) return;
  var col=grid.querySelectorAll(".col")[TODAY]; if(!col) return;
  var line=el("div","nowline"); line.style.top=y(n)+"px";
  col.querySelector(".cbody").appendChild(line);
}

/* ============ телефон: страницы-дни ============ */
var pager=$("pager");

function buildMobile(){
  pager.innerHTML="";
  DAYS.forEach(function(day,idx){
    var k=day.key, list=blocks(k);
    var page=el("div","page"); page.dataset.i=idx;
    page.appendChild(el("div","pday",
      "<h2>"+FULL[k]+"</h2><p>"+fmtLong(day.date)+(isToday(idx)?' <b class="istoday">сегодня</b>':"")+"</p>"));

    if(!list.length){ page.appendChild(el("div","free","Пар нет")); }
    else{
      var rows=el("div","rows");
      list.forEach(function(gr,i){
        if(i){
          var gap=gr.s-list[i-1].e;
          if(gap>=60) rows.appendChild(el("div","mgap","<span>окно "+dur(gap)+"</span>"));
        }
        var it=gr.it, kd=kindOf(it);
        var r=el("button","row"+(it.online?" online":""));
        r.style.setProperty("--c",kd.c);
        r.innerHTML=
          '<span class="r-time"><b>'+hhmm(gr.s)+"</b><i>"+hhmm(gr.e)+"</i></span>"+
          '<span class="r-main">'+
            '<span class="r-sub">'+esc(it.subject)+"</span>"+
            '<span class="r-meta">'+esc(TYPE[it.type]||"Занятие")+
              (it.teacher?" · "+esc(it.teacher):"")+"</span>"+
          "</span>"+
          '<span class="r-room'+(it.online?" on":"")+'">'+
            (it.online?"Онлайн":esc(it.room||"—"))+
            (!it.online&&it.building?'<i>'+esc(it.building.replace("Корпус ","").replace("Главный корпус","Главный"))+"</i>":"")+
          "</span>";
        r.onclick=function(){ openCard(gr,day); };
        rows.appendChild(r);
      });
      page.appendChild(rows);
    }
    pager.appendChild(page);
  });
}

function buildTabs(){
  var host=$("dayTabs"); host.innerHTML="";
  for(var i=0;i<6;i++){
    var b=el("button",null,'<span class="d"></span><span class="n"></span>');
    b.type="button"; b.dataset.slot=i;
    b.onclick=(function(slot){ return function(){
      var week=Math.floor(curPage()/6);
      goPage(week*6+slot,true);
    };})(i);
    host.appendChild(b);
  }
}
function curPage(){ return Math.round(pager.scrollLeft/Math.max(1,pager.clientWidth)); }
function syncTabs(){
  var i=Math.max(0,Math.min(DAYS.length-1,curPage()));
  var week=Math.floor(i/6), tabs=$("dayTabs").children;
  for(var s=0;s<6;s++){
    var day=DAYS[week*6+s], t=tabs[s];
    t.querySelector(".d").textContent=SHORT[day.key];
    t.querySelector(".n").textContent=day.date.getDate();
    t.setAttribute("aria-selected", (week*6+s)===i ? "true":"false");
    t.classList.toggle("today", (week*6+s)===TODAY);
  }
  $("mWeek").textContent = week-BACK===0 ? "эта неделя"
    : (week-BACK===1?"следующая неделя":fmtShort(DAYS[week*6].date)+" – "+fmtShort(DAYS[week*6+5].date));
}
function goPage(i,smooth){
  i=Math.max(0,Math.min(DAYS.length-1,i));
  pager.scrollTo({left:i*pager.clientWidth, behavior:smooth?"smooth":"auto"});
  setTimeout(syncTabs,smooth?350:0);
}
pager.addEventListener("scroll",function(){
  clearTimeout(pager._t); pager._t=setTimeout(syncTabs,60);
},{passive:true});

/* ============ статус с живым таймером ============ */
var timerTarget=null, timerMode="";
function findNext(){
  var n=nowMin(), i=TODAY>=0?TODAY:CUR, day=DAYS[i], list=day?blocks(day.key):[];
  if(TODAY>=0){
    for(var j=0;j<list.length;j++){
      if(n>=list[j].rs && n<list[j].re) return {gr:list[j], day:day, live:true};
      if(list[j].rs>n)                  return {gr:list[j], day:day, live:false, at:list[j].rs-n};
    }
  }
  for(var d=(TODAY>=0?TODAY+1:CUR); d<DAYS.length; d++){
    var l=blocks(DAYS[d].key);
    if(l.length){
      var days=Math.round((DAYS[d].date-now0)/86400000);
      return {gr:l[0], day:DAYS[d], live:false, at:days*1440-n+l[0].rs};
    }
  }
  return null;
}
function renderStatus(){
  var host=$("status"), r=findNext();
  if(!r){ host.hidden=true; return; }
  host.hidden=false;
  var it=r.gr.it, kd=kindOf(it);
  host.style.setProperty("--c",kd.c);
  host.className="status"+(r.live?" live":"");
  var whenTxt = r.live ? "" :
    (isToday(DAYS.indexOf(r.day)) ? "сегодня" :
     (DAYS.indexOf(r.day)===TODAY+1 ? "завтра" : FULL[r.day.key].toLowerCase()+", "+fmtShort(r.day.date)));
  host.innerHTML=
    '<div class="st-main">'+
      '<div class="st-lbl">'+(r.live?"Сейчас идёт":"Следующая пара")+(whenTxt?" · "+esc(whenTxt):"")+"</div>"+
      '<div class="st-sub">'+esc(it.subject)+"</div>"+
      '<div class="st-meta">'+hhmm(r.gr.s)+" – "+hhmm(r.gr.e)+" · "+esc(TYPE[it.type]||"")+
        (it.teacher?" · "+esc(it.teacher):"")+"</div>"+
    "</div>"+
    '<div class="st-side">'+
      '<div class="st-room'+(it.online?" on":"")+'">'+(it.online?"Онлайн":esc(it.room||"—"))+"</div>"+
      '<div class="st-timer"><span id="tick">--:--</span><small>'+(r.live?"до конца":"до начала")+"</small></div>"+
    "</div>";
  host.onclick=function(){ openCard(r.gr,r.day); };
  timerMode=r.live?"end":"start";
  var base=new Date(); base.setHours(0,0,0,0);
  var dayOffset=Math.round((r.day.date-now0)/86400000);
  timerTarget=new Date(base.getTime()+(dayOffset*1440+(r.live?r.gr.re:r.gr.rs))*60000);
}
function tickTimer(){
  var node=$("tick"); if(!node||!timerTarget) return;
  var left=Math.max(0,Math.floor((timerTarget-new Date())/1000));
  if(left<=0){ renderStatus(); return; }
  var h=Math.floor(left/3600), m=Math.floor(left%3600/60), s=left%60;
  node.textContent = (h?h+":"+(m<10?"0":"")+m:m)+":"+(s<10?"0":"")+s;
  node.parentNode.classList.toggle("big",h<1);
}

/* ============ карточка занятия ============ */
var IC={
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin:'<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5.2 7-5.2s5.8 1.6 7 5.2"/>',
  hash:'<path d="M5 9h14M5 15h14M10 4l-1.5 16M15.5 4L14 20"/>',
  net:'<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8 20h8M12 16.5V20"/>'
};
function row(icon,k,v,sub){
  return '<div class="frow"><span class="fi"><svg viewBox="0 0 24 24">'+icon+"</svg></span>"+
    '<span class="fx"><span class="fk">'+esc(k)+'</span><span class="fv">'+esc(v)+
    (sub?"<small>"+esc(sub)+"</small>":"")+"</span></span></div>";
}
function openCard(gr,day){
  var it=gr.it, kd=kindOf(it), card=$("card");
  var exact=gr.parts.map(function(p){ return p.start+"–"+p.end; }).join(", ");
  card.style.setProperty("--c",kd.c);
  card.innerHTML=
    '<div class="c-head">'+
      '<button class="c-close" aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'+
      '<div class="c-tags"><span class="tag solid">'+esc(kd.label)+"</span>"+
        (short(it.subject)?'<span class="tag">'+esc(short(it.subject))+"</span>":"")+
        '<span class="tag muted">'+esc(FULL[day.key])+", "+fmtShort(day.date)+"</span></div>"+
      "<h3>"+esc(it.subject)+"</h3>"+
      '<div class="c-room'+(it.online?" on":"")+'">'+
        (it.online?"Онлайн":esc(it.room||"—"))+
        (!it.online&&it.building?"<small>"+esc([it.building,it.note].filter(Boolean).join(" · "))+"</small>":"")+
      "</div>"+
    "</div>"+
    '<div class="c-body">'+
      row(IC.clock,"Время",hhmm(gr.s)+" – "+hhmm(gr.e),
          plural(gr.parts.length,"пара","пары","пар")+" · "+exact)+
      (it.online?row(IC.net,"Формат","Онлайн","Ссылка — в системе университета"):"")+
      row(IC.user,"Преподаватель",it.teacher||"Не назначен")+
      (it.code?row(IC.hash,"Код курса",it.code):"")+
    "</div>";
  card.querySelector(".c-close").onclick=closeCard;
  card.classList.add("open"); $("veil").classList.add("open");
  document.body.classList.add("locked");
}
function closeCard(){
  $("card").classList.remove("open"); $("veil").classList.remove("open");
  document.body.classList.remove("locked");
}
$("veil").onclick=closeCard;
document.addEventListener("keydown",function(e){ if(e.key==="Escape") closeCard(); });

/* ============ тема ============ */
(function(){
  var btn=$("themeBtn");
  var SUN='<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>';
  var MOON='<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z"/>';
  function isDark(){
    var a=document.documentElement.getAttribute("data-theme");
    return a?a==="dark":matchMedia("(prefers-color-scheme:dark)").matches;
  }
  function apply(v){
    if(v) document.documentElement.setAttribute("data-theme",v);
    else document.documentElement.removeAttribute("data-theme");
    btn.innerHTML='<svg viewBox="0 0 24 24">'+(isDark()?SUN:MOON)+"</svg>";
    var meta=document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute("content", isDark()?"#0e1013":"#f6f6f7");
  }
  var saved=null; try{ saved=localStorage.getItem("theme"); }catch(e){}
  apply(saved);
  btn.onclick=function(){ var v=isDark()?"light":"dark";
    try{ localStorage.setItem("theme",v); }catch(e){} apply(v); };
})();

/* ============ старт ============ */
buildWeek(); buildMobile(); buildTabs();
renderStatus();
scrollToDay(CUR,false); weekLabel();
goPage(CUR,false);
nowLine();

$("todayBtn").onclick=function(){ scrollToDay(CUR,true); goPage(CUR,true); };
$("todayBtn").querySelector(".tt").textContent=fmtShort(new Date());

setInterval(tickTimer,1000); tickTimer();
setInterval(function(){ renderStatus(); tickTimer(); nowLine(); markPast(); },30000);

function markPast(){
  if(TODAY<0) return;
  var n=nowMin(), list=blocks(DAYS[TODAY].key);
  var col=grid.querySelectorAll(".col")[TODAY];
  var page=pager.children[TODAY];
  [col?col.querySelectorAll(".ev"):[], page?page.querySelectorAll(".row"):[]].forEach(function(nodes){
    for(var i=0;i<nodes.length;i++){
      var g=list[i]; if(!g) break;
      nodes[i].classList.toggle("past", n>=g.re);
      nodes[i].classList.toggle("live", n>=g.rs&&n<g.re);
    }
  });
}
markPast();

var rz;
window.addEventListener("resize",function(){
  clearTimeout(rz); rz=setTimeout(function(){
    var i=curPage(), h=fitHour();
    if(Math.abs(h-HOUR)>3){ HOUR=h; GH=(G1-G0)/60*HOUR; var at=scroller.scrollLeft; buildWeek();
                            scroller.scrollLeft=at; markPast(); }
    sizeCols(); goPage(i,false); weekLabel(); nowLine();
  },160);
});
document.addEventListener("visibilitychange",function(){
  if(!document.hidden){ renderStatus(); tickTimer(); nowLine(); markPast(); }
});
if("serviceWorker" in navigator)
  window.addEventListener("load",function(){ navigator.serviceWorker.register("sw.js"); });
})();
