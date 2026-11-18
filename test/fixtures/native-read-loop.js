/** 为协议替身添加真实的主机工具往返；结果仍由各测试场景决定。 */
export function nativeReadLoopSource(threadId, logPath, defaultCatalog = true) {
  return `
let nativeValue, nativePage=0, nativeTotal=0;
const nativeSend=m=>console.log(JSON.stringify(m));
const nativeCall=(id,tool,args)=>nativeSend({id,method:'item/tool/call',params:{threadId:${JSON.stringify(threadId)},turnId:'native-turn',namespace:null,tool,arguments:args}});
function nativeStart(m,value){nativeValue=value;nativePage=0;nativeSend({id:m.id,result:{turn:{id:'native-turn'}}});nativeCall('native-index','wiki_source_index',{offset:0});}
function nativeReply(m){
 ${defaultCatalog ? `if(m.method==='model/list'){nativeSend({id:m.id,result:{data:[{id:'fixture',model:'test-model',displayName:'Test model',defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low',description:''}]}],nextCursor:null}});return true;}` : ''}
 if(typeof m.id!=='string'||!m.id.startsWith('native-'))return false;
 if(!m.result?.success)throw new Error(JSON.stringify(m));
 const data=JSON.parse(m.result.contentItems[0].text);
 if(m.id==='native-index')nativeTotal=data.total;
 else {${logPath ? `importLog(JSON.stringify(data.fragments.map(f=>f.itemId))+'\\n');` : ''}nativePage++;}
 if(nativePage<nativeTotal)nativeCall('native-page-'+nativePage,'wiki_read_source',{page:nativePage});
 else setTimeout(()=>{nativeSend({method:'item/completed',params:{threadId:${JSON.stringify(threadId)},turnId:'native-turn',item:{type:'agentMessage',text:JSON.stringify(nativeValue)}}});nativeSend({method:'turn/completed',params:{threadId:${JSON.stringify(threadId)},turn:{id:'native-turn',status:'completed'}}});},80);
 return true;
}
${logPath ? `const importLog=line=>appendFileSync(${JSON.stringify(logPath)},line);` : ''}
`;
}
