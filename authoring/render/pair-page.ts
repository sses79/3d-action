// The page pair-video.mjs opens in headless Chrome: the clay view, driven through window.renderFrame and friends.
import {init} from './clay-view';
init().catch(e=>(window as any).renderError=String(e?.message||e));
