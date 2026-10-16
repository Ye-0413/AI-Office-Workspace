'use strict';
// The one-floor renderer replaces v0.9 pagination and activity-driven teleports.
// Run production-page, continuity and independent component fixtures serially.
const {app}=require('electron');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const fixtures=['configuration-renderer.cjs','flat-cast-renderer.cjs','cast-continuity-renderer.cjs','venue-renderer.cjs','festival-renderer.cjs','theme-environment-renderer.cjs','festival-interruption-renderer.cjs','agent-social-renderer.cjs','avatar-performance-renderer.cjs'];
app.whenReady().then(()=>{for(const fixture of fixtures){execFileSync(process.execPath,[path.join(__dirname,fixture)],{stdio:'inherit',env:{...process.env,MINI_OFFICE_PREVIEW_DIR:''}});}console.log(JSON.stringify({ok:true,nativeFixtures:fixtures.length}));}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>app.exit(process.exitCode||0));
