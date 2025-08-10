import React, { useState } from 'react'
import { Container, H1, StatCard, Section, BottomNav, ButtonGold } from './ui.jsx'

const initial = { week:1, year:2025, name:'Kason', age:21, cash:1000, hype:30, popularity:35, energy:100, activities:[] }

export default function App(){
  const [tab, setTab] = useState('dashboard')
  const [s, setS] = useState(initial)

  return (
    <div className="min-h-full pb-24">
      <Container>
        <header className="sticky top-0 z-30 -mx-2 px-2 py-3 mb-3 flex items-center justify-between glass rounded-xl">
          <H1 />
          <div className="hidden sm:flex gap-2">
            <ButtonGold onClick={()=>alert('Export State (hook to your logic)')}>Export State</ButtonGold>
            <button className="pill" onClick={()=>alert('Import State (hook to your logic)')}>Import State</button>
          </div>
        </header>

        {tab==='dashboard' && <Dashboard s={s} setS={setS} />}
        {tab==='activities' && <Activities s={s} setS={setS} />}
        {tab==='studio' && <Studio />}
        {tab==='projects' && <Projects />}
        {tab==='more' && <More />}
      </Container>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}

function GridStats({s}){
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      <StatCard label="Week / Year" value={<span><span className="text-3xl font-extrabold">{s.week}</span><span className="opacity-70"> / {s.year}</span></span>} />
      <StatCard label="Artist" value={<span className="text-2xl">{s.name} • {s.age}</span>} />
      <StatCard label="Money" value={<span className="text-2xl font-extrabold">${s.cash.toLocaleString()}</span>} />
      <StatCard label="Hype" value={<span className="text-2xl font-extrabold">{s.hype}</span>} />
      <StatCard label="Popularity" value={<span className="text-2xl font-extrabold">{s.popularity}</span>} />
      <StatCard label="Energy" value={<span className="text-2xl font-extrabold">{s.energy}/100</span>} />
    </div>
  )
}

function Dashboard({s,setS}){
  return (
    <div>
      <GridStats s={s} />
      <Section title="Upcoming" action={<span className="text-xs text-gray-400">Add in Activities</span>}>
        <div className="card text-gray-300">{s.activities.length? s.activities.join(', ') : 'No activities scheduled.'}</div>
      </Section>
      <Section title="Quick Actions" action={<span className="text-xs text-gray-400">Write • Record • Project • Week</span>}>
        <div className="flex flex-wrap gap-2">
          <ButtonGold onClick={()=>alert('Write Song modal')}>Write Song</ButtonGold>
          <ButtonGold onClick={()=>alert('Record Single flow')}>Record Single</ButtonGold>
          <button className="pill" onClick={()=>alert('Create Project flow')}>Create Project</button>
          <button className="pill" onClick={()=>setS(v=>({...v, week:v.week+1, energy:Math.max(0,v.energy-10)}))}>Advance Week</button>
        </div>
      </Section>
    </div>
  )
}

function Activities({s,setS}){
  const add = (t)=>setS(v=>({...v, activities:[...v.activities, t]}))
  return (
    <div>
      <Section title="Jobs">
        <div className="grid gap-2 sm:grid-cols-2">
          {['Warehouse Attendant','Studio Engineer','Driver','Server','Retail Associate','Barista','Security'].map(j=>(
            <div key={j} className="card flex items-center justify-between">
              <div>
                <div className="font-semibold">{j}</div>
                <div className="text-sm text-gray-400">Consumes 15–25 energy / pays weekly</div>
              </div>
              <button className="pill" onClick={()=>add(j+' (scheduled)')}>Schedule</button>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Gigs & Interviews">
        <div className="grid gap-2 sm:grid-cols-2">
          {['Small Venue Gig','Radio Interview','Podcast Spot','Opening Set'].map(x=>(
            <div key={x} className="card flex items-center justify-between">
              <div className="font-semibold">{x}</div>
              <button className="pill" onClick={()=>add(x+' (booked)')}>Book</button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

const Studio = ()=> (
  <div>
    <Section title="Studio"><div className="card">Write/Record/Manage songs (wire to existing logic).</div></Section>
  </div>
)
const Projects = ()=> (
  <div>
    <Section title="Projects"><div className="card">Create EP (3–7) or Album (8–14), add released singles.</div></Section>
  </div>
)
const More = ()=> (
  <div>
    <Section title="More">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="card">Promotion</div>
        <div className="card">Platforms</div>
        <div className="card">Charts</div>
        <div className="card">God Mode</div>
      </div>
    </Section>
  </div>
)
