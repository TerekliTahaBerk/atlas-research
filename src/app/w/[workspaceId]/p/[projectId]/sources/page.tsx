import {ResearchScreen} from "@/components/research";
export default async function Page({params}:{params:Promise<{workspaceId:string;projectId:string}>}){const p=await params;return <ResearchScreen w={p.workspaceId} p={p.projectId} mode="library"/>;}
