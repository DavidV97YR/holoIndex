// holoIndex — main app logic
// Refactored from inline script with these changes vs. original:
//   - All CSV-derived strings escaped via _esc() before HTML interpolation
//   - URLs validated via _safeUrl() before insertion (only http/https)
//   - Inline onclick attributes replaced with delegated listeners (data-* attrs)
//   - Inline onerror replaced with single capture-phase error listener
//   - Fetches use AbortController timeout + 1 retry; errors surface in #error-banner

// ─── DOM REFS ────────────────────────────────────────────────────────────────
const _elStatusBar=document.getElementById('status-bar');
const _elToast=document.getElementById('toast');
const _elDetailOverlay=document.getElementById('detail-overlay');
const _elDetailPanel=document.getElementById('detail-panel');
const _elDetailImgSide=document.getElementById('detail-fullimg-side');
const _elDetailContent=document.getElementById('detail-content');
const _elDetailBack=document.getElementById('detail-back');
const _elDayOverlay=document.getElementById('day-overlay');
const _elDayContent=document.getElementById('day-content');
const _elYearSwitcher=document.getElementById('year-switcher');
const _elSearchInput=document.getElementById('search-input');
const _elErrorBanner=document.getElementById('error-banner');
const _elPanes={
  monthly:document.getElementById('pane-monthly'),
  timeline:document.getElementById('pane-timeline'),
  upcoming:document.getElementById('pane-upcoming'),
  weekly:document.getElementById('pane-weekly'),
};
const _elViewTabs=Array.from(document.querySelectorAll('.view-tab'));
const _elFilterBtns=Array.from(document.querySelectorAll('.filter-btn[data-branch]'));
const _elFilterBtnsNonEvent=_elFilterBtns.filter(b=>b.dataset.branch!=='Events');
const _elEventsBtn=document.querySelector('.filter-btn[data-branch="Events"]');

// ─── ESCAPING / SANITIZATION ─────────────────────────────────────────────────
// Escape arbitrary string for safe insertion into HTML text or quoted attribute
const _ESC_MAP={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function _esc(s){
  if(s==null)return '';
  return String(s).replace(/[&<>"']/g,c=>_ESC_MAP[c]);
}
// Validate URL — accepts only http(s) absolute or scheme-relative URLs.
// Returns the escaped URL on success, '' on failure.
function _safeUrl(s){
  if(!s)return '';
  const t=String(s).trim();
  if(!t)return '';
  // Reject javascript:, data:, vbscript:, file:, etc.
  if(/^(javascript|data|vbscript|file):/i.test(t))return '';
  // Allow http(s)://, //, or relative paths
  if(/^(https?:)?\/\//i.test(t)||/^[\w./-]+$/.test(t)){
    return _esc(t);
  }
  return '';
}

// ─── CLOCKS / TIMERS ─────────────────────────────────────────────────────────
// (clock display ticker now lives in shared.js)

// Live-tick all sub-week countdown spans (data-cd-date attribute)
setInterval(function(){
  if(state.view==='monthly'||state.view==='weekly'||state.view==='upcoming'){
    document.querySelectorAll('[data-cd-date]').forEach(function(el){
      const target=new Date(el.dataset.cdDate);
      const sc=secsUntil(target);
      if(sc<=0){el.textContent='🎉 Today!';el.removeAttribute('data-cd-date');}
      else{el.textContent=shortCountdownStr(sc);}
    });
  }
  if(state.view==='monthly'){
    const nubBanner=document.getElementById('next-up-banner');
    if(nubBanner&&nubBanner.dataset.targetDate){
      const nubSc=secsUntil(new Date(nubBanner.dataset.targetDate));
      if(nubSc<=0){nubBanner.removeAttribute('data-target-date');}
      else{
        const {d:nubDv,h:nubHv,m:nubMv,s:nubSv}=_splitSecs(nubSc);
        nubBanner.querySelectorAll('[data-nub-unit]').forEach(function(span){
          switch(span.dataset.nubUnit){case 'd':span.textContent=nubDv;break;case 'h':span.textContent=nubHv;break;case 'm':span.textContent=nubMv;break;case 's':span.textContent=nubSv;break;}
        });
      }
    }
  }
  if(state.view==='upcoming'){
    const heroCountdown=document.getElementById('upcoming-hero-countdown');
    if(heroCountdown&&heroCountdown.dataset.targetDate){
      const sc=secsUntil(new Date(heroCountdown.dataset.targetDate));
      if(sc<=0){_renderKeys.upcoming=null;renderAll();}
      else{
        const {d:dv,h:hv,m:mv,s:sv}=_splitSecs(sc);
        heroCountdown.querySelectorAll('.countdown-unit[data-unit]').forEach(function(unit){
          const span=unit.querySelector('.countdown-num');const lbl=unit.querySelector('.countdown-lbl');if(!span)return;
          switch(unit.dataset.unit){case 'd':span.textContent=dv;if(lbl)lbl.textContent='Day'+(dv!==1?'s':'');break;case 'h':span.textContent=hv;break;case 'm':span.textContent=mv;break;case 's':span.textContent=sv;break;}
        });
      }
    }
  }
  if(_elDetailOverlay.classList.contains('open')){
    _elDetailOverlay.querySelectorAll('.detail-countdown[data-target-date]').forEach(function(box){
      const sc=secsUntil(new Date(box.dataset.targetDate));
      if(sc<=0)return;
      const {d:dv,h:hv,m:mv,s:sv}=_splitSecs(sc);
      box.querySelectorAll('.countdown-unit[data-unit]').forEach(function(unit){
        const span=unit.querySelector('.countdown-num');
        const lbl=unit.querySelector('.countdown-lbl');
        if(!span)return;
        switch(unit.dataset.unit){
          case 'd': span.textContent=dv; if(lbl)lbl.textContent='Day'+(dv!==1?'s':''); break;
          case 'h': span.textContent=hv; break;
          case 'm': span.textContent=mv; break;
          case 's': span.textContent=sv; break;
        }
      });
    });
  }
},1000);

// Auto-refresh just after midnight — resets TODAY cache and daysUntil memoization
(function scheduleMidnightRefresh(){
  const now=new Date();
  const tomorrow=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,5,0);
  setTimeout(()=>{
    _TODAY=_makeToday();
    _daysCache.clear();
    _renderKeys.monthly=_renderKeys.timeline=_renderKeys.upcoming=_renderKeys.weekly=null;
    renderAll();
    scheduleMidnightRefresh();
  },tomorrow-now);
})();

function _makeToday(){const t=new Date();t.setHours(0,0,0,0);return t;}
let _TODAY=_makeToday();
function getToday(){return _TODAY;}

const _mmddCache=new Map();
function parseMMDD(str){
  if(!str)return null;
  if(_mmddCache.has(str))return _mmddCache.get(str);
  const parts=str.split('/');
  if(parts.length<2)return null;
  const result={month:parseInt(parts[0]),day:parseInt(parts[1])};
  _mmddCache.set(str,result);
  return result;
}

const _daysCache=new Map();
function daysUntil(date){
  const d=new Date(date);d.setHours(0,0,0,0);
  const key=d.getTime();
  if(_daysCache.has(key))return _daysCache.get(key);
  const now=_TODAY;
  const result=Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/(1000*60*60*24));
  _daysCache.set(key,result);
  return result;
}
function secsUntil(date){return (new Date(date)-new Date())/1000;}
function shortCountdownStr(totalSecs){
  const s=Math.max(0,Math.floor(totalSecs));
  const d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60),sec=s%60;
  const parts=[];
  if(d>0)parts.push(`${d}d`);
  parts.push(`${h}h`);
  parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}
function nextOccurrence(entry,year){
  const bd=parseMMDD(entry.Birthday);if(!bd)return null;
  const now=getToday();
  let d=new Date(year,bd.month-1,bd.day);d.setHours(0,0,0,0);
  if(entry.Type==='event')return d<now?null:d;
  if(d<now)d=new Date(year+1,bd.month-1,bd.day);
  return d;
}
const CURRENT_YEAR=_TODAY.getFullYear();
const START_YEAR=2023;
const DAY_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sa'];
const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS=['Su','Mo','Tu','We','Th','Fr','Sa'];
const _fmtLong=new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric'});
const _fmtShort=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'});
const _GRAD_BOTH='background:linear-gradient(90deg,#ff6eb4,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;display:inline-block';

