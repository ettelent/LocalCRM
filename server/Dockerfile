FROM node:22-alpine
WORKDIR /app
ENV NODE_OPTIONS=--dns-result-order=ipv4first \
    NPM_CONFIG_MAXSOCKETS=1
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund --fetch-retries=10 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=10000
COPY src ./src
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["npm", "start"]
