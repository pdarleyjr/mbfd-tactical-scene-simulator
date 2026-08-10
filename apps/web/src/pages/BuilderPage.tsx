import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { Copy, ImageUp, Play, Plus, Save, Trash2, Video } from 'lucide-react'
import { apparatusCatalog, evolutionCatalog, type FiregroundObject, type ScenarioInput } from '@mbfd/domain'
import { AppMark } from '../components/AppMark'
import { api, ApiError } from '../api/client'
import type { RoomView, ScenarioView, SessionView } from '../api/types'
import { useAuthStore } from '../state/auth'
import { SceneCanvas, type SceneCanvasHandle } from '../scene/SceneCanvas'

const blank: ScenarioInput = {
  title: 'New Tactical Scenario', description: 'Describe the training problem.', dispatchInformation: '', worldWidth: 1600, worldHeight: 1000,
  apparatusTemplateIds: apparatusCatalog.map((item) => item.id), evolutionIds: evolutionCatalog.map((item) => item.id), benchmarks: [], injects: [], staticObjects: [],
}

export function BuilderPage() {
  const params = useParams({ strict: false }) as { scenarioId?: string }
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.instructorToken)
  const canvasRef = useRef<SceneCanvasHandle>(null)
  const [scenarios, setScenarios] = useState<ScenarioView[]>([])
  const [current, setCurrent] = useState<ScenarioView>()
  const [form, setForm] = useState<ScenarioInput>(blank)
  const [placement, setPlacement] = useState<string>()
  const [builderMode, setBuilderMode] = useState<'select' | 'hydrant'>('select')
  const [selectedStaticId, setSelectedStaticId] = useState<string>()
  const [rooms, setRooms] = useState<RoomView[]>([])
  const [roomChoice, setRoomChoice] = useState<'new' | string>('new')
  const [roomName, setRoomName] = useState('')
  const [roomPin, setRoomPin] = useState('')
  const [lockRoom, setLockRoom] = useState(false)
  const [benchmarkIds, setBenchmarkIds] = useState<string[]>([])
  const [units, setUnits] = useState('E1, E2, E3, E4, L1, L3, 300')
  const [mode300, setMode300] = useState<'independent' | 'live'>('independent')
  const [message, setMessage] = useState('')
  const background = current?.assets.find((asset) => asset.kind === 'background')

  const refresh = useCallback(async (selectId?: string) => {
    if (!token) return
    const result = await api<{ items: ScenarioView[] }>('/api/scenarios', { token })
    setScenarios(result.items)
    const selected = result.items.find((item) => item.id === (selectId ?? params.scenarioId)) ?? result.items[0]
    if (selected) { setCurrent(selected); setForm(selected); setRoomName(`${selected.title} Training Room`) }
  }, [params.scenarioId, token])
  useEffect(() => { void refresh().catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load scenarios.')) }, [refresh])
  useEffect(() => { if (!token) return; void api<{ items: RoomView[] }>('/api/rooms').then((result) => setRooms(result.items)).catch(() => setRooms([])) }, [token])
  useEffect(() => { setBenchmarkIds(form.benchmarks.map((benchmark) => benchmark.id)) }, [form.benchmarks])

  if (!token) return <main className="shell grid min-h-dvh place-items-center p-5 text-center"><div><h1 className="display text-3xl">Instructor sign-in required</h1><Link to="/" className="btn btn-primary mt-5 no-underline">Return to sign in</Link></div></main>

  function update<K extends keyof ScenarioInput>(key: K, value: ScenarioInput[K]) { setForm((state) => ({ ...state, [key]: value })) }
  async function save(event?: FormEvent) {
    event?.preventDefault(); setMessage('Saving scenario…')
    try {
      const saved = current ? await api<ScenarioView>(`/api/scenarios/${current.id}`, { method: 'PATCH', token, body: form }) : await api<ScenarioView>('/api/scenarios', { method: 'POST', token, body: form })
      await refresh(saved.id); setMessage('Scenario saved.')
      void navigate({ to: '/builder/$scenarioId', params: { scenarioId: saved.id }, replace: true })
    } catch (error) { setMessage(error instanceof ApiError ? error.message : 'Scenario could not be saved.') }
  }
  async function upload(kind: 'background' | 'video', file: File | undefined) {
    if (!current || !file) return
    setMessage(`Processing ${kind}…`)
    const body = new FormData(); body.append('file', file)
    try { await api(`/api/scenarios/${current.id}/assets/${kind}`, { method: 'POST', token, body }); await refresh(current.id); setMessage(`${kind === 'video' ? 'Video' : 'Background'} processed and attached.`) } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed.') }
  }
  async function duplicate() { if (!current) return; const copy = await api<ScenarioView>(`/api/scenarios/${current.id}/duplicate`, { method: 'POST', token }); await refresh(copy.id); void navigate({ to: '/builder/$scenarioId', params: { scenarioId: copy.id } }) }
  async function remove() { if (!current || !confirm(`Delete “${current.title}”? This cannot be undone.`)) return; try { await api(`/api/scenarios/${current.id}`, { method: 'DELETE', token }); setCurrent(undefined); setForm(blank); await refresh(); setMessage('Scenario deleted.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Scenario could not be deleted.') } }
  async function startSession() {
    if (!current) return
    const participatingUnits = units.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean)
    setMessage('Opening training room…')
    try {
      await api<ScenarioView>(`/api/scenarios/${current.id}`, { method: 'PATCH', token, body: form })
      let roomId = roomChoice
      let existing = rooms.find((room) => room.id === roomChoice)
      if (roomChoice === 'new') {
        if (roomName.trim().length < 3) throw new Error('Enter a room name with at least three characters.')
        if (lockRoom && !roomPin) throw new Error('Enter the optional room PIN or turn off room locking.')
        existing = await api<RoomView>('/api/rooms', { method: 'POST', token, body: { name: roomName, ...(lockRoom ? { accessPin: roomPin } : {}) } })
        roomId = existing.id
      } else if (existing) {
        const update: Record<string, unknown> = {}
        if (!lockRoom && existing.locked) update.accessPin = null
        if (lockRoom && roomPin) update.accessPin = roomPin
        if (Object.keys(update).length) existing = await api<RoomView>(`/api/rooms/${existing.id}`, { method: 'PATCH', token, body: update })
      }
      if (!existing || roomId === 'new') throw new Error('Choose an existing room or create a new one.')
      const configuration = { scenarioId: current.id, participatingUnits, mode300, benchmarkIds }
      const session = existing.currentSession?.status === 'setup'
        ? await api<SessionView>(`/api/sessions/${existing.currentSession.id}/configuration`, { method: 'PUT', token, body: configuration })
        : await api<SessionView>('/api/sessions', { method: 'POST', token, body: { roomId, ...configuration } })
      void navigate({ to: '/instructor/$sessionId', params: { sessionId: session.id } })
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Training room could not be opened.') }
  }

  return <main className="shell min-h-dvh"><header className="flex min-h-16 items-center gap-4 border-b border-[#34434c] bg-[#111a1f] px-4"><AppMark/><span className="ml-auto eyebrow">Instructor workspace</span></header>
    <div className="grid min-h-[calc(100dvh-64px)] lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="border-r border-[#34434c] bg-[#111a1f] p-4"><button className="btn btn-primary mb-4 w-full" onClick={() => { setCurrent(undefined); setForm(blank) }}><Plus size={18}/>New scenario</button><nav className="space-y-1" aria-label="Scenarios">{scenarios.map((scenario) => <button key={scenario.id} className={`min-h-14 w-full border-l-4 p-3 text-left ${current?.id === scenario.id ? 'border-[#57a8df] bg-[#263943]' : 'border-transparent bg-transparent'}`} onClick={() => { setCurrent(scenario); setForm(scenario); void navigate({ to: '/builder/$scenarioId', params: { scenarioId: scenario.id } }) }}><strong className="display block text-sm">{scenario.title}</strong><small className="muted">Updated {new Date(scenario.updatedAt).toLocaleDateString()}</small></button>)}</nav></aside>
      <section className="min-w-0 p-4 md:p-6"><form onSubmit={save} className="mx-auto max-w-6xl space-y-5"><div className="flex flex-wrap items-center gap-2"><div className="mr-auto"><p className="eyebrow">Scenario builder</p><h1 className="display text-3xl">{current ? 'Edit scenario' : 'Create scenario'}</h1></div><button type="submit" className="btn btn-primary"><Save size={18}/>Save</button>{current && <><button type="button" className="btn btn-secondary" onClick={() => void duplicate()}><Copy size={18}/>Duplicate</button><button type="button" className="btn btn-danger" onClick={() => void remove()}><Trash2 size={18}/>Delete</button></>}</div>
        {message && <p className="border-l-4 border-[#d49c33] bg-[#1d2a32] p-3" role="status">{message}</p>}
        <div className="panel grid gap-4 p-4 md:grid-cols-2"><label><span className="mb-1 block font-semibold">Scenario title</span><input className="field" value={form.title} onChange={(event) => update('title', event.target.value)} required/></label><label><span className="mb-1 block font-semibold">Real-world calibration</span><div className="flex"><input className="field" type="number" min="0.001" step="0.001" value={form.feetPerWorldUnit ?? ''} onChange={(event) => update('feetPerWorldUnit', event.target.value ? Number(event.target.value) : undefined)}/><span className="grid min-w-28 place-items-center border border-l-0 border-[#53646e]">ft / unit</span></div></label><label><span className="mb-1 block font-semibold">Description</span><textarea className="field min-h-28" value={form.description} onChange={(event) => update('description', event.target.value)}/></label><label><span className="mb-1 block font-semibold">Dispatch information</span><textarea className="field min-h-28" value={form.dispatchInformation} onChange={(event) => update('dispatchInformation', event.target.value)}/></label></div>
        <div className="grid gap-4 lg:grid-cols-2"><fieldset className="panel p-4"><legend className="display px-2 text-lg">Available apparatus</legend><div className="grid grid-cols-3 gap-2">{apparatusCatalog.map((item)=>{const active=form.apparatusTemplateIds.includes(item.id);return <button type="button" key={item.id} className={`btn ${active?'btn-primary':'btn-secondary'}`} aria-pressed={active} onClick={()=>update('apparatusTemplateIds',active&&form.apparatusTemplateIds.length>1?form.apparatusTemplateIds.filter((id)=>id!==item.id):active?form.apparatusTemplateIds:[...form.apparatusTemplateIds,item.id])}>{item.id}</button>})}</div></fieldset><fieldset className="panel p-4"><legend className="display px-2 text-lg">Available evolutions</legend><div className="grid grid-cols-2 gap-2">{evolutionCatalog.map((item)=>{const active=form.evolutionIds.includes(item.id);return <button type="button" key={item.id} className={`btn text-xs ${active?'btn-primary':'btn-secondary'}`} aria-pressed={active} onClick={()=>update('evolutionIds',active&&form.evolutionIds.length>1?form.evolutionIds.filter((id)=>id!==item.id):active?form.evolutionIds:[...form.evolutionIds,item.id])}>{item.label}</button>})}</div></fieldset></div>
        <section className="panel p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="display text-xl">Scenario benchmarks</h2><p className="muted">Define the milestones an instructor can timestamp during the exercise.</p></div><button type="button" className="btn btn-secondary" onClick={() => update('benchmarks', [...form.benchmarks, { id: `benchmark-${crypto.randomUUID().slice(0, 8)}`, label: 'New benchmark', description: '' }])}><Plus size={17}/>Add benchmark</button></div><div className="mt-3 space-y-3">{form.benchmarks.map((benchmark, index) => <div key={benchmark.id} className="grid gap-2 border border-[#34434c] p-3 md:grid-cols-[1fr_1.4fr_48px]"><input aria-label={`Benchmark ${index + 1} label`} className="field" value={benchmark.label} onChange={(event) => update('benchmarks', form.benchmarks.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))}/><input aria-label={`Benchmark ${index + 1} description`} className="field" value={benchmark.description} placeholder="Completion criteria" onChange={(event) => update('benchmarks', form.benchmarks.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))}/><button type="button" aria-label={`Remove benchmark ${index + 1}`} className="btn btn-danger !w-12 !p-0" onClick={() => update('benchmarks', form.benchmarks.filter((_item, itemIndex) => itemIndex !== index))}><Trash2 size={17}/></button></div>)}</div></section>
        <div className="panel p-4"><div className="flex items-center justify-between"><div><h2 className="display text-xl">Instructor injects</h2><p className="muted">Prepare conditions to reveal during the session.</p></div><button type="button" className="btn btn-secondary" onClick={()=>update('injects',[...form.injects,{title:'New inject',description:'Describe the changing condition.'}])}><Plus size={17}/>Add inject</button></div><div className="mt-3 space-y-3">{form.injects.map((inject,index)=><div key={index} className="grid gap-2 border border-[#34434c] p-3 md:grid-cols-[1fr_1.5fr_150px_48px]"><input aria-label={`Inject ${index+1} title`} className="field" value={inject.title} onChange={(event)=>update('injects',form.injects.map((item,itemIndex)=>itemIndex===index?{...item,title:event.target.value}:item))}/><input aria-label={`Inject ${index+1} description`} className="field" value={inject.description} onChange={(event)=>update('injects',form.injects.map((item,itemIndex)=>itemIndex===index?{...item,description:event.target.value}:item))}/><input aria-label={`Inject ${index+1} reveal time`} title="Optional reveal time in seconds" className="field" type="number" min="0" placeholder="Seconds" value={inject.revealAtSeconds??''} onChange={(event)=>update('injects',form.injects.map((item,itemIndex)=>itemIndex===index?{...item,...(event.target.value?{revealAtSeconds:Number(event.target.value)}:{revealAtSeconds:undefined})}:item))}/><button type="button" aria-label={`Remove inject ${index+1}`} className="btn btn-danger !w-12 !p-0" onClick={()=>update('injects',form.injects.filter((_item,itemIndex)=>itemIndex!==index))}><Trash2 size={17}/></button></div>)}</div></div>
        {current && <div className="grid gap-4 md:grid-cols-2"><label className="btn btn-secondary cursor-pointer"><ImageUp size={18}/>Upload map image<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void upload('background', event.target.files?.[0])}/></label><label className="btn btn-secondary cursor-pointer"><Video size={18}/>Attach MP4 video<input className="sr-only" type="file" accept="video/mp4" onChange={(event) => void upload('video', event.target.files?.[0])}/></label></div>}
        <div className="panel p-4"><h2 className="display text-xl">Static scenario placement</h2><p className="muted mb-3">Place fixed apparatus or hydrants into the source scene. Objects remain locked for participants.</p><div className="mb-3 flex flex-wrap gap-2">{apparatusCatalog.map((item) => <button type="button" key={item.id} className={`btn ${placement === item.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setPlacement(item.id); setBuilderMode('select') }}>{item.id}</button>)}<button type="button" className={`btn ${builderMode==='hydrant'?'btn-primary':'btn-secondary'}`} onClick={()=>{setBuilderMode('hydrant');setPlacement(undefined)}}>Hydrant</button><button type="button" disabled={!selectedStaticId} className="btn btn-danger" onClick={()=>{update('staticObjects',form.staticObjects.filter((item)=>item.id!==selectedStaticId));setSelectedStaticId(undefined)}}>Remove selected</button></div><div className="relative aspect-[16/10] min-h-80 overflow-hidden border border-[#34434c] bg-black">{background ? <SceneCanvas ref={canvasRef} backgroundUrl={background.runtimeUrl} world={{width:form.worldWidth,height:form.worldHeight}} objects={form.staticObjects.map((object)=>({...object,locked:false}))} actor={{clientId:'scenario-builder',name:'Instructor',unit:'INSTRUCTOR'}} mode={builderMode} placementTemplateId={placement} selectedObjectId={selectedStaticId} onSelect={setSelectedStaticId} onUpsert={(object: FiregroundObject) => update('staticObjects', [...form.staticObjects.filter((item) => item.id !== object.id), {...object,locked:true}])} onRemove={(object) => update('staticObjects', form.staticObjects.filter((item) => item.id !== object.id))} onPlacementComplete={() => setPlacement(undefined)}/> : <p className="grid h-full place-items-center muted">Save the scenario, then upload a map image.</p>}</div></div>
        {current && <section className="panel p-4"><div><p className="eyebrow">Instructor setup</p><h2 className="display text-xl">Open a training room</h2><p className="muted mt-1">Reuse a named room or create a new one. Room PIN protection is optional.</p></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2"><label><span className="mb-1 block font-semibold">Training room</span><select className="field" value={roomChoice} onChange={(event) => { const value = event.target.value; setRoomChoice(value); const room = rooms.find((item) => item.id === value); setLockRoom(room?.locked ?? false); setRoomPin('') }}><option value="new">Create a new room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}{room.currentSession?.status === 'setup' ? ' · resume setup' : ''}</option>)}</select></label>
            {roomChoice === 'new' && <label><span className="mb-1 block font-semibold">New room name</span><input className="field" value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={100}/></label>}
            <label><span className="mb-1 block font-semibold">Participating units</span><input className="field" value={units} onChange={(event) => setUnits(event.target.value)}/><small className="muted mt-1 block">Comma-separated assignments, such as E1, L1, 300.</small></label>
            <label><span className="mb-1 block font-semibold">Command 300 starts in</span><select className="field" value={mode300} onChange={(event) => setMode300(event.target.value as 'independent'|'live')}><option value="independent">Independent plan</option><option value="live">Operations</option></select></label>
          </div>
          <fieldset className="mt-4 border border-[#34434c] p-3"><legend className="display px-2">Room access</legend><label className="flex min-h-12 cursor-pointer items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={lockRoom} onChange={(event) => { setLockRoom(event.target.checked); if (!event.target.checked) setRoomPin('') }}/><span><strong className="block">Require a room PIN</strong><small className="muted">Optional. Leave this off for open participant access.</small></span></label>{lockRoom && <label className="mt-3 block"><span className="mb-1 block font-semibold">{rooms.find((room) => room.id === roomChoice)?.locked ? 'New PIN (blank keeps current PIN)' : 'Room PIN'}</span><input className="field max-w-xs" value={roomPin} onChange={(event) => setRoomPin(event.target.value.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" placeholder={rooms.find((room) => room.id === roomChoice)?.locked ? 'Keep current PIN' : 'Enter 1–12 digits'}/></label>}</fieldset>
          <fieldset className="mt-4 border border-[#34434c] p-3"><legend className="display px-2">Benchmarks for this session</legend><p className="muted mb-2 text-sm">Select the milestones you anticipate evaluating.</p><div className="grid gap-2 md:grid-cols-2">{form.benchmarks.map((benchmark) => <label key={benchmark.id} className="flex min-h-12 cursor-pointer items-center gap-3 border border-[#34434c] bg-[#111a1f] px-3"><input type="checkbox" className="h-5 w-5" checked={benchmarkIds.includes(benchmark.id)} onChange={(event) => setBenchmarkIds((items) => event.target.checked ? [...items, benchmark.id] : items.filter((id) => id !== benchmark.id))}/><span>{benchmark.label}</span></label>)}</div>{!form.benchmarks.length && <p className="muted">Add benchmarks above, then save the scenario.</p>}</fieldset>
          <button type="button" className="btn btn-primary mt-4 w-full md:w-auto" onClick={() => void startSession()}><Play size={18}/>Open instructor console</button>
        </section>}
      </form></section>
    </div>
  </main>
}
