import React, { useMemo, useRef, useState } from 'react'

// Engine & Schema
const ENGINE_VERSION = '1.2.0'
const SCHEMA_VERSION = '1.2.0'

// Config (Billboard rules + platforms)
const DEFAULT_CONFIG = {
  version: '1.2.0',
  streamsClamp: { min: 200, max: 8_000_000 },
  promoMultipliers: { NONE: 1.0, LOW: 1.08, MEDIUM: 1.18, HIGH: 1.35 },
  promoConsecutivePenalty: 0.92,
  hypeDecay: { base: 3, noPromoBonus: 2, highPromoRelief: 1 },
  salesPerStream: 0.01,
  chartWeights: { streams: 0.6, sales: 0.3, hype: 0.1 },
  projectRules: { epMin: 3, epMax: 7, albumMin: 8, albumMax: 14, singlesCap: 4 },
  platforms: {
    AURAFY: {
      label: 'Aurafy', kind: 'audio', audienceShare: 0.55, payoutPerStream: 0.0035,
      promoLifts: { BANNER: [1.3,1.6], EDITORIAL: [1.8,2.4], SPONSORED: [1.15,1.3] }
    },
    STREAMBOX: {
      label: 'StreamBox', kind: 'video', audienceShare: 0.45, cpmAvg: 2.2, monetizableShare: 0.75,
      streamEqPerView: 0.8, artistRevShare: 0.45,
      promoLifts: { FEATURED: [1.25,1.5], TRENDING: [1.6,2.2], PREROLL: [1.0,1.0] }
    }
  }
}

// Jobs (per your list style)
const JOBS = [
  { id:'warehouse', title:'Warehouse Attendant', pay:550, energy:23 },
  { id:'engineer', title:'Studio Engineer (Assistant)', pay:650, energy:24 },
  { id:'driver', title:'Driver', pay:420, energy:20 },
  { id:'server', title:'Server', pay:500, energy:22 },
  { id:'barista', title:'Barista', pay:300, energy:15 },
  { id:'retail', title:'Retail Associate', pay:350, energy:18 },
  { id:'tutor', title:'Tutor', pay:450, energy:20 },
]

// Defaults
const DEFAULT_ARTIST = { id:'artist-1', name:'', age:0, year:2025, cash:1000, energy:100, base_popularity:35, hype:30, rngSeed:12345, social_followers:250, jobId:null }

// Utils
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n))
const mulberry32 = (seed)=>()=>{ let t=(seed+=0x6D2B79F5); t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296 }
function normalFromRng(rng, mean=1, sd=0.2){ const u=1-rng(), v=1-rng(); const z=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); return mean+z*sd }
const b64e = (o)=>btoa(unescape(encodeURIComponent(JSON.stringify(o))))
const b64d = (s)=>JSON.parse(decodeURIComponent(escape(atob(s))))

// Charts helpers
function zscore(rows,key){ if(!rows.length) return new Map(); const vals=rows.map(r=>r[key]); const mean=vals.reduce((a,b)=>a+b,0)/vals.length; const sd=Math.sqrt(vals.reduce((a,v)=>a+Math.pow(v-mean,2),0)/(vals.length||1))||1; const m=new Map(); rows.forEach(r=>m.set(r.id,(r[key]-mean)/sd)); return m }
function computePromoMultiplier(level, consec, cfg){ const base=cfg.promoMultipliers[level||'NONE']||1; return (!consec||consec<=1)?base: base*Math.pow(cfg.promoConsecutivePenalty, consec-1) }
function predictSongStreams(song, artist, promoLevel, consec, cfg, rng){
  const Q=(song.quality||50)/100, H=(song.hype||30)/100, A=((song.artist_popularity??0)+artist.base_popularity)/200
  const baseline=10_000*(0.3*Q+0.3*H+0.4*A), promo=computePromoMultiplier(promoLevel||'NONE', consec, cfg)
  const hit=clamp(normalFromRng(rng,1,0.2),0.6,1.6); return clamp(Math.round(baseline*promo*hit), cfg.streamsClamp.min, cfg.streamsClamp.max)
}
function computeCharts(songs, projects, cfg){
  const srows=songs.filter(s=>s.status==='RELEASED').map(s=>({id:s.id,title:s.title,streams:s._week_streams||0,sales:(s._week_streams||0)*cfg.salesPerStream,hype:s.hype||0}))
  const sZ={streams:zscore(srows,'streams'),sales:zscore(srows,'sales'),hype:zscore(srows,'hype')}
  const songChart=srows.map(r=>({...r,points:0.6*(sZ.streams.get(r.id)||0)+0.3*(sZ.sales.get(r.id)||0)+0.1*(sZ.hype.get(r.id)||0)})).sort((a,b)=>b.points-a.points).map((r,i)=>({position:i+1,...r}))
  const prows=projects.filter(p=>p.released_at_week!=null).map(p=>({id:p.id,title:p.title,streams:p._week_streams||0,sales:(p._week_streams||0)*cfg.salesPerStream,hype:p.hype||0}))
  const pZ={streams:zscore(prows,'streams'),sales:zscore(prows,'sales'),hype:zscore(prows,'hype')}
  const projChart=prows.map(r=>({...r,points:0.6*(pZ.streams.get(r.id)||0)+0.3*(pZ.sales.get(r.id)||0)+0.1*(pZ.hype.get(r.id)||0)})).sort((a,b)=>b.points-a.points).map((r,i)=>({position:i+1,...r}))
  return { songChart, projChart }
}
function projectTypeByCount(n,cfg){ if(n>=cfg.projectRules.albumMin&&n<=cfg.projectRules.albumMax) return 'ALBUM'; if(n>=cfg.projectRules.epMin&&n<=cfg.projectRules.epMax) return 'EP'; return null }
function selectEligibleSingles(p,songs,cfg){ const rel=p.songs.map(id=>songs.find(s=>s.id===id)).filter(s=>s&&s.status==='RELEASED'); rel.sort((a,b)=>(b.released_at_week||0)-(a.released_at_week||0)); return rel.slice(0,cfg.projectRules.singlesCap).map(s=>s.id) }

