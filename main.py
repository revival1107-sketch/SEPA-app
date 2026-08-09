"""데스크톱 실행 진입점: Flask 서버를 백그라운드로 띄우고 pywebview 창으로 감싼다."""
import socket
import threading

import webview

from server import app

PORT = 5678


def _port_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def _run_flask(port):
    # 0.0.0.0 으로 바인딩해 같은 와이파이/네트워크의 다른 기기(휴대폰 등)에서도 접속 가능하게 함
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False, threaded=True)


def main():
    port = PORT if _port_free(PORT) else 0
    if port == 0:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]

    t = threading.Thread(target=_run_flask, args=(port,), daemon=True)
    t.start()

    webview.create_window(
        "SEPA 종목 발굴기 - Mark Minervini 트렌드 템플릿",
        f"http://127.0.0.1:{port}",
        width=1360,
        height=900,
        min_size=(1000, 700),
    )
    webview.start()


if __name__ == "__main__":
    main()
