import { existsSync } from 'node:fs';
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setPixelFormat('yuv420p');
Config.setColorSpace('bt709');
Config.setCodec('h264');
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('angle');

// Cloud/CI containers often ship a preinstalled headless shell. Locally,
// Remotion downloads its own browser when this path does not exist.
const preinstalledShell =
  '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
if (existsSync(preinstalledShell)) {
  Config.setBrowserExecutable(preinstalledShell);
}
