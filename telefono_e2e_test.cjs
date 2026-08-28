const WebSocket = require('ws');
const URL = 'ws://localhost:8080/ws';
const results = [];
function check(name, cond, extra) { results.push([name, !!cond]); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  -> ' + JSON.stringify(extra).slice(0,120) : '')); }
function open(tag) {
  const ws = new WebSocket(URL); ws._tag=tag; ws._all=[];
  ws.on('message', d=>{ try{ ws._all.push(JSON.parse(d)); }catch{} });
  return new Promise((res,rej)=>{ ws.on('open',()=>res(ws)); ws.on('error',rej); });
}
function send(ws,o){ ws.send(JSON.stringify(o)); }
function waitMsg(ws, pred, timeout=4000){
  return new Promise((res,rej)=>{
    const t=setTimeout(()=>rej(new Error('timeout '+ws._tag)), timeout);
    const h=(data)=>{ let m; try{ m=JSON.parse(data);}catch{return;} if(pred(m)){ clearTimeout(t); ws.off('message',h); res(m);} };
    ws.on('message',h);
  });
}
(async()=>{
  try{
    const host = await open('host');
    const p1 = await open('p1');
    const p2 = await open('p2');
    const p3 = await open('p3');

    send(host,{type:'host_create'});
    const created = await waitMsg(host, m=>m.type==='room_created');
    const code = created.code;
    check('telefono: host_create', !!code);

    // p1,p2,p3 join (host stays facilitator, not a player) — attach waits before sends to avoid races
    const jP1 = waitMsg(p1,m=>m.type==='joined');
    const jP2 = waitMsg(p2,m=>m.type==='joined');
    const jP3 = waitMsg(p3,m=>m.type==='joined');
    const playersWait = waitMsg(host,m=>m.type==='players' && m.players && m.players.length===3);
    send(p1,{type:'join', code, clientId:'p1', alias:'Ana'});
    send(p2,{type:'join', code, clientId:'p2', alias:'Bea'});
    send(p3,{type:'join', code, clientId:'p3', alias:'Cami'});
    await jP1; await jP2; await jP3;
    const playersMsg = await playersWait;
    check('telefono: 3 alumnos unidos', playersMsg.players && playersMsg.players.length===3, playersMsg.players);
    const playersOrder = playersMsg.players.map(p=>p.clientId);
    const byId = { p1, p2, p3, host };
    // hub: select telefono
    const gameSelHost = waitMsg(host,m=>m.type==='game_selected');
    const gameSelP1 = waitMsg(p1,m=>m.type==='game_selected');
    send(host,{type:'host_select_game', game:'telefono'});
    const gsHost = await gameSelHost;
    await gameSelP1;
    check('hub: game_selected telefono', gsHost.game==='telefono');

    // start telefono chain —first drawer is playersOrder[0] (join order, may vary)
    const drawer0 = playersOrder[0];
    const guesser1 = playersOrder[1];
    const drawer2 = playersOrder[2];
    const teleRoundDrawer0 = waitMsg(byId[drawer0],m=>m.type==='telefono_round');
    const teleRoundOther = waitMsg(byId[drawer0==='p1'?'p2':'p1'],m=>m.type==='telefono_round');
    const teleRoundP3All = waitMsg(p3,m=>m.type==='telefono_round');
    send(host,{type:'telefono_start', category:'emociones', mode:'words'});
    let rDrawer0, rOther;
    try{ rDrawer0 = await teleRoundDrawer0; rOther = await teleRoundOther; await teleRoundP3All; }catch(e){
      console.log('DEBUG order', playersOrder);
      console.log('DEBUG p1', p1._all.slice(-5));
      console.log('DEBUG p2', p2._all.slice(-5));
      console.log('DEBUG p3', p3._all.slice(-5));
      throw e;
    }
    check('telefono: primera ronda es dibujo para '+drawer0, rDrawer0.stepType==='draw' && rDrawer0.drawerId===drawer0 && typeof rDrawer0.word==='string', rDrawer0.word);
    check('telefono: otros ven espera (sin palabra)', rOther.word==null && rOther.stepType==='draw');

    // also test live draw retransmision in telefono draw step (from actual drawer)
    const drawToHost = waitMsg(host,m=>m.type==='draw');
    send(byId[drawer0],{type:'draw', from:{x:0,y:0}, to:{x:0.1,y:0.1}, color:'#000', size:3});
    const drawRecv = await drawToHost;
    check('telefono: draw live se retransmite al host', drawRecv.type==='draw');

    // drawer envia dibujo final (captura)
    const guessRoundGuesser = waitMsg(byId[guesser1],m=>m.type==='telefono_round' && m.stepType==='guess');
    send(byId[drawer0],{type:'telefono_submit_drawing', imageData:'data:image/png;base64,AAA_'+drawer0});
    const grGuesser = await guessRoundGuesser;
    check('telefono: tras dibujo de '+drawer0+', '+guesser1+' recibe ronda de eleccion', grGuesser.stepType==='guess' && grGuesser.guesserId===guesser1, {image:!!grGuesser.imageData, opts:grGuesser.options&&grGuesser.options.length});
    check('telefono: guess trae imagen del dibujo previo', grGuesser.imageData==='data:image/png;base64,AAA_'+drawer0);
    check('telefono: guess trae 4 opciones', Array.isArray(grGuesser.options) && grGuesser.options.length>=4);

    // guesser elige opcion
    const nextDrawDrawer2 = waitMsg(byId[drawer2],m=>m.type==='telefono_round' && m.stepType==='draw');
    const ackGuesser = waitMsg(byId[guesser1],m=>m.type==='telefono_guess_result');
    send(byId[guesser1],{type:'telefono_guess', optionId: grGuesser.options[0].id});
    await ackGuesser;
    const rDrawer2 = await nextDrawDrawer2;
    check('telefono: tras eleccion de '+guesser1+', '+drawer2+' recibe ronda de dibujo', rDrawer2.stepType==='draw' && rDrawer2.drawerId===drawer2 && typeof rDrawer2.word==='string', rDrawer2.word);

    // ultimo dibujante envia su dibujo (final step, cadena de 3 termina)
    const waitingHost = waitMsg(host,m=>m.type==='telefono_waiting_reveal');
    send(byId[drawer2],{type:'telefono_submit_drawing', imageData:'data:image/png;base64,AAA_'+drawer2});
    await waitingHost;
    check('telefono: cadena completa -> waiting_reveal', true);

    // host revela cadena
    const chainHost = waitMsg(host,m=>m.type==='telefono_chain_reveal');
    const chainP1 = waitMsg(p1,m=>m.type==='telefono_chain_reveal');
    send(host,{type:'host_reveal'});
    const chHost = await chainHost;
    await chainP1;
    check('telefono: host_reveal entrega cadena', chHost.chain && chHost.chain.length===3, chHost.chain&&chHost.chain.length);
    check('telefono: cadena contiene imagenes y elecciones', chHost.chain[0].imageData==='data:image/png;base64,AAA_'+drawer0 && typeof chHost.chain[1].guessText==='string');

    // host_next limpia telefono para nueva cadena
    const clearedP1 = waitMsg(p1,m=>m.type==='telefono_cleared');
    send(host,{type:'host_next'});
    await clearedP1;
    check('telefono: host_next limpia', true);

    host.close(); p1.close(); p2.close(); p3.close();
    const failed = results.filter(r=>!r[1]).length;
    console.log('\nTELEFONO RESULTADO: '+(results.length-failed)+'/'+results.length+' pass');
    process.exit(failed?1:0);
  }catch(e){
    console.error('ERROR TELEFONO:', e.message, e.stack&&e.stack.slice(0,500));
    process.exit(2);
  }
})();
