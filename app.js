const API_BASE = 'https://api.everypastpaper.dpdns.org';

const tg = window.Telegram?.WebApp || null;

try {
    tg?.ready();
} catch (error) {
    console.error('Telegram ready error:', error);
}

try {
    tg?.expand();
    tg?.setHeaderColor('#f4f7fb');
    tg?.setBackgroundColor('#f4f7fb');
} catch (error) {
    console.error('Telegram display error:', error);
}

const tgInitData = tg?.initData || '';
const tgReady = tgInitData.length > 0;

// Diagnostic information
console.log('Every PP diagnostic:', {
    telegramAvailable: !!tg,
    platform: tg?.platform || 'Not detected',
    initDataAvailable: tgReady,
    apiBase: API_BASE
});

const $ = id => document.getElementById(id);
const firstName=tg?.initDataUnsafe?.user?.first_name||'there';$('welcome-name').textContent=firstName;$('user-chip').textContent=(firstName[0]||'E').toUpperCase();
const started=Date.now();async function hideWelcome(){const wait=Math.max(0,850-(Date.now()-started));if(wait)await new Promise(r=>setTimeout(r,wait));$('welcome-screen').classList.add('is-hidden')}
let tree=null,path=[],selected=new Set(),sending=false,mode='library';const names=['Exam type','Board','Subject','Year','Session'];
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function getNode(){let n=tree;for(const part of path){if(!n||!Object.prototype.hasOwnProperty.call(n,part))return {};n=n[part]}return n||{}}
function isPaperNode(n){return n&&typeof n==='object'&&('has_qp'in n||'has_ms'in n)}
function paperEntries(){const n=getNode();return Object.entries(n).filter(([k,v])=>isPaperNode(v))}
function folderCount(n){if(!n||typeof n!=='object')return 0;if(isPaperNode(n))return 1;return Object.values(n).reduce((a,v)=>a+folderCount(v),0)}
function sortEntries(entries){return entries.sort((a,b)=>{if(path.length===3)return Number(b[0])-Number(a[0]);return a[0].localeCompare(b[0],undefined,{numeric:true,sensitivity:'base'})})}
function currentTitle(){return path.length?path[path.length-1]:'All papers'}
function setStatus(msg,kind=''){const el=$('status');el.className='status'+(kind?' '+kind:'');el.textContent=msg}
window.addEventListener('error', (event) => {
    console.error('Every PP JavaScript error:', event.error);
    if ($('status')) setStatus('JS Error: ' + event.message, 'bad');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Every PP Promise error:', event.reason);
    if ($('status')) setStatus('App Error: ' + String(event.reason), 'bad');
});
function renderCrumbs(){const el=$('breadcrumbs');el.innerHTML='<button class="crumb" data-depth="0">My library</button>'+path.map((part,i)=>`<span class="crumb-sep">›</span><button class="crumb ${i===path.length-1?'current':''}" data-depth="${i+1}">${esc(part)}</button>`).join('');el.querySelectorAll('[data-depth]').forEach(b=>b.addEventListener('click',()=>{path=path.slice(0,Number(b.dataset.depth));selected.clear();mode='library';render()}));$('back-btn').disabled=path.length===0}
function folderIcon(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>'}
function fileIcon(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v6h5M9 14h7M9 17h5"/></svg>'}
function render(){renderCrumbs();$('view-title').textContent=mode==='selected'?'Selected papers':currentTitle();$('view-subtitle').textContent=mode==='selected'?'Review the papers you have selected for download.':'Browse folders to find the papers you need.';const query=$('search').value.trim().toLowerCase();let html='';
if(mode==='selected'){
 const all=[];function walk(node,parts=[]){for(const [k,v] of Object.entries(node||{})){if(isPaperNode(v)){if(selected.has(parts.concat(k).join('|||')))all.push({parts:parts.concat(k),detail:v})}else walk(v,parts.concat(k))}}walk(tree);$('item-count').textContent=`${all.length} selected`;$('list-label').textContent='Selected files';$('sort-label').textContent='Selection';html=all.length?`<div class="file-list">${all.map(x=>fileRow(x.parts,x.detail,true)).join('')}</div>`:'<div class="empty"><strong>No selected papers yet</strong>Go to All papers and select files to see them here.</div>';
}else{
 const node=getNode();const isLeaf=path.length===5;const entries=isLeaf?paperEntries():sortEntries(Object.entries(node||{}));const filtered=entries.filter(([k])=>!query||k.toLowerCase().includes(query));$('item-count').textContent=isLeaf?`${filtered.length} papers`:`${folderCount(node).toLocaleString()} papers`;$('list-label').textContent=isLeaf?'Papers':'Folders';$('sort-label').textContent='Name ↑';
 if(!filtered.length)html='<div class="empty"><strong>No matching items</strong>Try another search or go back to the previous folder.</div>';
 else if(!isLeaf)html=`<div class="folder-grid">${filtered.map(([name,child])=>`<button class="folder" data-folder="${esc(name)}"><span class="folder-icon">${folderIcon()}</span><span class="folder-copy"><span class="folder-name">${esc(name)}</span><span class="folder-meta">${folderCount(child).toLocaleString()} ${folderCount(child)===1?'paper':'papers'}</span></span><span class="folder-arrow">›</span></button>`).join('')}</div>`;
 else html=`<div class="file-list">${filtered.map(([name,d])=>fileRow(path.concat(name),d,false)).join('')}</div>`;
}
$('items').innerHTML=html;$('items').querySelectorAll('[data-folder]').forEach(b=>b.addEventListener('click',()=>{path.push(b.dataset.folder);mode='library';selected.clear();$('search').value='';render()}));$('items').querySelectorAll('[data-paper-key]').forEach(ch=>ch.addEventListener('change',()=>{const k=ch.dataset.paperKey;if(ch.checked)selected.add(k);else selected.delete(k);render()}));$('items').querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{selected.delete(b.dataset.remove);render()}));$('nav-selected-count').textContent=selected.size;$('nav-library').classList.toggle('active',mode==='library');$('nav-selected').classList.toggle('active',mode==='selected');updateDock();}
function fileRow(parts,d,selectedView){const key=parts.join('|||'),name=parts[parts.length-1],meta=parts.slice(0,-1).join(' · ');return `<div class="file-row ${selected.has(key)?'selected':''}">${selectedView?`<button class="tool-btn" data-remove="${esc(key)}">Remove</button>`:`<input class="file-check" type="checkbox" data-paper-key="${esc(key)}" ${selected.has(key)?'checked':''} aria-label="Select ${esc(name)}">`}<span class="file-icon">${fileIcon()}</span><span class="file-copy"><span class="file-name">${esc(name)}</span><span class="file-meta">${esc(meta)}</span></span><span class="availability">${d.has_qp?'<span class="type-dot">QP</span>':''}${d.has_ms?'<span class="type-dot ms">MS</span>':''}</span></div>`}
function updateDock(){const n=selected.size;const types=[$('type-qp').checked?'qp':null,$('type-ms').checked?'ms':null].filter(Boolean);$('dock-title').textContent=`${n} paper${n===1?'':'s'} selected`;$('dock-caption').textContent=n?'Choose Question Paper, Mark Scheme or both.':'Select papers to prepare your download.';$('send-button').disabled=!tgReady||sending||!n||!types.length;$('send-button').textContent=sending?'Sending…':'Send files';$('telegram-note').classList.toggle('hidden',tgReady)}
$('nav-library').addEventListener('click',()=>{mode='library';path=[];render()});$('nav-selected').addEventListener('click',()=>{mode='selected';render()});$('back-btn').addEventListener('click',()=>{if(path.length){path.pop();selected.clear();render()}});$('search').addEventListener('input',render);$('clear-search').addEventListener('click',()=>{$('search').value='';render()});$('type-qp').addEventListener('change',updateDock);$('type-ms').addEventListener('change',updateDock);
async function sendFiles(){if(sending||!tgReady)return;const types=[$('type-qp').checked?'qp':null,$('type-ms').checked?'ms':null].filter(Boolean);if(!types.length||!selected.size)return;const jobs=[];for(const key of selected){const parts=key.split('|||');const d=parts.slice(0,5).reduce((n,k)=>n?.[k],tree)?.[parts[5]];if(!d)continue;for(const type of types)if((type==='qp'&&d.has_qp)||(type==='ms'&&d.has_ms))jobs.push({parts,type})}if(!jobs.length){setStatus('No files are available for those file types.','bad');return}sending=true;updateDock();let ok=0,errors=[];for(let i=0;i<jobs.length;i++){const {parts,type}=jobs[i];setStatus(`Requesting ${i+1} of ${jobs.length}: ${parts[5]} · ${type.toUpperCase()}…`);try{const [exam,board,subject,year,month,paper]=parts;const res=await fetch(`${API_BASE}/api/download`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':tg.initData},body:JSON.stringify({exam,board,subject,year,month,paper,file_type:type})});const data=await res.json().catch(()=>({}));if(!res.ok||!data.success)throw new Error(data.error||`Request failed (${res.status})`);ok++}catch(e){errors.push(`${parts[5]} ${type.toUpperCase()}: ${e.message}`)}}sending=false;updateDock();if(errors.length){setStatus(`${ok}/${jobs.length} requests accepted. ${errors.slice(0,2).join(' · ')}`,'bad')}else{setStatus(`All ${ok} file requests were accepted. Check your Telegram chat.`,'good');try{tg.HapticFeedback?.notificationOccurred('success')}catch(_){}}}
$('send-button').addEventListener('click',sendFiles);


async function load() {
    try {
        const url = `${API_BASE}/api/options?t=${Date.now()}`;
        console.log('Loading library from:', url);

        const response = await fetch(url, {
            method: 'GET',
            cache: 'no-store'
        });

        console.log('HTTP status:', response.status);
        console.log('Response URL:', response.url);
        console.log('Response headers:', [...response.headers.entries()]);

        const responseText = await response.text();
        console.log('Response body:', responseText.slice(0, 1000));

        if (!response.ok) {
            throw new Error(`Worker returned HTTP ${response.status}`);
        }

        try {
            tree = JSON.parse(responseText);
        } catch (error) {
            throw new Error('Invalid JSON data received.');
        }

        $('item-count').textContent =
            `${folderCount(tree).toLocaleString()} papers`;

        render();
        setStatus('Library ready. Open a folder to browse your papers.');

    } catch (error) {
        console.error('Library loading error:', error);

        $('item-count').textContent = 'Unavailable';
        setStatus(
            `${error.message}. Check browser console for details.`,
            'bad'
        );

    } finally {
        await hideWelcome();
    }
}

load();

