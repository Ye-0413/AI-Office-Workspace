'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Rooms=require('../lib/room-designs.js'),Scene=require('../lib/scene-model.js');
const Walking=require('../lib/walking-layout.js'),Visitors=require('../lib/visitor-model.js');

// The decorative guest uses the first area's center rather than the full
// cast's seat allocator. Every authored room must keep that actual destination
// usable at the guest's .65 scale, including its body and nameplate envelope.
const visitorZone=zone=>({window:'library',plant:'lobby',door:'exit'})[zone]||zone;
for(const room of Rooms.CATALOG)test(`${room.id}: decorative visitor can reach every mapped stop center`,()=>{
  const scene=Rooms.createScene(Scene,room),layout=Walking.forScene(scene),body={uniformScale:.65};
  const entrance=scene.ZONES.exit;
  assert.ok(layout.legalPoint(entrance,body),'visitor appears at a legal exit-area center');
  const destinations=Visitors.STOPS.map(stop=>({zone:stop.zone,point:scene.ZONES[visitorZone(stop.zone)]||scene.ZONES.lobby}));
  for(const destination of destinations){
    assert.ok(layout.legalPoint(destination.point,body),destination.zone+' retains the complete visible guest envelope');
    // Stops follow one another in a random order. Check every ordered pair,
    // as well as arrival and departure, rather than just one lucky entrance.
    for(const source of [{zone:'entrance',point:entrance},...destinations]){
      if(source.point.x===destination.point.x&&source.point.y===destination.point.y)continue;
      const path=layout.route(source.point,destination.point,body),last=path.at(-1);
      assert.ok(path.length>1,source.zone+' → '+destination.zone+' has a route');
      assert.ok(Math.abs(last.x-destination.point.x)<.000001&&Math.abs(last.y-destination.point.y)<.000001,
        source.zone+' → '+destination.zone+' reaches its intended stop');
    }
    const home=layout.route(destination.point,entrance,body);
    assert.ok(home.length>1||destination.point.x===entrance.x&&destination.point.y===entrance.y,destination.zone+' can leave');
  }
});
