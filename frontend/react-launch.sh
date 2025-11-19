#!/bin/bash
yum update -y
yum install -y git docker

# Start Docker
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

# Install Node.js 20 (LTS)
curl -sL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

# Install nginx to serve the React app
yum install -y nginx

# Option 2: GitHub Container Registry (RECOMMENDED)
docker pull ghcr.io/gvill0576/ollama-react:latest
docker run -d -p 80:80 --name react-app ghcr.io/gvill0576/ollama-react:latest