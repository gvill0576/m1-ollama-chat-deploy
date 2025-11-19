from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import socket
import subprocess
import time
import os

app = Flask(__name__)
CORS(app)

OLLAMA_BASE_URL = "http://localhost:11434"
INSTANCE_ID = socket.gethostname()
DEFAULT_MODEL = "gemma:2b"
_model_download_started = False  

def is_ollama_running():
    """Check if Ollama service is running"""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=2)
        return response.status_code == 200
    except:
        return False

def start_ollama():
    """Start Ollama service"""
    try:
        # Try to start Ollama in the background
        subprocess.Popen(['ollama', 'serve'], 
                        stdout=subprocess.DEVNULL, 
                        stderr=subprocess.DEVNULL,
                        start_new_session=True)
        
        # Wait for Ollama to start (max 30 seconds)
        for i in range(30):
            time.sleep(1)
            if is_ollama_running():
                return True
        return False
    except Exception as e:
        print(f"Failed to start Ollama: {e}")
        return False

def ensure_model_loaded(model_name):
    """Ensure the model is downloaded and ready"""
    try:
        # Check if model exists
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            model_names = [m.get('name', '').split(':')[0] for m in models]
            
            if model_name not in model_names:
                print(f"Pulling model {model_name}...")
                # Pull the model (this will block but ensures it's ready)
                pull_response = requests.post(
                    f"{OLLAMA_BASE_URL}/api/pull",
                    json={"name": model_name},
                    timeout=600  # 10 minutes for download
                )
                return pull_response.status_code == 200
            return True
    except Exception as e:
        print(f"Failed to ensure model: {e}")
        return False

def initialize_ollama():
    """Initialize Ollama - start if needed and load model"""
    if not is_ollama_running():
        print("Ollama not running, starting...")
        if not start_ollama():
            return False, "Failed to start Ollama service"
    
    # Ensure model is loaded
    if not ensure_model_loaded(DEFAULT_MODEL):
        return False, f"Failed to load model {DEFAULT_MODEL}"
    
    return True, "Ollama ready"

# Initialize on startup
print("Initializing Ollama...")
success, message = initialize_ollama()
if success:
    print(f"✓ {message}")
else:
    print(f"✗ {message}")
    print("Will retry on first request...")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "instance_id": INSTANCE_ID}), 200

@app.route('/api/status', methods=['GET'])
def status():
    """Check if Ollama is ready to accept requests"""
    global _model_download_started
    
    ollama_running = is_ollama_running()
    
    if not ollama_running:
        print("Ollama not running, attempting to start...")
        success, message = initialize_ollama()
        if not success:
            return jsonify({
                "ready": False,
                "status": "starting",
                "message": "Starting Ollama service...",
                "instance_id": INSTANCE_ID
            }), 200
    
    # Check if model is available
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            # FIX: Keep the full model name with tag
            model_names = [m.get('name', '') for m in models]
            
            # Check if our model exists (with or without explicit tag)
            model_exists = any(
                name == DEFAULT_MODEL or 
                name.startswith(DEFAULT_MODEL.split(':')[0] + ':')
                for name in model_names
            )
            
            if model_exists:
                _model_download_started = False
                return jsonify({
                    "ready": True,
                    "status": "ready",
                    "message": "Ollama is ready",
                    "model": DEFAULT_MODEL,
                    "instance_id": INSTANCE_ID
                }), 200
            else:
                if not _model_download_started:
                    print(f"Model {DEFAULT_MODEL} not found, starting download in background...")
                    _model_download_started = True
                    
                    def pull_model():
                        global _model_download_started
                        try:
                            print(f"Background thread: pulling {DEFAULT_MODEL}...")
                            ensure_model_loaded(DEFAULT_MODEL)
                            print(f"Background thread: {DEFAULT_MODEL} ready!")
                        except Exception as e:
                            print(f"Background thread error: {e}")
                        finally:
                            _model_download_started = False
                    
                    thread = threading.Thread(target=pull_model, daemon=True)
                    thread.start()
                
                return jsonify({
                    "ready": False,
                    "status": "loading_model",
                    "message": f"Downloading model {DEFAULT_MODEL}. This may take a few minutes...",
                    "instance_id": INSTANCE_ID
                }), 200
    except Exception as e:
        print(f"Status check error: {e}")
    
    return jsonify({
        "ready": False,
        "status": "initializing",
        "message": "Initializing Ollama. Please wait...",
        "instance_id": INSTANCE_ID
    }), 200

@app.route('/api/whoami', methods=['GET'])
def whoami():
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    return jsonify({
        "your_ip": client_ip,
        "instance_id": INSTANCE_ID
    }), 200

@app.route('/api/chat', methods=['POST', 'OPTIONS'])
def chat():
    if request.method == 'OPTIONS':
        return '', 200
    try:
        data = request.json
        prompt = data.get('prompt', '')
        
        if not prompt:
            return jsonify({
                "success": False,
                "message": "Prompt is required",
                "instance_id": INSTANCE_ID
            }), 400
        
        # Ensure Ollama is running and model is loaded
        if not is_ollama_running():
            print("Ollama not running, attempting to start...")
            success, message = initialize_ollama()
            if not success:
                return jsonify({
                    "success": False,
                    "message": f"Failed to initialize Ollama: {message}",
                    "instance_id": INSTANCE_ID
                }), 200
        
        # Generate response
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": DEFAULT_MODEL,
                "prompt": prompt,
                "stream": False
            },
            timeout=120
        )
        
        if response.status_code == 200:
            result = response.json()
            return jsonify({
                "success": True,
                "response": result.get('response', ''),
                "model": DEFAULT_MODEL,
                "instance_id": INSTANCE_ID
            }), 200
        elif response.status_code == 404:
            # Model not found, try to load it
            print(f"Model {DEFAULT_MODEL} not found, attempting to load...")
            if ensure_model_loaded(DEFAULT_MODEL):
                # Retry the request
                response = requests.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": DEFAULT_MODEL,
                        "prompt": prompt,
                        "stream": False
                    },
                    timeout=120
                )
                if response.status_code == 200:
                    result = response.json()
                    return jsonify({
                        "success": True,
                        "response": result.get('response', ''),
                        "model": DEFAULT_MODEL,
                        "instance_id": INSTANCE_ID
                    }), 200
            
            return jsonify({
                "success": False,
                "message": f"Model '{DEFAULT_MODEL}' could not be loaded",
                "instance_id": INSTANCE_ID
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": f"Ollama error: {response.text}",
                "instance_id": INSTANCE_ID
            }), 200
    except requests.exceptions.Timeout:
        return jsonify({
            "success": False,
            "message": "Request timed out. The model may be taking too long to respond.",
            "instance_id": INSTANCE_ID
        }), 200
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error: {str(e)}",
            "instance_id": INSTANCE_ID
        }), 200

if __name__ == '__main__':
    # For local development only
    # In production, use: gunicorn --bind 0.0.0.0:5000 --workers 4 --timeout 120 app:app
    app.run(host='0.0.0.0', port=5000, debug=True)