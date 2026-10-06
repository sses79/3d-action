"""Verify public demo routes and rejection of private project/source files."""
import sys,threading,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from serve_demo import DemoHandler,ThreadingHTTPServer
class QuietHandler(DemoHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),QuietHandler)
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
base=f'http://127.0.0.1:{server.server_port}'
try:
 for route in ['/','/watch/','/watch/app.js','/watch/style.css','/watch/assets/watch.glb','/editor/','/editor/app.js','/editor/style.css','/editor/assets/character.glb']:
  with urllib.request.urlopen(base+route) as r:
   assert r.status==200
   r.read()
 for route in ['/package.json','/watch/source/second-watch.blend','/watch/main.js','/watch/../package.json','/watch/assets/../../serve_demo.py','/server.key','/editor/main.tsx','/editor/source/ASSET_LICENSE.txt','/runtime/player.ts','/editor/assets/../../package.json']:
  try:urllib.request.urlopen(base+route);raise AssertionError(route)
  except urllib.error.HTTPError as e:assert e.code==404
 with urllib.request.urlopen(base+'/watch') as r:
  assert r.url.endswith('/watch/')
  r.read()
 print('Public routes and source-file isolation passed.')
finally:server.shutdown();server.server_close()
