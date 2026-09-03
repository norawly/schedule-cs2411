(function(){
"use strict";

/* ============ данные ============ */
var S     = window.SCHEDULE || {days:{}, subjects:{}};
var T     = S.term || {};
var KEYS  = ["mon","tue","wed","thu","fri","sat"];
var SHORT = {mon:"Пн",tue:"Вт",wed:"Ср",thu:"Чт",fri:"Пт",sat:"Сб"};
var FULL  = {mon:"Понедельник",tue:"Вторник",wed:"Среда",thu:"Четверг",fri:"Пятница",sat:"Суббота"};
var TYPE  = {lecture:"Лекция",practice:"Практика",lab:"Лаб. работа",seminar:"Семинар"};
var MON   = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
var MONF  = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
var KIND  = {
  "lecture":         {c:"#3b68e0", label:"Лекция"},
  "practice":        {c:"#1a9e5f", label:"Практика"},
  "lecture-online":  {c:"#7c5cf0", label:"Лекция онлайн"},
  "practice-online": {c:"#c97a10", label:"Практика онлайн"}
};

/* ============ мелочи ============ */
function $(id){ return document.getElementById(id); }
function el(t,c,h){ var n=document.createElement(t); if(c)n.className=c; if(h!=null)n.innerHTML=h; return n; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }
function mins(t){ var p=String(t||"0:0").split(":"); return (+p[0])*60+(+p[1]||0); }
function hhmm(m){ var h=Math.floor(m/60)%24, r=m%60; return (h<10?"0":"")+h+":"+(r<10?"0":"")+r; }
function nowMin(){ var d=new Date(); return d.getHours()*60+d.getMinutes(); }
function plural(n,a,b,c){ var x=n%10,y=n%100; return n+" "+(x===1&&y!==11?a:(x>=2&&x<=4&&(y<12||y>14)?b:c)); }
function dur(m){ var d=Math.floor(m/1440),h=Math.floor(m%1440/60),r=m%60;
  if(d) return d+" д "+h+" ч"; if(h) return h+" ч"+(r?" "+r+" мин":""); return r+" мин"; }
function pd(s){ var p=String(s).split("-"); return new Date(+p[0],+p[1]-1,+p[2]); }
function iso(d){ var m=d.getMonth()+1,x=d.getDate();
  return d.getFullYear()+"-"+(m<10?"0":"")+m+"-"+(x<10?"0":"")+x; }
function addDays(d,n){ var x=new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d){ var x=new Date(d); x.setHours(0,0,0,0); return addDays(x,-((x.getDay()+6)%7)); }
function sameDate(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function fmtShort(d){ return d.getDate()+" "+MON[d.getMonth()]; }
function fmtLong(d){ return d.getDate()+" "+MONF[d.getMonth()]; }
function kindKey(it){ return (it.type==="lecture"?"lecture":"practice")+(it.online?"-online":""); }
function kindOf(it){ return KIND[kindKey(it)]||KIND.practice; }
function subjShort(n){ return (S.subjects&&S.subjects[n])||""; }

/* кабинет коротко: C1.2.232P → 2.232P, 302P → 302P */
function roomShort(r){ return String(r||"").replace(/^C1\./i,""); }
/* этаж по номеру кабинета: C1.<блок>.<номер>, первая цифра номера — этаж
   (C1.1.355P → 3 этаж, C1.2.232P → 2 этаж, 302P → 3 этаж) */
function floorOf(it){
  if(it.online) return null;
  var num=String(it.room||"").split(".").pop();
  var m=num.match(/^(\d)\d{2}/);
  return m ? +m[1] : null;
}

/* ============ склейка пар и округление времени ============ */
function rawDay(k){ return ((S.days&&S.days[k])||[]).slice().sort(function(a,b){return mins(a.start)-mins(b.start);}); }
function same(a,b){
  return a.subject===b.subject && a.type===b.type && !!a.online===!!b.online &&
         (a.room||"")===(b.room||"") && (a.teacher||"")===(b.teacher||"");
}
var CACHE={};
function blocks(k){
  if(CACHE[k]) return CACHE[k];
  var arr=rawDay(k), out=[], cur=null;
  arr.forEach(function(it){
    if(cur && same(cur.last,it) && mins(it.start)-mins(cur.last.end)<=20){ cur.parts.push(it); cur.last=it; }
    else { cur={it:it,last:it,parts:[it]}; out.push(cur); }
  });
  out.forEach(function(g,i){
    g.rs=mins(g.parts[0].start); g.re=mins(g.last.end);
    g.s=Math.floor(g.rs/60)*60;  g.e=Math.ceil(g.re/60)*60;
    if(i&&g.s<out[i-1].e) g.s=out[i-1].e;
  });
  CACHE[k]=out; return out;
}
var lo=24*60, hi=0;
KEYS.forEach(function(k){ blocks(k).forEach(function(g){ lo=Math.min(lo,g.s); hi=Math.max(hi,g.e); }); });
if(lo>hi){ lo=9*60; hi=18*60; }
var G0=lo, G1=hi, HOURS=(G1-G0)/60;
function pct(m){ return (m-G0)/(G1-G0)*100; }

/* ============ периоды триместра ============ */
var P_STUDY = (T.study||[]).map(pd), P_EX=(T.exams||[]).map(pd), P_VAC=(T.vacation||[]).map(pd);
var TERM_A  = P_STUDY[0] || startOfWeek(new Date());
var TERM_B  = P_VAC[1] || P_EX[1] || P_STUDY[1] || addDays(TERM_A,90);
function within(d,r){ return r.length===2 && d>=r[0] && d<=r[1]; }
function dayState(d){
  var h=(T.holidays||{})[iso(d)];
  if(h) return {kind:"holiday", label:h};
  if(within(d,P_STUDY)) return {kind:"study"};
  if(within(d,P_EX))    return {kind:"exams", label:"Сессия"};
  if(within(d,P_VAC))   return {kind:"vacation", label:"Каникулы"};
  return {kind:"none", label:d<TERM_A?"До начала":"Триместр окончен"};
}

/* список дней триместра (Пн–Сб) */
var DAYS=[], TODAY=-1;
(function(){
  var today=new Date(); today.setHours(0,0,0,0);
  var first=startOfWeek(TERM_A);
  if(startOfWeek(today)<first) first=startOfWeek(today);
  var d=new Date(first), last=addDays(startOfWeek(TERM_B),6);
  if(startOfWeek(today)>startOfWeek(TERM_B)) last=addDays(startOfWeek(today),6);
  while(d<=last){
    if(d.getDay()!==0){
      if(sameDate(d,today)) TODAY=DAYS.length;
      DAYS.push({key:KEYS[(d.getDay()+6)%7], date:new Date(d)});
    }
    d=addDays(d,1);
  }
})();
var WEEKS=Math.ceil(DAYS.length/6);
var CUR = TODAY>=0 ? TODAY : (function(){
  var t=new Date(); t.setHours(0,0,0,0);
  for(var i=0;i<DAYS.length;i++) if(DAYS[i].date>=t) return i;
  return DAYS.length-1;
})();
/* открываем ближайшую неделю, в которой реально идут занятия */
var week = (function(){
  var w=Math.floor(CUR/6);
  for(var x=w; x<Math.ceil(DAYS.length/6); x++)
    for(var c=0;c<6;c++){
      var d=DAYS[x*6+c];
      if(d && dayState(d.date).kind==="study" && blocks(d.key).length) return x;
    }
  return w;
})();

/* ============ шапка ============ */
$("gname").innerHTML='<span class="wide">Расписание </span>'+esc(S.group||"");
$("gmeta").textContent=[S.year,T.name||S.period].filter(Boolean).join(" · ");
(function(){
  var used={}; KEYS.forEach(function(k){ rawDay(k).forEach(function(it){ used[kindKey(it)]=1; }); });
  var html=Object.keys(KIND).filter(function(x){return used[x];}).map(function(x){
    return '<span class="lg"><i style="background:'+KIND[x].c+'"></i>'+esc(KIND[x].label)+"</span>"; }).join("");
  $("legend").innerHTML=html; $("legendM").innerHTML=html;
})();

/* ============ календарь недели (десктоп) ============ */
var body=$("weekBody");

function renderWeek(dir){
  var i0=week*6;
  body.innerHTML="";
  body.style.setProperty("--hours",HOURS);

  var gut=el("div","gutcol");
  gut.appendChild(el("div","dh gh"));
  var gb=el("div","gbody");
  for(var m=G0;m<G1;m+=60){
    var t=el("div","hr",hhmm(m)); t.style.top=pct(m)+"%"; gb.appendChild(t);
  }
  gut.appendChild(gb); body.appendChild(gut);

  for(var c=0;c<6;c++){
    var day=DAYS[i0+c];
    var col=el("div","col");
    if(!day){ col.classList.add("empty"); body.appendChild(col); continue; }
    var st=dayState(day.date), isT=(i0+c)===TODAY;
    if(isT) col.classList.add("today");

    col.appendChild(el("div","dh"+(isT?" today":""),
      '<span class="dow">'+SHORT[day.key]+"</span>"+
      '<span class="dnum">'+day.date.getDate()+"</span>"+
      '<span class="dmon">'+MON[day.date.getMonth()]+"</span>"));

    var cb=el("div","cbody");
    if(st.kind!=="study"){
      cb.classList.add("nostudy");
      cb.appendChild(el("div","nomark","<span>"+esc(st.label||"")+"</span>"));
    }else{
      var list=blocks(day.key);
      list.forEach(function(gr,i){
        if(i){
          var gap=gr.s-list[i-1].e;
          if(gap>=60){
            var band=el("div","gapband",'<span>окно '+dur(gap)+"</span>");
            band.style.top=pct(list[i-1].e)+"%";
            band.style.height=(pct(gr.s)-pct(list[i-1].e))+"%";
            cb.appendChild(band);
          }
        }
        var it=gr.it, kd=kindOf(it);
        var b=el("button","ev"+(it.online?" online":""));
        b.style.setProperty("--c",kd.c);
        b.style.top=pct(gr.s)+"%";
        b.style.height=(pct(gr.e)-pct(gr.s))+"%";
        b.innerHTML=
          '<span class="ev-head">'+
            '<span class="ev-time">'+hhmm(gr.s)+"–"+hhmm(gr.e)+"</span>"+
            '<span class="ev-room'+(it.online?" on":"")+
              (!it.online&&roomShort(it.room).length>7?" long":"")+'">'+
              (it.online?"Онлайн":esc(roomShort(it.room)||"—"))+"</span>"+
          "</span>"+
          '<span class="ev-sub">'+esc(it.subject)+"</span>";
        b.onclick=(function(g,d){ return function(){ openCard(g,d); }; })(gr,day);
        cb.appendChild(b);
      });
      if(isT) { var n=nowMin(); if(n>=G0&&n<=G1){
        var ln=el("div","nowline"); ln.style.top=pct(n)+"%"; cb.appendChild(ln); } }
    }
    col.appendChild(cb);
    body.appendChild(col);
  }

  body.classList.remove("in-l","in-r");
  if(dir){ void body.offsetWidth; body.classList.add(dir>0?"in-r":"in-l"); }
  fitEvents(); markPast(); weekLabel();
}

/* мало места — прячем название, оставляем время и кабинет */
function fitEvents(){
  var evs=body.querySelectorAll(".ev");
  for(var i=0;i<evs.length;i++){
    var h=evs[i].clientHeight;
    evs[i].classList.toggle("xs",h<46);
    evs[i].classList.toggle("tight",h>=46&&h<74);
  }
}
function weekLabel(){
  var a=DAYS[week*6], b=DAYS[Math.min(DAYS.length-1,week*6+5)];
  if(!a){ return; }
  var one=a.date.getMonth()===b.date.getMonth();
  $("weekLabel").textContent=a.date.getDate()+(one?"":" "+MON[a.date.getMonth()])+" – "+fmtShort(b.date);
  var tw=TODAY>=0?Math.floor(TODAY/6):-1;
  var st=dayState(a.date), stEnd=dayState(b.date);
  var hint = week===tw ? "эта неделя"
    : (week===tw+1 ? "следующая неделя"
    : (st.kind==="exams"||stEnd.kind==="exams" ? "сессия"
    : (st.kind==="vacation" ? "каникулы"
    : "неделя "+(week+1)+" из "+WEEKS)));
  $("weekHint").textContent=hint;
  $("prevWeek").disabled = week<=0;
  $("nextWeek").disabled = week>=WEEKS-1;
}
function goWeek(w,dir){
  w=Math.max(0,Math.min(WEEKS-1,w));
  if(w===week) return;
  var d=dir||(w>week?1:-1); week=w; renderWeek(d);
}
$("prevWeek").onclick=function(){ goWeek(week-1,-1); };
$("nextWeek").onclick=function(){ goWeek(week+1, 1); };
document.addEventListener("keydown",function(e){
  if(e.target&&/input|textarea/i.test(e.target.tagName)) return;
  if(e.key==="ArrowLeft")  goWeek(week-1,-1);
  if(e.key==="ArrowRight") goWeek(week+1, 1);
});
var wheelLock=0;
body.addEventListener("wheel",function(e){
  if(Math.abs(e.deltaX)<Math.abs(e.deltaY)||Math.abs(e.deltaX)<24) return;
  var t=Date.now(); if(t-wheelLock<420) return; wheelLock=t;
  goWeek(week+(e.deltaX>0?1:-1), e.deltaX>0?1:-1);
},{passive:true});
(function(){
  var x0=null;
  body.addEventListener("touchstart",function(e){ x0=e.touches[0].clientX; },{passive:true});
  body.addEventListener("touchend",function(e){
    if(x0==null) return; var dx=e.changedTouches[0].clientX-x0; x0=null;
    if(Math.abs(dx)>60) goWeek(week+(dx<0?1:-1), dx<0?1:-1);
  },{passive:true});
})();

/* ============ телефон ============ */
var pager=$("pager");
function buildMobile(){
  pager.innerHTML="";
  DAYS.forEach(function(day,idx){
    var st=dayState(day.date), list=st.kind==="study"?blocks(day.key):[];
    var page=el("div","page"); page.dataset.i=idx;
    page.appendChild(el("div","pday",
      "<h2>"+FULL[day.key]+"</h2><p>"+fmtLong(day.date)+(idx===TODAY?' <b class="istoday">сегодня</b>':"")+"</p>"));
    if(st.kind!=="study"){
      page.appendChild(el("div","free","<b>"+esc(st.label||"Пар нет")+"</b>"+
        (st.kind==="exams"?"<span>Расписание сессии — в LMS</span>":"")));
    }else if(!list.length){
      page.appendChild(el("div","free","<b>Пар нет</b><span>Свободный день</span>"));
    }else{
      var rows=el("div","rows");
      list.forEach(function(gr,i){
        if(i){ var gap=gr.s-list[i-1].e;
          if(gap>=60) rows.appendChild(el("div","mgap","<span>окно "+dur(gap)+"</span>")); }
        var it=gr.it, kd=kindOf(it);
        var r=el("button","row"+(it.online?" online":""));
        r.style.setProperty("--c",kd.c);
        r.innerHTML=
          '<span class="r-time"><b>'+hhmm(gr.s)+"</b><i>"+hhmm(gr.e)+"</i></span>"+
          '<span class="r-main"><span class="r-sub">'+esc(it.subject)+"</span>"+
            '<span class="r-meta">'+esc(TYPE[it.type]||"Занятие")+(it.teacher?" · "+esc(it.teacher):"")+"</span></span>"+
          '<span class="r-room'+(it.online?" on":"")+
            (!it.online&&roomShort(it.room).length>7?" long":"")+'"><b>'+
            (it.online?"Онлайн":esc(roomShort(it.room)||"—"))+"</b>"+
            (!it.online&&it.building?"<i>"+esc(it.building.indexOf("Коркем")>=0?"Коркем":"Главный")+"</i>":"")+
          "</span>";
        r.onclick=function(){ openCard(gr,day); };
        rows.appendChild(r);
      });
      page.appendChild(rows);
    }
    pager.appendChild(page);
  });
  var end=el("div","page");
  end.appendChild(el("div","free tail","<b>Конец триместра</b><span>"+
    esc((T.name||"Триместр")+": до "+fmtLong(TERM_B))+"</span>"));
  pager.appendChild(end);
}
function buildTabs(){
  var host=$("dayTabs"); host.innerHTML="";
  for(var i=0;i<6;i++){
    var b=el("button",null,'<span class="d"></span><span class="n"></span>');
    b.type="button";
    b.onclick=(function(slot){ return function(){ goPage(Math.floor(curPage()/6)*6+slot,true); }; })(i);
    host.appendChild(b);
  }
}
function curPage(){ return Math.round(pager.scrollLeft/Math.max(1,pager.clientWidth)); }
function syncTabs(){
  var i=Math.max(0,Math.min(DAYS.length,curPage())), w=Math.min(WEEKS-1,Math.floor(i/6)), tabs=$("dayTabs").children;
  for(var s=0;s<6;s++){
    var day=DAYS[w*6+s], t=tabs[s];
    if(!day){ t.style.visibility="hidden"; continue; }
    t.style.visibility="";
    t.querySelector(".d").textContent=SHORT[day.key];
    t.querySelector(".n").textContent=day.date.getDate();
    t.setAttribute("aria-selected",(w*6+s)===i?"true":"false");
    t.classList.toggle("today",(w*6+s)===TODAY);
    t.classList.toggle("off",dayState(day.date).kind!=="study");
  }
  var tw=TODAY>=0?Math.floor(TODAY/6):-1;
  $("mWeek").textContent = i>=DAYS.length ? "конец триместра"
    : (w===tw?"эта неделя":(w===tw+1?"следующая неделя":fmtShort(DAYS[w*6].date)+" – "+fmtShort(DAYS[Math.min(DAYS.length-1,w*6+5)].date)));
}
function goPage(i,smooth){
  i=Math.max(0,Math.min(DAYS.length,i));
  pager.scrollTo({left:i*pager.clientWidth,behavior:smooth?"smooth":"auto"});
  setTimeout(syncTabs,smooth?340:0);
}
pager.addEventListener("scroll",function(){ clearTimeout(pager._t); pager._t=setTimeout(syncTabs,60); },{passive:true});

/* ============ статус ============ */
var timerTo=null;
function findNext(){
  var n=nowMin();
  if(TODAY>=0 && dayState(DAYS[TODAY].date).kind==="study"){
    var l=blocks(DAYS[TODAY].key);
    for(var j=0;j<l.length;j++){
      if(n>=l[j].rs&&n<l[j].re) return {gr:l[j],day:DAYS[TODAY],i:TODAY,live:true};
      if(l[j].rs>n)             return {gr:l[j],day:DAYS[TODAY],i:TODAY,live:false};
    }
  }
  for(var d=(TODAY>=0?TODAY+1:CUR); d<DAYS.length; d++){
    if(dayState(DAYS[d].date).kind!=="study") continue;
    var b=blocks(DAYS[d].key);
    if(b.length) return {gr:b[0],day:DAYS[d],i:d,live:false};
  }
  return null;
}
function renderStatus(){
  var host=$("status"), r=findNext();
  if(!r){
    host.hidden=false; host.className="status plain";
    host.innerHTML='<div class="st-main"><div class="st-lbl">Триместр завершён</div>'+
      '<div class="st-sub">Пар больше нет</div></div>';
    host.onclick=null; timerTo=null; return;
  }
  host.hidden=false;
  var it=r.gr.it, kd=kindOf(it), today0=new Date(); today0.setHours(0,0,0,0);
  var off=Math.round((r.day.date-today0)/86400000);
  host.style.setProperty("--c",kd.c);
  host.className="status"+(r.live?" live":"");
  var when=r.live?"":(off===0?"сегодня":(off===1?"завтра":FULL[r.day.key].toLowerCase()+", "+fmtShort(r.day.date)));
  host.innerHTML=
    '<div class="st-main">'+
      '<div class="st-lbl">'+(r.live?"Сейчас идёт":"Следующая пара")+(when?" · "+esc(when):"")+"</div>"+
      '<div class="st-sub">'+esc(it.subject)+"</div>"+
      '<div class="st-meta">'+hhmm(r.gr.s)+" – "+hhmm(r.gr.e)+" · "+esc(TYPE[it.type]||"")+
        (it.teacher?" · "+esc(it.teacher):"")+"</div>"+
    "</div>"+
    '<div class="st-side">'+
      '<div class="st-room'+(it.online?" on":"")+'">'+(it.online?"Онлайн":esc(roomShort(it.room)||"—"))+"</div>"+
      '<div class="st-timer"><span id="tick">--:--</span><small>'+(r.live?"до конца":"до начала")+"</small></div>"+
    "</div>";
  host.onclick=function(){ openCard(r.gr,r.day); };
  timerTo=new Date(today0.getTime()+(off*1440+(r.live?r.gr.re:r.gr.rs))*60000);
}
function tick(){
  var n=$("tick"); if(!n||!timerTo) return;
  var left=Math.max(0,Math.floor((timerTo-new Date())/1000));
  if(left<=0){ renderStatus(); return; }
  var h=Math.floor(left/3600), m=Math.floor(left%3600/60), s=left%60;
  n.textContent=(h?h+":"+(m<10?"0":"")+m:m)+":"+(s<10?"0":"")+s;
}

/* ============ карточка пары + место под карту ============ */
var IC={
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5.2 7-5.2s5.8 1.6 7 5.2"/>',
  hash:'<path d="M5 9h14M5 15h14M10 4l-1.5 16M15.5 4L14 20"/>',
  net:'<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8 20h8M12 16.5V20"/>'
};
function frow(icon,k,v,sub){
  return '<div class="frow"><span class="fi"><svg viewBox="0 0 24 24">'+icon+"</svg></span>"+
    '<span class="fx"><span class="fk">'+esc(k)+'</span><span class="fv">'+esc(v)+
    (sub?"<small>"+esc(sub)+"</small>":"")+"</span></span></div>";
}
function mapBlock(it){
  if(it.online)
    return '<div class="c-map online"><div class="mp-body"><div class="mp-ico">🖥</div>'+
      "<b>Онлайн-пара</b><span>Ссылка — в LMS</span></div></div>";
  var fl=floorOf(it);
  return '<div class="c-map">'+
    '<div class="mp-head"><span>'+(fl?fl+" этаж":"Корпус")+"</span>"+
      "<span>"+esc(it.building||"")+"</span></div>"+
    '<div class="mp-body" id="cardMap"></div>'+
  "</div>";
}
function openCard(gr,day){
  var it=gr.it, kd=kindOf(it), card=$("card");
  var exact=gr.parts.map(function(p){ return p.start+"–"+p.end; }).join(", ");
  card.style.setProperty("--c",kd.c);
  card.innerHTML=
    '<div class="c-head">'+
      '<button class="c-close" aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'+
      '<div class="c-tags"><span class="tag solid">'+esc(kd.label)+"</span>"+
        (subjShort(it.subject)?'<span class="tag">'+esc(subjShort(it.subject))+"</span>":"")+
        '<span class="tag muted">'+esc(FULL[day.key]+", "+fmtShort(day.date))+"</span></div>"+
      "<h3>"+esc(it.subject)+"</h3>"+
      '<div class="c-room'+(it.online?" on":"")+'">'+(it.online?"Онлайн":esc(roomShort(it.room)||"—"))+
        (!it.online&&it.building?"<small>"+esc([it.building,it.note].filter(Boolean).join(" · "))+"</small>":"")+
      "</div>"+
    "</div>"+
    '<div class="c-cols">'+
      '<div class="c-body">'+
        frow(IC.clock,"Время",hhmm(gr.s)+" – "+hhmm(gr.e),plural(gr.parts.length,"пара","пары","пар")+" · "+exact)+
        (it.online?frow(IC.net,"Формат","Онлайн","Ссылка — в системе университета"):"")+
        frow(IC.user,"Преподаватель",it.teacher||"Не назначен")+
        (it.code?frow(IC.hash,"Код курса",it.code):"")+
      "</div>"+
      mapBlock(it)+
    "</div>";
  card.querySelector(".c-close").onclick=closeCard;
  var mapHost=card.querySelector("#cardMap");
  if(mapHost && window.CampusMap) CampusMap.mini(mapHost, it.room);
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
  function dark(){ var a=document.documentElement.getAttribute("data-theme");
    return a?a==="dark":matchMedia("(prefers-color-scheme:dark)").matches; }
  function apply(v){
    if(v) document.documentElement.setAttribute("data-theme",v);
    else document.documentElement.removeAttribute("data-theme");
    btn.innerHTML='<svg viewBox="0 0 24 24">'+(dark()?SUN:MOON)+"</svg>";
    var meta=document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute("content",dark()?"#0e1013":"#f6f6f7");
  }
  var saved=null; try{ saved=localStorage.getItem("theme"); }catch(e){}
  apply(saved);
  btn.onclick=function(){ var v=dark()?"light":"dark";
    try{ localStorage.setItem("theme",v); }catch(e){} apply(v); };
})();

/* ============ прошедшие пары ============ */
function markPast(){
  if(TODAY<0||dayState(DAYS[TODAY].date).kind!=="study") return;
  var n=nowMin(), list=blocks(DAYS[TODAY].key);
  var col=body.querySelectorAll(".col")[TODAY-week*6];
  var page=pager.children[TODAY];
  var sets=[];
  if(col&&Math.floor(TODAY/6)===week) sets.push(col.querySelectorAll(".ev"));
  if(page) sets.push(page.querySelectorAll(".row"));
  sets.forEach(function(nodes){
    for(var i=0;i<nodes.length;i++){
      var g=list[i]; if(!g) break;
      nodes[i].classList.toggle("past",n>=g.re);
      nodes[i].classList.toggle("live",n>=g.rs&&n<g.re);
    }
  });
}

/* ============ старт ============ */
buildMobile(); buildTabs(); renderWeek(0); renderStatus();
var START=(function(){
  if(TODAY>=0 && dayState(DAYS[TODAY].date).kind==="study" && blocks(DAYS[TODAY].key).length) return TODAY;
  for(var i=week*6;i<DAYS.length;i++)
    if(dayState(DAYS[i].date).kind==="study" && blocks(DAYS[i].key).length) return i;
  return CUR;
})();
goPage(START,false);
$("mapBtn").onclick=function(){ if(window.CampusMap) CampusMap.open(null); };
$("todayBtn").onclick=function(){
  var t = TODAY>=0 ? TODAY : START;
  goWeek(Math.floor(t/6)); goPage(t,true);
};
$("todayBtn").querySelector(".tt").textContent=fmtShort(new Date());
tick(); setInterval(tick,1000);
setInterval(function(){ renderStatus(); tick(); markPast(); },30000);
var rz;
window.addEventListener("resize",function(){
  clearTimeout(rz); rz=setTimeout(function(){ fitEvents(); goPage(curPage(),false); },140);
});
document.addEventListener("visibilitychange",function(){
  if(!document.hidden){ renderStatus(); tick(); markPast(); }
});
/* офлайн-кэш только на боевом домене, локально он мешает разработке */
if("serviceWorker" in navigator){
  if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)){
    navigator.serviceWorker.getRegistrations().then(function(rs){ rs.forEach(function(r){ r.unregister(); }); });
    if(window.caches) caches.keys().then(function(ks){ ks.forEach(function(k){ caches.delete(k); }); });
  }else{
    window.addEventListener("load",function(){ navigator.serviceWorker.register("sw.js"); });
  }
}
})();
