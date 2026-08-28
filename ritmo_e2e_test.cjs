const WebSocket = require('ws');
const URL = 'ws://localhost:8080/ws';
const results=[];
function check(n,c,e){results.push([n,!!c]); console.log((c?'PASS ':'FAIL ')+n+(e?' -> '+JSON.stringify(e).slice(0,120):''));}
function open(tag){ const ws=new WebSocket(URL); ws._tag=tag; ws.on('message',()=>{}); return new Promise((res,rej)=>{ ws.on('open',()=>res(ws)); ws.on('error',rej);});}
function send(ws,o){ ws.send(JSON.stringify(o));}
function waitMsg(ws,pred,timeout=6000){ return new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('timeout '+ws._tag)),timeout); const h=(data)=>{let m;try{m=JSON.parse(data);}catch{return;} if(pred(m)){clearTimeout(t); ws.off('message',h); res(m);}}; ws.on('message',h);});}
(async()=>{
  try{
    const host=await open('host'); const p1=await open('p1'); const p2=await open('p2');
    send(host,{type:'host_create'}); const cr=await waitMsg(host,m=>m.type==='room_created'); const code=cr.code; check('ritmo: host_create', !!code);
    const jP1=waitMsg(p1,m=>m.type==='joined'); const jP2=waitMsg(p2,m=>m.type==='joined'); const ply=waitMsg(host,m=>m.type==='players'&&m.players.length===2);
    send(p1,{type:'join',code,clientId:'p1',alias:'Ana'}); send(p2,{type:'join',code,clientId:'p2',alias:'Bea'});
    await jP1; await jP2; await ply; check('ritmo: 2 alumnos', true);
    const gsH=waitMsg(host,m=>m.type==='game_selected'); const gsP1=waitMsg(p1,m=>m.type==='game_selected');
    send(host,{type:'host_select_game',game:'ritmo'}); await gsH; await gsP1; check('ritmo: game_selected', true);
    // start with short cycles for test: 2 cycles * 2000ms = 4s total
    const rrHost=waitMsg(host,m=>m.type==='ritmo_round'); const rrP1=waitMsg(p1,m=>m.type==='ritmo_round'); const rrP2=waitMsg(p2,m=>m.type==='ritmo_round');
    send(host,{type:'ritmo_start', cycles:2, cycleMs:2000}); const rrh=await rrHost; await rrP1; await rrP2;
    check('ritmo: ritmo_round recibido', rrh.cycles===2 && rrh.cycleMs===2000);
    // taps
    const tapHost1=waitMsg(host,m=>m.type==='ritmo_tap_event'); send(p1,{type:'ritmo_tap'}); const t1=await tapHost1; check('ritmo: tap de p1 llega al host', t1.alias==='Ana');
    const tapHost2=waitMsg(host,m=>m.type==='ritmo_tap_event'); send(p2,{type:'ritmo_tap'}); await tapHost2; check('ritmo: tap de p2 llega al host', true);
    // wait for auto end (cycles*cycleMs = 4000ms + buffer)
    const endHost=waitMsg(host,m=>m.type==='ritmo_end', 7000); const endP1=waitMsg(p1,m=>m.type==='ritmo_end', 7000);
    await endHost; await endP1; check('ritmo: ritmo_end tras ciclos', true);
    // host_next clears
    const clr=waitMsg(p1,m=>m.type==='ritmo_cleared');
    send(host,{type:'host_next'}); await clr; check('ritmo: host_next limpia', true);
    host.close(); p1.close(); p2.close();
    const failed=results.filter(r=>!r[1]).length;
    console.log('\nRITMO RESULTADO: '+(results.length-failed)+'/'+results.length+' pass');
    process.exit(failed?1:0);
  }catch(e){ console.error('ERROR RITMO', e.message, e.stack&&e.stack.slice(0,400)); process.exit(2);}
})();
