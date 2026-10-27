import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoState,today } from '../lib/operations.ts';
import { workdayCommand,workdayState,staffText,staffVisit,staffRoute } from '../lib/workday.ts';
import { AccessError } from '../lib/team.ts';
const groomer={id:'staff-a',name:'A',email:'staff@example.test',role:'groomer',status:'active',userId:'clerk:a',version:0,vanId:'v1'};
test('daily work data keeps assigned services and published route clients but no contacts or business costs',()=>{
 const s=demoState(),day=today();
 s.appointments=s.appointments.slice(0,3).map((a,i)=>({...a,date:i===2?'2030-01-01':day,groomerId:i===1?'staff-b':groomer.id}));
 s.clients[0].phone='8112345678';s.clients[0].email='cliente@example.test';s.clients[0].notes='Alergia. Llamar +52 81 1234 5678 o cliente@example.test';
 s.incidents=[{id:'own',appointmentId:s.appointments[0].id,clientId:'c0',description:'Manejo',resolution:''},{id:'other',appointmentId:s.appointments[1].id,clientId:'c1',description:'private',resolution:''},{id:'route',appointmentId:'',routeVisitId:'route-1',clientId:'c3',description:'Cuidado',resolution:''}];
 const v={id:'route-1',clientId:'c3',pets:[{name:s.clients[3].pets[0].name}]};
 s.privateContactExport="secret";
 const result=workdayState(s,groomer,day,[v]);assert.equal(result.privateContactExport,undefined);
 assert.equal(result.appointments.length,1);assert.deepEqual(result.clients.map(c=>c.id),['c0','c3']);
 assert.deepEqual(result.incidents.map(i=>i.id),['own','route']);
 assert(result.clients.every(c=>c.phone===''&&c.email===''));assert(!JSON.stringify(result).includes('8112345678'));assert(!JSON.stringify(result).includes('cliente@example.test'));
 assert.equal(result.appointments[0].cost,0);assert.equal(result.appointments[0].extraCost,0);assert(result.services.every(x=>x.cost===0));assert.deepEqual(result.audit,[]);assert.deepEqual(result.operations,[]);
 assert.equal(s.clients[0].phone,'8112345678');assert.throws(()=>workdayState(s,{...groomer,status:'inactive'},day,[v]),AccessError);
});
test('staff free text masks contact numbers while preserving dates, street numbers and service durations',()=>{
 assert.equal(staffText('Río 135, 26/10/2026. Servicio 60 minutos.'),'Río 135, 26/10/2026. Servicio 60 minutos.');
 assert(!staffText('Tel. (81) 1234-5678; correo: a@example.test').includes('1234-5678'));
 assert(!staffText('Tel. (81) 1234-5678; correo: a@example.test').includes('a@example.test'));
 assert(!staffText('8112345678 8198765432').includes('8112345678'));
 assert(!staffText('8112345678 8198765432').includes('8198765432'));
});
test('work commands cannot change prices, assign clients or vans, confirm bank transfers or impersonate staff',()=>{
 const payment={action:'payment',visitId:'visit-a',revision:0,operationId:crypto.randomUUID(),method:'Transferencia'};
 assert(workdayCommand.safeParse(payment).success);
 for(const extra of [{price:0},{received:true},{clientId:'x'},{vanId:'v4'},{userId:'admin'},{amount:1}])assert(!workdayCommand.safeParse({...payment,...extra}).success);
 assert(!workdayCommand.safeParse({...payment,method:'Pendiente'}).success);
 assert(!workdayCommand.safeParse({action:'status',visitId:'x',status:'Cancelado'}).success);
 assert(!workdayCommand.safeParse({action:'incident',visitId:'x',operationId:crypto.randomUUID(),category:'Otro',description:''}).success);
});
test('route projections use explicit allowed fields and do not leak contacts or raw imports',()=>{
 const v={id:'v',date:today(),vanId:'v1',order:1,clientId:'c0',clientName:'Persona',address:'Calle 10',pets:[],price:45000,method:'Efectivo',received:false,revision:0,phone:'8112345678',original:{phone:'secret'},staffPayment:{id:'private'}};
 const projected=staffVisit(v);assert.equal(projected.phone,undefined);assert.equal(projected.original,undefined);assert.equal(projected.staffPayment,undefined);
 const route=staffRoute({id:'r',date:today(),vanId:'v1',van:'VAN 01',kind:'history',base:'Base 135',stops:[{id:'v',clientId:'c0',client:'A',address:'Calle 10',phone:'secret',price:999}],status:'active',createdAt:'now',createdBy:'admin@example.test',publishedAt:'now',assignedTo:groomer.id,assignedName:'A',revision:0,stale:false,phone:'secret'});
 assert.equal(route.phone,undefined);assert.equal(route.stops[0].phone,undefined);assert.equal(route.stops[0].price,undefined);assert(!JSON.stringify(route).includes('admin@example.test'));
});