function _splitSecs(sc){const ss=Math.max(0,Math.floor(sc));return{d:Math.floor(ss/86400),h:Math.floor((ss%86400)/3600),m:Math.floor((ss%3600)/60),s:ss%60};}

// Avatar HTML — escapes URL/name/emoji and uses data-fallback-emoji (no inline onerror)
function _avHtml(e,size){
  const sz=size||'width:100%;height:100%;object-fit:cover;';
  const url=_safeUrl(e.AvatarURL);
  const emoji=_esc(e.Emoji||'⭐');
  if(url){
    const name=_esc(e.Name||'');
    return `<img src="${url}" loading="lazy" decoding="async" alt="${name}" style="${sz}" data-fallback-emoji="${emoji}">`;
  }
  return `<div class="grad-circle">${emoji}</div>`;
}

// Capture-phase error handler — replaces broken images with emoji fallback (no inline JS)
document.addEventListener('error',function(ev){
  const t=ev.target;
  if(t&&t.tagName==='IMG'&&t.dataset&&t.dataset.fallbackEmoji!=null){
    const emoji=t.dataset.fallbackEmoji||'⭐';
    const parent=t.parentElement;
    if(parent){
      // Use textContent to avoid re-introducing HTML
      parent.textContent='';
      const div=document.createElement('div');
      div.className='grad-circle';
      div.textContent=emoji;
      parent.appendChild(div);
    }
  }
},true);

function _buildUpcomingWithDebuts(data,year){
  const debutList=[];
  data.filter(e=>!e._isDebutRow&&e.DebutDate&&e.DebutDate.trim()).forEach(e=>{
    const p=e.DebutDate.split('/');if(p.length<2)return;
    const bd=parseMMDD(e.Birthday);
    const dm=parseInt(p[0]),dd=parseInt(p[1]);
    if(bd&&(bd.month-1)===dm-1&&bd.day===dd)return;
    let next=new Date(year,dm-1,dd);if(next<getToday())next=new Date(year+1,dm-1,dd);
    debutList.push({...e,_isDebutRow:true,_debutDay:dd,nextDate:next,daysAway:daysUntil(next)});
  });
  return [...data.map(e=>{const next=nextOccurrence(e,year);if(!next)return null;return{...e,nextDate:next,daysAway:daysUntil(next)};}).filter(Boolean),...debutList].sort((a,b)=>a.daysAway-b.daysAway);
}

let state={allData:{},activeYear:CURRENT_YEAR,view:'monthly',branch:'All',eventsOnly:false,search:'',weekOffset:0};

const HARDCODED_SOURCES={
  talent:'https://docs.google.com/spreadsheets/d/e/2PACX-1vSEIhZ_po3sNeLMC7RiLdDkpOHdwrz5gnm3_W77vVQx1fSB2ai4iMusw-2wEdaEvg/pub?output=csv',
  years:{
    2026:'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ5aU7GlR7kXQr4Mzjx_xSxVyEELBkKqE7fawfoR6C7PKuqGcCV8_kj1CnzWbktVQ/pub?gid=557144788&single=true&output=csv',
    2025:'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ5aU7GlR7kXQr4Mzjx_xSxVyEELBkKqE7fawfoR6C7PKuqGcCV8_kj1CnzWbktVQ/pub?gid=1916616069&single=true&output=csv',
    2024:'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ5aU7GlR7kXQr4Mzjx_xSxVyEELBkKqE7fawfoR6C7PKuqGcCV8_kj1CnzWbktVQ/pub?gid=229608710&single=true&output=csv',
    2023:'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ5aU7GlR7kXQr4Mzjx_xSxVyEELBkKqE7fawfoR6C7PKuqGcCV8_kj1CnzWbktVQ/pub?gid=2015080423&single=true&output=csv',
  }
};

let _filteredCache={key:null,data:null};
function getFilteredData(year){
  const cacheKey=`${year}|${state.eventsOnly}|${state.branch}|${state.search}`;
  if(_filteredCache.key===cacheKey)return _filteredCache.data;
  const data=(state.allData[year]||[]);
  const result=data.filter(e=>{
    if(state.eventsOnly)return e.Type==='event';
    if(state.branch==='All')return true;
    if(state.branch==='Events')return e.Type==='event';
    return e.Branch===state.branch;
  }).filter(e=>{
    if(!state.search)return true;
    const q=state.search.toLowerCase();
    return (e.Name&&e.Name.toLowerCase().includes(q))||(e.Generation&&e.Generation.toLowerCase().includes(q))||(e.Branch&&e.Branch.toLowerCase().includes(q))||(e.EventName&&e.EventName.toLowerCase().includes(q));
  });
  _filteredCache={key:cacheKey,data:result};
  return result;
}
function isArchive(){return state.activeYear!==CURRENT_YEAR;}

// Build the data-* attribute pair used by delegated click handlers
// Returns string like: data-entry-id="42" data-force-type="both"
function _entryAttrs(e,forceType){
  const id=e._id;
  if(id==null)return ''; // should not happen — every entry gets an id at load time
  return `data-entry-id="${id}"${forceType?` data-force-type="${_esc(forceType)}"`:''}`;
}

function renderMiniCal(year,month,birthdayDays,eventDays,large=false,entries=[],debutDays=[]){
  const firstDay=new Date(year,month,1).getDay(),daysInMonth=new Date(year,month+1,0).getDate();
  const _today=getToday();const todayInMonth=(_today.getFullYear()===year&&_today.getMonth()===month)?_today.getDate():null;
  let html=`<div class="mini-cal"><div class="mini-cal-grid${large?' large-grid':''}">`;
  DAY_LABELS.forEach(l=>html+=`<div class="mini-cal-day-label">${l}</div>`);
  for(let i=0;i<firstDay;i++)html+=`<div class="mini-cal-cell${large?' large':''} empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const hasBd=birthdayDays.includes(d),hasEv=eventDays.includes(d),hasDe=debutDays.includes(d),isToday=todayInMonth===d;
    const clickable=hasBd||hasEv||hasDe;
    const cls=['mini-cal-cell',large?'large':'',hasBd?'has-birthday':'',hasEv?'has-event':'',hasDe?'has-debut':'',isToday?'today':''].filter(Boolean).join(' ');
    const dayAttrs=clickable?` data-day-cell="${year}|${month}|${d}"`:'';
    html+=`<div class="${cls}"${dayAttrs}>${d}`;
    if(large&&isToday)html+=`<span class="today-dot"></span>`;
    html+=`</div>`;
  }
  return html+`</div></div>`;
}

function entryRowHTML(e,year,showCountdown=true,compact=false){
  const isDebutRow=e._isDebutRow===true;
  const bd=isDebutRow?{month:parseInt(e.DebutDate.split('/')[0]),day:e._debutDay}:parseMMDD(e.Birthday);
  const isEvent=e.Type==='event';
  const bdForBoth=!isDebutRow&&!isEvent&&e.DebutDate&&e.DebutDate.trim()&&bd;
  const isBoth=bdForBoth&&(()=>{const p=e.DebutDate.split('/');return p.length>=2&&parseInt(p[0])-1===bd.month-1&&parseInt(p[1])===bd.day;})();
  let cdHTML='';
  if(showCountdown&&!isArchive()&&bd){
    const days=daysUntil(new Date(year,bd.month-1,bd.day));
    const cdDate=new Date(year,bd.month-1,bd.day);
    if(isDebutRow){
      if(days===0)cdHTML=`<span class="bday-countdown cyan">🎉 Today!</span>`;
      else if(days>0&&days<=7){const sc=secsUntil(cdDate);cdHTML=`<span class="bday-countdown cyan" data-cd-date="${cdDate.toISOString()}">${shortCountdownStr(sc)}</span>`;}
      else if(days>0)cdHTML=`<span class="bday-countdown cyan">in ${days}d</span>`;
      else cdHTML=`<span class="bday-countdown past">&#10003; done</span>`;
    } else {
      if(days===0)cdHTML=`<span class="bday-countdown teal">🎉 Today!</span>`;
      else if(days>0&&days<=7){const sc=secsUntil(cdDate);const cls=isBoth?'both':isEvent?'gold':'';cdHTML=`<span class="bday-countdown ${cls}" data-cd-date="${cdDate.toISOString()}">${shortCountdownStr(sc)}</span>`;}
      else if(days>0)cdHTML=`<span class="bday-countdown ${isBoth?'both':isEvent?'gold':''}">in ${days}d</span>`;
      else cdHTML=`<span class="bday-countdown past">&#10003; done</span>`;
    }
  }
  const rowClass=isBoth?'is-both':isDebutRow?'is-debut':(isEvent?'is-event':'');
  const badgeClass=isBoth?'pink-cyan':isDebutRow?'cyan':(isEvent?'gold':'');
  const nameClass=isBoth?'both-name':isDebutRow?'debut-name':(isEvent?'event-name':'');
  const displayName=_esc(isEvent?(e.EventName||e.Name):e.Name);
  const gen=_esc(e.Generation||e.Branch||'');
  return `<div class="bday-row-item ${rowClass}" ${_entryAttrs(e,isBoth?'both':undefined)}>
    <div class="bday-day-badge ${badgeClass}">${bd?bd.day:'?'}</div>
    <div class="bday-avatar">${_avHtml(e)}</div>
    <div class="bday-info">
      <span class="bday-name ${nameClass}">${displayName}</span>
      ${compact?'':` <span class="bday-gen">${gen}</span>`}
    </div>
    ${cdHTML}
  </div>`;
}

