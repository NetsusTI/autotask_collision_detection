from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import time
import os

app = Flask(__name__)

API_KEY = os.environ.get('TICKET_LOCK_API_KEY', 'CAMBIAR_ESTA_CLAVE')

@app.after_request
def allow_private_network(response):
    response.headers['Access-Control-Allow-Private-Network'] = 'true'
    return response

CORS(app)

@app.before_request
def check_api_key():
    if request.method == 'OPTIONS':
        return  # preflight, no lleva headers custom
    if request.headers.get('X-API-Key') != API_KEY:
        return jsonify({'error': 'unauthorized'}), 401

locks = {}  # {ticket_id: {user, timestamp}}
LOCK_TIMEOUT = 40  # segundos sin heartbeat = se libera automáticamente

def cleanup_expired():
    while True:
        time.sleep(10)
        now = time.time()
        expired = [k for k, v in locks.items() if now - v['timestamp'] > LOCK_TIMEOUT]
        for k in expired:
            del locks[k]
            print(f"[auto-liberado] ticket {k}")

threading.Thread(target=cleanup_expired, daemon=True).start()

@app.route('/lock/<ticket_id>', methods=['GET'])
def get_lock(ticket_id):
    lock = locks.get(ticket_id)
    if lock and time.time() - lock['timestamp'] <= LOCK_TIMEOUT:
        return jsonify(lock)
    return jsonify(None)

@app.route('/lock/<ticket_id>', methods=['POST'])
def set_lock(ticket_id):
    user = request.json.get('user', 'Desconocido')
    existing = locks.get(ticket_id)
    if existing and time.time() - existing['timestamp'] <= LOCK_TIMEOUT and existing['user'] != user:
        return jsonify({'ok': False, 'user': existing['user']}), 409
    locks[ticket_id] = {'user': user, 'timestamp': time.time()}
    print(f"[bloqueado] ticket {ticket_id} por {user}")
    return jsonify({'ok': True})

@app.route('/lock/<ticket_id>', methods=['DELETE'])
def release_lock(ticket_id):
    user = (request.json or {}).get('user', '')
    if ticket_id in locks and (not user or locks[ticket_id]['user'] == user):
        del locks[ticket_id]
        print(f"[liberado] ticket {ticket_id}")
    return jsonify({'ok': True})

@app.route('/heartbeat/<ticket_id>', methods=['POST'])
def heartbeat(ticket_id):
    user = request.json.get('user', '')
    if ticket_id in locks and locks[ticket_id]['user'] == user:
        locks[ticket_id]['timestamp'] = time.time()
    return jsonify({'ok': True})

@app.route('/status', methods=['GET'])
def status():
    now = time.time()
    active = {k: v['user'] for k, v in locks.items() if now - v['timestamp'] <= LOCK_TIMEOUT}
    return jsonify(active)

if __name__ == '__main__':
    print("Servidor de locks iniciado en puerto 5001")
    app.run(host='0.0.0.0', port=5001)
