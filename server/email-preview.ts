type MimePart={mimeType?:string;body?:{data?:string};parts?:MimePart[]};
const hiddenTags=new Set(['script','style','template','noscript','svg','iframe','object','head']);
const blockTags=new Set(['br','div','p','li','ul','ol','blockquote','section','article','header','footer','table','tr','hr']);
const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',hellip:'…'};
function decodeEntities(value:string){return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,(whole,entity:string)=>{
 if(entity[0]==='#'){
  const code=entity[1]?.toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);
  return Number.isInteger(code)&&code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):whole;
 }
 return entities[entity.toLowerCase()]??whole;
});}
const clean=(value:string)=>decodeEntities(value).replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n').replace(/[\t\f\v ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
function htmlText(html:string){
 let text='',own='',quoted=false;const hidden:string[]=[];
 const append=(value:string)=>{if(!hidden.length){text+=value;if(!quoted)own+=value;}};
 for(let i=0;i<html.length;){
  if(html.startsWith('<!--',i)){const end=html.indexOf('-->',i+4);i=end<0?html.length:end+3;continue;}
  if(html[i]!=='<'){append(html[i++]);continue;}
  let end=i+1,quote='';
  for(;end<html.length;end++){const char=html[end];if(quote){if(char===quote)quote='';}else if(char==='"'||char==="'")quote=char;else if(char==='>')break;}
  if(end===html.length){append(html[i++]);continue;}
  const tag=html.slice(i,end+1),match=tag.match(/^<\s*(\/?)\s*([a-z][\w:-]*)\b/i);i=end+1;if(!match)continue;
  const closing=!!match[1],name=match[2].toLowerCase();
  if(hiddenTags.has(name)){
   if(closing){const at=hidden.lastIndexOf(name);if(at>=0)hidden.splice(at,1);}
   else if(!tag.endsWith('/>'))hidden.push(name);
   continue;
  }
  if(hidden.length)continue;
  if(!closing&&(name==='blockquote'||/\bclass\s*=\s*(["'])[^"']*\bgmail_quote\b/i.test(tag)))quoted=true;
  if(blockTags.has(name))append('\n');
 }
 return {text:clean(text),own:clean(own)};
}
function allParts(part:MimePart|undefined):MimePart[]{return part?[part,...(part.parts||[]).flatMap(allParts)]:[];}
export function emailTextPreview(payload:MimePart|undefined){
 const candidates=allParts(payload);
 const plain=candidates.find(part=>part.mimeType?.toLowerCase()==='text/plain'&&part.body?.data);
 const plainText=plain?.body?.data?Buffer.from(plain.body.data,'base64url').toString('utf8'):'';
 if(plainText.trim()){
  const own=plainText.split(/\nOn .{4,200} wrote:\s*\n/i)[0].trim();
  return {text:plainText,fromHtml:false,hasOwnText:!!own&&!/^>/.test(own),truncated:plainText.length>50000};
 }
 const html=candidates.find(part=>part.mimeType?.toLowerCase()==='text/html'&&part.body?.data);
 const source=html?.body?.data?Buffer.from(html.body.data,'base64url').toString('utf8'):'';
 const converted=htmlText(source.slice(0,200000));
 return {text:converted.text,fromHtml:!!source,hasOwnText:!!converted.own,truncated:source.length>200000||converted.text.length>50000};
}