function renderMonthly(){
  const pane=_elPanes.monthly;
  const year=state.activeYear;
  const data=getFilteredData(year);
  let html='';

  const byMonth=Array.from({length:12},()=>({bdEntries:[],debutEntries:[],debutDays:[],birthdayDays:[],eventDays:[]}));
  data.forEach(e=>{
    const bd=parseMMDD(e.Birthday);
    if(bd){
      const m=bd.month-1;
      byMonth[m].bdEntries.push(e);
      if(e.Type==='event') byMonth[m].eventDays.push(bd.day);
      else byMonth[m].birthdayDays.push(bd.day);
    }
    if(e.DebutDate&&e.DebutDate.trim()){
      const p=e.DebutDate.split('/');
      if(p.length>=2){
        const dm=parseInt(p[0])-1,dd=parseInt(p[1]);
        byMonth[dm].debutDays.push(dd);
        if(!(bd&&(bd.month-1)===dm&&bd.day===dd)){
          byMonth[dm].debutEntries.push({...e,_isDebutRow:true,_debutDay:dd});
        }
      }
    }
  });
  byMonth.forEach(m=>{
    m.bdEntries.sort((a,b)=>parseMMDD(a.Birthday).day-parseMMDD(b.Birthday).day);
  });

  _buildDayMap(data,year);

  if(!isArchive()){
    (function(){
      const withDays=_buildUpcomingWithDebuts(data,year);
      if(!withDays.length)return;
      const nx=withDays[0],nd=nx.daysAway,isEv=nx.Type==='event';
      let cdHtml='';
      if(nd===0){
        cdHtml=`<span class="nub-today">🎉 Today!</span>`;
      } else {
        const {d:dv,h:hv,m:mv,s:sv}=_splitSecs(secsUntil(nx.nextDate));
        const unitCls=isEv?'gold-unit':'';const numCls=isEv?'gold-num':'';
        if(dv>0)cdHtml+=`<div class="nub-countdown-unit ${unitCls}"><span class="nub-num ${numCls}" data-nub-unit="d">${dv}</span><span class="nub-lbl">Day${dv!==1?'s':''}</span></div>`;
        cdHtml+=`<div class="nub-countdown-unit ${unitCls}"><span class="nub-num ${numCls}" data-nub-unit="h">${hv}</span><span class="nub-lbl">Hrs</span></div>`;
        cdHtml+=`<div class="nub-countdown-unit ${unitCls}"><span class="nub-num ${numCls}" data-nub-unit="m">${mv}</span><span class="nub-lbl">Min</span></div>`;
        cdHtml+=`<div class="nub-countdown-unit ${unitCls}"><span class="nub-num ${numCls}" data-nub-unit="s">${sv}</span><span class="nub-lbl">Sec</span></div>`;
      }
      const displayNm=_esc(isEv?(nx.EventName||nx.Name):nx.Name);
      const dateStr=nd===0?'Today!':_esc(_fmtLong.format(nx.nextDate));
      html+=`<div class="next-up-banner${isEv?' is-event-banner':''}" id="next-up-banner" data-target-date="${nx.nextDate.toISOString()}" ${_entryAttrs(nx)}>
        <div><div class="nub-label">${nd===0?'Today':'Next Up'}</div><div class="nub-avatar">${_avHtml(nx)}</div></div>
        <div class="nub-info"><div class="nub-name">${displayNm}</div><div class="nub-date">${dateStr}</div></div>
        <div class="nub-countdown" id="nub-countdown-units">${cdHtml}</div>
        <span class="nub-arrow">›</span>
      </div>`;
    })();

    const curMonth=getToday().getMonth();
    const {bdEntries:monthEntries,debutEntries:debutEntries_feat,debutDays:debutDays_feat,birthdayDays,eventDays}=byMonth[curMonth];
    html+=`<div class="this-month-divider">✶ This Month ✶</div>`;
    html+=`<div class="this-month-panel"><div class="this-month-inner">`;
    html+=`<div class="this-month-cal">`;
    const totalFeatCount=monthEntries.length+debutEntries_feat.length;
    html+=`<div class="this-month-cal-header"><div class="this-month-cal-title">${MONTH_NAMES[curMonth]}</div><div class="this-month-cal-year">${year}</div><div class="this-month-cal-count">${totalFeatCount} item${totalFeatCount!==1?'s':''}</div></div>`;
    html+=`<div class="this-month-cal-body">${renderMiniCal(year,curMonth,birthdayDays,eventDays,true,monthEntries,debutDays_feat)}</div>`;
    html+=`</div>`;
    html+=`<div class="this-month-list">`;
    html+=`<div class="this-month-list-header">Birthdays &amp; Events</div>`;
    const allFeatEntries=[...monthEntries,...debutEntries_feat].sort((a,b)=>{
      const da=a._isDebutRow?a._debutDay:parseMMDD(a.Birthday)?.day||0;
      const db=b._isDebutRow?b._debutDay:parseMMDD(b.Birthday)?.day||0;
      return da-db;
    });
    if(!allFeatEntries.length)html+=`<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px;">No entries this month</div>`;
    allFeatEntries.forEach(e=>html+=entryRowHTML(e,year,true));
    html+=`</div></div></div>`;
  }else{
    html+=`<div style="text-align:center;margin-bottom:16px"><span class="archive-label">📁 Archive: ${year}</span></div>`;
  }

  html+=`<div class="months-grid" id="months-grid-inner">`;
  for(let m=0;m<12;m++){
    const {bdEntries:me,debutEntries:de,debutDays:dd,birthdayDays:bdays,eventDays:edays}=byMonth[m];
    const totalCount=me.length+de.length;
    html+=`<div class="month-card" data-month="${m}">`;
    html+=`<div class="month-card-header"><div class="month-card-name">${MONTH_NAMES[m]}</div><div class="month-card-count">${totalCount}</div></div>`;
    html+=`<div class="month-card-cal">${renderMiniCal(year,m,bdays,edays,false,me,dd)}</div>`;
    html+=`<div class="month-entries" data-entries-pending="1"></div>`;
    html+=`</div>`;
  }
  html+=`</div>`;
  pane.innerHTML=html;

  const _monthByMonth=byMonth;
  const _yearSnap=year;
  const observer=new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      const card=entry.target;
      const m=parseInt(card.dataset.month);
      const entriesEl=card.querySelector('.month-entries[data-entries-pending]');
      if(!entriesEl)return;
      entriesEl.removeAttribute('data-entries-pending');
      observer.unobserve(card);
      const {bdEntries:me,debutEntries:de}=_monthByMonth[m];
      const allGridEntries=[...me,...de].sort((a,b)=>{
        const da=a._isDebutRow?a._debutDay:parseMMDD(a.Birthday)?.day||0;
        const db=b._isDebutRow?b._debutDay:parseMMDD(b.Birthday)?.day||0;
        return da-db;
      });
      let rowHtml='';
      allGridEntries.forEach(e=>rowHtml+=entryRowHTML(e,_yearSnap,true,true));
      if(!allGridEntries.length)rowHtml=`<div style="font-size:11px;color:var(--text-muted);padding:4px 8px;">No entries</div>`;
      entriesEl.innerHTML=rowHtml;
    });
  },{rootMargin:'200px'});

  pane.querySelectorAll('.month-card[data-month]').forEach(card=>observer.observe(card));
}