// Platforms
function applyPlatformPromos(base, song, key){ const pr=song._platformPromo?.[key]; if(!pr) return base; const lift=pr.lift||1; return Math.round(base*lift) }
function computePlatformBreakdownForSong(song, totalStreams, game, rng){
  const cfg=game.config, out={}, A=cfg.platforms.AURAFY, V=cfg.platforms.STREAMBOX
  let aur= Math.round(totalStreams*A.audienceShare), vid = Math.round(totalStreams*V.audienceShare)
  aur = applyPlatformPromos(Math.round(aur*clamp(normalFromRng(rng,1.0,0.15),0.75,1.35)), song, 'AURAFY')
  vid = applyPlatformPromos(Math.round(vid*clamp(normalFromRng(rng,1.0,0.20),0.7,1.4)), song, 'STREAMBOX')
  const aRev = aur * A.payoutPerStream
  const monet = Math.round(vid*V.monetizableShare)
  const adRev = (monet/1000)*V.cpmAvg
  const artistRev = adRev*V.artistRevShare
  const eq = Math.round(vid*V.streamEqPerView)
  out.AURAFY={streams:aur,revenue:aRev}; out.STREAMBOX={views:vid, monetizedViews:monet, adRevenue:adRev, artistRevenue:artistRev, streamEq:eq}
  return out
}

// Weekly loop + activities + jobs
function advanceWeek(game){
  const cfg=game.config, rng=mulberry32(game.rngSeed+game.week)

  // Resolve activities scheduled for this week
  const toRun = game.activities.filter(a=>a.week===game.calendarWeek)
  let cashDelta = 0
  for(const a of toRun){
    if(a.energyCost){ game.artist.energy = Math.max(0, game.artist.energy - a.energyCost) }
    if(a.type==='GIG'){ cashDelta += a.payout||0; game.artist.hype = Math.min(100, (game.artist.hype||0)+ (a.hypeGain||4)) }
    if(a.type==='INTERVIEW'){ game.artist.hype = Math.min(100, (game.artist.hype||0)+ (a.hypeGain||3)) }
  }
  game.artist.cash += cashDelta

  // Job effects: pay & energy weekly
  if(game.artist.jobId){
    const job = JOBS.find(j=>j.id===game.artist.jobId)
    if(job){
      game.artist.cash += job.pay
      game.artist.energy = Math.max(0, game.artist.energy - job.energy)
    }
  }

  // Reset weekly marks
  game.songs.forEach(s=>{ s._week_streams=0; s._platform={}; s._consecPromo=(s._consecPromo||0) })
  game.projects.forEach(p=>{ p._week_streams=0; p._consecPromo=(p._consecPromo||0) })

  // Songs
  for(const s of game.songs){
    if(s.status!=='RELEASED') continue
    const consec = s._activePromo ? (s._consecPromo||1) : 1
    const streams = predictSongStreams(s, game.artist, s._activePromo||'NONE', consec, cfg, rng)
    s._week_streams = streams
    s._platform = computePlatformBreakdownForSong(s, streams, game, rng)
    let decay = cfg.hypeDecay.base + (s._activePromo?0:cfg.hypeDecay.noPromoBonus) - (s._activePromo==='HIGH'?cfg.hypeDecay.highPromoRelief:0)
    s.hype = Math.max(0,(s.hype||0)-decay)
    if(s._activePromo) s._consecPromo=(s._consecPromo||0)+1; else s._consecPromo=0
  }

  // Projects + singles rule
  for(const p of game.projects){
    if(p.released_at_week==null) continue
    const tracks = p.songs.map(id=>game.songs.find(s=>s.id===id)).filter(Boolean)
    const base = tracks.reduce((a,s)=>a+(s._week_streams||0),0)
    let bonus=0
    if(p.first_week_done!==true){
      const elig=selectEligibleSingles(p, game.songs, game.config); p.eligible_released_singles=elig
      for(const id of elig){ const s=game.songs.find(x=>x.id===id); if(s) bonus+= (s._week_streams||0) }
      p.first_week_done=true
    }
    const mult = computePromoMultiplier(p._activePromo||'NONE', p._consecPromo||1, game.config)
    p._week_streams = Math.round((base+bonus)*mult)
    if(p._activePromo) p._consecPromo=(p._consecPromo||0)+1; else p._consecPromo=0
  }

  // Charts
  const {songChart, projChart} = computeCharts(game.songs, game.projects, cfg)
  game.charts = { week: game.week+1, songs: songChart, projects: projChart }

  // Platform revenue
  const weekRevenue = game.songs.reduce((sum,s)=> sum + (s._platform?.AURAFY?.revenue||0) + (s._platform?.STREAMBOX?.artistRevenue||0), 0)
  game.artist.cash += weekRevenue

  // Energy recovery
  game.artist.energy = Math.min(100, game.artist.energy + 10)

  // Advance week & calendar
  game.calendarWeek += 1
  if(game.calendarWeek>52){ game.calendarWeek=1; game.artist.year += 1; game.artist.age += 1 }
  game.week += 1

  return game
}

