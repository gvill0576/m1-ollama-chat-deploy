#!/bin/bash
yum update -y
yum install -y python3 python3-pip git docker

# Start Docker
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama
nohup ollama serve > /dev/null 2>&1 &
sleep 10

# Pull Ollama model
ollama pull gemma:2b

# Option 1: Docker Hub
# docker pull YOUR_DOCKERHUB_USERNAME/ollama-flask:latest
# docker run -d -p 5000:5000 --name flask-app YOUR_DOCKERHUB_USERNAME/ollama-flask:latest

# Option 2: GitHub Container Registry
docker pull ghcr.io/gvill0576/ollama-flask:latest
docker run -d -p 5000:5000 --name flask-app ghcr.io/gvill0576/ollama-flask:latest

# Option 3: GitHub direct (no Docker)
# cd /home/ec2-user
# git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
# cd YOUR_REPO/backend
# pip3 install -r requirements.txt
# nohup gunicorn --bind 0.0.0.0:5000 --workers 2 --timeout 300 app:app > /var/log/flask.log 2>&1 &