function renderTimeline(){
  const pane=_elPanes.timeline;
  const year=state.activeYear;
  const data=getFilteredData(year);
  let hasAny=false;
  let html='';
  if(isArchive())html+=`<div style="text-align:center;margin-bottom:16px"><span class="archive-label">📁 Archive: ${year}</span></div>`;
  const parsed=data.map(e=>({e, bd:parseMMDD(e.Birthday)}));
  for(let m=0;m<12;m++){
    const me=parsed.filter(({bd})=>bd&&(bd.month-1)===m).sort((a,b)=>a.bd.day-b.bd.day).map(({e})=>e);
    const debutMe=[];
    data.forEach(e=>{
      if(!e.DebutDate||!e.DebutDate.trim())return;
      const p=e.DebutDate.split('/');
      if(p.length<2||parseInt(p[0])-1!==m)return;
      const dd=parseInt(p[1]);
      const bd=parseMMDD(e.Birthday);
      if(bd&&(bd.month-1)===m&&bd.day===dd)return;
      debutMe.push({...e,_isDebutRow:true,_debutDay:dd});
    });
    const allMe=[...me,...debutMe].sort((a,b)=>{
      const da=a._isDebutRow?a._debutDay:parseMMDD(a.Birthday)?.day||0;
      const db=b._isDebutRow?b._debutDay:parseMMDD(b.Birthday)?.day||0;
      return da-db;
    });
    if(!allMe.length)continue;
    hasAny=true;
    html+=`<div class="timeline-month"><div class="timeline-month-title">${MONTH_NAMES[m]} <span style="color:var(--text-muted);font-size:13px;font-family:'Zen Kaku Gothic New'">${allMe.length} entries</span></div><div class="timeline-scroll">`;
    allMe.forEach(e=>{
      const isDebutRow=e._isDebutRow===true;
      const bd=isDebutRow?{month:m+1,day:e._debutDay}:parseMMDD(e.Birthday);
      const isEvent=e.Type==='event';
      const tlBd=isDebutRow?parseMMDD(e.Birthday):bd;
      const tlIsBoth=!isDebutRow&&!isEvent&&e.DebutDate&&e.DebutDate.trim()&&tlBd&&(()=>{const p=e.DebutDate.split('/');return p.length>=2&&parseInt(p[0])-1===m&&parseInt(p[1])===tlBd.day;})();
      const cardClass=tlIsBoth?'both-card':isDebutRow?'debut-card':isEvent?'event-card':'';
      const bdAlsoMatchesTl=tlBd&&tlBd.month-1===m&&tlBd.day===e._debutDay;
      const ft=tlIsBoth?'both':isDebutRow?(bdAlsoMatchesTl?'both':'debut'):undefined;
      const displayName=_esc(isEvent?(e.EventName||e.Name):e.Name);
      const gen=_esc(tlIsBoth?'Birthday & Debut':isDebutRow?'Debut':isEvent?'Event':(e.Generation||e.Branch));
      html+=`<div class="timeline-card ${cardClass}" ${_entryAttrs(e,ft)}>`;
      html+=`<div class="tl-date-circle">${bd.day}</div><div class="tl-avatar">${_avHtml(e)}</div>`;
      html+=`<div class="tl-name ${tlIsBoth?'both-name':''}">${displayName}</div>`;
      html+=`<div class="tl-gen-badge">${gen}</div>`;
      html+=`</div>`;
    });
    html+=`</div></div>`;
  }
  if(!hasAny)html+=`<div class="empty-state"><span class="emoji">🔍</span>No entries found</div>`;
  pane.innerHTML=html;
}

function renderUpcoming(){
  const pane=_elPanes.upcoming;
  const year=state.activeYear;
  const data=getFilteredData(year);
  if(isArchive()){
    const sorted=[...data].sort((a,b)=>{const ba=parseMMDD(a.Birthday),bb=parseMMDD(b.Birthday);if(!ba||!bb)return 0;return ba.month!==bb.month?ba.month-bb.month:ba.day-bb.day;});
    let html=`<div style="text-align:center;margin-bottom:16px"><span class="archive-label">📁 Archive: ${year}</span></div><div class="upcoming-list">`;
    sorted.forEach(e=>{
      const bd=parseMMDD(e.Birthday),isEvent=e.Type==='event';
      const displayName=_esc(isEvent?(e.EventName||e.Name):e.Name);
      const sub=_esc((e.Generation||e.Branch||''))+(bd?` • ${MONTH_NAMES[bd.month-1]} ${bd.day}`:'');
      html+=`<div class="upcoming-item ${isEvent?'event-item':''}" ${_entryAttrs(e)}><div class="up-avatar">${_avHtml(e)}</div><div class="up-info"><div class="up-name">${displayName}</div><div class="up-sub">${sub}</div></div><span class="up-time muted">${bd?`${bd.month}/${bd.day}`:''}</span></div>`;
    });
    pane.innerHTML=html+'</div>';return;
  }
  const withDays=_buildUpcomingWithDebuts(data,year);
  if(!withDays.length){pane.innerHTML='<div class="empty-state"><span class="emoji">🔍</span>No entries found</div>';return;}
  const next=withDays[0],isNextEvent=next.Type==='event',nd=next.daysAway;
  let h=`<div class="upcoming-next"><div><div class="upcoming-avatar">${_avHtml(next)}</div></div><div class="upcoming-info"><div class="upcoming-label">${nd===0?'Today!':'Next Up'}</div>`;
  h+=`<div class="upcoming-name">${_esc(isNextEvent?(next.EventName||next.Name):next.Name)}</div>`;
  h+=`<div class="upcoming-date">${_esc(_fmtLong.format(next.nextDate))}</div>`;
  if(nd===0){h+=`<div class="today-badge">🎉 Today!</div>`;}
  else{
    const {d:dv,h:hv,m:mv,s:sv}=_splitSecs(secsUntil(next.nextDate));
    h+=`<div class="upcoming-countdown" id="upcoming-hero-countdown" data-target-date="${next.nextDate.toISOString()}">`;
    if(dv>0)h+=`<div class="countdown-unit" data-unit="d"><span class="countdown-num">${dv}</span><span class="countdown-lbl">Day${dv!==1?'s':''}</span></div>`;
    h+=`<div class="countdown-unit" data-unit="h"><span class="countdown-num">${hv}</span><span class="countdown-lbl">Hrs</span></div>`;
    h+=`<div class="countdown-unit" data-unit="m"><span class="countdown-num">${mv}</span><span class="countdown-lbl">Min</span></div>`;
    h+=`<div class="countdown-unit" data-unit="s"><span class="countdown-num">${sv}</span><span class="countdown-lbl">Sec</span></div>`;
    h+=`</div>`;
  }
  h+=`</div></div><div class="upcoming-list">`;
  withDays.forEach(e=>{
    const isEvent=e.Type==='event',d=e.daysAway;
    const timeStr=d===0?'Today!':d===1?'Tomorrow':d<=7?shortCountdownStr(secsUntil(e.nextDate)):`${d}d`;
    const isDebutRow_up=e._isDebutRow===true;
    const bdUp=parseMMDD(e.Birthday);
    const upNextDate=e.nextDate;
    const bdAlsoMatchesUp=bdUp&&upNextDate&&bdUp.month-1===upNextDate.getMonth()&&bdUp.day===upNextDate.getDate();
    const upIsBoth=!isDebutRow_up&&!isEvent&&e.DebutDate&&e.DebutDate.trim()&&bdUp&&(()=>{const p=e.DebutDate.split('/');if(p.length<2)return false;const dm=parseInt(p[0])-1,dd=parseInt(p[1]);return upNextDate&&dm===upNextDate.getMonth()&&dd===upNextDate.getDate();})();
    const itemClass=upIsBoth?'both-item':isDebutRow_up?'debut-item':isEvent?'event-item':'';
    const upName=_esc(isEvent?(e.EventName||e.Name):e.Name);
    const upSub=_esc((upIsBoth?'Birthday & Debut':isDebutRow_up?'Debut':(e.Generation||e.Branch||'')))+' • '+_esc(_fmtShort.format(e.nextDate));
    const upTc=d===0?'teal':isDebutRow_up?'cyan':isEvent?'gold':'';
    const upFt=upIsBoth?'both':isDebutRow_up?(bdAlsoMatchesUp?'both':'debut'):undefined;
    const upNameInner=upIsBoth?`<span style="${_GRAD_BOTH}">${upName}</span>`:upName;
    const cdAttr=d>0&&d<=7?` data-cd-date="${e.nextDate.toISOString()}"`:'';
    const upTimeEl=upIsBoth?`<span class="up-time"${cdAttr} style="${_GRAD_BOTH}">${timeStr}</span>`:`<span class="up-time ${upTc}"${cdAttr}>${timeStr}</span>`;
    h+=`<div class="upcoming-item ${itemClass}" ${_entryAttrs(e,upFt)}><div class="up-avatar">${_avHtml(e)}</div><div class="up-info"><div class="up-name">${upNameInner}</div><div class="up-sub">${upSub}</div></div>${upTimeEl}</div>`;
  });
  pane.innerHTML=h+`</div>`;
}