// Title generator
const GENRE_VOCABS = { Rap:['Out the Way','Gold Floors','Back End','City Windows','Day Ones','No Cosign','All In','Paid in Time','Skyline Moves','Racks & Roses'],
 RnB:['Late Call','Silk Lines','Close Enough','Soft Hours','Velvet Rain','Hold Me Over','Quiet Light','Moon Slow','If You Stay','Waves'],
 Pop:['Electric Night','Runaway Heart','Bright Again','Highline','Starlight','Echo Me','Summer Wire','Neon Love','Wide Awake','Gravity'],
 Country:['Porch Lights','Dust & Miles','Small Town Sky','Steel & Honey','County Line','Good Boots','Backroad Memory','Blue Truck','River Turn','Home Again'] }
function generateTitles(genre, seen){ const pool=GENRE_VOCABS[genre]||GENRE_VOCABS.Pop; const out=[]; let safety=100; while(out.length<3&&safety--){ const pick=pool[Math.floor(Math.random()*pool.length)]; if(!seen.has(pick)&&!out.includes(pick)) out.push(pick) } out.forEach(t=>seen.add(t)); return out }

// Fresh game
function freshGame(){ return {
  engineVersion:ENGINE_VERSION, schemaVersion:SCHEMA_VERSION, config:{...DEFAULT_CONFIG},
  week:1, calendarWeek:1, artist:{...DEFAULT_ARTIST},
  rngSeed:777,
  songs:[ {id:'s1',title:'Demo Draft',status:'WRITTEN',quality:62,hype:28,artist_popularity:20,created_at_week:1},
          {id:'s2',title:'Skylight',status:'RELEASED',quality:74,hype:45,artist_popularity:25,created_at_week:1,released_at_week:1} ],
  projects:[], charts:{week:1,songs:[],projects:[]}, platformCharts:{AURAFY:[],STREAMBOX:[]},
  activities:[]
}}

