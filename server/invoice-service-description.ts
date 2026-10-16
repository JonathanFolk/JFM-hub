// Owner-approved invoice wording. Classification and pricing must be confirmed elsewhere.
export function invoiceServiceDescription(description:string,property:string,legacy=false,appendProperty?:boolean){
 let text=description.replace(/\s+/g,' ').trim();const address=property.replace(/\s+/g,' ').trim();
 const existingLegacy=text.startsWith('(Legacy) ');if(existingLegacy)text=text.slice(9);
 const suffix=` - ${address}`;if(text.endsWith(suffix))text=text.slice(0,-suffix.length);
 text=text.replace(/^Premium (?:RE )?Photos\b/,'Premium RE Photos').replace(/^Basic (?:RE )?Photos\b/,'Basic RE Photos').replace(/^(?:Premium Video|RE Video)\b/,'RE Video').replace(/^2D Floor ?Plans\b/i,'2D Floorplans');
 if(text==='Reel')text='IG Reel - Additional Deliverable';
 if(text==='Intro Talking')text='Basic Intro Audio Walk + Talk';
 const main=/^(?:Premium RE Photos|Basic RE Photos|RE Video|2D Floorplans)\b/.test(text);
 const addon=/^(?:IG Reel - Additional Deliverable|Basic Intro Audio Walk \+ Talk)$/.test(text);
 // Drone services stay distinct; address inclusion must be selected explicitly.
 const known=main||addon||/^(?:Aerial Drone Photo Video \(1 Flight\)|Aerial Drone Photo - One-Time Complimentary|Neighborhood Video \+ Drone 15<x<60min)$/.test(text);
 const prefix=existingLegacy||(legacy&&known)?'(Legacy) ':'';
 const include=appendProperty??(main?true:addon?false:false);
 return prefix+text+(include&&address?suffix:'');
}
