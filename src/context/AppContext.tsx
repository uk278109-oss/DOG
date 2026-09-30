import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, setDoc, serverTimestamp, type Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./AuthContext";
import type { Chat, MemoryItem, ThemeMode } from "../types";

export type SavedMessage = { id: string; role: "user" | "assistant"; content: string; createdAt?: number };
interface AppContextValue {
  theme: ThemeMode; setTheme:(theme:ThemeMode)=>Promise<void>; memoryEnabled:boolean; setMemoryEnabled:(enabled:boolean)=>Promise<void>;
  memories:MemoryItem[]; addMemory:(text:string)=>Promise<void>; deleteMemory:(id:string)=>Promise<void>; clearMemories:()=>Promise<void>;
  chats:Chat[]; activeChatId:string|null; setActiveChatId:(id:string|null)=>void; createChat:(title?:string)=>Promise<string>; renameChat:(id:string,title:string)=>Promise<void>;
  deleteChat:(id:string)=>Promise<void>; loadMessages:(id:string)=>Promise<SavedMessage[]>; saveMessage:(id:string,role:"user"|"assistant",content:string)=>Promise<void>; refreshChats:()=>Promise<void>;
}
const AppContext=createContext<AppContextValue|null>(null);
function storageKey(uid:string,key:string){return `dog:${uid}:${key}`;}

export function AppProvider({children}:{children:ReactNode}){
  const {user}=useAuth();
  const [theme,setThemeState]=useState<ThemeMode>("dark");
  const [memoryEnabled,setMemoryEnabledState]=useState(true);
  const [memories,setMemories]=useState<MemoryItem[]>([]);
  const [chats,setChats]=useState<Chat[]>([]);
  const [activeChatId,setActiveChatIdState]=useState<string|null>(null);

  useEffect(()=>{
    if(!user){setChats([]);setMemories([]);setActiveChatIdState(null);return;}
    setThemeState((localStorage.getItem(storageKey(user.uid,"theme")) as ThemeMode)||"dark");
    setMemoryEnabledState(localStorage.getItem(storageKey(user.uid,"memoryEnabled"))!=="false");
    setActiveChatIdState(localStorage.getItem(storageKey(user.uid,"activeChat"))||null);
  },[user]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
  useEffect(()=>{
    if(!user||!db)return;
    const q=query(collection(db,"users",user.uid,"memories"),orderBy("createdAt","desc"),limit(100));
    return onSnapshot(q,s=>setMemories(s.docs.map(d=>{const x=d.data();return{id:d.id,text:String(x.text||""),createdAt:(x.createdAt as Timestamp|undefined)?.toMillis()};})),()=>setMemories([]));
  },[user]);

  const refreshChats=useCallback(async()=>{
    if(!user||!db)return;
    const q=query(collection(db,"users",user.uid,"chats"),orderBy("updatedAt","desc"),limit(50));
    const s=await getDocs(q);
    setChats(s.docs.map(d=>{const x=d.data();return{id:d.id,title:String(x.title||"New chat"),createdAt:(x.createdAt as Timestamp|undefined)?.toMillis()||Date.now(),updatedAt:(x.updatedAt as Timestamp|undefined)?.toMillis()||Date.now()};}));
  },[user]);
  useEffect(()=>{void refreshChats();},[refreshChats]);

  const setActiveChatId=(id:string|null)=>{
    setActiveChatIdState(id);
    if(!user)return;
    if(id)localStorage.setItem(storageKey(user.uid,"activeChat"),id); else localStorage.removeItem(storageKey(user.uid,"activeChat"));
  };
  const setTheme=async(v:ThemeMode)=>{setThemeState(v);if(user)localStorage.setItem(storageKey(user.uid,"theme"),v)};
  const setMemoryEnabled=async(v:boolean)=>{setMemoryEnabledState(v);if(user)localStorage.setItem(storageKey(user.uid,"memoryEnabled"),String(v));};
  const addMemory=async(text:string)=>{if(user&&db&&text.trim())await addDoc(collection(db,"users",user.uid,"memories"),{text:text.trim(),createdAt:serverTimestamp()});};
  const deleteMemory=async(id:string)=>{if(user&&db)await deleteDoc(doc(db,"users",user.uid,"memories",id));};
  const clearMemories=async()=>{if(!user||!db)return;const s=await getDocs(collection(db,"users",user.uid,"memories"));await Promise.all(s.docs.map(d=>deleteDoc(d.ref)));};

  const createChat=async(title="New chat")=>{
    if(!user||!db)return "";
    const ref=doc(collection(db,"users",user.uid,"chats"));
    const cleanTitle=title.trim()||"New chat";
    await setDoc(ref,{title:cleanTitle,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    setChats(prev=>[{id:ref.id,title:cleanTitle,createdAt:Date.now(),updatedAt:Date.now()},...prev.filter(c=>c.id!==ref.id)]);
    return ref.id;
  };
  const renameChat=async(id:string,title:string)=>{
    const clean=title.trim();
    if(!user||!db||!clean)return;
    setChats(prev=>prev.map(c=>c.id===id?{...c,title:clean,updatedAt:Date.now()}:c));
    try{await setDoc(doc(db,"users",user.uid,"chats",id),{title:clean,updatedAt:serverTimestamp()},{merge:true});await refreshChats();}
    catch(error){await refreshChats();throw error;}
  };
  const deleteChat=async(id:string)=>{
    if(!user||!db)return;
    const previous=chats;
    setChats(prev=>prev.filter(c=>c.id!==id));
    if(activeChatId===id)setActiveChatId(null);
    try{
      const s=await getDocs(collection(db,"users",user.uid,"chats",id,"messages"));
      await Promise.all(s.docs.map(d=>deleteDoc(d.ref)));
      await deleteDoc(doc(db,"users",user.uid,"chats",id));
    }catch(error){setChats(previous);await refreshChats();throw error;}
  };
  const loadMessages=useCallback(async(id:string)=>{
    if(!user||!db)return[];
    const q=query(collection(db,"users",user.uid,"chats",id,"messages"),orderBy("createdAt","asc"),limit(200));
    const s=await getDocs(q);
    return s.docs.map(d=>{const x=d.data();return{id:d.id,role:x.role as "user"|"assistant",content:String(x.content||""),createdAt:(x.createdAt as Timestamp|undefined)?.toMillis()};});
  },[user]);
  const saveMessage=async(id:string,role:"user"|"assistant",content:string)=>{
    if(!user||!db||!id)return;
    await addDoc(collection(db,"users",user.uid,"chats",id,"messages"),{role,content,createdAt:serverTimestamp()});
    await setDoc(doc(db,"users",user.uid,"chats",id),{updatedAt:serverTimestamp()},{merge:true});
    if(role==="user")setChats(prev=>prev.map(c=>c.id===id?{...c,updatedAt:Date.now(),title:c.title==="New chat"?content.slice(0,45):c.title}:c));
  };
  const value=useMemo(()=>({theme,setTheme,memoryEnabled,setMemoryEnabled,memories,addMemory,deleteMemory,clearMemories,chats,activeChatId,setActiveChatId,createChat,renameChat,deleteChat,loadMessages,saveMessage,refreshChats}),[theme,memoryEnabled,memories,chats,activeChatId]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp(){const v=useContext(AppContext);if(!v)throw new Error("useApp must be used inside AppProvider");return v;}