function renderWeekly(){
  const pane=_elPanes.weekly;
  const year=state.activeYear,data=getFilteredData(year);
  const td=_TODAY;
  let base=isArchive()?new Date(year,0,1):new Date(td);
  base.setDate(base.getDate()-base.getDay()+state.weekOffset*7);
  const days=Array.from({length:7},(_,i)=>{const d=new Date(base);d.setDate(base.getDate()+i);return d;});
  const fmtR=(a,b)=>_fmtShort.format(a)+' – '+_fmtShort.format(b)+', '+b.getFullYear();
  let html=`<div class="week-nav"><button class="week-nav-btn" data-week-nav="-1">← Prev</button><span class="week-range">${_esc(fmtR(days[0],days[6]))}</span><button class="week-nav-btn" data-week-nav="1">Next →</button></div><div class="week-grid-scroll"><div class="week-grid">`;
  days.forEach(day=>{
    const isToday=day.getFullYear()===td.getFullYear()&&day.getMonth()===td.getMonth()&&day.getDate()===td.getDate(),m=day.getMonth(),d=day.getDate();
    const de=data.filter(e=>{const bd=parseMMDD(e.Birthday);return bd&&bd.month-1===m&&bd.day===d;});
    const deDebut=data.filter(e=>{if(!e.DebutDate||!e.DebutDate.trim())return false;const p=e.DebutDate.split('/');if(!(p.length>=2&&parseInt(p[0])-1===m&&parseInt(p[1])===d))return false;const bd=parseMMDD(e.Birthday);return!(bd&&(bd.month-1)===m&&bd.day===d);}).map(e=>({...e,_isDebutRow:true,_debutDay:d}));
    const allDe=[...de,...deDebut];
    html+=`<div class="week-day-col ${isToday?'today-col':''}"><div class="week-day-header"><span class="week-day-name">${DAY_NAMES[day.getDay()]}</span><span class="week-day-num">${d}</span></div>`;
    allDe.forEach(e=>{
      const isDebutRow_w=e._isDebutRow===true;
      const isEvent=e.Type==='event';
      const bdW=parseMMDD(e.Birthday);
      const bdAlsoMatchesW=bdW&&bdW.month-1===m&&bdW.day===d;
      const wIsBoth=!isDebutRow_w&&!isEvent&&e.DebutDate&&e.DebutDate.trim()&&bdW&&(()=>{const p=e.DebutDate.split('/');return p.length>=2&&parseInt(p[0])-1===m&&parseInt(p[1])===d;})();
      const chipClass=wIsBoth?'both-chip':isDebutRow_w?'debut-chip':isEvent?'event-chip':'';
      const nameClass=wIsBoth?'both':isDebutRow_w?'cyan':isEvent?'gold':'';
      const displayName=_esc(isEvent?(e.EventName||e.Name):e.Name);
      const wFt=wIsBoth?'both':isDebutRow_w?(bdAlsoMatchesW?'both':'debut'):undefined;
      html+=`<div class="week-chip ${chipClass}" ${_entryAttrs(e,wFt)}><div class="chip-avatar">${_avHtml(e)}</div><span class="chip-name ${nameClass}">${displayName}</span></div>`;
    });
    html+=`</div>`;
  });
  pane.innerHTML=html+`</div></div>`;
}
function weekNav(dir){state.weekOffset+=dir;_renderKeys.weekly=null;renderAll();}

function _countdownBoxHTML(date, label, todayMsg, todayLabel, accentColor){
  const isPast=daysUntil(date)<0, days=isPast?-1:daysUntil(date);
  const borderColor=accentColor==='cyan'?'rgba(34,211,238,0.25)':'rgba(168,85,247,0.15)';
  const labelColor=accentColor==='cyan'?'var(--cyan)':'var(--text-dim)';
  const isoDate=date.toISOString();
  let inner='';
  if(isPast) inner=`<div style="font-size:22px;font-weight:700;color:var(--text-muted);letter-spacing:2px;">✓ Done</div>`;
  else if(days===0) inner=`<div class="today-badge">${todayMsg}</div>`;
  else {
    const {d:dv,h:hv,m:mv,s:sv}=_splitSecs(secsUntil(date));
    inner=`<div class="detail-countdown-nums">
      ${dv>0?`<div class="countdown-unit" data-unit="d"><span class="countdown-num">${dv}</span><span class="countdown-lbl">Day${dv!==1?'s':''}</span></div>`:''}
      <div class="countdown-unit" data-unit="h"><span class="countdown-num">${hv}</span><span class="countdown-lbl">Hrs</span></div>
      <div class="countdown-unit" data-unit="m"><span class="countdown-num">${mv}</span><span class="countdown-lbl">Min</span></div>
      <div class="countdown-unit" data-unit="s"><span class="countdown-num">${sv}</span><span class="countdown-lbl">Sec</span></div>
    </div>`;
  }
  return `<div class="detail-countdown" style="border-color:${borderColor};flex:1" data-target-date="${isoDate}"><div class="detail-countdown-label" style="color:${labelColor}">${isPast?'✓ '+label:days===0?todayLabel:'Days Until '+label}</div>${inner}</div>`;
}

