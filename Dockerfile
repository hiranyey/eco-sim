FROM node:26-bookworm-slim

WORKDIR /app

COPY . .

ENV PORT=3000

EXPOSE 3000

USER node

CMD ["node", "scripts/serve.mjs"]
