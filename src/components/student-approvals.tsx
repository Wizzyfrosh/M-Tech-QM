"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Search, UserCheck, Users, Clock3, LoaderCircle, ShieldOff } from "lucide-react";

type Status = "PENDING"|"ACTIVE"|"SUSPENDED";
type Entry = { id:string;name:string;normalizedEmail:string;status:Status;revision:number;
 user:{emailVerified:boolean}|null };
const options: {key:Status;label:string}[] = [
  {key:"PENDING",label:"Awaiting approval"},
  {key:"ACTIVE",label:"Approved"},
  {key:"SUSPENDED",label:"Suspended"},
];
export function StudentApprovals() {
  const [status,setStatus] = useState<Status>("PENDING");
  const [entries,setEntries] = useState<Entry[]>([]);
  const [selected,setSelected] = useState<string[]>([]);
  const [page,setPage] = useState(1);
  const [total,setTotal] = useState(0);
  const [search,setSearch] = useState("");
  const [query,setQuery] = useState("");
  const [version,setVersion] = useState(0);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [error,setError] = useState("");
  useEffect(()=>{
    const controller = new AbortController();
    fetch(`/api/instructor/students?status=${status}&page=${page}&q=${encodeURIComponent(query)}`,
      {signal:controller.signal,cache:"no-store"})
      .then(async response=>{const body=await response.json();
        if(!response.ok)throw new Error(body.error || "Unable to load students");
        setEntries(body.entries);setTotal(body.total);setSelected([]);setError("");
      })
      .catch(e=>{if(e.name!=="AbortError")setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[status,page,query,version]);
  function refresh(){setLoading(true);setVersion(v=>v+1);}
  async function approve(ids:string[]){
    if(!ids.length || busy)return;
    setBusy(true);setError("");setNotice("");
    try {
      const response=await fetch("/api/instructor/students/approve",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids}),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || "Approval failed");
      setNotice(`${body.approved} student${body.approved===1?"":"s"} approved.${body.skipped?" "+body.skipped+" could not be approved; refresh and check their status.":""}`);
      refresh();
    }catch(e){setError(e instanceof Error?e.message:"Approval failed.");}
    finally{setBusy(false);}
  }
  async function update(entry:Entry){
    setBusy(true);setError("");setNotice("");
    try {
      const next:Status=entry.status==="ACTIVE"?"SUSPENDED":"ACTIVE";
      const response=await fetch(`/api/instructor/students/${entry.id}`,{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({status:next,revision:entry.revision}),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || "Could not update access");
      setNotice(next==="ACTIVE"?"Student approved.":"Student access suspended.");
      refresh();
    }catch(e){setError(e instanceof Error?e.message:"Update failed.");}
    finally{setBusy(false);}
  }
  const ids=entries.filter(e=>e.status==="PENDING" && e.user?.emailVerified).map(e=>e.id);
  const allSelected=ids.length>0&&ids.every(id=>selected.includes(id));
  return <div className="form-stack">
    <section className="panel">
      <div className="panel-heading"><div>
        <span className="eyebrow">ACCESS REQUESTS</span>
        <h2>Student approvals</h2>
        <p>Students create and verify their own accounts. Approve them here when ready.</p>
      </div><span className="badge lavender"><Users size={15}/> {total} {status.toLowerCase()}</span></div>
      <div className="button-row" role="group" aria-label="Filter student approval status">
        {options.map(option=><button type="button" key={option.key}
          className={`button ${status===option.key?"primary":""}`}
          aria-pressed={status===option.key}
          onClick={()=>{setStatus(option.key);setPage(1);setLoading(true);}}>
          {option.key==="PENDING"?<Clock3 size={16}/>:option.key==="ACTIVE"?<UserCheck size={16}/>:<ShieldOff size={16}/>}
          {option.label}
        </button>)}
      </div>
      <form className="searchbar" onSubmit={e=>{e.preventDefault();setQuery(search);setPage(1);setLoading(true);}}>
        <Search size={17}/><input aria-label="Search students" maxLength={80}
          placeholder="Search registered name or email" value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className="button small" type="submit">Search</button>
      </form>
      {notice&&<p className="notice success" role="status"><CheckCircle2 size={16}/>{notice}</p>}
      {error&&<p className="notice error" role="alert">{error}</p>}
      {status==="PENDING"&&ids.length>0&&<div className="button-row">
        <label className="checkbox-label"><input type="checkbox" checked={allSelected}
          onChange={e=>setSelected(e.target.checked?ids:[])}/> Select all on this page</label>
        <button className="button primary" disabled={busy || !selected.length}
          onClick={()=>approve(selected)}><CheckCircle2 size={16}/> Approve selected ({selected.length})</button>
      </div>}
      {loading?<div role="status" className="empty compact"><LoaderCircle className="spin"/> Loading students…</div>:
        entries.length?<div className="table-scroll"><table><thead><tr>
          {status==="PENDING"&&<th>Select</th>}
          <th>Student</th><th>Verification</th><th>Access</th><th>Actions</th>
        </tr></thead><tbody>{entries.map(entry=><tr key={entry.id}>
          {status==="PENDING"&&<td><input aria-label={`Select ${entry.name}`} type="checkbox"
            disabled={!entry.user?.emailVerified||busy} checked={selected.includes(entry.id)}
            onChange={e=>setSelected(values=>e.target.checked?[...values,entry.id]:values.filter(id=>id!==entry.id))}/></td>}
          <td><div className="student-cell"><span className="avatar lavender">{entry.name.charAt(0).toUpperCase()}</span>
            <div><strong>{entry.name}</strong><small>{entry.normalizedEmail}</small></div></div></td>
          <td>{entry.user?.emailVerified?"Verified":"Not verified"}</td>
          <td><span className={`badge ${entry.status==="ACTIVE"?"green":"amber"}`}>{entry.status==="PENDING"?"Waiting":entry.status==="ACTIVE"?"Approved":"Suspended"}</span></td>
          <td>{entry.status==="PENDING"?<button className="button small primary" disabled={busy||!entry.user?.emailVerified}
            onClick={()=>approve([entry.id])}>Approve</button>:<button className="button small"
            disabled={busy} onClick={()=>update(entry)}>{entry.status==="ACTIVE"?"Suspend":"Restore"}</button>}</td>
        </tr>)}</tbody></table></div>:
        <div className="empty"><UserCheck size={30}/>
          <h3>{status==="PENDING"?"No verified students waiting":status==="ACTIVE"?"No approved students":"No suspended students"}</h3>
          <p>{status==="PENDING"?"Share the registration link with students. Verified accounts appear automatically.":"Students will appear here when their status changes."}</p>
        </div>}
      <div className="pagination"><span>{total} students · Page {page} of {Math.max(1,Math.ceil(total/20))}</span>
        <div className="button-row"><button className="button small" disabled={page<=1||busy}
          onClick={()=>{setPage(v=>v-1);setLoading(true);}}>Previous</button>
          <button className="button small" disabled={page*20>=total||busy}
          onClick={()=>{setPage(v=>v+1);setLoading(true);}}>Next</button></div></div>
    </section>
  </div>;
}
