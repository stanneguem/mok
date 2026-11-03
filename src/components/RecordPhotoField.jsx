import {useRef,useState} from 'react'
import {supabase} from '../supabase'

const BUCKET='mok-record-photos'
const MAX_SIZE=5*1024*1024
const extension=file=>({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[file.type])
export default function RecordPhotoField({value,onChange,multiple=false,max=1,label='Photo du dossier'}){
 const inputRef=useRef(null),[uploading,setUploading]=useState(false),[error,setError]=useState('')
 const photos=multiple?(Array.isArray(value)?value:[]):(value?[value]:[])
 const addFiles=async files=>{
  setError('')
  const chosen=Array.from(files||[])
  if(!chosen.length)return
  if(photos.length+chosen.length>max){setError('Tu peux ajouter au maximum '+max+' photo(s).');return}
  for(const file of chosen){if(!extension(file)){setError('Format accepté : JPG, PNG ou WEBP.');return}if(file.size>MAX_SIZE){setError('Chaque photo doit peser 5 Mo maximum.');return}}
  setUploading(true)
  try{
   const {data:{user},error:userError}=await supabase.auth.getUser()
   if(userError||!user)throw new Error('Connecte-toi pour ajouter une photo.')
   const uploaded=[]
   for(const file of chosen){
    const path=user.id+'/'+(multiple?'houses':'records')+'/'+crypto.randomUUID()+'.'+extension(file)
    const {error:uploadError}=await supabase.storage.from(BUCKET).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type})
    if(uploadError)throw uploadError
    const {data}=supabase.storage.from(BUCKET).getPublicUrl(path)
    uploaded.push(data.publicUrl)
   }
   onChange(multiple?[...photos,...uploaded]:uploaded[0])
  }catch(e){setError(e.message||'Impossible d’envoyer la photo.')}
  finally{setUploading(false);if(inputRef.current)inputRef.current.value=''}
 }
 const remove=index=>onChange(multiple?photos.filter((_,i)=>i!==index):'')
 return <div className="record-photo-field">
  <div className="record-photo-heading"><div><strong>{label}</strong><small>{multiple?photos.length+' / '+max+' photos':'Une photo · 5 Mo maximum'}</small></div><button type="button" className="secondary-button" disabled={uploading||photos.length>=max} onClick={()=>inputRef.current?.click()}>{uploading?'Envoi…':photos.length?'Ajouter':'Choisir une photo'}</button></div>
  <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} hidden onChange={e=>addFiles(e.target.files)}/>
  {photos.length>0&&<div className="record-photo-grid">{photos.map((url,index)=><div className="record-photo-item" key={url}><img src={url} alt={'Photo '+(index+1)} loading="lazy"/><button type="button" aria-label="Retirer la photo" onClick={()=>remove(index)}>×</button></div>)}</div>}
  {error&&<p className="record-photo-error" role="alert">{error}</p>}
 </div>
}
