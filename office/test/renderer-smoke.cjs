'use strict';
// The one-floor renderer replaces v0.9 pagination and activity-driven teleports.
// Run production-page, continuity and independent component fixtures serially.
const {app}=require('electron');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const fixtures=['configuration-renderer.cjs','walking-renderer.cjs','natural-walking-renderer.cjs','walking-crowd-renderer.cjs','walking-transfer-renderer.cjs','walking-fit-recovery-renderer.cjs','finite-main-exit-renderer.cjs','avatar-gait-renderer.cjs','avatar-gait-bridge-renderer.cjs','clone-motion-renderer.cjs','flat-cast-renderer.cjs','cast-continuity-renderer.cjs','clone-recovery-renderer.cjs','venue-renderer.cjs','festival-renderer.cjs','theme-environment-renderer.cjs','festival-interruption-renderer.cjs','agent-social-renderer.cjs', 'station-arrival-renderer.cjs','station-visibility-renderer.cjs','avatar-performance-renderer.cjs','avatar-fallback-renderer.cjs','scene-artwork-renderer.cjs','day-scenery-theme-renderer.cjs'];
app.whenReady().then(()=>{for(const fixture of fixtures){execFileSync(process.execPath,[path.join(__dirname,fixture)],{stdio:'inherit',env:{...process.env,MINI_OFFICE_PREVIEW_DIR:'',MINI_OFFICE_WALKING_SHORT:'1'}});}console.log(JSON.stringify({ok:true,nativeFixtures:fixtures.length}));}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>app.exit(process.exitCode||0));
