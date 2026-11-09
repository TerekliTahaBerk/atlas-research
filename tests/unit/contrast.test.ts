import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
function luminance(hex:string){const rgb=hex.match(/[a-f\d]{2}/gi)!.map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;}
function ratio(a:string,b:string){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
test("D02 text/action/focus contrast uses the actual light and dark CSS tokens",()=>{
  const css=readFileSync("src/app/globals.css","utf8");
  for(const selector of [":root",'[data-theme="dark"]']){
    const body=css.slice(css.indexOf(selector)).split("}")[0];
    const token=(name:string)=>body.match(new RegExp(`--${name}:\\s*(#[a-fA-F0-9]{6})`))![1];
    for(const surface of ["canvas","sidebar","card"]){
      assert.ok(ratio(token("text"),token(surface))>=4.5);
      assert.ok(ratio(token("secondary"),token(surface))>=4.5);
      assert.ok(ratio(token("accent"),token(surface))>=3);
    }
    assert.ok(ratio(token("action-text"),token("accent"))>=4.5);
    assert.ok(ratio(token("danger"),token("canvas"))>=4.5);
    assert.ok(ratio(token("control-border"),token("canvas"))>=3);
  }
});
