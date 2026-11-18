import {useState,type FormEvent} from 'react';
import {searchSchema} from '@lapnet/contracts';
import {Skeleton} from '../../components/ui/skeleton';
import {useTaskData} from '../tasks/api';
import {errorText} from '../identity/Auth';
import {apiRequest} from '../../lib/api';
import {DocumentLookup} from './DocumentLookup';
export type Go=(path:string)=>void;
export const routes={post:'/feed',company:'/companies',interaction:'/interactions',document:'/documents'};
export const endpoints={post:'posts',company:'companies',interaction:'interactions',document:'documents'};
export const labels={post:'ຂ່າວສານວຽກ',company:'ບໍລິສັດ',interaction:'ການຕິດຕໍ່',document:'ເອກະສານ',task:'ວຽກ'};
export function Loading({loading,error,reload}:{loading:boolean;error:string;reload:()=>void}){return <>{loading&&<Skeleton variant="rows"/>}{error&&<div className="identity-error" role="alert"><p>{error}</p><button className="button secondary" onClick={reload}>ລອງໃໝ່</button></div>}</>;}
export function Pager({next,cursors,set}:{next:string|null;cursors:string[];set:(value:string[])=>void}){return <div className="task-pagination"><button className="button secondary" disabled={!cursors.length} onClick={()=>set(cursors.slice(0,-1))}>ກ່ອນໜ້າ</button><span>ໜ້າ {cursors.length+1}</span><button className="button secondary" disabled={!next} onClick={()=>next&&set([...cursors,next])}>ຖັດໄປ</button></div>;}
export function useWrite(){const [busy,setBusy]=useState(false),[error,setError]=useState('');async function run(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await work();}catch(e){setError(errorText(e));}finally{setBusy(false);}}return {busy,error,run};}
export function Submit({busy,label='ບັນທຶກ'}:{busy:boolean;label?:string}){return <button className="button primary" disabled={busy} type="submit">{busy&&<Skeleton variant="inline"/>}{busy?'ກຳລັງບັນທຶກ...':label}</button>;}
export function Failure({error}:{error:string}){return error?<p className="identity-error" role="alert">{error}</p>:null;}
export function ResourceLookup({kind,value,onChange,label='ລາຍການ',required=false}:{kind?:string;value:string;onChange:(id:string)=>void;label?:string;required?:boolean}){
 if(kind==='document')return <DocumentLookup value={value} onChange={onChange} label={label} required={required}/>;
 return <GeneralResourceLookup kind={kind} value={value} onChange={onChange} label={label} required={required}/>;
}
function GeneralResourceLookup({kind,value,onChange,label,required}:{kind?:string;value:string;onChange:(id:string)=>void;label:string;required:boolean}){
 const [q,setQ]=useState('');const {data,loading,error,reload}=useTaskData('/api/v1/search?limit=25&q='+encodeURIComponent(q)+(kind?'&kind='+kind:''),searchSchema);
 return <div className="portal-lookup"><label>{label}<input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="ຄົ້ນຫາຊື່ ຫຼື ເລກທະບຽນ" maxLength={100}/></label>{loading?<Skeleton variant="card" rows={1}/>:error?<Loading loading={false} error={error} reload={reload}/>:<label>ເລືອກລາຍການ<select value={value} required={required} onChange={e=>onChange(e.target.value)}><option value="">ເລືອກ</option>{value&&!data?.items.some(x=>x.id===value)&&<option value={value}>ລາຍການທີ່ເລືອກ</option>}{data?.items.map(x=><option key={x.id} value={x.id}>{x.code} · {x.title}</option>)}</select></label>}</div>;
}
export function SimpleForm({children,onSave}:{children:React.ReactNode;onSave:(data:FormData)=>Promise<void>}){const {busy,error,run}=useWrite();return <form className="identity-form" aria-busy={busy} onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const data=new FormData(e.currentTarget);void run(()=>onSave(data));}}><fieldset disabled={busy} className="portal-fields">{children}</fieldset><Failure error={error}/><Submit busy={busy}/></form>;}
export const value=(form:FormData,key:string)=>String(form.get(key)??'').trim();
export function Links({id,edit,go}:{id:string;edit:boolean;go:Go}){
 const schema=linksSchema;const {data,loading,error,reload}=useTaskData(`/api/v1/resources/${id}/links`,schema);const [target,setTarget]=useState('');
 return <section className="panel"><h2>ລາຍການທີ່ກ່ຽວຂ້ອງ</h2><Loading loading={loading} error={error} reload={reload}/>{data?.map(x=><button className="portal-record-link" key={x.linkId} onClick={()=>go(x.href)}>{labels[x.kind as keyof typeof labels]??x.kind} · {x.title}</button>)}{data&&!data.length&&<p className="muted">ຍັງບໍ່ມີລາຍການເຊື່ອມໂຍງທີ່ມີສິດເບິ່ງ.</p>}{edit&&<SimpleForm onSave={async()=>{await apiRequest(`/api/v1/resources/${id}/links`,'POST',{targetId:target,kind:'related'});setTarget('');reload();}}><ResourceLookup value={target} onChange={setTarget} required label="ເຊື່ອມວຽກ / ບໍລິສັດ / ເອກະສານ"/><p className="task-help">ເຊື່ອມລາຍການເດີມ ໂດຍບໍ່ສຳເນົາໄຟລ໌ ຫຼື ປ່ຽນສິດ.</p></SimpleForm>}</section>;
}
const linksSchema={parse(value:unknown){if(!Array.isArray(value))throw Error();return value as {id:string;linkId:string;title:string;kind:string;href:string}[];}};
