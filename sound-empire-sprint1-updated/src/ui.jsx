import React from 'react'
export const Container = ({children}) => (
  <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pb-28">{children}</div>
)
export const H1 = ({children}) => (
  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-3"><span className="gold">Sound Empire</span> — Sprint 1.1</h1>
)
export const StatCard = ({label, value, right}) => (
  <div className="card">
    <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
    <div className="mt-2 text-2xl font-extrabold">{value}</div>
    {right}
  </div>
)
export const Section = ({title, children, action}) => (
  <section className="mt-5">
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm uppercase tracking-wider text-gray-300">{title}</h2>
      {action}
    </div>
    <div className="grid gap-3">{children}</div>
  </section>
)
const Icon = ({d, className}) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className || 'w-6 h-6'}><path d={d}/></svg>
)
export const BottomNav = ({active, onChange}) => {
  const tabs = [
    {key:'dashboard', label:'Dashboard', icon:'M3 12l9-9 9 9v9a2 2 0 01-2 2h-4v-6H9v6H5a2 2 0 01-2-2v-9z'},
    {key:'activities', label:'Activities', icon:'M4 6h16M4 12h16M4 18h16'},
    {key:'studio', label:'Studio', icon:'M12 3v18m9-9H3'},
    {key:'projects', label:'Projects', icon:'M4 6h16v12H4z'},
    {key:'more', label:'More', icon:'M12 6a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4z'},
  ]
  return (
    <div className="sticky-nav glass safe-bottom">
      <div className="max-w-6xl mx-auto px-3 py-2 grid grid-cols-5 gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={()=>onChange(t.key)} className={'tab-btn '+(active===t.key?'active':'')}>
            <Icon d={t.icon} className="w-6 h-6" />
            <span className="text-[11px]">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
export const ButtonGold = (props) => (
  <button {...props} className={"btn-gold "+(props.className||'')}>{props.children}</button>
)
