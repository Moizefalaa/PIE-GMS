const WebSocket = require('ws');
const URL = 'ws://localhost:8080/ws';
const results=[];
function check(n,c,e){results.push([n,!!c]); console.log((c?'PASS ':'FAIL ')+n+(e?' -> '+JSON.stringify(e).slice(0,120):''));}
function open(tag){ const ws=new WebSocket(URL); ws._tag=tag; ws._all=[]; ws.on('message',d=>{try{ws._all.push(JSON.parse(d));}catch{}}); return new Promise((res,rej)=>{ ws.on('open',()=>res(ws)); ws.on('error',rej);});}
function send(ws,o){ ws.send(JSON.stringify(o));}
function waitMsg(ws,pred,timeout=4000){ return new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('timeout '+ws._tag)),timeout); const h=(data)=>{let m;try{m=JSON.parse(data);}catch{return;} if(pred(m)){clearTimeout(t); ws.off('message',h); res(m);}}; ws.on('message',h);});}
(async()=>{
  try{
    const host=await open('host'); const p1=await open('p1'); const p2=await open('p2');
    send(host,{type:'host_create'}); const cr=await waitMsg(host,m=>m.type==='room_created'); const code=cr.code; check('amedias: host_create', !!code);
    const jP1=waitMsg(p1,m=>m.type==='joined'); const jP2=waitMsg(p2,m=>m.type==='joined'); const ply=waitMsg(host,m=>m.type==='players'&&m.players.length===2);
    send(p1,{type:'join',code,clientId:'p1',alias:'Ana'}); send(p2,{type:'join',code,clientId:'p2',alias:'Bea'});
    await jP1; await jP2; const pl=await ply; check('amedias: 2 alumnos', pl.players.length===2);
    // select amedias
    const gsH=waitMsg(host,m=>m.type==='game_selected'); const gsP1=waitMsg(p1,m=>m.type==='game_selected');
    send(host,{type:'host_select_game',game:'amedias'}); const gsh=await gsH; await gsP1; check('amedias: game_selected', gsh.game==='amedias');
    // start story
    const rHost=waitMsg(host,m=>m.type==='amedias_round'); const rP1=waitMsg(p1,m=>m.type==='amedias_round'); const rP2=waitMsg(p2,m=>m.type==='amedias_round');
    send(host,{type:'amedias_start'}); const rh=await rHost; const rp1=await rP1; await rP2;
    check('amedias: ronda con prompt y opciones', !!rh.prompt && Array.isArray(rh.options) && rh.options.length===4, rh.prompt);
    check('amedias: p1 ve opciones', rp1.options.length===4);
    // vote
    const ackP1=waitMsg(p1,m=>m.type==='amedias_guess_result'); const evHost1=waitMsg(host,m=>m.type==='amedias_vote_event'); const prog1=waitMsg(host,m=>m.type==='amedias_progress');
    send(p1,{type:'amedias_guess', optionId: rh.options[0].id}); await ackP1; await evHost1; const prog=await prog1; check('amedias: voto p1 registrado', prog.votes===1);
    const ackP2=waitMsg(p2,m=>m.type==='amedias_guess_result'); const evHost2=waitMsg(host,m=>m.type==='amedias_vote_event');
    send(p2,{type:'amedias_guess', optionId: rh.options[1].id}); await ackP2; await evHost2; check('amedias: voto p2 registrado', true);
    // reveal
    const revHost=waitMsg(host,m=>m.type==='amedias_reveal'); const revP1=waitMsg(p1,m=>m.type==='amedias_reveal');
    send(host,{type:'host_reveal'}); const rvH=await revHost; await revP1;
    check('amedias: reveal con tally y correcta', !!rvH.correctText && rvH.tally, rvH.tally);
    // next clears
    const clr=waitMsg(p1,m=>m.type==='amedias_cleared');
    send(host,{type:'host_next'}); await clr; check('amedias: host_next limpia', true);
    host.close(); p1.close(); p2.close();
    const failed=results.filter(r=>!r[1]).length;
    console.log('\nAMEDIAS RESULTADO: '+(results.length-failed)+'/'+results.length+' pass');
    process.exit(failed?1:0);
  }catch(e){ console.error('ERROR AMEDIAS', e.message, e.stack&&e.stack.slice(0,400)); process.exit(2);}
})();