function openDetail(eOrId,forceType){
  _elDetailBack.style.display='none';
  let e=eOrId;
  if(typeof e==='number'){e=_entryMap.get(e)||{};}
  else if(typeof e==='string'){
    // Look up by id (string form). No more JSON.parse — eliminates the parsing attack surface.
    const n=parseInt(e,10);
    if(!isNaN(n))e=_entryMap.get(n)||{};
    else e={};
  }
  const overlay=_elDetailOverlay;
  const panel=_elDetailPanel;
  const imgSide=_elDetailImgSide;
  const content=_elDetailContent;

  if(!e.Type||e.Type!=='event'&&e.ImageURL&&e.ImageURL.trim()){
    imgSide.style.display='none';
    panel.classList.remove('has-fullimg');
  }
  overlay.classList.add('open');

  requestAnimationFrame(()=>{
    const year=state.activeYear,isEvent=e.Type==='event',bd=parseMMDD(e.Birthday);
    let h='';
    if(isEvent){
      const imgUrl=_safeUrl(e.ImageURL);
      if(imgUrl){
        h+=`<div class="detail-avatar event-avatar" style="background-image:url('${imgUrl}');background-size:cover;background-position:center;background-color:rgba(146,64,14,0.3);border:2px solid var(--gold);"></div>`;
      } else {
        h+=`<div class="detail-avatar event-avatar" style="display:flex;align-items:center;justify-content:center;font-size:42px;background:linear-gradient(135deg,rgba(30,41,59,0.4),rgba(148,163,184,0.2));border:2px solid var(--gold);">${_esc(e.Emoji||'⭐')}</div>`;
      }
    } else {
      h+=`<div class="detail-avatar" style="display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">${_avHtml(e,'width:100%;height:100%;object-fit:cover;border-radius:50%;')}</div>`;
    }
    let badgesHTML='';
    if(isEvent){
      badgesHTML=`<span class="detail-type-badge event">Event</span>`;
    } else if(forceType==='debut'){
      badgesHTML=`<span class="detail-type-badge debut">Debut</span>`;
    } else if(forceType==='both'){
      badgesHTML=`<span class="detail-type-badge">Birthday</span> <span class="detail-type-badge debut">Debut</span>`;
    } else {
      badgesHTML=`<span class="detail-type-badge">Birthday</span>`;
      if(e.DebutDate&&e.DebutDate.trim()&&bd){
        const dp=e.DebutDate.split('/');
        if(dp.length>=2&&parseInt(dp[0])-1===bd.month-1&&parseInt(dp[1])===bd.day){
          badgesHTML+=` <span class="detail-type-badge debut">Debut</span>`;
        }
      }
    }
    h+=`<div style="text-align:center">${badgesHTML}`;
    h+=`<div class="detail-name">${_esc(isEvent?(e.EventName||e.Name):e.Name)}</div><div class="detail-gen">${_esc(e.Generation||'')}${e.Branch?' · '+_esc(e.Branch):''}</div></div>`;
    const infoRows=[];
    if(bd)infoRows.push(`<div class="detail-info-row"><span class="detail-info-label">${isEvent?'Date':'Birthday'}</span><span class="detail-info-value">${MONTH_NAMES[bd.month-1]} ${bd.day}</span></div>`);
    if(e.DebutDate&&e.DebutDate.trim())infoRows.push(`<div class="detail-info-row"><span class="detail-info-label">Debut</span><span class="detail-info-value">${_esc(e.DebutDate)}</span></div>`);
    if(e.Branch)infoRows.push(`<div class="detail-info-row"><span class="detail-info-label">Branch</span><span class="detail-info-value">${_esc(e.Branch)}</span></div>`);
    if(infoRows.length)h+=`<div class="detail-info-section">${infoRows.join('')}</div>`;
    if(!isArchive()&&bd){
      if(isEvent){
        const eventDate=new Date(year,bd.month-1,bd.day);
        const isPastEvent=daysUntil(eventDate)<0;
        const {d:dv,h:hv,m:mv,s:sv}=_splitSecs(secsUntil(eventDate));
        h+=`<div class="detail-countdown" ${isPastEvent?'style="border-color:rgba(90,63,122,0.2)"':''} data-target-date="${eventDate.toISOString()}">`;
        h+=`<div class="detail-countdown-label">${isPastEvent?'Event Completed':daysUntil(eventDate)===0?'🎉 TODAY!':'Days Until Event'}</div>`;
        if(isPastEvent) h+=`<div style="font-size:28px;font-weight:700;color:var(--text-muted);letter-spacing:2px;">✓ Done</div>`;
        else if(daysUntil(eventDate)===0) h+=`<div class="today-badge">${_esc(e.EventName||e.Name)} is Live!</div>`;
        else h+=`<div class="detail-countdown-nums">${dv>0?`<div class="countdown-unit" data-unit="d"><span class="countdown-num">${dv}</span><span class="countdown-lbl">Day${dv!==1?'s':''}</span></div>`:''}<div class="countdown-unit" data-unit="h"><span class="countdown-num">${hv}</span><span class="countdown-lbl">Hrs</span></div><div class="countdown-unit" data-unit="m"><span class="countdown-num">${mv}</span><span class="countdown-lbl">Min</span></div><div class="countdown-unit" data-unit="s"><span class="countdown-num">${sv}</span><span class="countdown-lbl">Sec</span></div></div>`;
        h+=`</div>`;
      } else {
        const bdNext=nextOccurrence(e,year);
        const hasDebut=e.DebutDate&&e.DebutDate.trim();
        if(hasDebut){
          const dp=e.DebutDate.split('/');
          const debutMonth=parseInt(dp[0])-1, debutDay=parseInt(dp[1]);
          const debutNext=new Date(year,debutMonth,debutDay);
          if(daysUntil(debutNext)<0){const ny=new Date(year+1,debutMonth,debutDay); if(daysUntil(ny)>=0) debutNext.setFullYear(year+1);}
          h+=`<div style="display:flex;flex-direction:column;gap:10px;margin-top:0">`;
          h+=_countdownBoxHTML(bdNext,'Birthday','Happy Birthday! 🎉','🎉 TODAY!','purple');
          h+=_countdownBoxHTML(debutNext,'Anniversary','Happy Anniversary! 🎊','🎊 TODAY!','cyan');
          h+=`</div>`;
        } else {
          const {d:dv,h:hv,m:mv,s:sv}=_splitSecs(secsUntil(bdNext));
          const days=daysUntil(bdNext);
          h+=`<div class="detail-countdown" data-target-date="${bdNext.toISOString()}"><div class="detail-countdown-label">${days===0?'🎉 TODAY!':'Days Until Birthday'}</div>`;
          if(days===0) h+=`<div class="today-badge">Happy Birthday! 🎉</div>`;
          else h+=`<div class="detail-countdown-nums">${dv>0?`<div class="countdown-unit" data-unit="d"><span class="countdown-num">${dv}</span><span class="countdown-lbl">Day${dv!==1?'s':''}</span></div>`:''}<div class="countdown-unit" data-unit="h"><span class="countdown-num">${hv}</span><span class="countdown-lbl">Hrs</span></div><div class="countdown-unit" data-unit="m"><span class="countdown-num">${mv}</span><span class="countdown-lbl">Min</span></div><div class="countdown-unit" data-unit="s"><span class="countdown-num">${sv}</span><span class="countdown-lbl">Sec</span></div></div>`;
          h+=`</div>`;
        }
      }
    }
    content.innerHTML=h;

    const fullImgUrl=_safeUrl(e.ImageURL);
    if(!isEvent&&fullImgUrl){
      const img=new Image();
      img.onload=()=>{
        // Build via DOM nodes to avoid HTML interpolation
        imgSide.textContent='';
        const tag=document.createElement('img');
        tag.src=fullImgUrl;
        tag.alt=e.Name||'';
        imgSide.appendChild(tag);
        imgSide.style.display='block';
        panel.classList.add('has-fullimg');
      };
      img.onerror=()=>{imgSide.style.display='none';};
      img.src=fullImgUrl;
    } else {
      imgSide.style.display='none';
      imgSide.textContent='';
      panel.classList.remove('has-fullimg');
    }
  });
}

document.getElementById('detail-close').addEventListener('click',()=>{_elDetailOverlay.classList.remove('open');_elDetailPanel.classList.remove('has-fullimg');});
_elDetailOverlay.addEventListener('click',function(e){if(e.target===this){this.classList.remove('open');_elDetailPanel.classList.remove('has-fullimg');}});
_elDetailBack.addEventListener('click',function(){
  _elDetailOverlay.classList.remove('open');
  _elDayOverlay.classList.add('open');
});

let _dayMap=new Map();
function _buildDayMap(data,year){
  _dayMap.clear();
  data.forEach(e=>{
    const bd=parseMMDD(e.Birthday);
    if(bd){
      const key=`${bd.month-1}-${bd.day}`;
      if(!_dayMap.has(key))_dayMap.set(key,[]);
      _dayMap.get(key).push({e,matchesBd:true,matchesDe:false});
    }
    if(e.DebutDate&&e.DebutDate.trim()){
      const p=e.DebutDate.split('/');
      if(p.length>=2){
        const dm=parseInt(p[0])-1,dd=parseInt(p[1]);
        if(!(bd&&(bd.month-1)===dm&&bd.day===dd)){
          const key=`${dm}-${dd}`;
          if(!_dayMap.has(key))_dayMap.set(key,[]);
          _dayMap.get(key).push({e,matchesBd:false,matchesDe:true});
        } else {
          const key=`${dm}-${dd}`;
          const existing=(_dayMap.get(key)||[]).find(x=>x.e===e);
          if(existing)existing.matchesDe=true;
        }
      }
    }
  });
}

