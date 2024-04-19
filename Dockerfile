# base node image
FROM node:20-alpine as base

# Install all node_modules
FROM base as deps

RUN mkdir /app
WORKDIR /app

ADD package.json package-lock.json ./
RUN npm install --production=false
RUN npm prune --production

# Build the production image with minimal footprint
FROM base

ENV NODE_ENV production

RUN mkdir /app
WORKDIR /app

COPY --from=deps /app/node_modules /app/node_modules
ADD server server
ADD package.json ./

EXPOSE 3000
VOLUME /app/data

CMD ["npm", "start"]