export default function App(){
  const [game,setGame]=useState(freshGame())
  const [tab,setTab]=useState('Dashboard')
  const [studioTab,setStudioTab]=useState('WRITTEN')
  const [search,setSearch]=useState('')
  const [genre,setGenre]=useState('Rap')
  const [generated,setGenerated]=useState([])
  const seenTitles=useRef(new Set())
  const [newSongTitle,setNewSongTitle]=useState('')

  // Onboarding
  const [showOnboard, setShowOnboard] = useState(true)
  const [tmpName, setTmpName] = useState('Your Artist Name')
  const [tmpAge, setTmpAge] = useState(21)
  const [tmpYear, setTmpYear] = useState(2025)

  // Activities
  const [newAct, setNewAct] = useState({ type:'GIG', weekOffset:1, energyCost:20, payout:800, hypeGain:4 })
  const [jobChoice, setJobChoice] = useState(game.artist.jobId||'')
  const currentJob = JOBS.find(j=> j.id===game.artist.jobId) || null

  const written = useMemo(()=>game.songs.filter(s=>s.status==='WRITTEN' && s.title.toLowerCase().includes(search.toLowerCase())),[game,search])
  const unreleased = useMemo(()=>game.songs.filter(s=>s.status==='UNRELEASED' && s.title.toLowerCase().includes(search.toLowerCase())),[game,search])
  const released = useMemo(()=>game.songs.filter(s=>s.status==='RELEASED' && s.title.toLowerCase().includes(search.toLowerCase())),[game,search])
  const filtered = studioTab==='WRITTEN'?written: studioTab==='UNRELEASED'?unreleased: released

  const addWrittenSong=(title)=>{ const id=`s${Date.now()}`, quality=Math.floor(50+Math.random()*40); setGame(g=>({...g,songs:[...g.songs,{id,title,status:'WRITTEN',quality,hype:30,artist_popularity:20,created_at_week:g.week}]})) }
  const recordSong=(id)=>setGame(g=>({...g,songs:g.songs.map(s=>s.id===id?{...s,status:'UNRELEASED',recorded_at_week:g.week}:s)}))
  const recordSingleQuick=()=>{ const title=newSongTitle||`New Single ${game.week}`, id=`s${Date.now()}`, quality=Math.floor(55+Math.random()*35); setGame(g=>({...g,songs:[...g.songs,{id,title,status:'UNRELEASED',quality,hype:35,artist_popularity:22,created_at_week:g.week,recorded_at_week:g.week}]})); setNewSongTitle('') }
  const releaseSong=(id)=>setGame(g=>({...g,songs:g.songs.map(s=>s.id===id?{...s,status:'RELEASED',released_at_week:g.week}:s)}))
  const trashSong=(id)=>setGame(g=>({...g,songs:g.songs.map(s=>s.id===id?{...s,status:'TRASHED'}:s)}))

  // Projects
  const [projectName,setProjectName]=useState('')
  const [projectSongIds,setProjectSongIds]=useState([])
  const createProject=()=>{ const count=projectSongIds.length, type=projectTypeByCount(count,game.config); if(!type){alert('Invalid track count: EP 3–7, Album 8–14'); return} const id=`p${Date.now()}`; const p={id,title:projectName||`Project ${game.week}`,type,songs:[...projectSongIds],hype:40}; setGame(g=>({...g,projects:[...g.projects,p]})); setProjectName(''); setProjectSongIds([]) }
  const toggleSongInProject=(id)=>setProjectSongIds(prev=> prev.includes(id)? prev.filter(x=>x!==id) : [...prev,id])
  const releaseProject=(id)=>setGame(g=>({...g,projects:g.projects.map(p=>p.id===id?{...p,released_at_week:g.week,first_week_done:false}:p)}))

  // Activities
  function scheduleActivity(){
    const when = game.calendarWeek + Number(newAct.weekOffset||1)
    const act = { id:`a${Date.now()}`, type:newAct.type, week: ((when-1)%52)+1, energyCost:Number(newAct.energyCost||0), payout:Number(newAct.payout||0), hypeGain:Number(newAct.hypeGain||0) }
    setGame(g=> ({...g, activities:[...g.activities, act]}))
  }
  function takeJob(){ setGame(g=> ({...g, artist:{...g.artist, jobId: jobChoice || null }})) }
  const nextWeek=()=>setGame(g=>advanceWeek({...g}))

  // Save/Load
  const exportToken=()=>{ const token=b64e({engineVersion:ENGINE_VERSION,schemaVersion:SCHEMA_VERSION,timestamp:Date.now(),state:game}); navigator.clipboard.writeText(token).catch(()=>{}); alert('State token copied to clipboard. Paste it in a new chat to resume.') }
  const importToken=()=>{ const token=prompt('Paste STATE_TOKEN'); if(!token) return; try{ const payload=b64d(token); setGame(payload.state); alert('Loaded!') }catch(e){ alert('Invalid token') } }
  const genTitles=()=>setGenerated(generateTitles(genre, seenTitles.current))

  // Onboarding confirm
  function startGame(){
    setGame(g=> ({...g, artist:{...g.artist, name: tmpName, age:Number(tmpAge), year:Number(tmpYear)} }))
    setShowOnboard(false)
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-7xl mx-auto p-4">
        <header className="flex items-center justify-between py-2">
          <h1 className="text-2xl font-bold text-yellow-400">Sound Empire – Sprint 1</h1>
          <div className="flex gap-2">
            <button onClick={exportToken} className="bg-yellow-500 text-black px-3 py-1 rounded-md">Export State</button>
            <button onClick={importToken} className="bg-neutral-800 px-3 py-1 rounded-md border border-neutral-700">Import State</button>
          </div>
        </header>

        {/* NAV */}
        <nav className="flex gap-2 mb-4 flex-wrap">
          {['Dashboard','Activities','Studio','Projects','Promotion','Platforms','Charts','God Mode'].map(t=>(
            <button key={t} onClick={()=>setTab(t)} className={`px-3 py-1 rounded-full border ${tab===t?'border-yellow-400 text-yellow-300':'border-neutral-700 text-neutral-400'} hover:text-yellow-300`}>{t}</button>
          ))}
        </nav>

        {/* DASHBOARD */}
        {tab==='Dashboard' && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800"><div className="text-sm text-neutral-400">Week / Year</div><div className="text-3xl font-bold text-yellow-400">{game.calendarWeek} / {game.artist.year}</div></div>
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800"><div className="text-sm text-neutral-400">Artist</div><div className="text-3xl font-bold text-yellow-400">{game.artist.name||'—'} • {game.artist.age||'—'}</div></div>
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800"><div className="text-sm text-neutral-400">Money</div><div className="text-3xl font-bold text-yellow-400">${game.artist.cash.toFixed(0)}</div></div>

            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800"><div className="text-sm text-neutral-400">Hype</div><div className="text-3xl font-bold text-yellow-400">{game.artist.hype}</div></div>
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800"><div className="text-sm text-neutral-400">Popularity</div><div className="text-3xl font-bold text-yellow-400">{game.artist.base_popularity}</div></div>
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800"><div className="text-sm text-neutral-400">Energy</div><div className="text-3xl font-bold text-yellow-400">{game.artist.energy}/100</div></div>

            <div className="md:col-span-3 bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div className="font-semibold mb-2">Upcoming</div>
              <div className="space-y-2 max-h-64 overflow-auto">
                {game.activities.filter(a=>a.week>=game.calendarWeek).sort((a,b)=>a.week-b.week).map(a=> (
                  <div key={a.id} className="flex items-center justify-between border border-neutral-800 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3"><span className="text-yellow-400">Week {a.week}</span><span className="font-medium">{a.type}</span></div>
                    <div className="text-xs text-neutral-400">Energy -{a.energyCost} {a.payout?`• $${a.payout}`:''} {a.hypeGain?`• +${a.hypeGain} hype`:''}</div>
                  </div>
                ))}
                {!game.activities.filter(a=>a.week>=game.calendarWeek).length && <div className="text-sm text-neutral-500">No activities scheduled. Add some in the Activities tab.</div>}
              </div>
            </div>

            <div className="md:col-span-3 flex items-center justify-between bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div><div className="font-semibold">Quick Actions</div><div className="text-sm text-neutral-400">Write Song • Record Single • Create Project • Advance Week</div></div>
              <div className="flex gap-2">
                <button onClick={()=>addWrittenSong(`Idea ${game.week}-${Math.floor(Math.random()*99)}`)} className="bg-neutral-800 px-3 py-2 rounded-md border border-neutral-700">Write Song</button>
                <input value={newSongTitle} onChange={e=>setNewSongTitle(e.target.value)} placeholder="(optional) single title" className="bg-neutral-800 px-2 py-2 rounded-md border border-neutral-700" />
                <button onClick={recordSingleQuick} className="bg-yellow-500 text-black px-3 py-2 rounded-md">Record Single</button>
                <button onClick={nextWeek} className="bg-neutral-800 px-3 py-2 rounded-md border border-neutral-700">Advance Week</button>
              </div>
            </div>
          </section>
        )}

        {/* ACTIVITIES */}
        {tab==='Activities' && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div className="font-semibold mb-2">Schedule Activity</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                <select value={newAct.type} onChange={e=>setNewAct(a=>({...a, type:e.target.value}))} className="bg-neutral-800 px-2 py-2 rounded-md border border-neutral-700">
                  <option value="GIG">Gig / Show</option>
                  <option value="INTERVIEW">Interview</option>
                  <option value="PROMO">Promo Task</option>
                </select>
                <input type="number" value={newAct.weekOffset} onChange={e=>setNewAct(a=>({...a, weekOffset:Number(e.target.value)}))} className="bg-neutral-800 px-2 py-2 rounded-md border border-neutral-700" placeholder="Weeks from now" />
                <input type="number" value={newAct.energyCost} onChange={e=>setNewAct(a=>({...a, energyCost:Number(e.target.value)}))} className="bg-neutral-800 px-2 py-2 rounded-md border border-neutral-700" placeholder="Energy cost" />
                <input type="number" value={newAct.payout} onChange={e=>setNewAct(a=>({...a, payout:Number(e.target.value)}))} className="bg-neutral-800 px-2 py-2 rounded-md border border-neutral-700" placeholder="Payout ($)" />
                <input type="number" value={newAct.hypeGain} onChange={e=>setNewAct(a=>({...a, hypeGain:Number(e.target.value)}))} className="bg-neutral-800 px-2 py-2 rounded-md border border-neutral-700" placeholder="Hype +" />
                <button onClick={()=>{ const when = game.calendarWeek + Number(newAct.weekOffset||1); const act = { id:`a${Date.now()}`, type:newAct.type, week: ((when-1)%52)+1, energyCost:Number(newAct.energyCost||0), payout:Number(newAct.payout||0), hypeGain:Number(newAct.hypeGain||0) }; setGame(g=> ({...g, activities:[...g.activities, act]})) }} className="bg-yellow-500 text-black px-3 py-2 rounded-md">Add</button>
              </div>
              <div className="font-semibold mt-4 mb-2">Scheduled</div>
              <div className="space-y-2 max-h-96 overflow-auto">
                {game.activities.sort((a,b)=>a.week-b.week).map(a=>(
                  <div key={a.id} className="flex items-center justify-between border border-neutral-800 rounded-lg px-3 py-2">
                    <div><span className="text-yellow-400">Week {a.week}</span> • {a.type}</div>
                    <div className="text-xs text-neutral-400">Energy -{a.energyCost} {a.payout?`• $${a.payout}`:''} {a.hypeGain?`• +${a.hypeGain} hype`:''}</div>
                  </div>
                ))}
                {!game.activities.length && <div className="text-sm text-neutral-500">Nothing scheduled yet.</div>}
              </div>
            </div>

            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div className="font-semibold mb-2">Job</div>
              <select value={jobChoice} onChange={e=>setJobChoice(e.target.value)} className="bg-neutral-800 px-3 py-2 rounded-md border border-neutral-700 w-full">
                <option value="">Pick a job…</option>
                {JOBS.map(j=>(<option key={j.id} value={j.id}>{j.title} — ${j.pay}/week — Energy -{j.energy}</option>))}
              </select>
              <button onClick={()=>setGame(g=> ({...g, artist:{...g.artist, jobId: jobChoice || null }}))} className="bg-yellow-500 text-black px-3 py-2 rounded-md w-full mt-2">Take Job</button>
              <div className="text-xs text-neutral-400 mt-2">
                {currentJob ? `Current: ${currentJob.title} ($${currentJob.pay}/wk, -${currentJob.energy} energy each week)` : 'No job selected.'}
              </div>
              <div className="text-xs text-neutral-500 mt-2">Jobs pay weekly when you press “Advance Week” and also reduce energy.</div>
            </div>
          </section>
        )}

        {/* STUDIO */}
        {tab==='Studio' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search songs" className="bg-neutral-900 px-3 py-2 rounded-md border border-neutral-800 w-full"/>
              <div className="flex gap-2">
                {[['WRITTEN','Written'],['UNRELEASED','Recorded'],['RELEASED','Released']].map(([k,l])=>(
                  <button key={k} onClick={()=>setStudioTab(k)} className={`px-3 py-1 rounded-full border ${studioTab===k?'border-yellow-400 text-yellow-300':'border-neutral-700 text-neutral-400'} hover:text-yellow-300`}>{l}</button>
                ))}
              </div>
            </div>
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div className="grid grid-cols-12 text-sm text-neutral-400 mb-2">
                <div className="col-span-4">Title</div><div className="col-span-2">Quality</div><div className="col-span-2">Hype</div><div className="col-span-2">Status</div><div className="col-span-2">Actions</div>
              </div>
              <div className="divide-y divide-neutral-800">
                {filtered.map(s=> (
                  <div key={s.id} className="grid grid-cols-12 py-2 items-center">
                    <div className="col-span-4 font-medium">{s.title}</div>
                    <div className="col-span-2">{s.quality}</div>
                    <div className="col-span-2">{s.hype??0}</div>
                    <div className="col-span-2">{s.status}</div>
                    <div className="col-span-2 flex gap-2">
                      {s.status==='WRITTEN' && <button onClick={()=>recordSong(s.id)} className="bg-neutral-800 px-2 py-1 rounded-md border border-neutral-700">Record</button>}
                      {s.status==='UNRELEASED' && (<><button onClick={()=>releaseSong(s.id)} className="bg-yellow-500 text-black px-2 py-1 rounded-md">Release</button><button onClick={()=>trashSong(s.id)} className="bg-neutral-800 px-2 py-1 rounded-md border border-neutral-700">Trash</button></>)}
                      {s.status==='RELEASED' && <span className="text-xs text-neutral-500">Released</span>}
                    </div>
                  </div>
                ))}
                {!filtered.length && <div className="text-neutral-500 text-sm py-6">No songs here yet.</div>}
              </div>
            </div>
            {/* Title generator */}
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div className="flex items-center gap-2 mb-2">
                <div className="font-semibold">Song Title Generator</div>
                <select value={genre} onChange={e=>setGenre(e.target.value)} className="bg-neutral-800 px-2 py-1 rounded-md border border-neutral-700">{Object.keys(GENRE_VOCABS).map(g=><option key={g}>{g}</option>)}</select>
                <button onClick={()=>setGenerated(generateTitles(genre, seenTitles.current))} className="bg-yellow-500 text-black px-3 py-1 rounded-md">Generate 3</button>
              </div>
              <div className="flex gap-2">{generated.map(t=>(<button key={t} onClick={()=>addWrittenSong(t)} className="bg-neutral-800 px-3 py-1 rounded-md border border-neutral-700 hover:border-yellow-500">{t}</button>))}</div>
            </div>
          </section>
        )}

        {/* PROJECTS */}
        {tab==='Projects' && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div className="font-semibold mb-2">Create Project</div>
              <div className="flex gap-2 mb-2">
                <input value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="Project title" className="bg-neutral-800 px-3 py-2 rounded-md border border-neutral-700 w-full"/>
                <button onClick={()=>{ const count=projectSongIds.length, type=projectTypeByCount(count,game.config); if(!type){alert('Invalid track count: EP 3–7, Album 8–14'); return} const id=`p${Date.now()}`; const p={id,title:projectName||`Project ${game.week}`,type,songs:[...projectSongIds],hype:40}; setGame(g=>({...g,projects:[...g.projects,p]})); setProjectName(''); setProjectSongIds([]) }} className="bg-yellow-500 text-black px-3 py-2 rounded-md">Save</button>
              </div>
              <div className="text-sm text-neutral-400 mb-2">Pick tracks (Released & Unreleased allowed)</div>
              <div className="max-h-64 overflow-auto border border-neutral-800 rounded-xl">
                {game.songs.filter(s=>s.status!=='TRASHED').map(s=> (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
                    <input type="checkbox" checked={projectSongIds.includes(s.id)} onChange={()=>setProjectSongIds(prev=> prev.includes(s.id)? prev.filter(x=>x!==s.id) : [...prev,s.id])} />
                    <div className="flex-1"><div className="font-medium">{s.title}</div><div className="text-xs text-neutral-500">{s.status} • Q{s.quality||0} • H{s.hype||0}</div></div>
                    {s.status==='RELEASED' && <span className="text-xs text-yellow-400">Released</span>}
                  </label>
                ))}
              </div>
              <div className="text-xs text-neutral-400 mt-2">EP: 3–7 songs • Album: 8–14 songs</div>
            </div>
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div className="font-semibold mb-2">My Projects</div>
              <div className="space-y-2 max-h-96 overflow-auto">
                {game.projects.map(p=> (
                  <div key={p.id} className="border border-neutral-800 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div><div className="font-semibold">{p.title}</div><div className="text-xs text-neutral-500">{p.type} • Tracks: {p.songs.length} {p.released_at_week!=null && '• Released'}</div></div>
                      {p.released_at_week==null ? (<button onClick={()=>setGame(g=>({...g,projects:g.projects.map(x=>x.id===p.id?{...x,released_at_week:g.week,first_week_done:false}:x)}))} className="bg-yellow-500 text-black px-2 py-1 rounded-md">Release</button>) : (<div className="text-xs text-yellow-400">Week streams: {p._week_streams||0}</div>)}
                    </div>
                    {p.released_at_week!=null && p.eligible_released_singles && (<div className="text-xs text-neutral-400 mt-1">Eligible singles counted (first week): {p.eligible_released_singles.length}/{DEFAULT_CONFIG.projectRules.singlesCap}</div>)}
                  </div>
                ))}
                {!game.projects.length && <div className="text-sm text-neutral-500">No projects yet.</div>}
              </div>
            </div>
          </section>
        )}

        {/* PLATFORMS & CHARTS */}
        {tab==='Platforms' && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div className="font-semibold mb-2">Aurafy — Top Songs (This Week)</div>
              <div className="space-y-1 max-h-96 overflow-auto">
                {(game.platformCharts?.AURAFY||[]).map(r=>(
                  <div key={r.id} className="flex items-center justify-between border border-neutral-800 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3"><div className="w-8 text-right text-yellow-400">{r.position}</div><div className="font-medium">{r.title}</div></div>
                    <div className="text-xs text-neutral-400">Streams {r.metric?.toLocaleString?.()||r.metric}</div>
                  </div>
                ))}
                {!game.platformCharts?.AURAFY?.length && <div className="text-sm text-neutral-500">No data yet.</div>}
              </div>
            </div>
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div className="font-semibold mb-2">StreamBox — Top Videos (This Week)</div>
              <div className="space-y-1 max-h-96 overflow-auto">
                {(game.platformCharts?.STREAMBOX||[]).map(r=>(
                  <div key={r.id} className="flex items-center justify-between border border-neutral-800 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3"><div className="w-8 text-right text-yellow-400">{r.position}</div><div className="font-medium">{r.title}</div></div>
                    <div className="text-xs text-neutral-400">Views {r.metric?.toLocaleString?.()||r.metric}</div>
                  </div>
                ))}
                {!game.platformCharts?.STREAMBOX?.length && <div className="text-sm text-neutral-500">No data yet.</div>}
              </div>
            </div>
          </section>
        )}

        {tab==='Charts' && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800"><div className="font-semibold mb-2">Song Chart — Week {game.charts.week||game.week}</div>
              <div className="space-y-1 max-h-96 overflow-auto">
                {(game.charts.songs||[]).map(r=>(
                  <div key={r.id} className="flex items-center justify-between border border-neutral-800 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3"><div className="w-8 text-right text-yellow-400">{r.position}</div><div className="font-medium">{r.title}</div></div>
                    <div className="text-xs text-neutral-400">Streams {r.streams.toLocaleString()} • Sales ${(r.sales).toFixed(2)}</div>
                  </div>
                ))}
                {!game.charts.songs?.length && <div className="text-sm text-neutral-500">No chart data yet.</div>}
              </div></div>
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800"><div className="font-semibold mb-2">Project Chart — Week {game.charts.week||game.week}</div>
              <div className="space-y-1 max-h-96 overflow-auto">
                {(game.charts.projects||[]).map(r=>(
                  <div key={r.id} className="flex items-center justify-between border border-neutral-800 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3"><div className="w-8 text-right text-yellow-400">{r.position}</div><div className="font-medium">{r.title}</div></div>
                    <div className="text-xs text-neutral-400">Streams {r.streams.toLocaleString()} • Sales ${(r.sales).toFixed(2)}</div>
                  </div>
                ))}
                {!game.charts.projects?.length && <div className="text-sm text-neutral-500">No chart data yet.</div>}
              </div></div>
          </section>
        )}

        {/* GOD MODE */}
        {tab==='God Mode' && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div className="font-semibold mb-2">Artist Stats</div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">Cash
                  <input type="number" value={game.artist.cash} onChange={e=>setGame(g=>({...g,artist:{...g.artist,cash:Number(e.target.value)}}))} className="bg-neutral-800 px-2 py-1 rounded-md border border-neutral-700 ml-auto w-32"/>
                </label>
                <label className="flex items-center gap-2 text-sm">Popularity
                  <input type="number" value={game.artist.base_popularity} onChange={e=>setGame(g=>({...g,artist:{...g.artist,base_popularity:Number(e.target.value)}}))} className="bg-neutral-800 px-2 py-1 rounded-md border border-neutral-700 ml-auto w-32"/>
                </label>
                <label className="flex items-center gap-2 text-sm">Hype
                  <input type="number" value={game.artist.hype||30} onChange={e=>setGame(g=>({...g,artist:{...g.artist,hype:Number(e.target.value)}}))} className="bg-neutral-800 px-2 py-1 rounded-md border border-neutral-700 ml-auto w-32"/>
                </label>
                <label className="flex items-center gap-2 text-sm">Energy
                  <input type="number" value={game.artist.energy} onChange={e=>setGame(g=>({...g,artist:{...g.artist,energy:Number(e.target.value)}}))} className="bg-neutral-800 px-2 py-1 rounded-md border border-neutral-700 ml-auto w-32"/>
                </label>
              </div>
            </div>
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div className="font-semibold mb-2">Config</div>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">Sales/Stream (combined)
                  <input type="number" step="0.001" value={game.config.salesPerStream} onChange={e=>setGame(g=>({...g,config:{...g.config,salesPerStream:Number(e.target.value)}}))} className="bg-neutral-800 px-2 py-1 rounded-md border border-neutral-700 ml-auto w-32"/>
                </label>
                <label className="flex items-center gap-2">Clamp Max
                  <input type="number" value={game.config.streamsClamp.max} onChange={e=>setGame(g=>({...g,config:{...g.config,streamsClamp:{...g.config.streamsClamp,max:Number(e.target.value)}}}))} className="bg-neutral-800 px-2 py-1 rounded-md border border-neutral-700 ml-auto w-32"/>
                </label>
                <button onClick={()=>setGame(g=>({...g,config:{...DEFAULT_CONFIG}}))} className="bg-neutral-800 px-3 py-2 rounded-md border border-neutral-700">Reset Config</button>
              </div>
            </div>
          </section>
        )}

        {/* Onboarding modal */}
        {showOnboard && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-full max-w-lg">
              <div className="text-xl font-semibold mb-3">Set up your artist</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <input value={tmpName} onChange={e=>setTmpName(e.target.value)} className="bg-neutral-800 px-3 py-2 rounded-md border border-neutral-700" placeholder="Name" />
                <input type="number" value={tmpAge} onChange={e=>setTmpAge(Number(e.target.value))} className="bg-neutral-800 px-3 py-2 rounded-md border border-neutral-700" placeholder="Age" />
                <input type="number" value={tmpYear} onChange={e=>setTmpYear(Number(e.target.value))} className="bg-neutral-800 px-3 py-2 rounded-md border border-neutral-700" placeholder="Year (e.g. 2025)" />
              </div>
              <button onClick={()=>{ setGame(g=> ({...g, artist:{...g.artist, name: tmpName, age:Number(tmpAge), year:Number(tmpYear)} })); setShowOnboard(false) }} className="bg-yellow-500 text-black px-4 py-2 rounded-md">Start</button>
            </div>
          </div>
        )}

        <footer className="py-6 text-xs text-neutral-500 flex items-center justify-between">
          <span>Engine {ENGINE_VERSION} • Schema {SCHEMA_VERSION} • Gold-accent UI</span>
          <span>Tip: Export your state token to resume in a new chat.</span>
        </footer>
      </div>
    </div>
  )
}