function openDetailFromDay(idOrE,forceType){
  _elDayOverlay.classList.remove('open');
  const e=typeof idOrE==='number'?(_entryMap.get(idOrE)||{}):idOrE;
  openDetail(e,forceType);
  _elDetailBack.style.display='flex';
}
document.getElementById('day-close').addEventListener('click',()=>_elDayOverlay.classList.remove('open'));
_elDayOverlay.addEventListener('click',function(e){if(e.target===this)this.classList.remove('open');});

function openDay(year,month,day){
  const key=`${month}-${day}`;
  const dayEntries=_dayMap.get(key)||[];
  if(!dayEntries.length)return;
  if(dayEntries.length===1){
    const {e,matchesBd,matchesDe}=dayEntries[0];
    const ft=matchesBd&&matchesDe?'both':matchesDe?'debut':undefined;
    openDetail(e,ft);
    return;
  }
  const monthName=MONTH_NAMES[month];
  let h=`<div class="day-modal-header"><div class="day-modal-count">${dayEntries.length}</div><div class="day-modal-title">${monthName} ${day}</div></div>`;
  h+=`<div class="day-modal-list">`;
  dayEntries.forEach(({e,matchesBd,matchesDe})=>{
    const isEvent=e.Type==='event';
    const name=_esc(isEvent?(e.EventName||e.Name):e.Name);
    const sub=_esc(e.Generation||e.Branch||'');
    const url=_safeUrl(e.AvatarURL);
    const emoji=_esc(e.Emoji||'⭐');
    const avatar=url
      ?`<img src="${url}" loading="lazy" decoding="async" alt="${name}" data-fallback-emoji="${emoji}">`
      :emoji;
    const typeLabel=isEvent?'event':(matchesBd&&matchesDe?'both':matchesDe?'debut':'birthday');
    h+=`<div class="day-modal-entry${isEvent?' is-event':''}" data-day-entry-id="${e._id||''}" data-day-type="${typeLabel}">`;
    h+=`<div class="day-modal-avatar">${avatar}</div>`;
    h+=`<div class="day-modal-info"><div class="day-modal-name">${name}</div><div class="day-modal-sub">${sub}</div></div>`;
    const typeBadgeHTML=typeLabel==='both'?`<span class="day-modal-type birthday">birthday</span> <span class="day-modal-type debut">debut</span>`:`<span class="day-modal-type ${typeLabel}">${typeLabel}</span>`;
    h+=typeBadgeHTML;
    h+=`<div class="day-modal-arrow">›</div></div>`;
  });
  h+=`</div>`;
  _elDayContent.innerHTML=h;
  _elDayOverlay.classList.add('open');
}

// ─── DELEGATED CLICK HANDLERS ────────────────────────────────────────────────
// One handler per pane (and overlays) — replaces inline onclick="..." attributes

function _handlePaneClick(ev){
  // Day cell tap
  const dayCell=ev.target.closest('[data-day-cell]');
  if(dayCell){
    const [y,m,d]=dayCell.dataset.dayCell.split('|').map(Number);
    openDay(y,m,d);
    return;
  }
  // Week navigation buttons
  const wn=ev.target.closest('[data-week-nav]');
  if(wn){
    weekNav(parseInt(wn.dataset.weekNav,10));
    return;
  }
  // Year switcher buttons
  const yr=ev.target.closest('[data-year]');
  if(yr){
    switchYear(parseInt(yr.dataset.year,10));
    return;
  }
  // Entry click — open detail
  const entry=ev.target.closest('[data-entry-id]');
  if(entry){
    const id=parseInt(entry.dataset.entryId,10);
    if(!isNaN(id))openDetail(id,entry.dataset.forceType||undefined);
  }
}
Object.values(_elPanes).forEach(p=>p.addEventListener('click',_handlePaneClick));
_elYearSwitcher.addEventListener('click',_handlePaneClick);

// Day modal entries
_elDayContent.addEventListener('click',function(ev){
  const entry=ev.target.closest('[data-day-entry-id]');
  if(!entry)return;
  const id=parseInt(entry.dataset.dayEntryId,10);
  if(!isNaN(id))openDetailFromDay(id,entry.dataset.dayType||undefined);
});

function renderYearSwitcher(){
  const years=Object.keys(state.allData).map(Number).sort((a,b)=>b-a);
  _elYearSwitcher.innerHTML=years.map(y=>`<button class="year-btn ${y===state.activeYear?'active':''}" data-year="${y}">${y}${y===CURRENT_YEAR?'<span class="now-badge">NOW</span>':''}</button>`).join('');
}
function switchYear(y){state.activeYear=y;state.weekOffset=0;renderYearSwitcher();renderAll();}

_elFilterBtns.forEach(btn=>{
  btn.addEventListener('click',function(){
    const branch=this.dataset.branch;
    if(branch==='Events'){
      state.eventsOnly=!state.eventsOnly;
      this.classList.toggle('active',state.eventsOnly);
      if(state.eventsOnly){_elFilterBtnsNonEvent.forEach(b=>b.classList.remove('active'));state.branch='All';}
    } else {
      state.eventsOnly=false;
      _elEventsBtn.classList.remove('active');
      state.branch=(branch!=='All'&&state.branch===branch)?'All':branch;
      _elFilterBtnsNonEvent.forEach(b=>b.classList.toggle('active',b.dataset.branch===state.branch));
    }
    renderAll();
  });
});
let _searchDebounce;
_elSearchInput.addEventListener('input',function(){clearTimeout(_searchDebounce);const val=this.value;_searchDebounce=setTimeout(()=>{state.search=val;renderAll();},220);});

_elViewTabs.forEach(tab=>{
  tab.addEventListener('click',function(){
    state.view=this.dataset.view;
    _elViewTabs.forEach(t=>t.classList.remove('active'));
    this.classList.add('active');
    Object.values(_elPanes).forEach(p=>p.classList.remove('active'));
    _elPanes[state.view].classList.add('active');
    renderAll();
  });
});

const _entryMap=new Map();
let _entryIdCounter=0;

// ─── FETCH HELPERS (timeout + retry) ─────────────────────────────────────────
const FETCH_TIMEOUT_MS=15000;
const FETCH_RETRIES=1;

function _fetchWithTimeout(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),FETCH_TIMEOUT_MS);
  return fetch(url,{signal:controller.signal})
    .then(r=>{
      clearTimeout(timer);
      if(!r.ok)throw new Error('HTTP '+r.status);
      return r.text();
    })
    .catch(err=>{
      clearTimeout(timer);
      throw err;
    });
}
async function _fetchWithRetry(url){
  let lastErr;
  for(let i=0;i<=FETCH_RETRIES;i++){
    try{return await _fetchWithTimeout(url);}
    catch(err){lastErr=err;if(i<FETCH_RETRIES)await new Promise(r=>setTimeout(r,800));}
  }
  throw lastErr;
}

function showErrorBanner(msg,onRetry){
  if(!_elErrorBanner)return;
  _elErrorBanner.innerHTML='';
  const span=document.createElement('span');
  span.className='err-msg';
  span.textContent=msg;
  _elErrorBanner.appendChild(span);
  if(onRetry){
    const btn=document.createElement('button');
    btn.type='button';
    btn.textContent='Retry';
    btn.addEventListener('click',()=>{hideErrorBanner();onRetry();});
    _elErrorBanner.appendChild(btn);
  }
  _elErrorBanner.classList.add('show');
}
function hideErrorBanner(){if(_elErrorBanner)_elErrorBanner.classList.remove('show');}

// Two-phase data load (mobile bandwidth optimization):
//   Phase 1 — fetch talent sheet + the active year only. Render as soon as both arrive.
//   Phase 2 — fetch the remaining year sheets in the background on requestIdleCallback,
//             so the user sees content immediately and archive years populate as they arrive.
// Errors from either phase surface in the same #error-banner.
let _loadErrors=[];
let _loadedTalentRows=[];

