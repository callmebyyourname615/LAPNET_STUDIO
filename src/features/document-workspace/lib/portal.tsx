import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { PortalService } from "./services/portal-service";
import { createHttpPortalService } from "./services/http-adapter";
import { usePlatformTransition } from "@/components/ui/glimm-autopilot";
import { useAuth } from '@/features/identity/Auth';

const ServiceContext = createContext<PortalService | null>(null);

/** Shares the real authenticated Portal session. No fixtures are loaded. */
export function PortalProvider({ children }: { children: ReactNode }) {
  const { documentService } = usePlatformTransition();
  const [service] = useState(() => documentService.current ?? (documentService.current = createHttpPortalService()));
  useEffect(()=>{void service.load();const timer=window.setInterval(()=>{if(!document.hidden&&!service.getNetworkSnapshot().pending&&service.getSnapshot().versions.some(v=>v.scanState==='pending'||v.scanState==='scanning'))void service.load();},3000);return()=>window.clearInterval(timer);},[service]);
  return <ServiceContext.Provider value={service}>{children}</ServiceContext.Provider>;
}
export function useService() {
  const service = useContext(ServiceContext);
  if (!service) throw new Error("Document workspace provider missing");
  return service;
}
export function useData() {
  const service = useService();
  return useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
}
export function useMe() {
  const {me}=useAuth();const d=useData();const svc=useService();
  return {...(d.users.find(user=>user.id===me!.user.id)??{id:me!.user.id,name:me!.user.displayName,title:'',username:me!.user.username??'',systemRole:'member' as const}),departmentId:svc.getConfig()?.departments.find(dep=>dep.canCreate)?.id??me!.memberships[0]?.department.id??''};
}
export function useNetwork(){const svc=useService();return useSyncExternalStore(svc.subscribe,svc.getNetworkSnapshot,svc.getNetworkSnapshot);}
export function useDocumentLoad(){const svc=useService();return {...useNetwork(),retry:()=>void svc.load()};}
