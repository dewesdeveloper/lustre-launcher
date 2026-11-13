import json
import os
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

import libtorrent as lt

TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "http://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://tracker.theoks.net:6969/announce",
    "udp://explodie.org:6969/announce",
    "udp://tracker.dler.org:6969/announce",
    "udp://tracker.bittor.pw:1337/announce",
    "udp://tracker.darkness.services:6969/announce",
    "udp://p4p.arenabg.com:1337/announce",
    "udp://opentracker.io:6969/announce",
    "udp://open.free-tracker.ga:6969/announce",
    "udp://bt1.archive.org:6969/announce",
    "udp://bt2.archive.org:6969/announce",
    "http://tracker1.itzmx.com:8080/announce",
    "http://tracker.bt4g.com:2095/announce",
    "http://tracker.dler.org:6969/announce",
    "http://t.overflow.biz:6969/announce",
    "https://tracker.pmman.tech:443/announce",
    "https://tracker.gcrenwp.top:443/announce",
    "udp://tracker.fnix.net:6969/announce",
    "udp://tracker.filemail.com:6969/announce",
    "udp://tracker.internetwarriors.net:1337/announce",
    "udp://tracker.moeking.me:6969/announce",
    "udp://tracker1.myporn.club:9337/announce",
    "udp://tracker.srv00.com:6969/announce",
    "udp://tracker.dump.cl:6969/announce",
    "udp://public.tracker.vraphim.com:6969/announce",
    "udp://retracker01-msk-virt.corbina.net:80/announce",
    "udp://evan.im:6969/announce",
    "udp://martin-gebhardt.eu:25/announce",
    "udp://isk.richardsw.club:6969/announce",
    "udp://d40969.acod.regrucolo.ru:6969/announce",
    "udp://ttk2.nbaonlineservice.com:6969/announce",
    "http://tracker.mywaifu.best:6969/announce",
    "http://tracker.renfei.net:8080/announce",
    "https://tracker.yemekyedim.com:443/announce",
    "http://bittorrent-tracker.e-n-c-r-y-p-t.net:1337/announce",
]

session = lt.session({"listen_interfaces": "0.0.0.0:6881"})
downloads = {}
downloads_lock = threading.Lock()


class TorrentDownloader:
    def __init__(self, game_id, magnet, save_path):
        self.game_id = game_id
        self.magnet = magnet
        self.save_path = save_path
        self.handle = None
        self.info = None
        self.total_size = 0
        self.downloaded = 0
        self.status = "starting"
        self.error = None
        self.files = []

    def start(self):
        try:
            params = lt.parse_magnet_uri(self.magnet)
            params.save_path = self.save_path

            known = set()
            for t in params.trackers:
                known.add(t)

            tiers = list(params.tracker_tiers)[:len(params.trackers)]
            tiers.extend([0] * (len(params.trackers) - len(tiers)))

            for tracker in TRACKERS:
                if tracker in known:
                    continue
                params.trackers.append(tracker)
                known.add(tracker)
                tiers.append(0)

            params.tracker_tiers = tiers

            self.handle = session.add_torrent(params)
            self.handle.set_flags(lt.torrent_flags.auto_managed)
            self.handle.resume()
            self.status = "downloading"

            self._wait_for_metadata()

            if self.handle and self.handle.is_valid():
                ti = self.handle.torrent_file()
                if ti:
                    self.total_size = ti.total_size()
                    self.files = []
                    for i in range(ti.num_files()):
                        self.files.append({
                            "name": ti.file_path(i),
                            "size": ti.file_size(i),
                        })
        except Exception as e:
            self.status = "error"
            self.error = str(e)

    def _wait_for_metadata(self, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.handle and self.handle.is_valid() and self.handle.has_metadata():
                return True
            time.sleep(0.25)
        return False

    def get_status(self):
        if not self.handle or not self.handle.is_valid():
            return {
                "id": self.game_id, "status": self.status,
                "progress": 0, "downloadSpeed": 0, "uploadSpeed": 0,
                "numPeers": 0, "totalSize": 0, "downloaded": 0,
                "files": [], "error": self.error,
            }

        try:
            st = self.handle.status()
        except Exception:
            return {"id": self.game_id, "status": "error", "error": "status unavailable"}

        progress = st.progress
        total = st.total_wanted if st.total_wanted > 0 else self.total_size
        done = st.total_wanted_done if st.total_wanted_done >= 0 else int(progress * total)

        return {
            "id": self.game_id,
            "status": "downloading" if self.status == "downloading" else self.status,
            "progress": progress,
            "downloadSpeed": st.download_rate,
            "uploadSpeed": st.upload_rate,
            "numPeers": st.num_peers,
            "numSeeds": st.num_seeds,
            "totalSize": total,
            "downloaded": done,
            "files": self.files,
            "error": self.error,
        }

    def pause(self):
        if self.handle and self.handle.is_valid():
            self.handle.pause()
            self.handle.unset_flags(lt.torrent_flags.auto_managed)
            self.status = "paused"

    def resume(self):
        if self.handle and self.handle.is_valid():
            self.handle.set_flags(lt.torrent_flags.auto_managed)
            self.handle.resume()
            self.status = "downloading"

    def cancel(self):
        if self.handle and self.handle.is_valid():
            self.handle.pause()
            session.remove_torrent(self.handle, lt.session.delete_partfile)
        self.handle = None
        self.status = "cancelled"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _send_json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/status":
            result = []
            with downloads_lock:
                for dl in downloads.values():
                    result.append(dl.get_status())
            self._send_json(result)
        elif self.path == "/health":
            self._send_json({"ok": True})
        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(body)
        except Exception:
            self._send_json({"error": "invalid json"}, 400)
            return

        action = data.get("action")

        if action == "start":
            game_id = str(data.get("game_id", ""))
            magnet = data.get("magnet", "")
            save_path = data.get("save_path", os.path.join(os.path.expanduser("~"), "Downloads", "LustreHub"))

            if not magnet.startswith("magnet:"):
                self._send_json({"error": "invalid magnet"}, 400)
                return

            os.makedirs(save_path, exist_ok=True)

            with downloads_lock:
                existing = downloads.get(game_id)
                if existing:
                    existing.cancel()

                dl = TorrentDownloader(game_id, magnet, save_path)
                downloads[game_id] = dl

            threading.Thread(target=dl.start, daemon=True).start()
            self._send_json({"ok": True, "game_id": game_id})

        elif action == "pause":
            game_id = str(data.get("game_id", ""))
            with downloads_lock:
                dl = downloads.get(game_id)
            if dl:
                dl.pause()
            self._send_json({"ok": True})

        elif action == "resume":
            game_id = str(data.get("game_id", ""))
            with downloads_lock:
                dl = downloads.get(game_id)
            if dl:
                dl.resume()
            self._send_json({"ok": True})

        elif action == "cancel":
            game_id = str(data.get("game_id", ""))
            with downloads_lock:
                dl = downloads.get(game_id)
                if dl:
                    dl.cancel()
                downloads.pop(game_id, None)
            self._send_json({"ok": True})

        else:
            self._send_json({"error": "unknown action"}, 400)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 6875
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Torrent server running on http://127.0.0.1:{port}")
    server.serve_forever()