async function loadHardcodedData(){
  hideErrorBanner();
  showToast('Loading data…');
  _loadErrors=[];
  _loadedTalentRows=[];

  const activeYr=CURRENT_YEAR;
  const activeUrl=HARDCODED_SOURCES.years[activeYr];

  // ── PHASE 1: critical (talent + current year) ────────────────────────────
  const phase1=[
    _fetchWithRetry(HARDCODED_SOURCES.talent),
    activeUrl?_fetchWithRetry(activeUrl):Promise.reject(new Error('no url for '+activeYr))
  ];
  const [talentRes,activeRes]=await Promise.allSettled(phase1);

  let talentRows=[];
  if(talentRes.status==='fulfilled'){
    try{talentRows=parseTalentCSV(talentRes.value);}
    catch(e){_loadErrors.push('parse talent sheet ('+e.message+')');}
  } else {
    _loadErrors.push('load talent sheet ('+(talentRes.reason&&talentRes.reason.message||'unknown')+')');
  }
  _loadedTalentRows=talentRows;

  const eventsByYear={};
  if(activeRes.status==='fulfilled'){
    try{eventsByYear[activeYr]=parseEventCSV(activeRes.value);}
    catch(e){_loadErrors.push('parse '+activeYr+' events ('+e.message+')');}
  } else {
    _loadErrors.push('load '+activeYr+' events ('+(activeRes.reason&&activeRes.reason.message||'unknown')+')');
  }

  // Seed _entryMap and state with what we have so far
  _entryMap.clear();
  talentRows.forEach(e=>{if(!e._id){e._id=++_entryIdCounter;}_entryMap.set(e._id,e);});
  Object.values(eventsByYear).forEach(rows=>rows.forEach(e=>{if(!e._id){e._id=++_entryIdCounter;}_entryMap.set(e._id,e);}));

  // Build year list. If talent loaded, expose every year in [START_YEAR..CURRENT_YEAR] right
  // away so the year switcher renders all tabs — events for non-active years arrive in phase 2.
  state.allData={};
  if(talentRows.length){
    for(let y=START_YEAR;y<=CURRENT_YEAR;y++){
      state.allData[y]=[...talentRows,...(eventsByYear[y]||[])];
    }
  } else if(eventsByYear[activeYr]){
    state.allData[activeYr]=eventsByYear[activeYr];
  } else {
    state.allData[CURRENT_YEAR]=[];
  }
  const years=Object.keys(state.allData).map(Number).sort((a,b)=>b-a);
  state.activeYear=years.includes(CURRENT_YEAR)?CURRENT_YEAR:years[0];

  // First paint — user sees real content here
  refreshAll();
  if(!_loadErrors.length) showToast('Data loaded!');
  else _showLoadErrors();

  // ── PHASE 2: background-load remaining years ─────────────────────────────
  const otherYears=Object.entries(HARDCODED_SOURCES.years).filter(([yr])=>parseInt(yr)!==activeYr);
  if(!otherYears.length)return;

  const kickoff=()=>_loadRemainingYears(otherYears);
  if('requestIdleCallback' in window){
    requestIdleCallback(kickoff,{timeout:3000});
  } else {
    setTimeout(kickoff,500);
  }
}

async function _loadRemainingYears(yearEntries){
  const results=await Promise.allSettled(
    yearEntries.map(([yr,url])=>_fetchWithRetry(url).then(t=>({yr:parseInt(yr),data:t})))
  );
  let added=false;
  results.forEach((res,i)=>{
    const yr=yearEntries[i][0];
    if(res.status==='fulfilled'){
      try{
        const rows=parseEventCSV(res.value.data);
        rows.forEach(e=>{if(!e._id){e._id=++_entryIdCounter;}_entryMap.set(e._id,e);});
        state.allData[res.value.yr]=[..._loadedTalentRows,...rows];
        added=true;
      } catch(e){
        _loadErrors.push('parse '+yr+' events ('+e.message+')');
      }
    } else {
      _loadErrors.push('load '+yr+' events ('+(res.reason&&res.reason.message||'unknown')+')');
    }
  });
  if(added){
    // Invalidate the filter cache so any active view rebuilds with the new rows
    _filteredCache={key:null,data:null};
    refreshAll();
  }
  if(_loadErrors.length)_showLoadErrors();
}

function _showLoadErrors(){
  const allFailed=_entryMap.size===0;
  const msg=allFailed
    ? 'Could not load data. Check your connection and try again.'
    : 'Some data failed to load: '+_loadErrors.join('; ');
  showErrorBanner(msg,loadHardcodedData);
}

// Strip HTML control characters from CSV cell values; structural escaping happens at render
function _cleanCell(s){return (s||'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').trim().replace(/^"|"$/g,'');}

function _parseCSVRows(lines,headers){
  return lines.map(line=>{
    const vals=[];let cur='',inQ=false;
    for(const c of line){if(c==='"'){inQ=!inQ;}else if(c===','&&!inQ){vals.push(cur);cur='';}else cur+=c;}
    vals.push(cur);
    const obj={};headers.forEach((h,i)=>obj[h]=_cleanCell(vals[i]));
    return obj;
  });
}
function parseTalentCSV(csv){
  const lines=csv.split('\n').filter(l=>l.trim());if(lines.length<2)return[];
  const headers=lines[0].split(',').map(h=>_cleanCell(h));
  return _parseCSVRows(lines.slice(1),headers).filter(r=>r.Name).map(r=>({...r,Type:r.Type||'birthday',EventName:r.EventName||''}));
}
function parseEventCSV(csv){
  const lines=csv.split('\n').filter(l=>l.trim());if(lines.length<2)return[];
  const headers=lines[0].split(',').map(h=>_cleanCell(h));
  return _parseCSVRows(lines.slice(1),headers).filter(r=>r.Name).map(r=>{
    const dateVal=r.Date||r.Birthday||'';
    if(dateVal.includes('/')){const p=dateVal.split('/');r.Birthday=p.length===3?p[0].padStart(2,'0')+'/'+p[1].padStart(2,'0'):dateVal;}
    else r.Birthday=dateVal;
    if(r.Category) r.Generation=r.Category;
    if(r.Region) r.Branch=r.Region;
    r.EventName=r.Name;
    return {...r,Type:r.Type||'event'};
  });
}
function updateStatus(){const year=state.activeYear,data=state.allData[year]||[],filtered=getFilteredData(year);_elStatusBar.textContent=`${filtered.length} of ${data.length} entries • ${year}${isArchive()?' (Archive)':''}`;}
function showToast(msg){_elToast.textContent=msg;_elToast.classList.add('show');setTimeout(()=>_elToast.classList.remove('show'),3000);}

const _renderKeys={};
function _viewKey(extra){return `${state.activeYear}|${state.branch}|${state.eventsOnly}|${state.search}|${extra||''}`;}
function renderAll(){
  updateStatus();
  switch(state.view){
    case 'monthly': {const k=_viewKey();if(_renderKeys.monthly!==k){_renderKeys.monthly=k;renderMonthly();}break;}
    case 'timeline': {const k=_viewKey();if(_renderKeys.timeline!==k){_renderKeys.timeline=k;renderTimeline();}break;}
    case 'upcoming': {const k=_viewKey();if(_renderKeys.upcoming!==k){_renderKeys.upcoming=k;renderUpcoming();}break;}
    case 'weekly': {const k=_viewKey(state.weekOffset);if(_renderKeys.weekly!==k){_renderKeys.weekly=k;renderWeekly();}break;}
  }
}
function refreshAll(){_renderKeys.monthly=_renderKeys.timeline=_renderKeys.upcoming=_renderKeys.weekly=null;renderYearSwitcher();renderAll();}

loadHardcodedData();

// ─── SERVICE WORKER REGISTRATION ─────────────────────────────────────────────
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw.js')
      .then(reg=>{
        reg.addEventListener('updatefound',()=>{
          const newSW=reg.installing;
          newSW.addEventListener('statechange',()=>{
            if(newSW.state==='installed'&&navigator.serviceWorker.controller){
              showToast('Update available — refresh to get latest data');
            }
          });
        });
      })
      .catch(()=>{});
  });
}
